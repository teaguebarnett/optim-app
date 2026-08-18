// Resolves a date range into per-day DailyRecord slots — archived records
// (with corrections applied) for past days, a pure NON-PERSISTING
// projection of live state for today, and an honest "no record"/"future"
// marker everywhere else. This is the one place Phase 4.2 touches the
// HistoryStore or live AppState directly; every aggregate-*.ts file and
// every presentation component consumes only the DayRecordSlot[] this
// produces.
//
// Never archives today merely to display it (buildDailyRecordFromLiveState
// is pure — see lib/history/build-daily-record.ts) and never mutates the
// store during dashboard rendering.

import { addDaysToLocalDate, compareLocalDates, startOfLocalWeek } from "../shared/local-date.ts";
import { buildDailyRecordFromLiveState } from "../history/build-daily-record.ts";
import { applyCorrections } from "../history/apply-corrections.ts";
import type { HistoryStore, HistoryScope } from "../history/store";
import type { DailyRecord } from "../history/types";
import type { RecordSource } from "../history/shared-types";
import type { AppState } from "../state";
import type { ProgramEnrollment } from "../scheduling/types";
import type { WeekStartsOn } from "../shared/local-date";

export interface DayRecordSlot {
  dateIso: string;
  /** The corrected, effective view of the day — null when no record exists
   * (a genuine gap) or the date is in the future. */
  record: DailyRecord | null;
  isFuture: boolean;
  isToday: boolean;
  /** Dot-paths of every field a Correction touched for this day (e.g.
   * "weight.weightLb") — the original record is never mutated or
   * flattened away (see lib/history/apply-corrections.ts); this just lets
   * a view model mark a displayed value as corrected without a second
   * store lookup. Empty when no record or no corrections apply. */
  correctedFieldPaths: string[];
}

export interface CollectRecordsInput {
  store: HistoryStore;
  scope: HistoryScope;
  source: RecordSource;
  effectiveDateIso: string;
  enrollment: ProgramEnrollment;
  /** Present only for source "live" — used to build today's non-persisted
   * projection. Fixture/demo mode has no live day to project; every date in
   * range resolves purely from what's already archived in the fixture
   * store. */
  liveState: AppState | null;
}

function resolveDaySlot(input: CollectRecordsInput, dateIso: string): DayRecordSlot {
  const isFuture = compareLocalDates(dateIso, input.effectiveDateIso) > 0;
  const isToday = dateIso === input.effectiveDateIso;

  if (isFuture) {
    return { dateIso, record: null, isFuture: true, isToday: false, correctedFieldPaths: [] };
  }

  if (isToday && input.liveState) {
    const projected = buildDailyRecordFromLiveState(input.liveState, input.enrollment, input.source);
    return { dateIso, record: projected, isFuture: false, isToday: true, correctedFieldPaths: [] };
  }

  const archived = input.store.getDailyRecord(input.scope, dateIso, input.source);
  if (!archived) {
    return { dateIso, record: null, isFuture: false, isToday, correctedFieldPaths: [] };
  }
  const corrections = input.store.listCorrections(input.scope, dateIso);
  return {
    dateIso,
    record: applyCorrections(archived, corrections),
    isFuture: false,
    isToday,
    correctedFieldPaths: corrections.map((c) => c.fieldPath),
  };
}

export function collectDateRangeRecords(input: CollectRecordsInput, fromDateIso: string, toDateIso: string): DayRecordSlot[] {
  const slots: DayRecordSlot[] = [];
  let cursor = fromDateIso;
  while (compareLocalDates(cursor, toDateIso) <= 0) {
    slots.push(resolveDaySlot(input, cursor));
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return slots;
}

export function collectCurrentWeekRecords(input: CollectRecordsInput, weekStartsOn: WeekStartsOn): DayRecordSlot[] {
  const weekStart = startOfLocalWeek(input.effectiveDateIso, weekStartsOn);
  const weekEnd = addDaysToLocalDate(weekStart, 6);
  return collectDateRangeRecords(input, weekStart, weekEnd);
}

/** Phase 4.3 — resolves exactly one date the same way every other selector
 * in this file does (future/today/archived-with-corrections), for the
 * Historical Day Review. Reuses resolveDaySlot directly rather than
 * duplicating its future/today/archived branching. */
export function collectSingleDayRecord(input: CollectRecordsInput, dateIso: string): DayRecordSlot {
  return resolveDaySlot(input, dateIso);
}
