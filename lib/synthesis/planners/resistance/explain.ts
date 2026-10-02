// Gate 4.0C-2 — "Why this plan?", built only from what the PlanSpecification
// recorded: decisions with their rationale and inputs, constraints applied,
// assumptions, unresolved items and quality findings. No ranking language,
// no claims the provenance doesn't support.

import type { PlanSpecification } from "../../plan-spec.ts";
import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";

export interface PlanExplanation {
  frequency: string;
  structure: string;
  goal: string;
  coachRules: string[];
  clientFacts: string[];
  constraints: string[];
  assumptions: string[];
  unresolved: string[];
  warnings: string[];
}

export function explainResistancePlan(spec: PlanSpecification, knowledge: FitnessKnowledgeRegistry): PlanExplanation {
  const decisions = [spec.frequency, spec.schedule, spec.weeklyStructure, spec.durationWeeks, spec.volume, spec.intensity, spec.progression, spec.recovery].filter((d): d is NonNullable<typeof d> => !!d);
  const inputs = decisions.flatMap((d) => d.inputs);
  const name = (id: string) => knowledge.getExercise(id)?.name ?? id;
  return {
    frequency: spec.frequency.rationale,
    structure: `${spec.weeklyStructure.rationale} ${spec.schedule.rationale}`,
    goal: `${spec.resistance?.rationale ?? ""} ${spec.intensity?.value.note ?? ""}`.trim(),
    coachRules: [...new Set(inputs.filter((i) => i.startsWith("coach:")).map((i) => i.slice(6)))],
    clientFacts: [...new Set(inputs.filter((i) => i.startsWith("client:")).map((i) => i.slice(7)))],
    constraints: spec.constraintsApplied.map((c) => `${c.constraintId}: ${c.how.replace(/exercise\.[a-z0-9_]+/g, (id) => name(id))}`),
    assumptions: spec.assumptions.map((a) => a.statement),
    unresolved: spec.unresolved.map((u) => `${u.fact} — ${u.why} (from: ${u.providedBy})`),
    warnings: (spec.quality ?? []).filter((q) => q.severity === "warning").map((q) => q.message),
  };
}
