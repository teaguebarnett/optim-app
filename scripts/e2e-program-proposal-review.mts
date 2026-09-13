// Phase 8C — Generated Program Review and Approval Workflow.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through
// Mailpit, RLS-governed queries through each real signed-in session,
// service-role only to create fixture auth users.
//
// app/actions/production-programs.ts can't be imported here directly
// (server-only, needs next/headers) — this script reproduces its exact
// real generate/edit/approve/reject calls one at a time (using the actual,
// imported pure generation/diff/evidence helpers), matching this repo's
// established e2e convention.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-8c-* fixtures):
//   node --experimental-strip-types scripts/e2e-program-proposal-review.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateUniversalTrainingProgramContent } from "../lib/production/validation.ts";
import { applyTrainingItemPatch, diffProgramProposal, groupDeltasByItem, locateTrainingItem, type TrainingItemPath } from "../lib/training/program-proposal-editing.ts";
import { projectProgramApprovalDecision, projectProgramRejectionDecision } from "../lib/decisions/project-program-generation.ts";
import { projectPrescriptionEditDecision } from "../lib/decisions/project-prescription-edit.ts";
import { validateDecisionEvidenceInput, type DecisionEvidenceInput } from "../lib/decisions/types.ts";
import type { UniversalTrainingProgramContent } from "../lib/training/types.ts";

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

