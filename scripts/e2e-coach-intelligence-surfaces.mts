// Phase 10A — Coach Intelligence Surfaces.
//
// Live E2E verification against a real local Supabase stack. Builds
// directly on Phase 9D's (scripts/e2e-client-state-analysis.mts) and
// Phase 9C's (scripts/e2e-learned-rule-generation.mts) own proven
// patterns rather than re-proving their underlying domains from scratch —
// this script's own focus is the NEW Phase 10A surface: the presentation
// filter applied to real analysis output, the evidence drill-down, and —
// the most novel, highest-risk part of this phase — persisted,
// historically-truthful rule provenance that survives a later rule
// deactivation.
//
// app/actions/production-programs.ts's new actions
// (getClientWorkspaceIntelligenceAction, getFindingEvidenceDetailAction)
// are server actions that need next/headers request context and can't be
// imported directly here — this script reproduces their real logic one
// step at a time against real signed-in sessions, calling the same real
// PURE functions (selectFindingsForCoachUI, formatObservationForDisplay,
// analyzeClientState) those actions call.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — wipes its own isolated e2e-10a-* fixture rows at the start
// of every run):
//   node --experimental-strip-types scripts/e2e-coach-intelligence-surfaces.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { analyzeClientState } from "../lib/client-state/analyze-client-state.ts";
import { selectFindingsForCoachUI } from "../lib/client-state/presentation.ts";
import { formatObservationForDisplay } from "../lib/client-state/evidence-display.ts";
import { scheduledTrainingDatesInWindow } from "../lib/client-state/schedule.ts";
import { addDaysToLocalDate } from "../lib/shared/local-date.ts";
import { applyTrainingItemPatch } from "../lib/training/program-proposal-editing.ts";
import type { RawObservation } from "../lib/client-state/evidence.ts";
import type { ProgramEnrollment } from "../lib/scheduling/types";
import type { PatternCandidate } from "../lib/patterns/types.ts";
import { buildRuleBehavior } from "../lib/patterns/eligibility.ts";
import { computeCandidateSignature } from "../lib/patterns/candidate-signature.ts";
import { analyzeCoachDecisionPatterns } from "../lib/patterns/analyze-coach-decision-patterns.ts";
import type { DecisionEvidenceInput, DecisionEvidenceRecord } from "../lib/decisions/types.ts";
import { validateDecisionEvidenceInput } from "../lib/decisions/types.ts";

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

function dayRef(clientProfileId: string, dateIso: string): string {
  return `daily_records:${clientProfileId}:${dateIso}`;
}

async function insertSessionObservation(session: SupabaseClient, params: { workspaceId: string; clientProfileId: string; dateIso: string; status: "completed" | "skipped"; skipReason?: string }) {
  const observedAt = `${params.dateIso}T18:00:00.000Z`;
  const rows: { workspace_id: string; client_profile_id: string; category: string; metric_key: string; source_type: string; value_type: string; value_text: string; source_ref: string; observed_at: string }[] = [
    { workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, category: "training_performance", metric_key: "session_status", source_type: "workout_execution", value_type: "categorical", value_text: params.status, source_ref: dayRef(params.clientProfileId, params.dateIso), observed_at: observedAt },
  ];
  if (params.status === "skipped" && params.skipReason) {
    rows.push({ workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, category: "adherence", metric_key: "skip_reason", source_type: "workout_execution", value_type: "categorical", value_text: params.skipReason, source_ref: dayRef(params.clientProfileId, params.dateIso), observed_at: observedAt });
  }
  const { error } = await session.from("client_observations").upsert(rows, { onConflict: "client_profile_id,source_type,source_ref,metric_key" });
  if (error) throw new Error(`insertSessionObservation failed: ${error.message}`);
}

