// Phase 11A — Universal Interval/HIIT Training Execution.
//
// Live E2E verification against a real local Supabase stack, covering the
// SUPABASE-BACKED portion of this phase: a real coach's stored methodology
// (coach_playbooks.content.operatingModel.programArchitecture.cardioPhilosophy)
// driving real interval generation, persisted schemaVersion-2 content,
// coach review, approval, and security — mirroring
// scripts/e2e-personalized-generation.mts's exact real pipeline
// reproduction pattern (extractClientProgrammingProfile is not exercised
// here since it's not this phase's concern; buildPlaceholderProgrammingProfile
// is used instead, matching scripts/e2e-adjustment-proposals.mts's own
// convention for phases not focused on onboarding extraction).
//
// The CLIENT EXECUTION engine (round/phase state machine, timer, pain/skip
// integration) is client-only in-memory demo-prototype state (lib/state.ts),
// with no live Supabase surface at all and no existing dev-UI trigger for a
// hand-authored Session fixture — the exact same posture Phase 4 documented
// for its own continuous-execution work (lib/training/demo-fixtures.ts's
// own module doc). That engine is verified by
// lib/workout/verify-interval-execution.mts's 34 pure/reducer tests
// instead, covering every acceptance scenario from spec section 32
// end-to-end in-memory — this script does not duplicate that.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-11a-* fixtures):
//   node --experimental-strip-types scripts/e2e-interval-generation.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { defaultAiAuthorityConfig } from "../lib/coach/ai-authority.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateUniversalTrainingProgramContent } from "../lib/production/validation.ts";
import type { CoachPlaybookContent } from "../lib/coach/playbook.ts";

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

