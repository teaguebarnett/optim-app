// Full-day meal scheduler — Phase 3.1 §2.
//
// Pure and deterministic: same training plan + meal state + "now" always
// produces the same schedule (see verify-planner.mts). This is the ONE place
// that turns a known training time into recommended clock times for every
// meal in the day's plan — components read the result; none of them compute
// their own meal timing (Today and Nutrition both read this via
// lib/planning/planner.ts, so they can never drift apart).
//
// What this deliberately does NOT do: invent a wake/sleep time (the app
// doesn't collect one — see DAY_FLOOR/CEILING below, which are generic
// bounds, not a claim about any client's actual routine), fabricate macro
// data, or apply one fixed offset to every meal regardless of size. Meals
// are classified light/medium/heavy from their real macros (see
// categoryFromMacros in meal-timing.ts) and spaced using that category's
// lead-time window.

import { MEAL_OPTIONS } from "../mock-data.ts";
import { categoryFromMacros, mealTimingProfileForMacros } from "./meal-timing.ts";
import { resolvePlannedDateTime } from "./training-plan.ts";
import type { MacroValues, MealPeriod, MealSelection } from "../types";
import type { DailyMealSchedule, DailyTrainingPlan, MealRole, MealScheduleEntry, MealTimingCategory } from "./types";

// Generic day-part reference points used only to order meals relative to
// each other and to training time — never shown to the client, and never a
// claim about their actual wake/sleep schedule.
const NATURAL_ANCHOR_MINUTES: Partial<Record<MealPeriod, number>> = {
  breakfast: 7 * 60 + 30, // 7:30 AM
  lunch: 12 * 60 + 30, // 12:30 PM
  dinner: 19 * 60, // 7:00 PM
  snack: 15 * 60 + 30, // 3:30 PM — only used when nothing else places it
};

const DAY_FLOOR_MINUTES = 5 * 60; // 5:00 AM — no meal recommended earlier than this
const DAY_CEILING_MINUTES = 22 * 60; // 10:00 PM — no meal recommended later than this
const MIN_GAP_BETWEEN_MEALS_MIN = 90;
const POST_WORKOUT_BUFFER_MIN = 15;

const ANCHOR_MEAL_CANDIDATES: MealPeriod[] = ["breakfast", "lunch", "dinner"];

interface BuildMealScheduleInput {
  trainingPlan: DailyTrainingPlan | null;
  now: Date;
  meals: Partial<Record<MealPeriod, MealSelection>>;
  /** Which meal periods today's plan actually has — this never schedules a
   * meal the day doesn't have. */
  periods: MealPeriod[];
  workoutEstimatedDurationMin: number;
}

function minutesToDate(base: Date, minutesFromMidnight: number): Date {
  const d = new Date(base);
  d.setHours(0, Math.round(minutesFromMidnight), 0, 0);
  return d;
}

function dateToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

function formatClockTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isLoggedSelection(selection: MealSelection | undefined): selection is MealSelection & { completedAtIso: string } {
  return !!selection && (selection.source === "option" || selection.source === "manual") && !!selection.completedAtIso;
}

function macrosForPeriod(period: MealPeriod, selection: MealSelection | undefined): MacroValues | null {
  if (selection?.macros) return selection.macros;
  // Nothing logged yet — classify using the plan's default (first-listed)
  // option so a time can still be projected before the client picks one.
  return MEAL_OPTIONS[period]?.[0]?.macros ?? null;
}

function categoryForPeriod(period: MealPeriod, selection: MealSelection | undefined): MealTimingCategory {
  const macros = macrosForPeriod(period, selection);
  return macros ? categoryFromMacros(macros) : "medium";
}

interface Placement {
  period: MealPeriod;
  minute: number;
  /** Fixed placements (already logged, or anchored directly to training)
   * are never moved to make room for a neighbor — only unfixed meals get
   * nudged forward when they'd otherwise land too close to one. */
  fixed: boolean;
}

