// Phase 6A — Serve Universal Programs to Live Clients.
//
// Live E2E verification against a real local Supabase stack — same posture
// as scripts/e2e-revenue-loop.mts (real OTP sign-in through Mailpit,
// RLS-governed queries through each real signed-in session, service-role
// only to create fixture auth users). This proves the exact real request
// path a real signed-in client hits: a coach creates/publishes/assigns a
// REAL schemaVersion-2 program (generated through the actual Phase 5
// pipeline, not a hand-typed fixture) via the real training_program_versions
// insert + assign_active_program_version RPC, and the real signed-in client
// reads it back and resolves it through this phase's new pure functions
// (resolveUniversalProgramContent, resolveScheduledSessionForStart) against
// the REAL fetched row — never a mocked Supabase response.
//
// What this does NOT cover (by the same trade-off e2e-revenue-loop.mts
// documents): app/actions/production-programs.ts itself cannot be imported
// here (it needs next/headers) — this script re-runs the same real query
// sequence lib/production/programs.ts's getClientProgramContext performs,
// one Supabase call at a time, then feeds the result through the real,
// directly-importable pure resolvers those actions call. See
// lib/workout/verify-universal-client-execution.mts for the full live
// engine (pain/skip/continuous transition) proof — this script's job is
// specifically the real DB round-trip and RLS/version safety.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-6a-* fixtures):
//   node --experimental-strip-types scripts/e2e-universal-program-execution.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { resolveUniversalProgramContent } from "../lib/training/legacy-adapter.ts";
import { resolveScheduledSessionForStart } from "../lib/workout/resolve-scheduled-session.ts";
import { buildProgramEnrollmentForClient } from "../lib/scheduling/enrollment.ts";
import type { ClientProgrammingProfile } from "../lib/coach/programming-profile.ts";
import type { DayOfWeek } from "../lib/types.ts";

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
  console.log(`OPTIM Phase 6A — live E2E universal-program-execution verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 6A fixtures (service-role, local only)\n");

  const teague = await ensureUser("e2e-6a-teague@example.test", "Teague 6A");
  const clientMixed = await ensureUser("e2e-6a-client-mixed@example.test", "Client Mixed");
  const clientOther = await ensureUser("e2e-6a-client-other@example.test", "Client Other");

  let workspaceId: string;
  const { data: existingWs } = await admin.from("workspaces").select("id").eq("owner_user_id", teague.id).eq("display_name", "E2E 6A Workspace").maybeSingle();
  if (existingWs) {
    workspaceId = existingWs.id as string;
  } else {
    const { data: ws, error: wsError } = await admin.from("workspaces").insert({ owner_user_id: teague.id, display_name: "E2E 6A Workspace", business_name: "E2E 6A" }).select("id").single();
    if (wsError) throw new Error(`workspace insert failed: ${wsError.message}`);
    workspaceId = ws!.id as string;
    await admin.from("workspace_memberships").insert([
      { workspace_id: workspaceId, user_id: teague.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: clientMixed.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientOther.id, role: "client", status: "active" },
    ]);
  }

  async function ensureClientProfile(userId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("client_profiles").insert({ workspace_id: workspaceId, user_id: userId, display_name: displayName }).select("id").single();
    if (error) throw new Error(`client_profiles insert failed: ${error.message}`);
    await admin.from("coach_client_assignments").insert({ workspace_id: workspaceId, coach_user_id: teague.id, client_profile_id: data!.id, is_primary: true });
    return data!.id as string;
  }

  const clientMixedProfileId = await ensureClientProfile(clientMixed.id, "Client Mixed");
  await ensureClientProfile(clientOther.id, "Client Other");

  console.log("  fixtures ready: Teague (owner), Client Mixed, Client Other (same workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const teagueClient = await signInAsRealSession("e2e-6a-teague@example.test");
  const clientMixedClient = await signInAsRealSession("e2e-6a-client-mixed@example.test");
  const clientOtherClient = await signInAsRealSession("e2e-6a-client-other@example.test");
  check("Teague, Client Mixed, and Client Other all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Generate a REAL mixed resistance + continuous schemaVersion-2 program (the actual Phase 5 pipeline)\n");

  const nowIso = new Date().toISOString();
  const com = createDefaultCoachOperatingModel({ coachId: teague.id, workspaceId, nowIso, businessName: "E2E 6A Studio" });
  const availableDays: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const profile: ClientProgrammingProfile = { ...buildPlaceholderProgrammingProfile(availableDays), cardioPreference: "enjoys_cardio" };
  const comWithCap: typeof com = { ...com, programArchitecture: { ...com.programArchitecture, typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 } };
  const directions = generateProgramDirectionSummaries({ profile, com: comWithCap, durationWeeks: 2 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, {
    clientId: clientMixedProfileId,
    workspaceId,
    coachId: teague.id,
    profile,
    com: comWithCap,
    durationWeeks: 2,
    nowIso,
  });
  const hasResistance = content.weeks.some((w) => w.days.some((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.some((i) => i.category === "resistance")))));
  const hasContinuous = content.weeks.some((w) => w.days.some((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.some((i) => i.category === "continuous")))));
  check("generated program contains real resistance content", hasResistance);
  check("generated program contains real continuous content (not resistance-only)", hasContinuous);

  console.log("\n4. Coach creates, publishes, and assigns this REAL program to Client Mixed\n");

  const { data: programFamily, error: programFamilyError } = await teagueClient
    .from("training_programs")
    .insert({ workspace_id: workspaceId, created_by: teague.id, title: content.name })
    .select("id")
    .single();
  check("coach (real session, RLS-governed): can create a training_programs row", !programFamilyError, programFamilyError?.message);

  const { data: draftVersion, error: draftError } = await teagueClient
    .from("training_program_versions")
    .insert({ program_id: programFamily!.id, workspace_id: workspaceId, version_number: 1, status: "draft", content, created_by: teague.id })
    .select("id")
    .single();
  check("coach: can persist the real generated schemaVersion-2 content as a draft version", !draftError, draftError?.message);

  const { data: draftVisibleBefore } = await clientMixedClient.from("training_program_versions").select("id").eq("id", draftVersion!.id);
  check("K: Client Mixed cannot see the unpublished draft version before it's published+assigned", (draftVisibleBefore ?? []).length === 0);

  const { error: prematureAssignError } = await teagueClient.rpc("assign_active_program_version", {
    p_client_profile_id: clientMixedProfileId,
    p_program_version_id: draftVersion!.id,
  });
  check("K: assign_active_program_version rejects an unpublished (draft) version", !!prematureAssignError);

  const { error: publishError } = await teagueClient
    .from("training_program_versions")
    .update({ status: "published", published_by: teague.id, published_at: new Date().toISOString() })
    .eq("id", draftVersion!.id);
  check("coach: can publish the draft version", !publishError, publishError?.message);

  const { data: assignmentId, error: assignError } = await teagueClient.rpc("assign_active_program_version", {
    p_client_profile_id: clientMixedProfileId,
    p_program_version_id: draftVersion!.id,
  });
  check("J: assign_active_program_version succeeds once published and returns a real assignment id", !assignError && !!assignmentId, assignError?.message);

  const startDateIso = new Date().toISOString().slice(0, 10);
  const { error: enrollmentError } = await teagueClient
    .from("client_enrollments")
    .upsert({ workspace_id: workspaceId, client_profile_id: clientMixedProfileId, original_program_start_date: startDateIso, timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });
  check("coach: can set Client Mixed's real program start date", !enrollmentError, enrollmentError?.message);

  console.log("\n5. Client Mixed reads back the REAL row and resolves it through this phase's real pure functions\n");

  const { data: myAssignment, error: myAssignmentError } = await clientMixedClient
    .from("program_assignments")
    .select("id, status, program_version_id, training_program_versions(content, status)")
    .eq("client_profile_id", clientMixedProfileId)
    .eq("status", "active")
    .maybeSingle();
  check("Client Mixed: can read their own active assignment", !myAssignmentError && !!myAssignment, myAssignmentError?.message);

  const versionRow = (myAssignment as unknown as { training_program_versions: { content: unknown; status: string } } | null)?.training_program_versions;
  check("J: the read-back row still points at the correct, currently-published version", versionRow?.status === "published");

  // Exactly what lib/production/programs.ts's getClientProgramContext does
  // with this raw row — the real dispatch function, run against a REAL
  // fetched Postgres row, not a hand-typed object.
  const universalProgram = resolveUniversalProgramContent(versionRow!.content as never);
  check("R: the real fetched row resolves through resolveUniversalProgramContent BY IDENTITY (schemaVersion 2, no legacy round-trip)", universalProgram === versionRow!.content);

  const enrollment = buildProgramEnrollmentForClient({ workspaceId, clientId: clientMixedProfileId, startDateIso, durationWeeks: 2, timeZone: "UTC" });
  const resolvedToday = resolveScheduledSessionForStart({ dateIso: startDateIso, programEnrollment: enrollment, assignedProgram: universalProgram!, clientDeclaredRest: false });
  check("D: the real generated+persisted+fetched program resolves a real session for today (or an honest rest/no_assignment reason — never a crash)", resolvedToday.session !== undefined);

  console.log("\n6. Client Other and cross-tenant checks (L)\n");

  const { data: otherSeesIt } = await clientOtherClient.from("program_assignments").select("id").eq("client_profile_id", clientMixedProfileId);
  check("L: Client Other (same workspace, different client) sees ZERO of Client Mixed's assignments", (otherSeesIt ?? []).length === 0);

  const { data: otherVersionAttempt } = await clientOtherClient.from("training_program_versions").select("id, content").eq("id", draftVersion!.id);
  check("L: Client Other cannot resolve Client Mixed's program version by id either", (otherVersionAttempt ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
