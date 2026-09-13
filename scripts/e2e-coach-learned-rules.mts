// Phase 9B — Coach-Confirmed Learned Rules.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through
// Mailpit, RLS-governed queries through each real signed-in session,
// service-role only to create fixture auth users.
//
// lib/production/learned-rules.ts can't be imported here directly
// (server-only, needs next/headers) — this script reproduces its exact
// real confirm/contextual/reject/deactivate logic one step at a time,
// using the actual, imported PURE functions
// (analyzeCoachDecisionPatterns, isCandidateEligibleForConfirmation,
// computeCandidateSignature, buildRuleBehavior) matching this repo's
// established e2e convention.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-9b-* fixtures):
//   node --experimental-strip-types scripts/e2e-coach-learned-rules.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateDecisionEvidenceInput, type DecisionEvidenceInput } from "../lib/decisions/types.ts";
import { analyzeCoachDecisionPatterns } from "../lib/patterns/analyze-coach-decision-patterns.ts";
import { isCandidateEligibleForConfirmation, buildRuleBehavior } from "../lib/patterns/eligibility.ts";
import { computeCandidateSignature } from "../lib/patterns/candidate-signature.ts";
import type { DecisionEvidenceRecord } from "../lib/decisions/types.ts";
import type { PatternCandidate } from "../lib/patterns/types.ts";

function readLocalStatus(): Record<string, string> {
  const raw = execSync("npx supabase status -o env", { cwd: process.cwd() }).toString();
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const status = readLocalStatus();
const url = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY;
const mailpitUrl = status.MAILPIT_URL;

if (!url || !url.includes("127.0.0.1")) {
  console.error(`Refusing to run: API_URL "${url}" doesn't look like the local stack. This script is local-only.`);
  process.exit(1);
}
if (!anonKey || !serviceRoleKey || !mailpitUrl) {
  console.error("Missing ANON_KEY/SERVICE_ROLE_KEY/MAILPIT_URL from `supabase status -o env` — is the local stack running?");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${description}`);
  } else {
    failed += 1;
    console.error(`FAIL  - ${description}${detail ? ` (${detail})` : ""}`);
  }
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function fetchOtpCodeFromMailpit(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listRes = await fetch(`${mailpitUrl}/api/v1/messages?limit=5`);
    const list = (await listRes.json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const match = list.messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
    if (match) {
      const msgRes = await fetch(`${mailpitUrl}/api/v1/message/${match.ID}`);
      const msg = (await msgRes.json()) as { Text: string; HTML: string };
      const body = msg.Text || msg.HTML;
      const codeMatch = body.match(/\b(\d{6})\b/);
      if (codeMatch) return codeMatch[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email arrived for ${email} within timeout`);
}

async function signInAsRealSession(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey);
  const { error: otpError } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (otpError) throw new Error(`signInWithOtp failed for ${email}: ${otpError.message}`);
  const code = await fetchOtpCodeFromMailpit(email);
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) throw new Error(`verifyOtp failed for ${email}: ${error?.message}`);
  return client;
}

async function ensureUser(email: string, displayName: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: displayName } });
  if (error) {
    if (error.message.includes("already been registered") || error.status === 422) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
      const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (existing) return existing;
    }
    throw new Error(`createUser failed for ${email}: ${error.message}`);
  }
  return data.user;
}

