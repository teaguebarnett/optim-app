// Phase 4.4B-2.2 correction — the one place actual-vs-target RPE is
// classified. Before this module existed, the same "how far off target was
// this set" judgment was independently re-derived in three places (the
// immediate post-set headline, the rest-recommendation policy, and the
// session-summary anomaly detection), each with its own hand-written
// threshold. rest-policy.ts's two-tier boundary (actual RPE 9, or exactly
// one point above target, for the milder tier) was introduced later than the
// others and never propagated back to them — so a set at target 8 / actual 9
// could correctly widen the rest recommendation while the headline right
// above it still read "Effort was within the target range." Every caller
// that needs to know how a logged RPE compares to the exercise's target must
// go through classifyEffort so that can never happen again.

import type { RpeValue } from "../types";

export type EffortTier = "unknown" | "below-target" | "within-target" | "above-target";

export interface EffortClassification {
  tier: EffortTier;
  /** Only meaningful when tier === "above-target" — true for the stronger
   * tier (actual RPE 10, or 2+ points above target). Mirrors rest-policy's
   * own two-tier severity so callers can distinguish "near-max, worth a
   * note" from "materially harder than planned, worth a caution" without
   * re-deriving the boundary themselves. */
  severe: boolean;
  /** actual - target, or null when no RPE was recorded. */
  diff: number | null;
}

/**
 * The current product policy (must stay in lock-step with the numbers in
 * lib/workout/rest-policy.ts's doc comment — this function is now the only
 * place either policy is allowed to compute it):
 *
 *  - No RPE recorded yet: "unknown" — never guessed.
 *  - Actual RPE 9, or exactly one point above target: "above-target",
 *    not severe.
 *  - Actual RPE 10, or two-plus points above target: "above-target", severe.
 *  - More than one point below target: "below-target".
 *  - Otherwise: "within-target".
 */
export function classifyEffort(actualRpe: RpeValue | null, targetRpe: RpeValue): EffortClassification {
  if (actualRpe === null) return { tier: "unknown", severe: false, diff: null };
  const diff = actualRpe - targetRpe;
  if (actualRpe >= 10 || diff >= 2) return { tier: "above-target", severe: true, diff };
  if (actualRpe === 9 || diff === 1) return { tier: "above-target", severe: false, diff };
  if (diff <= -2) return { tier: "below-target", severe: false, diff };
  return { tier: "within-target", severe: false, diff };
}
