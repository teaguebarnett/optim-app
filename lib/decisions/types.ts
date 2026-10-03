// Phase 8B — Longitudinal Client Intelligence: the COACH DECISION EVIDENCE
// domain model, parallel to lib/signals/types.ts's client observation
// model. This layer answers "what did OPTIM propose, what did the coach
// decide, and under what context?" — never "what actually happened with
// the client" (client observations) and never "what rule has OPTIM
// learned" (an explicitly later, unbuilt phase — see this phase's own
// completion report for the exact recommended next-phase scope). One
// decision is evidence. Nothing in this file infers a rule from it.
//
// Framework-independent by design — no next/headers, no Supabase import —
// matching lib/signals/types.ts's own "pure logic here, server-only
// persistence there" split.

export type DecisionDomain = "program_structure" | "exercise_selection" | "prescription" | "progression" | "substitution" | "scheduling" | "cardio_conditioning" | "safety" | "other";

export type DecisionOutcome = "approved" | "edited" | "rejected" | "overridden" | "selected";

export class InvalidDecisionEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDecisionEvidenceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string, decisionType: string): void {
  if (typeof value !== "string" || !value.trim()) throw new InvalidDecisionEvidenceError(`${decisionType}: "${field}" must be a non-empty string`);
}

function requireNumber(value: unknown, field: string, decisionType: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new InvalidDecisionEvidenceError(`${decisionType}: "${field}" must be a finite number`);
}

function optionalString(value: unknown, field: string, decisionType: string): void {
  if (value !== undefined && typeof value !== "string") throw new InvalidDecisionEvidenceError(`${decisionType}: "${field}" must be a string when present`);
}

function optionalNumber(value: unknown, field: string, decisionType: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) throw new InvalidDecisionEvidenceError(`${decisionType}: "${field}" must be a finite number when present`);
}

/** Every decision type this codebase currently produces OR has
 * deliberately pre-registered as a structural proof that the edited/
 * rejected/overridden outcomes are representable once a real production
 * review UI exists (see PROOF_OF_CONCEPT_ONLY below) — the ONE place a new
 * decision type must be added. Adding one here is a pure code change,
 * never a migration (coach_decision_evidence.decision_type is plain text
 * at the DB layer for exactly this reason — see the migration's own doc).
 * An unregistered decision_type fails validation rather than being
 * silently accepted. */
export const DECISION_TYPE_REGISTRY: Record<string, { domain: DecisionDomain; validateValue: (value: Record<string, unknown>, decisionType: string) => void }> = {
  // -- Real, currently-wired decision types ----------------------------
  program_generated: {
    domain: "program_structure",
    validateValue: (v, t) => {
      requireNumber(v.durationWeeks, "durationWeeks", t);
      requireString(v.directionLabel, "directionLabel", t);
      requireString(v.rationale, "rationale", t);
    },
  },
  health_review_decision: {
    domain: "safety",
    validateValue: (v, t) => {
      requireString(v.status, "status", t);
      optionalString(v.documentedLimitations, "documentedLimitations", t);
    },
  },
  // Gate 4.0C-2A — the coach confirming (or editing) OPTIM's structured
  // reading of their documented limitation. proposedValue = what OPTIM
  // proposed; chosenValue = what the coach confirmed. History only — the
  // escalations row holds the current, canonical structured limitation.
  structured_limitations_confirmation: {
    domain: "safety",
    validateValue: (v, t) => {
      if (!Array.isArray(v.optionIds) || v.optionIds.some((x) => typeof x !== "string")) throw new InvalidDecisionEvidenceError(`${t}: "optionIds" must be an array of strings`);
      optionalString(v.sourceText, "sourceText", t);
    },
  },
  // Phase 8C — a real, wired resistance-item edit. Deliberately holds only
  // the fields that actually changed (see lib/training/program-proposal-editing.ts's
  // groupDeltasByItem) — never the item's full prescription snapshot, so
  // "untouched fields do not generate fake evidence" (spec test J) is true
  // by construction, not by convention.
  item_prescription_edited: {
    domain: "prescription",
    validateValue: (v, t) => {
      optionalString(v.exerciseName, "exerciseName", t);
      optionalNumber(v.sets, "sets", t);
      optionalNumber(v.repsLow, "repsLow", t);
      optionalNumber(v.repsHigh, "repsHigh", t);
      optionalNumber(v.rpe, "rpe", t);
      optionalNumber(v.rir, "rir", t);
      optionalNumber(v.loadValue, "loadValue", t);
      optionalString(v.loadUnit, "loadUnit", t);
      optionalNumber(v.restSeconds, "restSeconds", t);
      optionalString(v.tempo, "tempo", t);
      optionalString(v.warmupInstruction, "warmupInstruction", t);
      // Phase 9A — warmupSets is a real, already-editable field (Phase 8D's
      // TrainingItemPatch.warmupSets) that this registry never validated;
      // without it, a warmup-sets edit's evidence would carry an
      // unvalidated key, and the pattern engine would have no registered
      // field to trust it against. A tiny, safe registry completion, not
      // a new capability.
      optionalNumber(v.warmupSets, "warmupSets", t);
    },
  },
  // Phase 8C — the continuous-family counterpart, its own decision_type
  // (rather than overloading item_prescription_edited) so it can carry its
  // own domain: "cardio_conditioning" (spec section 15's own taxonomy),
  // never forced into "prescription".
  continuous_item_edited: {
    domain: "cardio_conditioning",
    validateValue: (v, t) => {
      optionalString(v.activityName, "activityName", t);
      optionalNumber(v.durationSeconds, "durationSeconds", t);
      optionalNumber(v.distanceValue, "distanceValue", t);
      optionalString(v.distanceUnit, "distanceUnit", t);
      optionalNumber(v.heartRateLow, "heartRateLow", t);
      optionalNumber(v.heartRateHigh, "heartRateHigh", t);
      optionalNumber(v.rpe, "rpe", t);
      // Phase 8D — closes the pace gap Phase 8C documented (see
      // lib/training/program-proposal-editing.ts's own doc for why this is
      // completing existing grammar/execution support, not a new primitive).
      optionalNumber(v.paceValue, "paceValue", t);
      optionalString(v.paceUnit, "paceUnit", t);
    },
  },
  // -- Phase 8D — bounded structural edits (spec section 9/10) ---------
  training_item_removed: {
    domain: "exercise_selection",
    validateValue: (v, t) => {
      requireString(v.exerciseName, "exerciseName", t);
    },
  },
  training_item_added: {
    domain: "exercise_selection",
    validateValue: (v, t) => {
      requireString(v.exerciseName, "exerciseName", t);
      requireString(v.category, "category", t);
    },
  },
  session_renamed: {
    domain: "program_structure",
    validateValue: (v, t) => {
      requireString(v.name, "name", t);
    },
  },
  training_day_converted_to_rest: {
    domain: "scheduling",
    validateValue: (v, t) => {
      requireString(v.dayType, "dayType", t);
    },
  },
};

