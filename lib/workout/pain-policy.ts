// Phase 4.4B-2.1 — deterministic pain/injury safety policy.
//
// Pain and injury feedback is an always-escalate category: every submitted
// report interrupts blind progression and shows caution. This module is the
// one place that classification happens — a pure function from the real
// reported fields, never a diagnosis, never an automatic programming
// change. OPTIM may caution; only the client's coach reviews and decides.

import type { PainSeverity, PainSymptomQuality } from "../types";

export interface PainClassificationInput {
  ratingZeroToTen: number;
  continuedAfterSet: boolean;
  affectsOutsideGym: boolean;
  symptomQuality: PainSymptomQuality;
}

/** Symptom qualities that always block resuming the exercise, regardless of
 * how low the numeric rating is — never overridden by rating alone. */
const CONCERNING_QUALITIES = new Set<PainSymptomQuality>(["sharp-pinching", "numbness-tingling", "instability-weakness"]);

/**
 * The current product policy:
 *
 * Resume-eligible (mild) requires ALL of:
 *  - rating 1-3
 *  - did not continue after the set
 *  - does not affect anything outside the gym
 *  - symptom quality is not sharp/pinching, numbness/tingling, or
 *    instability/weakness
 *
 * Everything else — including any missing/ambiguous input — blocks the
 * exercise. This is a deliberate fail-safe: an always-escalate category
 * never defaults toward the permissive outcome.
 */
export function classifyPainSeverity(input: PainClassificationInput): PainSeverity {
  const concerningQuality = CONCERNING_QUALITIES.has(input.symptomQuality);
  const mildEligible =
    input.ratingZeroToTen >= 1 &&
    input.ratingZeroToTen <= 3 &&
    !input.continuedAfterSet &&
    !input.affectsOutsideGym &&
    !concerningQuality;
  return mildEligible ? "resume-eligible" : "block-exercise";
}

/** Stronger, more direct language for a materially severe report — used to
 * pick copy, never a second classification tier in the data model. */
export function isSevereRating(ratingZeroToTen: number): boolean {
  return ratingZeroToTen >= 7;
}
