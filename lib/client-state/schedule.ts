// Phase 9D — resolves which real calendar dates in a window were actually
// SCHEDULED training days for a client, from the two real sources of
// truth: their program enrollment (start date/duration/week-start) and
// their assigned universal program's own per-week day patterns. This is
// what makes "3 of last 4 scheduled sessions completed" possible — a date
// with zero client_observations rows is otherwise indistinguishable
// between "nothing was scheduled" and "a scheduled session was silently
// never logged," and only the second one is real adherence evidence.
//
// Pure — no Supabase import. Reuses the same enrollment/calendar
// primitives every other real schedule-aware surface in this codebase
// already uses (lib/scheduling/enrollment.ts, lib/shared/local-date.ts) —
// never reinvents week/date arithmetic.

import { deriveProgramWeek } from "../scheduling/enrollment.ts";
import { addDaysToLocalDate, isLocalDateAfter, localDateDayOfWeek } from "../shared/local-date.ts";
import type { ProgramEnrollment } from "../scheduling/types";
import type { UniversalTrainingProgramContent } from "../training/types.ts";

/** Every real calendar date in [sinceIso, untilIso] (inclusive) that fell
 * within the client's active program AND was a real "training" day per
 * that week's own day pattern — never a guess, never every day, never
 * assumed identical week to week (a program's split can and does vary
 * which days are training vs rest across its own weeks). Dates outside the
 * enrollment's active range (pre/post program) are silently excluded, not
 * fabricated as scheduled. */
export function scheduledTrainingDatesInWindow(enrollment: ProgramEnrollment, program: UniversalTrainingProgramContent, sinceIso: string, untilIso: string): string[] {
  const dates: string[] = [];
  let cursor = sinceIso;
  // Bounded by construction: callers always pass a bounded window (see
  // lib/client-state/windows.ts) — this is not an unbounded scan.
  while (!isLocalDateAfter(cursor, untilIso)) {
    const week = deriveProgramWeek(enrollment, cursor);
    if (week !== null) {
      const weekContent = program.weeks.find((w) => w.weekNumber === week);
      const dayOfWeek = localDateDayOfWeek(cursor);
      const day = weekContent?.days.find((d) => d.dayOfWeek === dayOfWeek);
      if (day?.type === "training") dates.push(cursor);
    }
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return dates;
}
