// Phase 9B — Coach-Confirmed Learned Rules: the real Supabase-mode
// persistence and read boundary. This is the ONLY place the app writes to
// coach_learned_rules / coach_pattern_candidate_dispositions, and the only
// place that re-runs Phase 9A's shadow analysis to decide what's eligible
// to show a coach.
//
// Non-negotiable (restated so this file's own contract is unambiguous):
//   - A coach_learned_rules row is created ONLY inside confirmLearnedRule,
//     which only ever runs in direct response to an explicit coach action.
//   - Nothing here writes to coach_decision_evidence — a confirmation is
//     never fed back into Phase 9A's own input (spec section 33/34); this
//     is what makes the self-reference loop structurally impossible, not
//     merely filtered out.
//   - Nothing here is imported by, or imports, any generation code.
//   - Every write is scoped to the caller's own coach identity, enforced
//     both by RLS (coach_user_id = auth.uid() on both new tables) and by
//     requireCoachAuthority below.

import "server-only";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth";
import { UnauthorizedError } from "./errors";
import { getSupabaseServerClient } from "../supabase/server";
import { getMyDecisionEvidence } from "./decision-evidence";
import { getOwnCoachIntelligence } from "./coach-brain";
import { analyzeCoachDecisionPatterns } from "../patterns/analyze-coach-decision-patterns";
import { isCandidateEligibleForConfirmation, buildRuleBehavior } from "../patterns/eligibility";
import { computeCandidateSignature } from "../patterns/candidate-signature";
import type { PatternCandidate, PatternScope, EvidenceStrength } from "../patterns/types";
import type { DecisionEvidenceRecord } from "../decisions/types";

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

async function runFreshAnalysis(workspaceId: string, coachUserId: string) {
  const evidence = await getMyDecisionEvidence();
  // Gate 3 — the coach's OWN confirmed method decides methodology conflicts.
  void workspaceId;
  const intelligence = await getOwnCoachIntelligence();
  return analyzeCoachDecisionPatterns({ coachUserId, evidence, operatingModel: intelligence.method?.operatingModel ?? null });
}

export interface EvidenceExample {
  decidedAtIso: string;
  clientDisplayName: string | null;
  proposedValue: Record<string, unknown> | null;
  chosenValue: Record<string, unknown> | null;
}

export interface EligibleCandidateSummary {
  candidateSignature: string;
  scope: PatternScope;
  clientProfileId: string | null;
  clientDisplayName: string | null;
  summary: string;
  evidenceStrength: EvidenceStrength;
  supportCount: number;
  contradictionCount: number;
  distinctClientCount: number;
  distinctVersionCount: number;
  firstObservedIso: string;
  lastObservedIso: string;
  conflictsWithExplicitMethodology: boolean;
  methodologyConflictNote: string | null;
  /** Bounded (max 5) real supporting/contradicting examples — never the
   * full evidence set, never raw database JSON (spec section 8). */
  supportingExamples: EvidenceExample[];
  contradictingExamples: EvidenceExample[];
}

const MAX_EVIDENCE_EXAMPLES = 5;

async function buildClientNameLookup(client: Awaited<ReturnType<typeof getSupabaseServerClient>>, clientProfileIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(clientProfileIds)];
  if (ids.length === 0) return new Map();
  const { data } = await client.from("client_profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((r) => [r.id as string, r.display_name as string]));
}

function toExamples(ids: string[], evidenceById: Map<string, DecisionEvidenceRecord>, names: Map<string, string>): EvidenceExample[] {
  return ids
    .slice(0, MAX_EVIDENCE_EXAMPLES)
    .map((id) => evidenceById.get(id))
    .filter((e): e is DecisionEvidenceRecord => !!e)
    .map((e) => ({ decidedAtIso: e.decidedAtIso, clientDisplayName: names.get(e.clientProfileId) ?? null, proposedValue: e.proposedValue, chosenValue: e.chosenValue }));
}

