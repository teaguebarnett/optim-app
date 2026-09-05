// Phase 5.0C — the one shared "how do we describe this enrollment's timing
// right now" derivation, used by both the client's own Today page (see
// components/today/pre-start-today.tsx) and every coach surface that shows
// a client's program status (roster, client detail, activation summary).
//
// Fixes a real bug found during verification: a client active before their
// program's start date showed "Week — of 8" on the coach side, and a fully
// actionable (but meaningless) Today experience on the client side. Both
// were reading deriveProgramWeek's honest `null` for a pre-program date and
// either rendering the null directly or ignoring it. This module gives both
// sides one correct, pre-formatted answer instead of each re-deriving (and
// each risking re-introducing) the same gap.

import { deriveProgramPhase, deriveProgramWeek } from "./enrollment.ts";
import { diffInLocalDays } from "../shared/local-date.ts";
import type { ProgramEnrollment, ProgramPhase } from "./types";

export interface ProgramTiming {
  phase: ProgramPhase;
  /** 1-based program week — set only when phase === "active_program". Never
   * a fabricated "Week 1" for a pre-program date; never null while active. */
  week: number | null;
  /** Calendar days from today until the program's start date — set only
   * when phase === "pre_program", and always > 0 there (a phase of
   * "pre_program" is true precisely because today's week precedes the
   * start date's week; see deriveProgramPhase). */
  daysUntilStart: number | null;
}

export function resolveProgramTiming(enrollment: ProgramEnrollment, todayIso: string): ProgramTiming {
  const phase = deriveProgramPhase(enrollment, todayIso);
  return {
    phase,
    week: phase === "active_program" ? deriveProgramWeek(enrollment, todayIso) : null,
    daysUntilStart: phase === "pre_program" ? diffInLocalDays(todayIso, enrollment.startDateIso) : null,
  };
}

/** The one coach-facing program-timing label — "Week 3 of 12" while active,
 * "Starts tomorrow" / "Starts in 5 days" while pre-program, "Program
 * complete" once finished. Never the bare `Week ${null} of N` string this
 * replaces. Takes a pre-formatted `startDateLabel` (e.g. "Aug 31") rather
 * than formatting dates itself, since locale-aware date formatting already
 * has an established per-component convention elsewhere in this codebase
 * (see app/coach/clients/[clientId]/page.tsx, lib/coach/roster.ts). */
export function describeProgramTimingForCoach(timing: ProgramTiming, durationWeeks: number, startDateLabel: string): string {
  if (timing.phase === "active_program") {
    return `Week ${timing.week} of ${durationWeeks}`;
  }
  if (timing.phase === "pre_program") {
    const days = timing.daysUntilStart ?? 0;
    const when = days === 1 ? "tomorrow" : days > 1 ? `${startDateLabel}` : "today";
    return `Starts ${when} · ${durationWeeks}-week program`;
  }
  return `Program complete · ${durationWeeks} weeks`;
}