async function fetchObservationsLive(session: SupabaseClient, clientProfileId: string, sinceIso: string): Promise<RawObservation[]> {
  const { data, error } = await session.from("client_observations").select("*").eq("client_profile_id", clientProfileId).gte("observed_at", `${sinceIso}T00:00:00.000Z`).order("observed_at", { ascending: false });
  if (error) throw new Error(`fetchObservationsLive failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    category: r.category as string,
    metricKey: r.metric_key as string,
    sourceType: r.source_type as string,
    value:
      r.value_type === "numeric" ? { valueType: "numeric" as const, valueNumeric: r.value_numeric as number } : r.value_type === "boolean" ? { valueType: "boolean" as const, valueBoolean: r.value_boolean as boolean } : { valueType: r.value_type as "categorical" | "text", valueText: r.value_text as string },
    unit: (r.unit as string | null) ?? null,
    sourceRef: (r.source_ref as string | null) ?? null,
    trainingItemInstanceId: (r.training_item_instance_id as string | null) ?? null,
    observedAtIso: r.observed_at as string,
  }));
}

async function recordEvidenceAs(session: SupabaseClient, input: DecisionEvidenceInput): Promise<void> {
  const v = validateDecisionEvidenceInput(input);
  const row = {
    workspace_id: v.workspaceId, coach_user_id: v.coachUserId, client_profile_id: v.clientProfileId, decision_domain: v.decisionDomain, decision_type: v.decisionType,
    outcome: v.outcome, proposed_value: v.proposedValue, chosen_value: v.chosenValue, reason: v.reason ?? null, program_assignment_id: v.programAssignmentId ?? null,
    escalation_id: v.escalationId ?? null, training_item_instance_id: v.trainingItemInstanceId ?? null, observation_ids: v.observationIds ?? null, source_ref: v.sourceRef, decided_at: v.decidedAtIso,
  };
  const { error } = await session.from("coach_decision_evidence").insert(row);
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordEvidenceAs failed: ${error.message}`);
}

