// Phase 9D — the recovery domain: a structural placeholder ONLY (spec
// section 17/37). No production emitter writes sleep_duration,
// resting_heart_rate, HRV, soreness, or readiness data today — see
// lib/signals/types.ts's own FUTURE_PROOF_ONLY doc, which pre-registers
// exactly these metric keys for this exact reason. This function proves
// the domain is wired end-to-end (it participates in analyzeClientState's
// real output and the recovery-domain test matrix) without ever
// fabricating a "recovery score" from data that doesn't exist.
//
// When a future wearable integration starts actually emitting
// sleep_duration/resting_heart_rate observations, this function is the
// ONE place that gains real logic — no schema redesign, no type changes
// to ClientStateFinding, no changes to the orchestrator's call site.

import type { ClientStateFinding } from "./types.ts";
import type { RawObservation } from "./evidence.ts";

const RECOVERY_METRIC_KEYS = new Set(["sleep_duration", "resting_heart_rate"]);

export function analyzeRecovery(params: { clientProfileId: string; observations: RawObservation[]; activeSafetyRestriction: boolean; nowIso: string }): ClientStateFinding {
  const { clientProfileId, observations, activeSafetyRestriction, nowIso } = params;
  const hasAnyRecoverySignal = observations.some((o) => RECOVERY_METRIC_KEYS.has(o.metricKey));
  return {
    clientProfileId,
    domain: "recovery",
    findingType: "insufficient_evidence",
    strength: "insufficient",
    analysisWindow: { sinceIso: nowIso.slice(0, 10), untilIso: nowIso.slice(0, 10), label: "no recovery signal source is wired in production yet" },
    summary: hasAnyRecoverySignal
      ? "Recovery-related observations exist but this domain's interpretation logic is not yet implemented."
      : "No recovery data (sleep, resting heart rate, HRV, readiness) is currently captured for this client.",
    supportingEvidenceRefs: [],
    contradictingEvidenceRefs: [],
    reasonClassification: null,
    firstObservedIso: null,
    lastObservedIso: null,
    activeSafetyRestriction,
  };
}
