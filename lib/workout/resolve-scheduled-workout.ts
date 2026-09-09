// The one place that decides whether a client can actually START a real
// workout session right now, and which real, coach-approved Workout that
// would be — used by lib/state.ts's START_WORKOUT reducer case as the final,
// authoritative gate (on top of, never instead of, the UI-level gating
// Today/Training already do — see components/training/session-surface.tsx,
// app/(client)/today/page.tsx, app/(client)/training/page.tsx, all of which
// already refuse to render a "Begin workout" control before Program Day 1,
// on a rest day, or for a day with no real assigned content).
//
// Reuses the exact same resolution primitives every display surface already
// trusts (resolveProgramTiming, resolveWorkoutAvailabilityForDay) so the
// reducer can never disagree with what the client was shown before tapping
// "Begin workout." Never fabricates a workout: the only two outcomes are "a
// real, coach-approved Workout" or "no workout — here's why," and the
// reducer must treat the latter as an honest no-op rather than starting a
// session against invented or mismatched content.

import { resolveProgramTiming } from "../scheduling/program-timing.ts";
import { resolveWorkoutAvailabilityForDay, PUSH_WORKOUT } from "../mock-data.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import type { ClientAssignedProgram, Workout } from "../types";
import type { ProgramEnrollment } from "../scheduling/types";

export type ScheduledWorkoutUnavailableReason =
  | "pre_program"
  | "post_program"
  | "rest_day"
  /** A genuinely scheduled training day with no real, loggable catalog
   * content behind it (an authoring gap) — see
   * WorkoutAvailability.isUnavailable. */
  | "no_assignment";

export interface ScheduledWorkoutResolution {
  /** The exact, real workout a session started right now should be built
   * from — null whenever there's nothing honest to start (see `reason`). */
  workout: Workout | null;
  reason: ScheduledWorkoutUnavailableReason | null;
}

export function resolveScheduledWorkoutForStart(params: {
  dateIso: string;
  programEnrollment: ProgramEnrollment;
  assignedProgram?: ClientAssignedProgram;
  clientDeclaredRest: boolean;
}): ScheduledWorkoutResolution {
  // No real coach-assigned program at all — a real, coach-created client
  // never reaches this far without one (see
  // lib/coach/repository.ts's shouldAutosaveClientAppState doc: a client
  // pre-activation only ever renders their waiting screen), so this is the
  // seeded demo/prototype client. Its one loggable catalog session
  // (PUSH_WORKOUT) has always been startable unconditionally — this is the
  // explicitly identified demo experience (see lib/mock-data.ts's own
  // module doc), never a real weekly calendar to gate against. Every check
  // below applies only once a client has a real assigned program.
  if (!params.assignedProgram) {
    return { workout: PUSH_WORKOUT, reason: null };
  }

  const timing = resolveProgramTiming(params.programEnrollment, params.dateIso);
  if (timing.phase === "pre_program") return { workout: null, reason: "pre_program" };
  if (timing.phase === "post_program") return { workout: null, reason: "post_program" };

  const dayOfWeek = localDateDayOfWeek(params.dateIso);
  const availability = resolveWorkoutAvailabilityForDay(dayOfWeek, params.clientDeclaredRest, params.assignedProgram, timing.week);

  if (params.clientDeclaredRest || availability.scheduleEntry?.type === "rest") {
    return { workout: null, reason: "rest_day" };
  }
  if (!availability.workout) {
    return { workout: null, reason: "no_assignment" };
  }
  return { workout: availability.workout, reason: null };
}
