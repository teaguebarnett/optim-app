// Phase 4.4B-2.1 correction — deterministic rest-recommendation policy.
//
// The live guided flow no longer shows a ticking "resting" timer: the real
// interaction (put the weight down, pick up the phone, open OPTIM, log the
// set and RPE) bakes in an unavoidable 15-30+ second handling delay before
// any timer could start, so a count-up would represent phone-handling time,
// not physiological rest. This module is the one place "how long should the
// client rest" is decided — a static, RPE-aware recommendation derived from
// the coach's own prescribed baseline, never a countdown and never a forced
// gate. Centralized here so the number and its supporting copy can never
// drift out of sync (see RestRecommendation.note).

import { classifyEffort } from "./effort-policy.ts";
import type { RpeValue } from "../types";

export interface RestRecommendation {
  /** e.g. "Recommended rest: 3–4 minutes." or "Rest as needed." — always a
   * complete, non-fabricated sentence; never partial/undefined text. */
  label: string;
  /** Additional guidance shown alongside the recommendation, only when
   * effort was materially elevated. Null when there's nothing more to say —
   * never invented filler. */
  note: string | null;
  /** True only for the strongest tier (RPE 10, or 2+ over target) — callers
   * use this to style the note as a caution rather than a neutral tip. */
  caution: boolean;
  /** Minutes added to both ends of the coach-prescribed range — 0, 1, or 2.
   * Exposed for testing/telemetry; the range itself is never shortened. */
  addedMinutes: 0 | 1 | 2;
}

function baselineRangeMinutes(restSeconds: number | undefined): { lowMin: number; highMin: number } | null {
  if (!restSeconds || restSeconds <= 0) return null;
  const totalMinutes = restSeconds / 60;
  const lowMin = Math.max(1, Math.floor(totalMinutes));
  const highMin = Math.max(lowMin, Math.ceil(totalMinutes));
  return { lowMin, highMin };
}

function formatRangeLabel(lowMin: number, highMin: number): string {
  if (lowMin === highMin) return `Recommended rest: ${lowMin} minute${lowMin === 1 ? "" : "s"}.`;
  return `Recommended rest: ${lowMin}–${highMin} minutes.`;
}

/**
 * The approved policy:
 *  - At or below target RPE: preserve the coach-prescribed range exactly.
 *  - Actual RPE 9, or exactly one point above target: add 1 minute to both
 *    ends (e.g. 2–3 becomes 3–4).
 *  - Actual RPE 10, or 2+ points above target: add 2 minutes to both ends,
 *    paired with stronger caution/reassessment language.
 *  - Never shortens the coach-prescribed range.
 *  - No valid baseline (no prescribed rest) or no RPE yet: the existing
 *    safe fallback ("Rest as needed.") with no fabricated adjustment.
 */
export function recommendRest(
  restSeconds: number | undefined,
  actualRpe: RpeValue | null,
  targetRpe: RpeValue
): RestRecommendation {
  const baseline = baselineRangeMinutes(restSeconds);
  if (!baseline || actualRpe === null) {
    return { label: baseline ? formatRangeLabel(baseline.lowMin, baseline.highMin) : "Rest as needed.", note: null, caution: false, addedMinutes: 0 };
  }

  // Phase 4.4B-2.2 — delegates the actual-vs-target judgment to the one
  // shared effort classifier (see lib/workout/effort-policy.ts) so this
  // number can never disagree with the immediate post-set headline or the
  // session-summary interpretation about which tier a set falls into.
  const effort = classifyEffort(actualRpe, targetRpe);
  const addedMinutes: 0 | 1 | 2 = effort.tier === "above-target" ? (effort.severe ? 2 : 1) : 0;

  const lowMin = baseline.lowMin + addedMinutes;
  const highMin = baseline.highMin + addedMinutes;
  const label = formatRangeLabel(lowMin, highMin);

  const note =
    addedMinutes === 2
      ? "That set was significantly harder than planned — take the extra time, and consider whether today's load needs a second look."
      : addedMinutes === 1
        ? "That set was near max effort — the extra minute may help you reset before the next one."
        : null;

  return { label, note, caution: addedMinutes === 2, addedMinutes };
}
