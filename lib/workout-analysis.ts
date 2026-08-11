import { PUSH_WORKOUT } from "./mock-data.ts";
import { ALL_CLIENT_PROFILES, ALL_COACH_PROFILES, ALL_WORKSPACES } from "./tenancy/seed.ts";
import type { Exercise, ExerciseLog, WorkoutSession, WorkoutSummary } from "./types";

/** Resolves the business/coach display names for the session's workspace and
 * client, so the zero-data message below never hardcodes a specific
 * workspace's brand or coach name. Falls back to generic wording only if the
 * session references a workspace/client this build doesn't know about.
 * Uses the workspace's business name (not the assistant name) so the
 * OPTIM demo workspace's required Phase 1 wording — "...so OPTIM cannot
 * evaluate..." — is preserved exactly. */
function resolveSessionIdentity(session: WorkoutSession): { businessName: string; coachName: string } {
  const workspace = ALL_WORKSPACES.find((w) => w.id === session.workspaceId);
  const client = ALL_CLIENT_PROFILES.find((c) => c.id === session.clientId);
  const coach = client ? ALL_COACH_PROFILES.find((c) => c.id === client.primaryCoachId) : undefined;
  return {
    businessName: workspace?.branding.businessName ?? "the platform",
    coachName: coach?.displayName ?? "your coach",
  };
}

// Deterministic, rule-based prototype feedback. No real analysis engine —
// every message is derived strictly from the sets the client actually
// submitted. Nothing here may claim a result, comparison, or trend that
// isn't backed by logged data (see buildWorkoutSummary).

export function rpeFeedback(actualRpe: number, targetRpe: number): string {
  if (actualRpe < targetRpe - 1) return "This set may have been lighter than intended.";
  if (actualRpe > targetRpe + 1) return "This set was harder than planned and may need review.";
  return "You stayed within the programmed effort range.";
}

export function totalPrescribedWorkingSets(): number {
  return PUSH_WORKOUT.exercises.reduce((n, e) => n + e.workingSets, 0);
}

/**
 * A prescribed working set only counts as addressed once the client submits
 * a valid RPE for it, or it's intentionally skipped. An exercise can only be
 * marked complete once every prescribed working set is addressed this way,
 * and at least one of them was actually completed (not every set skipped).
 */
export function canCompleteExercise(exercise: Exercise, log: ExerciseLog): boolean {
  const workingPrescribed = exercise.prescribedSets.filter((s) => !s.isWarmup);
  const loggedByNumber = new Map(log.loggedSets.map((s) => [s.setNumber, s]));

  let hasValidCompletion = false;
  for (const prescribed of workingPrescribed) {
    const logged = loggedByNumber.get(prescribed.setNumber);
    if (!logged) return false;
    if (logged.status === "completed") {
      if (logged.rpe === null) return false;
      hasValidCompletion = true;
    }
    // status === "skipped" is intentionally accounted for — keep checking.
  }
  return hasValidCompletion;
}

export function buildWorkoutSummary(
  session: WorkoutSession,
  startedAtIso: string,
  completedAtIso: string
): WorkoutSummary {
  const workout = PUSH_WORKOUT;
  let exercisesCompleted = 0;
  let exercisesSkipped = 0;
  let workingSetsCompleted = 0;
  let skippedSetsCount = 0;
  let missingRpeCount = 0;
  let anyRpeAnomaly = false;
  let anyLighterThanExpected = false;
  const rpeValues: number[] = [];

  for (const exercise of workout.exercises) {
    const log = session.exerciseLogs[exercise.id];
    if (!log) continue;

    skippedSetsCount += log.loggedSets.filter((s) => s.status === "skipped").length;

    if (log.status === "skipped") {
      exercisesSkipped += 1;
      continue;
    }
    const completedWorkingSets = log.loggedSets.filter(
      (s) => !s.isWarmup && s.status === "completed"
    );
    if (completedWorkingSets.length > 0) {
      exercisesCompleted += 1;
    }
    workingSetsCompleted += completedWorkingSets.length;

    for (const set of completedWorkingSets) {
      if (set.rpe === null) {
        missingRpeCount += 1;
        continue;
      }
      rpeValues.push(set.rpe);
      if (set.rpe > exercise.targetRpe + 1) anyRpeAnomaly = true;
      if (set.rpe < exercise.targetRpe - 1) anyLighterThanExpected = true;
    }
  }

  const painReportCount = session.painReports.length;
  const durationMs = new Date(completedAtIso).getTime() - new Date(startedAtIso).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  const averageRpe =
    rpeValues.length > 0
      ? Math.round((rpeValues.reduce((sum, v) => sum + v, 0) / rpeValues.length) * 10) / 10
      : null;

  const missedMajorityOfWork = workingSetsCompleted < totalPrescribedWorkingSets() / 2;

  // Fully completed means every prescribed working set has a valid logged
  // RPE and nothing anywhere in the session was skipped.
  const fullyCompleted =
    workingSetsCompleted > 0 &&
    exercisesSkipped === 0 &&
    skippedSetsCount === 0 &&
    missingRpeCount === 0;

  const needsReview =
    anyRpeAnomaly ||
    painReportCount > 0 ||
    exercisesSkipped > 0 ||
    skippedSetsCount > 0 ||
    missedMajorityOfWork;

  let headline: string;
  let detail: string;

  if (workingSetsCompleted === 0) {
    const { businessName, coachName } = resolveSessionIdentity(session);
    headline = "No performance data submitted.";
    detail = `No working-set data was submitted, so ${businessName} cannot evaluate today's performance. ${coachName} has been notified.`;
  } else {
    headline = fullyCompleted
      ? "Workout completed."
      : needsReview
        ? "Workout submitted — items flagged for review."
        : "Workout submitted.";

    const detailParts: string[] = [
      `${workingSetsCompleted} working set${workingSetsCompleted === 1 ? "" : "s"} logged across ${exercisesCompleted} exercise${exercisesCompleted === 1 ? "" : "s"}.`,
    ];

    if (averageRpe !== null) {
      detailParts.push(`Average logged RPE was ${averageRpe}.`);
    }
    if (anyLighterThanExpected) {
      detailParts.push("At least one logged set came in lighter than its target RPE.");
    }
    if (anyRpeAnomaly) {
      detailParts.push("At least one logged set ran harder than its target RPE.");
    }
    if (skippedSetsCount > 0) {
      detailParts.push(`${skippedSetsCount} set${skippedSetsCount === 1 ? "" : "s"} skipped this session.`);
    }
    if (exercisesSkipped > 0) {
      detailParts.push(`${exercisesSkipped} exercise${exercisesSkipped === 1 ? "" : "s"} skipped entirely.`);
    }
    if (missingRpeCount > 0) {
      detailParts.push(
        `${missingRpeCount} completed set${missingRpeCount === 1 ? "" : "s"} missing a valid RPE.`
      );
    }

    detail = detailParts.join(" ");
  }

  return {
    exercisesCompleted,
    exercisesSkipped,
    workingSetsCompleted,
    skippedSetsCount,
    missingRpeCount,
    averageRpe,
    painReportCount,
    durationMin,
    headline,
    detail,
    needsReview,
    fullyCompleted,
  };
}
