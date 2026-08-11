// Centralized adaptive daily planner.
//
// This is the ONE place Today's schedule, item statuses, and next action are
// decided — components read the result and render it; none of them contain
// their own scheduling rules (see the Today-screen components under
// components/today/). The function is pure and deterministic: same
// AppState + training plan + "now" always produces the same result, which
// is what makes it independently testable (see verify-planner.mts).
//
// Every status/label here is derived strictly from real logged data. This
// module must never mark something completed, skipped, or missed that the
// client didn't actually do — see the adaptability rules in the Phase 3
// spec this implements.

import { CARDIO_TARGET, MEAL_OPTIONS, NUTRITION_TARGETS, PUSH_WORKOUT } from "../mock-data.ts";
import { resolvePlannedDateTime } from "./training-plan.ts";
import { comfortableTrainingWindow, mealTimingProfileForMacros, mealTimingProfileForOption } from "./meal-timing.ts";
import type { AppState } from "../state";
import type { MacroValues, MealOption, MealPeriod, MealSelection } from "../types";
import type { DailyPlanResult, DailyTrainingPlan, PlannerItem, PlannerItemStatus } from "./types";

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isMealCounted(selection: MealSelection | undefined): boolean {
  return !!selection && (selection.source === "option" || selection.source === "manual");
}

function selectedOptionFor(period: MealPeriod, selection: MealSelection | undefined): MealOption | null {
  if (!selection || selection.source !== "option" || !selection.optionId) return null;
  return MEAL_OPTIONS[period].find((o) => o.id === selection.optionId) ?? null;
}

function mealItemStatus(selection: MealSelection | undefined): PlannerItemStatus {
  if (!selection) return "recommended";
  if (selection.source === "skipped") return "skipped";
  if (selection.source === "planned-later") return "upcoming";
  return "completed";
}

