// Gate 4.0C-5 — the MATERIAL planning-state fingerprint: one deterministic
// key for the inputs that define the programming problem a Fitness
// Reasoner run solved. A draft solved under key A is the current solution
// only while the client's authoritative state still produces key A.
//
// IN (each its own part, so a change names what changed):
//   restrictions — effective hard movement/injury/medical constraints:
//                  category, confirmation and structured tags (ids,
//                  timestamps and wording excluded; re-confirming the same
//                  facts is no change)
//   exerciseFit  — the coach's current per-exercise exclusions/clearances
//   equipment    — available equipment and apparatus states
//   schedule     — available days and the session-length cap
//   goal         — goal classes, their structured specs (priority lifts,
//                  muscles, weight targets…) and structured performance
//                  targets
//   training     — training experience and current weekly frequency (they
//                  set the frequency anchor and exercise complexity)
//   method       — the confirmed Coach Brain version
//   knowledge    — the Fitness Knowledge version
//
// OUT (never part of the key): free-text notes, the success-definition
// wording, schedule/recovery/nutrition notes, body metrics, onboarding
// timestamps, fact provenance (source refs, basis), constraint ids and
// descriptions, confirmation timestamps.

import { createHash } from "node:crypto";
import type { ClientState } from "./client-state.ts";
import { effectiveConstraints, type ConstraintSet, type ConstraintTag } from "./constraints.ts";
import { isKnown, type Fact } from "./facts.ts";
import type { GoalContract } from "./goal-contract.ts";
import { resolveEquipmentAccess } from "./planners/resistance/equipment-access.ts";

export const PLANNING_STATE_PARTS = ["restrictions", "exerciseFit", "equipment", "schedule", "goal", "training", "method", "knowledge"] as const;
export type PlanningStatePart = (typeof PLANNING_STATE_PARTS)[number];

export interface PlanningState {
  schema: 1;
  key: string;
  parts: Record<PlanningStatePart, string>;
  /** Readable values per part (for "what changed" explanations; never secrets or client free text). */
  summary: Record<PlanningStatePart, string[]>;
}

export interface PlanningStateSource {
  client: ClientState;
  goal: GoalContract;
  constraints: ConstraintSet;
  coachMethodVersionId: string | null;
  knowledgeVersion: string;
  /** Exercise id → display name (summaries only). */
  exerciseName?: (id: string) => string;
}

const canonical = (value: unknown): string => {
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(norm);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) if ((v as Record<string, unknown>)[k] !== undefined) out[k] = norm((v as Record<string, unknown>)[k]);
    return out;
  };
  return JSON.stringify(norm(value));
};
const hash = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");

/** Fact → its value (missing → null); provenance never counts. */
const val = <T,>(f: Fact<T> | undefined): T | null => (f && isKnown(f) ? f.value : null);

/** Strips fact provenance recursively: Facts become their values; basis/source keys drop. */
function materialValues(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(materialValues);
  const o = v as Record<string, unknown>;
  if (o.status === "known" && "value" in o) return materialValues(o.value);
  if (o.status === "missing") return null;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) if (k !== "basis" && k !== "source" && k !== "ref" && k !== "note") out[k] = materialValues(x);
  return out;
}

const EXERCISE_FIT_KINDS = new Set<ConstraintTag["kind"]>(["avoid_exercise", "exercise_cleared"]);
const isExerciseFitConstraint = (id: string) => id.endsWith(":coach_structured:exercise_fit");

