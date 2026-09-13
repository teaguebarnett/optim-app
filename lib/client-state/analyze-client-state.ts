// Phase 9D — the one pure entry point that turns a bounded evidence bundle
// into a bounded set of shadow findings. Deterministic: the exact same
// evidence bundle always produces the exact same findings (test matrix
// item AB) — no randomness, no LLM call, no wall-clock dependency beyond
// the explicit `nowIso` the caller passes in.
//
// This function and everything it calls is pure/framework-independent —
// no Supabase import anywhere in this directory. See
// lib/production/client-state-evidence.ts for the one real read boundary
// that assembles a ClientStateEvidenceBundle and calls this.

import { analyzeAdherence } from "./adherence.ts";
import { analyzeResistancePerformance, analyzeContinuousPerformance } from "./performance.ts";
import { analyzePrescriptionCompletion } from "./prescription-completion.ts";
import { analyzeRecovery } from "./recovery.ts";
import type { ClientStateAnalysis } from "./types.ts";
import type { ClientStateEvidenceBundle } from "./evidence.ts";

export function analyzeClientState(evidence: ClientStateEvidenceBundle): ClientStateAnalysis {
  const shared = { clientProfileId: evidence.clientProfileId, observations: evidence.observations, activeSafetyRestriction: evidence.activeSafetyRestriction, nowIso: evidence.nowIso };
  return {
    clientProfileId: evidence.clientProfileId,
    analyzedAtIso: evidence.nowIso,
    findings: [
      analyzeAdherence({ ...shared, scheduledTrainingDates: evidence.scheduledTrainingDates }),
      analyzeResistancePerformance(shared),
      analyzeContinuousPerformance(shared),
      analyzePrescriptionCompletion(shared),
      analyzeRecovery(shared),
    ],
  };
}
