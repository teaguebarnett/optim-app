// Phase 9D — the pure evidence shapes every domain analyzer in this
// directory consumes. Deliberately mirrors lib/production/signals.ts's
// real ClientObservationRecord field-for-field (this file has no
// "server-only" import so it stays unit-testable without next/headers —
// same split as every other lib/coach/*.ts pure-logic module in this
// repo), rather than importing that server-only file directly.

export type ObservationValue = { valueType: "numeric"; valueNumeric: number } | { valueType: "boolean"; valueBoolean: boolean } | { valueType: "categorical"; valueText: string } | { valueType: "text"; valueText: string };

/** One real client_observations row, as read by lib/production/
 * client-state-evidence.ts. Never fabricated — every field here traces to
 * a real Postgres row a caller can look up by `id`. */
export interface RawObservation {
  id: string;
  category: string;
  metricKey: string;
  sourceType: string;
  value: ObservationValue;
  unit: string | null;
  sourceRef: string | null;
  trainingItemInstanceId: string | null;
  observedAtIso: string;
}

/** The one bundle every pure analyzer in this directory takes — assembled
 * once by lib/production/client-state-evidence.ts from real, bounded
 * reads (client_observations + the client's program schedule + whether a
 * safety escalation is currently active), never re-fetched per domain. */
export interface ClientStateEvidenceBundle {
  clientProfileId: string;
  /** Every real observation in the union of every domain's own lookback
   * window (the caller fetches the widest window once; each domain
   * analyzer filters to its own narrower window internally — see
   * lib/client-state/windows.ts). */
  observations: RawObservation[];
  /** Real calendar dates that were scheduled training days within the
   * adherence baseline+recent window — see
   * lib/client-state/schedule.ts. Empty when the client has no active
   * program enrollment (pre-program, or genuinely no program yet) —
   * adherence analysis degrades to insufficient_evidence in that case,
   * never a fabricated schedule. */
  scheduledTrainingDates: string[];
  /** True only when the client currently has a real, unresolved
   * pain-safety escalation — read-only context (spec section 20), never
   * interpreted here. */
  activeSafetyRestriction: boolean;
  nowIso: string;
}
