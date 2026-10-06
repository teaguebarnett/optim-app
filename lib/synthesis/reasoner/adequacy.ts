// Gate 4.0C-5 — CURRENT-STATE program adequacy: "is this program good
// enough for this client now?", judged against the current goal, method,
// confirmed restrictions and the eligible candidate space — never against
// a previous proposal (edit-impact answers "what did this edit change?").
//
// Deterministic where existing data supports it; the Reasoner's own
// structured declarations where judgment is needed:
//
//   functions   — the major targets a resistance plan is expected to train
//                 (MAJOR_TARGETS), each classified from the eligible pool:
//                 available (a confirmed-compatible option exists),
//                 uncertain_only (preflight asks the coach before any paid
//                 call), infeasible (no option at all).
//   coverage    — the Reasoner declares every required target: trained,
//                 reduced or not_trained, with a cause (goal_priority, time,
//                 constraints, available_exercises) and why. Declarations
//                 are checked against the actual sets (a "trained" target
//                 with no direct sets is rejected; an infeasible one can't
//                 be "trained").
//   sessions    — each session declares its primary targets; they must get
//                 at least half its direct sets (what "primary" means), so a
//                 "pull" day can't be curls and rear-delt work in disguise.
//   push / pull — the existing balance rule (> 1.5×, or one side absent
//                 while both are feasible) must be fixed or declared as a
//                 reduced side.
//
// Results: LIMITATIONS (declared or infeasible functions the constraints /
// knowledge prevent — a coach decision before approval), DEFICIENCIES
// (undeclared shortfalls — validator feedback during generation, blocking
// in review if they survive) and informational notes.

import type { ExerciseEntry, FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { MUSCLES, type MuscleId } from "../knowledge/taxonomy.ts";
import { MAJOR_TARGETS } from "../planners/resistance/templates.ts";
import type { LoadCondition } from "../exercise-eligibility.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";

export type FunctionState = "available" | "uncertain_only" | "infeasible";
export interface FunctionAvailability {
  target: MuscleId;
  state: FunctionState;
  /** Confirmed-compatible ("-") or conditional ("K", incl. coach-cleared) options. */
  certain: string[];
  /** Options whose fit OPTIM can't establish (withheld from planning until the coach decides). */
  uncertain: string[];
}

export type CoverageStatus = "trained" | "reduced" | "not_trained";
export type CoverageCause = "goal_priority" | "time" | "constraints" | "available_exercises";
export interface CoverageDeclaration {
  target: string;
  status: CoverageStatus;
  cause: CoverageCause | null;
  why: string | null;
}

export const PUSH_PATTERNS = ["horizontal_push", "vertical_push"];
export const PULL_PATTERNS = ["horizontal_pull", "vertical_pull"];
/** Muscles that stand for each side when a plan declares a reduced side. */
export const PULL_SIDE: MuscleId[] = ["lats", "mid_back"];
export const PUSH_SIDE: MuscleId[] = ["chest"];
export const PUSH_PULL_RATIO = 1.5; // the existing push_pull_balance threshold (expand.ts), now enforced via declarations

export const muscleLabel = (m: string) => (MUSCLES[m as MuscleId]?.name ?? m.replace(/_/g, " ")).replace(/\s*\([^)]*\)/g, "");

/** Fit certainty of a pool exercise from its load conditions ("-" none, "K" conditional, "U" uncertain). */
export const fitOf = (conds: LoadCondition[] | undefined): "-" | "K" | "U" => (!conds?.length ? "-" : conds.some((c) => c.certainty === "uncertain") ? "U" : "K");

/** Classifies every major target from the eligible pool (constraints, equipment, apparatus, coach-avoided already applied). */
export function functionAvailability(pool: ExerciseEntry[], loadConditions: Map<string, LoadCondition[]>): FunctionAvailability[] {
  return MAJOR_TARGETS.map((target) => {
    const opts = pool.filter((e) => e.primaryMuscles.includes(target));
    const certain = opts.filter((e) => fitOf(loadConditions.get(e.id)) !== "U").map((e) => e.id);
    const uncertain = opts.filter((e) => fitOf(loadConditions.get(e.id)) === "U").map((e) => e.id);
    return { target, certain, uncertain, state: certain.length ? "available" : uncertain.length ? "uncertain_only" : "infeasible" };
  });
}

