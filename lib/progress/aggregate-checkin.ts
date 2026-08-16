// Weekly check-in card aggregation. deriveCheckInStatus (Phase 4.1) is
// evaluated for the current week first; if that week's check-in isn't even
// open yet ("not_available"), the most recently concluded week is checked
// instead, since that is the check-in realistically pending right now. An
// existing WeeklyReview's own stored status always wins over the
// time-derived guess — see lib/scheduling/check-in.ts.

import { deriveCheckInStatus } from "../scheduling/check-in.ts";
import { addDaysToLocalDate, startOfLocalWeek } from "../shared/local-date.ts";
import type { HistoryScope, HistoryStore } from "../history/store";
import type { CheckInScheduleConfig } from "../scheduling/types";
import type { WeekStartsOn } from "../shared/local-date";
import type { CheckInCardModel } from "./types";

export function aggregateCheckIn(
  store: HistoryStore,
  scope: HistoryScope,
  config: CheckInScheduleConfig,
  effectiveDateIso: string,
  weekStartsOn: WeekStartsOn,
  now: Date
): CheckInCardModel {
  const currentWeekStart = startOfLocalWeek(effectiveDateIso, weekStartsOn);
  const currentWeekReview = store.getWeeklyReview(scope, currentWeekStart);
  let weekStartDateIso = currentWeekStart;
  let review = currentWeekReview;
  let status = deriveCheckInStatus(config, currentWeekStart, currentWeekReview, now);

  if (status === "not_available") {
    const previousWeekStart = addDaysToLocalDate(currentWeekStart, -7);
    const previousWeekReview = store.getWeeklyReview(scope, previousWeekStart);
    const previousStatus = deriveCheckInStatus(config, previousWeekStart, previousWeekReview, now);
    if (previousStatus !== "not_available") {
      weekStartDateIso = previousWeekStart;
      review = previousWeekReview;
      status = previousStatus;
    }
  }

  return {
    status,
    weekStartDateIso,
    openTimeLocal: config.openTimeLocal,
    dueWindowHours: config.dueWindowHours,
    reviewSummary: review
      ? {
          status: review.status,
          submittedAtIso: review.submittedAtIso,
          reviewedAtIso: review.reviewedAtIso,
          clientNote: review.clientNote,
          coachNote: review.coachNote,
          coachNoteAuthorKind: review.coachNoteAuthorship?.authorKind,
        }
      : null,
  };
}
