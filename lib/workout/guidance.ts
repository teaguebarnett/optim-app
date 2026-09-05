// Phase 4.4B-2 — deterministic, explainable OPTIM guidance.
//
// Every function here is a pure derivation from real, already-logged
// telemetry (this session's own sets, and the exercise's own real
// previousPerformance — never a network/LLM call, never invented). Language
// is deliberately cautious ("may indicate", "trend", "signal") wherever
// causality isn't certain, per this phase's spec. A signal is only ever
// produced when the comparison it's based on is actually valid — see each
// function's own guard for what counts as "enough data."

import { classifyEffort } from "./effort-policy.ts";
import type { Exercise, ExerciseLog, LoggedSet, PreviousPerformanceEntry, Workout, WorkoutSession } from "../types";

// ---------------------------------------------------------------------------
// Immediate, per-set feedback (Phase 4.4B-2 §G)
// ---------------------------------------------------------------------------

export type SetFeedbackCategory =
  | "within-target"
  | "below-target"
  /** One point above target, or actual RPE 9 — near-max but not itself
   * flagged for coach review (see lib/workout/effort-policy.ts's "above
   * -target", not severe). Distinct from "exceeded-target" below. */
  | "above-target"
  | "exceeded-target"
  | "deviated-from-prescription"
  | "skipped";

export interface SetFeedback {
  category: SetFeedbackCategory;
  message: string;
  /** A material anomaly this set represents — the caller uses this to
   * decide whether it belongs in the session's coach-review signals rather
   * than only appearing as calm in-flow copy. */
  forCoachReview: boolean;
}

/** Feedback shown immediately after one working set is logged or skipped —
 * compares the real logged RPE against this exercise's real target RPE.
 * Never fabricates an adjustment; only describes what the data shows. */
export function buildImmediateSetFeedback(exercise: Exercise, loggedSet: LoggedSet): SetFeedback {
  if (loggedSet.status === "skipped") {
    return { category: "skipped", message: "This set was skipped — noted for your coach.", forCoachReview: true };
  }

  if (loggedSet.performedAsPrescribed === false) {
    return {
      category: "deviated-from-prescription",
      message: "Logged as performed differently from the prescription.",
      forCoachReview: true,
    };
  }

  const rpe = loggedSet.rpe;
  if (rpe === null) {
    return { category: "deviated-from-prescription", message: "No RPE was recorded for this set.", forCoachReview: true };
  }

  const target = exercise.targetRpe;
  // Phase 4.4B-2.2 correction — this used to re-derive its own "exceeded
  // target" threshold (rpe > target + 1) independently from rest-policy.ts's
  // recommendRest, which already treated one point above target (or an
  // absolute RPE of 9) as elevated. A set at target 8 / actual 9 could
  // widen the recommended rest while this headline still called it "within
  // the target range" — see lib/workout/effort-policy.ts for the one shared
  // classification both now go through.
  const effort = classifyEffort(rpe, target);
  if (effort.tier === "above-target" && effort.severe) {
    return {
      category: "exceeded-target",
      message: `Effort exceeded the target RPE of ${target} — may indicate this load is heavier than intended right now.`,
      forCoachReview: true,
    };
  }
  if (effort.tier === "above-target") {
    return {
      category: "above-target",
      message: `Effort was above the target range — that set was near max effort relative to the RPE ${target} target.`,
      forCoachReview: false,
    };
  }
  if (effort.tier === "below-target") {
    return {
      category: "below-target",
      message: `Effort came in below the target RPE of ${target} — may indicate room to push a little more today.`,
      forCoachReview: false,
    };
  }
  return { category: "within-target", message: "Effort was within the target range.", forCoachReview: false };
}

// Phase 4.4B-2.1 — the rest-recommendation + elevated-effort note that used
// to live here as a separate `restGuidanceMessage` now come from the one
// rest-recommendation policy instead, so the number and its supporting copy
// can never disagree — see lib/workout/rest-policy.ts's recommendRest.

// ---------------------------------------------------------------------------
// "Last time" comparable-set reference (Phase 4.4B-2 §C)
// ---------------------------------------------------------------------------

/** The prior comparable working set for the set the client is about to
 * perform (e.g. the previous Set 2, while preparing for Set 2 again) —
 * `workingSetDisplayIndex` is 0-based among this exercise's working sets
 * (not the absolute prescribed set number, which also counts warm-ups).
 * Null when no comparable entry exists — never padded or guessed. */
export function comparablePreviousSetPerformance(
  exercise: Exercise,
  workingSetDisplayIndex: number
): PreviousPerformanceEntry | null {
  return exercise.previousPerformance[workingSetDisplayIndex] ?? null;
}

// ---------------------------------------------------------------------------
// Session-level coaching signals (Phase 4.4B-2 §"What OPTIM may infer")
// ---------------------------------------------------------------------------

