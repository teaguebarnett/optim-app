// Phase 11C — power/plyometric execution support (Box Jump, Broad Jump,
// Med Ball Chest Throw, Depth Jump, Bounds, Pogo Jumps, Sprint). A power
// item repeats its own real, family-specific prescription across N sets —
// structurally the same "do a set, rest, repeat" shape as resistance, but
// never a resistance set itself (spec section 3: "do not automatically
// classify every jump or throw as normal hypertrophy resistance work") —
// the per-set metric may be reps, contacts, or distance, never converted
// between them (spec section 6: "20 contacts != 20 reps automatically").
// Pure, deterministic, no UI/network/AI dependency — mirrors the discipline
// of lib/workout/continuous.ts/interval.ts/circuit.ts.

import { formatDistance } from "./continuous.ts";
import type { Prescription } from "../training/types.ts";

export function totalPowerSets(prescription: Prescription): number {
  return prescription.sets && prescription.sets > 0 ? prescription.sets : 1;
}

/** One short label per primitive this power item's own prescription
 * specifies — mirrors describeContinuousTarget's "only what's actually
 * there" discipline. Order: the per-set metric (reps/contacts/distance)
 * first, then load (rare but real, e.g. a loaded jump), then rest, then
 * the coach's own qualitative instruction (spec section 7: "Maximum
 * intent" preserved as coach instruction, never a fabricated numeric
 * score). */
export function describePowerSetTarget(prescription: Prescription): string {
  const parts: string[] = [];
  if (prescription.reps) parts.push(prescription.reps.low === prescription.reps.high ? `${prescription.reps.low} reps` : `${prescription.reps.low}-${prescription.reps.high} reps`);
  if (prescription.contacts !== undefined) parts.push(`${prescription.contacts} contacts`);
  if (prescription.distance) parts.push(formatDistance(prescription.distance));
  if (prescription.load) parts.push(`${prescription.load.value} ${prescription.load.unit}`);
  return parts.join(", ");
}

export function describePowerOverview(prescription: Prescription): string[] {
  const lines: string[] = [];
  const target = describePowerSetTarget(prescription);
  lines.push(`${totalPowerSets(prescription)} sets${target ? ` x ${target}` : ""}`);
  if (prescription.restSeconds) {
    const minutes = Math.floor(prescription.restSeconds / 60);
    const seconds = prescription.restSeconds % 60;
    lines.push(`${minutes}:${String(seconds).padStart(2, "0")} rest`);
  }
  if (prescription.completionTarget) lines.push(prescription.completionTarget);
  return lines;
}

// ---------------------------------------------------------------------------
// Adaptive capture — which actual fields are worth asking for, derived
// entirely from what the prescription specifies (same discipline as
// continuousCaptureFields/circuitCaptureFields).
// ---------------------------------------------------------------------------

export interface PowerCaptureFields {
  reps: boolean;
  contacts: boolean;
  distance: boolean;
}

export function powerCaptureFields(prescription: Prescription): PowerCaptureFields {
  return {
    reps: prescription.reps !== undefined,
    contacts: prescription.contacts !== undefined,
    distance: prescription.distance !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Completion classification (spec section 10: "do not mark power work
// performed-as-prescribed simply because the set count was tapped complete
// if relevant actuals materially differ") — mirrors
// classifyCircuitItemCompletion/circuitItemPerformedAsPrescribed exactly,
// generalized from "rounds of a block" to "sets of one item".
// ---------------------------------------------------------------------------

export interface PowerSetActualLike {
  status: "completed" | "skipped";
}

export function classifyPowerItemCompletion(totalSets: number, setActuals: PowerSetActualLike[]): "completed" | "skipped" | "partial" {
  const completedCount = setActuals.filter((s) => s.status === "completed").length;
  if (completedCount >= totalSets) return "completed";
  if (completedCount === 0) return "skipped";
  return "partial";
}

export function powerItemPerformedAsPrescribed(totalSets: number, setActuals: PowerSetActualLike[]): boolean {
  return setActuals.length === totalSets && setActuals.every((s) => s.status === "completed");
}
