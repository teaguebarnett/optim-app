// Gate 4.0C-5 — CURRENT-STATE program adequacy: checks the plan against the
// current goal, confirmed restrictions and eligible candidate space — never
// against a previous proposal (edit-impact answers "what did this edit change?").
//
// BOUNDARY. Deterministic code only catches contradictions, false claims and
// unmet GOAL requirements; programming quality (volume distribution,
// push/pull balance, how a session is composed, whether the program is
// effective) is the Fitness Reasoner's judgment, surfaced to the coach — never
// replaced by a global number. Every check is classified:
//
//   A  universal invariant (contradiction / false claim / structurally empty)
//      - coverage_missing    the plan must report every considered target once (contract completeness)
//      - coverage_dishonest  "trained" with no direct sets, or "trained" when no eligible exercise exists
//      - session_targets     a session claims a primary target that nothing in it trains
//      - session_empty       a session with no exercises
//   B  Coach Brain / methodology — none: the confirmed method has no muscle-coverage or volume requirement,
//      and none is invented here.
//   C  goal-dependent — only muscles the GoalContract requires (hypertrophy priority muscles):
//      - goal_target_untrained   required, trainable, gets no direct sets, no declared reason → deficiency
//      - goal_target_infeasible  required, but no eligible exercise trains it → limitation (coach decision)
//   D  Reasoner judgment, surfaced to the coach
//      - target_declared_limited  the Reasoner itself declares a trainable target reduced / not trained
//        because of the restrictions or the eligible exercises → limitation (coach decision)
//      - target_reduced_by_choice / target_unavailable / push_pull_note → information only (never blocking)
//
// No muscle is required merely because it exists in Fitness Knowledge: MAJOR_TARGETS is only the list the
// plan REPORTS on. Numbers: none block. The push/pull ratio (1.5×, the pre-existing expand.ts quality
// heuristic) is shown as information only.

import type { ExerciseEntry, FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { MUSCLES, type MuscleId } from "../knowledge/taxonomy.ts";
import { MAJOR_TARGETS } from "../planners/resistance/templates.ts";
import type { LoadCondition } from "../exercise-eligibility.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";
import type { GoalContract } from "../goal-contract.ts";

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
/** The pre-existing expand.ts quality heuristic — information only, never blocking (programming balance is judgment). */
export const PUSH_PULL_RATIO = 1.5;

/** Muscles the GoalContract itself requires (class C): hypertrophy priority muscles, when stated. Nothing else. */
export function goalRequiredTargets(goal: GoalContract | null | undefined): MuscleId[] {
  const out = new Set<MuscleId>();
  for (const g of [goal?.primary, ...(goal?.secondary ?? [])]) {
    if (g?.class !== "hypertrophy" || g.priorityMuscles.status !== "known") continue;
    for (const m of g.priorityMuscles.value) {
      const id = m.toLowerCase().trim().replace(/[^a-z]+/g, "_") as MuscleId;
      if (MUSCLES[id]) out.add(id);
    }
  }
  return [...out].sort();
}

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
  /** A universal invariant, B methodology, C goal, D Reasoner judgment (see header). */
  basis: "A" | "B" | "C" | "D";
  code: "coverage_missing" | "coverage_dishonest" | "session_targets" | "session_empty" | "goal_target_untrained" | "goal_target_infeasible" | "target_declared_limited" | "target_reduced_by_choice" | "target_unavailable" | "push_pull_note" | "equipment_unresolved";
  target: string | null;
  message: string;
}

export interface AdequacyResult {
  findings: AdequacyFinding[];
  /** Stable signature of the blocking findings (a coach acceptance is valid only for this exact set). */
  signature: string | null;
}

/**
 * Evaluates one normalized week against the CURRENT candidate space. `functions` = availability of the targets the
 * plan reports on; `required` = goal-required targets (class C); `declared` = the plan's coverage declarations (null
 * for legacy plans that made none — then only goal requirements and session contents are checked).
 */
