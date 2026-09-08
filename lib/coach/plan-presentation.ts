// Phase 5.6A.1 — pure presentation-layer naming for the plan review decision
// workspace (spec Part 2's "Best fit / Strong alternative / Strategic
// wildcard must remain ranking labels, never a strategy's only name").
// Deliberately additive: every name here is derived from real, already-
// generated direction/strategy data — never a new generation decision, and
// never a change to the underlying scoring/generation engines.

import type { ProgramDirectionSummary } from "./program-directions.ts";
import type { GeneratedNutritionStrategy } from "./activation-generation.ts";

export const RANK_LABEL: Record<ProgramDirectionSummary["kind"], string> = {
  best_fit: "Best fit",
  strong_alternative: "Strong alternative",
  wildcard: "Strategic wildcard",
};

/** Capitalizes a split name's first letter only — the split library already
 * writes these as plain lowercase-after-first-word English ("Upper /
 * lower"), so this never invents wording, only normalizes casing for a
 * card title. */
function titleCase(splitName: string): string {
  return splitName.charAt(0).toUpperCase() + splitName.slice(1);
}

/** A real, meaningful training-direction name derived from its actual
 * structure — e.g. "Upper / lower — 5-Day Split" — instead of the ranking
 * label ("Best fit") standing in as the only name. */
export function meaningfulTrainingDirectionName(direction: Pick<ProgramDirectionSummary, "splitName" | "frequencyPerWeek">): string {
  return `${titleCase(direction.splitName)} — ${direction.frequencyPerWeek}-Day Split`;
}

/** A real, meaningful nutrition-strategy name derived from its actual
 * structure (training/rest-day carb cycling vs. a flat structured or
 * flexible target) — instead of the ranking label standing in as the only
 * name. */
export function meaningfulNutritionStrategyName(strategy: Pick<GeneratedNutritionStrategy, "trainingDayTargets" | "mealStructureDescription">): string {
  if (strategy.trainingDayTargets) return "Training/Rest-Day Carb Cycling";
  return /structured/i.test(strategy.mealStructureDescription) ? "Structured Meal Framework" : "Flexible Macro Targets";
}

/** The nutrition assumptions that materially change the numeric
 * prescription itself (an averaged-sex calorie formula, a clamped safety
 * floor) — as opposed to a standard methodology note that's always present
 * regardless of missing data. Spec Part 2's "material assumption... cannot
 * remain buried" requirement: these must appear above approval, not only
 * inside "See why." */
export function materialNutritionAssumptions(assumptions: string[]): string[] {
  return assumptions.filter((a) => /sex not specified|clamped/i.test(a));
}