const MEAL_LABELS: Record<MealPeriod, string> = {
  breakfast: "Breakfast",
  postWorkout: "Post-workout meal",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

interface BuildDailyPlanInput {
  state: AppState;
  trainingPlan: DailyTrainingPlan | null;
  now: Date;
  nutritionTotals: MacroValues;
}

export function buildDailyPlan({ state, trainingPlan, now, nutritionTotals }: BuildDailyPlanInput): DailyPlanResult {
  const items: PlannerItem[] = [];

  const weightDone = state.morningWeight.weightLb !== null || state.morningWeight.skipped;
  items.push({
    id: "morning-weight",
    kind: "morning-weight",
    title: "Morning weight",
    status: weightDone ? "completed" : "recommended",
    isNextAction: false,
    actionLabel: weightDone ? undefined : "Log weight",
  });

  // --- Breakfast (also the app's natural pre-workout meal — see the
  // meal-timing module doc comment for why there's no separate period). ---
  const breakfastSelection = state.meals.breakfast;
  const breakfastOption = selectedOptionFor("breakfast", breakfastSelection);
  const breakfastStatus = mealItemStatus(breakfastSelection);
  let breakfastExplanation: string | undefined;

  if (
    trainingPlan?.status === "scheduled" &&
    isMealCounted(breakfastSelection) &&
    breakfastSelection?.completedAtIso
  ) {
    const plannedAt = resolvePlannedDateTime(trainingPlan, now);
    const profile = breakfastOption
      ? mealTimingProfileForOption(breakfastOption)
      : mealTimingProfileForMacros(breakfastSelection.macros ?? null);
    if (plannedAt) {
      const leadMinutesAvailable = Math.round(
        (plannedAt.getTime() - new Date(breakfastSelection.completedAtIso).getTime()) / 60_000
      );
      if (leadMinutesAvailable >= 0 && leadMinutesAvailable < profile.preTrainingLeadMinLow) {
        breakfastExplanation =
          "This is a larger meal for the time available before training. A lighter option may feel better.";
      }
    }
  } else if (trainingPlan?.status === "scheduled" && breakfastStatus === "recommended") {
    breakfastExplanation = `Eating something beforehand can help fuel your ${trainingPlan.plannedTimeLabel} session.`;
  } else if (
    (!trainingPlan || trainingPlan.status === "unsure") &&
    isMealCounted(breakfastSelection) &&
    breakfastSelection?.completedAtIso
  ) {
    // Training time is unknown — offer a broad, optional window derived
    // from this specific meal rather than a countdown or deadline.
    const profile = breakfastOption
      ? mealTimingProfileForOption(breakfastOption)
      : mealTimingProfileForMacros(breakfastSelection.macros ?? null);
    const window = comfortableTrainingWindow(breakfastSelection.completedAtIso, profile);
    breakfastExplanation = `Comfortable training window: ${formatClockTime(window.startIso)}–${formatClockTime(
      window.endIso
    )}. Estimated from this meal's size and composition — adjust based on how you feel.`;
  }

  items.push({
    id: "breakfast",
    kind: "meal",
    title: MEAL_LABELS.breakfast,
    status: breakfastStatus,
    timeLabel: breakfastSelection?.completedAtIso ? `Logged at ${formatClockTime(breakfastSelection.completedAtIso)}` : undefined,
    explanation: breakfastExplanation,
    isNextAction: false,
    actionLabel: breakfastStatus === "recommended" ? "Choose breakfast" : undefined,
    href: "#breakfast",
  });

  // --- Workout ---
  const session = state.workoutSession;
  const plannedAt = trainingPlan ? resolvePlannedDateTime(trainingPlan, now) : null;
  const isRestDay = trainingPlan?.status === "rest_day";
  let workoutStatus: PlannerItemStatus;
  let workoutTimeLabel: string | undefined;
  let workoutExplanation: string | undefined;
  let workoutActionLabel: string | undefined;

  if (session.status === "completed") {
    workoutStatus = "completed";
    workoutExplanation = session.summary?.headline;
  } else if (session.status === "skipped") {
    workoutStatus = "skipped";
  } else if (session.status === "in-progress") {
    workoutStatus = "in-progress";
    workoutActionLabel = "Resume workout";
  } else if (isRestDay) {
    // Rest day changes today's schedule, but the prescribed workout is
    // truthfully preserved as unresolved — never marked complete, skipped,
    // or deleted.
    workoutStatus = "upcoming";
    workoutExplanation = `Today is set as a rest day. ${PUSH_WORKOUT.name} stays available if your plan changes.`;
    workoutActionLabel = "Begin workout anyway";
  } else if (plannedAt && now.getTime() >= plannedAt.getTime()) {
    workoutStatus = "recommended";
    workoutTimeLabel = `Training was planned for ${trainingPlan?.plannedTimeLabel}.`;
    workoutActionLabel = "Begin workout";
  } else if (plannedAt) {
    workoutStatus = "upcoming";
    workoutTimeLabel = `Planned for ${trainingPlan?.plannedTimeLabel}`;
    workoutActionLabel = "Begin workout";
  } else {
    workoutStatus = "recommended";
    workoutActionLabel = "Begin workout";
  }

  items.push({
    id: "workout",
    kind: "workout",
    title: PUSH_WORKOUT.name,
    status: workoutStatus,
    timeLabel: workoutTimeLabel,
    explanation: workoutExplanation,
    isNextAction: false,
    actionLabel: workoutActionLabel,
    href: "/training/workout",
  });

  // --- Post-workout meal ---
  const workoutResolved = session.status === "completed" || session.status === "skipped";
  const postWorkoutSelection = state.meals.postWorkout;
  const postWorkoutStatus: PlannerItemStatus = !workoutResolved && !postWorkoutSelection ? "upcoming" : mealItemStatus(postWorkoutSelection);
  items.push({
    id: "post-workout-meal",
    kind: "meal",
    title: MEAL_LABELS.postWorkout,
    status: postWorkoutStatus,
    timeLabel: postWorkoutSelection?.completedAtIso ? `Logged at ${formatClockTime(postWorkoutSelection.completedAtIso)}` : undefined,
    explanation: !workoutResolved && !postWorkoutSelection ? "Available once today's workout is completed or skipped." : undefined,
    isNextAction: false,
    actionLabel: postWorkoutStatus === "recommended" ? "Log post-workout meal" : undefined,
    href: "#post-workout-meal",
  });

  // --- Lunch ---
  const lunchSelection = state.meals.lunch;
  items.push({
    id: "lunch",
    kind: "meal",
    title: MEAL_LABELS.lunch,
    status: mealItemStatus(lunchSelection),
    timeLabel: lunchSelection?.completedAtIso ? `Logged at ${formatClockTime(lunchSelection.completedAtIso)}` : undefined,
    isNextAction: false,
    actionLabel: !lunchSelection ? "View lunch options" : undefined,
    href: "#lunch",
  });

  // --- Cardio ---
  let cardioStatus: PlannerItemStatus;
  if (state.cardio.status === "completed") cardioStatus = "completed";
  else if (state.cardio.status === "skipped") cardioStatus = "skipped";
  else if (state.cardio.status === "in-progress") cardioStatus = "in-progress";
  else cardioStatus = workoutResolved ? "recommended" : "upcoming";
  items.push({
    id: "cardio",
    kind: "cardio",
    title: `Cardio — ${CARDIO_TARGET.activity}`,
    status: cardioStatus,
    isNextAction: false,
    actionLabel: cardioStatus === "recommended" ? "Start cardio" : undefined,
    href: "#cardio",
  });

  // --- Dinner ---
  const dinnerSelection = state.meals.dinner;
  items.push({
    id: "dinner",
    kind: "meal",
    title: MEAL_LABELS.dinner,
    status: mealItemStatus(dinnerSelection),
    timeLabel: dinnerSelection?.completedAtIso ? `Logged at ${formatClockTime(dinnerSelection.completedAtIso)}` : undefined,
    isNextAction: false,
    actionLabel: !dinnerSelection ? "View dinner options" : undefined,
    href: "#dinner",
  });

  // --- Snack (optional) ---
  const snack = evaluateSnackRecommendation(state, nutritionTotals, now);
  const snackSelection = state.meals.snack;
  if (snackSelection || snack.show) {
    items.push({
      id: "snack",
      kind: "meal",
      title: "Snack (optional)",
      status: snackSelection ? mealItemStatus(snackSelection) : "optional",
      timeLabel: snackSelection?.completedAtIso ? `Logged at ${formatClockTime(snackSelection.completedAtIso)}` : undefined,
      explanation: !snackSelection ? snack.reason : undefined,
      isNextAction: false,
      actionLabel: !snackSelection ? "View snack options" : undefined,
      href: "#snack",
    });
  }

  // --- Review today (only once the day is genuinely fully resolved) ---
  const dayFullyResolved =
    weightDone &&
    !!breakfastSelection &&
    breakfastSelection.source !== "planned-later" &&
    workoutResolved &&
    !!postWorkoutSelection &&
    postWorkoutSelection.source !== "planned-later" &&
    !!lunchSelection &&
    lunchSelection.source !== "planned-later" &&
    (state.cardio.status === "completed" || state.cardio.status === "skipped") &&
    !!dinnerSelection &&
    dinnerSelection.source !== "planned-later";

  if (dayFullyResolved) {
    items.push({
      id: "review",
      kind: "review",
      title: "Review today",
      status: "completed",
      explanation: "Nice work staying consistent today.",
      isNextAction: false,
    });
  }

  // --- Next action: one centralized, prioritized decision ---
  const nextAction = selectNextAction(items, trainingPlan);
  if (nextAction) {
    nextAction.isNextAction = true;
  }

  return { items, nextAction, snack };
}

function selectNextAction(items: PlannerItem[], trainingPlan: DailyTrainingPlan | null): PlannerItem | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const workout = byId.get("workout");
  const isRestDay = trainingPlan?.status === "rest_day";

  if (workout?.status === "in-progress") return workout;

  const postWorkout = byId.get("post-workout-meal");
  if (workout && (workout.status === "completed" || workout.status === "skipped") && postWorkout?.status === "recommended") {
    return postWorkout;
  }

  const morningWeight = byId.get("morning-weight");
  if (morningWeight && morningWeight.status !== "completed") return morningWeight;

  if (!trainingPlan) {
    return {
      id: "training-time",
      kind: "training-time",
      title: "Enter your training time",
      status: "recommended",
      isNextAction: false,
      actionLabel: "Enter your training time",
    };
  }

  const breakfast = byId.get("breakfast");
  if (breakfast && breakfast.status === "recommended") return breakfast;

  // A rest day never pushes the workout forward as the dominant action —
  // it stays available (see the workout item above) without driving focus.
  if (workout && !isRestDay && workout.status === "recommended") return workout;

  const lunch = byId.get("lunch");
  if (lunch && lunch.status === "recommended" && postWorkout && postWorkout.status !== "upcoming") return lunch;

  const dinner = byId.get("dinner");
  if (dinner && dinner.status === "recommended" && lunch?.status !== "recommended") return dinner;

  const cardio = byId.get("cardio");
  if (cardio && cardio.status === "recommended") return cardio;

  const review = byId.get("review");
  if (review) return review;

  return null;
}

