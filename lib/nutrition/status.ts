// Nutrition page's "intelligent daily status" line (Visual Constitution §2's
// "relevance determines visibility" applied to a single sentence, per the
// product spec's "Intelligent daily status" requirement). Deliberately
// simple and calm — never a chat message, never a fabricated claim — every
// branch reads only real, already-computed state (dailyPlan's meal schedule
// and totals). Falls back to lib/calculations.ts's nutritionStatusMessage
// (the same line Today's Fuel section shows) so the two screens never
// contradict each other when nothing more specific applies.

import { MEAL_ORDER, nutritionStatusMessage } from "../calculations.ts";
import { MEAL_PERIOD_LABELS } from "../mock-data.ts";
import { isMealPending } from "./view-model.ts";
import type { DailyPlanResult } from "../planning/types";
import type { AppState } from "../state";
import type { MacroValues, MealPeriod } from "../types";

function isMealResolved(period: MealPeriod, state: AppState): boolean {
  return !isMealPending(period, state);
}

const PRE_WORKOUT_LOOKAHEAD_MIN = 60;
const PROTEIN_BEHIND_RATIO = 0.45;
const MIN_RESOLVED_FOR_PROTEIN_CHECK = 2;

export function deriveNutritionStatusLine(params: {
  state: AppState;
  dailyPlan: DailyPlanResult;
  totals: MacroValues;
  /** Null = no nutrition assigned; target-based lines are skipped. */
  /** Null = no nutrition assigned; per-field null = not prescribed by the coach's method (U3A). */
  targets: { calories: number | null; proteinG: number | null } | null;
  now: Date;
}): string {
  const { state, dailyPlan, totals, targets, now } = params;
  const periods = Object.keys(dailyPlan.mealSchedule.entries) as MealPeriod[];
  const orderedPeriods = MEAL_ORDER.filter((p) => periods.includes(p));

  const nothingLoggedYet = totals.calories === 0 && orderedPeriods.every((p) => !state.meals[p]);
  if (nothingLoggedYet) {
    const firstPeriod = orderedPeriods[0];
    const entry = firstPeriod ? dailyPlan.mealSchedule.entries[firstPeriod] : undefined;
    if (firstPeriod && entry?.timeLabel) {
      return `Nothing logged yet — ${MEAL_PERIOD_LABELS[firstPeriod]} is up first, ${entry.timeLabel.toLowerCase()}.`;
    }
    return "Nothing logged yet — log your first meal whenever you're ready.";
  }

  const allResolved = orderedPeriods.length > 0 && orderedPeriods.every((p) => isMealResolved(p, state));
  if (allResolved) {
    return "Today's meals are all accounted for. Nice work staying consistent.";
  }

  for (const period of orderedPeriods) {
    const entry = dailyPlan.mealSchedule.entries[period];
    if (entry?.role === "pre-workout" && !isMealResolved(period, state) && entry.recommendedAtIso) {
      const minutesAway = (new Date(entry.recommendedAtIso).getTime() - now.getTime()) / 60_000;
      if (minutesAway >= 0 && minutesAway <= PRE_WORKOUT_LOOKAHEAD_MIN) {
        return `Pre-training fuel coming up — ${MEAL_PERIOD_LABELS[period]} is recommended ${(entry.timeLabel ?? "soon").toLowerCase()}.`;
      }
    }
  }

  const resolvedCount = orderedPeriods.filter((p) => isMealResolved(p, state)).length;
  const proteinRatio = targets && targets.proteinG ? totals.proteinG / targets.proteinG : 1;
  if (targets && resolvedCount >= MIN_RESOLVED_FOR_PROTEIN_CHECK && proteinRatio < PROTEIN_BEHIND_RATIO) {
    return "Protein is running behind pace today — worth prioritizing at your next meal.";
  }

  const nextUnresolved = orderedPeriods.find((p) => !isMealResolved(p, state));
  if (nextUnresolved) {
    const entry = dailyPlan.mealSchedule.entries[nextUnresolved];
    return entry?.timeLabel
      ? `Next up: ${MEAL_PERIOD_LABELS[nextUnresolved]}, ${entry.timeLabel.toLowerCase()}.`
      : `Next up: ${MEAL_PERIOD_LABELS[nextUnresolved]}.`;
  }

  return nutritionStatusMessage(totals, state.meals, targets);
}
