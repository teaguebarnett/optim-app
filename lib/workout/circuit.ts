// Phase 11B — circuit/grouped-training execution support. Mirrors
// lib/workout/interval.ts's own discipline: pure, deterministic, no UI/
// network/AI dependency, coaching language only. A circuit is a BLOCK
// behavior (spec section 3) — multiple DIFFERENT TrainingItemInstances
// performed sequentially, with the whole group repeating for real rounds —
// never a fake exercise, never N cloned items.
//
// Timer note (mirrors interval's own): between-ROUND rest reuses
// components/workout/live/interval-timer.tsx's guidance-only countdown.
// Between-ITEM rest deliberately has NO dedicated timer screen at all —
// this matches this codebase's own pre-existing, deliberate rest-policy.ts
// decision ("guidance, not a forced gate") for between-SET rest; showing
// restBetweenItemsSeconds as a brief advisory caption on the current
// item's own screen keeps taps minimal (spec section 6) without inventing
// a second rest-timer philosophy alongside the one this codebase already
// chose.

import type { Block, Prescription, TrainingItemInstance } from "../training/types.ts";
import { formatDistance, formatHeartRate, formatPace } from "./continuous.ts";
import { formatIntervalSeconds } from "./interval.ts";

export type CircuitPhaseKind = "item" | "round-rest";

export interface CircuitPosition {
  /** 1-indexed. */
  round: number;
  /** 0-indexed position within block.items. */
  itemIndex: number;
  phase: CircuitPhaseKind;
}

export function totalCircuitRounds(block: Block): number {
  return block.rounds && block.rounds > 0 ? block.rounds : 1;
}

/**
 * The one deterministic state-machine transition circuit execution is
 * built on (spec test matrix J/K/L/M/N): given the phase that was JUST
 * resolved (an item logged, or round-rest finished), what comes next.
 * Pure — no Date.now(), no randomness, no side effect. Mirrors
 * lib/workout/interval.ts's nextIntervalProgress exactly in spirit.
 */
export function nextCircuitPosition(block: Block, current: CircuitPosition): CircuitPosition | "complete" {
  const rounds = totalCircuitRounds(block);
  if (current.phase === "item") {
    if (current.itemIndex + 1 < block.items.length) {
      return { round: current.round, itemIndex: current.itemIndex + 1, phase: "item" };
    }
    // Last item in the round just resolved.
    return current.round < rounds ? { round: current.round, itemIndex: current.itemIndex, phase: "round-rest" } : "complete";
  }
  // phase === "round-rest" finished -> first item of the next round.
  return { round: current.round + 1, itemIndex: 0, phase: "item" };
}

// ---------------------------------------------------------------------------
// Display formatting — coaching language only, reusing the exact same
// per-family formatters resistance/continuous review/execution already use
// rather than a third independently-drifting description.
// ---------------------------------------------------------------------------

/** One short target line for a circuit item, dispatched by its own real
 * family — never a fixed template assuming every field is present.
 * Resistance: "12 reps" (never fabricates a set count — a circuit item's
 * own prescription.sets is not meaningful here; the circuit's rounds ARE
 * the repetition, spec section 10). Continuous: reuses the same
 * duration/distance/pace/HR/RPE formatting the ready/logging panels use. */
export function describeCircuitItemTarget(item: TrainingItemInstance): string {
  const p = item.prescription;
  if (p.family === "resistance") {
    const reps = p.reps ? (p.reps.low === p.reps.high ? `${p.reps.low} reps` : `${p.reps.low}-${p.reps.high} reps`) : null;
    const load = p.load ? `${p.load.value} ${p.load.unit}` : null;
    const rpe = p.rpe !== undefined ? `RPE ${p.rpe}` : null;
    return [reps, load, rpe].filter(Boolean).join(", ") || "bodyweight";
  }
  const parts: string[] = [];
  if (p.duration) parts.push(formatIntervalSeconds(p.duration.seconds));
  if (p.distance) parts.push(formatDistance(p.distance));
  if (p.pace) parts.push(`Target pace ${formatPace(p.pace)}`);
  if (p.heartRate) parts.push(`Target HR ${formatHeartRate(p.heartRate)}`);
  if (p.rpe !== undefined) parts.push(`RPE ${p.rpe}`);
  return parts.join(", ") || item.name;
}

/** The circuit-level overview shown on the ready screen and in coach
 * review — round count plus each item's own name/target, never raw JSON
 * (spec section 25). */