/** The one production read for "what should OPTIM show this coach right
 * now" — filters Phase 9A's live candidates down to ones that are (a)
 * eligible (strong, not safety-influenced) and (b) not already
 * dispositioned or already an active rule for that exact signature (spec
 * section 10: a rejected/contextual/confirmed candidate never immediately
 * resurfaces). Intelligence stays entirely server-side — the UI never
 * fetches raw decision evidence itself (spec section 21). */
export async function getEligibleCandidatesForReview(workspaceId: string): Promise<EligibleCandidateSummary[]> {
  const ctx = await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();

  const [analysis, { data: dispositionRows }, { data: activeRuleRows }] = await Promise.all([
    runFreshAnalysis(workspaceId, ctx.userId),
    supabase.from("coach_pattern_candidate_dispositions").select("candidate_signature").eq("coach_user_id", ctx.userId),
    supabase.from("coach_learned_rules").select("candidate_signature").eq("coach_user_id", ctx.userId).eq("status", "active"),
  ]);

  const suppressed = new Set([...(dispositionRows ?? []).map((r) => r.candidate_signature as string), ...(activeRuleRows ?? []).map((r) => r.candidate_signature as string)]);

  const evidence = await getMyDecisionEvidence();
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  const eligible = analysis.candidates.filter((c) => isCandidateEligibleForConfirmation(c) && !suppressed.has(computeCandidateSignature(c)));
  const clientIds = eligible.flatMap((c) => [...c.supportingEvidenceIds, ...c.contradictingEvidenceIds]).map((id) => evidenceById.get(id)?.clientProfileId).filter((id): id is string => !!id);
  const names = await buildClientNameLookup(supabase, clientIds);

  return eligible.map((c) => ({
    candidateSignature: computeCandidateSignature(c),
    scope: c.scope,
    clientProfileId: c.clientProfileId,
    clientDisplayName: c.clientProfileId ? (names.get(c.clientProfileId) ?? null) : null,
    summary: c.summary,
    evidenceStrength: c.evidenceStrength,
    supportCount: c.supportCount,
    contradictionCount: c.contradictionCount,
    distinctClientCount: c.distinctClientCount,
    distinctVersionCount: c.distinctVersionCount,
    firstObservedIso: c.firstObservedIso,
    lastObservedIso: c.lastObservedIso,
    conflictsWithExplicitMethodology: c.conflictsWithExplicitMethodology,
    methodologyConflictNote: c.methodologyConflictNote,
    supportingExamples: toExamples(c.supportingEvidenceIds, evidenceById, names),
    contradictingExamples: toExamples(c.contradictingEvidenceIds, evidenceById, names),
  }));
}

async function findFreshCandidateBySignature(workspaceId: string, coachUserId: string, candidateSignature: string): Promise<PatternCandidate | null> {
  const analysis = await runFreshAnalysis(workspaceId, coachUserId);
  return analysis.candidates.find((c) => computeCandidateSignature(c) === candidateSignature) ?? null;
}

interface DispositionRow {
  workspace_id: string;
  coach_user_id: string;
  candidate_signature: string;
  scope: PatternScope;
  client_profile_id: string | null;
  decision_domain: string;
  outcome: "confirmed" | "contextual" | "rejected";
  support_count_at_disposition: number;
  contradiction_count_at_disposition: number;
  distinct_client_count_at_disposition: number;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
  learned_rule_id: string | null;
  decided_by: string;
}

function dispositionRowFor(candidate: PatternCandidate, outcome: DispositionRow["outcome"], decidedBy: string, workspaceId: string, learnedRuleId: string | null): DispositionRow {
  return {
    workspace_id: workspaceId,
    coach_user_id: candidate.coachUserId,
    candidate_signature: computeCandidateSignature(candidate),
    scope: candidate.scope,
    client_profile_id: candidate.clientProfileId,
    decision_domain: candidate.contextSignature.decisionDomain,
    outcome,
    support_count_at_disposition: candidate.supportCount,
    contradiction_count_at_disposition: candidate.contradictionCount,
    distinct_client_count_at_disposition: candidate.distinctClientCount,
    supporting_evidence_ids: candidate.supportingEvidenceIds,
    contradicting_evidence_ids: candidate.contradictingEvidenceIds,
    learned_rule_id: learnedRuleId,
    decided_by: decidedBy,
  };
}

