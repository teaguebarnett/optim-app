// Phase 11D — EMOM (Every Minute On the Minute) execution support, and its
// generalized cadence siblings E2MOM/E3MOM (spec section 11: "a bounded
// cadenceSeconds concept may be cleaner than three separate method types" —
// audited, adopted, no separate hard-coded engine per cadence). An EMOM
// block is fundamentally NOT circuit-shaped: there is no "item after item
// within one round" — instead, ONE assigned item repeats every real
// cadence WINDOW, and different windows may carry DIFFERENT items via
// simple deterministic cycling through block.items (spec section 12:
// "structured alternating cadence... do not parse odd/even from arbitrary
// instruction text" — the structure IS items[] order + modulo, nothing to
// parse). Pure, deterministic, no UI/network/AI dependency, no
// Date.now()/randomness except where a real `nowIso` is explicitly passed
// in — mirrors the discipline of lib/workout/interval.ts/circuit.ts.

import type { Block, TrainingItemInstance } from "../training/types.ts";
import { formatDistance, formatHeartRate, formatPace } from "./continuous.ts";
import { formatIntervalSeconds } from "./interval.ts";

export function totalEmomWindows(block: Block): number {
  return block.rounds && block.rounds > 0 ? block.rounds : 1;
}

export function emomCadenceSeconds(block: Block): number {
  return block.cadenceSeconds && block.cadenceSeconds > 0 ? block.cadenceSeconds : 60;
}

/** Which real item is assigned to a given 1-indexed window — deterministic
 * cycling through the block's own authored item order (spec section 12's
 * exact mechanism: "Odd minutes: Bike... Even minutes: Burpees" is simply
 * `items: [Bike, Burpees]` cycled by `(window - 1) % items.length`; a
 * plain single-exercise EMOM is the same mechanism with items.length===1,
 * always resolving to that one item). */
export function emomItemForWindow(block: Block, window: number): TrainingItemInstance {
  const items = [...block.items].sort((a, b) => a.order - b.order);
  return items[(window - 1) % items.length];
}

/**
 * The real, elapsed-time-derived current window (spec section 19: "reuse
 * timer infrastructure... derive from timestamps... avoid drift from
 * mutable decrement counters", section 20: "timer/state must reflect real
 * elapsed time"). Never stored — always recomputed from `startedAtIso` and
 * the current wall clock, exactly like lib/workout/interval.ts's own
 * IntervalTimer anchor discipline, generalized to a multi-window block.
 * Clamped to `totalWindows` once real elapsed time runs past the whole
 * EMOM's own duration — the client's next action (complete/skip the final
 * window, or skip the whole activity) is what actually ends it; nothing
 * silently auto-finalizes on its own (spec section 22: "do not pause the
 * entire EMOM... advance according to deterministic product behavior").
 */
export function currentEmomWindow(cadenceSeconds: number, totalWindows: number, startedAtIso: string, nowIso: string): number {
  const elapsedSeconds = Math.max(0, (new Date(nowIso).getTime() - new Date(startedAtIso).getTime()) / 1000);
  const computed = Math.floor(elapsedSeconds / cadenceSeconds) + 1;
  return Math.min(totalWindows, Math.max(1, computed));
}

/** The real wall-clock instant a given 1-indexed window begins — the
 * anchor lib/workout/interval.ts's own IntervalTimer derives its per-
 * window countdown from (spec section 19: reuse, never a new timer
 * framework). */
export function emomWindowStartedAtIso(cadenceSeconds: number, startedAtIso: string, window: number): string {
  return new Date(new Date(startedAtIso).getTime() + (window - 1) * cadenceSeconds * 1000).toISOString();
}

/**
 * Spec section 22's own honesty rule, made concrete and deterministic: any
 * window strictly between the next genuinely unresolved window and the
 * real current (clock-derived) window has had its own cadence boundary
 * pass with no exposure ever recorded for it — a real, honest "ran out of
 * time," never a fabricated completion. Returns the window numbers that
 * need an auto-skip record before the client's own tap (for whatever the
 * REAL current window now is) is processed. Pure — takes the already-
 * computed clockCurrentWindow rather than reading the clock itself.
 */
export function windowsToAutoSkip(nextUnresolvedWindow: number, clockCurrentWindow: number): number[] {
  const skipped: number[] = [];
  for (let w = nextUnresolvedWindow; w < clockCurrentWindow; w++) skipped.push(w);
  return skipped;
}

// ---------------------------------------------------------------------------
// Display formatting — coaching language only, reusing the exact same
// per-family formatters resistance/continuous/circuit review/execution
// already use rather than a fourth independently-drifting description.
// ---------------------------------------------------------------------------

/** One short target line for the item assigned to a window — mirrors
 * lib/workout/circuit.ts's own describeCircuitItemTarget exactly (an EMOM
 * window's own repetition IS the cadence, never a fabricated set count —
 * same "the block's own repeat unit is the repetition" discipline). */
