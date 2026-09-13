// Phase 8B — Longitudinal Client Intelligence: coach decision evidence
// foundation.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through
// Mailpit, RLS-governed queries through each real signed-in session,
// service-role only to create fixture auth users.
//
// app/actions/production-programs.ts / lib/production/decision-evidence.ts /
// pain-safety.ts can't be imported here directly (server-only, need
// next/headers) — this script reproduces their exact real generation +
// projection + insert calls one at a time (using the actual, imported pure
// projectors from lib/decisions/), matching this repo's established e2e
// convention.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-8b-* fixtures):
//   node --experimental-strip-types scripts/e2e-decision-evidence.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { extractClientProgrammingProfile } from "../lib/coach/programming-profile.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { projectProgramApprovalDecision } from "../lib/decisions/project-program-generation.ts";
import { projectHealthReviewDecision } from "../lib/decisions/project-health-review-decision.ts";
import { validateDecisionEvidenceInput, type DecisionEvidenceInput } from "../lib/decisions/types.ts";

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

/** Reproduces lib/production/decision-evidence.ts's recordDecisionEvidence
 * exactly: validate, then insert, treating a real 23505 (unique_violation)
 * as success rather than an error. */
async function recordDecisionEvidenceAs(client: SupabaseClient, input: DecisionEvidenceInput): Promise<{ inserted: boolean }> {
  const validated = validateDecisionEvidenceInput(input);
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
  const { error } = await client.from("coach_decision_evidence").insert(row);
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordDecisionEvidenceAs failed: ${error.message}`);
  return { inserted: !error };
}

async function main() {
  console.log(`OPTIM Phase 8B — live E2E decision-evidence verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 8B fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-8b-coach-a@example.test", "Coach A 8B");
  const coachB = await ensureUser("e2e-8b-coach-b@example.test", "Coach B 8B");
  const otherCoach = await ensureUser("e2e-8b-other-coach@example.test", "Other Coach 8B");
  const clientA = await ensureUser("e2e-8b-client-a@example.test", "Client A 8B");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const workspaceId = await ensureWorkspace(coachA.id, "E2E 8B Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 8B Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      // Coach B is a real second coach in the SAME workspace — proves
      // isolation is coach-scoped, not merely a side effect of different
      // workspaces (spec section 12).
      { workspace_id: workspaceId, user_id: coachB.id, role: "coach", status: "active" },
      { workspace_id: workspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: otherWorkspaceId, user_id: otherCoach.id, role: "workspace_owner", status: "active" },
    ],
    { onConflict: "workspace_id,user_id" }
  );

  async function ensureClientProfile(workspaceIdForProfile: string, coachUserId: string, userId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceIdForProfile).eq("user_id", userId).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("client_profiles").insert({ workspace_id: workspaceIdForProfile, user_id: userId, display_name: displayName }).select("id").single();
    if (error) throw new Error(`client_profiles insert failed: ${error.message}`);
    await admin.from("coach_client_assignments").insert({ workspace_id: workspaceIdForProfile, coach_user_id: coachUserId, client_profile_id: data!.id, is_primary: true });
    return data!.id as string;
  }

  const clientAProfileId = await ensureClientProfile(workspaceId, coachA.id, clientA.id, "Client A 8B");

  console.log("  fixtures ready: Coach A (owner) + Coach B (coach) + Client A (Workspace 8B), Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachASession = await signInAsRealSession("e2e-8b-coach-a@example.test");
  const coachBSession = await signInAsRealSession("e2e-8b-coach-b@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-8b-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-8b-client-a@example.test");
  check("Coach A, Coach B, Other Coach, and Client A all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Coach A generates a real universal program for Client A (the only real program decision point today)\n");

  const nowIso = new Date().toISOString();
  const com = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId, nowIso, businessName: "E2E 8B Workspace" });
  const profileResult = extractClientProgrammingProfile(null, null);
  const profile = "profile" in profileResult ? profileResult.profile : buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]);
  const durationWeeks = 8;
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks, nowIso });

  const { data: programRow, error: programError } = await coachASession.from("training_programs").insert({ workspace_id: workspaceId, created_by: coachA.id, title: "E2E 8B Program" }).select("id").single();
  check("coach (real session): can create a training_programs row", !programError && !!programRow, programError?.message);
  const { data: versionRow, error: versionError } = await coachASession
    .from("training_program_versions")
    .insert({ workspace_id: workspaceId, program_id: programRow!.id, version_number: 1, status: "draft", content: { ...content, name: "E2E 8B Program" }, created_by: coachA.id })
    .select("id")
    .single();
  check("coach (real session): can persist the real generated schemaVersion-2 content as a draft", !versionError && !!versionRow, versionError?.message);
  const { error: publishError } = await coachASession.from("training_program_versions").update({ status: "published", published_by: coachA.id, published_at: nowIso }).eq("id", versionRow!.id);
  check("coach: can publish the draft version", !publishError, publishError?.message);
  const { data: assignmentId, error: assignError } = await coachASession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: versionRow!.id });
  check("coach: can assign the published version to Client A through the real publish/assign lifecycle", !assignError && !!assignmentId, assignError?.message);

  console.log("\n4. Coach A's real program-generation decision evidence is recorded exactly once\n");

  const proposalSummary = { durationWeeks, directionLabel: direction.label, rationale: content.generationRationale ?? "No rationale recorded." };
  const generationDecision = projectProgramApprovalDecision({
    workspaceId,
    coachUserId: coachA.id,
    clientProfileId: clientAProfileId,
    originalVersionId: versionRow!.id as string,
    programAssignmentId: assignmentId as string,
    proposedSummary: proposalSummary,
    chosenSummary: proposalSummary,
    wasEdited: false,
    decidedAtIso: nowIso,
  });
  const firstInsert = await recordDecisionEvidenceAs(coachASession, generationDecision);
  check("B: a real, unchanged program-generation approval is recorded as decision evidence", firstInsert.inserted);

  // Scoped to THIS run's real, distinct source_ref, not "all program_generated
  // evidence ever recorded for this client" — this script is safe to run
  // repeatedly, and each real run legitimately creates a NEW program
  // version/assignment (no dedup at the canonical generation layer), so an
  // unscoped count would grow across repeated runs even though nothing is
  // actually duplicated.
  const { data: evidenceRows } = await coachASession.from("coach_decision_evidence").select("id, outcome, proposed_value, chosen_value, program_assignment_id").eq("source_ref", generationDecision.sourceRef).eq("decision_type", "program_generated");
  check("B: the recorded evidence shows outcome='approved' with proposed/chosen values identical, matching the real current production shape (no edit UI exists)", evidenceRows?.[0]?.outcome === "approved" && JSON.stringify(evidenceRows?.[0]?.proposed_value) === JSON.stringify(evidenceRows?.[0]?.chosen_value));
  check("K: the evidence references the real program_assignment_id", evidenceRows?.[0]?.program_assignment_id === assignmentId);

  console.log("\n5. Idempotent retry — reprocessing the exact same generation decision never duplicates\n");

  const secondInsert = await recordDecisionEvidenceAs(coachASession, generationDecision);
  check("N: a retried insert for the exact same decision is silently absorbed (unique_violation caught, not surfaced)", !secondInsert.inserted);
  const { data: evidenceAfterRetry } = await coachASession.from("coach_decision_evidence").select("id").eq("source_ref", generationDecision.sourceRef).eq("decision_type", "program_generated");
  check("N: exactly one row exists after the retry — no duplicate evidence", (evidenceAfterRetry ?? []).length === 1);

  console.log("\n6. Safety decision evidence references the canonical escalation, never duplicates it (U)\n");

  const { data: escalationId, error: escalationRpcError } = await clientASession.rpc("create_health_safety_escalation", {
    p_client_profile_id: clientAProfileId,
    p_summary: "Pain reported: right shoulder, 6/10, during Overhead Press. OPTIM paused this exercise for the client.",
    p_dedupe_existing: false,
  });
  check("the real create_health_safety_escalation RPC succeeds", !escalationRpcError && !!escalationId, escalationRpcError?.message);

  const firstDecisionAtIso = new Date().toISOString();
  const { error: decisionUpdateError } = await coachASession
    .from("escalations")
    .update({ health_review_status: "proceed_with_limitations", documented_limitations: "No loaded overhead pressing.", health_review_decided_by: coachA.id, health_review_decided_at: firstDecisionAtIso, updated_at: firstDecisionAtIso })
    .eq("id", escalationId)
    .eq("workspace_id", workspaceId)
    .eq("reason_category", "pain_or_safety");
  check("coach A (real session): can record the real canonical health-review decision", !decisionUpdateError, decisionUpdateError?.message);

  const firstSafetyEvidence = projectHealthReviewDecision({ workspaceId, coachUserId: coachA.id, clientProfileId: clientAProfileId, escalationId: escalationId as string, status: "proceed_with_limitations", documentedLimitations: "No loaded overhead pressing.", decidedAtIso: firstDecisionAtIso });
  await recordDecisionEvidenceAs(coachASession, firstSafetyEvidence);
  const { data: safetyEvidenceRows } = await coachASession.from("coach_decision_evidence").select("decision_domain, outcome, escalation_id, proposed_value, chosen_value").eq("escalation_id", escalationId);
  check("U: the safety decision evidence is categorized as domain='safety' with outcome='selected'", safetyEvidenceRows?.[0]?.decision_domain === "safety" && safetyEvidenceRows?.[0]?.outcome === "selected");
  check("U: no proposedValue exists — OPTIM never proposed a health-review outcome", safetyEvidenceRows?.[0]?.proposed_value === null);
  check("U: the evidence references the real escalation id rather than duplicating its content", safetyEvidenceRows?.[0]?.escalation_id === escalationId);
  const { data: canonicalEscalationStillAuthoritative } = await coachASession.from("escalations").select("health_review_status, documented_limitations").eq("id", escalationId).single();
  check("U: the canonical escalation row remains the sole authoritative safety record, completely unaffected by the evidence write", canonicalEscalationStillAuthoritative?.health_review_status === "proceed_with_limitations");

  console.log("\n7. A later, different safety decision on the SAME escalation is NEW evidence — the earlier row is never overwritten (O)\n");

  const secondDecisionAtIso = new Date(Date.now() + 2000).toISOString();
  await coachASession.from("escalations").update({ health_review_status: "reviewed_by_coach", documented_limitations: null, health_review_decided_by: coachA.id, health_review_decided_at: secondDecisionAtIso, updated_at: secondDecisionAtIso }).eq("id", escalationId);
  const secondSafetyEvidence = projectHealthReviewDecision({ workspaceId, coachUserId: coachA.id, clientProfileId: clientAProfileId, escalationId: escalationId as string, status: "reviewed_by_coach", decidedAtIso: secondDecisionAtIso });
  const secondSafetyInsert = await recordDecisionEvidenceAs(coachASession, secondSafetyEvidence);
  check("O: the second, later decision is inserted as a genuinely NEW row (distinct source_ref)", secondSafetyInsert.inserted);
  const { data: allSafetyEvidenceForEscalation } = await coachASession.from("coach_decision_evidence").select("id, outcome, chosen_value, decided_at").eq("escalation_id", escalationId).order("decided_at", { ascending: true });
  check("O: BOTH the earlier and later decisions exist as separate rows — the earlier one was never overwritten", (allSafetyEvidenceForEscalation ?? []).length === 2);
  check("O: the earlier row still shows its own original chosen_value, untouched by the later decision", JSON.stringify(allSafetyEvidenceForEscalation?.[0]?.chosen_value).includes("proceed_with_limitations"));
  check("O: the later row shows the new decision", JSON.stringify(allSafetyEvidenceForEscalation?.[1]?.chosen_value).includes("reviewed_by_coach"));

  console.log("\n8. Authorization — correct coach, same-workspace unrelated coach denial, cross-workspace denial, client denial, forged write denial\n");

  const { data: coachAReadsOwn } = await coachASession.from("coach_decision_evidence").select("id").eq("client_profile_id", clientAProfileId);
  check("I: Coach A can read their own real decision evidence", (coachAReadsOwn ?? []).length > 0);

  const { data: coachBReadsCoachA } = await coachBSession.from("coach_decision_evidence").select("id").eq("client_profile_id", clientAProfileId);
  check("P: Coach B, a DIFFERENT coach in the SAME workspace, sees ZERO of Coach A's decision evidence — workspace membership alone grants nothing", (coachBReadsCoachA ?? []).length === 0);

  const { data: otherCoachReads } = await otherCoachSession.from("coach_decision_evidence").select("id").eq("client_profile_id", clientAProfileId);
  check("Q: an unrelated coach in a completely different workspace sees ZERO rows", (otherCoachReads ?? []).length === 0);

  const { data: clientAReadsEvidence } = await clientASession.from("coach_decision_evidence").select("id").eq("client_profile_id", clientAProfileId);
  check("R: Client A (the client this evidence is ABOUT) has no generic read access to internal coach decision evidence at all", (clientAReadsEvidence ?? []).length === 0);

  const { error: forgedWriteError } = await coachBSession
    .from("coach_decision_evidence")
    .insert({ workspace_id: workspaceId, coach_user_id: coachA.id, client_profile_id: clientAProfileId, decision_domain: "safety", decision_type: "health_review_decision", outcome: "selected", chosen_value: { status: "reviewed_by_coach" }, source_ref: "forged:1", decided_at: new Date().toISOString() });
  check("S: Coach B cannot forge a decision claiming to be Coach A's (coach_user_id must equal the real caller) — rejected by RLS", !!forgedWriteError);

  const { error: crossWorkspaceForgeError } = await otherCoachSession
    .from("coach_decision_evidence")
    .insert({ workspace_id: workspaceId, coach_user_id: otherCoach.id, client_profile_id: clientAProfileId, decision_domain: "safety", decision_type: "health_review_decision", outcome: "selected", chosen_value: { status: "reviewed_by_coach" }, source_ref: "forged:2", decided_at: new Date().toISOString() });
  check("S: an unrelated coach cannot write into a workspace they hold no real staff role in — rejected by RLS is_workspace_staff check", !!crossWorkspaceForgeError);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
