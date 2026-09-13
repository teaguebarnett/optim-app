// Phase 8A — Longitudinal Client Intelligence: the foundational client
// observation/signal domain model.
//
// This is the RAW OBSERVATION / FACT layer only (see this phase's spec,
// section 1) — never a derived metric, never an interpretation. A value
// here says "RPE = 8.5" or "session skipped, reason = illness," never
// "client is overreached." Interpretation is a later, explicitly separate
// phase (see this phase's own completion report for the recommended scope
// of that work).
//
// Framework-independent by design (no next/headers, no Supabase import) so
// every projector in this directory is directly unit-testable — matches
// this repo's established "pure logic here, server-only persistence there"
// split (see lib/coach/attention-item.ts / lib/coach/pain-safety-summary.ts
// for the same pattern elsewhere).

/** A small, deliberately bounded, low-churn taxonomy — mirrors how every
 * other genuinely closed vocabulary in this schema (EscalationReason,
 * HealthReviewStatus, ...) is modeled. Must exactly match the Postgres enum
 * `public.observation_category` (see the Phase 8A migration). */
export type ObservationCategory = "training_performance" | "adherence" | "recovery" | "pain_safety" | "body_composition" | "cardio" | "nutrition" | "lifestyle";

/** Where a fact came from. Deliberately includes the explicitly-named
 * future integration partners (apple_health/garmin/whoop) as inert
 * placeholder values now — no code path produces them yet (see this
 * phase's completion report, "future wearable extensibility proof") — so a
 * real future integration only ever needs new EMITTER code, never a new
 * enum value. Must exactly match `public.observation_source`. */
export type ObservationSourceType = "client_manual" | "coach_manual" | "workout_execution" | "onboarding" | "check_in" | "optim_derived" | "apple_health" | "garmin" | "whoop" | "other";

export type ObservationValueType = "numeric" | "boolean" | "categorical" | "text";

/** A discriminated union, not five nullable columns — the TS-level mirror
 * of the DB's `client_observations_value_matches_type` check constraint.
 * "categorical" and "text" share a representation (both are strings) but
 * stay distinct discriminants so a reader always knows whether the string
 * is a controlled vocabulary value (e.g. a SkipReason) or genuinely free
 * text (e.g. a client's own reported pain location) — never conflated. */
export type ObservationValue =
  | { valueType: "numeric"; valueNumeric: number }
  | { valueType: "boolean"; valueBoolean: boolean }
  | { valueType: "categorical"; valueText: string }
  | { valueType: "text"; valueText: string };

/** One raw fact, ready to persist. Every field here maps 1:1 onto a
 * client_observations column — see the Phase 8A migration's own doc for
 * why each one exists (and, just as importantly, why nothing else does). */
export interface ClientObservationInput {
  clientProfileId: string;
  workspaceId: string;
  category: ObservationCategory;
  metricKey: string;
  sourceType: ObservationSourceType;
  value: ObservationValue;
  /** Null when the metric is genuinely dimensionless/unitless (e.g. a
   * categorical status) or the registry defines no unit for it. */
  unit: string | null;
  /** Opaque provenance pointer — deterministically built by
   * buildDailyRecordObservationRef/buildEscalationObservationRef below —
   * and, together with (clientProfileId, sourceType, metricKey), the
   * entire idempotency key. Never randomly generated: reprocessing the
   * exact same source event must always resolve to the exact same ref. */
  sourceRef: string | null;
  /** Denormalized convenience reference for "observations about this
   * training item" queries — see lib/production/signals.ts. */
  trainingItemInstanceId?: string | null;
  /** When the fact actually occurred — distinct from recordedAt (when
   * OPTIM stored it), which lib/production/signals.ts's write path stamps
   * itself at insert/update time (see this phase's completion report,
   * section 9/10). */
  observedAtIso: string;
}

/** Every metric this codebase currently knows how to produce OR has
 * deliberately pre-registered as a structural extensibility proof (see
 * `FUTURE_PROOF_ONLY` entries below) — the ONE place a new metric key must
 * be added. Adding a metric here is a pure code change, never a migration
 * (client_observations.metric_key is plain text at the DB layer for
 * exactly this reason — see the migration's own doc). An unregistered
 * metric key fails validation (validateClientObservationInput) rather than
 * being silently accepted — this is what keeps metric_key extensible
 * without turning the table into an unvalidated dumping ground. */
