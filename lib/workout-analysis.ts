import { ALL_CLIENT_PROFILES, ALL_COACH_PROFILES, ALL_WORKSPACES } from "./tenancy/seed.ts";
import { classifyEffort } from "./workout/effort-policy.ts";
import { formatDistance, formatDurationMinutes } from "./workout/continuous.ts";
import type { ExerciseLog, WorkoutSession, WorkoutSummary } from "./types";
import type { ExecutionRecord, Session, TrainingItemInstance } from "./training/types";

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

/** The absolute prescribed working-set numbers for a resistance training
 * item — warm-up sets occupy 1..warmupSets, so working sets follow at
 * warmupSets+1..warmupSets+sets, exactly mirroring the numbering
 * lib/coach/training.ts's buildPrescribedSets already generates. Shared by
 * lib/workout/session-flow.ts (which needs the same numbering to resolve
 * "what's next") so the two can never independently drift. */
export function absoluteWorkingSetNumbers(item: TrainingItemInstance): number[] {
  const warmupSets = item.prescription.warmupSets ?? 0;
  const workingSets = item.prescription.sets ?? 0;
  return Array.from({ length: workingSets }, (_, i) => warmupSets + i + 1);
}

export function totalPrescribedWorkingSets(session: Session | null): number {
  if (!session) return 0;
  // Phase 11C fix — a power item (Box Jump: sets:4) or a mobility item
  // (Couch Stretch: sets:2) ALSO carries a real `prescription.sets` field,
  // same as resistance, but neither ever writes to `loggedSets`/
  // `workingSetsCompleted` (they use their own powerSetActuals/
  // mobilitySetActuals via continuousExecutions instead — see
  // buildWorkoutSummary's own main loop, which already routes any
  // non-resistance family through that branch). Counting their `sets`
  // here polluted this RESISTANCE-specific total, making
  // resistanceFullyCompleted/missedMajorityOfWork silently false for any
  // session containing one, even when the power/mobility item itself
  // completed honestly — restricting to family==="resistance" matches
  // this function's own intent ("prescribed WORKING SETS", the
  // loggedSets-based concept).
  return session.blocks.reduce((n, b) => n + b.items.reduce((m, item) => m + (item.prescription.family === "resistance" ? (item.prescription.sets ?? 0) : 0), 0), 0);
}

/**
 * A prescribed working set only counts as addressed once the client submits
 * a valid RPE for it, or it's intentionally skipped. A training item can
 * only be marked complete once every prescribed working set is addressed
 * this way, and at least one of them was actually completed (not every set
 * skipped).
 */
export function canCompleteExercise(item: TrainingItemInstance, log: ExerciseLog): boolean {
  const workingSetNumbers = absoluteWorkingSetNumbers(item);
  const loggedByNumber = new Map(log.loggedSets.map((s) => [s.setNumber, s]));

  let hasValidCompletion = false;
  for (const setNumber of workingSetNumbers) {
    const logged = loggedByNumber.get(setNumber);
    if (!logged) return false;
    if (logged.status === "completed") {
      if (logged.rpe === null) return false;
      hasValidCompletion = true;
    }
    // status === "skipped" is intentionally accounted for — keep checking.
  }
  return hasValidCompletion;
}

/** Phase 4 — a short, honest one-line description of one continuous item's
 * outcome (e.g. "Bike: 22 min logged (partial)."), built strictly from real
 * actual values — never a fabricated pace/split the client never recorded.
 * Mirrors the resistance detail lines' own "state exactly what happened"
 * discipline.
 *
 * Phase 11A — an interval item's own real round count instead
 * (duration/distance describe the item as a whole and would misrepresent a
 * multi-round activity — see ExecutionRecord.roundActuals).
 *
 * Phase 11B — a circuit item's own real round count too (see
 * ExecutionRecord.circuitRoundActuals) — checked first, since a circuit's
 * RESISTANCE item has no duration/distance to fall back to at all (it
 * never had loggedSets in the first place — see buildWorkoutSummary's own
 * circuit-aware branch below). */
