// Phase 11A — interval/HIIT execution support. Mirrors
// lib/workout/continuous.ts's own discipline exactly: pure, deterministic,
// no UI/network/AI dependency, coaching language only. An interval workout
// is a distinct prescription family (spec section 3), not a resistance
// exercise repeated several times — this module is what gives it its own
// round/phase state machine instead of falling through the generic
// one-shot continuous flow.
//
// Design note on the timer (spec section 7): this codebase deliberately has
// no countdown/forced-gate timer anywhere else (see
// lib/workout/rest-policy.ts's own "guidance, not a forced gate"
// philosophy). The functions here never auto-dispatch a phase transition —
// a live countdown display (built in components/workout/live/interval-timer.tsx)
// is derived from a real timestamp anchor purely for the client's own
// awareness; advancing to the next phase is always an explicit client
// action. This is also what makes "no accidental advancement while
// backgrounded/re-rendered" trivially true: nothing here mutates state on a
// timer tick, so a backgrounded tab can never silently skip a round.

import type { IntervalRoundActual, Prescription } from "../training/types.ts";
import { formatDistance, formatEffort, formatHeartRate, formatPace } from "./continuous.ts";

export type IntervalPhaseKind = "work" | "recovery";

export interface IntervalProgress {
  /** 1-indexed. */
  round: number;
  phase: IntervalPhaseKind;
}

export function totalIntervalRounds(prescription: Prescription): number {
  return prescription.rounds && prescription.rounds > 0 ? prescription.rounds : 1;
}

export function hasRecoveryPhase(prescription: Prescription): boolean {
  return prescription.recoveryInterval !== undefined || prescription.recoveryDistance !== undefined;
}

/** True for a work interval prescribed by real elapsed TIME — the only case
 * a live countdown can be derived from a timestamp anchor. A distance-based
 * interval ("400m") has no time target to count down, so it uses a plain
 * manual round-by-round flow instead (spec section 8's own "do not force
 * distance intervals through a fake duration representation"). */
export function isTimeBasedWork(prescription: Prescription): boolean {
  return prescription.workInterval !== undefined;
}

export function isTimeBasedRecovery(prescription: Prescription): boolean {
  return prescription.recoveryInterval !== undefined;
}

export function phaseDurationSeconds(prescription: Prescription, phase: IntervalPhaseKind): number | undefined {
  return phase === "work" ? prescription.workInterval?.seconds : prescription.recoveryInterval?.seconds;
}

/**
 * The one deterministic state-machine transition this whole feature is
 * built on (spec test matrix I/J/K): given the phase that was JUST
 * completed, what comes next. Work always leads into that same round's
 * recovery when one is prescribed; otherwise (or once recovery itself
 * finishes) it's the next round's work, or "complete" once the final round
 * is done. Pure — no Date.now(), no randomness, no side effect.
 */
export function nextIntervalProgress(prescription: Prescription, current: IntervalProgress): IntervalProgress | "complete" {
  const rounds = totalIntervalRounds(prescription);
  if (current.phase === "work" && hasRecoveryPhase(prescription)) {
    return { round: current.round, phase: "recovery" };
  }
  return current.round < rounds ? { round: current.round + 1, phase: "work" } : "complete";
}

// ---------------------------------------------------------------------------
// Display formatting — coaching language only, mirroring
// lib/workout/continuous.ts's describeContinuousTarget exactly.
// ---------------------------------------------------------------------------

/** Short interval-appropriate duration label ("45 sec", "90 sec") — deliberately
 * distinct from lib/workout/continuous.ts's formatDurationMinutes, which
 * rounds to whole minutes and would collapse a real 45-second work interval
 * down to "1 min". */
export function formatIntervalSeconds(seconds: number): string {
  return `${Math.round(seconds)} sec`;
}

/** The activity-level overview shown on the ready screen before starting —
 * round count plus a compact work/recovery summary line, never a fixed
 * template assuming every field is present. */
