// Phase 9A — Shadow Coach Pattern Analysis: pure types for the READ-ONLY
// candidate-pattern engine. A PatternCandidate is a derived READ MODEL
// computed on demand from real, immutable coach_decision_evidence rows —
// it is never a rule, never persisted, never confirmed, and never read by
// generation or any other production behavior. See
// analyze-coach-decision-patterns.ts's own module doc for the complete
// list of things this phase must not do.
//
// Framework-independent by design (no next/headers, no Supabase import) —
// the same "pure logic here, server-only auth/persistence there" split
// lib/decisions/types.ts already establishes.

import type { DecisionDomain } from "../decisions/types.ts";

export type PatternScope = "coach_general" | "client_specific";

/** Conservative, product-oriented evidence bands — never a fabricated
 * statistical percentage (spec section 24). "insufficient" is a real,
 * derivable value (see deriveEvidenceStrength) but analyzeCoachDecisionPatterns
 * never emits a candidate at that band — see this module's own eligibility
 * doc in analyze-coach-decision-patterns.ts. */
export type EvidenceStrength = "insufficient" | "emerging" | "strong";

/** What kind of change the candidate describes. Numeric fields
 * (sets/reps/rpe/load/rest/duration/distance/HR/pace) get "increase" or
 * "decrease" from a real proposed->chosen numeric comparison; everything
 * else gets its own honest qualitative direction — never forced into a
 * fake numeric trend. */
export type PatternDirection =
  | "increase"
  | "decrease"
  | "qualitative_change"
  | "structural_add"
  | "structural_remove"
  | "structural_day_to_rest"
  | "whole_program_approved_unchanged"
  | "whole_program_rejected";

/** Deterministic grouping key — two decisions are only ever compared
 * against each other when their ContextSignature matches exactly (spec
 * section 11: "a decision about 3 vs 4 sets on hypertrophy accessory work
 * should not automatically be grouped with 3 vs 4 intervals on
 * conditioning work"). */
export interface ContextSignature {
  decisionDomain: DecisionDomain;
  /** The real decision_type string (e.g. "item_prescription_edited") —
   * signatures never merge across decision types, even within the same
   * domain (test I: a resistance set change never merges with interval/
   * continuous semantics). */
  decisionType: string;
  /** The normalized structured field/dimension being compared — e.g.
   * "sets", "rpe", "durationSeconds", "activityIdentity", "itemRemoved",
   * "itemAdded", "dayConvertedToRest", "wholeProgramApproval", or
   * "wholeProgramRejection:<reason>" for a rejection carrying a real
   * structured quick reason. Never a raw, unnormalized JSON path. */
  field: string;
  /** The resolved lib/coach/exercise-library.ts MovementPattern family for
   * the item involved, when resolvable by an exact (case-insensitive) name
   * match — see exercise-family.ts. Null when the item isn't a recognized
   * library exercise (a coach-authored custom item, or a continuous
   * activity — this codebase has no continuous-activity taxonomy to
   * resolve against) or the decision has no single associated item (a
   * whole-program or day-level decision). Never a fabricated taxonomy
   * (spec section 12). */
  itemFamily: string | null;
}

export interface PatternCandidate {
  coachUserId: string;
  scope: PatternScope;
  /** Set only when scope === "client_specific". */
  clientProfileId: string | null;
  contextSignature: ContextSignature;
  direction: PatternDirection;
  /** A plain, neutral, deterministically-templated sentence — never
   * authored by an LLM (spec section 5) and never phrased as a settled
   * fact (spec section 20: this is a candidate, never a "rule",
   * "methodology", "preference", or "default behavior"). */
  summary: string;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  supportCount: number;
  contradictionCount: number;
  distinctClientCount: number;
  /** Best-effort distinctness beyond raw decision count. EXACT for
   * whole-program-level decisions (program_generated's source_ref always
   * keys off the program family's true original version id — see
   * lib/decisions/project-program-generation.ts). An UNDER-claims-nothing
   * APPROXIMATION for item-level edits: source_ref there keys off the
   * EDITED version id, and Phase 8D's own "always a new version, never
   * mutate" editing discipline means one review session touching the same
   * program several times produces several distinct edited-version ids —
   * so this can over-count "distinct programs" for a single multi-edit
   * review session. This codebase's decision evidence has no dedicated
   * program_id column (documented limitation — see this phase's
   * completion report section 21), so a true distinct-program count isn't
   * derivable today. Never used as a gating threshold on its own —
   * distinctClientCount + supportCount gate eligibility; this is reported
   * for transparency and traceability only. */
  distinctVersionCount: number;
  firstObservedIso: string;
  lastObservedIso: string;
  evidenceStrength: EvidenceStrength;
  /** Only ever checked along the one dimension this codebase can compare
   * without fuzzy/LLM inference: a "sets" candidate's supporting chosen
   * values against the coach's own explicit
   * CoachOperatingModel.programArchitecture.setsPerExerciseMin/Max (spec
   * section 19). This is NOT a general methodology-diff engine — every
   * other field never sets this flag, and that absence is documented, not
   * silently implied to mean "no conflict exists." */
  conflictsWithExplicitMethodology: boolean;
  methodologyConflictNote: string | null;
  /** True when at least one piece of SUPPORTING evidence for this
   * candidate occurred while the client had a documented, active safety
   * restriction whose avoided terms overlap the item involved (see
   * restriction-context.ts). Never true for a coach_general candidate —
   * that evidence is excluded from the coach-general pool entirely, not
   * merely flagged (spec section 16). For a client_specific candidate the
   * evidence stays included but flagged, so a human reviewer can see the
   * possible confound rather than have it silently baked into an apparent
   * preference. */
  possibleSafetyInfluence: boolean;
}

export interface PatternAnalysisResult {
  coachUserId: string;
  generatedAtIso: string;
  /** Every decision this analysis run considered as INPUT, before any
   * domain/type filtering — for traceability (spec section 21: "candidate
   * output always traceable to evidence"). */
  totalEvidenceConsidered: number;
  /** How many of those were excluded outright because decisionDomain ===
   * "safety" (health_review_decision itself is a clinical decision, never
   * methodology — spec section 15) or decisionType === "program_generated"
   * with outcome "edited" (redundant with the finer-grained item-level
   * edit evidence already captured separately — see this file's own
   * capability-map doc) or decisionType === "session_renamed" (cosmetic,
   * no methodology signal). */
  totalEvidenceExcludedFromAnalysis: number;
  candidates: PatternCandidate[];
}