export interface DecisionEvidenceInput {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  decisionDomain: DecisionDomain;
  decisionType: string;
  outcome: DecisionOutcome;
  /** Null only ever permitted when outcome is "selected" — a decision made
   * under the coach's own authority with no OPTIM proposal to react to
   * (spec section 4's "selected" outcome; e.g. a safety decision). */
  proposedValue: Record<string, unknown> | null;
  /** Null only ever permitted when outcome is "rejected" — a coach may
   * decline a proposal with no replacement chosen yet; this must never be
   * fabricated (spec section 26). */
  chosenValue: Record<string, unknown> | null;
  reason?: string | null;
  programAssignmentId?: string | null;
  escalationId?: string | null;
  trainingItemInstanceId?: string | null;
  /** Lightweight references to relevant Phase 8A client_observations rows
   * that informed this decision — never a duplicated snapshot of them, and
   * never a channel for writing the coach's interpretation back into
   * client_observations itself (spec section 11). */
  observationIds?: string[] | null;
  /** Deterministic, idempotency-relevant provenance pointer — see
   * lib/production/decision-evidence.ts's own doc. */
  sourceRef: string;
  decidedAtIso: string;
}

/** The one validation boundary every piece of evidence must pass through
 * before it's ever written. Deliberately never accepts free-form hidden
 * model reasoning — only the concrete, already-product-facing proposal/
 * selection each decision type's own registry entry declares (spec section
 * 5): there is no field here for a raw model deliberation trace, and
 * nothing calling this ever has one to pass. */
export function validateDecisionEvidenceInput(input: DecisionEvidenceInput): DecisionEvidenceInput {
  if (!input.workspaceId) throw new InvalidDecisionEvidenceError("workspaceId is required");
  if (!input.coachUserId) throw new InvalidDecisionEvidenceError("coachUserId is required");
  if (!input.clientProfileId) throw new InvalidDecisionEvidenceError("clientProfileId is required");
  if (!input.sourceRef) throw new InvalidDecisionEvidenceError("sourceRef is required");
  if (!input.decidedAtIso || Number.isNaN(Date.parse(input.decidedAtIso))) throw new InvalidDecisionEvidenceError(`decidedAtIso is not a valid ISO timestamp: ${input.decidedAtIso}`);

  const registered = DECISION_TYPE_REGISTRY[input.decisionType];
  if (!registered) throw new InvalidDecisionEvidenceError(`Unrecognized decision_type: "${input.decisionType}" — register it in lib/decisions/types.ts's DECISION_TYPE_REGISTRY before emitting it.`);
  if (registered.domain !== input.decisionDomain) throw new InvalidDecisionEvidenceError(`decision_type "${input.decisionType}" belongs to domain "${registered.domain}", got "${input.decisionDomain}"`);

  if (input.outcome === "rejected") {
    if (input.chosenValue !== null) throw new InvalidDecisionEvidenceError(`outcome "rejected" must never carry a fabricated chosenValue`);
  } else if (input.chosenValue === null) {
    throw new InvalidDecisionEvidenceError(`outcome "${input.outcome}" requires a real chosenValue`);
  }

  if (input.outcome === "selected") {
    if (input.proposedValue !== null) throw new InvalidDecisionEvidenceError(`outcome "selected" implies no OPTIM proposal existed — proposedValue must be null`);
  } else if (input.proposedValue === null) {
    throw new InvalidDecisionEvidenceError(`outcome "${input.outcome}" requires a real proposedValue`);
  }

  if (input.proposedValue !== null) {
    if (!isRecord(input.proposedValue)) throw new InvalidDecisionEvidenceError("proposedValue must be a plain object");
    registered.validateValue(input.proposedValue, input.decisionType);
  }
  if (input.chosenValue !== null) {
    if (!isRecord(input.chosenValue)) throw new InvalidDecisionEvidenceError("chosenValue must be a plain object");
    registered.validateValue(input.chosenValue, input.decisionType);
  }

  return input;
}

