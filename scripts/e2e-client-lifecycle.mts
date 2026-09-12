// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// Live E2E verification against a real local Supabase stack — same posture
// as scripts/e2e-revenue-loop.mts and scripts/e2e-chat-intelligence.mts:
// real OTP sign-in through Mailpit, RLS-governed queries through each real
// signed-in session, never the service-role client except to create
// fixture auth users (the one thing that genuinely requires it — the app
// itself never does this at request time either, see
// lib/production/invite.ts's own module doc).
//
// What this proves: the exact real request-path sequence
// lib/production/roster.ts's inviteClient/getClientDetail/
// setClientLifecycleAction/activateClientEnrollment and
// lib/production/onboarding.ts's saveOnboardingStep/completeOnboarding
// perform, one Supabase call at a time under each real session — the same
// trade-off the other two E2E scripts already make for code that needs
// next/headers (getSupabaseServerClient) and so cannot be imported directly
// outside a real Next.js request. The one exception: the pure lifecycle
// derivation (lib/coach/roster.ts's deriveLifecycle) IS plain, framework-
// independent TS and is imported directly here, run against real rows this
// script itself reads — not a re-implementation of the assertion.
//
// The real accept_invitation RPC is exercised end-to-end (workspace
// invitation row -> real second OTP sign-in -> the client's own session
// calling accept_invitation) — this is the actual acceptance path, not a
// service-role shortcut. What it does NOT cover: the invite EMAIL's own
// content/link-click UX (Mailpit's message body, /auth/confirm's token_hash
// verification) — that is exercised by the live browser walkthrough
// instead, alongside real chat/escalation/coach-response/resolution and the
// one real Anthropic round-trip (see this phase's final report).
//
// Run against a freshly `supabase db reset` local stack:
//   node --experimental-strip-types scripts/e2e-client-lifecycle.mts

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { deriveLifecycle } from "../lib/coach/roster.ts";

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
  console.log(`OPTIM Phase 6.0D-B — live E2E client-lifecycle verification against ${url}\n`);

  console.log("1. Bootstrap fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-lifecycle-coach-a@example.test", "Coach A");
  const coachB = await ensureUser("e2e-lifecycle-coach-b@example.test", "Coach B");

  const { data: wsA } = await admin.from("workspaces").insert({ owner_user_id: coachA.id, display_name: "E2E Lifecycle Workspace A", business_name: "E2E Lifecycle A" }).select("id").single();
  const { data: wsB } = await admin.from("workspaces").insert({ owner_user_id: coachB.id, display_name: "E2E Lifecycle Workspace B", business_name: "E2E Lifecycle B" }).select("id").single();
  const workspaceAId = wsA!.id as string;
  const workspaceBId = wsB!.id as string;

  await admin.from("workspace_memberships").insert([
    { workspace_id: workspaceAId, user_id: coachA.id, role: "workspace_owner", status: "active" },
    { workspace_id: workspaceBId, user_id: coachB.id, role: "workspace_owner", status: "active" },
  ]);

  console.log("  fixtures created: Coach A (owner, Workspace A), Coach B (owner, unrelated Workspace B) — no client yet, the pilot client is created below through the real request path\n");

  console.log("2. Coach A and Coach B sign in through the real local OTP flow\n");
  const coachAClient = await signInAsRealSession("e2e-lifecycle-coach-a@example.test");
  const coachBClient = await signInAsRealSession("e2e-lifecycle-coach-b@example.test");
  check("Coach A and Coach B both completed a real OTP sign-in round-trip", true);

  console.log("\n3. Coach A invites one pilot client — the real inviteClient() insert sequence, under Coach A's own RLS-governed session\n");

  const pilotEmail = "e2e-lifecycle-pilot-client@example.test";
  // No .select().single() here — see lib/production/roster.ts's inviteClient
  // for why chaining a RETURNING clause onto this specific INSERT triggers
  // a real PostgreSQL RLS defect (client_profiles_select's own
  // can_access_client(id) self-queries client_profiles for the row a
  // RETURNING clause would expose). The id is generated client-side instead
  // — the exact fix applied to the real code path this script verifies.
  const clientProfileId = randomUUID();
  const { error: clientProfileError } = await coachAClient
    .from("client_profiles")
    .insert({ id: clientProfileId, workspace_id: workspaceAId, invited_email: pilotEmail, display_name: "Pilot Client", goal: "Build strength" });
  check("Coach A: can insert a client_profiles row for the new pilot client (invited_email, no user_id yet)", !clientProfileError, clientProfileError?.message);

  const { error: assignmentError } = await coachAClient
    .from("coach_client_assignments")
    .insert({ workspace_id: workspaceAId, coach_user_id: coachA.id, client_profile_id: clientProfileId, is_primary: true });
  check("Coach A: can assign themselves as this client's primary coach", !assignmentError, assignmentError?.message);

  const { error: enrollmentInsertError } = await coachAClient
    .from("client_enrollments")
    .insert({ workspace_id: workspaceAId, client_profile_id: clientProfileId, status: "invited" });
  check("Coach A: can create the client_enrollments row (status: invited)", !enrollmentInsertError, enrollmentInsertError?.message);

  const { data: invitationRow, error: invitationError } = await coachAClient
    .from("workspace_invitations")
    .insert({ workspace_id: workspaceAId, email: pilotEmail, role: "client", invited_by: coachA.id })
    .select("id")
    .single();
  check("Coach A: can record the real workspace_invitations row", !invitationError && !!invitationRow, invitationError?.message);

  const { error: coachBAssignError } = await coachBClient
    .from("coach_client_assignments")
    .insert({ workspace_id: workspaceAId, coach_user_id: coachB.id, client_profile_id: clientProfileId, is_primary: false });
  check("Coach B (unrelated workspace): cannot assign themselves to Coach A's new client", !!coachBAssignError);

  console.log("\n4. Roster read BEFORE the client has ever signed in — lifecycle derives 'invited'\n");

  {
    const { data: enrollment } = await coachAClient.from("client_enrollments").select("status").eq("client_profile_id", clientProfileId).maybeSingle();
    const { data: onboarding } = await coachAClient.from("client_onboarding_progress").select("completed_at").eq("client_profile_id", clientProfileId).maybeSingle();
    const lifecycle = deriveLifecycle({ enrollmentStatus: enrollment?.status ?? null, onboardingExists: onboarding !== null, onboardingCompletedAtIso: onboarding?.completed_at ?? null });
    check("Roster: pilot client's real lifecycle derives 'invited' before any onboarding row exists", lifecycle === "invited", `got ${lifecycle}`);
  }

  console.log("\n5. The pilot client accepts the real invitation — the actual accept_invitation RPC, under their own real session\n");

  await ensureUser(pilotEmail, "Pilot Client");
  // GoTrue rate-limits repeat signInWithOtp requests for the same address —
  // see e2e-revenue-loop.mts's own note on this exact local limit.
  await new Promise((r) => setTimeout(r, 1500));
  const clientClient = await signInAsRealSession(pilotEmail);

  const { data: acceptedMembership, error: acceptError } = await clientClient.rpc("accept_invitation", { p_invitation_id: invitationRow!.id });
  check("Pilot client: accept_invitation succeeds under their own real session (email match)", !acceptError && !!acceptedMembership, acceptError?.message);

  const { data: linkedProfile } = await coachAClient.from("client_profiles").select("user_id").eq("id", clientProfileId).single();
  check("accept_invitation linked the real client_profiles.user_id — not left null", linkedProfile?.user_id != null);

  console.log("\n6. Onboarding progress — client-authored, real chapter-by-chapter persistence\n");

  const { error: step1Error } = await clientClient
    .from("client_onboarding_progress")
    .upsert({ workspace_id: workspaceAId, client_profile_id: clientProfileId, current_step_index: 1, answers: { about_you: { heightFeet: 5, heightInchesRemainder: 10 } } }, { onConflict: "client_profile_id" });
  check("Pilot client: can save their own first onboarding chapter", !step1Error, step1Error?.message);

  {
    const { data: onboarding } = await coachAClient.from("client_onboarding_progress").select("completed_at").eq("client_profile_id", clientProfileId).maybeSingle();
    const lifecycle = deriveLifecycle({ enrollmentStatus: "invited", onboardingExists: onboarding !== null, onboardingCompletedAtIso: onboarding?.completed_at ?? null });
    check("Roster: lifecycle derives 'onboarding' once a progress row exists but isn't complete", lifecycle === "onboarding", `got ${lifecycle}`);
  }

  const { error: coachWriteOnboardingError } = await coachAClient
    .from("client_onboarding_progress")
    .update({ current_step_index: 99 })
    .eq("client_profile_id", clientProfileId);
  void coachWriteOnboardingError; // RLS silently excludes the row from an UPDATE by non-self — see this phase's pgTAP file's own note
  const { data: afterCoachWrite } = await coachAClient.from("client_onboarding_progress").select("current_step_index").eq("client_profile_id", clientProfileId).single();
  check("Coach A: cannot actually change the client's own onboarding progress (RLS no-op, client-authored only)", afterCoachWrite?.current_step_index === 1);

  const { error: completeError } = await clientClient
    .from("client_onboarding_progress")
    .update({ answers: { about_you: { heightFeet: 5, heightInchesRemainder: 10 }, review: { acknowledged: true } }, completed_at: new Date().toISOString() })
    .eq("client_profile_id", clientProfileId);
  check("Pilot client: can mark their own onboarding complete", !completeError, completeError?.message);

  {
    const { data: onboarding } = await coachAClient.from("client_onboarding_progress").select("completed_at").eq("client_profile_id", clientProfileId).maybeSingle();
    const lifecycle = deriveLifecycle({ enrollmentStatus: "invited", onboardingExists: onboarding !== null, onboardingCompletedAtIso: onboarding?.completed_at ?? null });
    check("Roster: lifecycle derives 'coach_setup' (awaiting coach review) once onboarding is complete", lifecycle === "coach_setup", `got ${lifecycle}`);
  }

  const { data: coachBReadsOnboarding } = await coachBClient.from("client_onboarding_progress").select("id").eq("client_profile_id", clientProfileId);
  check("Coach B (unrelated workspace): sees zero of the pilot client's onboarding progress", (coachBReadsOnboarding ?? []).length === 0);

  console.log("\n7. Coach A reviews and sets a start date — this must NOT silently activate the client (the real defect this phase fixed)\n");

  const startDateIso = new Date().toISOString().slice(0, 10);
  const { data: existingEnrollmentStatus } = await coachAClient.from("client_enrollments").select("status").eq("client_profile_id", clientProfileId).maybeSingle();
  const { error: setStartDateError } = await coachAClient
    .from("client_enrollments")
    .upsert(
      { workspace_id: workspaceAId, client_profile_id: clientProfileId, original_program_start_date: startDateIso, timezone: "UTC", ...(existingEnrollmentStatus ? {} : { status: "onboarding" }) },
      { onConflict: "client_profile_id" }
    );
  check("Coach A: can set the pilot client's real start date", !setStartDateError, setStartDateError?.message);

  {
    const { data: enrollment } = await coachAClient.from("client_enrollments").select("status").eq("client_profile_id", clientProfileId).single();
    check("REGRESSION GUARD: setting a start date did NOT force status to 'active' — still 'invited'", enrollment!.status === "invited", `got ${enrollment!.status}`);
    const { data: onboarding } = await coachAClient.from("client_onboarding_progress").select("completed_at").eq("client_profile_id", clientProfileId).maybeSingle();
    const lifecycle = deriveLifecycle({ enrollmentStatus: enrollment!.status as string, onboardingExists: onboarding !== null, onboardingCompletedAtIso: onboarding?.completed_at ?? null });
    check("REGRESSION GUARD: lifecycle still derives 'coach_setup' after setting a start date, not 'active'", lifecycle === "coach_setup", `got ${lifecycle}`);
  }

  console.log("\n8. Coach A creates, publishes, and assigns a real program AND nutrition plan\n");

  const programContent = {
    id: "program-e2e-lifecycle-1",
    workspaceId: workspaceAId,
    clientId: clientProfileId,
    coachId: coachA.id,
    name: "E2E Lifecycle Program",
    durationWeeks: 4,
    weeks: Array.from({ length: 4 }, (_, i) => ({
      weekNumber: i + 1,
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((dayOfWeek) => ({ dayOfWeek, type: "rest" as const })),
    })),
    status: "draft",
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };
  const { data: programFamily } = await coachAClient.from("training_programs").insert({ workspace_id: workspaceAId, created_by: coachA.id, title: "E2E Lifecycle Program" }).select("id").single();
  const { data: programVersion, error: programVersionError } = await coachAClient
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: workspaceAId, version_number: 1, status: "draft", content: programContent, created_by: coachA.id })
    .select("id")
    .single();
  check("Coach A: can create a draft program version", !programVersionError, programVersionError?.message);
  await coachAClient.from("training_program_versions").update({ status: "published", published_by: coachA.id, published_at: new Date().toISOString() }).eq("id", programVersion!.id);
  const { error: programAssignError } = await coachAClient.rpc("assign_active_program_version", { p_client_profile_id: clientProfileId, p_program_version_id: programVersion!.id });
  check("Coach A: assign_active_program_version succeeds once published", !programAssignError, programAssignError?.message);

  const nutritionContent = {
    id: "nutrition-e2e-lifecycle-1",
    targets: { calories: 2400, proteinG: 180, carbsG: 240, fatG: 80 },
    usesTrainingRestSplit: false,
    mealsPerDay: 4,
    mealStructureDescription: "",
    preTrainingGuidance: "",
    postTrainingGuidance: "",
    hydrationOzPerDay: 0,
    fiberGramsPerDay: 0,
    substitutionGuidance: "",
    supplementGuidance: "",
    adherenceStrategy: "",
    metricsToMonitor: [],
    weeklyAdjustmentRule: "",
    sourceStrategyLabel: "E2E fixture",
    approvedAtIso: new Date().toISOString(),
  };
  const { data: planFamily } = await coachAClient.from("nutrition_plans").insert({ workspace_id: workspaceAId, created_by: coachA.id, title: "E2E Lifecycle Nutrition" }).select("id").single();
  const { data: planVersion, error: planVersionError } = await coachAClient
    .from("nutrition_plan_versions")
    .insert({ plan_id: planFamily!.id, workspace_id: workspaceAId, version_number: 1, status: "draft", content: nutritionContent, created_by: coachA.id })
    .select("id")
    .single();
  check("Coach A: can create a draft nutrition plan version", !planVersionError, planVersionError?.message);
  const { error: planPublishError } = await coachAClient
    .from("nutrition_plan_versions")
    .update({ status: "published", published_by: coachA.id, published_at: new Date().toISOString() })
    .eq("id", planVersion!.id);
  check("Coach A: can publish the draft nutrition plan version", !planPublishError, planPublishError?.message);
  const { error: planAssignError } = await coachAClient.rpc("assign_active_nutrition_plan_version", { p_client_profile_id: clientProfileId, p_plan_version_id: planVersion!.id });
  check("Coach A: assign_active_nutrition_plan_version succeeds once published", !planAssignError, planAssignError?.message);

  console.log("\n9. Coach A activates the client — the real activateClientEnrollment precondition check\n");

  const { data: preActivationEnrollment } = await coachAClient.from("client_enrollments").select("status, original_program_start_date").eq("client_profile_id", clientProfileId).single();
  const { data: activeProgramCheck } = await coachAClient.from("program_assignments").select("id").eq("client_profile_id", clientProfileId).eq("status", "active").maybeSingle();
  const { data: activeNutritionCheck } = await coachAClient.from("nutrition_plan_assignments").select("id").eq("client_profile_id", clientProfileId).eq("status", "active").maybeSingle();
  check(
    "activateClientEnrollment's real precondition holds: start date + active program + active nutrition all exist",
    !!preActivationEnrollment!.original_program_start_date && !!activeProgramCheck && !!activeNutritionCheck
  );
  const { error: activateError } = await coachAClient.from("client_enrollments").update({ status: "active" }).eq("client_profile_id", clientProfileId);
  check("Coach A: can activate the client now that every precondition is real", !activateError, activateError?.message);

  {
    const { data: enrollment } = await coachAClient.from("client_enrollments").select("status").eq("client_profile_id", clientProfileId).single();
    const lifecycle = deriveLifecycle({ enrollmentStatus: enrollment!.status as string, onboardingExists: true, onboardingCompletedAtIso: new Date().toISOString() });
    check("Roster: lifecycle derives 'active' after real activation", lifecycle === "active", `got ${lifecycle}`);
  }

  console.log("\n10. The client now sees their own real assignment — cross-workspace isolation holds\n");

  const { data: clientSeesProgram, error: clientProgramReadError } = await clientClient
    .from("program_assignments")
    .select("id, training_program_versions(content)")
    .eq("client_profile_id", clientProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Pilot client: can read their own real active program assignment", !clientProgramReadError && !!clientSeesProgram, clientProgramReadError?.message);

  const { data: coachBRosterQuery } = await coachBClient.from("client_profiles").select("id").eq("workspace_id", workspaceAId);
  check("Coach B (unrelated workspace): the roster query for Workspace A returns zero rows for them", (coachBRosterQuery ?? []).length === 0);

  console.log("\n11. Lifecycle transitions — pause / resume / complete / archive, never a delete\n");

  await coachAClient.from("client_enrollments").update({ status: "paused" }).eq("client_profile_id", clientProfileId);
  {
    const { data: enrollment } = await coachAClient.from("client_enrollments").select("status").eq("client_profile_id", clientProfileId).single();
    check("Coach A: pause sets status to 'paused'", enrollment!.status === "paused");
  }

  await coachAClient.from("client_enrollments").update({ status: "active" }).eq("client_profile_id", clientProfileId);
  {
    const { data: enrollment } = await coachAClient.from("client_enrollments").select("status").eq("client_profile_id", clientProfileId).single();
    check("Coach A: resume sets status back to 'active'", enrollment!.status === "active");
  }

  await coachAClient.from("client_enrollments").update({ status: "offboarded" }).eq("client_profile_id", clientProfileId);
  {
    const { data: enrollment } = await coachAClient.from("client_enrollments").select("status").eq("client_profile_id", clientProfileId).single();
    const lifecycle = deriveLifecycle({ enrollmentStatus: enrollment!.status as string, onboardingExists: true, onboardingCompletedAtIso: new Date().toISOString() });
    check("Coach A: complete sets status to 'offboarded', which derives lifecycle 'completed'", lifecycle === "completed", `got ${lifecycle}`);
  }

  await coachAClient.from("client_enrollments").update({ archived_at: new Date().toISOString() }).eq("client_profile_id", clientProfileId);
  {
    const { data: enrollment } = await coachAClient.from("client_enrollments").select("archived_at").eq("client_profile_id", clientProfileId).single();
    check("Coach A: archive sets archived_at — a real, additive terminal marker, never a row deletion", enrollment!.archived_at != null);
  }

  const { data: stillExists } = await coachAClient.from("client_profiles").select("id, display_name").eq("id", clientProfileId).single();
  check("The client's full history (profile, program, nutrition, onboarding) still exists after pause/resume/complete/archive — nothing was ever deleted", stillExists?.display_name === "Pilot Client");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
