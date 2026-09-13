// Phase 9D — Shadow Client-State Intelligence: the foundational type model
// for a deterministic, evidence-backed, READ-ONLY interpretation layer over
// Phase 8A client observations (+ the real workout-execution facts those
// observations are themselves projected from).
//
// Locks the three-layer distinction this whole phase depends on (spec
// section 3):
//   RAW OBSERVATION   — a client_observations row: "RPE = 9", "session
//                        skipped, reason = feeling-sick". Never written by
//                        this phase.
//   DERIVED METRIC     — a pure computation over raw observations within a
//                        bounded window: "3 of last 4 scheduled sessions
//                        completed," "average comparable RPE +0.8 over
//                        baseline." Exists only in memory, per analysis
//                        call — never persisted (see lib/production/
//                        client-state-evidence.ts's own doc for why no
//                        table exists).
//   FINDING            — a bounded, neutral, evidence-backed interpretation
//                        of one or more derived metrics: a
//                        ClientStateFinding below. Never a diagnosis, never
//                        a coaching instruction, never a program change,
//                        never a permanent client attribute (spec section
//                        4) — it evolves as new evidence arrives (spec
//                        section 25) because it is recomputed from
//                        scratch, not accumulated state.
//
// This phase is purely additive/read-only: nothing here writes to
// client_observations, CoachOperatingModel, coach_learned_rules, or any
// program/generation table. See lib/production/client-state-evidence.ts
// for the one real read boundary, and lib/coach/analyze-client-state.ts
// (this directory's own top-level orchestrator) for the pure function that
// turns evidence into findings.

/** A small, deliberately bounded taxonomy — only domains real, currently-
 * wired production evidence can actually support (spec section 6/36).
 * "recovery" is intentionally included as a structural placeholder: no
 * production emitter produces sleep/HRV/readiness data today (see
 * lib/signals/types.ts's own FUTURE_PROOF_ONLY doc), so every recovery
 * analysis call returns a single insufficient_evidence finding — this
 * proves the domain is wired without fabricating a "recovery score" (spec
 * section 17/37). "pain_safety" is deliberately NOT a finding domain here:
 * Phase 7's escalation system remains the sole canonical safety record
 * (spec section 20) — this phase only ever reads whether an active
 * restriction currently exists, as read-only CONTEXT attached to other
 * findings, never as an interpretation of its own. */
export type FindingDomain = "adherence" | "training_performance" | "continuous_performance" | "prescription_completion" | "recovery";

export type AdherenceFindingType =
  | "isolated_disruption"
  | "illness_related_disruption"
  | "recurring_schedule_conflict"
  | "recurring_unexplained_skips"
  | "stable_adherence"
  | "insufficient_evidence";

export type PerformanceFindingType = "performance_improving" | "performance_declining" | "performance_stable" | "performance_inconsistent" | "insufficient_evidence";

export type PrescriptionCompletionFindingType = "repeated_under_completion" | "consistent_completion" | "insufficient_evidence";

export type RecoveryFindingType = "insufficient_evidence";

export type FindingType = AdherenceFindingType | PerformanceFindingType | PrescriptionCompletionFindingType | RecoveryFindingType;

/** Conservative qualitative strength only — never a fabricated precision
 * percentage (spec section 23). "insufficient" is a first-class, common
 * outcome, not an error case. */
export type EvidenceStrength = "insufficient" | "emerging" | "strong";

/** A domain-appropriate analysis window (spec section 24: "do not create
 * one universal 7-day window"). `label` is the neutral, human-readable
 * description a QA surface renders (e.g. "last 14 days," "last 8 comparable
 * exposures over 84 days"). */
export interface AnalysisWindow {
  sinceIso: string;
  untilIso: string;
  label: string;
}

/** A bounded, coarse classification of WHY, only ever set from a real,
 * structured SkipReason distribution actually observed in the window —
 * never inferred from silence, and never a personality/motivation
 * judgment (spec section 8/16/28). Absent when the evidence doesn't
 * clearly support one dominant reason. */
export type ReasonClassification = "illness" | "schedule_conflict" | "pain_or_discomfort" | "equipment" | "fatigue" | "unexplained" | "mixed";

/** The one shared output shape every Phase 9D domain produces. Deliberately
 * NOT persisted (spec section 22) — always recomputed from current
 * evidence, so it can never go stale and never needs a migration to
 * refine. See lib/production/client-state-evidence.ts for how a caller
 * gets one of these. */
export interface ClientStateFinding {
  clientProfileId: string;
  domain: FindingDomain;
  findingType: FindingType;
  strength: EvidenceStrength;
  analysisWindow: AnalysisWindow;
  /** A short, neutral, evidence-backed sentence — never a diagnosis, never
   * an instruction, never invented language ("client is lazy," "CNS
   * fatigue") — see this module's header doc and spec section 4. */
  summary: string;
  /** Real client_observations row ids (or, where the underlying fact has
   * no observation row of its own — e.g. a silently-missed scheduled day
   * with zero logged activity — a deterministic reference string built the
   * same way lib/signals/types.ts's own source-ref builders work) that
   * this finding is actually based on. Never empty for a non-insufficient
   * finding (spec section 21/S). */
  supportingEvidenceRefs: string[];
  /** Real evidence that runs counter to or weakens this finding — e.g. a
   * subsequent week of normal completion after an illness cluster. Present
   * whenever such evidence exists, even for a strong finding (spec section
   * 19/T: "allow neutral/competing evidence," never force one
   * conclusion). */
  contradictingEvidenceRefs: string[];
  reasonClassification: ReasonClassification | null;
  firstObservedIso: string | null;
  lastObservedIso: string | null;
  /** Read-only context (spec section 20) — true when the client currently
   * has an unresolved/active pain-safety escalation. This finding never
   * interprets, diagnoses, or overrides that state; it only surfaces that
   * the context exists so a later coach-facing surface can show both
   * together. */
  activeSafetyRestriction: boolean;
}

export interface ClientStateAnalysis {
  clientProfileId: string;
  findings: ClientStateFinding[];
  /** Timestamp the analysis was computed — never cached/stored beyond one
   * call (spec section 22). */
  analyzedAtIso: string;
}
