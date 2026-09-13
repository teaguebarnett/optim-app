// Phase 9B — deterministic candidate identity (spec section 29). Built
// ONLY from a PatternCandidate's structured semantics (scope, coach,
// client-when-scoped, decision domain/type, normalized field, resolved
// item family, direction, dominant comparison key) — never a support-row
// id, so the conceptual candidate's identity stays stable as its
// supporting evidence set grows between analysis runs. Two analysis runs
// over a growing evidence set produce the SAME signature for the "same"
// candidate; two genuinely different candidates (different field, family,
// substitution pair, rejection reason, etc.) always produce different
// signatures.
//
// This is what coach_pattern_candidate_dispositions and coach_learned_rules
// key off — never a raw evidence-id list, which would change every time
// new evidence arrives and defeat suppression (spec section 10) and
// supersession (spec section 16) entirely.

import type { PatternCandidate } from "./types.ts";

export function computeCandidateSignature(candidate: PatternCandidate): string {
  const sig = candidate.contextSignature;
  return [
    candidate.scope,
    candidate.coachUserId,
    candidate.scope === "client_specific" ? (candidate.clientProfileId ?? "") : "",
    sig.decisionDomain,
    sig.decisionType,
    sig.field,
    sig.itemFamily ?? "",
    candidate.direction,
    candidate.dominantComparisonKey,
  ].join("|");
}
