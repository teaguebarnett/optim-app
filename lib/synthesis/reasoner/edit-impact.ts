// Gate 4.0C-4 — post-edit impact analysis and constrained repair for
// Reasoner-prepared drafts.
//
// A coach edit is not an isolated CRUD operation: after any change to a
// Reasoner draft (remove / replace / modify / move / rest-day …), OPTIM compares
// the CURRENT draft with the GENERATED original (version 1, validated) and
// asks what training function the change removed.
//
//   Deterministic (facts):  per build week, weekly direct sets per movement
//     pattern and per primary muscle — before vs after. A pattern that was
//     trained and no longer is, or a primary muscle that lost a meaningful
//     share of its weekly dose, is a PROGRAM-INTEGRITY deficiency. Feasible
//     alternatives are drawn from the run's own eligible pool (already
//     filtered by the confirmed constraints, equipment and apparatus) and
//     re-checked against the same constraint set — never from a name list.
//   Judgment (Fitness Reasoner): which feasible option best preserves the
//     intent, where, at what prescription — or that none is confident enough.
//     Its output is validated deterministically and only ever becomes a
//     coach-reviewable recommendation.
//
// Deficiencies stay BLOCKING until the coach explicitly applies a repair that
// restores the function, or explicitly accepts the reduced stimulus as a
// tradeoff (recorded, invalidated if the program changes further).

