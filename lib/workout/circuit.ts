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
import { requiresBothSides } from "./mobility.ts";

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

/** Phase 11D — true for a genuine AMRAP: `rounds` is deliberately absent
 * (see Block.terminationMode's own doc) because there is no real target —
 * "as many rounds as possible" is the whole point. The position state
 * machine must never claim "complete" for a block like this on its own;
 * only a real elapsed-time check (outside this pure module — see
 * lib/state.ts's EXPIRE_TIMED_CIRCUIT) decides when it's actually over. */
export function isUnboundedRounds(block: Block): boolean {
  return block.terminationMode === "time_cap";
}

/** Phase 11D — true for ANY circuit whose end is time-driven, whether
 * purely (AMRAP) or in addition to a real round target (a time-capped
 * circuit, spec section 45) — the one flag the client UX needs to decide
 * "show a whole-block countdown and a 'time's up, finish' affordance." */
export function isTimedCircuit(block: Block): boolean {
  return block.terminationMode === "time_cap" || block.terminationMode === "rounds_or_time_cap";
}

/**
 * The one deterministic state-machine transition circuit execution is
 * built on (spec test matrix J/K/L/M/N): given the phase that was JUST
 * resolved (an item logged, or round-rest finished), what comes next.
 * Pure — no Date.now(), no randomness, no side effect. Mirrors
 * lib/workout/interval.ts's nextIntervalProgress exactly in spirit.
 *
 * Phase 11D — a genuine AMRAP (isUnboundedRounds) never enters
 * "round-rest" (real AMRAPs are continuous, unbroken work — spec section
 * 7's own worked example shows no rest between rounds) and never resolves
 * to "complete" on its own; the last item of a round flows straight into
 * the first item of the next round, forever, until an external
 * elapsed-time action (EXPIRE_TIMED_CIRCUIT) ends it.
 */
export function nextCircuitPosition(block: Block, current: CircuitPosition): CircuitPosition | "complete" {
  if (isUnboundedRounds(block)) {
    if (current.phase === "item" && current.itemIndex + 1 < block.items.length) {
      return { round: current.round, itemIndex: current.itemIndex + 1, phase: "item" };
    }
    // Last item of the round (or a stray round-rest, which AMRAP never
    // itself enters) -> straight into the next round's first item, no rest.
    return { round: current.round + 1, itemIndex: 0, phase: "item" };
  }
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
  // Phase 11C — a power item's own per-set metric (reps, contacts, or
  // distance) inside a circuit exposure, never converted between them
  // (spec section 6). A mobility item's own hold/reps target, with a
  // "/ side" suffix when both sides are required — matching
  // describeMobilityOverview's own convention.
  if (p.family === "power") {
    const reps = p.reps ? (p.reps.low === p.reps.high ? `${p.reps.low} reps` : `${p.reps.low}-${p.reps.high} reps`) : null;
    const contacts = p.contacts !== undefined ? `${p.contacts} contacts` : null;
    const distance = p.distance ? formatDistance(p.distance) : null;
    return [reps, contacts, distance].filter(Boolean).join(", ") || item.name;
  }
  if (p.family === "mobility") {
    const duration = p.duration ? formatIntervalSeconds(p.duration.seconds) : null;
    const reps = p.reps ? (p.reps.low === p.reps.high ? `${p.reps.low} reps` : `${p.reps.low}-${p.reps.high} reps`) : null;
    const sideSuffix = p.side === "bilateral" || p.side === "alternating" ? " / side" : "";
    const base = [duration, reps].filter(Boolean).join(", ");
    return base ? `${base}${sideSuffix}` : item.name;
  }
  const parts: string[] = [];
  if (p.duration) parts.push(formatIntervalSeconds(p.duration.seconds));
  if (p.distance) parts.push(formatDistance(p.distance));
  if (p.pace) parts.push(`Target pace ${formatPace(p.pace)}`);
  if (p.heartRate) parts.push(`Target HR ${formatHeartRate(p.heartRate)}`);
  if (p.rpe !== undefined) parts.push(`RPE ${p.rpe}`);
  // Phase 11D — a calorie-based cardio target (e.g. "12 cal Bike", spec
  // section 41's own worked example) has no structured duration/distance
  // primitive to represent it honestly — completionTarget is real,
  // coach-authored data; surfacing it beats silently falling back to a
  // redundant repeat of the item's own name.
  if (parts.length === 0 && p.completionTarget) parts.push(p.completionTarget);
  return parts.join(", ") || item.name;
}

/** The circuit-level overview shown on the ready screen and in coach
 * review — round count plus each item's own name/target, never raw JSON
 * (spec section 25). */
export function describeCircuitOverview(block: Block): string[] {
  const lines: string[] = [];
  if (isUnboundedRounds(block)) {
    // Phase 11D — a genuine AMRAP: never claims a round count that
    // doesn't exist (spec section 7: "do not flatten AMRAP into a guessed
    // fixed number of rounds").
    lines.push(`AMRAP — ${formatIntervalSeconds(block.timeCapSeconds ?? 0)} time cap`);
  } else {
    const rounds = totalCircuitRounds(block);
    lines.push(`${rounds} round${rounds === 1 ? "" : "s"}`);
    if (block.terminationMode === "rounds_or_time_cap" && block.timeCapSeconds !== undefined) {
      lines.push(`or ${formatIntervalSeconds(block.timeCapSeconds)} time cap, whichever comes first`);
    }
  }
  block.items.forEach((item, i) => lines.push(`${i + 1}. ${item.name} — ${describeCircuitItemTarget(item)}`));
  if (!isUnboundedRounds(block) && block.restBetweenRoundsSeconds !== undefined) lines.push(`${formatIntervalSeconds(block.restBetweenRoundsSeconds)} between rounds`);
  return lines;
}

