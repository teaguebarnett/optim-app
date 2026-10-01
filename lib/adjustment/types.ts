// Phase 10B — Evidence-Backed Coaching Adjustment Proposals: the pure
// domain model. A ClientStateFinding (Phase 9D) MAY produce a bounded,
// deterministic AdjustmentProposal — a structured description of a
// specific, small, explainable change to the client's CURRENT active
// program, never a rewrite, never applied automatically. The coach
// remains the final decision-maker (spec section 1/4): this module only
// ever produces a PROPOSAL, never a mutation.
//
// Central design choice, mirrored throughout this directory: "no proposal"
// is a first-class, common, INTENDED outcome (spec section 3/16) — not an
// error case, not a fallback. An isolated/illness-related disruption, a
// stable finding, ambiguous evidence, or evidence that doesn't cleanly
// support one of the small set of V1-supported adjustment families all
// deterministically resolve to NoAdjustmentProposal, never a forced
// action.

import type { FindingDomain, FindingType } from "../client-state/types.ts";
import type { UniversalTrainingProgramContent } from "../training/types.ts";

/** The bounded V1 adjustment families this engine can safely represent
 * with current architecture (spec section 5/2) — see this phase's
 * completion report, "adaptation capability map," for the full
 * finding-type → family mapping and why every other combination
 * deliberately produces no_proposal instead. */
export type AdjustmentProposalType = "schedule_redistribution" | "volume_reduction" | "intensity_reduction" | "continuous_duration_reduction";

/** Every reason this engine can decline to propose anything — deliberately
 * enumerated and always accompanied by which finding produced it, so "no
 * proposal" is always explainable, never a silent gap (spec section 16). */
export type NoProposalReason =
  | "insufficient_evidence"
  | "temporary_disruption"
  | "stable_or_normal"
  | "ambiguous_evidence"
  | "unsupported_finding_type"
  | "no_active_program"
  | "no_compatible_action"
  | "safety_restriction_conflict"
  | "explicit_methodology_conflict"
  | "invalid_adjusted_draft"
  | "existing_pending_proposal"
  | "duplicate_or_recently_rejected"
  /** Gate 3 — the client's primary coach has no confirmed Coach Brain. */
  | "coach_method_unconfirmed";

/** How far into the program the proposed change applies (spec section 6).
 * V1 only ever produces "current_block" (from the client's current
 * periodization phase through the end of that phase — never the whole
 * remaining program, never retroactive) — "temporary" and "program_level"
 * are defined here as real, named concepts for a future phase to use, but
 * no V1 adjustment type currently produces either (documented honestly,
 * not silently unsupported). */
export type AdjustmentScope = "temporary" | "current_block" | "program_level";

/** One bounded, human-readable line describing a single real change this
 * proposal makes — never a raw diff, never a database path (spec section
 * 58/59). */
export interface AdjustmentChangeDescription {
  weekNumber: number;
  dayOfWeek: string;
  description: string;
}

export interface AdjustmentProposal {
  adjustmentType: AdjustmentProposalType;
  scope: AdjustmentScope;
  /** Short, product-safe, evidence-based explanation — never hidden
   * model reasoning, never a diagnosis (spec section 12/14/58). */
  rationale: string;
  /** The fully derived adjusted content — already validated against the
   * universal grammar and safety restrictions by the time this result is
   * returned (spec section 45/46) — never surfaced to a caller
   * unvalidated. */
  content: UniversalTrainingProgramContent;
  changeDescriptions: AdjustmentChangeDescription[];
  /** Deterministic identity (lib/adjustment/signature.ts) — the same
   * underlying evidence against the same active program version always
   * produces the same signature, which is what makes duplicate
   * suppression possible without a dedicated table (spec section 28). */
  proposalSignature: string;
  sourceFindingDomain: FindingDomain;
  sourceFindingType: FindingType;
  /** Bounded — the real client_observations ids that justified this
   * proposal (spec section 32), never a full history snapshot. */
  sourceEvidenceRefs: string[];
  /** The exact training_program_versions.id this proposal was built
   * against (spec section 17/29) — approval must re-verify this is still
   * the client's active version before publishing. */
  activeProgramVersionId: string;
  /** Real coach_learned_rules ids that refined HOW this proposal was
   * built (spec section 10/33) — e.g. "prefer reducing volume before
   * intensity." Empty when no confirmed rule was relevant; never implies
   * the rule caused the underlying finding. */
  learnedRuleIdsUsed: string[];
}

export interface NoAdjustmentProposal {
  reason: NoProposalReason;
  /** One bounded, honest sentence — never chain-of-thought (spec section
   * 14). */
  detail: string;
}

export type AdjustmentEngineResult = { outcome: "proposal"; proposal: AdjustmentProposal } | { outcome: "no_proposal"; noProposal: NoAdjustmentProposal };