function describeContinuousExecution(name: string, execution: ExecutionRecord): string {
  const suffix = execution.status === "partial" ? " (partial)" : "";
  if (execution.circuitRoundActuals) {
    const completedCount = execution.circuitRoundActuals.filter((r) => r.status === "completed").length;
    // Phase 12B — a bilateral/alternating item's exposures are real
    // side-resolved units, not rounds (two per round) — "rounds completed"
    // would misstate the unit, so describe it the same honest "X of Y
    // completed" way mobilitySetActuals already does just below.
    if (execution.circuitRoundActuals.some((r) => r.side !== undefined)) {
      return `${name}: ${completedCount} of ${execution.circuitRoundActuals.length} completed${suffix}.`;
    }
    return `${name}: ${completedCount} round${completedCount === 1 ? "" : "s"} completed${suffix}.`;
  }
  if (execution.roundActuals) {
    const completedRounds = execution.roundActuals.filter((r) => r.status === "completed").length;
    return `${name}: ${completedRounds} round${completedRounds === 1 ? "" : "s"} completed${suffix}.`;
  }
  if (execution.powerSetActuals) {
    const completedSets = execution.powerSetActuals.filter((s) => s.status === "completed").length;
    return `${name}: ${completedSets} set${completedSets === 1 ? "" : "s"} completed${suffix}.`;
  }
  if (execution.mobilitySetActuals) {
    const completedExposures = execution.mobilitySetActuals.filter((s) => s.status === "completed").length;
    return `${name}: ${completedExposures} of ${execution.mobilitySetActuals.length} completed${suffix}.`;
  }
  // Phase 11D — an EMOM item's own real window count.
  if (execution.emomWindowActuals) {
    const completedWindows = execution.emomWindowActuals.filter((w) => w.status === "completed").length;
    return `${name}: ${completedWindows} of ${execution.emomWindowActuals.length} window${execution.emomWindowActuals.length === 1 ? "" : "s"} completed${suffix}.`;
  }
  const parts: string[] = [];
  if (execution.actual?.duration) parts.push(formatDurationMinutes(execution.actual.duration.seconds));
  if (execution.actual?.distance) parts.push(formatDistance(execution.actual.distance));
  return parts.length > 0 ? `${name}: ${parts.join(", ")} logged${suffix}.` : `${name} logged${suffix}.`;
}

