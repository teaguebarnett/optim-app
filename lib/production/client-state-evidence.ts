// Phase 9D — the one real read boundary between Phase 8A's canonical
// observation/execution facts and the pure shadow client-state analyzer
// (lib/client-state/analyze-client-state.ts). Bounded queries only (spec
// section 35: no vector search, no warehouse, no full-lifetime scan) —
// every read here is scoped to a real client id and a real, small,
// explicit date window.
//
// Persistence decision (spec section 22): findings are DERIVED here, on
// every call, from canonical Phase 8A/7/enrollment data — never persisted
// to a new table. Benefits, matching the spec's own reasoning exactly: no
// stale intelligence (a finding always reflects the current evidence, not
// a snapshot that can drift), no duplicate truth (client_observations
// remains the one fact store), every finding is always re-traceable to
// real evidence ids, and refining the analysis algorithm never requires a
// migration or backfill. No schema change was needed for this phase — see
// this phase's completion report for the full "why no migration" case.
//
// Failure semantics (spec section 34): finding analysis is optional
// intelligence. A failure here is caught, logged, and degrades to an
// empty evidence bundle (which the pure analyzer turns into
// insufficient_evidence findings across every domain) — it must never
// throw in a way that could be mistaken for a canonical read failure by
// a caller, and must never block workout logging, program generation, or
// coach review.

import "server-only";
import { getClientObservations } from "./signals.ts";
import { getClientProgramContext } from "./programs.ts";
import { resolveHealthReviewRecordForClient } from "./pain-safety.ts";
import { analyzeClientState } from "../client-state/analyze-client-state.ts";
import { scheduledTrainingDatesInWindow } from "../client-state/schedule.ts";
import { ADHERENCE_BASELINE_WINDOW_DAYS, ADHERENCE_RECENT_WINDOW_DAYS, PERFORMANCE_LOOKBACK_DAYS } from "../client-state/windows.ts";
import { addDaysToLocalDate } from "../shared/local-date.ts";
import { formatObservationForDisplay, type EvidenceDetailLine } from "../client-state/evidence-display.ts";
import { getSupabaseServerClient } from "../supabase/server.ts";
import type { ClientStateAnalysis } from "../client-state/types.ts";
import type { ClientStateEvidenceBundle, RawObservation } from "../client-state/evidence.ts";

const OBSERVATION_LOOKBACK_DAYS = Math.max(ADHERENCE_BASELINE_WINDOW_DAYS + ADHERENCE_RECENT_WINDOW_DAYS, PERFORMANCE_LOOKBACK_DAYS);

/** Assembles one real, bounded ClientStateEvidenceBundle for a client —
 * the ONLY place this phase ever queries client_observations, the
 * client's program schedule, or their health-review status for analysis
 * purposes. Never called from generation, never called from coach-rule
 * resolution (see this phase's own zero-generation-influence proof). */
export async function resolveClientStateEvidence(params: { workspaceId: string; clientProfileId: string }): Promise<ClientStateEvidenceBundle> {
  const nowIso = new Date().toISOString();
  const emptyBundle: ClientStateEvidenceBundle = { clientProfileId: params.clientProfileId, observations: [], scheduledTrainingDates: [], activeSafetyRestriction: false, nowIso };
  try {
    const sinceIso = addDaysToLocalDate(nowIso.slice(0, 10), -(OBSERVATION_LOOKBACK_DAYS - 1));
    const [observationRecords, programContext, healthReview] = await Promise.all([
      getClientObservations({ clientProfileId: params.clientProfileId, sinceIso: `${sinceIso}T00:00:00.000Z` }),
      getClientProgramContext({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId }),
      resolveHealthReviewRecordForClient(params.clientProfileId, params.workspaceId).catch(() => null),
    ]);

    const observations: RawObservation[] = observationRecords.map((r) => ({
      id: r.id,
      category: r.category,
      metricKey: r.metricKey,
      sourceType: r.sourceType,
      value: r.value,
      unit: r.unit,
      sourceRef: r.sourceRef,
      trainingItemInstanceId: r.trainingItemInstanceId,
      observedAtIso: r.observedAtIso,
    }));

    const scheduledTrainingDates =
      programContext.enrollment && programContext.universalAssignedProgram
        ? scheduledTrainingDatesInWindow(programContext.enrollment, programContext.universalAssignedProgram, sinceIso, nowIso.slice(0, 10))
        : [];

    return {
      clientProfileId: params.clientProfileId,
      observations,
      scheduledTrainingDates,
      activeSafetyRestriction: healthReview?.status === "proceed_with_limitations",
      nowIso,
    };
  } catch (err) {
    console.error(`resolveClientStateEvidence failed, analyzing with empty evidence: ${err instanceof Error ? err.message : String(err)}`);
    return emptyBundle;
  }
}

/** The one real entry point a coach-facing (or test/QA) surface calls —
 * fetch evidence, then analyze it. Never influences generation or coach
 * rules (see this phase's own zero-generation-influence proof); intended
 * for a developer/QA read surface and, later, an explicit Phase 10 coach
 * summary — never exposed to clients (spec section 32). */
export async function analyzeClientStateForClient(params: { workspaceId: string; clientProfileId: string }): Promise<ClientStateAnalysis> {
  const evidence = await resolveClientStateEvidence(params);
  return analyzeClientState(evidence);
}

/** Phase 10A — the coach-facing evidence drill-down's one real read: given
 * a finding's own bounded supportingEvidenceRefs/contradictingEvidenceRefs
 * (already real client_observations row ids), fetches exactly those rows
 * (RLS-scoped to the caller's own session — a coach can only ever resolve
 * ids for a client they're actually authorized to read) and formats each
 * one plainly (spec section 13: never a database id or raw JSON). Never
 * fetches more than the ids given — no separate "load more evidence"
 * query exists. Failure degrades to an empty list, never blocks the
 * review surface. */
export async function resolveEvidenceDetails(observationIds: string[]): Promise<EvidenceDetailLine[]> {
  if (observationIds.length === 0) return [];
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("client_observations").select("*").in("id", observationIds);
    if (error) throw new Error(error.message);
    const observations: RawObservation[] = (data ?? []).map((r) => ({
      id: r.id as string,
      category: r.category as string,
      metricKey: r.metric_key as string,
      sourceType: r.source_type as string,
      value:
        r.value_type === "numeric"
          ? { valueType: "numeric" as const, valueNumeric: r.value_numeric as number }
          : r.value_type === "boolean"
            ? { valueType: "boolean" as const, valueBoolean: r.value_boolean as boolean }
            : { valueType: r.value_type as "categorical" | "text", valueText: r.value_text as string },
      unit: (r.unit as string | null) ?? null,
      sourceRef: (r.source_ref as string | null) ?? null,
      trainingItemInstanceId: (r.training_item_instance_id as string | null) ?? null,
      observedAtIso: r.observed_at as string,
    }));
    return observations.map(formatObservationForDisplay).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  } catch (err) {
    console.error(`resolveEvidenceDetails failed, showing no evidence detail: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
