// Phase 9B — conservative eligibility gate for surfacing a Phase 9A
// PatternCandidate to the coach for explicit confirmation (spec section
// 4). Deliberately narrow: only "strong" evidence — "emerging" stays
// shadow-only (too noisy for a decision prompt; spec section 25 "surface
// conservatively"). Any possible safety influence is a hard exclusion
// regardless of scope or strength (spec section 16: a restriction-driven
// pattern must never be offered as "how I coach", even client-specific).
//
// An explicit-methodology conflict does NOT make a candidate ineligible —
// hiding it would withhold real information the coach might genuinely
// want to act on (e.g. "yes, my approach has actually shifted"). It stays
// eligible, but the confirmation UI must surface the conflict prominently
// rather than offering a silent one-click confirm (spec section 14).

import type { PatternCandidate } from "./types.ts";

export function isCandidateEligibleForConfirmation(candidate: PatternCandidate): boolean {
  if (candidate.evidenceStrength !== "strong") return false;
  if (candidate.possibleSafetyInfluence) return false;
  // Defensive well-formedness guard — every candidate the engine actually
  // emits already satisfies this by construction, but a confirmation
  // action is exactly the place to never trust an assumption silently.
  if (!candidate.summary || !candidate.contextSignature.field) return false;
  if (candidate.supportingEvidenceIds.length === 0) return false;
  return true;
}

/** The structured, machine-readable shape a confirmed rule stores (spec
 * section 12) — deliberately minimal: everything else about the rule's
 * context already has its own dedicated column (decision_domain, field,
 * item_family, direction) in coach_learned_rules; this only needs to
 * additionally preserve the real decisionType (domain alone doesn't always
 * disambiguate it — e.g. training_item_removed/training_item_added share
 * "exercise_selection") and the dominant comparison key itself. */
export function buildRuleBehavior(candidate: PatternCandidate): Record<string, unknown> {
  return { decisionType: candidate.contextSignature.decisionType, comparisonKey: candidate.dominantComparisonKey };
}
