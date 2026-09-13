// Phase 8A — Longitudinal Client Intelligence: the real Supabase-mode
// persistence and read boundary for client_observations. The ONE place the
// rest of the app talks to this table — see this phase's spec section 23:
// "the rest of OPTIM should not issue random direct signal-table queries
// everywhere."
//
// Write path: every real V1 emitter (lib/production/programs.ts's
// saveDailyActivity, lib/production/pain-safety.ts's
// reportAcutePainForClient, lib/production/onboarding.ts's
// completeOnboarding) runs as the CLIENT's own authenticated session,
// immediately after its own canonical write already succeeded — this
// module never issues a second, independent write of its own; it uses the
// exact same caller-bound Supabase client the canonical write just used
// (client_observations_insert_self/update_self RLS enforces "own data
// only," matching daily_records' identical posture).
//
// Failure semantics (spec section 26): recordObservations can throw (a
// real Postgres/validation error) — every call site wraps it in a
// try/catch that logs and swallows, so a projection failure can NEVER turn
// a successful canonical write into an apparent failure for the client.
// This is optional, best-effort analytics; the canonical record is what a
// program/coach/safety decision actually depends on.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { validateClientObservationInput, type ClientObservationInput, type ObservationCategory, type ObservationSourceType } from "../signals/types.ts";

/** Validates every input, then upserts them in one batch keyed by the real
 * idempotency constraint (client_profile_id, source_type, source_ref,
 * metric_key) — reprocessing the same source event(s) is always safe,
 * never produces duplicates, and correctly overwrites a fact whose
 * underlying source content genuinely changed (e.g. a client edits a
 * logged RPE before the day is done). Empty input is a safe no-op — no
 * network round-trip for a day with nothing new to report. */
export async function recordObservations(inputs: ClientObservationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const validated = inputs.map((input) => validateClientObservationInput(input));
  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const rows = validated.map((o) => ({
    workspace_id: o.workspaceId,
    client_profile_id: o.clientProfileId,
    category: o.category,
    metric_key: o.metricKey,
    source_type: o.sourceType,
    value_type: o.value.valueType,
    value_numeric: o.value.valueType === "numeric" ? o.value.valueNumeric : null,
    value_boolean: o.value.valueType === "boolean" ? o.value.valueBoolean : null,
    value_text: o.value.valueType === "categorical" || o.value.valueType === "text" ? o.value.valueText : null,
    unit: o.unit,
    source_ref: o.sourceRef,
    training_item_instance_id: o.trainingItemInstanceId ?? null,
    observed_at: o.observedAtIso,
    updated_at: nowIso,
  }));
  const { error } = await supabase.from("client_observations").upsert(rows, { onConflict: "client_profile_id,source_type,source_ref,metric_key" });
  if (error) throw new Error(`recordObservations failed: ${error.message}`);
}

export interface ClientObservationRecord {
  id: string;
  clientProfileId: string;
  workspaceId: string;
  category: ObservationCategory;
  metricKey: string;
  sourceType: ObservationSourceType;
  value: ClientObservationInput["value"];
  unit: string | null;
  sourceRef: string | null;
  trainingItemInstanceId: string | null;
  observedAtIso: string;
  recordedAtIso: string;
  updatedAtIso: string;
}

function rowToRecord(r: Record<string, unknown>): ClientObservationRecord {
  const valueType = r.value_type as ClientObservationInput["value"]["valueType"];
  const value: ClientObservationInput["value"] =
    valueType === "numeric"
      ? { valueType, valueNumeric: r.value_numeric as number }
      : valueType === "boolean"
        ? { valueType, valueBoolean: r.value_boolean as boolean }
        : { valueType, valueText: r.value_text as string };
  return {
    id: r.id as string,
    clientProfileId: r.client_profile_id as string,
    workspaceId: r.workspace_id as string,
    category: r.category as ObservationCategory,
    metricKey: r.metric_key as string,
    sourceType: r.source_type as ObservationSourceType,
    value,
    unit: (r.unit as string | null) ?? null,
    sourceRef: (r.source_ref as string | null) ?? null,
    trainingItemInstanceId: (r.training_item_instance_id as string | null) ?? null,
    observedAtIso: r.observed_at as string,
    recordedAtIso: r.recorded_at as string,
    updatedAtIso: r.updated_at as string,
  };
}

export interface ObservationQuery {
  clientProfileId: string;
  category?: ObservationCategory;
  metricKey?: string;
  sourceType?: ObservationSourceType;
  trainingItemInstanceId?: string;
  /** Filters on observed_at (the semantic fact time), never recorded_at. */
  sinceIso?: string;
  untilIso?: string;
  limit?: number;
}

/** The one general-purpose read — covers every query shape spec section 23
 * asks for ("observations for client in time range," "observations
 * associated with a session/item," "source-specific observations") without
 * a bespoke function per shape. RLS (client_observations_select) is the
 * real authorization backstop — the caller's own session determines what
 * this can ever return, exactly like every other read in this codebase. */
export async function getClientObservations(query: ObservationQuery): Promise<ClientObservationRecord[]> {
  const supabase = await getSupabaseServerClient();
  let q = supabase.from("client_observations").select("*").eq("client_profile_id", query.clientProfileId).order("observed_at", { ascending: false });
  if (query.category) q = q.eq("category", query.category);
  if (query.metricKey) q = q.eq("metric_key", query.metricKey);
  if (query.sourceType) q = q.eq("source_type", query.sourceType);
  if (query.trainingItemInstanceId) q = q.eq("training_item_instance_id", query.trainingItemInstanceId);
  if (query.sinceIso) q = q.gte("observed_at", query.sinceIso);
  if (query.untilIso) q = q.lte("observed_at", query.untilIso);
  if (query.limit) q = q.limit(query.limit);
  const { data, error } = await q;
  if (error) throw new Error(`getClientObservations failed: ${error.message}`);
  return (data ?? []).map(rowToRecord);
}

/** The most recent observation of a given metric for a client — "latest
 * observation of a type" (spec section 23) — null when none exists yet. */
export async function getLatestObservation(clientProfileId: string, metricKey: string): Promise<ClientObservationRecord | null> {
  const results = await getClientObservations({ clientProfileId, metricKey, limit: 1 });
  return results[0] ?? null;
}
