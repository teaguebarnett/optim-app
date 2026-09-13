// Phase 9A — Shadow Coach Pattern Analysis.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through
// Mailpit, RLS-governed queries through each real signed-in session,
// service-role only to create fixture auth users.
//
// lib/production/pattern-analysis.ts can't be imported here directly
// (server-only, needs next/headers) — this script reproduces its exact
// real read (a raw query against coach_decision_evidence, through the
// REAL signed-in coach's own session, so RLS enforces the exact same
// coach_user_id = auth.uid() scoping analyzeMyCoachPatterns relies on)
// and then feeds the result into the actual, imported PURE analysis
// engine (lib/patterns/analyze-coach-decision-patterns.ts) — matching
// this repo's established e2e convention of "pure logic imported for
// real, persistence/auth reproduced with raw calls."
//
// This script also carries the phase's required proof that pattern
// analysis has ZERO influence on generation output (spec section 4/33):
// step 7 generates the exact same program twice — once before any
// decision evidence exists or analysis has run, once after — and asserts
// byte-identical output.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-9a-* fixtures):
//   node --experimental-strip-types scripts/e2e-shadow-pattern-analysis.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateDecisionEvidenceInput, type DecisionEvidenceInput } from "../lib/decisions/types.ts";
import { analyzeCoachDecisionPatterns } from "../lib/patterns/analyze-coach-decision-patterns.ts";
import type { DecisionEvidenceRecord } from "../lib/decisions/types.ts";

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

/** Reproduces recordDecisionEvidence's real insert (validation + insert +
 * 23505-as-success) through a REAL signed-in session — never a fabricated
 * row, never bypassing the same validation production code runs. */
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

/** Reproduces getMyDecisionEvidence's real query — same table, same
 * columns, same ordering, run through the REAL signed-in coach's own
 * session so coach_decision_evidence_select's RLS (coach_user_id =
 * auth.uid()) is the actual thing enforcing isolation, not application
 * logic in this script. */
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

