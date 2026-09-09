import { ALL_CLIENT_PROFILES, ALL_COACH_PROFILES, ALL_WORKSPACES } from "./tenancy/seed.ts";
import { classifyEffort } from "./workout/effort-policy.ts";
import type { Exercise, ExerciseLog, Workout, WorkoutSession, WorkoutSummary } from "./types";

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

export function totalPrescribedWorkingSets(workout: Workout | null): number {
  return workout ? workout.exercises.reduce((n, e) => n + e.workingSets, 0) : 0;
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
  workout: Workout | null,
  session: WorkoutSession,
  startedAtIso: string,
  completedAtIso: string
): WorkoutSummary {
  let exercisesCompleted = 0;
  let exercisesSkipped = 0;
  let workingSetsCompleted = 0;
  let skippedSetsCount = 0;
  let missingRpeCount = 0;
  let anyRpeAnomaly = false;
  let anyLighterThanExpected = false;
  const rpeValues: number[] = [];

  for (const exercise of workout?.exercises ?? []) {
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
      // Phase 4.4B-2.2 — goes through the same shared classifier the
      // immediate post-set headline and rest recommendation use (see
      // lib/workout/effort-policy.ts), so this summary can never disagree
      // with what the client already saw mid-session. Only the SEVERE
      // above-target tier counts as an anomaly worth flagging for review
      // here — the milder "near-max effort" tier already gets its own
      // supporting copy in real time (see buildImmediateSetFeedback) without
      // itself triggering a coach-review flag, and that distinction is
      // preserved rather than making every single-point RPE variance flag
      // the whole session.
      const effort = classifyEffort(set.rpe, exercise.targetRpe);
      if (effort.tier === "above-target" && effort.severe) anyRpeAnomaly = true;
      if (effort.tier === "below-target") anyLighterThanExpected = true;
    }
  }

  const painReportCount = session.painReports.length;
  const durationMs = new Date(completedAtIso).getTime() - new Date(startedAtIso).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  const averageRpe =
    rpeValues.length > 0
      ? Math.round((rpeValues.reduce((sum, v) => sum + v, 0) / rpeValues.length) * 10) / 10
      : null;

  const missedMajorityOfWork = workingSetsCompleted < totalPrescribedWorkingSets(workout) / 2;

  // Fully completed means every prescribed working set was actually
  // addressed with a valid logged RPE, nothing anywhere in the session was
  // skipped, AND no exercise was simply left untouched (not-started) — the
  // last check matters for an ended-early session, which never marks
  // remaining exercises "skipped" but still hasn't done the full workout.
  const fullyCompleted =
    workingSetsCompleted > 0 &&
    exercisesSkipped === 0 &&
    skippedSetsCount === 0 &&
    missingRpeCount === 0 &&
    workingSetsCompleted >= totalPrescribedWorkingSets(workout);

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

/**
 * Phase 4.4B-2.2 correction — WorkoutSummary.headline ("Workout submitted…",
 * "Workout completed.") is only ever accurate once COMPLETE_WORKOUT has
 * actually been dispatched and persisted (see lib/state.ts). The pre-
 * completion session-summary screen was previously rendering that exact
 * headline as a live PREVIEW, before the client had pressed "Complete
 * workout" — claiming the workout had already been submitted while its own
 * CTA still said "Complete workout." This is the distinct, honestly-tensed
 * copy for that PREVIEW moment only; the real `summary.headline` (used by
 * WorkoutCompleteScreen after the dispatch) is untouched. Derived from the
 * exact same real preview data, never a fifth independent judgment call.
 */
export function sessionReviewHeadline(preview: WorkoutSummary): string {
  if (preview.workingSetsCompleted === 0) return "Review your workout";
  if (preview.fullyCompleted) return "Workout ready to complete.";
  if (preview.needsReview) return "Review your workout — some items will be flagged for your coach.";
  return "Review your workout.";
}
