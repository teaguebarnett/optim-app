// Phase 4 — continuous-work (Zone 2 bike, easy run, incline walk, etc.)
// execution support. Centralizes unit-aware display formatting and the one
// deterministic completed-vs-partial classifier so this logic never scatters
// across live-flow components (Phase 4 spec section 16). Pure, deterministic,
// no UI/network/AI dependency — mirrors the discipline of
// lib/workout/effort-policy.ts and rest-policy.ts.

import type { Prescription, PrescriptionDistance, PrescriptionHeartRate, PrescriptionPace } from "../training/types.ts";

// ---------------------------------------------------------------------------
// Display formatting — coaching language only, never backend terminology
// (Phase 4 spec section 14).
// ---------------------------------------------------------------------------

export function formatDurationMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function formatDistance(distance: PrescriptionDistance): string {
  const unitLabel = distance.unit === "m" ? "m" : distance.unit;
  const value = distance.unit === "m" ? Math.round(distance.value) : Math.round(distance.value * 10) / 10;
  return `${value} ${unitLabel}`;
}

export function formatPace(pace: PrescriptionPace): string {
  const totalSeconds = Math.round(pace.value * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const unitLabel = pace.unit === "min_per_mi" ? "/mi" : "/km";
  return `${minutes}:${String(seconds).padStart(2, "0")}${unitLabel}`;
}

export function formatHeartRate(heartRate: PrescriptionHeartRate): string {
  const range = heartRate.low === heartRate.high ? `${heartRate.low}` : `${heartRate.low}–${heartRate.high}`;
  return heartRate.zoneLabel ? `${heartRate.zoneLabel} (${range} BPM)` : `${range} BPM`;
}

/** One short label per primitive the prescription actually specifies — the
 * live UI renders exactly these, never a fixed template that assumes every
 * field is present (Phase 4 spec sections 3/8). Order is deliberately
 * duration/distance/pace first (the "what and how much"), then heart
 * rate/effort (the "how hard"), matching how a coach would say it aloud. */
export function describeContinuousTarget(prescription: Prescription): string[] {
  const parts: string[] = [];
  if (prescription.duration) parts.push(formatDurationMinutes(prescription.duration.seconds));
  if (prescription.distance) parts.push(formatDistance(prescription.distance));
  if (prescription.pace) parts.push(`Target pace ${formatPace(prescription.pace)}`);
  if (prescription.heartRate) parts.push(`Target HR ${formatHeartRate(prescription.heartRate)}`);
  if (prescription.power) parts.push(`${prescription.power.watts} W`);
  if (prescription.cadence !== undefined) parts.push(`Cadence ${prescription.cadence}`);
  if (prescription.rpe !== undefined) parts.push(`Target RPE ${prescription.rpe}`);
  if (prescription.completionTarget) parts.push(prescription.completionTarget);
  return parts;
}

// ---------------------------------------------------------------------------
// Adaptive capture — which actual fields are worth asking for, derived
// entirely from what the prescription specifies (Phase 4 spec section 8:
// "do not turn continuous work into a post-workout survey").
// ---------------------------------------------------------------------------

export interface ContinuousCaptureFields {
  duration: boolean;
  distance: boolean;
  heartRate: boolean;
  rpe: boolean;
}

export function continuousCaptureFields(prescription: Prescription): ContinuousCaptureFields {
  return {
    duration: prescription.duration !== undefined,
    distance: prescription.distance !== undefined,
    heartRate: prescription.heartRate !== undefined,
    rpe: prescription.rpe !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Completed vs. partial classification (Phase 4 spec section 10) — a
// deterministic, honest rule, never a client-facing judgment call. Only the
// primitives the prescription actually specifies participate; an
// unspecified target never counts against completion.
// ---------------------------------------------------------------------------

/** How far under a prescribed duration/distance target still counts as
 * "completed" rather than "partial" — allows for a normal, honest margin
 * (e.g. 29 of 30 minutes) without calling genuine under-completion
 * "complete". Not configurable in this phase; a coach-tunable threshold is a
 * later methodology concern, not a V1 architecture requirement. */
const COMPLETION_THRESHOLD_RATIO = 0.9;

export interface ContinuousActual {
  durationSeconds?: number;
  distanceValue?: number;
  heartRateAvg?: number;
  rpe?: number;
}

export function classifyContinuousCompletion(prescription: Prescription, actual: ContinuousActual): "completed" | "partial" {
  if (prescription.duration && actual.durationSeconds !== undefined) {
    if (actual.durationSeconds < prescription.duration.seconds * COMPLETION_THRESHOLD_RATIO) return "partial";
  }
  if (prescription.distance && actual.distanceValue !== undefined) {
    if (actual.distanceValue < prescription.distance.value * COMPLETION_THRESHOLD_RATIO) return "partial";
  }
  return "completed";
}

/** Whether `actual` matches the prescription closely enough to count as
 * "performed as prescribed" (LoggedSet.performedAsPrescribed's continuous
 * counterpart) — true only when every specified target was met at or above
 * the same completion threshold, with no meaningfully different reading. */
export function continuousPerformedAsPrescribed(prescription: Prescription, actual: ContinuousActual): boolean {
  return classifyContinuousCompletion(prescription, actual) === "completed";
}
