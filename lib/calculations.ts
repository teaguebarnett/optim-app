import { CARDIO_TARGET, MEAL_PERIOD_LABELS, NUTRITION_TARGETS, resolveWorkoutAvailabilityForDay } from "./mock-data.ts";
import { resolvePlannedDateTime } from "./planning/training-plan.ts";
import { deriveProgramWeek } from "./scheduling/enrollment.ts";
import { localDateDayOfWeek } from "./shared/local-date.ts";
import type { AppState } from "./state";
import type { DailyTrainingPlan } from "./planning/types";
import type {
  DailyTask,
  DailyTaskId,
  DailyTaskState,
  DayOfWeek,
  MacroValues,
  MealPeriod,
  MealSelection,
  NutritionTargets,
} from "./types";

// The one canonical ordering of meal periods within a day — every screen
// that needs to reason about "which meal comes before which" (nutrition
// totals, remaining-meal counts, the meal-sequence warning) reads from this
// single array rather than re-declaring its own copy.
export const MEAL_ORDER: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner", "snack"];

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------

export type TimeOfDay = "morning" | "afternoon" | "evening";

/** Phase 4.1 corrective — takes the client-local hour (0-23) directly
 * rather than a Date, so callers must resolve it via
 * lib/shared/local-date.ts's resolveClientLocalTime24 against the client's
 * configured timezone instead of the machine's own via Date.getHours(). */
export function getTimeOfDay(hour24: number): TimeOfDay {
  if (hour24 < 12) return "morning";
  if (hour24 < 17) return "afternoon";
  return "evening";
}

export interface GreetingWeekContext {
  /** The client's real program week for today, or null when today falls
   * outside the enrollment's active weeks — see
   * lib/scheduling/enrollment.ts's deriveProgramWeek. */
  programWeek: number | null;
  /** True only when today is the enrollment's configured start-of-week day
   * (see lib/shared/local-date.ts's startOfLocalWeek). "Let's start Week X
   * strong" is only ever shown then, never on every day of the week. */
  isStartOfWeek: boolean;
}

/**
 * Phase 4.1 corrective — the subline must name the real client-local
 * weekday and never claim "Let's start Week X" on a day that isn't
 * actually the configured start of that week. dayOfWeek/timeOfDay are
 * supplied by the caller (see components/today/day-header.tsx), derived
 * from the same client-local date/timezone utilities the rest of Phase 4.1
 * uses — this function has no notion of "now" or machine time at all.
 */
