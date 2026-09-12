// Phase 6A — the universal-grammar counterpart of resolve-scheduled-workout.ts.
//
// Once a real Supabase client's assigned program has been read and resolved
// into the universal grammar (schemaVersion 2 content natively, or a
// schemaVersion-1 legacy program forward-converted via
// lib/training/legacy-adapter.ts's legacyProgramToUniversalProgram — see
// lib/production/programs.ts's getClientProgramContext), THIS is the one
// place that decides whether that client can start a real session right
// now, and which real Session that would be. It mirrors
// resolveScheduledWorkoutForStart's exact day/week/rest-day decision logic
// (reusing the same resolveProgramTiming primitive so the two can never
// disagree about pre-program/post-program/rest), but reads
// UniversalProgramWeek/UniversalProgramDay directly instead of legacy
// ProgramWeek/ProgramDay — never converting back to a legacy Workout first
// (see lib/state.ts's START_WORKOUT, the one caller).
//
// Unlike resolveScheduledWorkoutForStart, this function has NO "no real
// assignedProgram -> seeded demo fixture" fallback: a caller only ever
// reaches this function once it already knows a real universal program
// exists (see AppState.assignedUniversalProgram's own doc) — there is no
// honest "demo" case to fall back to here.
//
// V1 presentation decision (spec section 19): the universal grammar
// structurally permits more than one Session per training day (e.g. an
// AM/PM split), but this resolver always returns only the FIRST session of
// the day as "the" scheduled session — the same one-session-per-day
// experience the client-facing product has always presented. This is a
// deliberate, documented UI-presentation choice, not a domain-model
// limitation: UniversalProgramDay.sessions itself is untouched and still
// carries every session a coach might author.

import { resolveProgramTiming } from "../scheduling/program-timing.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import type { ProgramEnrollment } from "../scheduling/types";
import type { Session, UniversalTrainingProgramContent } from "../training/types";

export type ScheduledSessionUnavailableReason =
  | "pre_program"
  | "post_program"
  | "rest_day"
  /** A genuinely scheduled training day with no real session behind it (an
   * authoring gap), or a week number this program's content doesn't cover —
   * see WorkoutAvailability.isUnavailable's legacy counterpart. */
  | "no_assignment";

export interface ScheduledSessionResolution {
  /** The exact, real Session a session started right now should be built
   * from — null whenever there's nothing honest to start (see `reason`). */
  session: Session | null;
  reason: ScheduledSessionUnavailableReason | null;
}

export function resolveScheduledSessionForStart(params: {
  dateIso: string;
  programEnrollment: ProgramEnrollment;
  assignedProgram: UniversalTrainingProgramContent;
  clientDeclaredRest: boolean;
}): ScheduledSessionResolution {
  const timing = resolveProgramTiming(params.programEnrollment, params.dateIso);
  if (timing.phase === "pre_program") return { session: null, reason: "pre_program" };
  if (timing.phase === "post_program") return { session: null, reason: "post_program" };

  const dayOfWeek = localDateDayOfWeek(params.dateIso);
  const week = params.assignedProgram.weeks.find((w) => w.weekNumber === timing.week);
  const day = week?.days.find((d) => d.dayOfWeek === dayOfWeek);

  if (params.clientDeclaredRest || day?.type === "rest") {
    return { session: null, reason: "rest_day" };
  }
  const primarySession = day?.sessions?.[0];
  if (!day || !primarySession) return { session: null, reason: "no_assignment" };
  return { session: primarySession, reason: null };
}
