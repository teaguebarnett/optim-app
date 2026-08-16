// Weekly check-in schedule primitives — pure derivation from a
// CheckInScheduleConfig plus real time, no submission flow (that's a later
// phase). Supports both a derived default (due the morning after the
// program week's final scheduled training day, per the training-week
// template) and an explicit fixed-weekday override, per Phase 4.1's check-in
// schedule requirement.

import { TRAINING_WEEK } from "../mock-data.ts";
import { addDaysToLocalDate, zonedDateTimeToInstant } from "../shared/local-date.ts";
import type { DayOfWeek } from "../types";
import type { TrainingWeekDay } from "../mock-data.ts";
import type { CheckInScheduleConfig, CheckInStatus, ProgramEnrollmentId } from "./types";
import type { WeeklyReview } from "../history/types";
import type { ClientProfileId, WorkspaceId } from "../tenancy/types";

const WEEKDAY_OFFSET_FROM_MONDAY: Record<DayOfWeek, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

/** The offset (days from Monday) of the last "training" day in a
 * Monday-first training-week template, or null if the template has no
 * training days at all — an honest result, never a guessed weekday.
 * Defaults to the real TRAINING_WEEK (see lib/mock-data.ts); the parameter
 * exists so lib/scheduling/verify-scheduling behavior can exercise the
 * null/insufficient-data path directly rather than only through the demo's
 * real template, which always has training days. */
export function finalScheduledTrainingDayOffset(trainingWeek: TrainingWeekDay[] = TRAINING_WEEK): number | null {
  let lastIndex: number | null = null;
  trainingWeek.forEach((day, index) => {
    if (day.type === "training") lastIndex = index;
  });
  return lastIndex;
}

/** Resolves which local date a given week's check-in is due on, or null when
 * `after_final_training_day` is configured but no final training day can be
 * derived — the caller must surface this as insufficient_data rather than
 * inventing a day. `weekStartDateIso` must already be the Monday-anchored
 * start of the week being evaluated (see lib/shared/local-date.ts's
 * startOfLocalWeek). */
function resolveDueDateIso(config: CheckInScheduleConfig, weekStartDateIso: string): string | null {
  if (config.rule.kind === "fixed_weekday") {
    return addDaysToLocalDate(weekStartDateIso, WEEKDAY_OFFSET_FROM_MONDAY[config.rule.weekday]);
  }
  const offset = finalScheduledTrainingDayOffset();
  if (offset === null) return null;
  // "Due the morning after" the final scheduled training day — Phase 4
  // decision default.
  return addDaysToLocalDate(weekStartDateIso, offset + 1);
}

/**
 * Derives the current status of one week's check-in. If a WeeklyReview
 * already exists for that week, its own stored status is authoritative
 * (this function never overrides real submission/review progress with a
 * time-based guess). Otherwise, status is derived purely from the schedule
 * config and the current instant: not yet open (`not_available`), open and
 * within its due window (`due`), or past the due window (`overdue`).
 */
export function deriveCheckInStatus(
  config: CheckInScheduleConfig,
  weekStartDateIso: string,
  existingReview: WeeklyReview | null,
  nowInstant: Date
): CheckInStatus {
  if (existingReview) return existingReview.status;

  const dueDateIso = resolveDueDateIso(config, weekStartDateIso);
  if (dueDateIso === null) return "insufficient_data";

  const opensAtInstant = zonedDateTimeToInstant(dueDateIso, config.openTimeLocal, config.timeZone);
  if (nowInstant.getTime() < opensAtInstant.getTime()) return "not_available";

  const overdueAtInstant = new Date(opensAtInstant.getTime() + config.dueWindowHours * 60 * 60 * 1000);
  return nowInstant.getTime() < overdueAtInstant.getTime() ? "due" : "overdue";
}

/** The one check-in schedule this demo needs — mirrors
 * buildDemoDefaultProgramEnrollment's "this app only ever runs as one
 * client" convention. Default: due 8am the morning after the program's
 * final scheduled training day, overdue 24h later. */
export function buildDemoCheckInScheduleConfig(params: {
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  enrollmentId: ProgramEnrollmentId;
  timeZone: string;
  now?: Date;
}): CheckInScheduleConfig {
  const nowIso = (params.now ?? new Date()).toISOString();
  return {
    id: `checkin-schedule:${params.workspaceId}:${params.clientId}:${params.enrollmentId}`,
    schemaVersion: 1,
    workspaceId: params.workspaceId,
    clientId: params.clientId,
    enrollmentId: params.enrollmentId,
    rule: { kind: "after_final_training_day" },
    openTimeLocal: "08:00",
    dueWindowHours: 24,
    timeZone: params.timeZone,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}