export function getGreeting(
  dayOfWeek: DayOfWeek,
  timeOfDay: TimeOfDay,
  clientName: string,
  week: GreetingWeekContext
): { headline: string; subline: string } {
  const greetingWord = timeOfDay === "morning" ? "Good morning" : timeOfDay === "afternoon" ? "Good afternoon" : "Good evening";
  const subline =
    week.isStartOfWeek && week.programWeek !== null
      ? `Happy ${dayOfWeek}. Let's start Week ${week.programWeek} strong.`
      : week.programWeek !== null
        ? `Happy ${dayOfWeek}. Week ${week.programWeek} is underway.`
        : `Happy ${dayOfWeek}.`;
  return {
    headline: `${greetingWord}, ${clientName}.`,
    subline,
  };
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

function isMealCounted(selection: AppState["meals"][MealPeriod]): boolean {
  return !!selection && (selection.source === "option" || selection.source === "manual" || selection.source === "photo-estimate");
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

/** `targets` defaults to the shared NUTRITION_TARGETS constant so every
 * existing call site keeps its exact prior behavior; callers that have a
 * specific client's own coach-configured targets (see AppState.
 * nutritionTargets) pass them explicitly instead. */
export function computeRemaining(totals: MacroValues, targets: NutritionTargets = NUTRITION_TARGETS): RemainingTargets {
  return {
    calories: Math.max(0, targets.calories - totals.calories),
    proteinG: Math.max(0, targets.proteinG - totals.proteinG),
    carbsG: Math.max(0, targets.carbsG - totals.carbsG),
    fatG: Math.max(0, targets.fatG - totals.fatG),
  };
}

export function countRemainingMeals(meals: AppState["meals"]): number {
  return MEAL_ORDER.filter((period) => !meals[period]).length;
}

/**
 * Phase 3.1.1 §1 — finds the first meal period, in canonical order, that
 * comes before `period` and is still genuinely incomplete: never logged, or
 * explicitly deferred ("planned for later"). A period the client logged
 * (option/manual) or legitimately skipped never blocks a later one — nor
 * does a period that isn't part of today's plan at all (e.g. an optional
 * snack that was never shown). Generic over any pair of periods, not
 * hardcoded to lunch/dinner. Returns null when nothing earlier is pending.
 */
export function findEarliestIncompleteMealBefore(
  meals: Partial<Record<MealPeriod, MealSelection>>,
  period: MealPeriod,
  periodsInPlan: MealPeriod[]
): MealPeriod | null {
  for (const candidate of MEAL_ORDER) {
    if (candidate === period) return null;
    if (!periodsInPlan.includes(candidate)) continue;
    const selection = meals[candidate];
    if (!selection || selection.source === "planned-later") {
      return candidate;
    }
  }
  return null;
}

/** Shown wherever a client's own targets would appear but no nutrition
 * plan is assigned (AppState.nutritionTargets === null). */
export const NUTRITION_NOT_ASSIGNED_LABEL = "Nutrition not assigned";

export function nutritionStatusMessage(totals: MacroValues, meals: AppState["meals"], targets: NutritionTargets | null = NUTRITION_TARGETS): string {
  // No assigned targets: never judge progress against invented numbers.
  if (!targets) return `${NUTRITION_NOT_ASSIGNED_LABEL} yet — your coach will set your daily targets.`;
  const remainingMeals = countRemainingMeals(meals);
  const calorieRatio = totals.calories / targets.calories;
  const proteinRatio = totals.proteinG / targets.proteinG;

  // Phase 4.4B-2.1 correction — the true zero/unentered state must never
  // claim progress that hasn't happened. "Off to a strong start" falsely
  // congratulates a day where nothing has been logged yet.
  if (totals.calories === 0) return "Your nutrition targets are set for today.";
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
  workout: "Workout",
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
  return (
    state.workoutSession.status === "completed" ||
    state.workoutSession.status === "skipped" ||
    state.workoutSession.status === "ended-early"
  );
}

/** Exported so lib/planning/planner.ts's dayFullyResolved can reuse this
 * exact predicate — a day with a real pending coach review (e.g. a pain
 * report flagged during a completed workout) must never present itself as
 * genuinely finished ("review today," nothing left to see) just because
 * every individual item was logged. See planner.ts's own use for why. */
export function hasUnresolvedReview(state: AppState): boolean {
  return state.reviewRequests.some((r) => !r.resolved);
}

// Phase 3 removed rigid chronological locking: an earlier meal being missed
// must not block a later one (see lib/planning/planner.ts for the adaptive
// schedule that replaced the old locked-checklist presentation on Today).
// This function is kept for screens that still read a coarse per-task
// status (e.g. the Training tab's workout StatePill) — it must stay
// consistent with that flexible behavior rather than contradict it, so no
// task here reports "locked" for something the client can actually do.
function mealState(selection: AppState["meals"][MealPeriod], resolvedBefore: boolean): DailyTaskState {
  if (!selection) return resolvedBefore ? "recommended-now" : "upcoming";
  if (selection.source === "skipped") return "skipped";
  if (selection.source === "planned-later") return "upcoming";
  return "completed";
}

/**
 * @param trainingPlan Optional — when the client has scheduled a training
 * time in the future, the workout task reports "upcoming" instead of
 * "recommended-now" so its StatePill never contradicts the adaptive
 * planner's own "Planned for {time}" caption (see lib/planning/planner.ts,
 * which applies the identical rule). Omitted callers keep the pre-Phase-3
 * behavior (always "recommended-now" once not-started).
 */
export function deriveTaskStates(
  state: AppState,
  trainingPlan?: DailyTrainingPlan | null,
  now: Date = new Date()
): DailyTask[] {
  const weightDone = weightResolved(state);
  const workoutDone = workoutResolved(state);
  const postWorkoutResolved = isMealResolved(state.meals.postWorkout);
  const lunchResolved = isMealResolved(state.meals.lunch);
  const dinnerResolved = isMealResolved(state.meals.dinner);
  const plannedWorkoutAt = trainingPlan ? resolvePlannedDateTime(trainingPlan, now) : null;

  const states: Record<DailyTaskId, DailyTaskState> = {
    "morning-weight": weightDone ? "completed" : "recommended-now",

    breakfast: mealState(state.meals.breakfast, true),

    workout: (() => {
      if (state.workoutSession.status === "completed") {
        if (hasUnresolvedReview(state)) return "awaiting-review";
        // A session that includes any skipped work is submitted, not fully
        // completed — see WorkoutSummary.fullyCompleted.
        return state.workoutSession.summary?.fullyCompleted ? "completed" : "partially-completed";
      }
      // Ended early with at least one completed working set — never
      // reported as "skipped." See Phase 3.1 §4.
      if (state.workoutSession.status === "ended-early") {
        return hasUnresolvedReview(state) ? "awaiting-review" : "partially-completed";
      }
      if (state.workoutSession.status === "skipped") return "skipped";
      if (state.workoutSession.status === "in-progress") return "in-progress";

      // Phase 4.1 corrective (Phase 4.4B-1.1: now resolved through the one
      // shared resolveWorkoutAvailabilityForDay, so Today and Training can
      // never disagree — see that function's doc) — a genuinely scheduled
      // training day whose catalog has no real, loggable content (e.g.
      // Friday's "Upper Workout" label, which has no matching entry in
      // WORKOUTS_BY_ID) must never present itself as an actionable Push
      // Workout session under a different label. This is the one real,
      // honest exception to "no task here reports locked for something the
      // client can actually do" above — here the client genuinely can't,
      // because no real session exists for today. This is strictly a data-
      // availability fact, never influenced by the client's training-time
      // decision (trainingPlan.status) — selecting or changing a time can
      // never itself lock or unlock a workout. A client who has explicitly
      // declared today a rest day keeps the existing "optional, begin
      // anyway" treatment below regardless of what the schedule says.
      const clientDeclaredRest = trainingPlan?.status === "rest_day";
      if (
        resolveWorkoutAvailabilityForDay(
          localDateDayOfWeek(state.dateIso),
          clientDeclaredRest,
          state.assignedProgram,
          deriveProgramWeek(state.programEnrollment, state.dateIso)
        ).isUnavailable
      ) {
        return "locked";
      }

      if (plannedWorkoutAt && now.getTime() < plannedWorkoutAt.getTime()) return "upcoming";
      return "recommended-now";
    })(),

    "post-workout-meal": mealState(state.meals.postWorkout, workoutDone),

    lunch: mealState(state.meals.lunch, postWorkoutResolved),

    cardio: (() => {
      if (state.cardio.status === "completed") return "completed";
      // Distinct from "skipped" — some real minutes were logged before the
      // client stopped. See Phase 4.1's cardio-partial correction.
      if (state.cardio.status === "partial") return "partially-completed";
      if (state.cardio.status === "skipped") return "skipped";
      if (state.cardio.status === "in-progress") return "in-progress";
      return workoutDone ? "recommended-now" : "upcoming";
    })(),

    dinner: mealState(state.meals.dinner, lunchResolved),

    snack: mealState(state.meals.snack, dinnerResolved),

    "daily-completion": isDailyComplete(state) ? "completed" : "locked",
  };

  const order: DailyTaskId[] = [
    "morning-weight",
    "breakfast",
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