export function buildMealSchedule({
  trainingPlan,
  now,
  meals,
  periods,
  workoutEstimatedDurationMin,
}: BuildMealScheduleInput): DailyMealSchedule {
  const isRestDay = trainingPlan?.status === "rest_day";
  const plannedAt = trainingPlan && !isRestDay ? resolvePlannedDateTime(trainingPlan, now) : null;
  const hasAnchor = !!plannedAt;

  if (!hasAnchor) {
    const entries: Partial<Record<MealPeriod, MealScheduleEntry>> = {};
    for (const period of periods) {
      entries[period] = unanchoredEntry(period, meals[period]);
    }
    return { entries, hasAnchor: false };
  }

  const trainingMinutes = dateToMinutes(plannedAt as Date);
  const workoutEndMinutes = trainingMinutes + Math.max(0, workoutEstimatedDurationMin);

  // The pre-workout meal is whichever anchor meal (breakfast/lunch/dinner —
  // postWorkout and snack are never candidates) naturally falls last before
  // training. Training before every candidate's natural time (very early
  // training) leaves this null — the client trains fasted rather than
  // getting an invented pre-workout meal.
  let preWorkoutPeriod: MealPeriod | null = null;
  for (const period of ANCHOR_MEAL_CANDIDATES) {
    if (!periods.includes(period)) continue;
    const naturalMinutes = NATURAL_ANCHOR_MINUTES[period] ?? trainingMinutes;
    if (naturalMinutes < trainingMinutes) preWorkoutPeriod = period;
  }

  const placements: Placement[] = [];

  if (preWorkoutPeriod) {
    const selection = meals[preWorkoutPeriod];
    if (isLoggedSelection(selection)) {
      placements.push({ period: preWorkoutPeriod, minute: dateToMinutes(new Date(selection.completedAtIso)), fixed: true });
    } else {
      const profile = mealTimingProfileForMacros(macrosForPeriod(preWorkoutPeriod, selection));
      const midLead = (profile.preTrainingLeadMinLow + profile.preTrainingLeadMinHigh) / 2;
      const minute = clamp(trainingMinutes - midLead, DAY_FLOOR_MINUTES, trainingMinutes - profile.preTrainingLeadMinLow);
      placements.push({ period: preWorkoutPeriod, minute: Math.round(minute), fixed: true });
    }
  }

  if (periods.includes("postWorkout")) {
    const selection = meals.postWorkout;
    if (isLoggedSelection(selection)) {
      placements.push({ period: "postWorkout", minute: dateToMinutes(new Date(selection.completedAtIso)), fixed: true });
    } else {
      const minute = clamp(workoutEndMinutes + POST_WORKOUT_BUFFER_MIN, DAY_FLOOR_MINUTES, DAY_CEILING_MINUTES);
      placements.push({ period: "postWorkout", minute: Math.round(minute), fixed: true });
    }
  }

  for (const period of periods) {
    if (period === preWorkoutPeriod || period === "postWorkout") continue;
    const selection = meals[period];
    if (isLoggedSelection(selection)) {
      placements.push({ period, minute: dateToMinutes(new Date(selection.completedAtIso)), fixed: true });
      continue;
    }
    const natural = NATURAL_ANCHOR_MINUTES[period] ?? trainingMinutes;
    placements.push({ period, minute: clamp(natural, DAY_FLOOR_MINUTES, DAY_CEILING_MINUTES), fixed: false });
  }

  // Walk the day in chronological order, nudging only unfixed meals forward
  // when they'd otherwise land too close to whatever comes right before
  // them — fixed meals (logged, or anchored to training) never move.
  placements.sort((a, b) => a.minute - b.minute);
  let prevMinute = -Infinity;
  for (const placement of placements) {
    if (!placement.fixed && placement.minute < prevMinute + MIN_GAP_BETWEEN_MEALS_MIN) {
      placement.minute = clamp(prevMinute + MIN_GAP_BETWEEN_MEALS_MIN, DAY_FLOOR_MINUTES, DAY_CEILING_MINUTES);
    }
    prevMinute = placement.minute;
  }

  const minuteByPeriod = new Map(placements.map((p) => [p.period, p.minute]));
  const entries: Partial<Record<MealPeriod, MealScheduleEntry>> = {};
  for (const period of periods) {
    const selection = meals[period];
    const role: MealRole = period === preWorkoutPeriod ? "pre-workout" : period === "postWorkout" ? "post-workout" : "normal";
    const isLocked = isLoggedSelection(selection);
    const minute = minuteByPeriod.get(period);
    const dateForMinute = minute !== undefined ? minutesToDate(now, minute) : null;
    entries[period] = {
      period,
      role,
      category: categoryForPeriod(period, selection),
      recommendedAtIso: dateForMinute ? dateForMinute.toISOString() : null,
      timeLabel: dateForMinute
        ? isLocked
          ? `Logged at ${formatClockTime(dateForMinute)}`
          : `Recommended around ${formatClockTime(dateForMinute)}`
        : null,
      isLocked,
    };
  }

  return { entries, hasAnchor: true };
}

/** No scheduled training time to project from (no decision yet, "not sure
 * yet", or a rest day) — only reflect what's already been logged rather
 * than inventing a forward-looking clock time. */
function unanchoredEntry(period: MealPeriod, selection: MealSelection | undefined): MealScheduleEntry {
  const role: MealRole = period === "postWorkout" ? "post-workout" : "normal";
  const category = categoryForPeriod(period, selection);
  if (isLoggedSelection(selection)) {
    const loggedAt = new Date(selection.completedAtIso);
    return {
      period,
      role,
      category,
      recommendedAtIso: loggedAt.toISOString(),
      timeLabel: `Logged at ${formatClockTime(loggedAt)}`,
      isLocked: true,
    };
  }
  return { period, role, category, recommendedAtIso: null, timeLabel: null, isLocked: false };
}