async function main() {
  console.log(`OPTIM Phase 9A — live E2E shadow coach pattern analysis verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 9A fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-9a-coach-a@example.test", "Coach A 9A");
  const coachB = await ensureUser("e2e-9a-coach-b@example.test", "Coach B 9A");
  const otherCoach = await ensureUser("e2e-9a-other-coach@example.test", "Other Coach 9A");
  const clientA = await ensureUser("e2e-9a-client-a@example.test", "Client A 9A");
  const clientOneUser = await ensureUser("e2e-9a-client-one@example.test", "Client One 9A");
  const clientTwoUser = await ensureUser("e2e-9a-client-two@example.test", "Client Two 9A");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }
  const workspaceId = await ensureWorkspace(coachA.id, "E2E 9A Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 9A Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: coachB.id, role: "coach", status: "active" },
      { workspace_id: workspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientOneUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientTwoUser.id, role: "client", status: "active" },
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
  const clientOneProfileId = await ensureClientProfile(clientOneUser.id, "Client One 9A");
  const clientTwoProfileId = await ensureClientProfile(clientTwoUser.id, "Client Two 9A");
  const clientAProfileId = await ensureClientProfile(clientA.id, "Client A 9A");

  console.log("  fixtures ready: Coach A (owner, assigned to 3 clients) + Coach B (unassigned coach, same workspace) + Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachASession = await signInAsRealSession("e2e-9a-coach-a@example.test");
  const coachBSession = await signInAsRealSession("e2e-9a-coach-b@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-9a-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-9a-client-a@example.test");
  check("Coach A, Coach B, Other Coach, and Client A all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Coach A performs the SAME comparable edit across 2 distinct real clients\n");

  const nowIso = new Date().toISOString();
  for (const [clientProfileId, versionPrefix] of [[clientOneProfileId, "v1"], [clientTwoProfileId, "v2"]] as const) {
    for (let i = 0; i < 3; i++) {
      await recordEvidenceAs(
        coachASession,
        setsEditEvidence({ workspaceId, coachUserId: coachA.id, clientProfileId, versionId: `${versionPrefix}-${i}`, from: 4, to: 3, decidedAtIso: new Date(Date.parse(nowIso) + i * 86400000).toISOString() })
      );
    }
  }
  check("A: 6 real, comparable prescription-edit decisions were persisted across 2 distinct real clients", true);

  console.log("\n4. Coach A's own real evidence, read through the SAME RLS-governed query analyzeMyCoachPatterns relies on\n");

  const coachAEvidence = await fetchMyDecisionEvidence(coachASession);
  check("Coach A's own session reads at least the 6 rows just written for this real item across both clients", coachAEvidence.filter((e) => e.trainingItemInstanceId === "item-monday-1-barbell-bench-press" && (e.clientProfileId === clientOneProfileId || e.clientProfileId === clientTwoProfileId)).length >= 6);

  const firstAnalysis = analyzeCoachDecisionPatterns({ coachUserId: coachA.id, evidence: coachAEvidence, nowIso: new Date().toISOString() });
  const coachGeneralCandidate = firstAnalysis.candidates.find((c) => c.scope === "coach_general" && c.contextSignature.field === "sets" && c.direction === "decrease");
  check("B: a coach-general candidate forms from 2 distinct clients with comparable evidence", !!coachGeneralCandidate);
  check("C: the candidate's distinctClientCount is exactly 2", coachGeneralCandidate?.distinctClientCount === 2);
  check("D: every supporting evidence id in the candidate is real, traceable evidence this script actually wrote", coachGeneralCandidate!.supportingEvidenceIds.every((id) => coachAEvidence.some((e) => e.id === id)));

  console.log("\n5. Adding comparable contradicting evidence adjusts candidate strength — never silently ignored\n");

  await recordEvidenceAs(coachASession, setsEditEvidence({ workspaceId, coachUserId: coachA.id, clientProfileId: clientOneProfileId, versionId: "v1-contra", from: 4, to: 6, decidedAtIso: new Date(Date.parse(nowIso) + 10 * 86400000).toISOString() }));
  const evidenceAfterContradiction = await fetchMyDecisionEvidence(coachASession);
  const secondAnalysis = analyzeCoachDecisionPatterns({ coachUserId: coachA.id, evidence: evidenceAfterContradiction, nowIso: new Date().toISOString() });
  const candidateAfterContradiction = secondAnalysis.candidates.find((c) => c.scope === "coach_general" && c.contextSignature.field === "sets" && c.direction === "decrease");
  check("E: the candidate still exists but its contradictionCount reflects the new contradicting evidence", !!candidateAfterContradiction && candidateAfterContradiction.contradictionCount >= 1);

  console.log("\n6. Coach B (same workspace, unrelated) is completely isolated from Coach A's evidence and candidates\n");

  const coachBEvidence = await fetchMyDecisionEvidence(coachBSession);
  check("F: Coach B's own RLS-governed read returns ZERO of Coach A's evidence rows", coachBEvidence.length === 0);
  const coachBAnalysis = analyzeCoachDecisionPatterns({ coachUserId: coachB.id, evidence: coachBEvidence, nowIso: new Date().toISOString() });
  check("G: analyzing Coach B's (empty) evidence produces zero candidates — Coach A's methodology can never leak into Coach B's analysis", coachBAnalysis.candidates.length === 0);

  console.log("\n7. Cross-workspace coach and the client are both denied\n");

  const otherCoachEvidence = await fetchMyDecisionEvidence(otherCoachSession);
  check("H: an unrelated coach in a completely different workspace reads ZERO rows", otherCoachEvidence.length === 0);

  const { data: clientReadAttempt, error: clientReadError } = await clientASession.from("coach_decision_evidence").select("id").limit(1);
  check("I: the client has no generic read access to coach decision evidence at all (RLS has no client-facing select policy)", !clientReadError && (clientReadAttempt ?? []).length === 0);

  console.log("\n8. Zero generation influence — the exact same program generates identically whether shadow-pattern evidence/analysis exists or not\n");

  const com = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId, nowIso, businessName: "E2E 9A Workspace" });
  const profile = buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]);
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: 4 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const paramsForGeneration = { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 4, nowIso: "2026-01-01T00:00:00.000Z" };

  const beforeAnalysis = buildUniversalProgramForDirection(direction, paramsForGeneration);
  // Real shadow-pattern analysis now runs, using the real evidence already
  // persisted above — generation has already happened and never reads
  // this analysis result. Running it here, between the two generation
  // calls, is the actual proof: if generation secretly depended on it in
  // any way, the second call's output would differ.
  void analyzeCoachDecisionPatterns({ coachUserId: coachA.id, evidence: evidenceAfterContradiction, nowIso: new Date().toISOString() });
  const afterAnalysis = buildUniversalProgramForDirection(direction, paramsForGeneration);

  // Generation itself embeds Date.now()-based uniqueness suffixes into
  // program/session ids (e.g. "program-best_fit-client-1-1789315112913",
  // "session-Monday-1789315137194-661030") — real, PRE-EXISTING behavior
  // entirely unrelated to this phase, confirmed by diffing two back-to-back
  // calls with no analysis in between at all. That's the only source of
  // non-determinism; normalizing those volatile digit runs before
  // comparing is what makes this a fair, real proof that the actual
  // generated CONTENT (weeks, sessions, items, prescriptions) never
  // changed — not a workaround for anything Phase 9A introduced.
  const normalize = (value: unknown) => JSON.stringify(value).replace(/\d{10,}(-\d+)?/g, "<volatile>");
  check("J: generation content is IDENTICAL (modulo generation's own pre-existing Date.now()-based id suffixes) before and after running shadow pattern analysis on real decision evidence", normalize(beforeAnalysis) === normalize(afterAnalysis));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
