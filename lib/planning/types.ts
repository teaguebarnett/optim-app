// Phase 3 — adaptive daily planning domain types.
//
// These are intentionally separate from lib/types.ts's workout/nutrition
// domain records: this module describes *presentation-layer scheduling* —
// how today's actual state maps to an ordered, explained plan — not
// persisted business records. Only DailyTrainingPlan is persisted (see
// AppState.dailyTrainingPlan in lib/state.ts); everything else here is
// derived fresh on every render by lib/planning/planner.ts.

import type { ClientProfileId, WorkspaceId } from "../tenancy/types";
import type { MealPeriod } from "../types";

export type TrainingPlanStatus = "scheduled" | "unsure" | "rest_day";

/**
 * The client's own training-time decision for one local calendar day.
 * Scoped by workspace + client + local date so one client's (or one day's)
 * choice never leaks into another — see lib/planning/training-plan.ts.
 *
 * A day with no record at all (AppState.dailyTrainingPlan === null, or one
 * scoped to a different date) means no decision has been made yet — this is
 * deliberately distinct from status "unsure", which means the client was
 * asked and explicitly chose "Not sure yet." The former shows the primary
 * "Enter your training time" prompt; the latter shows a calm, low-emphasis
 * reminder instead of repeating the same prompt.
 */
export interface DailyTrainingPlan {
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  /** Local calendar date, YYYY-MM-DD — see resolveLocalDateIso(). */
  dateIso: string;
  status: TrainingPlanStatus;
  /** 24-hour "HH:MM" local time, only present when status === "scheduled". */
  plannedTime24?: string;
  /** Human-readable form of plannedTime24, e.g. "5:30 PM". */
  plannedTimeLabel?: string;
  updatedAtIso: string;
}

export type MealTimingCategory = "light" | "medium" | "heavy";

/**
 * Evidence-informed (not exact) estimate of how a meal option relates to
 * training timing. Never claims to measure actual digestion — see
 * lib/planning/meal-timing.ts for the derivation rules and their limits.
 */
export interface MealTimingProfile {
  category: MealTimingCategory;
  label: string;
  /** Recommended minimum/maximum minutes between eating this meal and
   * starting training, when this meal is positioned as the pre-workout
   * meal. Advisory only — never rendered as a countdown or deadline. */
  preTrainingLeadMinLow: number;
  preTrainingLeadMinHigh: number;
  /** Set when the derivation had to fall back to conservative defaults
   * because the option lacked enough nutrition detail to estimate from. */
  isFallback: boolean;
}

export type PlannerItemStatus =
  | "completed"
  | "in-progress"
  | "recommended"
  | "upcoming"
  | "optional"
  | "skipped"
  | "missed"
  | "not-started"
  /** The client ended the session early but had already completed at least
   * one working set — distinct from "skipped". See Phase 3.1 §4. */
  | "partially-completed";

export type PlannerItemKind =
  | "training-time"
  | "morning-weight"
  | "meal"
  | "workout"
  | "cardio"
  | "review";

export interface PlannerItem {
  id: string;
  kind: PlannerItemKind;
  title: string;
  status: PlannerItemStatus;
  /** Broad guidance window/time label, e.g. "Recommended 4:00–4:45 PM" or
   * "Training was planned for 5:30 PM." Never a countdown. */
  timeLabel?: string;
  /** Short honest explanation of why this item is positioned/labeled this
   * way — generated strictly from real state, never fabricated. */
  explanation?: string;
  /** Whether this item is the one dominant next action for the day. */
  isNextAction: boolean;
  actionLabel?: string;
  href?: string;
}

export interface SnackRecommendation {
  show: boolean;
  reason?: string;
}

/**
 * A meal's relationship to today's training, decided fresh each time the
 * schedule is built — never hardcoded to a specific period name. Most days
 * exactly one meal is "pre-workout" (whichever naturally falls last before
 * training) and the dedicated postWorkout slot is "post-workout"; every
 * other meal (including postWorkout on a day with no training) is "normal".
 */
export type MealRole = "pre-workout" | "post-workout" | "normal";

export interface MealScheduleEntry {
  period: MealPeriod;
  role: MealRole;
  category: MealTimingCategory;
  /** Local ISO datetime this meal is recommended for. Null when there isn't
   * enough anchor information to project forward (no scheduled training
   * time) — see lib/planning/meal-schedule.ts. Once a meal is logged, its
   * actual completedAtIso is the source of truth instead; see isLocked. */
  recommendedAtIso: string | null;
  /** Human-readable form of recommendedAtIso, e.g. "Recommended around 9:15 AM". */
  timeLabel: string | null;
  /** True once this meal has already been logged for today — its recorded
   * time is authoritative and this entry's recommendedAtIso reflects that
   * recorded time rather than a recalculated projection. */
  isLocked: boolean;
}

export interface DailyMealSchedule {
  /** One entry per meal period present in today's plan. */
  entries: Partial<Record<MealPeriod, MealScheduleEntry>>;
  /** True only when a scheduled training time made forward projection
   * possible. False for "unsure"/rest-day/no-decision-yet days — those days
   * intentionally show no invented clock times. */
  hasAnchor: boolean;
}

export interface DailyPlanResult {
  items: PlannerItem[];
  nextAction: PlannerItem | null;
  snack: SnackRecommendation;
  /** The same computed full-day meal schedule the items' timeLabels are
   * built from — exposed directly so other screens (e.g. the Nutrition
   * page) can show recommended times per meal without recomputing them, so
   * Today and Nutrition can never drift apart. See lib/planning/
   * meal-schedule.ts. */
  mealSchedule: DailyMealSchedule;
}