/** CONFIRM — "this represents how I coach." Re-validates the candidate
 * against FRESH evidence before persisting anything (spec section 28: a
 * stale candidate the coach saw earlier must never be confirmed blindly).
 * Supersedes any existing ACTIVE rule for the SAME CONTEXT (same domain/
 * field/family/scope/client — regardless of direction), so a newly
 * confirmed, directionally-incompatible rule never silently coexists with
 * an older active one (spec section 16). */
export async function confirmLearnedRule(params: { workspaceId: string; candidateSignature: string }): Promise<{ ruleId: string }> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();

  const fresh = await findFreshCandidateBySignature(params.workspaceId, ctx.userId, params.candidateSignature);
  if (!fresh || !isCandidateEligibleForConfirmation(fresh)) {
    throw new Error("confirmLearnedRule: this candidate is no longer eligible against current evidence — please re-review the latest version before confirming.");
  }

  const sig = fresh.contextSignature;
  let contextQuery = supabase
    .from("coach_learned_rules")
    .select("id")
    .eq("coach_user_id", ctx.userId)
    .eq("scope", fresh.scope)
    .eq("decision_domain", sig.decisionDomain)
    .eq("field", sig.field)
    .eq("status", "active");
  contextQuery = fresh.clientProfileId ? contextQuery.eq("client_profile_id", fresh.clientProfileId) : contextQuery.is("client_profile_id", null);
  contextQuery = sig.itemFamily ? contextQuery.eq("item_family", sig.itemFamily) : contextQuery.is("item_family", null);
  const { data: existingActiveForContext } = await contextQuery;

  const newRuleId = crypto.randomUUID();

  // The new row must exist BEFORE any old row can reference it as
  // superseded_by_rule_id — the column has a real foreign-key constraint
  // (coach_learned_rules_superseded_by_rule_id_fkey), so insert first,
  // supersede second. This is safe from a "two active rules" standpoint
  // because the new row's candidate_signature always differs from the old
  // one's (different direction/comparison key) — the partial unique index
  // on (coach_user_id, candidate_signature) WHERE status='active' never
  // collides between them; the OLD row briefly being active alongside the
  // NEW one only exists for the instant between these two statements, not
  // as any durable, readable state a concurrent request could observe as
  // "two contradictory active rules" surviving.
  const nowIso = new Date().toISOString();
  const { error: insertRuleError } = await supabase.from("coach_learned_rules").insert({
    id: newRuleId,
    workspace_id: params.workspaceId,
    coach_user_id: ctx.userId,
    scope: fresh.scope,
    client_profile_id: fresh.clientProfileId,
    decision_domain: sig.decisionDomain,
    field: sig.field,
    item_family: sig.itemFamily,
    direction: fresh.direction,
    behavior: buildRuleBehavior(fresh),
    summary: fresh.summary,
    candidate_signature: params.candidateSignature,
    supporting_evidence_ids: fresh.supportingEvidenceIds,
    contradicting_evidence_ids: fresh.contradictingEvidenceIds,
    evidence_strength_at_confirmation: fresh.evidenceStrength,
    conflicted_with_explicit_methodology: fresh.conflictsWithExplicitMethodology,
    status: "active",
    confirmed_by: ctx.userId,
    confirmed_at: nowIso,
  });
  if (insertRuleError) throw new Error(`confirmLearnedRule (insert rule) failed: ${insertRuleError.message}`);

  for (const old of existingActiveForContext ?? []) {
    const { error: supersedeError } = await supabase.from("coach_learned_rules").update({ status: "superseded", superseded_by_rule_id: newRuleId }).eq("id", old.id).eq("coach_user_id", ctx.userId).eq("status", "active");
    if (supersedeError) throw new Error(`confirmLearnedRule (supersede) failed: ${supersedeError.message}`);
  }

  const { error: insertDispositionError } = await supabase.from("coach_pattern_candidate_dispositions").insert(dispositionRowFor(fresh, "confirmed", ctx.userId, params.workspaceId, newRuleId));
  if (insertDispositionError && (insertDispositionError as { code?: string }).code !== "23505") throw new Error(`confirmLearnedRule (insert disposition) failed: ${insertDispositionError.message}`);

  return { ruleId: newRuleId };
}

