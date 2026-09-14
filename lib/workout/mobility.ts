// Phase 11C — mobility/flexibility execution support (Couch Stretch, 90/90
// Hip Rotation, Ankle Dorsiflexion Mobilization, Dead Hang, Thoracic
// Rotation). A mobility item repeats its own real prescription across N
// sets, exactly like power — but when the item's prescription.side is
// "bilateral" or "alternating", EACH set requires BOTH sides resolved as
// two separate, sequential exposures ("Set 1 of 2, LEFT 00:45, then RIGHT
// 00:45, then Set 2" — spec section 15's exact worked example), never one
// combined confirmation. A hold-duration item reuses Phase 11A's
// IntervalTimer for a guidance-only countdown (spec section 16); a
// rep-based item has no timer. Pure, deterministic, no UI/network/AI
// dependency — mirrors the discipline of lib/workout/interval.ts/circuit.ts.

import type { Prescription } from "../training/types.ts";

export function totalMobilitySets(prescription: Prescription): number {
  return prescription.sets && prescription.sets > 0 ? prescription.sets : 1;
}

/** True when this item's prescription requires BOTH sides resolved,
 * separately, per set (spec section 14: "the client experience should
 * understand that both required sides must be resolved... do not fake two
 * separate exercises if one movement with sided execution can represent it
 * honestly"). A single fixed side ("left" or "right" alone) or no side
 * concept at all (undefined) needs only one resolution per set. */
export function requiresBothSides(prescription: Prescription): boolean {
  return prescription.side === "bilateral" || prescription.side === "alternating";
}

export interface MobilityPosition {
  /** 1-indexed. */
  set: number;
  /** Which side is currently up, or null for a set with no side concept to
   * iterate (requiresBothSides is false). */
  side: "left" | "right" | null;
}

/** The mobility state machine's one real transition point — mirrors
 * nextCircuitPosition/nextIntervalProgress exactly: left -> right (same
 * set, dual-side item) -> next set's first side (or "complete" if that was
 * the last set). A single-resolution set (side null) advances straight to
 * the next set (or "complete"). */
export function nextMobilityPosition(prescription: Prescription, current: MobilityPosition): MobilityPosition | "complete" {
  const totalSets = totalMobilitySets(prescription);
  if (requiresBothSides(prescription) && current.side === "left") {
    return { set: current.set, side: "right" };
  }
  if (current.set >= totalSets) return "complete";
  return { set: current.set + 1, side: requiresBothSides(prescription) ? "left" : null };
}

/** How many real seconds a duration-based hold's current phase should run
 * for — undefined for a rep-based item (no timer to derive). */
export function holdDurationSeconds(prescription: Prescription): number | undefined {
  return prescription.duration?.seconds;
}

/** Mobility holds are commonly sub-minute (a 45-second stretch), so this
 * always shows real seconds/minutes precisely — unlike continuous cardio's
 * own formatDurationMinutes (lib/workout/continuous.ts), which rounds to
 * whole minutes because a duration of tens of minutes makes second-level
 * precision meaningless there. */
export function formatMobilityHoldSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes} min` : `${minutes} min ${remainder} sec`;
}

export function describeMobilitySetTarget(prescription: Prescription): string {
  const parts: string[] = [];
  if (prescription.duration) parts.push(formatMobilityHoldSeconds(prescription.duration.seconds));
  if (prescription.reps) parts.push(prescription.reps.low === prescription.reps.high ? `${prescription.reps.low} reps` : `${prescription.reps.low}-${prescription.reps.high} reps`);
  return parts.join(", ");
}

export function describeMobilityOverview(prescription: Prescription): string[] {
  const lines: string[] = [];
  const target = describeMobilitySetTarget(prescription);
  const sideSuffix = requiresBothSides(prescription) ? " / side" : prescription.side ? ` (${prescription.side})` : "";
  lines.push(`${totalMobilitySets(prescription)} sets${target ? ` x ${target}${sideSuffix}` : sideSuffix}`);
  if (prescription.completionTarget) lines.push(prescription.completionTarget);
  return lines;
}

// ---------------------------------------------------------------------------
// Adaptive capture — same discipline as continuousCaptureFields/
// circuitCaptureFields/powerCaptureFields.
// ---------------------------------------------------------------------------

export interface MobilityCaptureFields {
  duration: boolean;
  reps: boolean;
}

export function mobilityCaptureFields(prescription: Prescription): MobilityCaptureFields {
  return {
    duration: prescription.duration !== undefined,
    reps: prescription.reps !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Completion classification — mirrors classifyCircuitItemCompletion/
// classifyPowerItemCompletion exactly, generalized to "sets x required
// sides" total expected exposures.
// ---------------------------------------------------------------------------

export interface MobilitySetActualLike {
  status: "completed" | "skipped";
}

export function totalMobilityExposures(prescription: Prescription): number {
  return totalMobilitySets(prescription) * (requiresBothSides(prescription) ? 2 : 1);
}

export function classifyMobilityItemCompletion(totalExpected: number, setActuals: MobilitySetActualLike[]): "completed" | "skipped" | "partial" {
  const completedCount = setActuals.filter((s) => s.status === "completed").length;
  if (completedCount >= totalExpected) return "completed";
  if (completedCount === 0) return "skipped";
  return "partial";
}

export function mobilityItemPerformedAsPrescribed(totalExpected: number, setActuals: MobilitySetActualLike[]): boolean {
  return setActuals.length === totalExpected && setActuals.every((s) => s.status === "completed");
}