// ---------------------------------------------------------------------------
// Optional snack recommendation
// ---------------------------------------------------------------------------

const SNACK_GAP_THRESHOLD_MIN = 240; // 4 hours
const MIN_MEANINGFUL_GAP_RATIO = 0.2; // 20% of target remaining

function evaluateSnackRecommendation(state: AppState, totals: MacroValues, now: Date): { show: boolean; reason?: string } {
  const remainingCalRatio = Math.max(0, NUTRITION_TARGETS.calories - totals.calories) / NUTRITION_TARGETS.calories;
  const remainingProteinRatio = Math.max(0, NUTRITION_TARGETS.proteinG - totals.proteinG) / NUTRITION_TARGETS.proteinG;

  const resolvedMealTimes: number[] = (["breakfast", "postWorkout", "lunch", "dinner"] as MealPeriod[])
    .map((period) => state.meals[period])
    .filter((m): m is MealSelection => !!m && isMealCounted(m) && !!m.completedAtIso)
    .map((m) => new Date(m.completedAtIso as string).getTime())
    .sort((a, b) => a - b);

  for (let i = 0; i < resolvedMealTimes.length - 1; i++) {
    const gapMin = (resolvedMealTimes[i + 1] - resolvedMealTimes[i]) / 60_000;
    if (gapMin >= SNACK_GAP_THRESHOLD_MIN) {
      return { show: true, reason: "Bridges a long gap between two of today's meals." };
    }
  }

  if (resolvedMealTimes.length > 0) {
    const lastMealMs = resolvedMealTimes[resolvedMealTimes.length - 1];
    const minutesSinceLastMeal = (now.getTime() - lastMealMs) / 60_000;
    if (minutesSinceLastMeal >= SNACK_GAP_THRESHOLD_MIN && (!state.meals.dinner || state.meals.dinner.source === "planned-later")) {
      return { show: true, reason: "It's been a while since your last logged meal." };
    }
  }

  const unresolvedMeals = (["lunch", "dinner"] as MealPeriod[]).filter(
    (p) => !state.meals[p] || state.meals[p]?.source === "planned-later"
  ).length;
  if (
    remainingCalRatio >= MIN_MEANINGFUL_GAP_RATIO &&
    remainingProteinRatio >= MIN_MEANINGFUL_GAP_RATIO &&
    unresolvedMeals <= 1
  ) {
    return { show: true, reason: "Could help close today's remaining nutrition gap." };
  }

  return { show: false };
}