export const METRIC_REGISTRY: Record<string, { category: ObservationCategory; valueType: ObservationValueType; units: string[] | null }> = {
  // -- Real, currently-emitted metrics ---------------------------------
  session_status: { category: "training_performance", valueType: "categorical", units: null },
  skip_reason: { category: "adherence", valueType: "categorical", units: null },
  exercise_status: { category: "training_performance", valueType: "categorical", units: null },
  exercise_skip_reason: { category: "adherence", valueType: "categorical", units: null },
  rpe: { category: "training_performance", valueType: "numeric", units: ["rpe"] },
  performed_load: { category: "training_performance", valueType: "numeric", units: ["lb"] },
  continuous_duration: { category: "training_performance", valueType: "numeric", units: ["seconds"] },
  performed_as_prescribed: { category: "training_performance", valueType: "boolean", units: null },
  pain_reported: { category: "pain_safety", valueType: "text", units: null },
  pain_rating: { category: "pain_safety", valueType: "numeric", units: ["rating_0_10"] },

  // -- FUTURE_PROOF_ONLY: registered to prove the model needs no schema
  // redesign for a future wearable source (Phase 8A spec section 32/33) —
  // no current emitter ever produces these; covered only by
  // verify-signals.mts's structural extensibility test. --------------
  sleep_duration: { category: "recovery", valueType: "numeric", units: ["hours"] },
  resting_heart_rate: { category: "cardio", valueType: "numeric", units: ["bpm"] },
};

export class InvalidObservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidObservationError";
  }
}

/** The one validation boundary every observation must pass through before
 * it's ever written — never trust an emitter's own discipline alone (test
 * matrix item S: a malformed/unrecognized observation must fail here, not
 * surface as a confusing Postgres constraint violation). */
export function validateClientObservationInput(input: ClientObservationInput): ClientObservationInput {
  if (!input.clientProfileId) throw new InvalidObservationError("clientProfileId is required");
  if (!input.workspaceId) throw new InvalidObservationError("workspaceId is required");
  if (!input.observedAtIso || Number.isNaN(Date.parse(input.observedAtIso))) throw new InvalidObservationError(`observedAtIso is not a valid ISO timestamp: ${input.observedAtIso}`);

  const registered = METRIC_REGISTRY[input.metricKey];
  if (!registered) throw new InvalidObservationError(`Unrecognized metric_key: "${input.metricKey}" — register it in lib/signals/types.ts's METRIC_REGISTRY before emitting it.`);
  if (registered.category !== input.category) throw new InvalidObservationError(`metric_key "${input.metricKey}" belongs to category "${registered.category}", got "${input.category}"`);
  if (registered.valueType !== input.value.valueType) throw new InvalidObservationError(`metric_key "${input.metricKey}" expects value type "${registered.valueType}", got "${input.value.valueType}"`);
  if (registered.units === null && input.unit !== null) throw new InvalidObservationError(`metric_key "${input.metricKey}" is unitless, got unit "${input.unit}"`);
  if (registered.units !== null && (input.unit === null || !registered.units.includes(input.unit))) {
    throw new InvalidObservationError(`metric_key "${input.metricKey}" requires one of units [${registered.units.join(", ")}], got "${input.unit}"`);
  }

  if (input.value.valueType === "numeric" && !Number.isFinite(input.value.valueNumeric)) throw new InvalidObservationError(`numeric value for "${input.metricKey}" is not a finite number`);
  if ((input.value.valueType === "categorical" || input.value.valueType === "text") && !input.value.valueText.trim()) {
    throw new InvalidObservationError(`${input.value.valueType} value for "${input.metricKey}" is empty`);
  }

  return input;
}

// ---------------------------------------------------------------------------
// Deterministic source-ref builders — the entire idempotency strategy (see
// migration doc). A projector must always build its source_ref through one
// of these, never ad hoc, so the same real-world source event always
// resolves to the same ref no matter how many times it's reprocessed.
// ---------------------------------------------------------------------------

export function buildDailyRecordObservationRef(params: { clientProfileId: string; dateIso: string }): string {
  return `daily_records:${params.clientProfileId}:${params.dateIso}`;
}

export function buildDailyRecordItemObservationRef(params: { clientProfileId: string; dateIso: string; trainingItemInstanceId: string }): string {
  return `daily_records:${params.clientProfileId}:${params.dateIso}:item:${params.trainingItemInstanceId}`;
}

export function buildEscalationObservationRef(escalationId: string): string {
  return `escalation:${escalationId}`;
}

export function buildEscalationAreaObservationRef(escalationId: string, area: string): string {
  return `escalation:${escalationId}:area:${area}`;
}