export function describeCircuitOverview(block: Block): string[] {
  const rounds = totalCircuitRounds(block);
  const lines = [`${rounds} round${rounds === 1 ? "" : "s"}`];
  block.items.forEach((item, i) => lines.push(`${i + 1}. ${item.name} — ${describeCircuitItemTarget(item)}`));
  if (block.restBetweenRoundsSeconds !== undefined) lines.push(`${formatIntervalSeconds(block.restBetweenRoundsSeconds)} between rounds`);
  return lines;
}

// ---------------------------------------------------------------------------
// Completion classification — mirrors lib/workout/interval.ts's own
// deterministic, honest completed-vs-partial rule.
// ---------------------------------------------------------------------------

export interface CircuitExposureLike {
  roundNumber: number;
  status: "completed" | "skipped";
}

/**
 * A circuit round counts as "fully completed" only when every item in the
 * block has a real "completed" exposure recorded for that round — a round
 * with even one item skipped or missing is not a completed round (spec
 * section 13's own "do not mark Round 2 complete" when only 2 of 4 items
 * were done).
 */
export function completedCircuitRounds(block: Block, exposuresByItemId: Record<string, CircuitExposureLike[]>): number {
  const rounds = totalCircuitRounds(block);
  let completed = 0;
  for (let round = 1; round <= rounds; round++) {
    const allItemsDoneThisRound = block.items.every((item) => (exposuresByItemId[item.id] ?? []).some((e) => e.roundNumber === round && e.status === "completed"));
    if (allItemsDoneThisRound) completed += 1;
    else break; // rounds are sequential — a later round can't be "complete" if an earlier one isn't (never a gap).
  }
  return completed;
}

export function classifyCircuitCompletion(block: Block, exposuresByItemId: Record<string, CircuitExposureLike[]>): "completed" | "partial" {
  return completedCircuitRounds(block, exposuresByItemId) >= totalCircuitRounds(block) ? "completed" : "partial";
}

/** Honest performed-as-prescribed: every round of every item completed,
 * with zero skipped exposures anywhere — mirrors
 * intervalPerformedAsPrescribed's own "never invent, only record"
 * discipline. */
export function circuitPerformedAsPrescribed(block: Block, exposuresByItemId: Record<string, CircuitExposureLike[]>): boolean {
  const rounds = totalCircuitRounds(block);
  return block.items.every((item) => {
    const exposures = exposuresByItemId[item.id] ?? [];
    return exposures.length === rounds && exposures.every((e) => e.status === "completed");
  });
}

/** ONE item's own status across every round of the circuit it belongs to —
 * used to build that item's real ExecutionRecord.status at finalize time.
 * Zero exposures at all (the item was never reached, including a
 * whole-circuit skip before starting) is honestly "skipped," never
 * "partial" — mirrors classifyContinuousCompletion's own boundary
 * discipline, scoped to one item instead of the whole activity. */
export function classifyCircuitItemCompletion(totalRounds: number, exposures: CircuitExposureLike[]): "completed" | "skipped" | "partial" {
  const completedCount = exposures.filter((e) => e.status === "completed").length;
  if (completedCount >= totalRounds) return "completed";
  if (completedCount === 0) return "skipped";
  return "partial";
}

/** Honest per-item performed-as-prescribed: every round for THIS item was
 * both attempted and completed. */
export function circuitItemPerformedAsPrescribed(totalRounds: number, exposures: CircuitExposureLike[]): boolean {
  return exposures.length === totalRounds && exposures.every((e) => e.status === "completed");
}

/** Whether an item's own family has rich, family-specific per-exposure
 * capture the circuit layer already knows how to build an actual for
 * (spec section 11: "reuse existing family-specific logging behavior...
 * should not recreate all family-specific logging logic"). Anything else
 * (interval, circuit, quality — deferred families, spec section 21) still
 * executes safely through a generic completion-only capture, never a
 * crash. */
export function hasRichCircuitCapture(prescription: Prescription): boolean {
  return prescription.family === "resistance" || prescription.family === "continuous";
}

/** Which actual fields are worth asking for on ONE circuit exposure —
 * derived entirely from what the item's own prescription specifies,
 * mirroring lib/workout/continuous.ts's own continuousCaptureFields
 * exactly (spec section 38: "avoid forcing a complex form... optimize for
 * flow"). Generalizes it to resistance too, since a circuit item's
 * quick-confirmation capture spans both families. */
export interface CircuitCaptureFields {
  reps: boolean;
  load: boolean;
  duration: boolean;
  distance: boolean;
  rpe: boolean;
}

export function circuitCaptureFields(prescription: Prescription): CircuitCaptureFields {
  return {
    reps: prescription.reps !== undefined,
    load: prescription.load !== undefined,
    duration: prescription.duration !== undefined,
    distance: prescription.distance !== undefined,
    rpe: prescription.rpe !== undefined,
  };
}
