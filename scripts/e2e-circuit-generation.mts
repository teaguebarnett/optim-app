// Phase 11B — Universal Circuit/Grouped Training Execution.
//
// Live E2E verification against a real local Supabase stack, covering the
// SUPABASE-BACKED portion of this phase: a real coach's stored methodology
// driving real circuit generation as ONE real block (never flattened),
// persisted schemaVersion-2 content, coach review, block-level editing
// (rounds/rest/name), approval, and security — mirroring
// scripts/e2e-interval-generation.mts's exact real pipeline reproduction
// pattern.
//
// The CLIENT EXECUTION engine (round/item state machine, per-round
// per-item actuals, pain/skip integration) is client-only in-memory
// demo-prototype state (lib/state.ts), with no live Supabase surface at
// all and no existing dev-UI trigger for a hand-authored Session fixture —
// the exact same posture Phase 11A documented for its own interval work
// (and Phase 4 before that, for continuous). That engine is verified by
// lib/workout/verify-circuit-execution.mts's 41 pure/reducer tests
// instead, covering every acceptance scenario from spec sections 39-44
// end-to-end in-memory — this script does not duplicate that.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-11b-* fixtures):
//   node --experimental-strip-types scripts/e2e-circuit-generation.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { defaultAiAuthorityConfig } from "../lib/coach/ai-authority.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateUniversalTrainingProgramContent } from "../lib/production/validation.ts";
import { isCircuitBlock } from "../lib/workout/session-flow.ts";
import { applyBlockPatch, type BlockPath } from "../lib/training/program-proposal-editing.ts";
import type { CoachPlaybookContent } from "../lib/coach/playbook.ts";
import type { Block, UniversalTrainingProgramContent } from "../lib/training/types.ts";

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

async function signInAsRealSession(email: string) {
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

function allBlocks(content: { weeks: { days: { sessions?: { blocks: Block[] }[] }[] }[] }): Block[] {
  return content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks)));
}

