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

import { cardioPrescriptionForClient, MEAL_OPTIONS, resolveWorkoutAvailabilityForDay } from "../mock-data.ts";
import { resolvePlannedDateTime } from "./training-plan.ts";
import { comfortableTrainingWindow, mealTimingProfileForMacros, mealTimingProfileForOption } from "./meal-timing.ts";
import { buildMealSchedule } from "./meal-schedule.ts";
import { hasUnresolvedReview } from "../calculations.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import { deriveProgramWeek } from "../scheduling/enrollment.ts";
import type { AppState } from "../state";
import type { MacroValues, MealOption, MealPeriod, MealSelection } from "../types";
import type { DailyMealSchedule, DailyPlanResult, DailyTrainingPlan, MealScheduleEntry, PlannerItem, PlannerItemStatus } from "./types";

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isMealCounted(selection: MealSelection | undefined): boolean {
  return !!selection && (selection.source === "option" || selection.source === "manual" || selection.source === "photo-estimate");
}

/** Meal-timing heuristics need SOME session-length estimate even on a day
 * with no real, resolved workout (rest day, no assignment yet) — a plain,
 * generic estimate, never PUSH_WORKOUT's specific duration borrowed as a
 * stand-in for a real client's own program. */
const DEFAULT_WORKOUT_DURATION_ESTIMATE_MIN = 60;

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

/** Generalizes the old breakfast-only "is this meal cutting it close before
 * training" / "eat something beforehand" copy to whichever meal the
 * schedule actually assigned the pre-workout role — never hardcoded to a
 * specific period. */
