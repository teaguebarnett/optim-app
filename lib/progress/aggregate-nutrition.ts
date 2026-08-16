// Weekly nutrition aggregation — keeps meal-plan adherence, calorie-target
// adherence, and protein-target adherence as three distinct numbers, each
// aggregated from raw numerators/denominators across evaluable days. Never
// treats an unevaluable (insufficient-data) day as either a success or a
// failure.

import { deriveCalorieTargetMet, deriveMealPlanAdherence, deriveProteinTargetMet } from "../history/derive-nutrition.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import type { DayRecordSlot } from "./collect-week-records";
import type { NutritionCardModel, NutritionDaySummaryModel } from "./types";

export function aggregateNutrition(slots: DayRecordSlot[]): NutritionCardModel {
  const days: NutritionDaySummaryModel[] = [];
  let adherentMeals = 0;
  let totalMeals = 0;
  let calorieDaysMet = 0;
  let calorieDaysEvaluable = 0;
  let proteinDaysMet = 0;
  let proteinDaysEvaluable = 0;

  for (const slot of slots) {
    const dayOfWeek = localDateDayOfWeek(slot.dateIso);

    if (!slot.record || slot.isFuture) {
      const marker = slot.isFuture ? "future" : "no_record";
      days.push({ dateIso: slot.dateIso, dayOfWeek, mealPlanOutcome: marker, calorieResult: marker, proteinResult: marker });
      continue;
    }

    const mealPlan = deriveMealPlanAdherence(slot.record);
    const calorie = deriveCalorieTargetMet(slot.record);
    const protein = deriveProteinTargetMet(slot.record);

    adherentMeals += mealPlan.adherentCount;
    totalMeals += mealPlan.totalCount;
    if (calorie !== "insufficient_data") {
      calorieDaysEvaluable += 1;
      if (calorie === "met") calorieDaysMet += 1;
    }
    if (protein !== "insufficient_data") {
      proteinDaysEvaluable += 1;
      if (protein === "met") proteinDaysMet += 1;
    }

    days.push({ dateIso: slot.dateIso, dayOfWeek, mealPlanOutcome: mealPlan.outcome, calorieResult: calorie, proteinResult: protein });
  }

  return {
    mealPlanAdherenceRatio: totalMeals > 0 ? adherentMeals / totalMeals : null,
    mealPlanStatus: totalMeals > 0 ? "ok" : "insufficient_data",
    calorieDaysMet,
    calorieDaysEvaluable,
    proteinDaysMet,
    proteinDaysEvaluable,
    days,
  };
}
