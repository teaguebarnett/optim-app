// Phase 11D — Custom Coach Methods and Advanced Training Structures.
//
// Live E2E verification against a real local Supabase stack, covering the
// SUPABASE-BACKED portion of this phase: a real coach's stored methodology
// (the SAME cardioPhilosophy === "prescribed_for_conditioning" signal
// Phase 11A/11B already claim, extended one more alternation step — see
// lib/coach/universal-program-generation.ts's own doc) driving real AMRAP
// generation as a genuine, unbounded, time-capped circuit BLOCK, persisted
// schemaVersion-2 content, coach review, block-level editing (time cap,
// name), approval, and security — mirroring
// scripts/e2e-circuit-generation.mts's exact real pipeline reproduction
// pattern.
//
// The CLIENT EXECUTION engine (AMRAP's continuous-round state machine,
// EMOM's cadence-window state machine, time expiration, pain/skip
// integration) is client-only in-memory demo-prototype state
// (lib/state.ts), with no live Supabase surface at all and no existing
// dev-UI trigger for a hand-authored Session fixture — the exact same
// posture every prior training-modality phase (4, 11A, 11B, 11C)
// documented for its own execution engine. That engine is verified by
// lib/workout/verify-custom-methods-execution.mts's 59 pure/reducer tests
// instead, covering every acceptance scenario from spec sections 41-46
// end-to-end in-memory — this script does not duplicate that. EMOM is not
// wired into automatic generation at all (no real coach-collected signal
// distinguishes "wants AMRAP" from "wants EMOM" — a documented, deliberate
// onboarding gap, spec section 31's own escape hatch), so this script
// proves EMOM's own review/edit path directly against a hand-persisted
// fixture rather than through generation.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-11d-* fixtures):
//   node --experimental-strip-types scripts/e2e-custom-method-generation.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { defaultAiAuthorityConfig } from "../lib/coach/ai-authority.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateUniversalTrainingProgramContent } from "../lib/production/validation.ts";
import { applyBlockPatch, type BlockPath } from "../lib/training/program-proposal-editing.ts";
import { EMOM_ALTERNATING_SESSION_DEMO } from "../lib/training/demo-fixtures.ts";
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
  console.log(`OPTIM Phase 11D — live E2E custom-method (AMRAP/EMOM) generation/review/edit/security verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 11D fixtures (service-role, local only)\n");

  const conditioningCoach = await ensureUser("e2e-11d-conditioning-coach@example.test", "Conditioning Coach 11D");
  const otherCoach = await ensureUser("e2e-11d-other-coach@example.test", "Other Coach 11D");
  const clientA = await ensureUser("e2e-11d-client-a@example.test", "Client A (conditioning)");
  const clientB = await ensureUser("e2e-11d-client-b@example.test", "Client B (strength)");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const conditioningWorkspaceId = await ensureWorkspace(conditioningCoach.id, "E2E 11D Conditioning Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 11D Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: conditioningWorkspaceId, user_id: conditioningCoach.id, role: "workspace_owner", status: "active" },
      { workspace_id: conditioningWorkspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: conditioningWorkspaceId, user_id: clientB.id, role: "client", status: "active" },
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

  const clientAProfileId = await ensureClientProfile(conditioningWorkspaceId, conditioningCoach.id, clientA.id, "Client A (conditioning)");
  const clientBProfileId = await ensureClientProfile(conditioningWorkspaceId, conditioningCoach.id, clientB.id, "Client B (strength)");

  for (const cid of [clientAProfileId, clientBProfileId]) await admin.from("program_assignments").delete().eq("client_profile_id", cid);
  const { data: staleVersions } = await admin.from("training_program_versions").select("id, program_id").eq("workspace_id", conditioningWorkspaceId);
  const staleVersionIds = (staleVersions ?? []).map((v) => v.id as string);
  const staleProgramIds = [...new Set((staleVersions ?? []).map((v) => v.program_id as string))];
  if (staleVersionIds.length > 0) await admin.from("training_program_versions").delete().in("id", staleVersionIds);
  if (staleProgramIds.length > 0) await admin.from("training_programs").delete().in("id", staleProgramIds);

  console.log("  fixtures ready: Conditioning Coach + 2 clients (Conditioning Workspace), Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const conditioningCoachSession = await signInAsRealSession("e2e-11d-conditioning-coach@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-11d-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-11d-client-a@example.test");
  check("all sessions completed a real OTP sign-in round-trip", true);

  console.log("\n3. The coach configures a real, distinctive Playbook — conditioning methodology, enough real schedule surplus for a 3rd-tier AMRAP day\n");

  const nowIso = new Date().toISOString();
  const conditioningModel = createDefaultCoachOperatingModel({ coachId: conditioningCoach.id, workspaceId: conditioningWorkspaceId, nowIso, businessName: "E2E 11D Conditioning Workspace" });
  conditioningModel.programArchitecture = { ...conditioningModel.programArchitecture, typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" };

  const { data: existingPlaybook } = await admin.from("coach_playbooks").select("id").eq("workspace_id", conditioningWorkspaceId).eq("status", "approved").maybeSingle();
  const playbookContent: CoachPlaybookContent = { operatingModel: conditioningModel, aiAuthority: { coachId: conditioningCoach.id, workspaceId: conditioningWorkspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso }, examples: [] };
  if (existingPlaybook) {
    const { error } = await conditioningCoachSession.from("coach_playbooks").update({ content: playbookContent }).eq("id", existingPlaybook.id as string);
    if (error) throw new Error(`playbook update failed: ${error.message}`);
  } else {
    const { error } = await conditioningCoachSession.from("coach_playbooks").insert({ workspace_id: conditioningWorkspaceId, version: 1, status: "approved", content: playbookContent, created_by: conditioningCoach.id, approved_by: conditioningCoach.id, approved_at: nowIso });
    if (error) throw new Error(`playbook insert failed: ${error.message}`);
  }
  check("the coach persisted a real, distinctive approved Playbook (prescribed_for_conditioning) through their own real session", true);

  console.log("\n4. Real AMRAP generation as a genuine, unbounded, time-capped BLOCK — the established conditioning alternation's 3rd tier (AD)\n");

  // 6 available days, resistance cap 3 -> exactly 3 real surplus days ->
  // day 1 = interval (Phase 11A's own unchanged trigger), day 2 = circuit
  // (Phase 11B's own unchanged trigger), day 3 = AMRAP (this phase's new
  // 3rd-tier alternation) — see universal-program-generation.ts's own doc.
  const profileA = { ...buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 6)), cardioPreference: "enjoys_cardio" as const };
  const { data: playbookRow } = await conditioningCoachSession.from("coach_playbooks").select("content").eq("workspace_id", conditioningWorkspaceId).eq("status", "approved").single();
  const comA = (playbookRow!.content as CoachPlaybookContent).operatingModel;
  check("the real approved Playbook reflects this coach's actual configured conditioning methodology", comA.programArchitecture.cardioPhilosophy === "prescribed_for_conditioning");

  const directionsA = generateProgramDirectionSummaries({ profile: profileA, com: comA, durationWeeks: 4 });
  const directionA = directionsA.find((d) => d.kind === "best_fit") ?? directionsA[0];
  const { content: contentA, constraints: constraintsA } = buildUniversalProgramForDirection(directionA, { clientId: clientAProfileId, workspaceId: conditioningWorkspaceId, coachId: conditioningCoach.id, profile: profileA, com: comA, durationWeeks: 4, nowIso });

  const amrapBlocksA = allBlocks(contentA).filter((b) => b.terminationMode === "time_cap");
  // The 3rd conditioning day recurs every week of the 4-week program, so a
  // real AMRAP block appears once PER WEEK (matching interval/circuit's
  // own once-per-week placement).
  check("AD: real generation for a conditioning coach with 3 surplus days produces exactly one real AMRAP block per week", amrapBlocksA.length === contentA.weeks.length);
  const amrapBlockA = amrapBlocksA[0];
  check("the AMRAP block never carries a fabricated round count — genuinely unbounded", amrapBlockA?.rounds === undefined);
  check("the AMRAP block has a real, positive time cap", !!amrapBlockA?.timeCapSeconds && amrapBlockA.timeCapSeconds > 0);
  check("the AMRAP block has at least one real item", amrapBlockA?.items.length >= 1);
  check("generated AMRAP content passes every real hard constraint, including only_executable_families", constraintsA.passed);
  validateUniversalTrainingProgramContent(contentA); // structurally valid, round-trips
  check("the generation rationale honestly names the AMRAP placement in coaching language, never raw JSON", /amrap/i.test(contentA.generationRationale ?? ""));

  console.log("\n5. A coach with only 2 real surplus days never receives a 3rd-tier AMRAP (regression-safe)\n");

  const profileB = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5));
  const { content: contentB } = buildUniversalProgramForDirection(
    directionsA.find((d) => d.kind === "best_fit") ?? directionsA[0],
    { clientId: clientBProfileId, workspaceId: conditioningWorkspaceId, coachId: conditioningCoach.id, profile: profileB, com: comA, durationWeeks: 4, nowIso }
  );
  const amrapBlocksB = allBlocks(contentB).filter((b) => b.terminationMode === "time_cap");
  check("exactly 2 surplus days -> interval + circuit only -> zero AMRAP blocks", amrapBlocksB.length === 0);

  console.log("\n6. Publish and assign the real AMRAP-bearing program through the real pathway\n");

  const { data: programFamily, error: programFamilyError } = await conditioningCoachSession.from("training_programs").insert({ workspace_id: conditioningWorkspaceId, created_by: conditioningCoach.id, title: "E2E 11D Conditioning Program" }).select("id").single();
  check("coach: can create a training_programs row for the real AMRAP-bearing content", !programFamilyError, programFamilyError?.message);
  const { data: draftVersion, error: draftError } = await conditioningCoachSession
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: conditioningWorkspaceId, version_number: 1, status: "draft", content: { ...contentA, name: "E2E 11D Conditioning Program" }, created_by: conditioningCoach.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("coach: can persist the real AMRAP-bearing schemaVersion-2 content as a draft proposal", !draftError, draftError?.message);

  console.log("\n7. Coach reviews and edits the AMRAP's own time cap and name through the real applyBlockPatch editor — no separate custom-method editor (S, T)\n");

  function locateBlockPath(content: UniversalTrainingProgramContent, blockId: string): BlockPath {
    for (const week of content.weeks) {
      for (const day of week.days) {
        for (const session of day.sessions ?? []) {
          const sessionIndex = (day.sessions ?? []).indexOf(session);
          if (session.blocks.some((b) => b.id === blockId)) {
            return { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId };
          }
        }
      }
    }
    throw new Error(`block ${blockId} not found in content`);
  }

  const amrapPath = locateBlockPath(contentA, amrapBlockA.id);
  // This is the SAME real applyBlockPatch function the coach review UI's
  // editBlockActionFor form invokes for a circuit/AMRAP block
  // (components/coach/program-proposal-review.tsx) — no separate
  // custom-method editor product, per spec section 29/30.
  const editedContent = applyBlockPatch(contentA, amrapPath, { name: "Finisher", timeCapSeconds: 15 * 60 });
  validateUniversalTrainingProgramContent(editedContent);
  const editedAmrapBlock = allBlocks(editedContent).find((b) => b.id === amrapBlockA.id)!;
  check("the coach's real AMRAP edit (name, time cap) persists and passes validation", editedAmrapBlock.name === "Finisher" && editedAmrapBlock.timeCapSeconds === 15 * 60);
  check("editing the block's own time cap never touches its items or its unbounded round semantics", editedAmrapBlock.rounds === undefined && JSON.stringify(editedAmrapBlock.items) === JSON.stringify(amrapBlockA.items));

  const { data: editedVersion, error: editedVersionError } = await conditioningCoachSession
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: conditioningWorkspaceId, version_number: 2, status: "draft", content: { ...editedContent, name: "E2E 11D Conditioning Program" }, created_by: conditioningCoach.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("coach: can persist the edited AMRAP-bearing content as a new draft version (same 'new version per edit' pattern as every other proposal edit)", !editedVersionError, editedVersionError?.message);
  await conditioningCoachSession.from("training_program_versions").update({ status: "archived" }).eq("id", draftVersion!.id).eq("status", "draft");

  const { error: publishError } = await conditioningCoachSession.from("training_program_versions").update({ status: "published", published_by: conditioningCoach.id, published_at: nowIso }).eq("id", editedVersion!.id);
  check("coach: can publish the edited AMRAP-bearing content through the unchanged real publish step", !publishError, publishError?.message);
  const { data: assignmentId, error: assignError } = await conditioningCoachSession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: editedVersion!.id });
  check("coach: assign_active_program_version succeeds for real AMRAP-bearing content through the unchanged real lifecycle", !assignError && !!assignmentId, assignError?.message);

  await conditioningCoachSession.from("client_enrollments").upsert({ workspace_id: conditioningWorkspaceId, client_profile_id: clientAProfileId, original_program_start_date: new Date().toISOString().slice(0, 10), timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });

  const { data: myAssignment, error: myAssignmentError } = await clientASession
    .from("program_assignments")
    .select("id, training_program_versions(content)")
    .eq("client_profile_id", clientAProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Client A: receives their own real, published, edited AMRAP-bearing program", !myAssignmentError && !!myAssignment, myAssignmentError?.message);
  const receivedContent = (myAssignment as unknown as { training_program_versions: { content: UniversalTrainingProgramContent } } | null)?.training_program_versions?.content;
  const receivedAmrapBlock = receivedContent ? allBlocks(receivedContent).find((b) => b.id === amrapBlockA.id) : undefined;
  check("the edited AMRAP content the client actually receives survives the full write/read round-trip with the real edit intact", receivedAmrapBlock?.name === "Finisher" && receivedAmrapBlock?.timeCapSeconds === 15 * 60 && receivedAmrapBlock?.rounds === undefined);

  console.log("\n8. EMOM's own review/edit path — a real, hand-authored EMOM proposal (generation itself is deliberately not wired for EMOM — documented onboarding gap)\n");

  const { data: emomProgramFamily, error: emomProgramFamilyError } = await conditioningCoachSession.from("training_programs").insert({ workspace_id: conditioningWorkspaceId, created_by: conditioningCoach.id, title: "E2E 11D EMOM Program" }).select("id").single();
  check("coach: can create a training_programs row for a real EMOM-bearing draft", !emomProgramFamilyError, emomProgramFamilyError?.message);

  const emomContent: UniversalTrainingProgramContent = {
    schemaVersion: 2,
    id: `program-emom-${clientAProfileId}`,
    workspaceId: conditioningWorkspaceId as never,
    clientId: clientAProfileId as never,
    coachId: conditioningCoach.id as never,
    name: "E2E 11D EMOM Program",
    durationWeeks: 1,
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayOfWeek: "Monday", type: "training", sessions: [EMOM_ALTERNATING_SESSION_DEMO] },
          { dayOfWeek: "Tuesday", type: "rest" },
          { dayOfWeek: "Wednesday", type: "rest" },
          { dayOfWeek: "Thursday", type: "rest" },
          { dayOfWeek: "Friday", type: "rest" },
          { dayOfWeek: "Saturday", type: "rest" },
          { dayOfWeek: "Sunday", type: "rest" },
        ],
      },
    ],
    status: "draft",
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  } as UniversalTrainingProgramContent;
  validateUniversalTrainingProgramContent(emomContent);

  const { data: emomDraftVersion, error: emomDraftError } = await conditioningCoachSession
    .from("training_program_versions")
    .insert({ program_id: emomProgramFamily!.id, workspace_id: conditioningWorkspaceId, version_number: 1, status: "draft", content: emomContent, created_by: conditioningCoach.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("coach: can persist a real, hand-authored EMOM-bearing schemaVersion-2 content as a draft proposal", !emomDraftError, emomDraftError?.message);

  const emomPath = locateBlockPath(emomContent, "block-emom-alternating");
  const editedEmomContent = applyBlockPatch(emomContent, emomPath, { cadenceSeconds: 90, rounds: 8 });
  validateUniversalTrainingProgramContent(editedEmomContent);
  const editedEmomBlock = allBlocks(editedEmomContent).find((b) => b.id === "block-emom-alternating")!;
  check("the coach's real EMOM edit (cadence, total windows) persists and passes validation — the SAME editor, no separate product", editedEmomBlock.cadenceSeconds === 90 && editedEmomBlock.rounds === 8);

  console.log("\n9. Security — cross-workspace and unrelated-coach isolation for the real AMRAP/EMOM-bearing content\n");

  const { data: otherCoachReadsVersion } = await otherCoachSession.from("training_program_versions").select("id").eq("id", editedVersion!.id);
  check("a cross-workspace coach cannot read the real AMRAP-bearing program version at all", (otherCoachReadsVersion ?? []).length === 0);
  const { data: otherCoachReadsEmomVersion } = await otherCoachSession.from("training_program_versions").select("id").eq("id", emomDraftVersion!.id);
  check("a cross-workspace coach cannot read the real EMOM-bearing draft version at all", (otherCoachReadsEmomVersion ?? []).length === 0);
  const { data: otherCoachReadsPlaybook } = await otherCoachSession.from("coach_playbooks").select("id").eq("workspace_id", conditioningWorkspaceId);
  check("an unrelated coach cannot read the conditioning coach's own Playbook (methodology stays private)", (otherCoachReadsPlaybook ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