// ---------------------------------------------------------------------------
// One normalized training week (from a plan, or from saved content)
// ---------------------------------------------------------------------------

export interface WeekSession {
  day: string;
  title: string;
  /** Declared primary targets (Reasoner plans; absent for legacy content). */
  targets: string[] | null;
  items: Array<{ exerciseId: string | null; name: string; sets: number }>;
}

export function weekFromContent(content: UniversalTrainingProgramContent, knowledge: FitnessKnowledgeRegistry, opts: { deloadWeeks?: number[]; targetsByDay?: Map<string, string[]> } = {}): WeekSession[] {
  const deloads = new Set(opts.deloadWeeks ?? []);
  const week = content.weeks.find((w) => !deloads.has(w.weekNumber)) ?? content.weeks[0];
  const byName = new Map(knowledge.exercises().map((e) => [e.name.toLowerCase(), e]));
  const out: WeekSession[] = [];
  for (const d of week?.days ?? [])
    for (const s of d.sessions ?? [])
      out.push({ day: d.dayOfWeek, title: s.name, targets: opts.targetsByDay?.get(d.dayOfWeek) ?? null, items: s.blocks.flatMap((b) => b.items.map((i) => ({ exerciseId: byName.get(i.name.toLowerCase())?.id ?? null, name: i.name, sets: i.prescription.sets ?? 0 }))) });
  return out;
}

const directSets = (week: WeekSession[], knowledge: FitnessKnowledgeRegistry) => {
  const m = new Map<string, number>();
  for (const s of week) for (const i of s.items) for (const t of (i.exerciseId ? knowledge.getExercise(i.exerciseId)?.primaryMuscles : null) ?? []) m.set(t, (m.get(t) ?? 0) + i.sets);
  return m;
};
const patternSets = (week: WeekSession[], knowledge: FitnessKnowledgeRegistry, patterns: string[]) => week.reduce((t, s) => t + s.items.reduce((u, i) => u + ((i.exerciseId ? knowledge.getExercise(i.exerciseId)?.patterns.some((p) => patterns.includes(p)) : false) ? i.sets : 0), 0), 0);

export interface AdequacyFinding {
  kind: "limitation" | "deficiency" | "information";
  code: "target_infeasible" | "target_declared_limited" | "target_untrained" | "coverage_dishonest" | "coverage_missing" | "session_targets" | "push_pull_balance" | "target_reduced_by_choice";
  target: string | null;
  message: string;
}

export interface AdequacyResult {
  findings: AdequacyFinding[];
  /** Stable signature of the blocking findings (a coach acceptance is valid only for this exact set). */
  signature: string | null;
}

/**
 * Evaluates one normalized week against the CURRENT candidate space. `declared` = the plan's coverage
 * declarations (null for legacy plans that made none — then every shortfall is a deficiency).
 */