export function describeIntervalOverview(prescription: Prescription): string[] {
  const parts: string[] = [`${totalIntervalRounds(prescription)} rounds`];
  const work = prescription.workInterval ? `${formatIntervalSeconds(prescription.workInterval.seconds)} work` : prescription.distance ? `${formatDistance(prescription.distance)} work` : null;
  const recovery = prescription.recoveryInterval
    ? `${formatIntervalSeconds(prescription.recoveryInterval.seconds)} recovery`
    : prescription.recoveryDistance
      ? `${formatDistance(prescription.recoveryDistance)} recovery`
      : null;
  if (work && recovery) parts.push(`${work} / ${recovery}`);
  else if (work) parts.push(work);
  if (prescription.rpe !== undefined) parts.push(`Target RPE ${prescription.rpe}`);
  if (prescription.effort) parts.push(`Work: ${formatEffort(prescription.effort)}`);
  if (prescription.pace) parts.push(`Target pace ${formatPace(prescription.pace)}`);
  if (prescription.heartRate) parts.push(`Target HR ${formatHeartRate(prescription.heartRate)}`);
  return parts;
}

/** What the client sees for the CURRENT phase specifically (work or
 * recovery) — the live round/phase screen renders exactly these lines. */
export function describeIntervalPhaseTarget(prescription: Prescription, phase: IntervalPhaseKind): string[] {
  const parts: string[] = [];
  if (phase === "work") {
    if (prescription.workInterval) parts.push(formatIntervalSeconds(prescription.workInterval.seconds));
    if (prescription.distance) parts.push(formatDistance(prescription.distance));
    if (prescription.pace) parts.push(`Target pace ${formatPace(prescription.pace)}`);
    if (prescription.heartRate) parts.push(`Target HR ${formatHeartRate(prescription.heartRate)}`);
    if (prescription.rpe !== undefined) parts.push(`Target RPE ${prescription.rpe}`);
    if (prescription.effort) parts.push(formatEffort(prescription.effort));
  } else {
    if (prescription.recoveryInterval) parts.push(formatIntervalSeconds(prescription.recoveryInterval.seconds));
    if (prescription.recoveryDistance) parts.push(formatDistance(prescription.recoveryDistance));
    if (prescription.recoveryEffort) parts.push(formatEffort(prescription.recoveryEffort));
    if (parts.length === 0) parts.push("Easy — recover");
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Completion classification — mirrors lib/workout/continuous.ts's own
// deterministic, honest completed-vs-partial rule (spec sections 11/12).
// ---------------------------------------------------------------------------

/**
 * "completed" only once every prescribed round has a real completed round
 * actual; anything less (including a round present but explicitly skipped)
 * is "partial" — never a vague percentage, the raw roundActuals array is
 * always preserved alongside this classification (spec section 11).
 */
export function classifyIntervalActivityCompletion(prescription: Prescription, roundActuals: IntervalRoundActual[]): "completed" | "partial" {
  const rounds = totalIntervalRounds(prescription);
  const completedCount = roundActuals.filter((r) => r.status === "completed").length;
  return completedCount >= rounds ? "completed" : "partial";
}

/**
 * Honest performed-as-prescribed (spec section 12): true only when every
 * single round was both attempted AND completed — a round the client
 * tapped through early (actualWorkSeconds meaningfully under the
 * prescribed target) still counts as "completed" for round-status
 * purposes (the client says they finished it), but activity-level
 * performedAsPrescribed additionally requires the full round count with no
 * skips at all. This mirrors LoggedSet.performedAsPrescribed's own
 * "never invent, only record" discipline — never true merely because the
 * client tapped through the flow.
 */
export function intervalPerformedAsPrescribed(prescription: Prescription, roundActuals: IntervalRoundActual[]): boolean {
  const rounds = totalIntervalRounds(prescription);
  return roundActuals.length === rounds && roundActuals.every((r) => r.status === "completed");
}
