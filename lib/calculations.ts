import { CARDIO_TARGET, MEAL_PERIOD_LABELS, NUTRITION_TARGETS, PUSH_WORKOUT } from "./mock-data";
import type { AppState } from "./state";
import type {
  DailyTask,
  DailyTaskId,
  DailyTaskState,
  MacroValues,
  MealPeriod,
} from "./types";

const MEAL_ORDER: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner", "snack"];

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------

export type TimeOfDay = "morning" | "afternoon" | "evening";

export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function getGreeting(date: Date, clientName: string): { headline: string; subline: string } {
  const timeOfDay = getTimeOfDay(date);
  const greetingWord = timeOfDay === "morning" ? "Good morning" : timeOfDay === "afternoon" ? "Good afternoon" : "Good evening";
  return {
    headline: `${greetingWord}, ${clientName}.`,
    subline: "Happy Monday. Let's start Week 8 strong.",
  };
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

function isMealCounted(selection: AppState["meals"][MealPeriod]): boolean {
  return !!selection && (selection.source === "option" || selection.source === "manual");
}

export function computeNutritionTotals(meals: AppState["meals"]): MacroValues {
  const totals: MacroValues = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const period of MEAL_ORDER) {
    const selection = meals[period];
    if (isMealCounted(selection) && selection?.macros) {
      totals.calories += selection.macros.calories;
      totals.proteinG += selection.macros.proteinG;
      totals.carbsG += selection.macros.carbsG;
      totals.fatG += selection.macros.fatG;
    }
  }
  return totals;
}

export type RemainingTargets = MacroValues;

export function computeRemaining(totals: MacroValues): RemainingTargets {
  return {
    calories: Math.max(0, NUTRITION_TARGETS.calories - totals.calories),
    proteinG: Math.max(0, NUTRITION_TARGETS.proteinG - totals.proteinG),
    carbsG: Math.max(0, NUTRITION_TARGETS.carbsG - totals.carbsG),
    fatG: Math.max(0, NUTRITION_TARGETS.fatG - totals.fatG),
  };
}

export function countRemainingMeals(meals: AppState["meals"]): number {
  return MEAL_ORDER.filter((period) => !meals[period]).length;
}

export function nutritionStatusMessage(totals: MacroValues, meals: AppState["meals"]): string {
  const remainingMeals = countRemainingMeals(meals);
  const calorieRatio = totals.calories / NUTRITION_TARGETS.calories;
  const proteinRatio = totals.proteinG / NUTRITION_TARGETS.proteinG;

  if (totals.calories === 0) return "Your day is off to a strong start.";
  if (calorieRatio > 1.05) return "Slightly above target — one day does not define the week.";
  if (calorieRatio >= 0.95) return "Daily target reached. Nice work staying consistent.";
  if (proteinRatio < 0.55 && remainingMeals <= 1) return "Protein is slightly behind — the next meal is a good chance to close the gap.";
  if (remainingMeals === 1) return "One planned meal remaining.";
  if (calorieRatio >= 0.8) return "Close to today's target.";
  return "Right on track.";
}

// ---------------------------------------------------------------------------
// Daily completion
// ---------------------------------------------------------------------------
//
// Two distinct concepts are kept separate on purpose:
// - "Resolved" (accountability): the client reported what happened —
//   completed, skipped with a reason, or planned for later. This is what
//   gates the next chronological task unlocking; a skip still lets the day
//   move forward.
// - "Completed" (real adherence): the client actually performed the task.
//   Only true completion counts toward computeDailyCompletionPercent. A
//   client who accounted for every task but only completed three of four
//   must see less than 100%, not a false "fully complete" day.

function isMealResolved(selection: AppState["meals"][MealPeriod]): boolean {
  return !!selection && selection.source !== "planned-later";
}