export function buildWorkoutSummary(
  trainingSession: Session | null,
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

  // Phase 4 — continuous work's own tallies, kept entirely separate from the
  // resistance set-based ones above: neither family's metrics may corrupt
  // the other's (spec section 21 — never a fake volume calculation, and
  // never silently dropping a real continuous completion just because it
  // has zero "working sets").
  let continuousItemCount = 0;
  let continuousCompletedCount = 0;
  let continuousPartialCount = 0;
  const continuousDescriptions: string[] = [];

  const items = trainingSession?.blocks.flatMap((b) => b.items) ?? [];
  for (const item of items) {
    const log = session.exerciseLogs[item.id];
    if (!log) continue;

    // Phase 11B — a circuit item's real actual lives in
    // continuousExecutions[id].circuitRoundActuals regardless of the
    // item's own family (a circuit's resistance item never accumulates
    // loggedSets — see lib/state.ts's FINALIZE_CIRCUIT_EXECUTION), so it
    // must route through this branch too, not the working-set branch
    // below, which would otherwise silently see zero loggedSets and never
    // count it. This "bucket" is really "everything not using the
    // loggedSets/working-set model," which every circuit item genuinely
    // is not.
    const isCircuitExposure = session.continuousExecutions?.[item.id]?.circuitRoundActuals !== undefined;
    // Phase 11D — an EMOM item's own resistance exposure has the exact
    // same problem circuit's own resistance items did in Phase 11B (zero
    // loggedSets — see lib/state.ts's ADVANCE_EMOM_WINDOW), same fix.
    const isEmomExposure = session.continuousExecutions?.[item.id]?.emomWindowActuals !== undefined;
    if (item.prescription.family !== "resistance" || isCircuitExposure || isEmomExposure) {
      continuousItemCount += 1;
      if (log.status === "skipped") {
        exercisesSkipped += 1;
        continue;
      }
      const execution = session.continuousExecutions?.[item.id];
      if (execution) {
        exercisesCompleted += 1;
        if (execution.status === "partial") continuousPartialCount += 1;
        else continuousCompletedCount += 1;
        continuousDescriptions.push(describeContinuousExecution(item.name, execution));
      }
      continue;
    }

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

    // Every real resistance item always carries a target RPE (the legacy
    // adapter requires it, mirroring Exercise.targetRpe's own required
    // field) — this is only undefined for a structurally-permitted-but-
    // never-real Prescription, in which case anomaly classification is
    // honestly skipped rather than guessed (the RPE value itself still
    // counts toward the average below).
    const targetRpe = item.prescription.rpe;

    for (const set of completedWorkingSets) {
      if (set.rpe === null) {
        missingRpeCount += 1;
        continue;
      }
      rpeValues.push(set.rpe);
      if (targetRpe !== undefined) {
        // Phase 4.4B-2.2 — goes through the same shared classifier the
        // immediate post-set headline and rest recommendation use (see
        // lib/workout/effort-policy.ts), so this summary can never disagree
        // with what the client already saw mid-session. Only the SEVERE
        // above-target tier counts as an anomaly worth flagging for review
        // here — the milder "near-max effort" tier already gets its own
        // supporting copy in real time (see buildImmediateSetFeedback)
        // without itself triggering a coach-review flag, and that
        // distinction is preserved rather than making every single-point
        // RPE variance flag the whole session.
        const effort = classifyEffort(set.rpe, targetRpe);
        if (effort.tier === "above-target" && effort.severe) anyRpeAnomaly = true;
        if (effort.tier === "below-target") anyLighterThanExpected = true;
      }
    }
  }

  const painReportCount = session.painReports.length;
  const durationMs = new Date(completedAtIso).getTime() - new Date(startedAtIso).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  const averageRpe =
    rpeValues.length > 0
      ? Math.round((rpeValues.reduce((sum, v) => sum + v, 0) / rpeValues.length) * 10) / 10
      : null;

  const totalPrescribedSets = totalPrescribedWorkingSets(trainingSession);
  const hasResistanceWork = totalPrescribedSets > 0;
  const missedMajorityOfWork = hasResistanceWork && workingSetsCompleted < totalPrescribedSets / 2;

  // Fully completed means every prescribed working set was actually
  // addressed with a valid logged RPE, nothing anywhere in the session was
  // skipped, AND no exercise was simply left untouched (not-started) — the
  // last check matters for an ended-early session, which never marks
  // remaining exercises "skipped" but still hasn't done the full workout.
  // Phase 4 generalizes this to a session that's entirely (or partly)
  // continuous work: each family's own completeness is judged on its own
  // terms, never forcing a "sets" concept onto continuous items or vice
  // versa (spec section 21) — see resistanceFullyCompleted/
  // continuousFullyCompleted below.
  const resistanceFullyCompleted =
    !hasResistanceWork ||
    (workingSetsCompleted > 0 && skippedSetsCount === 0 && missingRpeCount === 0 && workingSetsCompleted >= totalPrescribedSets);
  const continuousFullyCompleted = continuousItemCount === 0 || (continuousPartialCount === 0 && continuousCompletedCount === continuousItemCount);
  const anyRealWorkPrescribed = hasResistanceWork || continuousItemCount > 0;

  const fullyCompleted = anyRealWorkPrescribed && exercisesSkipped === 0 && resistanceFullyCompleted && continuousFullyCompleted;

  const needsReview =
    anyRpeAnomaly ||
    painReportCount > 0 ||
    exercisesSkipped > 0 ||
    skippedSetsCount > 0 ||
    missedMajorityOfWork ||
    continuousPartialCount > 0;

  let headline: string;
  let detail: string;

  const anyContinuousDataSubmitted = continuousCompletedCount + continuousPartialCount > 0;

  if (workingSetsCompleted === 0 && !anyContinuousDataSubmitted) {
    const { businessName, coachName } = resolveSessionIdentity(session);
    headline = "No performance data submitted.";
    detail = `No performance data was submitted, so ${businessName} cannot evaluate today's session. ${coachName} has been notified.`;
  } else {
    headline = fullyCompleted
      ? "Workout completed."
      : needsReview
        ? "Workout submitted — items flagged for review."
        : "Workout submitted.";

    const detailParts: string[] = [];

    if (workingSetsCompleted > 0) {
      const resistanceExercisesCompleted = exercisesCompleted - continuousCompletedCount - continuousPartialCount;
      detailParts.push(
        `${workingSetsCompleted} working set${workingSetsCompleted === 1 ? "" : "s"} logged across ${resistanceExercisesCompleted} exercise${resistanceExercisesCompleted === 1 ? "" : "s"}.`
      );
    }

    detailParts.push(...continuousDescriptions);

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