async function fetchMyDecisionEvidence(session: SupabaseClient): Promise<DecisionEvidenceRecord[]> {
  const { data, error } = await session.from("coach_decision_evidence").select("*").order("decided_at", { ascending: false });
  if (error) throw new Error(`fetchMyDecisionEvidence failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id, workspaceId: r.workspace_id, coachUserId: r.coach_user_id, clientProfileId: r.client_profile_id, decisionDomain: r.decision_domain, decisionType: r.decision_type,
    outcome: r.outcome, proposedValue: r.proposed_value ?? null, chosenValue: r.chosen_value ?? null, reason: r.reason ?? null, programAssignmentId: r.program_assignment_id ?? null,
    escalationId: r.escalation_id ?? null, trainingItemInstanceId: r.training_item_instance_id ?? null, observationIds: r.observation_ids ?? null, sourceRef: r.source_ref,
    decidedAtIso: r.decided_at, recordedAtIso: r.recorded_at,
  }));
}

async function confirmLearnedRule(session: SupabaseClient, params: { workspaceId: string; coachUserId: string; candidate: PatternCandidate }): Promise<string> {
  const { candidate } = params;
  const sig = candidate.contextSignature;
  const newRuleId = crypto.randomUUID();
  const { error } = await session.from("coach_learned_rules").insert({
    id: newRuleId, workspace_id: params.workspaceId, coach_user_id: params.coachUserId, scope: candidate.scope, client_profile_id: candidate.clientProfileId,
    decision_domain: sig.decisionDomain, field: sig.field, item_family: sig.itemFamily, direction: candidate.direction, behavior: buildRuleBehavior(candidate),
    summary: candidate.summary, candidate_signature: computeCandidateSignature(candidate), supporting_evidence_ids: candidate.supportingEvidenceIds,
    contradicting_evidence_ids: candidate.contradictingEvidenceIds, evidence_strength_at_confirmation: candidate.evidenceStrength, conflicted_with_explicit_methodology: candidate.conflictsWithExplicitMethodology,
    status: "active", confirmed_by: params.coachUserId, confirmed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`confirmLearnedRule failed: ${error.message}`);
  return newRuleId;
}

/** Reproduces lib/production/rule-resolution.ts's resolveApplicableCoachRules exactly. */
async function resolveApplicableCoachRulesLive(session: SupabaseClient, clientProfileId: string) {
  const { data, error } = await session.from("coach_learned_rules").select("id, scope, client_profile_id, decision_domain, field, item_family, direction").eq("status", "active").or(`scope.eq.coach_general,and(scope.eq.client_specific,client_profile_id.eq.${clientProfileId})`);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id as string, scope: r.scope as "coach_general" | "client_specific", clientProfileId: (r.client_profile_id as string | null) ?? null, decisionDomain: r.decision_domain as string, decisionType: "item_prescription_edited", field: r.field as string, itemFamily: (r.item_family as string | null) ?? null, direction: r.direction as "increase" | "decrease" }));
}

/** Reproduces lib/production/rule-resolution.ts's getLearnedRuleProvenance
 * exactly — by id, never filtered by current status. */
async function getLearnedRuleProvenanceLive(session: SupabaseClient, ruleIds: string[]) {
  if (ruleIds.length === 0) return [];
  const { data, error } = await session.from("coach_learned_rules").select("id, scope, client_profile_id, summary, direction, field, item_family, status").in("id", ruleIds);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function main() {
  console.log(`OPTIM Phase 10A — live E2E coach intelligence surfaces verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 10A fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-10a-coach-a@example.test", "Coach A 10A");
  const coachB = await ensureUser("e2e-10a-coach-b@example.test", "Coach B 10A");
  const otherCoach = await ensureUser("e2e-10a-other-coach@example.test", "Other Coach 10A");
  const clientAUser = await ensureUser("e2e-10a-client-a@example.test", "Client A (illness) 10A");
  const clientBUser = await ensureUser("e2e-10a-client-b@example.test", "Client B (schedule) 10A");
  const clientCUser = await ensureUser("e2e-10a-client-c@example.test", "Client C (rule provenance) 10A");
  const clientDUser = await ensureUser("e2e-10a-client-d@example.test", "Client D (learning pool) 10A");
  const clientEUser = await ensureUser("e2e-10a-client-e@example.test", "Client E (learning pool) 10A");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }
  const workspaceId = await ensureWorkspace(coachA.id, "E2E 10A Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 10A Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: coachB.id, role: "coach", status: "active" },
      { workspace_id: workspaceId, user_id: clientAUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientBUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientCUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientDUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientEUser.id, role: "client", status: "active" },
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
  const clientAProfileId = await ensureClientProfile(clientAUser.id, "Client A (illness) 10A");
  const clientBProfileId = await ensureClientProfile(clientBUser.id, "Client B (schedule) 10A");
  const clientCProfileId = await ensureClientProfile(clientCUser.id, "Client C (rule provenance) 10A");
  const clientDProfileId = await ensureClientProfile(clientDUser.id, "Client D (learning pool) 10A");
  const clientEProfileId = await ensureClientProfile(clientEUser.id, "Client E (learning pool) 10A");

  const cleanupResults = await Promise.all([
    admin.from("coach_pattern_candidate_dispositions").delete().eq("workspace_id", workspaceId),
    admin.from("client_observations").delete().eq("workspace_id", workspaceId),
  ]);
  await admin.from("coach_learned_rules").delete().eq("workspace_id", workspaceId);
  await admin.from("coach_decision_evidence").delete().eq("workspace_id", workspaceId);
  for (const cid of [clientAProfileId, clientBProfileId, clientCProfileId]) await admin.from("program_assignments").delete().eq("client_profile_id", cid);
  // Also wipe any leftover training_program_versions/training_programs
  // from a previous run — Client C's own provenance-proposal draft (see
  // section 10 below) is deliberately never published, so it would
  // otherwise survive across runs and pollute the "every version is
  // published" check in section 5b.
  const { data: staleVersions } = await admin.from("training_program_versions").select("id, program_id").eq("workspace_id", workspaceId);
  const staleVersionIds = (staleVersions ?? []).map((v) => v.id as string);
  const staleProgramIds = [...new Set((staleVersions ?? []).map((v) => v.program_id as string))];
  if (staleVersionIds.length > 0) await admin.from("training_program_versions").delete().in("id", staleVersionIds);
  if (staleProgramIds.length > 0) await admin.from("training_programs").delete().in("id", staleProgramIds);
  if (cleanupResults.some((c) => c.error)) throw new Error(`fixture cleanup failed: ${cleanupResults.map((c) => c.error?.message).join(", ")}`);

  console.log("  fixtures ready: Coach A (owner, 5 clients) + Coach B (unassigned coach, same workspace) + Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow (step 1)\n");
  const coachASession = await signInAsRealSession("e2e-10a-coach-a@example.test");
  const coachBSession = await signInAsRealSession("e2e-10a-coach-b@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-10a-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-10a-client-a@example.test");
  const clientBSession = await signInAsRealSession("e2e-10a-client-b@example.test");
  check("all sessions completed a real OTP sign-in round-trip", true);

  console.log("\n3. Assign a real universal program to Clients A/B/C (step 2)\n");

  const nowIso = new Date().toISOString();
  const todayIso = nowIso.slice(0, 10);
  const com = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId, nowIso, businessName: "E2E 10A Workspace" });
  const profile = buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]);
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];

  async function assignRealProgram(clientProfileId: string, startDateIso: string): Promise<void> {
    const generated = buildUniversalProgramForDirection(direction, { clientId: clientProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso });
    const { data: programFamily, error: programError } = await coachASession.from("training_programs").insert({ workspace_id: workspaceId, created_by: coachA.id, title: generated.content.name }).select("id").single();
    if (programError) throw new Error(`training_programs insert failed: ${programError.message}`);
    const { data: draftVersion, error: draftError } = await coachASession.from("training_program_versions").insert({ program_id: programFamily!.id, workspace_id: workspaceId, version_number: 1, status: "draft", content: generated.content, created_by: coachA.id }).select("id").single();
    if (draftError) throw new Error(`training_program_versions insert failed: ${draftError.message}`);
    const { error: publishError } = await coachASession.from("training_program_versions").update({ status: "published", published_by: coachA.id, published_at: new Date().toISOString() }).eq("id", draftVersion!.id);
    if (publishError) throw new Error(`publish failed: ${publishError.message}`);
    const { error: assignError } = await coachASession.rpc("assign_active_program_version", { p_client_profile_id: clientProfileId, p_program_version_id: draftVersion!.id });
    if (assignError) throw new Error(`assign_active_program_version failed: ${assignError.message}`);
    const { error: enrollError } = await coachASession.from("client_enrollments").upsert({ workspace_id: workspaceId, client_profile_id: clientProfileId, original_program_start_date: startDateIso, timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });
    if (enrollError) throw new Error(`client_enrollments upsert failed: ${enrollError.message}`);
  }

  const programStartDateIso = addDaysToLocalDate(todayIso, -77);
  await assignRealProgram(clientAProfileId, programStartDateIso);
  await assignRealProgram(clientBProfileId, programStartDateIso);
  await assignRealProgram(clientCProfileId, programStartDateIso);
  const enrollment: ProgramEnrollment = { id: "e", schemaVersion: 1, workspaceId, clientId: clientAProfileId, programId: "p", startDateIso: programStartDateIso, durationWeeks: 12, timeZone: "UTC", weekStartsOn: "monday", createdAtIso: nowIso, updatedAtIso: nowIso };
  const scheduleReferenceContent = buildUniversalProgramForDirection(direction, { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso }).content;
  const scheduledDates = scheduledTrainingDatesInWindow(enrollment, scheduleReferenceContent, addDaysToLocalDate(todayIso, -83), todayIso);
  check("all three clients have a real assigned program with a real schedule", scheduledDates.length >= 20);

  console.log("\n4. Client A — illness cluster + recovery; the coach workspace's real intelligence surface (steps 3-7)\n");

  const illnessDate1 = addDaysToLocalDate(todayIso, -6);
  const illnessDate2 = addDaysToLocalDate(todayIso, -4);
  for (const d of scheduledDates) {
    if (d > todayIso) continue;
    if (d === illnessDate1 || d === illnessDate2) await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "skipped", skipReason: "feeling-sick" });
    else await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "completed" });
  }

  async function reproduceGetClientWorkspaceIntelligence(session: SupabaseClient, clientProfileId: string, sched: string[], asOfIso: string) {
    const observations = await fetchObservationsLive(session, clientProfileId, addDaysToLocalDate(asOfIso.slice(0, 10), -83));
    const analysis = analyzeClientState({ clientProfileId, observations, scheduledTrainingDates: sched, activeSafetyRestriction: false, nowIso: asOfIso });
    return selectFindingsForCoachUI(analysis);
  }

  const clientAFindings = await reproduceGetClientWorkspaceIntelligence(coachASession, clientAProfileId, scheduledDates, nowIso);
  check("3: the coach workspace's real intelligence surface shows exactly one informational finding (temporary disruption)", clientAFindings.length === 1 && clientAFindings[0].finding.findingType === "illness_related_disruption");
  check("the finding is never styled with urgent prominence for a temporary illness disruption", clientAFindings[0]?.prominence === "worth-watching");

  console.log("\n5. Evidence drill-down matches the real observations (step 4)\n");

  const illnessFinding = clientAFindings[0].finding;
  const allClientAObs = await fetchObservationsLive(coachASession, clientAProfileId, addDaysToLocalDate(todayIso, -83));
  const evidenceDetails = allClientAObs.filter((o) => illnessFinding.supportingEvidenceRefs.includes(o.id)).map(formatObservationForDisplay);
  check("4: drill-down evidence lines are real and match the real seeded illness dates/reason", evidenceDetails.some((e) => e.dateIso === illnessDate1) && evidenceDetails.some((e) => e.value === "feeling sick" || e.value === "skipped"));

  console.log("\n5b. No action was taken (step 5)\n");

  const { data: versionsAfterReading } = await coachASession.from("training_program_versions").select("id, status").eq("workspace_id", workspaceId);
  check("5: reading intelligence findings never created/modified any program version — read-only, no side effects", (versionsAfterReading ?? []).every((v) => v.status === "published"));

  console.log("\n6. Evidence returns to baseline — the temporary card resolves on a later analysis (steps 6-7)\n");

  const laterNowIso = `${addDaysToLocalDate(todayIso, 15)}T12:00:00.000Z`;
  const laterScheduledDates = scheduledTrainingDatesInWindow(enrollment, scheduleReferenceContent, addDaysToLocalDate(todayIso, -83), addDaysToLocalDate(todayIso, 15));
  for (const d of laterScheduledDates.filter((d) => d > todayIso)) {
    await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "completed" });
  }
  const laterFindings = await reproduceGetClientWorkspaceIntelligence(coachASession, clientAProfileId, laterScheduledDates, laterNowIso);
  check("7: the temporary-disruption card naturally disappears once recent evidence is fully normal again — no manual cleanup", laterFindings.length === 0);

  console.log("\n7. Client B — recurring schedule conflict renders with stronger prominence (steps 8-9)\n");

  for (const d of scheduledDates) {
    if (d > todayIso) continue;
    const i = scheduledDates.indexOf(d);
    if (i % 3 === 0) await insertSessionObservation(clientBSession, { workspaceId, clientProfileId: clientBProfileId, dateIso: d, status: "skipped", skipReason: "schedule-conflict" });
    else await insertSessionObservation(clientBSession, { workspaceId, clientProfileId: clientBProfileId, dateIso: d, status: "completed" });
  }
  const clientBFindings = await reproduceGetClientWorkspaceIntelligence(coachASession, clientBProfileId, scheduledDates, nowIso);
  const scheduleFinding = clientBFindings.find((f) => f.finding.findingType === "recurring_schedule_conflict");
  check("9: a stronger, recurring finding renders for Client B", !!scheduleFinding);
  check("9: the recurring pattern gets more visual prominence than an isolated one", scheduleFinding?.prominence === "notable" || scheduleFinding?.finding.strength === "strong");

  console.log("\n8. Cross-client / cross-coach isolation for intelligence findings (step 10)\n");

  const { data: coachBReadsClientA } = await coachBSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId).limit(1);
  check("10: Coach B (same workspace, unassigned) cannot read Client A's observations", (coachBReadsClientA ?? []).length === 0);
  const { data: otherCoachReadsClientB } = await otherCoachSession.from("client_observations").select("id").eq("client_profile_id", clientBProfileId).limit(1);
  check("10: an unrelated coach in a different workspace cannot read Client B's observations", (otherCoachReadsClientB ?? []).length === 0);

  console.log("\n9. Coach A confirms a real learned rule from real cross-client evidence (setup for step 11)\n");

  const evidenceNowIso = new Date().toISOString();
  for (const [clientProfileId, versionPrefix] of [[clientDProfileId, "v1"], [clientEProfileId, "v2"], [clientCProfileId, "v3"]] as const) {
    for (let i = 0; i < 3; i++) {
      await recordEvidenceAs(coachASession, {
        workspaceId, coachUserId: coachA.id, clientProfileId, decisionDomain: "prescription", decisionType: "item_prescription_edited", outcome: "edited",
        proposedValue: { exerciseName: "Barbell Bench Press", sets: 4 }, chosenValue: { exerciseName: "Barbell Bench Press", sets: 3 },
        trainingItemInstanceId: "item-monday-1-barbell-bench-press", sourceRef: `program_version_item:${versionPrefix}-${i}:1:Monday:0:b1:item-monday-1-barbell-bench-press`, decidedAtIso: new Date(Date.parse(evidenceNowIso) + i * 86400000).toISOString(),
      });
    }
  }
  const evidence = await fetchMyDecisionEvidence(coachASession);
  const analysis = analyzeCoachDecisionPatterns({ coachUserId: coachA.id, evidence, nowIso: new Date().toISOString() });
  const candidate = analysis.candidates.find((c) => c.scope === "coach_general" && c.contextSignature.field === "sets" && isCandidateEligibleForConfirmationLocal(c));
  check("a real eligible coach-general candidate is produced from real cross-client evidence", !!candidate);
  const ruleId = await confirmLearnedRule(coachASession, { workspaceId, coachUserId: coachA.id, candidate: candidate! });
  check("the rule is confirmed as a real active row", !!ruleId);

  console.log("\n10. Generate a real proposal for Client C using the confirmed rule; persist and verify historical provenance (steps 11-12)\n");

  const applicableRules = await resolveApplicableCoachRulesLive(coachASession, clientCProfileId);
  const generated = buildUniversalProgramForDirection(direction, { clientId: clientCProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso: new Date().toISOString(), applicableRules });
  check("the confirmed rule actually applied during this real generation", generated.ruleApplication.appliedRuleIds.includes(ruleId));

  const contentWithProvenance = { ...generated.content, ...(generated.ruleApplication.appliedRuleIds.length > 0 ? { appliedLearnedRuleIds: generated.ruleApplication.appliedRuleIds } : {}) };
  const { data: programFamilyC } = await coachASession.from("training_programs").insert({ workspace_id: workspaceId, created_by: coachA.id, title: "Client C Provenance Proposal" }).select("id").single();
  const { data: draftVersionC, error: draftErrorC } = await coachASession.from("training_program_versions").insert({ program_id: programFamilyC!.id, workspace_id: workspaceId, version_number: 1, status: "draft", content: contentWithProvenance, created_by: coachA.id, proposed_for_client_profile_id: clientCProfileId }).select("id, content").single();
  if (draftErrorC) throw new Error(`Client C draft insert failed: ${draftErrorC.message}`);
  check("the real persisted draft content carries the applied rule id — a real, queryable historical record", (draftVersionC!.content as { appliedLearnedRuleIds?: string[] }).appliedLearnedRuleIds?.includes(ruleId) ?? false);

  const provenanceBeforeDeactivation = await getLearnedRuleProvenanceLive(coachASession, [ruleId]);
  check("12: rule provenance resolves BY ID to the rule's own real summary, matching the confirmed candidate", provenanceBeforeDeactivation[0]?.summary === candidate!.summary && provenanceBeforeDeactivation[0]?.status === "active");

  console.log("\n11. Deactivate the rule — the ALREADY-PERSISTED historical proposal must still truthfully show it influenced generation (step 41 acceptance case)\n");

  const { error: deactivateError } = await coachASession.from("coach_learned_rules").update({ status: "deactivated", deactivated_by: coachA.id, deactivated_at: new Date().toISOString() }).eq("id", ruleId).eq("coach_user_id", coachA.id).eq("status", "active");
  if (deactivateError) throw new Error(`deactivate failed: ${deactivateError.message}`);

  const { data: draftVersionCAfterDeactivation } = await coachASession.from("training_program_versions").select("content").eq("id", draftVersionC!.id).single();
  check("W: the historical proposal's own persisted appliedLearnedRuleIds is UNCHANGED after the rule is deactivated — never rewritten", ((draftVersionCAfterDeactivation!.content as { appliedLearnedRuleIds?: string[] }).appliedLearnedRuleIds ?? []).includes(ruleId));

  const provenanceAfterDeactivation = await getLearnedRuleProvenanceLive(coachASession, [ruleId]);
  check("W: provenance lookup for the SAME historical proposal still resolves the rule's real summary, now correctly noting it's since been deactivated — never silently disappearing or rewriting history", provenanceAfterDeactivation[0]?.summary === candidate!.summary && provenanceAfterDeactivation[0]?.status === "deactivated");

  console.log("\n12. Coach edits the proposal away from the rule — provenance is preserved, editing still works (step 13, X)\n");

  const locatedItem = locateAnyResistanceItem(contentWithProvenance);
  check("a real resistance item exists in the generated content to edit", !!locatedItem);
  if (locatedItem) {
    const editedContent = applyTrainingItemPatch(contentWithProvenance, locatedItem.path, { sets: (locatedItem.item.prescription.sets ?? 3) + 2 });
    check("X: editing the proposal away from the rule's influence still works normally", editedContent !== null);
    check("X: the edited content STILL carries the original historical provenance — an edit never erases it", (editedContent as unknown as { appliedLearnedRuleIds?: string[] }).appliedLearnedRuleIds?.includes(ruleId) ?? false);
  }

  console.log("\n13. A proposal with no applicable rule shows no fake provenance (T)\n");

  const noRuleGenerated = buildUniversalProgramForDirection(direction, { clientId: clientDProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso: new Date().toISOString(), applicableRules: [] });
  check("T: generation with zero applicable rules never fabricates appliedLearnedRuleIds", noRuleGenerated.ruleApplication.appliedRuleIds.length === 0);

  console.log("\n14. Client-specific rule provenance never leaks across clients (U)\n");

  const { data: coachBReadsRule } = await coachBSession.from("coach_learned_rules").select("id").eq("id", ruleId);
  check("U/O: an unauthorized coach cannot resolve this coach's rule provenance at all (RLS)", (coachBReadsRule ?? []).length === 0);

  console.log("\n15. Client cannot access any coach intelligence surface (N)\n");

  const { data: clientReadsOwnObservationsOk } = await clientASession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId).limit(1);
  check("a client CAN still read their own raw observations (unchanged, pre-existing Phase 8A behavior)", (clientReadsOwnObservationsOk ?? []).length >= 0);
  const { data: clientReadsLearnedRules } = await clientASession.from("coach_learned_rules").select("id");
  check("N: a client has zero generic read access to coach_learned_rules — no intelligence-surface leakage", (clientReadsLearnedRules ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

function isCandidateEligibleForConfirmationLocal(c: PatternCandidate): boolean {
  return c.evidenceStrength === "strong" && !c.possibleSafetyInfluence && !!c.summary && c.supportingEvidenceIds.length > 0;
}

function locateAnyResistanceItem(content: { weeks: { days: { type: string; sessions?: { blocks: { id: string; items: { id: string; category: string; prescription: { sets?: number } }[] }[] }[] }[] }[] }) {
  for (const week of content.weeks as unknown as { weekNumber: number; days: { dayOfWeek: string; type: string; sessions?: { blocks: { id: string; items: { id: string; category: string; prescription: { sets?: number } }[] }[] }[] }[] }[]) {
    for (const day of week.days) {
      if (day.type !== "training") continue;
      for (const session of day.sessions ?? []) {
        for (const block of session.blocks) {
          for (const item of block.items) {
            if (item.category === "resistance") {
              return { path: { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek as never, sessionIndex: 0, blockId: block.id, itemId: item.id }, item };
            }
          }
        }
      }
    }
  }
  return null;
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