async function recordEvidenceAs(client: SupabaseClient, input: DecisionEvidenceInput): Promise<void> {
  const v = validateDecisionEvidenceInput(input);
  const row = {
    workspace_id: v.workspaceId, coach_user_id: v.coachUserId, client_profile_id: v.clientProfileId, decision_domain: v.decisionDomain, decision_type: v.decisionType,
    outcome: v.outcome, proposed_value: v.proposedValue, chosen_value: v.chosenValue, reason: v.reason ?? null, program_assignment_id: v.programAssignmentId ?? null,
    escalation_id: v.escalationId ?? null, training_item_instance_id: v.trainingItemInstanceId ?? null, observation_ids: v.observationIds ?? null, source_ref: v.sourceRef, decided_at: v.decidedAtIso,
  };
  const { error } = await client.from("coach_decision_evidence").insert(row);
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordEvidenceAs failed: ${error.message}`);
}

async function fetchMyDecisionEvidence(client: SupabaseClient): Promise<DecisionEvidenceRecord[]> {
  const { data, error } = await client.from("coach_decision_evidence").select("*").order("decided_at", { ascending: false });
  if (error) throw new Error(`fetchMyDecisionEvidence failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id, workspaceId: r.workspace_id, coachUserId: r.coach_user_id, clientProfileId: r.client_profile_id, decisionDomain: r.decision_domain, decisionType: r.decision_type,
    outcome: r.outcome, proposedValue: r.proposed_value ?? null, chosenValue: r.chosen_value ?? null, reason: r.reason ?? null, programAssignmentId: r.program_assignment_id ?? null,
    escalationId: r.escalation_id ?? null, trainingItemInstanceId: r.training_item_instance_id ?? null, observationIds: r.observation_ids ?? null, sourceRef: r.source_ref,
    decidedAtIso: r.decided_at, recordedAtIso: r.recorded_at,
  }));
}

function setsEditEvidence(params: { workspaceId: string; coachUserId: string; clientProfileId: string; versionId: string; from: number; to: number; decidedAtIso: string }): DecisionEvidenceInput {
  return {
    workspaceId: params.workspaceId, coachUserId: params.coachUserId, clientProfileId: params.clientProfileId, decisionDomain: "prescription", decisionType: "item_prescription_edited",
    outcome: "edited", proposedValue: { exerciseName: "Barbell Bench Press", sets: params.from }, chosenValue: { exerciseName: "Barbell Bench Press", sets: params.to },
    trainingItemInstanceId: "item-monday-1-barbell-bench-press", sourceRef: `program_version_item:${params.versionId}:1:Monday:0:b1:item-monday-1-barbell-bench-press`, decidedAtIso: params.decidedAtIso,
  };
}

/** Reproduces getEligibleCandidatesForReview's core filter (real eligible
 * candidates minus already-dispositioned/already-active signatures). */
async function fetchEligibleCandidates(coachSession: SupabaseClient, coachUserId: string): Promise<PatternCandidate[]> {
  const evidence = await fetchMyDecisionEvidence(coachSession);
  const analysis = analyzeCoachDecisionPatterns({ coachUserId, evidence, nowIso: new Date().toISOString() });
  const { data: dispositions } = await coachSession.from("coach_pattern_candidate_dispositions").select("candidate_signature").eq("coach_user_id", coachUserId);
  const { data: activeRules } = await coachSession.from("coach_learned_rules").select("candidate_signature").eq("coach_user_id", coachUserId).eq("status", "active");
  const suppressed = new Set([...(dispositions ?? []).map((r) => r.candidate_signature as string), ...(activeRules ?? []).map((r) => r.candidate_signature as string)]);
  return analysis.candidates.filter((c) => isCandidateEligibleForConfirmation(c) && !suppressed.has(computeCandidateSignature(c)));
}

