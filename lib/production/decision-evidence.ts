// Phase 8B — Longitudinal Client Intelligence: the real Supabase-mode
// persistence and read boundary for coach_decision_evidence. The ONE place
// the rest of the app talks to this table, mirroring lib/production/signals.ts's
// exact posture.
//
// Write path: every real V1 emitter (app/actions/production-programs.ts's
// createPublishAndAssignProgramAction, lib/production/pain-safety.ts's
// recordHealthReviewDecision) runs as the COACH's own authenticated
// session, immediately after its own canonical write already succeeded —
// this module never issues a second, independent write of its own.
//
// Failure semantics (spec section 32): recordDecisionEvidence can throw —
// every call site wraps it in a try/catch that logs and swallows, so a
// projection failure can NEVER turn a successful canonical coaching action
// (program published, health review decided) into an apparent failure for
// the coach.
//
// Idempotency (spec section 20): a plain insert against the real
// (coach_user_id, source_ref, decision_type) unique constraint, with a
// caught Postgres 23505 (unique_violation) treated as success rather than
// an error — a retried/duplicate request for the exact same real decision
// instance is silently absorbed, never duplicated. This is deliberately
// NOT an upsert-with-update: a later, genuinely different decision is new
// evidence (a new source_ref), never a correction to an earlier row (spec
// section 19) — coach_decision_evidence has no update policy at all, so an
// upsert-on-conflict-update isn't even possible here, only insert-or-skip.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { validateDecisionEvidenceInput, type DecisionEvidenceInput, type DecisionDomain, type DecisionOutcome, type DecisionEvidenceRecord } from "../decisions/types.ts";

export async function recordDecisionEvidence(input: DecisionEvidenceInput): Promise<void> {
  const validated = validateDecisionEvidenceInput(input);
  const supabase = await getSupabaseServerClient();
  const row = {
    workspace_id: validated.workspaceId,
    coach_user_id: validated.coachUserId,
    client_profile_id: validated.clientProfileId,
    decision_domain: validated.decisionDomain,
    decision_type: validated.decisionType,
    outcome: validated.outcome,
    proposed_value: validated.proposedValue,
    chosen_value: validated.chosenValue,
    reason: validated.reason ?? null,
    program_assignment_id: validated.programAssignmentId ?? null,
    escalation_id: validated.escalationId ?? null,
    training_item_instance_id: validated.trainingItemInstanceId ?? null,
    observation_ids: validated.observationIds ?? null,
    source_ref: validated.sourceRef,
    decided_at: validated.decidedAtIso,
  };
  const { error } = await supabase.from("coach_decision_evidence").insert(row, { count: "exact" }).select("id").maybeSingle();
  // Postgres error code 23505 = unique_violation — a real, expected retry
  // of the exact same decision instance, never a caller-visible failure.
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordDecisionEvidence failed: ${error.message}`);
}

function rowToRecord(r: Record<string, unknown>): DecisionEvidenceRecord {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    coachUserId: r.coach_user_id as string,
    clientProfileId: r.client_profile_id as string,
    decisionDomain: r.decision_domain as DecisionDomain,
    decisionType: r.decision_type as string,
    outcome: r.outcome as DecisionOutcome,
    proposedValue: (r.proposed_value as Record<string, unknown> | null) ?? null,
    chosenValue: (r.chosen_value as Record<string, unknown> | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    programAssignmentId: (r.program_assignment_id as string | null) ?? null,
    escalationId: (r.escalation_id as string | null) ?? null,
    trainingItemInstanceId: (r.training_item_instance_id as string | null) ?? null,
    observationIds: (r.observation_ids as string[] | null) ?? null,
    sourceRef: r.source_ref as string,
    decidedAtIso: r.decided_at as string,
    recordedAtIso: r.recorded_at as string,
  };
}

export interface DecisionEvidenceQuery {
  /** Always implicitly the caller's own coach identity via RLS
   * (coach_decision_evidence_select) — this is never a parameter a caller
   * can widen; it's included only so the read boundary's shape mirrors
   * lib/production/signals.ts's own query API. */
  clientProfileId?: string;
  decisionDomain?: DecisionDomain;
  decisionType?: string;
  limit?: number;
}

/** The one general-purpose read for this coach's own decision evidence —
 * RLS is the real authorization backstop, exactly like every other read in
 * this codebase. Keep minimal (spec section: "do not build analytics
 * querying UI") — no aggregation, no pattern surfacing. */
export async function getMyDecisionEvidence(query: DecisionEvidenceQuery = {}): Promise<DecisionEvidenceRecord[]> {
  const supabase = await getSupabaseServerClient();
  let q = supabase.from("coach_decision_evidence").select("*").order("decided_at", { ascending: false });
  if (query.clientProfileId) q = q.eq("client_profile_id", query.clientProfileId);
  if (query.decisionDomain) q = q.eq("decision_domain", query.decisionDomain);
  if (query.decisionType) q = q.eq("decision_type", query.decisionType);
  if (query.limit) q = q.limit(query.limit);
  const { data, error } = await q;
  if (error) throw new Error(`getMyDecisionEvidence failed: ${error.message}`);
  return (data ?? []).map(rowToRecord);
}