/** CONTEXTUAL — "this happens, but only in certain situations." Persists
 * disposition only; deliberately creates NO rule (spec section 9B: an
 * overly broad unconditional rule must never be created from this
 * response). */
export async function recordContextualDisposition(params: { workspaceId: string; candidateSignature: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const fresh = await findFreshCandidateBySignature(params.workspaceId, ctx.userId, params.candidateSignature);
  if (!fresh) throw new Error("recordContextualDisposition: candidate not found against current evidence.");
  const { error } = await supabase.from("coach_pattern_candidate_dispositions").insert(dispositionRowFor(fresh, "contextual", ctx.userId, params.workspaceId, null));
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordContextualDisposition failed: ${error.message}`);
}

/** REJECT — "this is not a rule I want OPTIM to learn." Persists
 * disposition only, suppressing this exact candidate signature from
 * resurfacing (spec section 10). */
export async function recordRejectedDisposition(params: { workspaceId: string; candidateSignature: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const fresh = await findFreshCandidateBySignature(params.workspaceId, ctx.userId, params.candidateSignature);
  if (!fresh) throw new Error("recordRejectedDisposition: candidate not found against current evidence.");
  const { error } = await supabase.from("coach_pattern_candidate_dispositions").insert(dispositionRowFor(fresh, "rejected", ctx.userId, params.workspaceId, null));
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordRejectedDisposition failed: ${error.message}`);
}

export interface LearnedRuleRecord {
  id: string;
  scope: PatternScope;
  clientProfileId: string | null;
  clientDisplayName: string | null;
  decisionDomain: string;
  field: string;
  itemFamily: string | null;
  direction: string;
  summary: string;
  status: "active" | "deactivated" | "superseded";
  confirmedAtIso: string;
  deactivatedAtIso: string | null;
}

/** Every rule this coach has ever confirmed — active and historical alike
 * (spec section 15: deactivation must never delete history). */
export async function getMyLearnedRules(workspaceId: string): Promise<LearnedRuleRecord[]> {
  const ctx = await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("coach_learned_rules").select("*").eq("coach_user_id", ctx.userId).order("confirmed_at", { ascending: false });
  if (error) throw new Error(`getMyLearnedRules failed: ${error.message}`);
  const clientIds = (data ?? []).map((r) => r.client_profile_id).filter((id): id is string => !!id);
  const names = await buildClientNameLookup(supabase, clientIds);
  return (data ?? []).map((r) => ({
    id: r.id,
    scope: r.scope,
    clientProfileId: r.client_profile_id,
    clientDisplayName: r.client_profile_id ? (names.get(r.client_profile_id) ?? null) : null,
    decisionDomain: r.decision_domain,
    field: r.field,
    itemFamily: r.item_family,
    direction: r.direction,
    summary: r.summary,
    status: r.status,
    confirmedAtIso: r.confirmed_at,
    deactivatedAtIso: r.deactivated_at,
  }));
}

/** "I don't coach this way anymore" — deactivates without deleting the
 * historical confirmation (spec section 15). Idempotent: deactivating an
 * already-deactivated/superseded rule is a safe no-op. */
export async function deactivateLearnedRule(params: { workspaceId: string; ruleId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("coach_learned_rules")
    .update({ status: "deactivated", deactivated_by: ctx.userId, deactivated_at: new Date().toISOString() })
    .eq("id", params.ruleId)
    .eq("coach_user_id", ctx.userId)
    .eq("status", "active");
  if (error) throw new Error(`deactivateLearnedRule failed: ${error.message}`);
}
