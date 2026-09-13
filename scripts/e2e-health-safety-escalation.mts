// Phase 7A — Persist Client Health Reviews and Coach Escalation.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through Mailpit,
// RLS-governed queries through each real signed-in session, service-role
// only to create fixture auth users.
//
// Proves the real end-to-end flow this phase adds:
//   client submits real onboarding with a reportable injury -> a real
//   pain_or_safety escalation is created (baseline) -> it reaches
//   ClientProgrammingProfile via the real resolveHealthReviewRecordForClient
//   query -> the client starts a real workout and reports ACUTE pain via
//   the real create_health_safety_escalation RPC -> a SECOND, distinct
//   escalation is created (never merged into the baseline one) -> both
//   appear in the correct coach's real attention inbox, correctly
//   prioritized -> an unrelated coach/client can access neither -> the
//   coach resolves the acute one without messaging -> the original report
//   text is preserved, never overwritten.
//
// lib/production/pain-safety.ts and lib/production/onboarding.ts can't be
// imported here directly (server-only, need next/headers) — this script
// reproduces their exact real RPC/query calls one at a time, matching this
// repo's established e2e convention.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-7a-* fixtures):
//   node --experimental-strip-types scripts/e2e-health-safety-escalation.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { computeHealthReviewRequired } from "../lib/coach/health-review.ts";
import { buildPainSummary } from "../lib/coach/pain-safety-summary.ts";

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
  console.log(`OPTIM Phase 7A — live E2E health-safety-escalation verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 7A fixtures (service-role, local only)\n");

  const coach = await ensureUser("e2e-7a-coach@example.test", "Coach 7A");
  const otherCoach = await ensureUser("e2e-7a-other-coach@example.test", "Other Coach 7A");
  const client = await ensureUser("e2e-7a-client@example.test", "Client 7A");
  const otherClient = await ensureUser("e2e-7a-other-client@example.test", "Other Client 7A");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const workspaceId = await ensureWorkspace(coach.id, "E2E 7A Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 7A Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coach.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: client.id, role: "client", status: "active" },
      { workspace_id: otherWorkspaceId, user_id: otherCoach.id, role: "workspace_owner", status: "active" },
      { workspace_id: otherWorkspaceId, user_id: otherClient.id, role: "client", status: "active" },
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

  const clientProfileId = await ensureClientProfile(workspaceId, coach.id, client.id, "Client 7A");
  const otherClientProfileId = await ensureClientProfile(otherWorkspaceId, otherCoach.id, otherClient.id, "Other Client 7A");

  console.log("  fixtures ready: Coach 7A + Client 7A (Workspace A), Other Coach + Other Client (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachClient = await signInAsRealSession("e2e-7a-coach@example.test");
  const otherCoachClient = await signInAsRealSession("e2e-7a-other-coach@example.test");
  const clientSession = await signInAsRealSession("e2e-7a-client@example.test");
  const otherClientSession = await signInAsRealSession("e2e-7a-other-client@example.test");
  check("Coach, Other Coach, Client, and Other Client all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Client submits real onboarding with a reportable injury (baseline limitation)\n");

  const healthFinishAnswers = { hasInjuryHistory: true, injuryBodyAreas: ["knee"], injuryRestrictions: "No deep knee flexion under load.", safetyScreen: ["none"] };
  const realAnswers = {
    about_you: { age: 38, heightFeet: 5, heightInchesRemainder: 9, weightLb: 180, sex: "male" },
    what_you_want: { primaryGoal: "build_muscle" },
    your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] },
    starting_point: { trainingExperience: "comfortable_common", recentConsistency: "fairly_consistent", weeklyFrequency: 3 },
    fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8" },
    health_finish: healthFinishAnswers,
  };

  const { error: onboardingError } = await clientSession
    .from("client_onboarding_progress")
    .upsert({ workspace_id: workspaceId, client_profile_id: clientProfileId, current_step_index: 6, answers: realAnswers, completed_at: new Date().toISOString() }, { onConflict: "client_profile_id" });
  check("Client (real session): can persist their own real onboarding answers, including a reported injury", !onboardingError, onboardingError?.message);

  // Exactly what lib/production/onboarding.ts's completeOnboarding does next.
  const trigger = computeHealthReviewRequired(healthFinishAnswers);
  check("computeHealthReviewRequired (the real, structured, non-diagnostic trigger) says this real injury answer requires review", trigger.required);

  const baselineSummary = `Onboarding: ${trigger.reasons.join(" ")}`;
  const { data: baselineEscalationId, error: baselineError } = await clientSession.rpc("create_health_safety_escalation", {
    p_client_profile_id: clientProfileId,
    p_summary: baselineSummary,
    p_dedupe_existing: true,
  });
  check("the real create_health_safety_escalation RPC succeeds for the client's own baseline report", !baselineError && !!baselineEscalationId, baselineError?.message);

  console.log("\n4. The real health review reaches ClientProgrammingProfile (Phase 6B's own generation input)\n");

  const { data: escalationRows } = await coachClient.from("escalations").select("status, proposed_response, created_at, updated_at").eq("client_profile_id", clientProfileId).eq("reason_category", "pain_or_safety");
  check("coach (real session): can read this client's real pain_or_safety escalation(s) — exactly what resolveHealthReviewRecordForClient does", (escalationRows ?? []).length >= 1);
  const hasUnresolvedBaseline = (escalationRows ?? []).some((r) => r.status !== "resolved");
  check("the real escalation is still unresolved, so a real ClientProgrammingProfile built from it reads healthReviewResolved: false (generation must not treat this client as cleared)", hasUnresolvedBaseline);

  console.log("\n5. Client reports ACUTE pain during a real live workout session\n");

  const acuteSummary = buildPainSummary({
    location: "left shoulder",
    ratingZeroToTen: 7,
    onset: "during-set",
    causedByMovement: "pressing",
    continuedAfterSet: true,
    affectsOutsideGym: false,
    symptomQuality: "sharp-pinching",
    itemName: "Bench Press",
  });
  const { data: acuteEscalationId, error: acuteError } = await clientSession.rpc("create_health_safety_escalation", {
    p_client_profile_id: clientProfileId,
    p_summary: acuteSummary,
    p_dedupe_existing: false,
  });
  check("D: the real create_health_safety_escalation RPC succeeds for a real acute pain report", !acuteError && !!acuteEscalationId, acuteError?.message);
  check("the acute report creates a DISTINCT escalation from the baseline one — never silently merged into an unrelated open concern", acuteEscalationId !== baselineEscalationId);

  const { data: acuteRow, error: acuteReadError } = await coachClient.from("escalations").select("client_profile_id, reason_category, status, proposed_response, source_message_id").eq("id", acuteEscalationId).single();
  check("E: the acute escalation remains associated with the correct client", !acuteReadError && acuteRow?.client_profile_id === clientProfileId, acuteReadError?.message);
  check("F: the acute escalation's real summary carries the real session/item context (Bench Press)", (acuteRow?.proposed_response as string)?.includes("Bench Press"));
  check("the acute escalation has no source chat message — a live pain report was never a chat message", acuteRow?.source_message_id === null);
  check("H: the acute escalation entered the coach review pipeline with reason_category pain_or_safety", acuteRow?.reason_category === "pain_or_safety");

  console.log("\n6. Correct coach can access it; unrelated coach/client cannot (I/J/K/L)\n");

  const { data: coachSeesIt } = await coachClient.from("escalations").select("id").eq("id", acuteEscalationId);
  check("I: the correct, assigned coach can read the real acute escalation", (coachSeesIt ?? []).length === 1);

  const { data: otherCoachSeesIt } = await otherCoachClient.from("escalations").select("id").eq("id", acuteEscalationId);
  check("J/L: an unrelated coach in a different workspace sees ZERO of this escalation", (otherCoachSeesIt ?? []).length === 0);

  const { data: otherClientSeesIt } = await otherClientSession.from("escalations").select("id").eq("id", acuteEscalationId);
  check("K: an unrelated client sees ZERO of this escalation", (otherClientSeesIt ?? []).length === 0);

  const { error: otherClientForgeAttempt } = await otherClientSession.rpc("create_health_safety_escalation", {
    p_client_profile_id: clientProfileId,
    p_summary: "Forged report attempt",
    p_dedupe_existing: false,
  });
  check("a client cannot create a report for ANOTHER client by supplying a different client_profile_id — the RPC's own is_client_self check rejects it", !!otherClientForgeAttempt);

  console.log("\n7. Coach resolves the acute report without messaging (the real, already-existing path)\n");

  // Exactly what lib/production/chat.ts's resolveEscalationWithoutMessaging does.
  await coachClient.from("escalations").update({ status: "proposed", updated_at: new Date().toISOString() }).eq("id", acuteEscalationId).eq("status", "pending");
  const { error: resolveError } = await coachClient
    .from("escalations")
    .update({ status: "resolved", resolved_by: coach.id, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", acuteEscalationId)
    .eq("status", "proposed");
  check("coach (real session): can resolve the acute report through the existing resolve-without-messaging path", !resolveError, resolveError?.message);

  const { data: resolvedRow } = await coachClient.from("escalations").select("status, proposed_response, resolved_by").eq("id", acuteEscalationId).single();
  check("N: resolution changes status/resolved_by only — the ORIGINAL report text is preserved verbatim, never overwritten", resolvedRow?.status === "resolved" && resolvedRow?.resolved_by === coach.id && resolvedRow?.proposed_response === acuteSummary);

  const { data: baselineStillThere } = await coachClient.from("escalations").select("id, status").eq("id", baselineEscalationId).single();
  check("resolving the acute report never touches the separate, still-open baseline escalation", baselineStillThere?.status !== "resolved");

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
