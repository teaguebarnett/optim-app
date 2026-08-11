// Phase 3 — adaptive daily planning domain types.
//
// These are intentionally separate from lib/types.ts's workout/nutrition
// domain records: this module describes *presentation-layer scheduling* —
// how today's actual state maps to an ordered, explained plan — not
// persisted business records. Only DailyTrainingPlan is persisted (see
// AppState.dailyTrainingPlan in lib/state.ts); everything else here is
// derived fresh on every render by lib/planning/planner.ts.

import type { ClientProfileId, WorkspaceId } from "../tenancy/types";

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

export type MealTimingCategory = "light" | "standard" | "larger";

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
  | "not-started";

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

export interface DailyPlanResult {
  items: PlannerItem[];
  nextAction: PlannerItem | null;
  snack: SnackRecommendation;
}
