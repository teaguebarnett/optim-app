// Gate 4.0C-1 — PlanningReadiness: can a plan be built honestly right now?
//
// READY_TO_PLAN or NEEDS_INPUT. NEEDS_INPUT names each missing fact, why it
// matters, which decision it blocks, and who can provide it. A planner
// never fills a gap with a default — it asks.

import { isKnown, type Fact } from "./facts.ts";
import { effectiveConstraints } from "./constraints.ts";
import type { SynthesisInput } from "./synthesis-input.ts";

export type InputProvider = "client" | "coach" | "either";

export interface MissingInput {
  /** Stable id of the missing fact (e.g. "onboarding.your_week.availableDays"). */
  fact: string;
  why: string;
  blockedDecision: string;
  providedBy: InputProvider;
}

export interface PlanningRequirement {
  id: string;
  /** Returns true when satisfied; otherwise the fact id that's missing. */
  check: (input: SynthesisInput) => true | string;
  why: string;
  blockedDecision: string;
  providedBy: InputProvider;
}

export type PlanningReadiness = { status: "READY_TO_PLAN" } | { status: "NEEDS_INPUT"; missing: MissingInput[] };

const factRequirement = (id: string, pick: (i: SynthesisInput) => Fact<unknown>, rest: Omit<PlanningRequirement, "id" | "check">): PlanningRequirement => ({
  id,
  check: (i) => {
    const f = pick(i);
    return isKnown(f) ? true : f.ref;
  },
  ...rest,
});

/** Requirements every domain shares. Planners add their own. */
export const SHARED_REQUIREMENTS: PlanningRequirement[] = [
  {
    id: "coach_method_confirmed",
    check: (i) => (i.coach ? true : "coach_brain.confirmed_method"),
    why: "Plans follow the coach's own method; there is no default method.",
    blockedDecision: "Every programming parameter (frequency range, volume, effort, progression).",
    providedBy: "coach",
  },
  {
    id: "primary_goal",
    check: (i) => (i.goal.primary ? true : "onboarding.what_you_want.primaryGoal"),
    why: "The goal decides which domains are planned and what success means.",
    blockedDecision: "Planner routing and every goal-driven target.",
    providedBy: "client",
  },
  factRequirement("available_days", (i) => i.client.schedule.availableDays, {
    why: "Availability is the ceiling on how many days can be scheduled.",
    blockedDecision: "Training frequency and the weekly schedule.",
    providedBy: "client",
  }),
  {
    id: "no_open_health_review",
    check: (i) =>
      effectiveConstraints(i.constraints).some((c) => c.enforcement === "hard" && c.review.status === "open" && c.tags.some((t) => t.kind === "requires_coach_review"))
        ? "health_review.decision"
        : true,
    why: "A health answer is waiting for the coach's review; planning around it first would guess at boundaries.",
    blockedDecision: "Exercise selection, intensity and any training at all until reviewed.",
    providedBy: "coach",
  },
];

export function evaluatePlanningReadiness(input: SynthesisInput, requirements: PlanningRequirement[]): PlanningReadiness {
  const seen = new Set<string>();
  const missing: MissingInput[] = [];
  for (const r of [...SHARED_REQUIREMENTS, ...requirements]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const result = r.check(input);
    if (result !== true) missing.push({ fact: result, why: r.why, blockedDecision: r.blockedDecision, providedBy: r.providedBy });
  }
  const conflict = input.bounds.frequency.conflict;
  if (conflict) {
    missing.push({
      fact: "frequency.coach_minimum_vs_availability",
      why: `The client can train ${conflict.available} day(s); the coach's method calls for at least ${conflict.coachMinimum}.`,
      blockedDecision: "Training frequency.",
      providedBy: "coach",
    });
  }
  return missing.length === 0 ? { status: "READY_TO_PLAN" } : { status: "NEEDS_INPUT", missing };
}

export { factRequirement };