export interface SessionGuidanceSignal {
  message: string;
  forCoachReview: boolean;
}

function workingLoggedSets(log: ExerciseLog): LoggedSet[] {
  return log.loggedSets.filter((s) => !s.isWarmup && s.status === "completed").sort((a, b) => a.setNumber - b.setNumber);
}

/** RPE rising materially across a single exercise's own sets this session —
 * a fatigue/volume-tolerance signal, not a diagnosis. Requires at least
 * three valid RPE readings so a single noisy set can't trigger it. */
function detectRisingRpe(exercise: Exercise, log: ExerciseLog): SessionGuidanceSignal | null {
  const sets = workingLoggedSets(log).filter((s) => s.rpe !== null);
  if (sets.length < 3) return null;
  const first = sets[0].rpe as number;
  const last = sets[sets.length - 1].rpe as number;
  const strictlyNonDecreasing = sets.every((s, i) => i === 0 || (s.rpe as number) >= (sets[i - 1].rpe as number));
  if (strictlyNonDecreasing && last - first >= 2) {
    return {
      message: `RPE rose noticeably across ${exercise.name} this session — may signal accumulating fatigue worth a coach review.`,
      forCoachReview: true,
    };
  }
  return null;
}

/** Performance possibly improving relative to real prior history — only
 * produced when there's an actual comparable previous set (same working-set
 * position) with a known weight, and this session's logged weight at that
 * position is higher at an equal-or-lower RPE. Omitted entirely when there
 * isn't enough real data to compare. */
function detectImprovingTrend(exercise: Exercise, log: ExerciseLog): SessionGuidanceSignal | null {
  const sets = workingLoggedSets(log);
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const prior = comparablePreviousSetPerformance(exercise, i);
    if (!prior || set.weightLb === null || set.rpe === null) continue;
    if (set.weightLb > prior.weightLb && set.rpe <= prior.rpe) {
      return {
        message: `${exercise.name} may be trending upward — a heavier load than last time at a comparable or lower RPE.`,
        forCoachReview: false,
      };
    }
  }
  return null;
}

export interface SessionGuidanceContext {
  /** Technique concerns flagged for coach review during this session (see
   * FLAG_TECHNIQUE_QUESTION) — passed in rather than read internally, since
   * review requests live on AppState, not WorkoutSession. */
  techniqueFlagCount: number;
}

/**
 * The full set of session-level guidance signals shown on the completion
 * summary — every entry traces to real logged data on `session`/`workout`;
 * nothing is invented when the underlying comparison isn't valid.
 */
export function buildSessionGuidanceSignals(
  workout: Workout,
  session: WorkoutSession,
  context: SessionGuidanceContext
): SessionGuidanceSignal[] {
  const signals: SessionGuidanceSignal[] = [];

  for (const exercise of workout.exercises) {
    const log = session.exerciseLogs[exercise.id];
    if (!log || log.status === "skipped" || log.status === "not-started") continue;
    const rising = detectRisingRpe(exercise, log);
    if (rising) signals.push(rising);
    const improving = detectImprovingTrend(exercise, log);
    if (improving) signals.push(improving);
  }

  const deviatedCount = Object.values(session.exerciseLogs).reduce(
    (sum, log) => sum + log.loggedSets.filter((s) => s.status === "completed" && s.performedAsPrescribed === false).length,
    0
  );
  if (deviatedCount > 0) {
    signals.push({
      message: `${deviatedCount} working set${deviatedCount === 1 ? "" : "s"} performed differently from the prescription this session.`,
      forCoachReview: true,
    });
  }

  const skippedWarmups = Object.values(session.exerciseWarmups).filter((w) => w.status === "skipped").length;
  if (skippedWarmups > 0) {
    signals.push({
      message: `Warm-up was skipped for ${skippedWarmups} exercise${skippedWarmups === 1 ? "" : "s"} this session.`,
      forCoachReview: false,
    });
  }

  const resolvedPlannedOrder = workout.exercises.map((e) => e.id).filter((id) => session.actualExerciseOrder.includes(id));
  const actualOrderResolvedOnly = session.actualExerciseOrder.filter((id) => resolvedPlannedOrder.includes(id));
  if (
    resolvedPlannedOrder.length > 1 &&
    resolvedPlannedOrder.join(",") !== actualOrderResolvedOnly.join(",")
  ) {
    signals.push({
      message: "Exercise order differed from the programmed sequence — reflects a deferral made during the session.",
      forCoachReview: false,
    });
  }

  if (session.painReports.length > 0) {
    signals.push({
      message: "Pain was reported during this session — flagged for coach review.",
      forCoachReview: true,
    });
  }

  if (context.techniqueFlagCount > 0) {
    signals.push({
      message: `${context.techniqueFlagCount} technique concern${context.techniqueFlagCount === 1 ? "" : "s"} flagged for coach review this session.`,
      forCoachReview: true,
    });
  }

  return signals;
}