/** The read shape of one persisted coach_decision_evidence row — moved
 * here (Phase 9A) from lib/production/decision-evidence.ts (a
 * `server-only` module) so pure analysis code (lib/patterns/*) can accept
 * real evidence as typed input without depending on a server-only import
 * even at the type level. lib/production/decision-evidence.ts's
 * getMyDecisionEvidence is still the only place a real row is ever
 * fetched — this is a pure data shape, not a new read path. */
export interface DecisionEvidenceRecord {
  id: string;
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  decisionDomain: DecisionDomain;
  decisionType: string;
  outcome: DecisionOutcome;
  proposedValue: Record<string, unknown> | null;
  chosenValue: Record<string, unknown> | null;
  reason: string | null;
  programAssignmentId: string | null;
  escalationId: string | null;
  trainingItemInstanceId: string | null;
  observationIds: string[] | null;
  sourceRef: string;
  decidedAtIso: string;
  recordedAtIso: string;
}

// ---------------------------------------------------------------------------
// Deterministic source-ref builders — the entire idempotency strategy (see
// migration doc). A projector must always build its source_ref through one
// of these, never ad hoc.
// ---------------------------------------------------------------------------

export function buildProgramVersionDecisionRef(versionId: string): string {
  return `program_version:${versionId}`;
}

export function buildHealthReviewDecisionRef(params: { escalationId: string; decidedAtIso: string }): string {
  return `escalation_decision:${params.escalationId}:${params.decidedAtIso}`;
}

/** One real edit to one real item, on one real edited version — combined
 * with decision_type, this is what lets the SAME edit (a retried request)
 * upsert-safely absorb, while a genuinely later, different edit to the
 * same item (a new versionId, since every edit produces a new draft
 * version — see lib/training/program-proposal-editing.ts's own doc) is
 * new evidence. */
export function buildProgramVersionItemEditRef(params: { versionId: string; path: { weekNumber: number; dayOfWeek: string; sessionIndex: number; blockId: string; itemId: string } }): string {
  const { versionId, path } = params;
  return `program_version_item:${versionId}:${path.weekNumber}:${path.dayOfWeek}:${path.sessionIndex}:${path.blockId}:${path.itemId}`;
}

/** Phase 8D — one real session-level structural edit (rename), on one real
 * edited version. */
export function buildProgramVersionSessionRef(params: { versionId: string; weekNumber: number; dayOfWeek: string; sessionIndex: number }): string {
  return `program_version_session:${params.versionId}:${params.weekNumber}:${params.dayOfWeek}:${params.sessionIndex}`;
}

/** Phase 8D — one real day-level structural edit (training -> rest), on
 * one real edited version. */
export function buildProgramVersionDayRef(params: { versionId: string; weekNumber: number; dayOfWeek: string }): string {
  return `program_version_day:${params.versionId}:${params.weekNumber}:${params.dayOfWeek}`;
}

// ---------------------------------------------------------------------------
// Pure delta computation — section 25's "prefer domain-aware comparison"
// over semantic inference from arbitrary text. Not persisted (derivable on
// demand from proposedValue/chosenValue, both already stored) — computed
// only when a caller actually wants a human-readable summary of what
// changed.
// ---------------------------------------------------------------------------

export interface DecisionValueFieldDelta {
  field: string;
  from: unknown;
  to: unknown;
}

/** Every field present in EITHER value whose value actually differs — a
 * field absent from both is never reported. Never inspects raw text for
 * meaning; this is a plain per-field equality comparison over two already-
 * structured, already-validated objects. */
export function computeDecisionValueDelta(proposed: Record<string, unknown> | null, chosen: Record<string, unknown> | null): DecisionValueFieldDelta[] {
  if (!proposed || !chosen) return [];
  const fields = new Set([...Object.keys(proposed), ...Object.keys(chosen)]);
  const deltas: DecisionValueFieldDelta[] = [];
  for (const field of fields) {
    const from = proposed[field];
    const to = chosen[field];
    if (from !== to) deltas.push({ field, from, to });
  }
  return deltas;
}