export function evaluateAdequacy(params: { week: WeekSession[]; knowledge: FitnessKnowledgeRegistry; functions: FunctionAvailability[]; declared: CoverageDeclaration[] | null; checkSessions: boolean; pushPullFeasible?: { push: boolean; pull: boolean } }): AdequacyResult {
  const { week, knowledge, functions } = params;
  const findings: AdequacyFinding[] = [];
  const sets = directSets(week, knowledge);
  const decl = new Map((params.declared ?? []).map((d) => [d.target, d]));
  const label = muscleLabel;

  if (params.declared) {
    for (const f of functions) if (!decl.has(f.target)) findings.push({ kind: "deficiency", code: "coverage_missing", target: f.target, message: `coverage has no entry for ${f.target}: declare every target in functions.required.` });
    for (const d of params.declared) if (!functions.some((f) => f.target === d.target)) findings.push({ kind: "deficiency", code: "coverage_missing", target: d.target, message: `coverage lists ${d.target}, which isn't in functions.required.` });
  }
  for (const f of functions) {
    const n = sets.get(f.target) ?? 0;
    const d = decl.get(f.target);
    if (f.state === "infeasible") {
      if (d && d.status === "trained") findings.push({ kind: "deficiency", code: "coverage_dishonest", target: f.target, message: `${f.target} is declared trained, but no eligible exercise trains it under the current restrictions and equipment — declare it not_trained (cause constraints or available_exercises).` });
      findings.push({ kind: "limitation", code: "target_infeasible", target: f.target, message: `${label(f.target)}: no exercise in OPTIM's knowledge trains it within the client's confirmed restrictions and equipment, so this plan can't train it directly.` });
      continue;
    }
    if (d?.status === "trained" && n === 0) findings.push({ kind: "deficiency", code: "coverage_dishonest", target: f.target, message: `${f.target} is declared trained but gets no direct sets — train it, or declare it reduced/not_trained with a cause and why.` });
    else if (!d && n === 0) findings.push({ kind: "deficiency", code: "target_untrained", target: f.target, message: `${label(f.target)} gets no direct work although ${f.state === "available" ? "eligible exercises exist" : "options exist pending your fit decision"}.` });
    if (d && d.status !== "trained") {
      if (d.cause === "constraints" || d.cause === "available_exercises") findings.push({ kind: "limitation", code: "target_declared_limited", target: f.target, message: `${label(f.target)}: ${d.status === "reduced" ? "reduced" : "not trained"} — ${d.why ?? (d.cause === "constraints" ? "the confirmed restrictions limit the options" : "too few eligible exercises")}.` });
      else findings.push({ kind: "information", code: "target_reduced_by_choice", target: f.target, message: `${label(f.target)} ${d.status === "reduced" ? "gets less volume" : "isn't trained"} by design (${d.cause === "time" ? "time" : "goal priority"})${d.why ? ` — ${d.why}` : ""}.` });
    }
  }

  // Sessions: declared primary targets must get at least half of the session's direct sets.
  if (params.checkSessions)
    for (const s of week) {
      if (!s.targets?.length) continue;
      const total = s.items.reduce((t, i) => t + i.sets, 0);
      const onTarget = s.items.reduce((t, i) => t + ((i.exerciseId ? knowledge.getExercise(i.exerciseId)?.primaryMuscles.some((m) => s.targets!.includes(m)) : false) ? i.sets : 0), 0);
      const missing = s.targets.filter((t) => !s.items.some((i) => i.exerciseId && knowledge.getExercise(i.exerciseId)?.primaryMuscles.includes(t as MuscleId)));
      if (missing.length) findings.push({ kind: "deficiency", code: "session_targets", target: null, message: `${s.day} "${s.title}" declares ${missing.join(", ")} as primary targets but nothing in it trains ${missing.length > 1 ? "them" : "it"} — fix the session or its targets.` });
      else if (total > 0 && onTarget * 2 < total) findings.push({ kind: "deficiency", code: "session_targets", target: null, message: `${s.day} "${s.title}": its declared primary targets (${s.targets.join(", ")}) get ${onTarget} of ${total} sets — primary targets need at least half; rebuild the session around them or declare what it really trains.` });
    }

  // Push / pull balance.
  const push = patternSets(week, knowledge, PUSH_PATTERNS);
  const pull = patternSets(week, knowledge, PULL_PATTERNS);
  const feasible = params.pushPullFeasible ?? { push: true, pull: true };
  if (push + pull > 0 && feasible.push && feasible.pull && (Math.max(push, pull) / Math.max(1, Math.min(push, pull)) > PUSH_PULL_RATIO || Math.min(push, pull) === 0)) {
    const lower = pull < push ? "pull" : "push";
    const side = lower === "pull" ? PULL_SIDE : PUSH_SIDE;
    const declaredSide = side.some((m) => decl.get(m) && decl.get(m)!.status !== "trained");
    if (!declaredSide) findings.push({ kind: "deficiency", code: "push_pull_balance", target: null, message: `Weekly pushing ${push} vs pulling ${pull} sets — balance them${params.declared ? `, or declare ${side.join("/")} reduced in coverage with its cause and why` : ""}.` });
  }

  const blocking = findings.filter((f) => f.kind !== "information");
  return { findings, signature: blocking.length ? blocking.map((f) => `${f.code}:${f.target ?? f.message}`).sort().join("|") : null };
}