// ---------------------------------------------------------------------------
// Completion classification — mirrors lib/workout/interval.ts's own
// deterministic, honest completed-vs-partial rule.
// ---------------------------------------------------------------------------

export interface CircuitExposureLike {
  roundNumber: number;
  status: "completed" | "skipped";
  /** Phase 12B — present only for a bilateral/alternating item's exposure
   * (see CircuitRoundActual.side's own doc). Absent for every other
   * circuit item, exactly as today. */
  side?: "left" | "right";
}

/**
 * A circuit round counts as "fully completed" only when every item in the
 * block has a real "completed" exposure recorded for that round — a round
 * with even one item skipped or missing is not a completed round (spec
 * section 13's own "do not mark Round 2 complete" when only 2 of 4 items
 * were done). Phase 12B: a bilateral/alternating item needs BOTH its left
 * AND right exposure completed for that round to count for it — a single
 * resolved side is only half the real work, never enough to call the round
 * done for that item (spec test matrix I).
 */
export function completedCircuitRounds(block: Block, exposuresByItemId: Record<string, CircuitExposureLike[]>): number {
  const rounds = totalCircuitRounds(block);
  let completed = 0;
  for (let round = 1; round <= rounds; round++) {
    const allItemsDoneThisRound = block.items.every((item) => {
      const exposuresThisRound = (exposuresByItemId[item.id] ?? []).filter((e) => e.roundNumber === round);
      if (requiresBothSides(item.prescription)) {
        return exposuresThisRound.some((e) => e.side === "left" && e.status === "completed") && exposuresThisRound.some((e) => e.side === "right" && e.status === "completed");
      }
      return exposuresThisRound.some((e) => e.status === "completed");
    });
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
 * discipline. Phase 12B: a bilateral/alternating item genuinely owes TWO
 * exposures per round (left and right), so its expected count doubles —
 * see circuitItemPerformedAsPrescribed's own doc for why this can't stay a
 * bare `rounds` comparison once an item has a side concept. */
export function circuitPerformedAsPrescribed(block: Block, exposuresByItemId: Record<string, CircuitExposureLike[]>): boolean {
  const rounds = totalCircuitRounds(block);
  return block.items.every((item) => {
    const exposures = exposuresByItemId[item.id] ?? [];
    const expected = requiresBothSides(item.prescription) ? rounds * 2 : rounds;
    return exposures.length === expected && exposures.every((e) => e.status === "completed");
  });
}

/** ONE item's own status across every round of the circuit it belongs to —
 * used to build that item's real ExecutionRecord.status at finalize time.
 * Zero exposures at all (the item was never reached, including a
 * whole-circuit skip before starting) is honestly "skipped," never
 * "partial" — mirrors classifyContinuousCompletion's own boundary
 * discipline, scoped to one item instead of the whole activity.
 *
 * `exposuresPerRound` defaults to 1 (every existing call site/behavior
 * unchanged) — the caller passes 2 for a bilateral/alternating item (spec
 * section 14: two real, separately-resolved side exposures per round, not
 * one), so "every round, both sides" is what "completed" now honestly
 * requires for that item. */
export function classifyCircuitItemCompletion(totalRounds: number, exposures: CircuitExposureLike[], exposuresPerRound = 1): "completed" | "skipped" | "partial" {
  const expected = totalRounds * exposuresPerRound;
  const completedCount = exposures.filter((e) => e.status === "completed").length;
  if (completedCount >= expected) return "completed";
  if (completedCount === 0) return "skipped";
  return "partial";
}

/** Honest per-item performed-as-prescribed: every round for THIS item was
 * both attempted and completed. See classifyCircuitItemCompletion's own
 * doc for why exposuresPerRound exists and defaults to 1. */
export function circuitItemPerformedAsPrescribed(totalRounds: number, exposures: CircuitExposureLike[], exposuresPerRound = 1): boolean {
  const expected = totalRounds * exposuresPerRound;
  return exposures.length === expected && exposures.every((e) => e.status === "completed");
}

/** Whether an item's own family has rich, family-specific per-exposure
 * capture the circuit layer already knows how to build an actual for
 * (spec section 11: "reuse existing family-specific logging behavior...
 * should not recreate all family-specific logging logic"). Phase 11C adds
 * power/mobility here — their own per-set actuals (reps/contacts/distance,
 * duration/reps) are exactly the shape a Partial<Prescription> circuit
 * exposure already generalizes to. Anything else (interval, circuit,
 * quality — deferred families, spec section 21) still executes safely
 * through a generic completion-only capture, never a crash. */
export function hasRichCircuitCapture(prescription: Prescription): boolean {
  return prescription.family === "resistance" || prescription.family === "continuous" || prescription.family === "power" || prescription.family === "mobility";
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
  /** Phase 11C — a power item's own contacts primitive, never conflated
   * with reps. */
  contacts: boolean;
}

export function circuitCaptureFields(prescription: Prescription): CircuitCaptureFields {
  return {
    reps: prescription.reps !== undefined,
    load: prescription.load !== undefined,
    contacts: prescription.contacts !== undefined,
    duration: prescription.duration !== undefined,
    distance: prescription.distance !== undefined,
    rpe: prescription.rpe !== undefined,
  };
}