export function describeEmomItemTarget(item: TrainingItemInstance): string {
  const p = item.prescription;
  if (p.family === "resistance") {
    const reps = p.reps ? (p.reps.low === p.reps.high ? `${p.reps.low} reps` : `${p.reps.low}-${p.reps.high} reps`) : null;
    const load = p.load ? `${p.load.value} ${p.load.unit}` : null;
    return [reps, load].filter(Boolean).join(", ") || "bodyweight";
  }
  if (p.family === "power") {
    const reps = p.reps ? (p.reps.low === p.reps.high ? `${p.reps.low} reps` : `${p.reps.low}-${p.reps.high} reps`) : null;
    const contacts = p.contacts !== undefined ? `${p.contacts} contacts` : null;
    const distance = p.distance ? formatDistance(p.distance) : null;
    return [reps, contacts, distance].filter(Boolean).join(", ") || item.name;
  }
  const parts: string[] = [];
  if (p.duration) parts.push(formatIntervalSeconds(p.duration.seconds));
  if (p.distance) parts.push(formatDistance(p.distance));
  if (p.pace) parts.push(`Target pace ${formatPace(p.pace)}`);
  if (p.heartRate) parts.push(`Target HR ${formatHeartRate(p.heartRate)}`);
  if (p.rpe !== undefined) parts.push(`RPE ${p.rpe}`);
  // Same "surface real coach-authored data over a redundant name repeat"
  // fix as lib/workout/circuit.ts's own describeCircuitItemTarget (a
  // calorie-based cardio target, e.g. "10 cal Bike", has no structured
  // duration/distance primitive to represent it honestly).
  if (parts.length === 0 && p.completionTarget) parts.push(p.completionTarget);
  return parts.join(", ") || item.name;
}

/** The cadence-appropriate display label (spec section 11's own
 * EMOM/E2MOM/E3MOM naming), derived purely from the real cadence seconds
 * — never a hard-coded per-format string. */
export function describeEmomCadenceLabel(cadenceSeconds: number): string {
  if (cadenceSeconds === 60) return "EMOM";
  if (cadenceSeconds % 60 === 0) return `E${cadenceSeconds / 60}MOM`;
  return `Every ${formatIntervalSeconds(cadenceSeconds)}`;
}

/** The block-level overview shown on the ready screen and in coach review
 * — cadence label, total windows, each distinct assigned item — never raw
 * JSON (spec section 28). */
export function describeEmomOverview(block: Block): string[] {
  const cadenceSeconds = emomCadenceSeconds(block);
  const totalWindows = totalEmomWindows(block);
  const lines = [`${describeEmomCadenceLabel(cadenceSeconds)} x ${totalWindows}`];
  const items = [...block.items].sort((a, b) => a.order - b.order);
  items.forEach((item, i) => {
    const windowLabel = items.length > 1 ? `Window ${i + 1}${items.length === 2 ? ` (${i === 0 ? "odd" : "even"})` : ""}` : "Every window";
    lines.push(`${windowLabel}: ${item.name} — ${describeEmomItemTarget(item)}`);
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Completion classification — mirrors lib/workout/circuit.ts's own
// deterministic, honest completed-vs-partial rule, scoped to windows
// instead of rounds.
// ---------------------------------------------------------------------------

export interface EmomWindowActualLike {
  window: number;
  status: "completed" | "skipped";
}

/** ONE item's own status across every window it was assigned (spec
 * section 10: "Minutes 1-7 completed, Minute 8 partial, Minutes 9-10 not
 * reached" must remain truthful per item). Zero exposures (never reached
 * any assigned window, including a whole-EMOM skip before starting) is
 * honestly "skipped," never "partial" — mirrors
 * classifyCircuitItemCompletion's own boundary discipline exactly. */
export function classifyEmomItemCompletion(totalAssignedWindows: number, exposures: EmomWindowActualLike[]): "completed" | "skipped" | "partial" {
  const completedCount = exposures.filter((e) => e.status === "completed").length;
  if (completedCount >= totalAssignedWindows) return "completed";
  if (completedCount === 0) return "skipped";
  return "partial";
}

export function emomItemPerformedAsPrescribed(totalAssignedWindows: number, exposures: EmomWindowActualLike[]): boolean {
  return exposures.length === totalAssignedWindows && exposures.every((e) => e.status === "completed");
}

/** How many windows this ONE item was actually assigned across the whole
 * EMOM (its own cycling frequency) — the honest denominator
 * classifyEmomItemCompletion/emomItemPerformedAsPrescribed need, since an
 * alternating EMOM assigns DIFFERENT items different window counts (e.g.
 * an odd total window count assigns the first item one more window than
 * the second). */
export function totalWindowsAssignedToItem(block: Block, itemId: string): number {
  const totalWindows = totalEmomWindows(block);
  let count = 0;
  for (let w = 1; w <= totalWindows; w++) {
    if (emomItemForWindow(block, w).id === itemId) count += 1;
  }
  return count;
}