export function evaluateAdequacy(params: { week: WeekSession[]; knowledge: FitnessKnowledgeRegistry; functions: FunctionAvailability[]; required: string[]; declared: CoverageDeclaration[] | null; checkSessions: boolean; /** Verify the plan's own claims (generation time only — after coach edits, what changed is edit-impact's job). */ checkClaims?: boolean }): AdequacyResult {
  const { week, knowledge, functions } = params;
  const findings: AdequacyFinding[] = [];
  const sets = directSets(week, knowledge);
  const decl = new Map((params.declared ?? []).map((d) => [d.target, d]));
  const required = new Set(params.required);
  const label = muscleLabel;
  const f = (x: AdequacyFinding) => findings.push(x);

  const claims = params.checkClaims !== false;
  if (params.declared && claims) {
    for (const fn of functions) if (!decl.has(fn.target)) f({ kind: "deficiency", basis: "A", code: "coverage_missing", target: fn.target, message: `coverage has no entry for ${fn.target}: report every target in functions.considered.` });
    for (const d of params.declared) if (!functions.some((fn) => fn.target === d.target)) f({ kind: "deficiency", basis: "A", code: "coverage_missing", target: d.target, message: `coverage lists ${d.target}, which isn't in functions.considered.` });
  }
  for (const fn of functions) {
    const n = sets.get(fn.target) ?? 0;
    const d = decl.get(fn.target);
    const isRequired = required.has(fn.target);
    const trainable = fn.state === "available";
    // A — false claims.
    if (claims && d?.status === "trained" && !trainable && fn.state === "infeasible") f({ kind: "deficiency", basis: "A", code: "coverage_dishonest", target: fn.target, message: `${fn.target} is declared trained, but no eligible exercise trains it under the current restrictions and equipment — declare it not_trained.` });
    else if (claims && d?.status === "trained" && n === 0) f({ kind: "deficiency", basis: "A", code: "coverage_dishonest", target: fn.target, message: `${fn.target} is declared trained but gets no direct sets — train it, or declare it reduced/not_trained with a cause and why.` });
    // C — goal requirements.
    if (isRequired && !trainable) f({ kind: "limitation", basis: "C", code: "goal_target_infeasible", target: fn.target, message: `${label(fn.target)} is a goal priority, but ${fn.state === "uncertain_only" ? "the only exercises for it have unconfirmed fit" : "no exercise in OPTIM's knowledge trains it within the client's confirmed restrictions and equipment"} — this plan can't train it directly.` });
    else if (isRequired && n === 0 && !(d && d.status !== "trained" && (d.cause === "constraints" || d.cause === "available_exercises"))) f({ kind: "deficiency", basis: "C", code: "goal_target_untrained", target: fn.target, message: `${label(fn.target)} is a goal priority and can be trained, but gets no direct sets.` });
    // D — the Reasoner's own declarations, surfaced.
    if (d && d.status !== "trained" && trainable) {
      if (d.cause === "constraints" || d.cause === "available_exercises") f({ kind: "limitation", basis: "D", code: "target_declared_limited", target: fn.target, message: `${label(fn.target)}: ${d.status === "reduced" ? "reduced" : "not trained"} — ${d.why ?? (d.cause === "constraints" ? "the confirmed restrictions limit the options" : "too few eligible exercises")}.` });
      else if (!isRequired) f({ kind: "information", basis: "D", code: "target_reduced_by_choice", target: fn.target, message: `${label(fn.target)} ${d.status === "reduced" ? "gets less volume" : "isn't trained"} by design (${d.cause === "time" ? "time" : "goal priority"})${d.why ? ` — ${d.why}` : ""}.` });
    }
    if (!trainable && !isRequired) f({ kind: "information", basis: "D", code: "target_unavailable", target: fn.target, message: `${label(fn.target)} isn't trained: ${fn.state === "uncertain_only" ? "its only exercises have unconfirmed fit (you can clear them)" : "no eligible exercise trains it under the confirmed restrictions and equipment"}.` });
  }

  // A — sessions: structurally empty, or claiming a primary target nothing in them trains.
  if (params.checkSessions)
    for (const s of week) {
      if (!s.items.length) {
        f({ kind: "deficiency", basis: "A", code: "session_empty", target: null, message: `${s.day} "${s.title}" has no exercises.` });
        continue;
      }
      if (!s.targets?.length) continue;
      const missing = s.targets.filter((t) => !s.items.some((i) => i.exerciseId && knowledge.getExercise(i.exerciseId)?.primaryMuscles.includes(t as MuscleId)));
      if (missing.length) f({ kind: "deficiency", basis: "A", code: "session_targets", target: null, message: `${s.day} "${s.title}" declares ${missing.join(", ")} as primary targets but nothing in it trains ${missing.length > 1 ? "them" : "it"} — fix the session or its targets.` });
    }

  // D — balance is judgment: shown, never blocking.
  const push = patternSets(week, knowledge, PUSH_PATTERNS);
  const pull = patternSets(week, knowledge, PULL_PATTERNS);
  if (push + pull > 0 && (Math.max(push, pull) / Math.max(1, Math.min(push, pull)) > PUSH_PULL_RATIO || Math.min(push, pull) === 0)) f({ kind: "information", basis: "D", code: "push_pull_note", target: null, message: `Weekly pushing ${push} vs pulling ${pull} sets.` });

  const blocking = findings.filter((x) => x.kind !== "information");
  return { findings, signature: blocking.length ? blocking.map((x) => `${x.code}:${x.target ?? x.message}`).sort().join("|") : null };
}
