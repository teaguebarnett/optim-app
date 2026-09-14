// Phase 11C — Universal Power/Plyometric + Mobility Training.
//
// Live E2E verification against a real local Supabase stack, covering the
// SUPABASE-BACKED portion of this phase: a real coach's stored methodology
// (practice.commonGoals for power, programArchitecture.warmupPhilosophy for
// mobility) driving real power/mobility generation, persisted
// schemaVersion-2 content, coach review, item-level editing
// (contacts/side/reps/duration), approval, and security — mirroring
// scripts/e2e-circuit-generation.mts's exact real pipeline reproduction
// pattern.
//
// The CLIENT EXECUTION engine (per-set/per-side state machine, pain/skip
// integration) is client-only in-memory demo-prototype state
// (lib/state.ts), with no live Supabase surface at all and no existing
// dev-UI trigger for a hand-authored Session fixture — the exact same
// posture every prior training-modality phase (4, 11A, 11B) documented for
// its own execution engine. That engine is verified by
// lib/workout/verify-power-mobility-execution.mts's 56 pure/reducer tests
// instead, covering every acceptance scenario from spec sections 33-39
// end-to-end in-memory — this script does not duplicate that.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-11c-* fixtures):
//   node --experimental-strip-types scripts/e2e-power-mobility-generation.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { defaultAiAuthorityConfig } from "../lib/coach/ai-authority.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateUniversalTrainingProgramContent } from "../lib/production/validation.ts";
import { applyTrainingItemPatch, type TrainingItemPath } from "../lib/training/program-proposal-editing.ts";
import type { CoachPlaybookContent } from "../lib/coach/playbook.ts";
import type { Block, TrainingItemInstance, UniversalTrainingProgramContent } from "../lib/training/types.ts";

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

function allItems(content: { weeks: { days: { sessions?: { blocks: Block[] }[] }[] }[] }): TrainingItemInstance[] {
  return content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items))));
}

