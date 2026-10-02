// Gate 4.0C-1 — DomainPlanner: one small planner per domain, all consuming
// the same SynthesisInput. No universal planner. This gate defines the
// interface and the run harness; domain planners live in planners/ (Gate 4.0C-2: resistance).
//
// runPlanner: readiness → plan → validate. A planner is only invoked when
// readiness passes, and its spec only leaves when validation passes.
// Planners are deterministic; no model call happens anywhere in here.

import type { GoalClass } from "./goal-contract.ts";
import type { PlanDomain, PlanSpecification } from "./plan-spec.ts";
import { validatePlanSpecification, type PlanValidation } from "./plan-spec.ts";
import { evaluatePlanningReadiness, type MissingInput, type PlanningRequirement } from "./readiness.ts";
import type { SynthesisInput } from "./synthesis-input.ts";

export interface DomainPlanner {
  id: string;
  /** Recorded in provenance; bump when the planner's rules change. */
  version: string;
  domain: PlanDomain;
  /** Domain-specific facts needed beyond the shared requirements. */
  requirements: PlanningRequirement[];
  /** Called only when readiness passed. Pure: same input → same result. A
   * planner may still find, while planning, that it can't proceed honestly
   * (e.g. constraints leave nothing eligible) — it returns NEEDS_INPUT then. */
  plan(input: SynthesisInput, ctx: { nowIso: string }): PlanSpecification | { status: "NEEDS_INPUT"; missing: MissingInput[] };
  /** Domain-specific hard validation, on top of the shared checks. */
  validate?(spec: PlanSpecification, input: SynthesisInput): PlanValidation;
}

export type PlannerRun =
  | { status: "NEEDS_INPUT"; planner: string; missing: MissingInput[] }
  | { status: "INVALID"; planner: string; errors: string[] }
  | { status: "PLANNED"; planner: string; spec: PlanSpecification };

export function runPlanner(planner: DomainPlanner, input: SynthesisInput, ctx: { nowIso: string }): PlannerRun {
  const readiness = evaluatePlanningReadiness(input, planner.requirements);
  if (readiness.status === "NEEDS_INPUT") return { status: "NEEDS_INPUT", planner: planner.id, missing: readiness.missing };
  const result = planner.plan(input, ctx);
  if ("status" in result) return { status: "NEEDS_INPUT", planner: planner.id, missing: result.missing };
  const spec = result;
  const errors = [validatePlanSpecification(spec, input), planner.validate?.(spec, input) ?? { ok: true as const }].flatMap((v) => (v.ok ? [] : v.errors));
  if (errors.length) return { status: "INVALID", planner: planner.id, errors };
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