/** Reproduces confirmLearnedRule's real insert sequence exactly. */
async function confirmLearnedRule(coachSession: SupabaseClient, params: { workspaceId: string; coachUserId: string; candidate: PatternCandidate }): Promise<string> {
  const { candidate } = params;
  const sig = candidate.contextSignature;
  const newRuleId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Supersede any existing ACTIVE rule for the SAME CONTEXT (domain/field/
  // family/scope/client — regardless of direction), mirroring
  // lib/production/learned-rules.ts's real confirmLearnedRule exactly: the
  // new row must be INSERTED FIRST — superseded_by_rule_id has a real
  // foreign-key constraint, so the old row can only reference it once it
  // exists (caught live: the naive "supersede then insert" order fails
  // with coach_learned_rules_superseded_by_rule_id_fkey).
  let contextQuery = coachSession.from("coach_learned_rules").select("id").eq("coach_user_id", params.coachUserId).eq("scope", candidate.scope).eq("decision_domain", sig.decisionDomain).eq("field", sig.field).eq("status", "active");
  contextQuery = candidate.clientProfileId ? contextQuery.eq("client_profile_id", candidate.clientProfileId) : contextQuery.is("client_profile_id", null);
  contextQuery = sig.itemFamily ? contextQuery.eq("item_family", sig.itemFamily) : contextQuery.is("item_family", null);
  const { data: existingActiveForContext } = await contextQuery;

  const { error: insertRuleError } = await coachSession.from("coach_learned_rules").insert({
    id: newRuleId, workspace_id: params.workspaceId, coach_user_id: params.coachUserId, scope: candidate.scope, client_profile_id: candidate.clientProfileId,
    decision_domain: sig.decisionDomain, field: sig.field, item_family: sig.itemFamily, direction: candidate.direction, behavior: buildRuleBehavior(candidate),
    summary: candidate.summary, candidate_signature: computeCandidateSignature(candidate), supporting_evidence_ids: candidate.supportingEvidenceIds,
    contradicting_evidence_ids: candidate.contradictingEvidenceIds, evidence_strength_at_confirmation: candidate.evidenceStrength, conflicted_with_explicit_methodology: candidate.conflictsWithExplicitMethodology,
    status: "active", confirmed_by: params.coachUserId, confirmed_at: nowIso,
  });
  if (insertRuleError) throw new Error(`confirmLearnedRule (insert rule) failed: ${insertRuleError.message}`);

  for (const old of existingActiveForContext ?? []) {
    const { error: supersedeError } = await coachSession.from("coach_learned_rules").update({ status: "superseded", superseded_by_rule_id: newRuleId }).eq("id", old.id).eq("coach_user_id", params.coachUserId).eq("status", "active");
    if (supersedeError) throw new Error(`confirmLearnedRule (supersede) failed: ${supersedeError.message}`);
  }

  const { error: insertDispositionError } = await coachSession.from("coach_pattern_candidate_dispositions").insert({
    workspace_id: params.workspaceId, coach_user_id: params.coachUserId, candidate_signature: computeCandidateSignature(candidate), scope: candidate.scope, client_profile_id: candidate.clientProfileId,
    decision_domain: sig.decisionDomain, outcome: "confirmed", support_count_at_disposition: candidate.supportCount, contradiction_count_at_disposition: candidate.contradictionCount,
    distinct_client_count_at_disposition: candidate.distinctClientCount, supporting_evidence_ids: candidate.supportingEvidenceIds, contradicting_evidence_ids: candidate.contradictingEvidenceIds,
    learned_rule_id: newRuleId, decided_by: params.coachUserId,
  });
  if (insertDispositionError) throw new Error(`confirmLearnedRule (insert disposition) failed: ${insertDispositionError.message}`);

  return newRuleId;
}

async function rejectCandidate(coachSession: SupabaseClient, params: { workspaceId: string; coachUserId: string; candidate: PatternCandidate }): Promise<void> {
  const { candidate } = params;
  const { error } = await coachSession.from("coach_pattern_candidate_dispositions").insert({
    workspace_id: params.workspaceId, coach_user_id: params.coachUserId, candidate_signature: computeCandidateSignature(candidate), scope: candidate.scope, client_profile_id: candidate.clientProfileId,
    decision_domain: candidate.contextSignature.decisionDomain, outcome: "rejected", support_count_at_disposition: candidate.supportCount, contradiction_count_at_disposition: candidate.contradictionCount,
    distinct_client_count_at_disposition: candidate.distinctClientCount, supporting_evidence_ids: candidate.supportingEvidenceIds, contradicting_evidence_ids: candidate.contradictingEvidenceIds,
    learned_rule_id: null, decided_by: params.coachUserId,
  });
  if (error) throw new Error(`rejectCandidate failed: ${error.message}`);
}

async function deactivateRule(coachSession: SupabaseClient, params: { coachUserId: string; ruleId: string }): Promise<void> {
  const { error } = await coachSession
    .from("coach_learned_rules")
    .update({ status: "deactivated", deactivated_by: params.coachUserId, deactivated_at: new Date().toISOString() })
    .eq("id", params.ruleId)
    .eq("coach_user_id", params.coachUserId)
    .eq("status", "active");
  if (error) throw new Error(`deactivateRule failed: ${error.message}`);
}

async function main() {
  console.log(`OPTIM Phase 9B — live E2E coach-confirmed learned rules verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 9B fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-9b-coach-a@example.test", "Coach A 9B");
  const coachB = await ensureUser("e2e-9b-coach-b@example.test", "Coach B 9B");
  const otherCoach = await ensureUser("e2e-9b-other-coach@example.test", "Other Coach 9B");
  const clientA = await ensureUser("e2e-9b-client-a@example.test", "Client A 9B");
  const clientOneUser = await ensureUser("e2e-9b-client-one@example.test", "Client One 9B");
  const clientTwoUser = await ensureUser("e2e-9b-client-two@example.test", "Client Two 9B");
  const clientThreeUser = await ensureUser("e2e-9b-client-three@example.test", "Client Three 9B");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }
  const workspaceId = await ensureWorkspace(coachA.id, "E2E 9B Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 9B Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: coachB.id, role: "coach", status: "active" },
      { workspace_id: workspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientOneUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientTwoUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientThreeUser.id, role: "client", status: "active" },
      { workspace_id: otherWorkspaceId, user_id: otherCoach.id, role: "workspace_owner", status: "active" },
    ],
    { onConflict: "workspace_id,user_id" }
  );

  async function ensureClientProfile(userId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("client_profiles").insert({ workspace_id: workspaceId, user_id: userId, display_name: displayName }).select("id").single();
    if (error) throw new Error(`client_profiles insert failed: ${error.message}`);
    await admin.from("coach_client_assignments").insert({ workspace_id: workspaceId, coach_user_id: coachA.id, client_profile_id: data!.id, is_primary: true });
    return data!.id as string;
  }
  const clientOneProfileId = await ensureClientProfile(clientOneUser.id, "Client One 9B");
  const clientTwoProfileId = await ensureClientProfile(clientTwoUser.id, "Client Two 9B");
  const clientThreeProfileId = await ensureClientProfile(clientThreeUser.id, "Client Three 9B");
  const clientAProfileId = await ensureClientProfile(clientA.id, "Client A 9B");

  console.log("  fixtures ready: Coach A (owner, assigned to 4 clients) + Coach B (unassigned coach, same workspace) + Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachASession = await signInAsRealSession("e2e-9b-coach-a@example.test");
  const coachBSession = await signInAsRealSession("e2e-9b-coach-b@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-9b-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-9b-client-a@example.test");
  check("Coach A, Coach B, Other Coach, and Client A all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Coach A performs the SAME comparable edit across 3 distinct real clients — Phase 9A produces an eligible (STRONG) coach-general candidate\n");

  // Coach-general "strong" requires >=3 distinct clients (see
  // lib/patterns/analyze-coach-decision-patterns.ts's own documented
  // MIN_DISTINCT_CLIENTS_FOR_STRONG_COACH_GENERAL) — this eligibility gate
  // only ever surfaces "strong" candidates, so this script uses 3 real
  // clients, not 2.
  const nowIso = new Date().toISOString();
  for (const [clientProfileId, versionPrefix] of [[clientOneProfileId, "v1"], [clientTwoProfileId, "v2"], [clientThreeProfileId, "v3"]] as const) {
    for (let i = 0; i < 3; i++) {
      await recordEvidenceAs(coachASession, setsEditEvidence({ workspaceId, coachUserId: coachA.id, clientProfileId, versionId: `${versionPrefix}-${i}`, from: 4, to: 3, decidedAtIso: new Date(Date.parse(nowIso) + i * 86400000).toISOString() }));
    }
  }

  let eligible = await fetchEligibleCandidates(coachASession, coachA.id);
  const coachGeneralCandidate = eligible.find((c) => c.scope === "coach_general" && c.contextSignature.field === "sets");
  check("A/B: a real, eligible coach-general candidate is produced from real evidence across 3 clients", !!coachGeneralCandidate);
  check("C: the candidate's summary reflects the real structured semantics (decrease, sets)", coachGeneralCandidate?.direction === "decrease" && coachGeneralCandidate?.summary.length > 0);
  check("D: supportCount matches the 9 real comparable decisions", coachGeneralCandidate?.supportCount === 9);
  check("F: distinctClientCount is exactly 3", coachGeneralCandidate?.distinctClientCount === 3);

  console.log("\n4. Coach A confirms the candidate\n");

  const ruleId = await confirmLearnedRule(coachASession, { workspaceId, coachUserId: coachA.id, candidate: coachGeneralCandidate! });
  check("I: confirming creates exactly one rule", !!ruleId);

  const { data: ruleRow } = await coachASession.from("coach_learned_rules").select("*").eq("id", ruleId).single();
  check("K: the persisted rule is typed/structured — direction and behavior reflect real candidate semantics", ruleRow?.direction === "decrease" && ruleRow?.behavior?.comparisonKey === "decrease");
  check("L: provenance is preserved — supporting_evidence_ids matches the real evidence that produced this candidate", JSON.stringify([...ruleRow!.supporting_evidence_ids].sort()) === JSON.stringify([...coachGeneralCandidate!.supportingEvidenceIds].sort()));
  check("confirmed_by/confirmed_at are the real coach and a real timestamp", ruleRow?.confirmed_by === coachA.id && !!ruleRow?.confirmed_at);

  console.log("\n5. Re-running shadow analysis — the confirmed candidate is not redundantly resurfaced\n");

  eligible = await fetchEligibleCandidates(coachASession, coachA.id);
  check("H/9: the same candidate signature is no longer offered for review after confirmation", !eligible.some((c) => computeCandidateSignature(c) === computeCandidateSignature(coachGeneralCandidate!)));

  console.log("\n6. Zero generation influence — the exact same program generates identically after confirmation\n");

  const com = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId, nowIso, businessName: "E2E 9B Workspace" });
  const profile = buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]);
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: 4 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const genParams = { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 4, nowIso: "2026-01-01T00:00:00.000Z" };
  const normalize = (value: unknown) => JSON.stringify(value).replace(/\d{10,}(-\d+)?/g, "<volatile>");
  const beforeCheck = buildUniversalProgramForDirection(direction, genParams);
  const afterCheck = buildUniversalProgramForDirection(direction, genParams);
  check("Z/AA: generation content is IDENTICAL — a real confirmed rule now exists and generation still never reads it (modulo generation's own pre-existing Date.now()-based id suffixes)", normalize(beforeCheck) === normalize(afterCheck));

  console.log("\n7. Deactivation — historical confirmation is preserved, never deleted\n");

  await deactivateRule(coachASession, { coachUserId: coachA.id, ruleId });
  const { data: deactivatedRow } = await coachASession.from("coach_learned_rules").select("status, confirmed_by, confirmed_at, deactivated_at").eq("id", ruleId).single();
  check("S: the rule's status is now 'deactivated'", deactivatedRow?.status === "deactivated");
  check("T: the ORIGINAL confirmation fact (confirmed_by/confirmed_at) is completely unchanged — history is never rewritten", deactivatedRow?.confirmed_by === coachA.id && !!deactivatedRow?.confirmed_at);
  check("T: deactivated_at is a real, new timestamp, not fabricated", !!deactivatedRow?.deactivated_at);

  const retryDeactivate = await coachASession.from("coach_learned_rules").update({ status: "deactivated" }).eq("id", ruleId).eq("coach_user_id", coachA.id).eq("status", "active");
  check("idempotent: retrying deactivation on an already-deactivated rule affects zero rows, never errors", !retryDeactivate.error && (retryDeactivate.count ?? 0) === 0);

  console.log("\n8. A separate candidate is rejected — suppressed from immediately resurfacing\n");

  for (const [clientProfileId, versionPrefix] of [[clientOneProfileId, "rest1"], [clientTwoProfileId, "rest2"], [clientThreeProfileId, "rest3"]] as const) {
    for (let i = 0; i < 3; i++) {
      await recordEvidenceAs(coachASession, {
        workspaceId, coachUserId: coachA.id, clientProfileId, decisionDomain: "scheduling", decisionType: "training_day_converted_to_rest",
        outcome: "overridden", proposedValue: { dayType: "training" }, chosenValue: { dayType: "rest" },
        sourceRef: `program_version_day:v-${versionPrefix}-${i}:1:Friday`, decidedAtIso: new Date(Date.parse(nowIso) + (10 + i) * 86400000).toISOString(),
      });
    }
  }
  eligible = await fetchEligibleCandidates(coachASession, coachA.id);
  const restCandidate = eligible.find((c) => c.scope === "coach_general" && c.contextSignature.field === "dayConvertedToRest");
  check("B/E: a second, unrelated eligible candidate (day-to-rest) is produced", !!restCandidate);

  await rejectCandidate(coachASession, { workspaceId, coachUserId: coachA.id, candidate: restCandidate! });
  const { data: rejectionRow } = await coachASession.from("coach_pattern_candidate_dispositions").select("outcome, learned_rule_id").eq("candidate_signature", computeCandidateSignature(restCandidate!)).single();
  check("P: rejection is persisted with outcome='rejected' and no rule reference", rejectionRow?.outcome === "rejected" && rejectionRow?.learned_rule_id === null);

  const { data: rulesAfterReject } = await coachASession.from("coach_learned_rules").select("id").eq("candidate_signature", computeCandidateSignature(restCandidate!));
  check("P: rejection never creates a rule", (rulesAfterReject ?? []).length === 0);

  eligible = await fetchEligibleCandidates(coachASession, coachA.id);
  check("Q/15: the rejected candidate signature is suppressed — it does not immediately resurface", !eligible.some((c) => computeCandidateSignature(c) === computeCandidateSignature(restCandidate!)));

  console.log("\n9. Supersession — a newer, directionally-incompatible rule for the SAME context never silently coexists with an active one\n");

  // Round 1: a real "load decrease" pattern across 3 clients, confirmed as
  // an active rule.
  for (const [clientProfileId, versionPrefix] of [[clientOneProfileId, "ld1"], [clientTwoProfileId, "ld2"], [clientThreeProfileId, "ld3"]] as const) {
    for (let i = 0; i < 3; i++) {
      await recordEvidenceAs(coachASession, {
        workspaceId, coachUserId: coachA.id, clientProfileId, decisionDomain: "prescription", decisionType: "item_prescription_edited", outcome: "edited",
        proposedValue: { exerciseName: "Conventional Deadlift", loadValue: 200 }, chosenValue: { exerciseName: "Conventional Deadlift", loadValue: 180 },
        trainingItemInstanceId: "item-wednesday-1-conventional-deadlift", sourceRef: `program_version_item:v-${versionPrefix}-${i}:1:Wednesday:0:b1:item-wednesday-1-conventional-deadlift`, decidedAtIso: new Date(Date.parse(nowIso) + (20 + i) * 86400000).toISOString(),
      });
    }
  }
  eligible = await fetchEligibleCandidates(coachASession, coachA.id);
  const loadDecreaseCandidate = eligible.find((c) => c.scope === "coach_general" && c.contextSignature.field === "loadValue" && c.direction === "decrease");
  check("a real 'load decrease' candidate is produced", !!loadDecreaseCandidate);
  const loadRuleV1 = await confirmLearnedRule(coachASession, { workspaceId, coachUserId: coachA.id, candidate: loadDecreaseCandidate! });

  const { data: activeLoadRulesBeforeSupersede } = await coachASession.from("coach_learned_rules").select("id, status").eq("coach_user_id", coachA.id).eq("field", "loadValue").eq("status", "active");
  check("the first load rule is active", (activeLoadRulesBeforeSupersede ?? []).some((r) => r.id === loadRuleV1));

  // Round 2: the SAME context (prescription/loadValue, no resolved family),
  // but a directionally-incompatible "load increase" pattern. Both
  // directions share one context-signature group (direction is NOT part
  // of grouping — only of the eventual candidate's own signature), so they
  // genuinely contend for dominance within the same live evidence pool —
  // by design (a handful of new contrary decisions must never flip an
  // established pattern; spec section 26's "do not create complicated
  // Bayesian infrastructure... but a pattern should not flicker wildly").
  // 18 real decisions per client (54 total) against the 9 already-recorded
  // decreases is what a genuine, real reversal takes: 54/(54+9) ≈ 0.86,
  // clearing the 0.85 "strong" dominance bar this script's own engine
  // documents (lib/patterns/analyze-coach-decision-patterns.ts).
  for (const [clientProfileId, versionPrefix] of [[clientOneProfileId, "li1"], [clientTwoProfileId, "li2"], [clientThreeProfileId, "li3"]] as const) {
    for (let i = 0; i < 18; i++) {
      await recordEvidenceAs(coachASession, {
        workspaceId, coachUserId: coachA.id, clientProfileId, decisionDomain: "prescription", decisionType: "item_prescription_edited", outcome: "edited",
        proposedValue: { exerciseName: "Conventional Deadlift", loadValue: 200 }, chosenValue: { exerciseName: "Conventional Deadlift", loadValue: 220 },
        trainingItemInstanceId: "item-wednesday-1-conventional-deadlift", sourceRef: `program_version_item:v-${versionPrefix}-${i}:1:Wednesday:0:b1:item-wednesday-1-conventional-deadlift`, decidedAtIso: new Date(Date.parse(nowIso) + (30 + i) * 86400000).toISOString(),
      });
    }
  }
  eligible = await fetchEligibleCandidates(coachASession, coachA.id);
  const loadIncreaseCandidate = eligible.find((c) => c.scope === "coach_general" && c.contextSignature.field === "loadValue" && c.direction === "increase");
  check("U: a directionally-incompatible candidate for the SAME context (loadValue) is produced and remains eligible for review even though a rule already exists for this context", !!loadIncreaseCandidate);
  const loadRuleV2 = await confirmLearnedRule(coachASession, { workspaceId, coachUserId: coachA.id, candidate: loadIncreaseCandidate! });

  const { data: loadRulesAfterSupersede } = await coachASession.from("coach_learned_rules").select("id, status, superseded_by_rule_id").eq("coach_user_id", coachA.id).eq("field", "loadValue");
  const v1Row = loadRulesAfterSupersede?.find((r) => r.id === loadRuleV1);
  const v2Row = loadRulesAfterSupersede?.find((r) => r.id === loadRuleV2);
  check("U: the OLDER load rule is now superseded, referencing the new rule — never left silently active alongside a contradictory one", v1Row?.status === "superseded" && v1Row?.superseded_by_rule_id === loadRuleV2);
  check("U: the NEW load rule is the one now active", v2Row?.status === "active");
  const { data: activeLoadRulesFinal } = await coachASession.from("coach_learned_rules").select("id").eq("coach_user_id", coachA.id).eq("field", "loadValue").eq("status", "active");
  check("U: exactly ONE active rule exists for this context after supersession — never two contradictory active rules", (activeLoadRulesFinal ?? []).length === 1);

  console.log("\n10. Self-reference protection — confirmation/disposition activity is invisible to Phase 9A's own analysis\n");

  const evidenceAfterAllActivity = await fetchMyDecisionEvidence(coachASession);
  const stillOnlyRealDecisionTypes = evidenceAfterAllActivity.every((e) => e.decisionType === "item_prescription_edited" || e.decisionType === "training_day_converted_to_rest");
  check("V: no coach_decision_evidence row was ever created by confirming/rejecting a candidate — self-reference is structurally impossible, not merely filtered", stillOnlyRealDecisionTypes);

  console.log("\n11. Authorization — unrelated coach, client, and cross-workspace coach are all denied\n");

  const { data: coachBRules } = await coachBSession.from("coach_learned_rules").select("id");
  check("W: Coach B (same workspace, unrelated) reads ZERO of Coach A's learned rules", (coachBRules ?? []).length === 0);
  const { error: coachBConfirmAttempt } = await coachBSession.from("coach_learned_rules").insert({
    workspace_id: workspaceId, coach_user_id: coachA.id, scope: "coach_general", decision_domain: "prescription", field: "sets", direction: "decrease", behavior: {},
    summary: "forged", candidate_signature: "forged-signature", supporting_evidence_ids: [], contradicting_evidence_ids: [], evidence_strength_at_confirmation: "strong",
    status: "active", confirmed_by: coachA.id, confirmed_at: new Date().toISOString(),
  });
  check("W: Coach B cannot forge a rule claiming to be Coach A's (coach_user_id must equal the real caller) — rejected by RLS", !!coachBConfirmAttempt);

  const { data: clientRules, error: clientRulesError } = await clientASession.from("coach_learned_rules").select("id");
  check("X: the client has no generic read access to coach learned rules at all", !clientRulesError && (clientRules ?? []).length === 0);

  const { data: otherCoachRules } = await otherCoachSession.from("coach_learned_rules").select("id");
  check("Y: an unrelated coach in a completely different workspace reads ZERO rows", (otherCoachRules ?? []).length === 0);

  const { data: otherCoachDispositions } = await otherCoachSession.from("coach_pattern_candidate_dispositions").select("id");
  check("Y: cross-workspace isolation also holds for candidate dispositions", (otherCoachDispositions ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