export function planningState(src: PlanningStateSource): PlanningState {
  const name = src.exerciseName ?? ((id: string) => id);
  const hard = effectiveConstraints(src.constraints).filter((c) => c.enforcement === "hard");
  // Restrictions: everything except the categories owned by other parts and the exercise-fit constraint.
  const restrictionFacts = hard
    .filter((c) => !["availability", "session_length", "equipment"].includes(c.category) && !isExerciseFitConstraint(c.id))
    // Wording a coach-confirmed structured restriction already expresses is history, not planning state.
    // Exercise-level facts are counted once, in exerciseFit, however they were confirmed (below).
    .map((c) => `${c.category}:${c.confirmation}:${c.review.status === "open" ? "open" : "settled"}:${c.tags.filter((t) => !EXERCISE_FIT_KINDS.has(t.kind) && !(c.interpretedBy && (t.kind === "free_text" || t.kind === "avoid_exercise_term"))).map((t) => canonical(t)).sort().join(",")}`)
    .sort();
  // ONE canonical exercise-level fact set: an exclusion confirmed as a limitation ("Avoid <exercise>") and the same
  // exclusion recorded as a fit decision are the same fact (deduplicated); clearances come only from decisions.
  const fitTags = hard.flatMap((c) => c.tags.filter((t) => t.kind === "avoid_exercise" || (t.kind === "exercise_cleared" && isExerciseFitConstraint(c.id))));
  const fit = [...new Set(fitTags.map((t) => (t.kind === "avoid_exercise" ? `excluded:${t.exerciseId}` : t.kind === "exercise_cleared" ? `cleared:${t.exerciseId}:${t.basis}:${[...t.conditions].sort().join("|")}` : "")))].sort();

  const c = src.client;
  const access = resolveEquipmentAccess(c);
  // Only KNOWN apparatus states count (unknown is the default), so adding apparatus ids to the taxonomy is no change.
  const equipment = access ? { equipment: Object.entries(access.equipment).filter(([, s]) => s === "available").map(([e]) => e).sort(), apparatus: Object.fromEntries(Object.entries(access.apparatus).filter(([, s]) => s !== "unknown").sort()) } : null;
  const len = val(c.schedule.maxSessionLength) as { minutes: number; openEnded?: boolean } | null;
  const days = (val(c.schedule.availableDays) as string[] | null)?.slice().sort() ?? null;
  const schedule = { days, minutes: len ? (len.openEnded ? `${len.minutes}+` : len.minutes) : null };

  const g = src.goal;
  const goal = {
    primary: materialValues(g.primary),
    secondary: (g.secondary ?? []).map(materialValues),
    targets: (g.performanceTargets ?? []).map((t) => ({ exercise: t.exercise, metric: t.metric, value: t.value, unit: t.unit, atReps: t.atReps, timeframe: t.timeframe ?? null })),
  };
  const training = { experience: val(c.training.experience), currentSessionsPerWeek: val(c.training.currentSessionsPerWeek) };

  const material = { restrictions: restrictionFacts, exerciseFit: fit, equipment, schedule, goal, training, method: src.coachMethodVersionId, knowledge: src.knowledgeVersion };
  const parts = Object.fromEntries(PLANNING_STATE_PARTS.map((p) => [p, hash(material[p])])) as Record<PlanningStatePart, string>;

  const summary: Record<PlanningStatePart, string[]> = {
    restrictions: hard.filter((x) => !["availability", "session_length", "equipment"].includes(x.category) && !isExerciseFitConstraint(x.id)).flatMap((x) => x.tags.filter((t) => t.kind !== "avoid_exercise").map((t) => tagSummary(t, name)).filter((s): s is string => !!s)),
    exerciseFit: [...new Set(fitTags.map((t) => (t.kind === "avoid_exercise" ? `Not ${name(t.exerciseId)}` : t.kind === "exercise_cleared" ? `${name(t.exerciseId)} cleared under conditions` : "")).filter(Boolean))],
    equipment: equipment
      ? [
          `Equipment: ${equipment.equipment.join(", ") || "none"}`,
          ...Object.entries(access!.apparatus).filter(([a, st]) => st !== "unknown" && access!.apparatusBasis?.[a as keyof NonNullable<typeof access>["apparatusBasis"]] === "coach_confirmed").map(([a, st]) => `${a.replace(/_/g, " ")}: ${st}`),
        ]
      : ["Equipment unknown"],
    schedule: [days ? `${days.length} available days` : "Availability unknown", schedule.minutes !== null ? `${schedule.minutes} min sessions` : "Session length unknown"],
    goal: [g.primary ? `Primary goal: ${g.primary.class.replace(/_/g, " ")}` : "No primary goal", ...(g.secondary ?? []).map((s) => `Secondary: ${s.class.replace(/_/g, " ")}`), ...(g.performanceTargets ?? []).map((t) => `Target: ${t.exercise} ${t.value} ${t.unit}`)],
    training: [`Experience: ${training.experience ?? "unknown"}`, `Currently ${training.currentSessionsPerWeek ?? "?"}×/week`],
    method: [src.coachMethodVersionId ? `Coaching method ${src.coachMethodVersionId}` : "No confirmed coaching method"],
    knowledge: [`Fitness Knowledge ${src.knowledgeVersion}`],
  };
  return { schema: 1, key: hash(parts), parts, summary };
}

function tagSummary(t: ConstraintTag, name: (id: string) => string): string | null {
  switch (t.kind) {
    case "avoid_movement_pattern":
      return `No ${t.pattern.replace(/_/g, " ")}`;
    case "avoid_demand":
      return `No ${t.demand.replace(/_/g, " ")} at ${t.atOrAbove} or above`;
    case "avoid_position":
      return `No ${t.position.replace(/_/g, " ")} position`;
    case "avoid_exercise":
      return `Not ${name(t.exerciseId)}`;
    case "avoid_equipment":
      return `No ${t.equipment}`;
    case "avoid_limb_loading":
      return `${t.side === "both" ? "Both" : t.side === "left" ? "Left" : "Right"} ${t.region.replace(/_/g, " ")}: no ${t.actions?.length ? t.actions.map((a) => a.replace(/_/g, " ")).join("/") : "loading"}`;
    case "requires_coach_review":
      return "Health review open";
    default:
      return null;
  }
}

export interface PlanningStateChange {
  part: PlanningStatePart;
  /** Plain description of the change (added/removed summary lines). */
  added: string[];
  removed: string[];
}

/** Which parts differ, with readable added/removed lines. */
export function diffPlanningState(before: PlanningState, after: PlanningState): PlanningStateChange[] {
  return PLANNING_STATE_PARTS.filter((p) => before.parts[p] !== after.parts[p]).map((part) => {
    const b = new Set(before.summary[part]);
    const a = new Set(after.summary[part]);
    return { part, added: [...a].filter((x) => !b.has(x)), removed: [...b].filter((x) => !a.has(x)) };
  });
}

export const PART_LABEL: Record<PlanningStatePart, string> = {
  restrictions: "Confirmed restrictions",
  exerciseFit: "Exercise decisions",
  equipment: "Equipment",
  schedule: "Training availability",
  goal: "Goal",
  training: "Training background",
  method: "Coaching method",
  knowledge: "Fitness Knowledge",
};
