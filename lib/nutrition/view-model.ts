// Nutrition page view-model helpers — pure data transformations kept
// separate from rendering (see components/nutrition/*), so status/caption
// logic can be unit-verified directly (see verify-nutrition.mts) without
// mounting any component.

import { MEAL_ORDER } from "../calculations.ts";
import { MEAL_OPTIONS } from "../mock-data.ts";
import type { DailyPlanResult, MealScheduleEntry } from "../planning/types";
import type { AppState } from "../state";
import type { DailyTaskId, DailyTaskState, MacroValues, MealEstimateItem, MealPeriod, MealSelection } from "../types";

export type MacroKey = "protein" | "carbs" | "fat";

export const MACRO_FIELD: Record<MacroKey, keyof MacroValues> = {
  protein: "proteinG",
  carbs: "carbsG",
  fat: "fatG",
};

/** Restrained category accents reused from Today's Fuel section (see
 * components/today/fuel-section.tsx) — protein/carbs/fat keep the exact same
 * mapping everywhere in the app so the two screens never disagree about
 * which color means which macro. */
export const MACRO_ACCENTS: Record<MacroKey, string> = {
  protein: "var(--pc-brass)",
  carbs: "var(--pc-success)",
  fat: "var(--pc-warning)",
};

/** The DailyTaskId a given meal period's status is derived under — see
 * lib/calculations.ts's deriveTaskStates, the one source of truth for
 * per-meal state that both Today and Nutrition read from so they can never
 * drift apart. */
export const TASK_ID_FOR_PERIOD: Record<MealPeriod, DailyTaskId> = {
  breakfast: "breakfast",
  postWorkout: "post-workout-meal",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
};

/** True when a meal period is genuinely still open — never logged, skipped,
 * or explicitly deferred with a real decision, only "planned for later"
 * (which is a placeholder, not a resolution). The one shared predicate both
 * deriveNutritionStatusLine and nextRelevantMealPeriod use, so the status
 * line's "next up" claim and which meal card actually gets emphasized can
 * never disagree. */
export function isMealPending(period: MealPeriod, state: AppState): boolean {
  const selection = state.meals[period];
  return !selection || selection.source === "planned-later";
}

/**
 * The one meal Nutrition treats as "current/next relevant" for card emphasis
 * and the photo estimator's suggested period. Prefers the planner's own
 * global next action when it names a meal (e.g. an urgent post-workout
 * meal), but falls back to the earliest still-pending meal in today's plan
 * when the global next action is something else entirely (morning weight,
 * training time, the workout itself) — so Nutrition's own "next up" framing
 * never points at nothing just because a non-meal task happens to be the
 * app-wide priority right now.
 */
export function nextRelevantMealPeriod(state: AppState, dailyPlan: DailyPlanResult): MealPeriod | null {
  const nextActionId = dailyPlan.nextAction?.kind === "meal" ? dailyPlan.nextAction.id : null;
  const matched = (Object.keys(TASK_ID_FOR_PERIOD) as MealPeriod[]).find(
    (period) => TASK_ID_FOR_PERIOD[period] === nextActionId
  );
  if (matched) return matched;

  const periodsInPlan = Object.keys(dailyPlan.mealSchedule.entries) as MealPeriod[];
  const orderedPeriods = MEAL_ORDER.filter((p) => periodsInPlan.includes(p));
  return orderedPeriods.find((p) => isMealPending(p, state)) ?? null;
}

export function macroRemainingCaption(consumed: number, target: number): string {
  const diff = target - consumed;
  if (diff > 0.5) return `${Math.round(diff)}g remaining`;
  if (diff < -0.5) return `${Math.round(-diff)}g over target`;
  return "Target reached";
}

export function remainingCalorieCaption(consumed: number, target: number): string {
  const diff = target - consumed;
  if (diff > 0.5) return `${Math.round(diff)} cal`;
  if (diff < -0.5) return `${Math.round(-diff)} cal over`;
  return "Target reached";
}

export function sumMealEstimateItems(items: MealEstimateItem[]): MacroValues {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + (Number.isFinite(item.macros.calories) ? item.macros.calories : 0),
      proteinG: acc.proteinG + (Number.isFinite(item.macros.proteinG) ? item.macros.proteinG : 0),
      carbsG: acc.carbsG + (Number.isFinite(item.macros.carbsG) ? item.macros.carbsG : 0),
      fatG: acc.fatG + (Number.isFinite(item.macros.fatG) ? item.macros.fatG : 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

/** The catalog option name, manual name, or photo-estimate summary name for
 * a logged meal — null for skipped/planned-later/unlogged. */
export function mealDisplayName(period: MealPeriod, selection: MealSelection | undefined): string | null {
  if (!selection) return null;
  if (selection.source === "option") {
    return MEAL_OPTIONS[period].find((o) => o.id === selection.optionId)?.name ?? null;
  }
  if (selection.source === "manual" || selection.source === "photo-estimate") {
    return selection.manualName ?? null;
  }
  return null;
}

/** Distinguishes coach-approved catalog picks, the client's own manual
 * entries, and OPTIM's photo estimates — see the Visual Constitution §16 and
 * the product requirement that these three never present as one another. */
export function mealProvenanceLabel(selection: MealSelection | undefined): string | null {
  if (!selection) return null;
  if (selection.source === "option") return "Coach-approved option";
  if (selection.source === "manual") return "Your manual entry";
  if (selection.source === "photo-estimate") return "OPTIM photo estimate";
  return null;
}

export type MealCardStatus = "current" | "logged" | "skipped" | "missed" | "upcoming";

const MISSED_THRESHOLD_MIN = 90;

/**
 * Presentation-only refinement layered on top of the canonical DailyTaskState
 * (never a competing status model) — a meal whose recommended time is well
 * in the past and still unresolved reads as "missed" instead of a generic
 * "upcoming"/"recommended now", purely for Nutrition's calmer meal-card
 * captioning. Never alters what's actually stored or how Today derives its
 * own state.
 */
export function deriveMealCardStatus(params: {
  taskState: DailyTaskState | undefined;
  isNextAction: boolean;
  scheduleEntry: MealScheduleEntry | undefined;
  now: Date;
}): MealCardStatus {
  const { taskState, isNextAction, scheduleEntry, now } = params;
  if (taskState === "completed") return "logged";
  if (taskState === "skipped") return "skipped";
  if (isNextAction) return "current";
  if (scheduleEntry?.recommendedAtIso && !scheduleEntry.isLocked) {
    const minutesPast = (now.getTime() - new Date(scheduleEntry.recommendedAtIso).getTime()) / 60_000;
    if (minutesPast > MISSED_THRESHOLD_MIN) return "missed";
  }
  return "upcoming";
}
