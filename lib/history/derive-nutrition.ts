// Nutrition derivations — Phase 4 Required Derivation Correction #3: keep
// meal-plan adherence (did the client address each planned meal, including
// a logged replacement) separate from calorie/protein target-met (did the
// actual macro content land on target), and never claim a target was met
// without known macro data.
//
// "Coach-approved replacement" in the current data model: this app has no
// separate pre-approval workflow for a manual meal substitution — logging
// "I ate something else" (MealSelection.source === "manual") already
// requires the client to supply real macro data before it's accepted (see
// components/meals/meal-selection-sheet.tsx's ManualMealForm) and that entry
// is already counted toward totals identically to a catalog option (see
// lib/calculations.ts's isMealCounted). There is no distinct "unapproved"
// bucket to model separately without inventing a coach-approval UI that
// doesn't exist — see the Phase 4.1 final report for this interpretation.
// What genuinely varies is whether a logged replacement's macro content is
// known: deriveCalorieTargetMet/deriveProteinTargetMet correctly fall back
// to "insufficient_data" for a manual entry that (only ever possible via a
// fixture, never the live form) lacks macros, without changing whether it
// still counts toward meal-plan adherence.

import type { DailyRecord, MealSelectionSnapshot } from "./types";
import type { MacroValues } from "../types";
import type { DomainOutcome } from "./derive-day-status";

export interface NutritionToleranceConfig {
  calorieToleranceKcal: number;
  proteinToleranceG: number;
}

/** Coach-configurable per Phase 4 decisions; these are the documented
 * defaults used when no per-workspace/per-client override exists. */
export const DEFAULT_NUTRITION_TOLERANCE: NutritionToleranceConfig = {
  calorieToleranceKcal: 100,
  proteinToleranceG: 10,
};

function isMealResolvedAdherent(selection: MealSelectionSnapshot | undefined): boolean {
  return (
    !!selection && (selection.source === "option" || selection.source === "manual" || selection.source === "photo-estimate")
  );
}

export interface MealPlanAdherenceResult {
  outcome: DomainOutcome;
  ratio: number;
  /** Raw numerator/denominator — Phase 4.2's weekly dashboard aggregates
   * these directly across days rather than averaging each day's ratio, per
   * the "aggregate numerators and denominators" requirement. */
  adherentCount: number;
  totalCount: number;
}

export function deriveMealPlanAdherence(record: DailyRecord): MealPlanAdherenceResult {
  const { meals, periodsInPlan } = record.nutrition;
  if (periodsInPlan.length === 0) return { outcome: "complete", ratio: 1, adherentCount: 0, totalCount: 0 };
  const adherentCount = periodsInPlan.filter((period) => isMealResolvedAdherent(meals[period])).length;
  const totalCount = periodsInPlan.length;
  const ratio = adherentCount / totalCount;
  if (ratio >= 1) return { outcome: "complete", ratio: 1, adherentCount, totalCount };
  if (ratio > 0) return { outcome: "partial", ratio, adherentCount, totalCount };
  return { outcome: "missed", ratio: 0, adherentCount, totalCount };
}

export type TargetMetResult = "met" | "not_met" | "insufficient_data";

/** Exported for lib/progress/build-historical-day.ts — the Historical Day
 * Review needs the actual summed totals themselves (not just whether a
 * target was met), and this is already the one place that correctly skips
 * skipped/planned-later meals and tracks whether every counted meal's
 * macros are actually known. */
export function sumKnownActualMacros(record: DailyRecord): { totals: MacroValues; allKnown: boolean } {
  const { meals, periodsInPlan } = record.nutrition;
  const totals: MacroValues = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  let allKnown = true;
  for (const period of periodsInPlan) {
    const selection = meals[period];
    if (!isMealResolvedAdherent(selection)) continue; // skipped/planned-later contribute 0, not "unknown"
    // Correction pass — a manual entry can now be logged with SOME macro
    // fields genuinely unentered (see MealSelectionSnapshot.
    // unknownMacroFields' own doc); that selection's `macros` object still
    // exists (0 in the unentered fields, never null), but this day's
    // calorie/protein target-met derivation must not treat those 0s as
    // measured — the same "insufficient data, not zero" contract this
    // function already enforced at the whole-selection level.
    if (!selection?.macros || (selection.unknownMacroFields && selection.unknownMacroFields.length > 0)) {
      allKnown = false;
      continue;
    }
    totals.calories += selection.macros.calories;
    totals.proteinG += selection.macros.proteinG;
    totals.carbsG += selection.macros.carbsG;
    totals.fatG += selection.macros.fatG;
  }
  return { totals, allKnown };
}

export function deriveCalorieTargetMet(
  record: DailyRecord,
  tolerance: NutritionToleranceConfig = DEFAULT_NUTRITION_TOLERANCE
): TargetMetResult {
  const { totals, allKnown } = sumKnownActualMacros(record);
  const snapshot = record.nutrition.targetsSnapshot;
  if (!allKnown || !snapshot) return "insufficient_data";
  const target = snapshot.calories;
  return Math.abs(totals.calories - target) <= tolerance.calorieToleranceKcal ? "met" : "not_met";
}

/** Asymmetric — at least (target - tolerance) counts as met; coming in
 * above target is never penalized. See Phase 4.1 §9. */
export function deriveProteinTargetMet(
  record: DailyRecord,
  tolerance: NutritionToleranceConfig = DEFAULT_NUTRITION_TOLERANCE
): TargetMetResult {
  const { totals, allKnown } = sumKnownActualMacros(record);
  const snapshot = record.nutrition.targetsSnapshot;
  if (!allKnown || !snapshot) return "insufficient_data";
  const target = snapshot.proteinG;
  return totals.proteinG >= target - tolerance.proteinToleranceG ? "met" : "not_met";
}