function preWorkoutRoleExplanation(
  period: MealPeriod,
  selection: MealSelection | undefined,
  entry: MealScheduleEntry | undefined,
  trainingPlan: DailyTrainingPlan | null,
  now: Date
): string | undefined {
  if (!entry || entry.role !== "pre-workout" || trainingPlan?.status !== "scheduled") return undefined;
  if (isMealCounted(selection) && selection?.completedAtIso) {
    const plannedAt = resolvePlannedDateTime(trainingPlan, now);
    if (!plannedAt) return undefined;
    const option = selectedOptionFor(period, selection);
    const profile = option ? mealTimingProfileForOption(option) : mealTimingProfileForMacros(selection.macros ?? null);
    const leadMinutesAvailable = Math.round((plannedAt.getTime() - new Date(selection.completedAtIso).getTime()) / 60_000);
    if (leadMinutesAvailable >= 0 && leadMinutesAvailable < profile.preTrainingLeadMinLow) {
      return "This is a larger meal for the time available before training. A lighter option may feel better.";
    }
    return undefined;
  }
  return `Eating something beforehand can help fuel your ${trainingPlan.plannedTimeLabel} session.`;
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

  // Resolved up front (Phase 4.1 corrective — "today's workout" must be
  // resolved against the real training schedule, keyed by the client-local
  // day of week derived from state.dateIso, not always assumed to be Push
  // Workout) so the meal schedule below can anchor to this client's real
  // workout duration rather than a hardcoded one. Resolved through the one
  // shared resolveWorkoutAvailabilityForDay (Phase 4.4B-1.1) — a genuinely
  // scheduled training day whose catalog has no real, loggable content (e.g.
  // Friday's "Upper Workout" label) never silently substitutes Push
  // Workout's content under a different name, and this can never disagree
  // with what Today or Training decide for the exact same day.
  const todayDayOfWeek = localDateDayOfWeek(state.dateIso);
  const clientDeclaredRest = trainingPlan?.status === "rest_day";
  const availability = resolveWorkoutAvailabilityForDay(
    todayDayOfWeek,
    clientDeclaredRest,
    state.assignedProgram,
    deriveProgramWeek(state.programEnrollment, state.dateIso)
  );
  const scheduledWithoutDetail = availability.isUnavailable;
  const isRestDay = clientDeclaredRest || (!clientDeclaredRest && !trainingPlan && availability.scheduleEntry?.type === "rest");
  const workoutDisplayName = availability.displayName;

  // --- Full-day meal schedule (Phase 3.1 §2) — computed once, up front, so
  // every meal item below (and the Nutrition page, via mealSchedule on the
  // returned result) reads the exact same recommended times. ---
  const snack = evaluateSnackRecommendation(state, nutritionTotals, now);
  const snackSelection = state.meals.snack;
  const showSnack = !!snackSelection || snack.show;
  const periods: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner"];
  if (showSnack) periods.push("snack");

  const mealSchedule: DailyMealSchedule = buildMealSchedule({
    trainingPlan,
    now,
    meals: state.meals,
    periods,
    workoutEstimatedDurationMin: availability.workout?.estimatedDurationMin ?? DEFAULT_WORKOUT_DURATION_ESTIMATE_MIN,
  });

  // --- Breakfast ---
  const breakfastSelection = state.meals.breakfast;
  const breakfastStatus = mealItemStatus(breakfastSelection);
  const breakfastEntry = mealSchedule.entries.breakfast;
  let breakfastExplanation = preWorkoutRoleExplanation("breakfast", breakfastSelection, breakfastEntry, trainingPlan, now);
  if (
    !breakfastExplanation &&
    !mealSchedule.hasAnchor &&
    trainingPlan?.status !== "rest_day" &&
    isMealCounted(breakfastSelection) &&
    breakfastSelection?.completedAtIso
  ) {
    // Training time is unknown — offer a broad, optional window derived
    // from this specific meal rather than a countdown or deadline.
    const breakfastOption = selectedOptionFor("breakfast", breakfastSelection);
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
    timeLabel: breakfastEntry?.timeLabel ?? undefined,
    explanation: breakfastExplanation,
    isNextAction: false,
    actionLabel: breakfastStatus === "recommended" ? "Choose breakfast" : undefined,
    href: "#breakfast",
  });

  // --- Workout ---
  const session = state.workoutSession;
  const plannedAt = trainingPlan ? resolvePlannedDateTime(trainingPlan, now) : null;

  let workoutStatus: PlannerItemStatus;
  let workoutTimeLabel: string | undefined;
  let workoutExplanation: string | undefined;
  let workoutActionLabel: string | undefined;
  let workoutHref: string | undefined = "/training/workout";

  if (session.status === "completed") {
    workoutStatus = "completed";
    workoutExplanation = session.summary?.headline;
  } else if (session.status === "ended-early") {
    workoutStatus = "partially-completed";
    workoutExplanation = session.summary?.headline ?? "Ended early — completed sets and RPE are saved.";
  } else if (session.status === "skipped") {
    workoutStatus = "skipped";
  } else if (session.status === "in-progress") {
    workoutStatus = "in-progress";
    workoutActionLabel = "Resume workout";
  } else if (scheduledWithoutDetail) {
    // Honest "scheduled but detail unavailable" state — never a fabricated
    // workout, never Push Workout's content reused under a different label.
    workoutStatus = "optional";
    workoutExplanation = `Workout details unavailable — ${workoutDisplayName} is scheduled today, but full session detail isn't available yet.`;
    workoutHref = undefined;
  } else if (isRestDay) {
    // Rest day changes today's schedule, but the prescribed workout is
    // truthfully preserved as unresolved — never marked complete, skipped,
    // or deleted.
    workoutStatus = "upcoming";
    workoutExplanation = clientDeclaredRest
      ? `Today is set as a rest day. ${workoutDisplayName} stays available if your plan changes.`
      : `Today is a scheduled rest day. ${workoutDisplayName} stays available if you'd like to train anyway.`;
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
    title: session.resolvedWorkout?.name ?? workoutDisplayName,
    status: workoutStatus,
    timeLabel: workoutTimeLabel,
    explanation: workoutExplanation,
    isNextAction: false,
    actionLabel: workoutActionLabel,
    href: workoutHref,
  });

  // --- Post-workout meal ---
  // "ended-early" still counts as resolved for scheduling purposes — some
  // training did occur, so a post-workout meal remains appropriate. Only a
  // true "skipped" (zero working sets ever completed) falls back to a
  // generic meal label below — see Phase 3.1 §4.
  const workoutResolved = session.status === "completed" || session.status === "skipped" || session.status === "ended-early";
  const trainingOccurredToday = session.status === "completed" || session.status === "ended-early";
  const postWorkoutSelection = state.meals.postWorkout;
  const postWorkoutEntry = mealSchedule.entries.postWorkout;
  const postWorkoutStatus: PlannerItemStatus = !workoutResolved && !postWorkoutSelection ? "upcoming" : mealItemStatus(postWorkoutSelection);
  items.push({
    id: "post-workout-meal",
    kind: "meal",
    title: trainingOccurredToday || !workoutResolved ? MEAL_LABELS.postWorkout : "Meal",
    status: postWorkoutStatus,
    timeLabel: postWorkoutEntry?.timeLabel ?? undefined,
    explanation: !workoutResolved && !postWorkoutSelection ? "Available once today's workout is completed or skipped." : undefined,
    isNextAction: false,
    actionLabel: postWorkoutStatus === "recommended" ? "Log post-workout meal" : undefined,
    href: "#post-workout-meal",
  });

  // --- Lunch ---
  const lunchSelection = state.meals.lunch;
  const lunchEntry = mealSchedule.entries.lunch;
  items.push({
    id: "lunch",
    kind: "meal",
    title: MEAL_LABELS.lunch,
    status: mealItemStatus(lunchSelection),
    timeLabel: lunchEntry?.timeLabel ?? undefined,
    explanation: preWorkoutRoleExplanation("lunch", lunchSelection, lunchEntry, trainingPlan, now),
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
  const cardioPrescription = cardioPrescriptionForClient(state.clientId);
  const selectedCardioOption =
    cardioPrescription.options.find((o) => o.id === state.cardio.selectedOptionId) ??
    cardioPrescription.options.find((o) => o.isDefault) ??
    cardioPrescription.options[0];
  items.push({
    id: "cardio",
    kind: "cardio",
    title: `Cardio — ${selectedCardioOption.displayName}`,
    status: cardioStatus,
    isNextAction: false,
    actionLabel: cardioStatus === "recommended" ? "Start cardio" : undefined,
    href: "#cardio",
  });

  // --- Dinner ---
  const dinnerSelection = state.meals.dinner;
  const dinnerEntry = mealSchedule.entries.dinner;
  items.push({
    id: "dinner",
    kind: "meal",
    title: MEAL_LABELS.dinner,
    status: mealItemStatus(dinnerSelection),
    timeLabel: dinnerEntry?.timeLabel ?? undefined,
    explanation: preWorkoutRoleExplanation("dinner", dinnerSelection, dinnerEntry, trainingPlan, now),
    isNextAction: false,
    actionLabel: !dinnerSelection ? "View dinner options" : undefined,
    href: "#dinner",
  });

  // --- Snack (optional) ---
  const snackEntry = mealSchedule.entries.snack;
  if (showSnack) {
    items.push({
      id: "snack",
      kind: "meal",
      title: "Snack (optional)",
      status: snackSelection ? mealItemStatus(snackSelection) : "optional",
      timeLabel: snackEntry?.timeLabel ?? undefined,
      explanation: !snackSelection ? snack.reason : undefined,
      isNextAction: false,
      actionLabel: !snackSelection ? "View snack options" : undefined,
      href: "#snack",
    });
  }

  // --- Review today (only once the day is genuinely fully resolved) ---
  // Every item being logged isn't the same as the day being done — a
  // workout that triggered a real pending coach review (e.g. a pain report)
  // must never present itself as "nice work, day complete" while that
  // review is still open. See lib/calculations.ts's hasUnresolvedReview,
  // the same predicate the header's notification badge already uses.
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
    dinnerSelection.source !== "planned-later" &&
    !hasUnresolvedReview(state);

  if (dayFullyResolved) {
    items.push({
      id: "review",
      kind: "review",
      title: "Review today",
      status: "completed",
      explanation: "Nice work staying consistent today.",
      isNextAction: false,
      actionLabel: "Review today",
      href: "#review-today",
    });
  }

  // --- Next action: one centralized, prioritized decision ---
  const nextAction = selectNextAction(items, trainingPlan);
  if (nextAction) {
    nextAction.isNextAction = true;
  }

  return { items, nextAction, snack, mealSchedule };
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
  const targets = state.nutritionTargets;
  const remainingCalRatio = Math.max(0, targets.calories - totals.calories) / targets.calories;
  const remainingProteinRatio = Math.max(0, targets.proteinG - totals.proteinG) / targets.proteinG;

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
