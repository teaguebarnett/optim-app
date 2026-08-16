// Pure program-enrollment derivation, plus the one demo-specific default
// constructor createInitialState()/the v3->v4 migration both need.

import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import {
  addDaysToLocalDate,
  diffInLocalDays,
  resolveBrowserTimeZone,
  resolveClientLocalDateIso,
  startOfLocalWeek,
  DEFAULT_WEEK_STARTS_ON,
} from "../shared/local-date.ts";
import type { ProgramEnrollment, ProgramPhase } from "./types";

function rawWeekIndex(enrollment: ProgramEnrollment, effectiveDateIso: string): number {
  const programWeekStart = startOfLocalWeek(enrollment.startDateIso, enrollment.weekStartsOn);
  const dateWeekStart = startOfLocalWeek(effectiveDateIso, enrollment.weekStartsOn);
  const weeksSinceStart = Math.floor(diffInLocalDays(programWeekStart, dateWeekStart) / 7);
  return weeksSinceStart + 1;
}

export function deriveProgramPhase(enrollment: ProgramEnrollment, effectiveDateIso: string): ProgramPhase {
  const weekIndex = rawWeekIndex(enrollment, effectiveDateIso);
  if (weekIndex < 1) return "pre_program";
  if (weekIndex > enrollment.durationWeeks) return "post_program";
  return "active_program";
}

/** 1-based program week for the given local date, or null when the date
 * falls outside the enrollment's active weeks — see deriveProgramPhase.
 * Callers must never treat a null week as "Week 1"; it means "not
 * applicable," not "the first week." */
export function deriveProgramWeek(enrollment: ProgramEnrollment, effectiveDateIso: string): number | null {
  const weekIndex = rawWeekIndex(enrollment, effectiveDateIso);
  if (weekIndex < 1 || weekIndex > enrollment.durationWeeks) return null;
  return weekIndex;
}

/**
 * Reverse-derives a startDateIso such that, evaluated against `todayIso`,
 * deriveProgramWeek returns exactly `currentlyDisplayedWeek`. Used only by
 * migration/first-run seeding to preserve a client's already-displayed
 * program week rather than resetting to Week 1 — see lib/tenancy/migrate.ts
 * §v3->v4 and buildDemoDefaultProgramEnrollment below. Anchored to the start
 * of `todayIso`'s own week, so the week advances naturally on every real
 * subsequent week from here on, exactly as a genuine enrollment start date
 * would.
 */
export function deriveStartDatePreservingCurrentWeek(
  todayIso: string,
  currentlyDisplayedWeek: number,
  weekStartsOn: ProgramEnrollment["weekStartsOn"]
): string {
  const todayWeekStart = startOfLocalWeek(todayIso, weekStartsOn);
  return addDaysToLocalDate(todayWeekStart, -(currentlyDisplayedWeek - 1) * 7);
}

/**
 * Locked product decision (Phase 4.2 correction): the current
 * founder-operated OPTIM prototype runs a 12-week program. This is a
 * property of THIS ONE demo/prototype enrollment only — never a global
 * OPTIM invariant. deriveProgramPhase/deriveProgramWeek above already read
 * enrollment.durationWeeks generically and are correct for any positive
 * integer duration a future coach configures per client enrollment (see
 * lib/progress/verify-progress.mts and lib/history/verify-history.mts for
 * coverage at 8/12/16/20 weeks). A real coach-configuration UI for this
 * value is out of scope for Phase 4.2.
 *
 * Deliberately NOT sourced from ClientProfile.programTotalWeeks (a Phase
 * 1-era hand-set display field, still 16 in lib/tenancy/seed.ts and left
 * untouched there as harmless, unused legacy data — see the correction
 * report) — program duration is owned by the enrollment itself, not
 * derived from a different record's stale display value.
 */
const CURRENT_PROTOTYPE_PROGRAM_DURATION_WEEKS = 12;

/**
 * The one enrollment this demo ever needs — mirrors lib/state.ts's existing
 * "this app only ever runs as CLIENT_PROFILE_DEMO in WORKSPACE_OPTIM_ID"
 * convention. Anchors the start date so evaluating it against `now` reports
 * exactly CLIENT_PROFILE_DEMO.programWeek (today's existing hand-set
 * display value), so first-run and freshly migrated state both show the
 * same week the rest of the app (e.g. lib/mock-data.ts's catalog) was
 * authored around, then advances normally from there as real days pass.
 * Never depends on a hardcoded calendar date — always resolved against the
 * real current instant at call time.
 */
export function buildDemoDefaultProgramEnrollment(now: Date = new Date()): ProgramEnrollment {
  const timeZone = resolveBrowserTimeZone();
  const todayIso = resolveClientLocalDateIso(now, timeZone);
  const startDateIso = deriveStartDatePreservingCurrentWeek(
    todayIso,
    CLIENT_PROFILE_DEMO.programWeek,
    DEFAULT_WEEK_STARTS_ON
  );
  const nowIso = now.toISOString();
  return {
    id: `enrollment-${WORKSPACE_OPTIM_ID}-${CLIENT_PROFILE_DEMO.id}`,
    schemaVersion: 1,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    programId: "program-demo",
    startDateIso,
    durationWeeks: CURRENT_PROTOTYPE_PROGRAM_DURATION_WEEKS,
    timeZone,
    weekStartsOn: DEFAULT_WEEK_STARTS_ON,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}