async function main() {
  console.log(`OPTIM Phase 11B — live E2E circuit generation/review/edit/security verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 11B fixtures (service-role, local only)\n");

  const conditioningCoach = await ensureUser("e2e-11b-conditioning-coach@example.test", "Conditioning Coach 11B");
  const strengthCoach = await ensureUser("e2e-11b-strength-coach@example.test", "Strength Coach 11B");
  const otherCoach = await ensureUser("e2e-11b-other-coach@example.test", "Other Coach 11B");
  const clientA = await ensureUser("e2e-11b-client-a@example.test", "Client A (circuit)");
  const clientB = await ensureUser("e2e-11b-client-b@example.test", "Client B (strength)");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const conditioningWorkspaceId = await ensureWorkspace(conditioningCoach.id, "E2E 11B Conditioning Workspace");
  const strengthWorkspaceId = await ensureWorkspace(strengthCoach.id, "E2E 11B Strength Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 11B Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: conditioningWorkspaceId, user_id: conditioningCoach.id, role: "workspace_owner", status: "active" },
      { workspace_id: conditioningWorkspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: strengthWorkspaceId, user_id: strengthCoach.id, role: "workspace_owner", status: "active" },
      { workspace_id: strengthWorkspaceId, user_id: clientB.id, role: "client", status: "active" },
      { workspace_id: otherWorkspaceId, user_id: otherCoach.id, role: "workspace_owner", status: "active" },
    ],
    { onConflict: "workspace_id,user_id" }
  );

  async function ensureClientProfile(workspaceId: string, coachUserId: string, userId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("client_profiles").insert({ workspace_id: workspaceId, user_id: userId, display_name: displayName }).select("id").single();
    if (error) throw new Error(`client_profiles insert failed: ${error.message}`);
    await admin.from("coach_client_assignments").insert({ workspace_id: workspaceId, coach_user_id: coachUserId, client_profile_id: data!.id, is_primary: true });
    return data!.id as string;
  }

  const clientAProfileId = await ensureClientProfile(conditioningWorkspaceId, conditioningCoach.id, clientA.id, "Client A (circuit)");
  const clientBProfileId = await ensureClientProfile(strengthWorkspaceId, strengthCoach.id, clientB.id, "Client B (strength)");

  for (const [workspaceId, ids] of [
    [conditioningWorkspaceId, [clientAProfileId]],
    [strengthWorkspaceId, [clientBProfileId]],
  ] as [string, string[]][]) {
    for (const cid of ids) await admin.from("program_assignments").delete().eq("client_profile_id", cid);
    const { data: staleVersions } = await admin.from("training_program_versions").select("id, program_id").eq("workspace_id", workspaceId);
    const staleVersionIds = (staleVersions ?? []).map((v) => v.id as string);
    const staleProgramIds = [...new Set((staleVersions ?? []).map((v) => v.program_id as string))];
    if (staleVersionIds.length > 0) await admin.from("training_program_versions").delete().in("id", staleVersionIds);
    if (staleProgramIds.length > 0) await admin.from("training_programs").delete().in("id", staleProgramIds);
  }

  console.log("  fixtures ready: Conditioning Coach + Client A, Strength Coach + Client B, Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const conditioningCoachSession = await signInAsRealSession("e2e-11b-conditioning-coach@example.test");
  const strengthCoachSession = await signInAsRealSession("e2e-11b-strength-coach@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-11b-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-11b-client-a@example.test");
  check("all sessions completed a real OTP sign-in round-trip", true);

  console.log("\n3. Each coach configures a real, distinctive Playbook (conditioning vs. strength methodology)\n");

  const nowIso = new Date().toISOString();

  async function ensureApprovedPlaybook(session: typeof conditioningCoachSession, workspaceId: string, coachId: string, content: CoachPlaybookContent) {
    const { data: existingPlaybook } = await admin.from("coach_playbooks").select("id").eq("workspace_id", workspaceId).eq("status", "approved").maybeSingle();
    if (existingPlaybook) {
      const { error } = await session.from("coach_playbooks").update({ content }).eq("id", existingPlaybook.id as string);
      if (error) throw new Error(`playbook update failed: ${error.message}`);
      return;
    }
    const { error } = await session.from("coach_playbooks").insert({ workspace_id: workspaceId, version: 1, status: "approved", content, created_by: coachId, approved_by: coachId, approved_at: nowIso });
    if (error) throw new Error(`playbook insert failed: ${error.message}`);
  }

  const conditioningModel = createDefaultCoachOperatingModel({ coachId: conditioningCoach.id, workspaceId: conditioningWorkspaceId, nowIso, businessName: "E2E 11B Conditioning Workspace" });
  conditioningModel.programArchitecture = { ...conditioningModel.programArchitecture, typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" };
  await ensureApprovedPlaybook(conditioningCoachSession, conditioningWorkspaceId, conditioningCoach.id, {
    operatingModel: conditioningModel,
    aiAuthority: { coachId: conditioningCoach.id, workspaceId: conditioningWorkspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso },
    examples: [],
  });

  const strengthModel = createDefaultCoachOperatingModel({ coachId: strengthCoach.id, workspaceId: strengthWorkspaceId, nowIso, businessName: "E2E 11B Strength Workspace" });
  strengthModel.programArchitecture = { ...strengthModel.programArchitecture, typicalFrequencyDaysMax: 3, cardioPhilosophy: "rarely_used" };
  await ensureApprovedPlaybook(strengthCoachSession, strengthWorkspaceId, strengthCoach.id, {
    operatingModel: strengthModel,
    aiAuthority: { coachId: strengthCoach.id, workspaceId: strengthWorkspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso },
    examples: [],
  });
  check("both coaches persisted a real, distinctive approved Playbook through their own real sessions", true);

  console.log("\n4. Real circuit generation as ONE real block, never flattened clones (Z)\n");

  // 5 available days, resistance cap 3 -> exactly 2 real surplus days ->
  // day 1 = interval (Phase 11A's own unchanged trigger), day 2 = circuit
  // (Phase 11B's own new alternation — see universal-program-generation.ts's
  // own doc for why).
  const profileA = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5));
  const { data: conditioningPlaybookRow } = await conditioningCoachSession.from("coach_playbooks").select("content").eq("workspace_id", conditioningWorkspaceId).eq("status", "approved").single();
  const comA = (conditioningPlaybookRow!.content as CoachPlaybookContent).operatingModel;

  const directionsA = generateProgramDirectionSummaries({ profile: profileA, com: comA, durationWeeks: 4 });
  const directionA = directionsA.find((d) => d.kind === "best_fit") ?? directionsA[0];
  const { content: contentA, constraints: constraintsA } = buildUniversalProgramForDirection(directionA, { clientId: clientAProfileId, workspaceId: conditioningWorkspaceId, coachId: conditioningCoach.id, profile: profileA, com: comA, durationWeeks: 4, nowIso });

  const circuitBlocksA = allBlocks(contentA).filter((b) => isCircuitBlock(b));
  // The second conditioning day recurs every week of the 4-week program, so
  // a real circuit block appears once PER WEEK (matching interval's own
  // once-per-week placement) — never more than one per week (there is only
  // one second-conditioning-day slot), never flattened into per-item clones.
  check("Z: real generation for a conditioning-focused coach with 2 surplus days produces exactly one real circuit block per week", circuitBlocksA.length === contentA.weeks.length);
  check("Z: no week ever contains more than one circuit block (never duplicated)", contentA.weeks.every((w) => allBlocks({ weeks: [w] }).filter((b) => isCircuitBlock(b)).length === 1));
  const circuitBlockA = circuitBlocksA[0];
  check("the circuit block has a real, positive round count", !!circuitBlockA?.rounds && circuitBlockA.rounds > 0);
  check("the circuit block has multiple DIFFERENT items — never flattened into N independent activities", circuitBlockA?.items.length >= 2 && new Set(circuitBlockA.items.map((i) => i.name)).size === circuitBlockA.items.length);
  check("generated circuit content passes every real hard constraint, including only_executable_families", constraintsA.passed);
  validateUniversalTrainingProgramContent(contentA); // structurally valid, round-trips
  check("the generation rationale honestly names the circuit placement in coaching language, never raw JSON", /conditioning-circuit/i.test(contentA.generationRationale ?? ""));

  console.log("\n5. AA: a non-conditioning coach's client never receives a circuit block (regression-safe)\n");

  const profileB = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5));
  const { data: strengthPlaybookRow } = await strengthCoachSession.from("coach_playbooks").select("content").eq("workspace_id", strengthWorkspaceId).eq("status", "approved").single();
  const comB = (strengthPlaybookRow!.content as CoachPlaybookContent).operatingModel;
  const directionsB = generateProgramDirectionSummaries({ profile: profileB, com: comB, durationWeeks: 4 });
  const directionB = directionsB.find((d) => d.kind === "best_fit") ?? directionsB[0];
  const { content: contentB } = buildUniversalProgramForDirection(directionB, { clientId: clientBProfileId, workspaceId: strengthWorkspaceId, coachId: strengthCoach.id, profile: profileB, com: comB, durationWeeks: 4, nowIso });
  const circuitBlocksB = allBlocks(contentB).filter((b) => isCircuitBlock(b));
  check("AA: a strength-focused coach's real generation stays resistance-focused — zero circuit blocks", circuitBlocksB.length === 0);

  console.log("\n6. Publish and assign the real circuit-bearing program through the real pathway\n");

  const { data: programFamily, error: programFamilyError } = await conditioningCoachSession.from("training_programs").insert({ workspace_id: conditioningWorkspaceId, created_by: conditioningCoach.id, title: "E2E 11B Circuit Program" }).select("id").single();
  check("coach: can create a training_programs row for the real circuit-bearing content", !programFamilyError, programFamilyError?.message);
  const { data: draftVersion, error: draftError } = await conditioningCoachSession
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: conditioningWorkspaceId, version_number: 1, status: "draft", content: { ...contentA, name: "E2E 11B Circuit Program" }, created_by: conditioningCoach.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("coach: can persist the real circuit-bearing schemaVersion-2 content as a draft proposal", !draftError, draftError?.message);

  console.log("\n7. Coach reviews and edits the circuit block's own rounds/rest/name through the real applyBlockPatch editor (X — coach edits circuit rounds/rest)\n");

  const circuitWeek = contentA.weeks.find((w) => w.days.some((d) => d.sessions?.some((s) => s.blocks.some((b) => b.id === circuitBlockA.id))))!;
  const circuitDay = circuitWeek.days.find((d) => d.sessions?.some((s) => s.blocks.some((b) => b.id === circuitBlockA.id)))!;
  const circuitSessionIndex = circuitDay.sessions!.findIndex((s) => s.blocks.some((b) => b.id === circuitBlockA.id));
  check("the real circuit block's exact week/day/session is locatable for a block-level edit", circuitSessionIndex >= 0);
  const circuitBlockPath: BlockPath = { weekNumber: circuitWeek.weekNumber, dayOfWeek: circuitDay.dayOfWeek, sessionIndex: circuitSessionIndex, blockId: circuitBlockA.id };

  // This is the SAME real applyBlockPatch function the coach review UI's
  // editBlockActionFor form invokes (components/coach/program-proposal-review.tsx)
  // — no separate circuit-editor product, per spec section 27.
  const editedContent: UniversalTrainingProgramContent = applyBlockPatch(contentA, circuitBlockPath, { name: "E2E MetCon", rounds: 4, restBetweenRoundsSeconds: 60 });
  validateUniversalTrainingProgramContent(editedContent);
  const editedCircuitBlock = allBlocks(editedContent).find((b) => b.id === circuitBlockA.id)!;
  check("the coach's real applyBlockPatch edit (name, rounds, round-rest) persists and passes validation", editedCircuitBlock.name === "E2E MetCon" && editedCircuitBlock.rounds === 4 && editedCircuitBlock.restBetweenRoundsSeconds === 60);
  check("X: the block's own items are completely untouched by a block-level edit — never confused with item-level edits (spec section 10)", JSON.stringify(editedCircuitBlock.items) === JSON.stringify(circuitBlockA.items));

  const { data: editedVersion, error: editedVersionError } = await conditioningCoachSession
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: conditioningWorkspaceId, version_number: 2, status: "draft", content: { ...editedContent, name: "E2E 11B Circuit Program" }, created_by: conditioningCoach.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("coach: can persist the edited circuit-bearing content as a new draft version (same 'new version per edit' pattern as every other proposal edit)", !editedVersionError, editedVersionError?.message);
  await conditioningCoachSession.from("training_program_versions").update({ status: "archived" }).eq("id", draftVersion!.id).eq("status", "draft");

  const { error: publishError } = await conditioningCoachSession.from("training_program_versions").update({ status: "published", published_by: conditioningCoach.id, published_at: nowIso }).eq("id", editedVersion!.id);
  check("coach: can publish the edited circuit-bearing content through the unchanged real publish step", !publishError, publishError?.message);
  const { data: assignmentId, error: assignError } = await conditioningCoachSession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: editedVersion!.id });
  check("coach: assign_active_program_version succeeds for real circuit-bearing content through the unchanged real lifecycle", !assignError && !!assignmentId, assignError?.message);

  await conditioningCoachSession.from("client_enrollments").upsert({ workspace_id: conditioningWorkspaceId, client_profile_id: clientAProfileId, original_program_start_date: new Date().toISOString().slice(0, 10), timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });

  const { data: myAssignment, error: myAssignmentError } = await clientASession
    .from("program_assignments")
    .select("id, training_program_versions(content)")
    .eq("client_profile_id", clientAProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Client A: receives their own real, published, edited circuit-bearing program", !myAssignmentError && !!myAssignment, myAssignmentError?.message);
  const receivedContent = (myAssignment as unknown as { training_program_versions: { content: { weeks: typeof contentA.weeks } } } | null)?.training_program_versions?.content;
  const receivedCircuitBlock = receivedContent ? allBlocks(receivedContent).find((b) => b.id === circuitBlockA.id) : undefined;
  check("the edited circuit content the client actually receives survives the full write/read round-trip with the real edit intact", receivedCircuitBlock?.name === "E2E MetCon" && receivedCircuitBlock?.rounds === 4);

  console.log("\n8. Security — cross-workspace and unrelated-coach isolation for the real circuit-bearing content\n");

  const { data: otherCoachReadsVersion } = await otherCoachSession.from("training_program_versions").select("id").eq("id", editedVersion!.id);
  check("a cross-workspace coach cannot read the real circuit-bearing program version at all", (otherCoachReadsVersion ?? []).length === 0);
  const { data: strengthCoachReadsPlaybook } = await strengthCoachSession.from("coach_playbooks").select("id").eq("workspace_id", conditioningWorkspaceId);
  check("an unrelated coach cannot read the conditioning coach's own Playbook (methodology stays private)", (strengthCoachReadsPlaybook ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
