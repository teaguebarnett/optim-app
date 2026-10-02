// Gate 4.0C-1 — DomainPlanner: one small planner per domain, all consuming
// the same SynthesisInput. No universal planner. This gate defines the
// interface and the run harness only — no domain planner exists yet.
//
// runPlanner: readiness → plan → validate. A planner is only invoked when
// readiness passes, and its spec only leaves when validation passes.
// Planners are deterministic; no model call happens anywhere in here.

import type { GoalClass } from "./goal-contract.ts";
import type { PlanDomain, PlanSpecification } from "./plan-spec.ts";
import { validatePlanSpecification } from "./plan-spec.ts";
import { evaluatePlanningReadiness, type MissingInput, type PlanningRequirement } from "./readiness.ts";
import type { SynthesisInput } from "./synthesis-input.ts";

export interface DomainPlanner {
  id: string;
  /** Recorded in provenance; bump when the planner's rules change. */
  version: string;
  domain: PlanDomain;
  /** Domain-specific facts needed beyond the shared requirements. */
  requirements: PlanningRequirement[];
  /** Called only when readiness passed. Pure: same input → same spec. */
  plan(input: SynthesisInput, ctx: { nowIso: string }): PlanSpecification;
}

export type PlannerRun =
  | { status: "NEEDS_INPUT"; planner: string; missing: MissingInput[] }
  | { status: "INVALID"; planner: string; errors: string[] }
  | { status: "PLANNED"; planner: string; spec: PlanSpecification };

export function runPlanner(planner: DomainPlanner, input: SynthesisInput, ctx: { nowIso: string }): PlannerRun {
  const readiness = evaluatePlanningReadiness(input, planner.requirements);
  if (readiness.status === "NEEDS_INPUT") return { status: "NEEDS_INPUT", planner: planner.id, missing: readiness.missing };
  const spec = planner.plan(input, ctx);
  const validation = validatePlanSpecification(spec, input);
  if (!validation.ok) return { status: "INVALID", planner: planner.id, errors: validation.errors };
  if (spec.domain !== planner.domain) return { status: "INVALID", planner: planner.id, errors: [`Planner ${planner.id} returned a ${spec.domain} spec.`] };
  return { status: "PLANNED", planner: planner.id, spec };
}

/** Which domains a goal needs planned. Routing only — what each domain
 * then prescribes is the planner's (and the coach's) decision. */
const GOAL_DOMAINS: Record<GoalClass, PlanDomain[]> = {
  strength: ["resistance"],
  hypertrophy: ["resistance"],
  fat_loss: ["resistance", "nutrition"],
  weight_gain: ["resistance", "nutrition"],
  maintenance: ["resistance", "nutrition"],
  recomposition: ["resistance", "nutrition"],
  endurance: ["endurance"],
  event_performance: ["endurance"],
  sport_performance: ["resistance", "conditioning"],
  general_fitness: ["general_fitness"],
  other: [],
};

export function plannerDomainsForGoal(goalClass: GoalClass): PlanDomain[] {
  return GOAL_DOMAINS[goalClass];
}

export function createPlannerRegistry(planners: DomainPlanner[]) {
  const byDomain = new Map<PlanDomain, DomainPlanner>();
  for (const p of planners) {
    if (byDomain.has(p.domain)) throw new Error(`Two planners for domain ${p.domain}`);
    byDomain.set(p.domain, p);
  }
  return {
    forDomain: (d: PlanDomain) => byDomain.get(d),
    /** Planners for the input's primary goal; domains with no planner yet are reported, not faked. */
    forInput(input: SynthesisInput): { planners: DomainPlanner[]; unsupported: PlanDomain[] } {
      const domains = input.goal.primary ? plannerDomainsForGoal(input.goal.primary.class) : [];
      return { planners: domains.map((d) => byDomain.get(d)).filter((p): p is DomainPlanner => !!p), unsupported: domains.filter((d) => !byDomain.has(d)) };
    },
  };
}