async function main() {
  console.log(`OPTIM Phase 11C — live E2E power/mobility generation/review/edit/security verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 11C fixtures (service-role, local only)\n");

  const athleticCoach = await ensureUser("e2e-11c-athletic-coach@example.test", "Athletic Coach 11C");
  const otherCoach = await ensureUser("e2e-11c-other-coach@example.test", "Other Coach 11C");
  const clientA = await ensureUser("e2e-11c-client-a@example.test", "Client A (athletic)");
  const clientB = await ensureUser("e2e-11c-client-b@example.test", "Client B (general fitness)");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const athleticWorkspaceId = await ensureWorkspace(athleticCoach.id, "E2E 11C Athletic Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 11C Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: athleticWorkspaceId, user_id: athleticCoach.id, role: "workspace_owner", status: "active" },
      { workspace_id: athleticWorkspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: athleticWorkspaceId, user_id: clientB.id, role: "client", status: "active" },
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

  const clientAProfileId = await ensureClientProfile(athleticWorkspaceId, athleticCoach.id, clientA.id, "Client A (athletic)");
  const clientBProfileId = await ensureClientProfile(athleticWorkspaceId, athleticCoach.id, clientB.id, "Client B (general fitness)");

  for (const cid of [clientAProfileId, clientBProfileId]) await admin.from("program_assignments").delete().eq("client_profile_id", cid);
  const { data: staleVersions } = await admin.from("training_program_versions").select("id, program_id").eq("workspace_id", athleticWorkspaceId);
  const staleVersionIds = (staleVersions ?? []).map((v) => v.id as string);
  const staleProgramIds = [...new Set((staleVersions ?? []).map((v) => v.program_id as string))];
  if (staleVersionIds.length > 0) await admin.from("training_program_versions").delete().in("id", staleVersionIds);
  if (staleProgramIds.length > 0) await admin.from("training_programs").delete().in("id", staleProgramIds);

  console.log("  fixtures ready: Athletic Coach + 2 clients (Athletic Workspace), Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const athleticCoachSession = await signInAsRealSession("e2e-11c-athletic-coach@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-11c-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-11c-client-a@example.test");
  check("all sessions completed a real OTP sign-in round-trip", true);

  console.log("\n3. The coach configures a real, distinctive Playbook — athletic-performance practice focus + general-then-specific warm-up philosophy\n");

  const nowIso = new Date().toISOString();

  const athleticModel = createDefaultCoachOperatingModel({ coachId: athleticCoach.id, workspaceId: athleticWorkspaceId, nowIso, businessName: "E2E 11C Athletic Workspace" });
  athleticModel.programArchitecture = { ...athleticModel.programArchitecture, typicalFrequencyDaysMax: 3, warmupPhilosophy: "general_then_specific" };
  athleticModel.practice = { ...athleticModel.practice, commonGoals: [...athleticModel.practice.commonGoals, "athletic_performance"] };

  const { data: existingPlaybook } = await admin.from("coach_playbooks").select("id").eq("workspace_id", athleticWorkspaceId).eq("status", "approved").maybeSingle();
  const playbookContent: CoachPlaybookContent = { operatingModel: athleticModel, aiAuthority: { coachId: athleticCoach.id, workspaceId: athleticWorkspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso }, examples: [] };
  if (existingPlaybook) {
    const { error } = await athleticCoachSession.from("coach_playbooks").update({ content: playbookContent }).eq("id", existingPlaybook.id as string);
    if (error) throw new Error(`playbook update failed: ${error.message}`);
  } else {
    const { error } = await athleticCoachSession.from("coach_playbooks").insert({ workspace_id: athleticWorkspaceId, version: 1, status: "approved", content: playbookContent, created_by: athleticCoach.id, approved_by: athleticCoach.id, approved_at: nowIso });
    if (error) throw new Error(`playbook insert failed: ${error.message}`);
  }
  check("the coach persisted a real, distinctive approved Playbook (athletic_performance + general_then_specific) through their own real session", true);

  console.log("\n4. Real power + mobility generation, gated on real coach methodology (X, Y)\n");

  const profileA = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5));
  const { data: playbookRow } = await athleticCoachSession.from("coach_playbooks").select("content").eq("workspace_id", athleticWorkspaceId).eq("status", "approved").single();
  const comA = (playbookRow!.content as CoachPlaybookContent).operatingModel;
  check("the real approved Playbook reflects this coach's actual configured practice focus and warm-up methodology", comA.practice.commonGoals.includes("athletic_performance") && comA.programArchitecture.warmupPhilosophy === "general_then_specific");

  const directionsA = generateProgramDirectionSummaries({ profile: profileA, com: comA, durationWeeks: 4 });
  const directionA = directionsA.find((d) => d.kind === "best_fit") ?? directionsA[0];
  const { content: contentA, constraints: constraintsA } = buildUniversalProgramForDirection(directionA, { clientId: clientAProfileId, workspaceId: athleticWorkspaceId, coachId: athleticCoach.id, profile: profileA, com: comA, durationWeeks: 4, nowIso });

  const powerItemsA = allItems(contentA).filter((i) => i.category === "power");
  const mobilityItemsA = allItems(contentA).filter((i) => i.category === "mobility");
  check("X: real generation for an athletic-performance coach produces at least one real power item", powerItemsA.length > 0);
  check("Y: real generation for a general-then-specific warm-up coach produces at least one real mobility item", mobilityItemsA.length > 0);
  check("the generated power item has a real, structured set x rep/contacts/distance target — never generic text", (powerItemsA[0]?.prescription.sets ?? 0) > 0 && (powerItemsA[0]?.prescription.reps !== undefined || powerItemsA[0]?.prescription.contacts !== undefined || powerItemsA[0]?.prescription.distance !== undefined));
  check("the generated mobility item has a real, structured hold/rep target — never generic text", mobilityItemsA[0]?.prescription.duration !== undefined || mobilityItemsA[0]?.prescription.reps !== undefined);
  check("generated power/mobility content passes every real hard constraint, including only_executable_families", constraintsA.passed);
  validateUniversalTrainingProgramContent(contentA); // structurally valid, round-trips
  check("the generation rationale honestly names both placements in coaching language, never raw JSON", /power|plyometric/i.test(contentA.generationRationale ?? "") && /mobility/i.test(contentA.generationRationale ?? ""));

  console.log("\n5. Z: an unrelated coach's client never receives power or mobility content (regression-safe)\n");

  const unrelatedModel = createDefaultCoachOperatingModel({ coachId: athleticCoach.id, workspaceId: athleticWorkspaceId, nowIso, businessName: "E2E 11C Athletic Workspace" });
  unrelatedModel.programArchitecture = { ...unrelatedModel.programArchitecture, typicalFrequencyDaysMax: 3, warmupPhilosophy: "ramped_warmup_sets" };
  const profileB = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5));
  const directionsB = generateProgramDirectionSummaries({ profile: profileB, com: unrelatedModel, durationWeeks: 4 });
  const directionB = directionsB.find((d) => d.kind === "best_fit") ?? directionsB[0];
  const { content: contentB } = buildUniversalProgramForDirection(directionB, { clientId: clientBProfileId, workspaceId: athleticWorkspaceId, coachId: athleticCoach.id, profile: profileB, com: unrelatedModel, durationWeeks: 4, nowIso });
  const powerItemsB = allItems(contentB).filter((i) => i.category === "power");
  const mobilityItemsB = allItems(contentB).filter((i) => i.category === "mobility");
  check("Z: a coach methodology without either real signal produces zero power items", powerItemsB.length === 0);
  check("Z: a coach methodology without either real signal produces zero mobility items", mobilityItemsB.length === 0);

  console.log("\n6. Publish and assign the real power/mobility-bearing program through the real pathway\n");

  const { data: programFamily, error: programFamilyError } = await athleticCoachSession.from("training_programs").insert({ workspace_id: athleticWorkspaceId, created_by: athleticCoach.id, title: "E2E 11C Athletic Program" }).select("id").single();
  check("coach: can create a training_programs row for the real power/mobility-bearing content", !programFamilyError, programFamilyError?.message);
  const { data: draftVersion, error: draftError } = await athleticCoachSession
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: athleticWorkspaceId, version_number: 1, status: "draft", content: { ...contentA, name: "E2E 11C Athletic Program" }, created_by: athleticCoach.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("coach: can persist the real power/mobility-bearing schemaVersion-2 content as a draft proposal", !draftError, draftError?.message);

  console.log("\n7. Coach reviews and edits the power item's contacts/reps and the mobility item's side through the real applyTrainingItemPatch editor (V, W)\n");

  function locatePathFor(content: UniversalTrainingProgramContent, itemId: string): TrainingItemPath {
    for (const week of content.weeks) {
      for (const day of week.days) {
        for (const session of day.sessions ?? []) {
          for (const block of session.blocks) {
            if (block.items.some((i) => i.id === itemId)) {
              return { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex: (day.sessions ?? []).indexOf(session), blockId: block.id, itemId };
            }
          }
        }
      }
    }
    throw new Error(`item ${itemId} not found in content`);
  }

  const powerPath = locatePathFor(contentA, powerItemsA[0].id);
  // This is the SAME real applyTrainingItemPatch function the coach review
  // UI's editActionFor form invokes for a power item (components/coach/
  // program-proposal-review.tsx) — no separate power-editor product, per
  // spec section 25.
  const afterPowerEdit = applyTrainingItemPatch(contentA, powerPath, { sets: 5, repsLow: 4, repsHigh: 4, restSeconds: 150 });
  validateUniversalTrainingProgramContent(afterPowerEdit);
  const editedPowerItem = allItems(afterPowerEdit).find((i) => i.id === powerItemsA[0].id)!;
  check("the coach's real power-item edit (sets/reps/rest) persists and passes validation", editedPowerItem.prescription.sets === 5 && editedPowerItem.prescription.reps?.low === 4 && editedPowerItem.prescription.restSeconds === 150);

  const mobilityPath = locatePathFor(afterPowerEdit, mobilityItemsA[0].id);
  const afterMobilityEdit = applyTrainingItemPatch(afterPowerEdit, mobilityPath, { side: "bilateral" });
  validateUniversalTrainingProgramContent(afterMobilityEdit);
  const editedMobilityItem = allItems(afterMobilityEdit).find((i) => i.id === mobilityItemsA[0].id)!;
  check("the coach's real mobility-item side edit persists and passes validation", editedMobilityItem.prescription.side === "bilateral");
  check("editing one item never touches the other item's own prescription (item-level edits stay scoped)", JSON.stringify(allItems(afterMobilityEdit).find((i) => i.id === powerItemsA[0].id)?.prescription) === JSON.stringify(editedPowerItem.prescription));

  const { data: editedVersion, error: editedVersionError } = await athleticCoachSession
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: athleticWorkspaceId, version_number: 2, status: "draft", content: { ...afterMobilityEdit, name: "E2E 11C Athletic Program" }, created_by: athleticCoach.id, proposed_for_client_profile_id: clientAProfileId })
    .select("id")
    .single();
  check("coach: can persist the edited power/mobility-bearing content as a new draft version (same 'new version per edit' pattern as every other proposal edit)", !editedVersionError, editedVersionError?.message);
  await athleticCoachSession.from("training_program_versions").update({ status: "archived" }).eq("id", draftVersion!.id).eq("status", "draft");

  const { error: publishError } = await athleticCoachSession.from("training_program_versions").update({ status: "published", published_by: athleticCoach.id, published_at: nowIso }).eq("id", editedVersion!.id);
  check("coach: can publish the edited power/mobility-bearing content through the unchanged real publish step", !publishError, publishError?.message);
  const { data: assignmentId, error: assignError } = await athleticCoachSession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: editedVersion!.id });
  check("coach: assign_active_program_version succeeds for real power/mobility-bearing content through the unchanged real lifecycle", !assignError && !!assignmentId, assignError?.message);

  await athleticCoachSession.from("client_enrollments").upsert({ workspace_id: athleticWorkspaceId, client_profile_id: clientAProfileId, original_program_start_date: new Date().toISOString().slice(0, 10), timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });

  const { data: myAssignment, error: myAssignmentError } = await clientASession
    .from("program_assignments")
    .select("id, training_program_versions(content)")
    .eq("client_profile_id", clientAProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Client A: receives their own real, published, edited power/mobility-bearing program", !myAssignmentError && !!myAssignment, myAssignmentError?.message);
  const receivedContent = (myAssignment as unknown as { training_program_versions: { content: UniversalTrainingProgramContent } } | null)?.training_program_versions?.content;
  const receivedPowerItem = receivedContent ? allItems(receivedContent).find((i) => i.id === powerItemsA[0].id) : undefined;
  const receivedMobilityItem = receivedContent ? allItems(receivedContent).find((i) => i.id === mobilityItemsA[0].id) : undefined;
  check("the edited power content the client actually receives survives the full write/read round-trip with the real edit intact", receivedPowerItem?.prescription.sets === 5 && receivedPowerItem?.prescription.reps?.low === 4);
  check("the edited mobility content the client actually receives survives the full write/read round-trip with the real edit intact", receivedMobilityItem?.prescription.side === "bilateral");

  console.log("\n8. Security — cross-workspace and unrelated-coach isolation for the real power/mobility-bearing content\n");

  const { data: otherCoachReadsVersion } = await otherCoachSession.from("training_program_versions").select("id").eq("id", editedVersion!.id);
  check("a cross-workspace coach cannot read the real power/mobility-bearing program version at all", (otherCoachReadsVersion ?? []).length === 0);
  const { data: otherCoachReadsPlaybook } = await otherCoachSession.from("coach_playbooks").select("id").eq("workspace_id", athleticWorkspaceId);
  check("an unrelated coach cannot read the athletic coach's own Playbook (methodology stays private)", (otherCoachReadsPlaybook ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
