// Gate 4.0C-1 — the one input every domain planner consumes.
//
// SynthesisInput gathers the four layers, read-only:
//   Fitness Knowledge  — what's generally true (versioned registry)
//   Coach Brain        — how this coach coaches (their confirmed method)
//   ClientState/Goal   — what's true about, and wanted by, this client
//   ConstraintSet      — the boundaries this client's plan must respect
// plus derived bounds (ranges a planner must stay within, never decisions).
//
// Nothing here writes anything. The Coach Brain is frozen on the way in so
// no planner can mutate the coach's method through a client's synthesis.

import type { ConfirmedCoachMethod } from "../coach/coach-brain.ts";
import { asRange, baseOf } from "../coach/calibration/model.ts";
import { isKnown } from "./facts.ts";
import type { ClientState } from "./client-state.ts";
import { deriveConstraintSet, type ConstraintSet } from "./constraints.ts";
import { deriveGoalContract, type GoalContract } from "./goal-contract.ts";
import type { FitnessKnowledgeRegistry } from "./knowledge/types.ts";

export interface CoachMethodRef {
  versionId: string;
  version: number;
  method: Readonly<ConfirmedCoachMethod>;
}

export interface FrequencyBounds {
  /** Inclusive range of training days a plan may use; null when it can't be bounded yet. */
  min: number | null;
  max: number | null;
  /** Why the bounds are what they are — each limiting factor named. */
  limitedBy: Array<"client_availability" | "coach_method_max" | "coach_method_min">;
  /** The client's availability is below the coach's minimum. */
  conflict: { coachMinimum: number; available: number } | null;
}

export interface SynthesisInput {
  knowledge: FitnessKnowledgeRegistry;
  coach: CoachMethodRef | null;
  client: ClientState;
  goal: GoalContract;
  constraints: ConstraintSet;
  bounds: { frequency: FrequencyBounds };
}

export function buildSynthesisInput(params: { knowledge: FitnessKnowledgeRegistry; coachMethod: ConfirmedCoachMethod | null; client: ClientState }): SynthesisInput {
  const coach = params.coachMethod ? { versionId: params.coachMethod.versionId, version: params.coachMethod.version, method: deepFreezeCopy(params.coachMethod) } : null;
  return {
    knowledge: params.knowledge,
    coach,
    client: params.client,
    goal: deriveGoalContract(params.client),
    constraints: deriveConstraintSet(params.client),
    bounds: { frequency: frequencyBounds(params.client, params.coachMethod) },
  };
}

/** The coach's training-days range, as stated in their method. */
function coachDaysRange(method: ConfirmedCoachMethod | null): { min: number; max: number | null } | null {
  if (!method) return null;
  const com = method.operatingModel;
  if (com.calibration?.schema === 2) {
    const r = asRange(baseOf(com.calibration.answers.t_days));
    return r ? { min: r.min, max: r.max ?? null } : null;
  }
  const pa = com.programArchitecture;
  return typeof pa.typicalFrequencyDaysMin === "number" ? { min: pa.typicalFrequencyDaysMin, max: pa.typicalFrequencyDaysMax ?? null } : null;
}

/**
 * Availability is the ceiling, the coach's range narrows it. The result is
 * a RANGE — never "train every available day". Choosing a number inside it
 * is the planner's job, recorded with its own rationale.
 */
export function frequencyBounds(client: ClientState, method: ConfirmedCoachMethod | null): FrequencyBounds {
  const available = isKnown(client.schedule.availableDays) ? client.schedule.availableDays.value.length : null;
  const coach = coachDaysRange(method);
  const limitedBy: FrequencyBounds["limitedBy"] = [];
  let max: number | null = null;
  if (available !== null) {
    max = available;
    limitedBy.push("client_availability");
  }
  if (coach?.max != null && (max === null || coach.max < max)) {
    max = coach.max;
    limitedBy.splice(0, limitedBy.length, "coach_method_max");
  }
  let min: number | null = null;
  if (coach && max !== null) {
    min = Math.min(coach.min, max);
    if (coach.min <= max) limitedBy.push("coach_method_min");
  }
  const conflict = coach && available !== null && available < coach.min ? { coachMinimum: coach.min, available } : null;
  return { min: max === null ? null : (min ?? 1), max, limitedBy, conflict };
}

function deepFreezeCopy<T>(value: T): Readonly<T> {
  const copy = structuredClone(value);
  const freeze = (v: unknown) => {
    if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) freeze(x);
      Object.freeze(v);
    }
  };
  freeze(copy);
  return copy;
}