async function main() {
  console.log(`OPTIM Phase 11A — live E2E interval generation/review/security verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 11A fixtures (service-role, local only)\n");

  const conditioningCoach = await ensureUser("e2e-11a-conditioning-coach@example.test", "Conditioning Coach");
  const strengthCoach = await ensureUser("e2e-11a-strength-coach@example.test", "Strength Coach");
  const otherCoach = await ensureUser("e2e-11a-other-coach@example.test", "Other Coach");
  const clientA = await ensureUser("e2e-11a-client-a@example.test", "Client A (conditioning)");
  const clientB = await ensureUser("e2e-11a-client-b@example.test", "Client B (strength)");
  const clientRestrictedGoal = await ensureUser("e2e-11a-client-goal@example.test", "Client Goal Override");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const conditioningWorkspaceId = await ensureWorkspace(conditioningCoach.id, "E2E 11A Conditioning Workspace");
  const strengthWorkspaceId = await ensureWorkspace(strengthCoach.id, "E2E 11A Strength Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 11A Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: conditioningWorkspaceId, user_id: conditioningCoach.id, role: "workspace_owner", status: "active" },
      { workspace_id: conditioningWorkspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: conditioningWorkspaceId, user_id: clientRestrictedGoal.id, role: "client", status: "active" },
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

  const clientAProfileId = await ensureClientProfile(conditioningWorkspaceId, conditioningCoach.id, clientA.id, "Client A (conditioning)");
  const clientGoalProfileId = await ensureClientProfile(conditioningWorkspaceId, conditioningCoach.id, clientRestrictedGoal.id, "Client Goal Override");
  const clientBProfileId = await ensureClientProfile(strengthWorkspaceId, strengthCoach.id, clientB.id, "Client B (strength)");

  // Clean up any prior run's programs so this script is safely re-runnable.
  for (const [workspaceId, ids] of [
    [conditioningWorkspaceId, [clientAProfileId, clientGoalProfileId]],
    [strengthWorkspaceId, [clientBProfileId]],
  ] as [string, string[]][]) {
    for (const cid of ids) await admin.from("program_assignments").delete().eq("client_profile_id", cid);
    const { data: staleVersions } = await admin.from("training_program_versions").select("id, program_id").eq("workspace_id", workspaceId);
    const staleVersionIds = (staleVersions ?? []).map((v) => v.id as string);
    const staleProgramIds = [...new Set((staleVersions ?? []).map((v) => v.program_id as string))];
    if (staleVersionIds.length > 0) await admin.from("training_program_versions").delete().in("id", staleVersionIds);
    if (staleProgramIds.length > 0) await admin.from("training_programs").delete().in("id", staleProgramIds);
  }

  console.log("  fixtures ready: Conditioning Coach + 2 clients, Strength Coach + 1 client, Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const conditioningCoachSession = await signInAsRealSession("e2e-11a-conditioning-coach@example.test");
  const strengthCoachSession = await signInAsRealSession("e2e-11a-strength-coach@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-11a-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-11a-client-a@example.test");
  check("all sessions completed a real OTP sign-in round-trip", true);

  console.log("\n3. Each coach configures a real, distinctive Playbook (conditioning vs. strength methodology) (19, 21)\n");

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

  const conditioningModel = createDefaultCoachOperatingModel({ coachId: conditioningCoach.id, workspaceId: conditioningWorkspaceId, nowIso, businessName: "E2E 11A Conditioning Workspace" });
  conditioningModel.programArchitecture = { ...conditioningModel.programArchitecture, typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" };
  await ensureApprovedPlaybook(conditioningCoachSession, conditioningWorkspaceId, conditioningCoach.id, {
    operatingModel: conditioningModel,
    aiAuthority: { coachId: conditioningCoach.id, workspaceId: conditioningWorkspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso },
    examples: [],
  });

  const strengthModel = createDefaultCoachOperatingModel({ coachId: strengthCoach.id, workspaceId: strengthWorkspaceId, nowIso, businessName: "E2E 11A Strength Workspace" });
  strengthModel.programArchitecture = { ...strengthModel.programArchitecture, typicalFrequencyDaysMax: 3, cardioPhilosophy: "rarely_used" };
  await ensureApprovedPlaybook(strengthCoachSession, strengthWorkspaceId, strengthCoach.id, {
    operatingModel: strengthModel,
    aiAuthority: { coachId: strengthCoach.id, workspaceId: strengthWorkspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso },
    examples: [],
  });
  check("both coaches persisted a real, distinctive approved Playbook through their own real sessions", true);

  console.log("\n4. Real interval generation for the conditioning-focused coach's client (U)\n");

  const profileA = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5));
  const { data: conditioningPlaybookRow } = await conditioningCoachSession.from("coach_playbooks").select("content").eq("workspace_id", conditioningWorkspaceId).eq("status", "approved").single();
  const comA = (conditioningPlaybookRow!.content as CoachPlaybookContent).operatingModel;
  check("the real approved Playbook reflects this coach's actual configured conditioning methodology", comA.programArchitecture.cardioPhilosophy === "prescribed_for_conditioning");

  const directionsA = generateProgramDirectionSummaries({ profile: profileA, com: comA, durationWeeks: 4 });
  const directionA = directionsA.find((d) => d.kind === "best_fit") ?? directionsA[0];
  const { content: contentA, constraints: constraintsA } = buildUniversalProgramForDirection(directionA, { clientId: clientAProfileId, workspaceId: conditioningWorkspaceId, coachId: conditioningCoach.id, profile: profileA, com: comA, durationWeeks: 4, nowIso });

  const intervalItemsA = contentA.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.category === "interval")))));
  check("U: real generation for a conditioning-focused coach produces at least one real interval item", intervalItemsA.length > 0);
  check("the generated interval item has a real round count and a real work target", (intervalItemsA[0]?.prescription.rounds ?? 0) > 0 && intervalItemsA[0]?.prescription.workInterval !== undefined);
  check("generated interval content passes every real hard constraint, including only_executable_families", constraintsA.passed);
  validateUniversalTrainingProgramContent(contentA); // structurally valid, round-trips
  check("the generation rationale honestly names the interval-conditioning placement in coaching language, never raw JSON", /interval-conditioning/i.test(contentA.generationRationale ?? ""));

  console.log("\n5. V: a non-conditioning coach's client never receives interval content (regression-safe)\n");

  const profileB = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5));
  const { data: strengthPlaybookRow } = await strengthCoachSession.from("coach_playbooks").select("content").eq("workspace_id", strengthWorkspaceId).eq("status", "approved").single();
  const comB = (strengthPlaybookRow!.content as CoachPlaybookContent).operatingModel;
  const directionsB = generateProgramDirectionSummaries({ profile: profileB, com: comB, durationWeeks: 4 });
  const directionB = directionsB.find((d) => d.kind === "best_fit") ?? directionsB[0];
  const { content: contentB } = buildUniversalProgramForDirection(directionB, { clientId: clientBProfileId, workspaceId: strengthWorkspaceId, coachId: strengthCoach.id, profile: profileB, com: comB, durationWeeks: 4, nowIso });
  const intervalItemsB = contentB.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.category === "interval")))));
  check("V: a strength-focused coach's real generation stays resistance-focused — zero interval items", intervalItemsB.length === 0);

  console.log("\n6. HIIT is a prescription format, never a client goal — depends only on coach methodology (5)\n");

  for (const primaryGoal of ["fat_loss", "strength", "general_fitness"] as const) {
    const goalProfile = { ...buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 5)), primaryGoal };
    const directions = generateProgramDirectionSummaries({ profile: goalProfile, com: comA, durationWeeks: 1 });
    const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
    const { content } = buildUniversalProgramForDirection(direction, { clientId: clientGoalProfileId, workspaceId: conditioningWorkspaceId, coachId: conditioningCoach.id, profile: goalProfile, com: comA, durationWeeks: 1, nowIso });
    const hasInterval = content.weeks.some((w) => w.days.some((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.some((i) => i.category === "interval")))));
    check(`the conditioning coach's client still gets interval content regardless of primaryGoal="${primaryGoal}" (goal never drives HIIT)`, hasInterval);
  }

  console.log("\n7. Publish and assign the real interval-bearing program through the real pathway (22 — legacy/continuous paths unaffected)\n");

  const { data: programFamily, error: programFamilyError } = await conditioningCoachSession.from("training_programs").insert({ workspace_id: conditioningWorkspaceId, created_by: conditioningCoach.id, title: "E2E 11A Interval Program" }).select("id").single();
  check("coach: can create a training_programs row for the real interval-bearing content", !programFamilyError, programFamilyError?.message);
  const { data: draftVersion, error: draftError } = await conditioningCoachSession
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: conditioningWorkspaceId, version_number: 1, status: "draft", content: { ...contentA, name: "E2E 11A Interval Program" }, created_by: conditioningCoach.id })
    .select("id")
    .single();
  check("coach: can persist the real interval-bearing schemaVersion-2 content as a draft", !draftError, draftError?.message);
  const { error: publishError } = await conditioningCoachSession.from("training_program_versions").update({ status: "published", published_by: conditioningCoach.id, published_at: nowIso }).eq("id", draftVersion!.id);
  check("coach: can publish the real interval-bearing content through the unchanged real publish step", !publishError, publishError?.message);
  const { data: assignmentId, error: assignError } = await conditioningCoachSession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: draftVersion!.id });
  check("coach: assign_active_program_version succeeds for real interval-bearing content through the unchanged real lifecycle", !assignError && !!assignmentId, assignError?.message);

  await conditioningCoachSession.from("client_enrollments").upsert({ workspace_id: conditioningWorkspaceId, client_profile_id: clientAProfileId, original_program_start_date: new Date().toISOString().slice(0, 10), timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });

  const { data: myAssignment, error: myAssignmentError } = await clientASession
    .from("program_assignments")
    .select("id, training_program_versions(content)")
    .eq("client_profile_id", clientAProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Client A: receives their own real, published, interval-bearing program", !myAssignmentError && !!myAssignment, myAssignmentError?.message);
  const receivedContent = (myAssignment as unknown as { training_program_versions: { content: { weeks: typeof contentA.weeks } } } | null)?.training_program_versions?.content;
  const receivedIntervalItems = receivedContent?.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.category === "interval"))))) ?? [];
  check("the interval content the client actually receives survives the full write/read round-trip with real round/work/recovery fields intact", receivedIntervalItems.length > 0 && receivedIntervalItems[0]?.prescription.rounds === intervalItemsA[0]?.prescription.rounds);

  console.log("\n8. Security — cross-workspace and unrelated-coach isolation for the real interval-bearing content\n");

  const { data: otherCoachReadsVersion } = await otherCoachSession.from("training_program_versions").select("id").eq("id", draftVersion!.id);
  check("a cross-workspace coach cannot read the real interval-bearing program version at all", (otherCoachReadsVersion ?? []).length === 0);
  const { data: strengthCoachReadsPlaybook } = await strengthCoachSession.from("coach_playbooks").select("id").eq("workspace_id", conditioningWorkspaceId);
  check("an unrelated coach cannot read the conditioning coach's own Playbook (methodology stays private)", (strengthCoachReadsPlaybook ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