import { createHash } from "node:crypto";
import { exerciseEligibility, demandCompatibility } from "../exercise-eligibility.ts";
import { LOADED_DEMAND_CONDITION, type FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { MOVEMENT_PATTERNS, MUSCLES } from "../knowledge/taxonomy.ts";
import type { ConstraintSet } from "../constraints.ts";
import type { DayOfWeek } from "../../types.ts";
import type { TrainingItemInstance, UniversalTrainingProgramContent } from "../../training/types.ts";
import type { ResistanceMethod } from "../planners/resistance/method.ts";
import type { ReasonerExercise } from "./contract.ts";
import { prescribedWeek, weekPlan } from "./expand.ts";
import type { ReasonerRun } from "./run.ts";

/** A pattern previously trained ≥ this many weekly sets that drops to zero is "eliminated". */
export const PATTERN_MIN_SETS = 1;
/** A primary muscle trained ≥ this many weekly direct sets … */
export const MUSCLE_MIN_SETS = 4;
/** … that keeps less than this share of its weekly dose has a meaningful hole. */
export const MUSCLE_KEEP_RATIO = 0.67;

export type Dimension = { kind: "pattern" | "muscle"; id: string };
export interface Deficiency {
  dimension: Dimension;
  label: string;
  /** Average weekly sets across affected build weeks. */
  before: number;
  after: number;
  /** Build weeks in which the deficiency exists. */
  weeks: number[];
  /** Lowest weekly sets in any affected week (used to invalidate stale tradeoffs). */
  minAfter: number;
}
export interface EditCause {
  exerciseName: string;
  exerciseId: string | null;
  setsBefore: number;
  setsAfter: number;
  /** Days the exercise appeared on in the generated plan. */
  days: DayOfWeek[];
}
export interface FeasibleCandidate {
  exerciseId: string;
  exerciseName: string;
  /** Constraint fit under the SAME confirmed constraints ("compatible" | "conditional"). */
  fit: "compatible" | "conditional";
  conditions: string[];
  restores: string[];
  score: number;
}
export interface IntegrityAnalysis {
  key: string | null;
  deficiencies: Deficiency[];
  causes: EditCause[];
  candidates: FeasibleCandidate[];
}

type Coverage = Map<number, Map<string, number>>;
const dimKey = (d: Dimension) => `${d.kind}:${d.id}`;
const labelOf = (d: Dimension) =>
  d.kind === "pattern"
    ? `${(MOVEMENT_PATTERNS[d.id as keyof typeof MOVEMENT_PATTERNS]?.name ?? d.id).replace(/\s*\(.*\)$/, "")} movement`
    : `${(MUSCLES[d.id as keyof typeof MUSCLES]?.name ?? d.id).replace(/\s*\([^)]*\)/g, "")} volume`;

function exerciseByName(knowledge: FitnessKnowledgeRegistry) {
  const m = new Map(knowledge.exercises().map((e) => [e.name.toLowerCase(), e]));
  return (name: string) => m.get(name.toLowerCase()) ?? null;
}

/** Weekly direct sets per primary pattern and primary muscle, per week. */
export function coverage(content: UniversalTrainingProgramContent, knowledge: FitnessKnowledgeRegistry): Coverage {
  const find = exerciseByName(knowledge);
  const out: Coverage = new Map();
  for (const w of content.weeks) {
    const c = new Map<string, number>();
    for (const d of w.days)
      for (const s of d.sessions ?? [])
        for (const b of s.blocks)
          for (const i of b.items) {
            const ex = find(i.name);
            if (!ex) continue;
            const sets = i.prescription.sets ?? 0;
            c.set(`pattern:${ex.patterns[0]}`, (c.get(`pattern:${ex.patterns[0]}`) ?? 0) + sets);
            for (const m of ex.primaryMuscles) c.set(`muscle:${m}`, (c.get(`muscle:${m}`) ?? 0) + sets);
          }
    out.set(w.weekNumber, c);
  }
  return out;
}

function setsByExercise(content: UniversalTrainingProgramContent) {
  const out = new Map<string, number>();
  for (const w of content.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) out.set(i.name.toLowerCase(), (out.get(i.name.toLowerCase()) ?? 0) + (i.prescription.sets ?? 0));
  return out;
}

/** Build weeks only (coach-scheduled deloads are intentionally lighter). */
const buildWeeks = (run: ReasonerRun, content: UniversalTrainingProgramContent) => {
  const deloads = new Set((run.result.spec?.resistance?.value.weeks ?? []).filter((w) => w.kind === "deload").map((w) => w.week));
  return content.weeks.map((w) => w.weekNumber).filter((n) => !deloads.has(n));
};

export function analyzeProgramIntegrity(params: { original: UniversalTrainingProgramContent; current: UniversalTrainingProgramContent; run: ReasonerRun; knowledge: FitnessKnowledgeRegistry }): IntegrityAnalysis {
  const { original, current, run, knowledge } = params;
  const before = coverage(original, knowledge);
  const after = coverage(current, knowledge);
  const weeks = buildWeeks(run, original);
  const dims = new Set<string>();
  for (const n of weeks) for (const k of before.get(n)?.keys() ?? []) dims.add(k);
  const deficiencies: Deficiency[] = [];
  for (const k of [...dims].sort()) {
    const [kind, id] = k.split(":") as ["pattern" | "muscle", string];
    const affected: number[] = [];
    let b = 0;
    let a = 0;
    let minAfter = Infinity;
    for (const n of weeks) {
      const s0 = before.get(n)?.get(k) ?? 0;
      const s1 = after.get(n)?.get(k) ?? 0;
      const hole = kind === "pattern" ? s0 >= PATTERN_MIN_SETS && s1 === 0 : s0 >= MUSCLE_MIN_SETS && s1 < s0 * MUSCLE_KEEP_RATIO;
      if (!hole) continue;
      affected.push(n);
      b += s0;
      a += s1;
      minAfter = Math.min(minAfter, s1);
    }
    if (affected.length) deficiencies.push({ dimension: { kind, id }, label: labelOf({ kind, id }), before: Math.round((b / affected.length) * 10) / 10, after: Math.round((a / affected.length) * 10) / 10, weeks: affected, minAfter });
  }
  if (!deficiencies.length) return { key: null, deficiencies, causes: [], candidates: [] };

  // What changed: exercises whose total sets dropped (removed, reduced, replaced).
  const s0 = setsByExercise(original);
  const s1 = setsByExercise(current);
  const find = exerciseByName(knowledge);
  const plannedDays = new Map<string, DayOfWeek[]>();
  for (const s of run.result.plan?.sessions ?? []) for (const e of s.exercises) plannedDays.set(e.exerciseId, [...(plannedDays.get(e.exerciseId) ?? []), s.day]);
  const causes: EditCause[] = [...s0]
    .filter(([name, sets]) => (s1.get(name) ?? 0) < sets)
    .map(([name, sets]) => {
      const ex = find(name);
      return { exerciseName: ex?.name ?? name, exerciseId: ex?.id ?? null, setsBefore: sets, setsAfter: s1.get(name) ?? 0, days: ex ? (plannedDays.get(ex.id) ?? []) : [] };
    });

  const key = `program_integrity:${createHash("sha256").update(deficiencies.map((d) => dimKey(d.dimension)).join("|")).digest("hex").slice(0, 16)}`;
  return { key, deficiencies, causes, candidates: feasibleCandidates({ run, knowledge, deficiencies, current }) };
}

/**
 * Feasible alternatives: the run's own eligible pool (constraints, equipment and
 * apparatus already applied at generation), minus anything whose fit OPTIM
 * could not establish, re-checked against the SAME confirmed constraints with
 * current Fitness Knowledge, ranked by how much of the lost function each
 * restores. Feasibility only — the best-fit judgment is the Reasoner's.
 */
export function feasibleCandidates(params: { run: ReasonerRun; knowledge: FitnessKnowledgeRegistry; deficiencies: Deficiency[]; current: UniversalTrainingProgramContent }): FeasibleCandidate[] {
  const { run, knowledge, deficiencies } = params;
  const constraints = run.snapshots.constraintSet as ConstraintSet;
  const present = setsByExercise(params.current);
  const out: FeasibleCandidate[] = [];
  for (const row of run.input?.exercises ?? []) {
    const [id] = row.split("|");
    const ex = knowledge.getExercise(id);
    if (!ex || present.has(ex.name.toLowerCase())) continue;
    const elig = exerciseEligibility(ex, constraints);
    const fit = demandCompatibility(elig);
    if (fit !== "compatible" && fit !== "conditional") continue; // uncertain or incompatible: never offered
    const restores = deficiencies.filter((d) => (d.dimension.kind === "pattern" ? ex.patterns[0] === d.dimension.id : ex.primaryMuscles.includes(d.dimension.id as never))).map((d) => d.label);
    if (!restores.length) continue;
    const score = deficiencies.reduce((t, d) => t + (d.dimension.kind === "pattern" ? (ex.patterns[0] === d.dimension.id ? 3 : 0) : ex.primaryMuscles.includes(d.dimension.id as never) ? 2 : 0), 0);
    const conds = elig.loadConditions.filter((c) => c.enforcement === "hard").flatMap((c) => c.conditions);
    out.push({ exerciseId: ex.id, exerciseName: ex.name, fit, conditions: [...new Set(conds)], restores, score });
  }
  return out.sort((a, b) => b.score - a.score || a.exerciseName.localeCompare(b.exerciseName)).slice(0, 6);
}

export interface Replacement {
  exerciseId: string;
  days: DayOfWeek[];
  sets: number;
  reps: { min: number; max: number };
  rir: { min: number; max: number } | null;
}

/** A replacement's prescription defaults: the removed exercise's listing, inside coach ranges and fit minimums. */
export function defaultReplacement(params: { analysis: IntegrityAnalysis; candidate: FeasibleCandidate; run: ReasonerRun; method: ResistanceMethod }): Replacement {
  const cause = params.analysis.causes.find((c) => c.exerciseId && c.days.length) ?? null;
  const listed = (params.run.result.plan?.sessions ?? []).flatMap((s) => s.exercises).find((e) => e.exerciseId === cause?.exerciseId) ?? null;
  const setsR = params.method.sets.accessory.value;
  const repsR = params.method.reps.accessory.value;
  const rirR = params.method.effort.rir?.accessory.value ?? null;
  const k = params.candidate.fit === "conditional";
  const repsMin = Math.max(repsR.min, listed?.reps.min ?? repsR.min, k ? LOADED_DEMAND_CONDITION.minReps : 0);
  const reps = { min: Math.min(repsMin, repsR.max), max: Math.min(repsR.max, Math.max(repsMin, listed?.reps.max ?? repsR.max)) };
  const rirMin = rirR ? Math.min(rirR.max, Math.max(rirR.min, listed?.rir?.min ?? rirR.min, k ? LOADED_DEMAND_CONDITION.minRir : 0)) : 0;
  const days = cause?.days.length ? cause.days : (params.run.result.plan?.sessions ?? []).map((s) => s.day).slice(0, 2);
  return { exerciseId: params.candidate.exerciseId, days, sets: Math.min(setsR.max, Math.max(setsR.min, listed?.sets ?? setsR.min)), reps, rir: rirR ? { min: rirMin, max: Math.max(rirMin, Math.min(rirR.max, listed?.rir?.max ?? rirR.max)) } : null };
}

/** Deterministic checks a replacement must pass (coach ranges, constraint fit minimums, feasible, real training days). */
export function checkReplacement(params: { replacement: Replacement; candidates: FeasibleCandidate[]; method: ResistanceMethod; current: UniversalTrainingProgramContent }): string[] {
  const { replacement: r, method } = params;
  const errors: string[] = [];
  const cand = params.candidates.find((c) => c.exerciseId === r.exerciseId);
  if (!cand) errors.push(`${r.exerciseId} isn't a feasible option under the confirmed constraints.`);
  const s = method.sets.accessory.value;
  const rr = method.reps.accessory.value;
  const ri = method.effort.rir?.accessory.value;
  if (r.sets < s.min || r.sets > s.max) errors.push(`${r.sets} sets is outside the coach's ${s.min}–${s.max}.`);
  if (r.reps.min < rr.min || r.reps.max > rr.max || r.reps.min > r.reps.max) errors.push(`Reps ${r.reps.min}–${r.reps.max} are outside the coach's ${rr.min}–${rr.max}.`);
  if (ri && (!r.rir || r.rir.min < ri.min || r.rir.max > ri.max)) errors.push(`Effort must stay inside the coach's RIR ${ri.min}–${ri.max}.`);
  if (cand?.fit === "conditional" && (r.reps.min < LOADED_DEMAND_CONDITION.minReps || (r.rir && r.rir.min < LOADED_DEMAND_CONDITION.minRir))) errors.push(`${cand.exerciseName} only fits the confirmed restrictions at ≥${LOADED_DEMAND_CONDITION.minReps} reps and ≥${LOADED_DEMAND_CONDITION.minRir} reps in reserve.`);
  const trainingDays = new Set(params.current.weeks[0]?.days.filter((d) => d.type === "training").map((d) => d.dayOfWeek));
  if (!r.days.length || r.days.some((d) => !trainingDays.has(d))) errors.push("A replacement can only go on existing training days.");
  return errors;
}

/** Inserts the replacement into its days across EVERY week, with phase-aware weekly prescriptions. */
export function applyReplacement(params: { content: UniversalTrainingProgramContent; replacement: Replacement; run: ReasonerRun; method: ResistanceMethod; knowledge: FitnessKnowledgeRegistry }): UniversalTrainingProgramContent {
  const { replacement: r, run, method, knowledge } = params;
  const plan = run.result.plan!;
  const ex = knowledge.getExercise(r.exerciseId)!;
  const listed: ReasonerExercise = { exerciseId: r.exerciseId, role: "accessory", sets: r.sets, reps: r.reps, rir: r.rir, restSeconds: null, note: null };
  const weeks = new Map(weekPlan(plan).map((w) => [w.week, w]));
  const next = structuredClone(params.content);
  const usesRpe = method.effort.metrics.includes("rpe");
  for (const w of next.weeks) {
    const pw = weeks.get(w.weekNumber);
    for (const d of w.days) {
      if (!r.days.includes(d.dayOfWeek) || d.type !== "training") continue;
      const s = d.sessions?.[0];
      if (!s || s.blocks.some((b) => b.items.some((i) => i.name === ex.name))) continue;
      const p = pw ? prescribedWeek(listed, pw, method) : { sets: r.sets, reps: r.reps, rir: r.rir };
      const rest = method.rest?.accessory.value;
      const item: TrainingItemInstance = {
        id: `item-w${w.weekNumber}-${d.dayOfWeek.toLowerCase()}-repair-${ex.id.split(".")[1]}`,
        order: s.blocks.length + 1,
        name: ex.name,
        category: "resistance",
        coachCue: p.rir ? `Effort: ${usesRpe ? `RPE ${10 - p.rir.max}–${10 - p.rir.min}` : `${p.rir.min}–${p.rir.max} reps in reserve`}.` : undefined,
        prescription: { family: "resistance", sets: p.sets, reps: { low: p.reps.min, high: p.reps.max }, ...(p.rir ? (usesRpe ? { rpe: Math.min(10, Math.max(6, 10 - p.rir.min)) as 6 | 7 | 8 | 9 | 10 } : { rir: p.rir.min }) : {}), ...(rest ? { restSeconds: Math.round(((rest.min + rest.max) / 2) * 4) * 15 } : {}) },
      };
      s.blocks.push({ id: `block-${item.id}`, kind: "straight", order: s.blocks.length + 1, items: [item] });
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Repair reasoning (Fitness Reasoner judgment) — strict contract.
// ---------------------------------------------------------------------------

export const REPAIR_PROMPT_VERSION = "reasoner-repair-v1";

export const REPAIR_SYSTEM_PROMPT = `You are OPTIM's Fitness Reasoner helping a coach repair one resistance program after the coach edited it. The coach is the authority: you recommend, the coach decides. Deterministic validators check your answer.

You receive: the client's goal, the coach's method ranges, the confirmed restrictions, each session's purpose and current exercises, what the edit removed ("deficiencies": training functions now underrepresented, with weekly sets before/after), what caused it, and "candidates": the ONLY exercises you may recommend — each already checked against the confirmed restrictions, equipment and apparatus, with its fit and conditions.

Decide whether one candidate preserves the lost training intent well enough to recommend: consider movement pattern, target musculature, goal specificity, session purpose and fatigue. Place it only on days whose session purpose it serves. Stay inside the coach's ranges; conditional-fit candidates need reps min ≥ 6 and rir min ≥ 2. If no candidate preserves the intent with confidence, say so — never stretch a poor match.

Return ONE JSON object, no prose:
{"verdict":"repair"|"no_confident_repair","rationale":str (≤300 chars, coach-facing, plain language),"recommendation":{"exercise":<candidate id>,"days":["Tuesday",...],"sets":int,"reps":[min,max],"rir":[min,max],"why":str (≤240 chars)} (only for "repair"),"alternatives":[<candidate ids>] (optional, ≤2),"tradeoff":str (optional, ≤240 chars — what is still not preserved)}`;

export interface RepairOutput {
  verdict: "repair" | "no_confident_repair";
  rationale: string;
  recommendation: (Replacement & { why: string }) | null;
  alternatives: string[];
  tradeoff: string | null;
}

export function parseRepairOutput(raw: unknown): { ok: true; output: RepairOutput } | { ok: false; error: string } {
  try {
    const o = raw as Record<string, unknown>;
    const verdict = o.verdict;
    if (verdict !== "repair" && verdict !== "no_confident_repair") return { ok: false, error: "verdict must be repair or no_confident_repair" };
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
    const rationale = str(o.rationale, 300);
    if (!rationale) return { ok: false, error: "rationale missing or too long" };
    let recommendation: RepairOutput["recommendation"] = null;
    if (verdict === "repair") {
      const r = o.recommendation as Record<string, unknown> | undefined;
      const pair = (v: unknown) => (Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n)) && (v[0] as number) <= (v[1] as number) ? { min: v[0] as number, max: v[1] as number } : null);
      const days = Array.isArray(r?.days) ? (r!.days as unknown[]).filter((d): d is DayOfWeek => typeof d === "string") : [];
      const reps = pair(r?.reps);
      const why = str(r?.why, 240);
      if (!r || typeof r.exercise !== "string" || !Number.isInteger(r.sets) || !reps || !why || !days.length) return { ok: false, error: "recommendation incomplete" };
      recommendation = { exerciseId: r.exercise, days, sets: r.sets as number, reps, rir: pair(r.rir), why };
    }
    const alternatives = Array.isArray(o.alternatives) ? (o.alternatives as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 2) : [];
    return { ok: true, output: { verdict, rationale, recommendation, alternatives, tradeoff: str(o.tradeoff, 240) } };
  } catch {
    return { ok: false, error: "output could not be read" };
  }
}

/** Compact, internal input for the repair call (never shown to clients). */
export function repairInput(params: { analysis: IntegrityAnalysis; current: UniversalTrainingProgramContent; run: ReasonerRun; method: ResistanceMethod; knowledge: FitnessKnowledgeRegistry }) {
  const { analysis, current, run, method } = params;
  const week1 = current.weeks[0];
  return {
    goal: run.input?.goal ?? null,
    coach: { accessorySets: [method.sets.accessory.value.min, method.sets.accessory.value.max], accessoryReps: [method.reps.accessory.value.min, method.reps.accessory.value.max], accessoryRir: method.effort.rir ? [method.effort.rir.accessory.value.min, method.effort.rir.accessory.value.max] : null },
    restrictions: (run.input?.constraints ?? []).flatMap((c) => c.rules),
    sessions: week1.days.filter((d) => d.type === "training").map((d) => ({ day: d.dayOfWeek, title: d.sessions?.[0]?.name, purpose: (run.result.plan?.sessions ?? []).find((s) => s.day === d.dayOfWeek)?.purpose ?? null, exercises: (d.sessions?.[0]?.blocks ?? []).map((b) => b.items[0].name) })),
    deficiencies: analysis.deficiencies.map((d) => ({ function: d.label, weeklySetsBefore: d.before, weeklySetsAfter: d.after, weeks: d.weeks.length })),
    causes: analysis.causes.map((c) => ({ exercise: c.exerciseName, weeklySetsBefore: c.setsBefore, after: c.setsAfter, days: c.days })),
    candidates: analysis.candidates.map((c) => ({ id: c.exerciseId, name: c.exerciseName, fit: c.fit, conditions: c.conditions, restores: c.restores })),
  };
}

/** Validates a model recommendation deterministically; an invalid or unsafe one is downgraded, never applied. */
export function validateRepair(params: { output: RepairOutput; analysis: IntegrityAnalysis; method: ResistanceMethod; current: UniversalTrainingProgramContent }): { verdict: "repair" | "no_confident_repair"; recommendation: (Replacement & { why: string }) | null; rejected: string[] } {
  const { output } = params;
  if (output.verdict !== "repair" || !output.recommendation) return { verdict: "no_confident_repair", recommendation: null, rejected: [] };
  const errors = checkReplacement({ replacement: output.recommendation, candidates: params.analysis.candidates, method: params.method, current: params.current });
  return errors.length ? { verdict: "no_confident_repair", recommendation: null, rejected: errors } : { verdict: "repair", recommendation: output.recommendation, rejected: [] };
}

/** Test double for the repair call (offline tests / local test provider only): recommends the top
 * feasible candidate on the cause's days at the coach's ranges, or no_confident_repair. */
export function scriptedRepair(input: ReturnType<typeof repairInput>): unknown {
  const c = input.candidates[0];
  if (!c) return { verdict: "no_confident_repair", rationale: "No feasible candidate preserves the lost training function within the confirmed restrictions." };
  const [smin] = input.coach.accessorySets as number[];
  const [rmin, rmax] = input.coach.accessoryReps as number[];
  const rir = input.coach.accessoryRir as number[] | null;
  const k = c.fit === "conditional";
  const days = input.causes.flatMap((x) => x.days);
  return { verdict: "repair", rationale: `Restores ${c.restores.join(" and ").toLowerCase()} within the confirmed restrictions.`, recommendation: { exercise: c.id, days: days.length ? [...new Set(days)] : [input.sessions[0].day], sets: smin, reps: [Math.min(rmax, Math.max(rmin, k ? 8 : rmin)), rmax], rir: rir ? [Math.max(rir[0], k ? 2 : rir[0]), rir[1]] : undefined, why: `Same training function as the removed exercise.` } };
}