export function computeDailyCompletionPercent(state: AppState): number {
  const checks: boolean[] = [
    state.morningWeight.weightLb !== null,
    isMealCounted(state.meals.breakfast),
    state.workoutSession.status === "completed",
    isMealCounted(state.meals.postWorkout),
    isMealCounted(state.meals.lunch),
    state.cardio.status === "completed",
    isMealCounted(state.meals.dinner),
    isMealCounted(state.meals.snack),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

export function isDailyComplete(state: AppState): boolean {
  return computeDailyCompletionPercent(state) === 100;
}

// ---------------------------------------------------------------------------
// Timeline task state derivation
// ---------------------------------------------------------------------------

const TASK_LABELS: Record<DailyTaskId, string> = {
  "morning-weight": "Morning weight",
  breakfast: "Breakfast",
  "workout-window": "Recommended workout window",
  workout: PUSH_WORKOUT.name,
  "post-workout-meal": MEAL_PERIOD_LABELS.postWorkout,
  lunch: "Lunch",
  cardio: `Cardio — ${CARDIO_TARGET.activity}`,
  dinner: "Dinner",
  snack: "Snack",
  "daily-completion": "Daily completion",
};

function weightResolved(state: AppState): boolean {
  return state.morningWeight.weightLb !== null || state.morningWeight.skipped;
}

function workoutResolved(state: AppState): boolean {
  return state.workoutSession.status === "completed" || state.workoutSession.status === "skipped";
}

function hasUnresolvedReview(state: AppState): boolean {
  return state.reviewRequests.some((r) => !r.resolved);
}

function mealState(selection: AppState["meals"][MealPeriod], locked: boolean): DailyTaskState {
  if (locked) return "locked";
  if (!selection) return "recommended-now";
  if (selection.source === "skipped") return "skipped";
  if (selection.source === "planned-later") return "upcoming";
  return "completed";
}

export function deriveTaskStates(state: AppState): DailyTask[] {
  const weightDone = weightResolved(state);
  const breakfastResolved = isMealResolved(state.meals.breakfast);
  const workoutDone = workoutResolved(state);
  const postWorkoutResolved = isMealResolved(state.meals.postWorkout);
  const lunchResolved = isMealResolved(state.meals.lunch);
  const dinnerResolved = isMealResolved(state.meals.dinner);

  const states: Record<DailyTaskId, DailyTaskState> = {
    "morning-weight": weightDone ? "completed" : "recommended-now",

    breakfast: mealState(state.meals.breakfast, false),

    "workout-window": (() => {
      if (!breakfastResolved) return "locked";
      if (state.workoutWindow.status === "declined") return "skipped";
      if (state.workoutSession.status !== "not-started") return "completed";
      // "activated" just means the countdown has started — the task is
      // still awaiting the client's choice, so it stays interactive until
      // they actually pick a time or the workout begins.
      if (state.workoutWindow.status === "rescheduled") return "completed";
      return "recommended-now";
    })(),

    workout: (() => {
      if (!breakfastResolved || state.workoutWindow.status === "pending") return "locked";
      if (state.workoutWindow.status === "declined") return "skipped";
      if (state.workoutSession.status === "completed") {
        if (hasUnresolvedReview(state)) return "awaiting-review";
        // A session that includes any skipped work is submitted, not fully
        // completed — see WorkoutSummary.fullyCompleted.
        return state.workoutSession.summary?.fullyCompleted ? "completed" : "partially-completed";
      }
      if (state.workoutSession.status === "skipped") return "skipped";
      if (state.workoutSession.status === "in-progress") return "in-progress";
      if (state.workoutWindow.scheduleChangeChoice === "not-sure-yet") return "needs-attention";
      if (
        state.workoutWindow.status === "rescheduled" &&
        state.workoutWindow.scheduleChangeChoice !== "earlier-than-planned"
      ) {
        return "upcoming";
      }
      return "recommended-now";
    })(),

    "post-workout-meal": mealState(state.meals.postWorkout, !workoutDone),

    lunch: mealState(state.meals.lunch, !postWorkoutResolved),

    cardio: (() => {
      if (state.cardio.status === "completed") return "completed";
      if (state.cardio.status === "skipped") return "skipped";
      if (state.cardio.status === "in-progress") return "in-progress";
      return workoutDone ? "recommended-now" : "upcoming";
    })(),

    dinner: mealState(state.meals.dinner, !lunchResolved),

    snack: mealState(state.meals.snack, !dinnerResolved),

    "daily-completion": isDailyComplete(state) ? "completed" : "locked",
  };

  const order: DailyTaskId[] = [
    "morning-weight",
    "breakfast",
    "workout-window",
    "workout",
    "post-workout-meal",
    "lunch",
    "cardio",
    "dinner",
    "snack",
    "daily-completion",
  ];

  return order.map((id) => ({ id, label: TASK_LABELS[id], state: states[id] }));
}

export function getNextActionTaskId(tasks: DailyTask[]): DailyTaskId | null {
  const priority: DailyTaskState[] = ["needs-attention", "in-progress", "recommended-now"];
  for (const state of priority) {
    const task = tasks.find((t) => t.state === state);
    if (task) return task.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isValidWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 60 && value <= 600;
}

export function isValidMacro(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 3000;
}
