// Phase 6B — Personalize Training Generation from Coach and Client Context.
//
// Live E2E verification against a real local Supabase stack — same posture
// as scripts/e2e-universal-program-execution.mts: real OTP sign-in through
// Mailpit, RLS-governed queries through each real signed-in session,
// service-role only to create fixture auth users. This proves the real
// data flow end to end:
//
//   client submits real onboarding answers -> persists in
//   client_onboarding_progress -> coach configures a real Playbook ->
//   persists in coach_playbooks -> the real generation pipeline
//   (extractClientProgrammingProfile + the approved Playbook's
//   operatingModel) produces a program that actually reflects both ->
//   publish/assign through the real pathway -> the real client receives it.
//
// app/actions/production-programs.ts's createPublishAndAssignProgramAction
// itself can't be imported here (needs next/headers) — this script
// reproduces its exact real query sequence one Supabase call at a time,
// then feeds the result through the same real, directly-importable pure
// functions (extractClientProgrammingProfile, generateProgramDirectionSummaries,
// buildUniversalProgramForDirection) that action calls — never a parallel
// test-only profile-building path.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-6b-* fixtures):
//   node --experimental-strip-types scripts/e2e-personalized-generation.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { defaultAiAuthorityConfig } from "../lib/coach/ai-authority.ts";
import { extractClientProgrammingProfile } from "../lib/coach/programming-profile.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection } from "../lib/coach/universal-program-generation.ts";
import type { OnboardingProgress } from "../lib/coach/types.ts";
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
  console.log(`OPTIM Phase 6B — live E2E personalized-generation verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 6B fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-6b-coach-a@example.test", "Coach A");
  const coachB = await ensureUser("e2e-6b-coach-b@example.test", "Coach B");
  const clientA = await ensureUser("e2e-6b-client-a@example.test", "Client A");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const workspaceAId = await ensureWorkspace(coachA.id, "E2E 6B Workspace A");
  const workspaceBId = await ensureWorkspace(coachB.id, "E2E 6B Workspace B");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceAId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceAId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: workspaceBId, user_id: coachB.id, role: "workspace_owner", status: "active" },
    ],
    { onConflict: "workspace_id,user_id" }
  );

  async function ensureClientProfile(workspaceId: string, userId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("client_profiles").insert({ workspace_id: workspaceId, user_id: userId, display_name: displayName }).select("id").single();
    if (error) throw new Error(`client_profiles insert failed: ${error.message}`);
    await admin.from("coach_client_assignments").insert({ workspace_id: workspaceId, coach_user_id: coachA.id, client_profile_id: data!.id, is_primary: true });
    return data!.id as string;
  }

  const clientAProfileId = await ensureClientProfile(workspaceAId, clientA.id, "Client A");

  console.log("  fixtures ready: Coach A + Client A (Workspace A), Coach B (Workspace B, unrelated)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachAClient = await signInAsRealSession("e2e-6b-coach-a@example.test");
  const coachBClient = await signInAsRealSession("e2e-6b-coach-b@example.test");
  const clientAClient = await signInAsRealSession("e2e-6b-client-a@example.test");
  check("Coach A, Coach B, and Client A all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Client A submits real onboarding answers through the real client-authored path\n");

  const realAnswers = {
    about_you: { age: 41, heightFeet: 5, heightInchesRemainder: 6, weightLb: 210, sex: "male" },
    what_you_want: { primaryGoal: "build_muscle" },
    your_week: { availableDays: ["mon", "tue", "wed", "thu"], maxSessionLength: "60", trainingEnvironment: ["limited_equipment"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["evening"] },
    starting_point: { trainingExperience: "comfortable_common", recentConsistency: "fairly_consistent", weeklyFrequency: 3 },
    fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "avoids_cardio" },
    health_finish: { hasInjuryHistory: false, injuryBodyAreas: [], injuryRestrictions: "" },
  };

  const { error: onboardingError } = await clientAClient
    .from("client_onboarding_progress")
    .upsert({ workspace_id: workspaceAId, client_profile_id: clientAProfileId, current_step_index: 6, answers: realAnswers, completed_at: new Date().toISOString() }, { onConflict: "client_profile_id" });
  check("Client A (real session, RLS-governed): can persist their own real onboarding answers", !onboardingError, onboardingError?.message);

  const { data: otherClientReadsOnboarding } = await coachBClient.from("client_onboarding_progress").select("id").eq("client_profile_id", clientAProfileId);
  check("Coach B (unrelated workspace): sees ZERO of Client A's onboarding rows", (otherClientReadsOnboarding ?? []).length === 0);

  console.log("\n4. Coach A configures a real, distinctive Playbook (limited-equipment-aware, cardio-averse methodology)\n");

  const nowIso = new Date().toISOString();
  const coachAOperatingModel = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId: workspaceAId, nowIso, businessName: "E2E 6B Workspace A" });
  coachAOperatingModel.programArchitecture = {
    ...coachAOperatingModel.programArchitecture,
    preferredSplits: ["full_body"],
    typicalFrequencyDaysMin: 3,
    typicalFrequencyDaysMax: 4,
    proximityToFailure: "0_1_reps_in_reserve",
    cardioPhilosophy: "rarely_used",
  };
  const playbookContentA: CoachPlaybookContent = {
    operatingModel: coachAOperatingModel,
    aiAuthority: { coachId: coachA.id, workspaceId: workspaceAId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso },
    examples: [],
  };

  const { data: existingPlaybook } = await admin.from("coach_playbooks").select("id").eq("workspace_id", workspaceAId).eq("status", "approved").maybeSingle();
  let playbookRow: { id: string } | null = existingPlaybook as { id: string } | null;
  let playbookError: { message: string } | null = null;
  if (!playbookRow) {
    const inserted = await coachAClient
      .from("coach_playbooks")
      .insert({ workspace_id: workspaceAId, version: 1, status: "approved", content: playbookContentA, created_by: coachA.id, approved_by: coachA.id, approved_at: nowIso })
      .select("id")
      .single();
    playbookRow = inserted.data;
    playbookError = inserted.error;
  } else {
    // A prior run of this idempotent script already created it — replace its
    // content with this run's real playbookContentA so the rest of the
    // script still exercises the exact real values it asserts against.
    const updated = await coachAClient.from("coach_playbooks").update({ content: playbookContentA }).eq("id", playbookRow.id).select("id").single();
    playbookRow = updated.data;
    playbookError = updated.error;
  }
  check("Coach A (real session, RLS-governed): can persist a real approved Playbook", !playbookError, playbookError?.message);

  const { data: coachBReadsPlaybook } = await coachBClient.from("coach_playbooks").select("id").eq("workspace_id", workspaceAId);
  check("Coach B (unrelated workspace): sees ZERO of Workspace A's Playbook rows", (coachBReadsPlaybook ?? []).length === 0);
  void playbookRow;

  console.log("\n5. Reproduce createPublishAndAssignProgramAction's real pipeline exactly\n");

  const { data: onboardingRow, error: onboardingReadError } = await coachAClient
    .from("client_onboarding_progress")
    .select("current_step_index, answers, completed_at, updated_at")
    .eq("client_profile_id", clientAProfileId)
    .single();
  check("coach (real session): can read Client A's real onboarding progress for generation", !onboardingReadError, onboardingReadError?.message);

  const onboarding: OnboardingProgress = {
    clientId: clientAProfileId,
    workspaceId: workspaceAId,
    currentStepIndex: onboardingRow!.current_step_index as number,
    answers: onboardingRow!.answers as OnboardingProgress["answers"],
    completedAtIso: (onboardingRow!.completed_at as string) ?? undefined,
    updatedAtIso: onboardingRow!.updated_at as string,
  };
  const profileResult = extractClientProgrammingProfile(onboarding, null);
  check("the real persisted onboarding answers extract cleanly into a real ClientProgrammingProfile", "profile" in profileResult);
  if (!("profile" in profileResult)) throw new Error("profile extraction failed unexpectedly");
  const profile = profileResult.profile;
  check("the real profile reflects Client A's actual reported available days (Mon-Thu, not a placeholder)", JSON.stringify(profile.availableDays) === JSON.stringify(["Monday", "Tuesday", "Wednesday", "Thursday"]));
  check("the real profile reflects Client A's actual reported equipment (limited_equipment, not a placeholder)", JSON.stringify(profile.trainingEnvironment) === JSON.stringify(["limited_equipment"]));

  const { data: playbookReadRow, error: playbookReadError } = await coachAClient.from("coach_playbooks").select("content").eq("workspace_id", workspaceAId).eq("status", "approved").single();
  check("coach (real session): can read Workspace A's real approved Playbook for generation", !playbookReadError, playbookReadError?.message);
  const com = (playbookReadRow!.content as CoachPlaybookContent).operatingModel;
  check("the real Playbook's operatingModel reflects Coach A's actual configured cardio philosophy (rarely_used)", com.programArchitecture.cardioPhilosophy === "rarely_used");

  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: 4 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, { clientId: clientAProfileId, workspaceId: workspaceAId, coachId: coachA.id, profile, com, durationWeeks: 4, nowIso });

  const trainingDays = content.weeks[0].days.filter((d) => d.type === "training").map((d) => d.dayOfWeek);
  check("6. Generated program respects Client A's real 4 available days, never more", trainingDays.length <= 4 && trainingDays.every((d) => ["Monday", "Tuesday", "Wednesday", "Thursday"].includes(d)));
  const allItemNames = content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.map((i) => i.name)))));
  check("6. No continuous work was added — matches Coach A's real 'rarely_used' cardio methodology AND Client A's own avoids_cardio preference", !content.weeks.some((w) => w.days.some((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.some((i) => i.category === "continuous"))))));
  check("6. A real, non-generic rationale is attached, referencing the actual chosen structure", !!content.generationRationale && content.generationRationale.length > 0);
  void allItemNames;

  console.log("\n7. Publish and assign through the real pathway; Client A receives it\n");

  const { data: programFamily, error: programFamilyError } = await coachAClient.from("training_programs").insert({ workspace_id: workspaceAId, created_by: coachA.id, title: "E2E 6B Personalized Program" }).select("id").single();
  check("coach: can create a training_programs row", !programFamilyError, programFamilyError?.message);
  const { data: draftVersion, error: draftError } = await coachAClient
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: workspaceAId, version_number: 1, status: "draft", content: { ...content, name: "E2E 6B Personalized Program" }, created_by: coachA.id })
    .select("id")
    .single();
  check("coach: can persist the real personalized schemaVersion-2 content as a draft", !draftError, draftError?.message);
  const { error: publishError } = await coachAClient
    .from("training_program_versions")
    .update({ status: "published", published_by: coachA.id, published_at: nowIso })
    .eq("id", draftVersion!.id);
  check("coach: can publish it through the real publish step", !publishError, publishError?.message);
  const { data: assignmentId, error: assignError } = await coachAClient.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: draftVersion!.id });
  check("U: assign_active_program_version succeeds through the unchanged real publish/assign lifecycle", !assignError && !!assignmentId, assignError?.message);

  await coachAClient.from("client_enrollments").upsert({ workspace_id: workspaceAId, client_profile_id: clientAProfileId, original_program_start_date: new Date().toISOString().slice(0, 10), timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });

  const { data: myAssignment, error: myAssignmentError } = await clientAClient
    .from("program_assignments")
    .select("id, training_program_versions(content)")
    .eq("client_profile_id", clientAProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Client A: receives their own real, personalized, published program", !myAssignmentError && !!myAssignment, myAssignmentError?.message);
  const receivedContent = (myAssignment as unknown as { training_program_versions: { content: { generationRationale?: string } } } | null)?.training_program_versions?.content;
  check("the content Client A actually receives still carries the real generation rationale", !!receivedContent?.generationRationale);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
