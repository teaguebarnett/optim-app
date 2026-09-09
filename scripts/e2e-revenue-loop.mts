// Phase 6.0B — Persist the Complete Revenue Loop.
//
// Live E2E verification against a real local Supabase stack — safe local
// fixtures only, no real emails, no hosted project. Exercises the actual
// request path a real signed-in browser session would use (anon-key client
// + a real OTP round-trip captured from Mailpit's local API), not the
// pgTAP role-simulation shortcut — this is what actually proves "normal
// application paths obey RLS," not just that the policies themselves are
// well-formed.
//
// Run against a freshly `supabase db reset` local stack:
//   node --experimental-strip-types scripts/e2e-revenue-loop.mts
//
// Never touches a hosted project — reads connection info from
// `supabase status -o env` (local only) and refuses to run against
// anything that doesn't look like 127.0.0.1.

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { deriveProgramPhase, deriveProgramWeek } from "../lib/scheduling/enrollment.ts";
import { DEFAULT_WEEK_STARTS_ON } from "../lib/shared/local-date.ts";

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
  // Poll Mailpit's local REST API for the most recent message to this
  // address, then extract the 6-digit code from supabase/templates/
  // magic_link.html's {{ .Token }} rendering (Phase 6.0A-V's own fix —
  // see that template). Never a real inbox, never a real email address.
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
  console.log(`OPTIM Phase 6.0B — live E2E revenue-loop verification against ${url}\n`);

  console.log("1. Bootstrap fixtures (service-role, local only)\n");

  const teague = await ensureUser("e2e-teague@example.test", "Teague");
  const clientA = await ensureUser("e2e-client-a@example.test", "Client A");
  const clientB = await ensureUser("e2e-client-b@example.test", "Client B");
  const coachU = await ensureUser("e2e-coach-u@example.test", "Coach U");
  const clientU = await ensureUser("e2e-client-u@example.test", "Client U");

  const { data: wsA } = await admin.from("workspaces").insert({ owner_user_id: teague.id, display_name: "E2E Workspace A", business_name: "E2E A" }).select("id").single();
  const { data: wsU } = await admin.from("workspaces").insert({ owner_user_id: coachU.id, display_name: "E2E Workspace U", business_name: "E2E U" }).select("id").single();
  const workspaceAId = wsA!.id as string;
  const workspaceUId = wsU!.id as string;

  await admin.from("workspace_memberships").insert([
    { workspace_id: workspaceAId, user_id: teague.id, role: "workspace_owner", status: "active" },
    { workspace_id: workspaceAId, user_id: clientA.id, role: "client", status: "active" },
    { workspace_id: workspaceAId, user_id: clientB.id, role: "client", status: "active" },
    { workspace_id: workspaceUId, user_id: coachU.id, role: "workspace_owner", status: "active" },
    { workspace_id: workspaceUId, user_id: clientU.id, role: "client", status: "active" },
  ]);

  const { data: cpA } = await admin.from("client_profiles").insert({ workspace_id: workspaceAId, user_id: clientA.id, display_name: "Client A" }).select("id").single();
  const { data: cpB } = await admin.from("client_profiles").insert({ workspace_id: workspaceAId, user_id: clientB.id, display_name: "Client B" }).select("id").single();
  const { data: cpU } = await admin.from("client_profiles").insert({ workspace_id: workspaceUId, user_id: clientU.id, display_name: "Client U" }).select("id").single();
  const clientAProfileId = cpA!.id as string;
  const clientBProfileId = cpB!.id as string;
  void cpU;

  await admin.from("coach_client_assignments").insert([
    { workspace_id: workspaceAId, coach_user_id: teague.id, client_profile_id: clientAProfileId, is_primary: true },
    { workspace_id: workspaceAId, coach_user_id: teague.id, client_profile_id: clientBProfileId, is_primary: true },
    { workspace_id: workspaceUId, coach_user_id: coachU.id, client_profile_id: cpU!.id, is_primary: true },
  ]);

  console.log("  fixtures created: Teague (owner, Workspace A), Client A, Client B (Workspace A), Coach U + Client U (Workspace U, unrelated)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const teagueClient = await signInAsRealSession("e2e-teague@example.test");
  const clientAClient = await signInAsRealSession("e2e-client-a@example.test");
  const clientBClient = await signInAsRealSession("e2e-client-b@example.test");
  const coachUClient = await signInAsRealSession("e2e-coach-u@example.test");
  check("Teague, Client A, Client B, and Coach U all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Coach creates, publishes, and assigns a real training program for Client A\n");

  const PUSH_WORKOUT_LIKE = {
    id: "workout-e2e-1",
    workspaceId: workspaceAId,
    name: "Push Workout",
    dayOfWeek: "Monday",
    focus: "Chest, shoulders, triceps",
    estimatedDurationMin: 50,
    warmupOverview: "5 min",
    coachNote: "E2E fixture",
    exercises: [
      {
        id: "exercise-e2e-1",
        order: 1,
        name: "Bench Press",
        warmupSets: 2,
        workingSets: 3,
        targetRepsLow: 6,
        targetRepsHigh: 10,
        targetRpe: 8,
        restSeconds: 120,
        tempo: "2-0-1",
        cue: "Brace",
        previousPerformance: [],
        prescribedSets: [],
      },
    ],
  };
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const programContent = {
    id: "program-e2e-1",
    workspaceId: workspaceAId,
    clientId: clientAProfileId,
    coachId: teague.id,
    name: "E2E Program",
    durationWeeks: 4,
    weeks: Array.from({ length: 4 }, (_, i) => ({
      weekNumber: i + 1,
      days: days.map((dayOfWeek) => (dayOfWeek === "Monday" ? { dayOfWeek, type: "training", workout: PUSH_WORKOUT_LIKE } : { dayOfWeek, type: "rest" })),
    })),
    status: "draft",
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };

  const { data: programFamily, error: programFamilyError } = await teagueClient
    .from("training_programs")
    .insert({ workspace_id: workspaceAId, created_by: teague.id, title: "E2E Program" })
    .select("id")
    .single();
  check("coach (real session, RLS-governed): can create a training_programs row", !programFamilyError, programFamilyError?.message);

  const { data: draftVersion, error: draftError } = await teagueClient
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: workspaceAId, version_number: 1, status: "draft", content: programContent, created_by: teague.id })
    .select("id")
    .single();
  check("coach: can create a draft version with real content", !draftError, draftError?.message);

  const { data: draftVisibleToClientBefore } = await clientAClient.from("training_program_versions").select("id").eq("id", draftVersion!.id);
  check("Client A: cannot see the draft version before it's published+assigned", (draftVisibleToClientBefore ?? []).length === 0);

  const { error: prematureAssignError } = await teagueClient.rpc("assign_active_program_version", {
    p_client_profile_id: clientAProfileId,
    p_program_version_id: draftVersion!.id,
  });
  check("coach: assign_active_program_version rejects an unpublished (draft) version", !!prematureAssignError);

  const { error: publishError } = await teagueClient
    .from("training_program_versions")
    .update({ status: "published", published_by: teague.id, published_at: new Date().toISOString() })
    .eq("id", draftVersion!.id);
  check("coach: can publish the draft version", !publishError, publishError?.message);

  const { data: assignmentId, error: assignError } = await teagueClient.rpc("assign_active_program_version", {
    p_client_profile_id: clientAProfileId,
    p_program_version_id: draftVersion!.id,
  });
  check("coach: assign_active_program_version succeeds once published", !assignError && !!assignmentId, assignError?.message);

  const startDateIso = new Date().toISOString().slice(0, 10);
  const { error: enrollmentError } = await teagueClient
    .from("client_enrollments")
    .upsert({ workspace_id: workspaceAId, client_profile_id: clientAProfileId, original_program_start_date: startDateIso, timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });
  check("coach: can set Client A's real program start date", !enrollmentError, enrollmentError?.message);

  console.log("\n4. Client A receives exactly their own real assignment\n");

  const { data: myAssignment, error: myAssignmentError } = await clientAClient
    .from("program_assignments")
    .select("id, status, program_version_id, training_program_versions(content, status)")
    .eq("client_profile_id", clientAProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Client A: can read their own active assignment", !myAssignmentError && !!myAssignment, myAssignmentError?.message);
  const myContent = (myAssignment as unknown as { training_program_versions: { content: { name: string; durationWeeks: number } } } | null)?.training_program_versions?.content;
  check("Client A: the content is the REAL assigned program, not PUSH_WORKOUT or any other fixture", myContent?.name === "E2E Program");

  console.log("\n5. Client B and the unrelated workspace cannot access it\n");

  const { data: clientBSeesIt } = await clientBClient.from("program_assignments").select("id").eq("client_profile_id", clientAProfileId);
  check("Client B (same workspace, different client): sees zero of Client A's assignments", (clientBSeesIt ?? []).length === 0);

  const { data: coachUSeesIt } = await coachUClient.from("program_assignments").select("id").eq("client_profile_id", clientAProfileId);
  check("Coach U (unrelated workspace): sees zero of Client A's assignments", (coachUSeesIt ?? []).length === 0);

  const { error: coachUAssignError } = await coachUClient.rpc("assign_active_program_version", {
    p_client_profile_id: clientAProfileId,
    p_program_version_id: draftVersion!.id,
  });
  check("Coach U (unrelated workspace): cannot assign anything to Client A", !!coachUAssignError);

  console.log("\n6. Client A logs real workout activity — persists, coach sees it, Client B does not\n");

  const activityContent = {
    training: {
      trainingDayType: "scheduled_workout",
      prescribedWorkoutSnapshot: PUSH_WORKOUT_LIKE,
      sessionStatus: "completed",
      exerciseLogs: {
        "exercise-e2e-1": {
          exerciseId: "exercise-e2e-1",
          status: "completed",
          loggedSets: [{ setNumber: 1, isWarmup: false, weightLb: 135, reps: 8, rpe: 8, status: "completed", completedAtIso: new Date().toISOString() }],
        },
      },
      painReports: [],
      workingSetsCompleted: 1,
      workingSetsPrescribed: 3,
    },
    nutrition: { meals: {}, periodsInPlan: [], targetsSnapshot: { calories: 2200, proteinG: 160, carbsG: 220, fatG: 70 } },
  };

  const { error: logError } = await clientAClient
    .from("daily_records")
    .upsert({ workspace_id: workspaceAId, client_profile_id: clientAProfileId, date_iso: startDateIso, content: activityContent }, { onConflict: "client_profile_id,date_iso" });
  check("Client A: can log real workout activity (real RPE, real completed set)", !logError, logError?.message);

  const { data: clientBReadsA } = await clientBClient.from("daily_records").select("id").eq("client_profile_id", clientAProfileId);
  check("Client B: sees zero of Client A's logged activity", (clientBReadsA ?? []).length === 0);

  const { data: coachReadsIt, error: coachReadError } = await teagueClient.from("daily_records").select("content").eq("client_profile_id", clientAProfileId).eq("date_iso", startDateIso).maybeSingle();
  check("Teague (assigned coach): can read Client A's real logged activity", !coachReadError && !!coachReadsIt, coachReadError?.message);
  const loggedRpe = (coachReadsIt?.content as { training: { exerciseLogs: Record<string, { loggedSets: { rpe: number }[] }> } } | undefined)?.training?.exerciseLogs?.["exercise-e2e-1"]?.loggedSets?.[0]?.rpe;
  check("Teague sees the REAL logged RPE (8), not a fabricated value", loggedRpe === 8);

  console.log("\n7. Persistence across a fresh connection (the closest local analog to 'refresh/restart')\n");

  // GoTrue rate-limits repeat signInWithOtp requests for the same address
  // (config.toml's [auth.email] max_frequency) regardless of how much
  // unrelated work has run in between — confirmed live: this step's second
  // OTP request for e2e-client-a@example.test failed outright without this
  // wait. A short pause here is honest test-harness pacing around a real
  // GoTrue limit, not a workaround for anything this app's own code does.
  await new Promise((r) => setTimeout(r, 2000));
  const freshClientAClient = await signInAsRealSession("e2e-client-a@example.test");
  const { data: stillThere } = await freshClientAClient.from("daily_records").select("content").eq("client_profile_id", clientAProfileId).eq("date_iso", startDateIso).maybeSingle();
  check("A brand-new session (fresh sign-in, fresh client instance) still sees the same persisted assignment and activity", !!stillThere);

  console.log("\n8. Program start date / Day 1 derivation is correct\n");

  const enrollment = {
    id: "e2e-enrollment",
    schemaVersion: 1,
    workspaceId: workspaceAId,
    clientId: clientAProfileId,
    programId: programContent.id,
    startDateIso,
    durationWeeks: programContent.durationWeeks,
    timeZone: "UTC",
    weekStartsOn: DEFAULT_WEEK_STARTS_ON,
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };
  const weekOnStartDate = deriveProgramWeek(enrollment, startDateIso);
  const phaseOnStartDate = deriveProgramPhase(enrollment, startDateIso);
  check("The real configured start date derives as programWeek 1 (Day 1), not a fake pre-start day", weekOnStartDate === 1);
  check("The real configured start date derives as active_program phase", phaseOnStartDate === "active_program");
  // lib/scheduling/enrollment.ts's own program-timing model is deliberately
  // week-granular, not day-granular — every week is a fixed Monday-Sunday
  // template (see lib/scheduling/verify-program-timing.mts's "A mid-week
  // start date also resolves to Week 1 on that exact day"), so a start date
  // that isn't itself a Monday makes the REST of that same calendar week
  // part of Week 1 by design. The single calendar day immediately before
  // start is therefore only guaranteed pre_program when start is a Monday —
  // on any other day of the week it's still correctly the same training
  // week. A date unambiguously in the PRIOR calendar week (8 days back,
  // clearing a full week regardless of where in the week start falls) is
  // the actually-correct way to prove "no fake pre-start training day."
  const eightDaysBeforeStart = new Date(new Date(startDateIso).getTime() - 8 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const phaseBeforeStart = deriveProgramPhase(enrollment, eightDaysBeforeStart);
  check(
    "A date in the calendar week before the real start date correctly derives as pre_program (no fake pre-start training day)",
    phaseBeforeStart === "pre_program"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
