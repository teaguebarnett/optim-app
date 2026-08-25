// Program enrollment and check-in schedule domain types.
//
// Kept separate from lib/history/types.ts because these are current/live
// configuration records (one active enrollment, one active schedule config
// per client) rather than an ever-growing event history — see
// lib/state.ts's AppState.programEnrollment for where the enrollment is
// actually stored (a small live-config record fits the existing AppState
// convention the same way dailyTrainingPlan already does; it is not the
// kind of growing log that needs its own out-of-AppState store).

import type { ClientProfileId, WorkspaceId } from "../tenancy/types";
import type { DayOfWeek } from "../types";
import type { WeekStartsOn } from "../shared/local-date";

export type ProgramEnrollmentId = string;

/** Whether a given local date falls before, during, or after the enrolled
 * program's active weeks. Kept distinct from a day's training-day type or
 * lifecycle (see lib/history/types.ts's TrainingDayType/DayLifecycle) —
 * see Phase 4 Required Derivation Correction #1. */
export type ProgramPhase = "pre_program" | "active_program" | "post_program";

/**
 * One client's enrollment in one program run. This is the backend-ready
 * replacement for ClientProfile.programWeek/programTotalWeeks being treated
 * as a hand-set display value — see lib/scheduling/enrollment.ts for the
 * pure derivation functions that turn (enrollment, a local date) into a
 * ProgramPhase and 1-based week number, and lib/tenancy/migrate.ts's v3->v4
 * step for how an existing client's currently-displayed week is preserved
 * rather than reset to Week 1 when this record is first created.
 */
export interface ProgramEnrollment {
  id: ProgramEnrollmentId;
  schemaVersion: number;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  /** Placeholder program identity — Phase 4.1 does not build a program
   * catalog/authoring system (see Phase 4 decision on program catalog
   * scope); this only labels which program the enrollment is for. */
  programId: string;
  /** Local calendar date (YYYY-MM-DD) the program's Week 1 begins. */
  startDateIso: string;
  durationWeeks: number;
  /** IANA timezone this enrollment's client-local dates/times are resolved
   * in — see lib/shared/local-date.ts. */
  timeZone: string;
  weekStartsOn: WeekStartsOn;
  createdAtIso: string;
  updatedAtIso: string;
}

// ---------------------------------------------------------------------------
// Check-in schedule
// ---------------------------------------------------------------------------

export type CheckInScheduleRule =
  /** Due the morning after the enrollment's program week's final scheduled
   * training day, per its training-week template. Requires a derivable
   * "final scheduled training day" — see deriveCheckInStatus's explicit
   * insufficient-data fallback when one can't be determined. */
  | { kind: "after_final_training_day" }
  /** Due every week on a fixed weekday regardless of the training-week
   * template — a coach-configurable override. */
  | { kind: "fixed_weekday"; weekday: DayOfWeek };

export interface CheckInScheduleConfig {
  id: string;
  schemaVersion: number;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  enrollmentId: ProgramEnrollmentId;
  /** Coach-authored display name for this check-in, e.g. "Weekly check-in"
   * or "Monthly review" — the client-facing card title is always derived
   * from this rather than assuming every check-in is weekly. */
  label: string;
  rule: CheckInScheduleRule;
  /** Local "HH:MM" the check-in opens on its due day. */
  openTimeLocal: string;
  /** Hours after opening before the check-in becomes "overdue". */
  dueWindowHours: number;
  timeZone: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export type CheckInStatus =
  | "not_available"
  | "due"
  | "overdue"
  | "in_progress"
  | "submitted"
  | "reviewed"
  | "adjustments_ready"
  | "completed"
  /** No fixed-weekday override is configured and no final scheduled
   * training day could be derived for the relevant week — an honest gap,
   * never silently defaulted to a guessed day. */
  | "insufficient_data";