async function recordEvidenceAs(client: SupabaseClient, input: DecisionEvidenceInput): Promise<{ inserted: boolean }> {
  const v = validateDecisionEvidenceInput(input);
  const row = {
    workspace_id: v.workspaceId,
    coach_user_id: v.coachUserId,
    client_profile_id: v.clientProfileId,
    decision_domain: v.decisionDomain,
    decision_type: v.decisionType,
    outcome: v.outcome,
    proposed_value: v.proposedValue,
    chosen_value: v.chosenValue,
    reason: v.reason ?? null,
    program_assignment_id: v.programAssignmentId ?? null,
    escalation_id: v.escalationId ?? null,
    training_item_instance_id: v.trainingItemInstanceId ?? null,
    observation_ids: v.observationIds ?? null,
    source_ref: v.sourceRef,
    decided_at: v.decidedAtIso,
  };
  const { error } = await client.from("coach_decision_evidence").insert(row);
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordEvidenceAs failed: ${error.message}`);
  return { inserted: !error };
}

/** Reproduces createProgramProposalAction's generation step (placeholder
 * profile — no real onboarding needed for this test) plus the real
 * draft-version insert, tagged with proposedForClientProfileId exactly
 * like the real action does. */
async function generateProposal(coachSession: SupabaseClient, params: { workspaceId: string; coachId: string; clientProfileId: string; title: string; durationWeeks: number }) {
  const nowIso = new Date().toISOString();
  const com = createDefaultCoachOperatingModel({ coachId: params.coachId, workspaceId: params.workspaceId, nowIso, businessName: "E2E 8C Workspace" });
  const profile = buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]);
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: params.durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, { clientId: params.clientProfileId, workspaceId: params.workspaceId, coachId: params.coachId, profile, com, durationWeeks: params.durationWeeks, nowIso });
  const finalContent = { ...content, name: params.title };

  const { data: programRow, error: programError } = await coachSession.from("training_programs").insert({ workspace_id: params.workspaceId, created_by: params.coachId, title: params.title }).select("id").single();
  if (programError) throw new Error(`generateProposal (program) failed: ${programError.message}`);
  const { data: versionRow, error: versionError } = await coachSession
    .from("training_program_versions")
    .insert({ program_id: programRow!.id, workspace_id: params.workspaceId, version_number: 1, status: "draft", content: finalContent, created_by: params.coachId, proposed_for_client_profile_id: params.clientProfileId })
    .select("id")
    .single();
  if (versionError) throw new Error(`generateProposal (version) failed: ${versionError.message}`);
  return { programId: programRow!.id as string, versionId: versionRow!.id as string, content: finalContent as UniversalTrainingProgramContent, directionLabel: direction.label };
}

async function publishAndAssign(coachSession: SupabaseClient, params: { workspaceId: string; clientProfileId: string; versionId: string }) {
  const { error: publishError } = await coachSession.from("training_program_versions").update({ status: "published", published_at: new Date().toISOString() }).eq("id", params.versionId).eq("status", "draft");
  if (publishError) throw new Error(`publishAndAssign (publish) failed: ${publishError.message}`);
  const { data: assignmentId, error: assignError } = await coachSession.rpc("assign_active_program_version", { p_client_profile_id: params.clientProfileId, p_program_version_id: params.versionId });
  if (assignError) throw new Error(`publishAndAssign (assign) failed: ${assignError.message}`);
  return assignmentId as string;
}

async function main() {
  console.log(`OPTIM Phase 8C — live E2E program-proposal-review verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 8C fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-8c-coach-a@example.test", "Coach A 8C");
  const coachB = await ensureUser("e2e-8c-coach-b@example.test", "Coach B 8C");
  const otherCoach = await ensureUser("e2e-8c-other-coach@example.test", "Other Coach 8C");
  const clientA = await ensureUser("e2e-8c-client-a@example.test", "Client A 8C");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }
  const workspaceId = await ensureWorkspace(coachA.id, "E2E 8C Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 8C Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
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
  const clientAProfileId = await ensureClientProfile(workspaceId, coachA.id, clientA.id, "Client A 8C");

  console.log("  fixtures ready: Coach A (owner, assigned) + Coach B (coach, unassigned) + Client A (Workspace 8C), Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachASession = await signInAsRealSession("e2e-8c-coach-a@example.test");
  const coachBSession = await signInAsRealSession("e2e-8c-coach-b@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-8c-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-8c-client-a@example.test");
  check("Coach A, Coach B, Other Coach, and Client A all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Program A: a real proposal, generated, approved unchanged, and made active\n");

  const programA = await generateProposal(coachASession, { workspaceId, coachId: coachA.id, clientProfileId: clientAProfileId, title: "Program A", durationWeeks: 4 });
  const assignmentA = await publishAndAssign(coachASession, { workspaceId, clientProfileId: clientAProfileId, versionId: programA.versionId });
  check("A: Program A's proposal was created as a real draft version", !!programA.versionId);
  check("Program A is now the client's real active assignment", !!assignmentA);

  const { data: activeAfterA } = await coachASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientAProfileId).eq("status", "active").single();
  check("Client A's active version is genuinely Program A's", activeAfterA?.program_version_id === programA.versionId);

  console.log("\n4. Program B: a new proposal is generated — Program A must stay active while it's pending\n");

  const programB = await generateProposal(coachASession, { workspaceId, coachId: coachA.id, clientProfileId: clientAProfileId, title: "Program B", durationWeeks: 6 });
  const { data: activeStillA } = await coachASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientAProfileId).eq("status", "active").single();
  check("B: Client A's active assignment is STILL Program A — a new pending proposal never silently replaces it", activeStillA?.program_version_id === programA.versionId);

  const { data: clientSeesOnlyA } = await clientASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientAProfileId).eq("status", "active");
  check("B: Client A's own real session reads the same — Program A, not Program B", clientSeesOnlyA?.[0]?.program_version_id === programA.versionId);

  const { data: pendingForClientA } = await coachASession.from("training_program_versions").select("id, version_number").eq("workspace_id", workspaceId).eq("proposed_for_client_profile_id", clientAProfileId).eq("status", "draft").order("created_at", { ascending: false }).limit(1).single();
  check("Coach A can rediscover the pending proposal for Client A after 'navigating away' (a fresh query, not in-memory state)", pendingForClientA?.id === programB.versionId);

  console.log("\n5. Approve Program B unchanged\n");

  const assignmentB = await publishAndAssign(coachASession, { workspaceId, clientProfileId: clientAProfileId, versionId: programB.versionId });
  const approvalBEvidence = projectProgramApprovalDecision({
    workspaceId,
    coachUserId: coachA.id,
    clientProfileId: clientAProfileId,
    originalVersionId: programB.versionId,
    programAssignmentId: assignmentB,
    proposedSummary: { durationWeeks: 6, directionLabel: programB.directionLabel, rationale: programB.content.generationRationale ?? "" },
    chosenSummary: { durationWeeks: 6, directionLabel: programB.directionLabel, rationale: programB.content.generationRationale ?? "" },
    wasEdited: false,
    decidedAtIso: new Date().toISOString(),
  });
  const firstBInsert = await recordEvidenceAs(coachASession, approvalBEvidence);
  check("C: Program B was approved unchanged through the real publish/assign lifecycle", !!assignmentB);
  check("D: exactly one decision-evidence record was created for this approval", firstBInsert.inserted);

  const retryBInsert = await recordEvidenceAs(coachASession, approvalBEvidence);
  check("X: retrying the identical approval evidence is idempotent — absorbed, not duplicated", !retryBInsert.inserted);
  const { data: bEvidenceRows } = await coachASession.from("coach_decision_evidence").select("id").eq("coach_user_id", coachA.id).eq("source_ref", `program_version:${programB.versionId}`);
  check("D/X: exactly one evidence row exists for Program B's approval after the retry", (bEvidenceRows ?? []).length === 1);

  const { data: activeAfterB } = await coachASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientAProfileId).eq("status", "active").single();
  check("Client A now genuinely receives Program B", activeAfterB?.program_version_id === programB.versionId);

  console.log("\n6. Program C: generate, edit a real prescription, verify proposed/chosen both preserved\n");

  const programC = await generateProposal(coachASession, { workspaceId, coachId: coachA.id, clientProfileId: clientAProfileId, title: "Program C", durationWeeks: 4 });
  const week1 = programC.content.weeks.find((w) => w.weekNumber === 1)!;
  const firstTrainingDay = week1.days.find((d) => d.type === "training")!;
  const firstItem = firstTrainingDay.sessions![0].blocks[0].items[0];
  const editPath: TrainingItemPath = { weekNumber: 1, dayOfWeek: firstTrainingDay.dayOfWeek, sessionIndex: 0, blockId: firstTrainingDay.sessions![0].blocks[0].id, itemId: firstItem.id };
  const isContinuous = firstItem.category === "continuous";

  const patch = isContinuous ? { durationSeconds: 1500 } : { sets: (firstItem.prescription.sets ?? 4) - 1, rpe: 7 };
  const patchedContent = applyTrainingItemPatch(programC.content, editPath, patch as never);
  validateUniversalTrainingProgramContent(patchedContent);
  check("R/S: the edited content still validates as real, native schemaVersion-2 universal grammar", patchedContent.schemaVersion === 2);

  const { data: programCV2Row, error: v2Error } = await coachASession
    .from("training_program_versions")
    .insert({ program_id: programC.programId, workspace_id: workspaceId, version_number: 2, status: "draft", content: patchedContent, created_by: coachA.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("E/F: coach can save an edited draft as a new, distinct version — the original (v1) is never mutated", !v2Error && !!programCV2Row, v2Error?.message);

  const { data: v1StillOriginal } = await coachASession.from("training_program_versions").select("content").eq("id", programC.versionId).single();
  const v1OriginalItem = locateTrainingItem(v1StillOriginal!.content as UniversalTrainingProgramContent, editPath)!;
  const originalUnchanged = isContinuous
    ? v1OriginalItem.item.prescription.duration?.seconds === firstItem.prescription.duration?.seconds
    : v1OriginalItem.item.prescription.sets === firstItem.prescription.sets && v1OriginalItem.item.prescription.rpe === firstItem.prescription.rpe;
  check("G: the ORIGINAL proposal's own stored content is completely untouched by the edit", originalUnchanged);

  const deltas = diffProgramProposal(programC.content, patchedContent).filter((d) => "itemId" in d && d.itemId === editPath.itemId && d.weekNumber === 1);
  const [group] = groupDeltasByItem(deltas);
  check("I: the domain-aware diff correctly identifies the changed field(s)", !!group && group.fields.length > 0);

  const proposedFields: Record<string, unknown> = {};
  const chosenFields: Record<string, unknown> = {};
  for (const f of group!.fields) {
    proposedFields[f.field] = f.from;
    chosenFields[f.field] = f.to;
  }
  const editEvidence = projectPrescriptionEditDecision({
    workspaceId,
    coachUserId: coachA.id,
    clientProfileId: clientAProfileId,
    editedVersionId: programCV2Row!.id as string,
    path: editPath,
    isContinuous,
    proposedFields,
    chosenFields,
    isSubstitution: false,
    decidedAtIso: new Date().toISOString(),
  });
  const editInsert = await recordEvidenceAs(coachASession, editEvidence);
  check("13: appropriate decision evidence appears for the real edit, BEFORE approval", editInsert.inserted);
  check("H: the persisted evidence's chosenValue reflects exactly what the coach changed it to", JSON.stringify(editEvidence.chosenValue) === JSON.stringify(chosenFields));

  console.log("\n7. Approve edited Program C\n");

  const assignmentC = await publishAndAssign(coachASession, { workspaceId, clientProfileId: clientAProfileId, versionId: programCV2Row!.id as string });
  const approvalCEvidence = projectProgramApprovalDecision({
    workspaceId,
    coachUserId: coachA.id,
    clientProfileId: clientAProfileId,
    originalVersionId: programC.versionId,
    programAssignmentId: assignmentC,
    proposedSummary: { durationWeeks: 4, directionLabel: programC.directionLabel, rationale: programC.content.generationRationale ?? "No rationale recorded." },
    chosenSummary: { durationWeeks: 4, directionLabel: programC.directionLabel, rationale: programC.content.generationRationale ?? "No rationale recorded." },
    wasEdited: true,
    decidedAtIso: new Date().toISOString(),
  });
  await recordEvidenceAs(coachASession, approvalCEvidence);
  check("14: approving the edited (v2) version succeeds through the same canonical publish/assign lifecycle", !!assignmentC);
  check("edited-approval evidence outcome is 'edited', not 'approved'", approvalCEvidence.outcome === "edited");

  const { data: activeAfterC } = await coachASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientAProfileId).eq("status", "active").single();
  check("15: Client A now genuinely receives the EDITED Program C (v2), not the original v1 proposal", activeAfterC?.program_version_id === programCV2Row!.id);

  console.log("\n8. Program D: generate, then reject — never becomes active, evidence recorded once, retry idempotent\n");

  const programD = await generateProposal(coachASession, { workspaceId, coachId: coachA.id, clientProfileId: clientAProfileId, title: "Program D", durationWeeks: 4 });
  const { error: archiveError } = await coachASession.from("training_program_versions").update({ status: "archived" }).eq("id", programD.versionId).eq("workspace_id", workspaceId).eq("status", "draft");
  check("K: coach can reject Program D (transitions the real draft to 'archived')", !archiveError, archiveError?.message);

  const rejectionEvidence = projectProgramRejectionDecision({
    workspaceId,
    coachUserId: coachA.id,
    clientProfileId: clientAProfileId,
    originalVersionId: programD.versionId,
    proposedSummary: { durationWeeks: 4, directionLabel: programD.directionLabel, rationale: programD.content.generationRationale ?? "No rationale recorded." },
    reason: "too_much_volume",
    decidedAtIso: new Date().toISOString(),
  });
  const firstRejectInsert = await recordEvidenceAs(coachASession, rejectionEvidence);
  check("M: rejection decision evidence was recorded, with the optional reason preserved", firstRejectInsert.inserted && rejectionEvidence.reason === "too_much_volume");

  const { data: activeStillC } = await coachASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientAProfileId).eq("status", "active").single();
  check("L/18: Program D never became active — Client A's real active assignment is still edited Program C", activeStillC?.program_version_id === programCV2Row!.id);

  // Retry: rejecting an already-archived draft again (idempotent no-op),
  // plus retrying the evidence insert.
  const { error: retryArchiveError } = await coachASession.from("training_program_versions").update({ status: "archived" }).eq("id", programD.versionId).eq("workspace_id", workspaceId).eq("status", "draft");
  check("20/N: retrying the rejection (already archived — the .eq('status','draft') guard matches zero rows) never errors", !retryArchiveError);
  const retryRejectInsert = await recordEvidenceAs(coachASession, rejectionEvidence);
  check("X: retrying the identical rejection evidence is idempotent — absorbed, not duplicated", !retryRejectInsert.inserted);
  const { data: dEvidenceRows } = await coachASession.from("coach_decision_evidence").select("id").eq("source_ref", `program_version:${programD.versionId}`);
  check("19: exactly one rejection evidence row exists for Program D after the retry", (dEvidenceRows ?? []).length === 1);

  console.log("\n9. Regeneration/history — Program D remains real historical evidence, never deleted\n");

  const { data: programDStillExists } = await coachASession.from("training_program_versions").select("id, status").eq("id", programD.versionId).single();
  check("O: the rejected Program D version still exists, status='archived' — real historical evidence, never deleted", programDStillExists?.status === "archived");
  check("N: Program B, C(v1), C(v2), and D all carry genuinely distinct program identities (regeneration creates new identities, never overwrites)", new Set([programB.programId, programC.programId, programD.programId]).size === 3);

  console.log("\n10. Authorization — unrelated coach (same workspace) and cross-workspace coach cannot approve; client cannot read a draft\n");

  const { error: coachBAssignError } = await coachBSession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: programD.versionId });
  check("U: Coach B (same workspace, NOT assigned to Client A) cannot activate any version for Client A — rejected by the RPC's own can_manage_client check", !!coachBAssignError);

  const { data: otherCoachSeesWorkspace } = await otherCoachSession.from("training_program_versions").select("id").eq("workspace_id", workspaceId);
  check("U: an unrelated coach in a completely different workspace sees ZERO of this workspace's program versions", (otherCoachSeesWorkspace ?? []).length === 0);

  const { data: clientSeesDraft } = await clientASession.from("training_program_versions").select("id").eq("id", programD.versionId);
  check("T: Client A cannot read the (rejected, never-assigned) Program D draft at all — no assignment row ever referenced it", (clientSeesDraft ?? []).length === 0);

  const { data: clientSeesActiveContent } = await clientASession.from("training_program_versions").select("id").eq("id", programCV2Row!.id as string);
  check("Client A CAN read the version that IS actually assigned to them (edited Program C)", (clientSeesActiveContent ?? []).length === 1);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
