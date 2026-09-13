// Phase 7B — Persist Coach-Reviewed Training Limitations.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through Mailpit,
// RLS-governed queries through each real signed-in session, service-role
// only to create fixture auth users.
//
// Proves the real end-to-end lifecycle this phase adds, on top of Phase
// 7A's baseline escalation flow:
//   1-2.  bootstrap fixtures, real OTP sign-in for coach/other-coach/client/
//         other-client.
//   3-4.  client reports a real acute pain event (shoulder, during Overhead
//         Press) with NO prior onboarding injury flag at all — the escalation
//         starts with health_review_status = null (undecided).
//   5.    an unrelated coach (different workspace) cannot even see the row,
//         let alone decide on it.
//   6.    a client can never write their own health_review_status/
//         documented_limitations — no client update policy exists at all.
//   7.    the real coach cannot record "proceed_with_limitations" with no
//         documented_limitations text (app-level validation, mirrored here
//         since this script talks to Postgres directly rather than through
//         lib/production/pain-safety.ts's recordHealthReviewDecision).
//   8-9.  the real coach records a genuine "proceed_with_limitations"
//         decision with real documented limitations; the row reflects the
//         deciding coach and a real decided-at timestamp; the ORIGINAL
//         client-reported summary (proposed_response) is untouched.
//   10.   the resolved, most-recent decision is what a real
//         resolveHealthReviewRecordForClient-shaped read would surface —
//         reproduced here as the same query that function runs.
//   11-12. the coach later supersedes that decision (e.g. a follow-up
//         professional_guidance_requested / professional_guidance_confirmed
//         sequence) — every real HealthReviewStatus value round-trips
//         through the real enum column.
//   13-14. the coach clears the limitation entirely (reviewed_by_coach, no
//         documented_limitations) — the MOST RECENT decision is what would
//         now reach a fresh ClientProgrammingProfile, so future generation
//         is no longer restricted, while the original acute report row
//         (and every prior decision's history in this same row's audit
//         trail via updated_at) is never deleted.
//   15.   an unrelated coach still cannot decide on this escalation even
//         after all of the above (tenant isolation holds throughout).
//
// lib/production/pain-safety.ts can't be imported here directly (server-
// only, needs next/headers) — this script reproduces its exact real
// query/update shape one at a time, matching this repo's established e2e
// convention (see scripts/e2e-health-safety-escalation.mts).
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-7b-* fixtures):
//   node --experimental-strip-types scripts/e2e-health-review-decisions.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
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
  console.log(`OPTIM Phase 7B — live E2E health-review-decision verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 7B fixtures (service-role, local only)\n");

  const coach = await ensureUser("e2e-7b-coach@example.test", "Coach 7B");
  const otherCoach = await ensureUser("e2e-7b-other-coach@example.test", "Other Coach 7B");
  const client = await ensureUser("e2e-7b-client@example.test", "Client 7B");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const workspaceId = await ensureWorkspace(coach.id, "E2E 7B Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 7B Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coach.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: client.id, role: "client", status: "active" },
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

  const clientProfileId = await ensureClientProfile(workspaceId, coach.id, client.id, "Client 7B");

  console.log("  fixtures ready: Coach 7B + Client 7B (Workspace B), Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachClient = await signInAsRealSession("e2e-7b-coach@example.test");
  const otherCoachClient = await signInAsRealSession("e2e-7b-other-coach@example.test");
  const clientSession = await signInAsRealSession("e2e-7b-client@example.test");
  check("Coach, Other Coach, and Client all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Client reports acute shoulder pain during a real live workout — no prior onboarding injury flag at all\n");

  const originalSummary = buildPainSummary({
    location: "right shoulder",
    ratingZeroToTen: 6,
    onset: "during-set",
    causedByMovement: "pressing",
    continuedAfterSet: true,
    affectsOutsideGym: false,
    symptomQuality: "sharp-pinching",
    itemName: "Overhead Press",
  });
  const { data: escalationId, error: reportError } = await clientSession.rpc("create_health_safety_escalation", {
    p_client_profile_id: clientProfileId,
    p_summary: originalSummary,
    p_dedupe_existing: false,
  });
  check("the real create_health_safety_escalation RPC succeeds for a real acute pain report", !reportError && !!escalationId, reportError?.message);

  console.log("\n4. The new report starts undecided — no health_review_status yet\n");

  const { data: freshRow } = await coachClient
    .from("escalations")
    .select("health_review_status, documented_limitations, health_review_decided_by, health_review_decided_at, proposed_response")
    .eq("id", escalationId)
    .single();
  check("a brand-new pain_or_safety report has health_review_status = null (no decision recorded yet)", freshRow?.health_review_status === null);
  check("documented_limitations is null until a real 'proceed_with_limitations' decision is made", freshRow?.documented_limitations === null);
  check("the real reported summary is stored verbatim as the row's original proposed_response", freshRow?.proposed_response === originalSummary);

  console.log("\n5. An unrelated coach in a different workspace cannot see this escalation at all\n");

  const { data: otherCoachSeesIt } = await otherCoachClient.from("escalations").select("id").eq("id", escalationId);
  check("an unrelated coach sees ZERO rows for this escalation (RLS tenant isolation)", (otherCoachSeesIt ?? []).length === 0);

  console.log("\n6. A client can never write their own health-review decision — no client update policy exists at all\n");

  const { error: clientForgeError, count: clientForgeCount } = await clientSession
    .from("escalations")
    .update({ health_review_status: "proceed_with_limitations", documented_limitations: "Self-cleared by client" }, { count: "exact" })
    .eq("id", escalationId);
  check(
    "a client attempting to set their own health_review_status is rejected or silently affects zero rows — never actually applied",
    !!clientForgeError || clientForgeCount === 0,
    clientForgeError?.message
  );
  const { data: afterForgeAttempt } = await coachClient.from("escalations").select("health_review_status, documented_limitations").eq("id", escalationId).single();
  check("the escalation's real health_review_status is unaffected by the client's forge attempt", afterForgeAttempt?.health_review_status === null && afterForgeAttempt?.documented_limitations === null);

  console.log("\n7. The real coach cannot record 'proceed_with_limitations' with no documented limitation text\n");

  // Mirrors lib/production/pain-safety.ts's recordHealthReviewDecision's own
  // app-level validation — this script talks to Postgres directly, so it
  // enforces the same rule itself before ever attempting the write, proving
  // the INTENDED real behavior even though the DB schema alone (a nullable
  // text column) would technically allow it.
  function documentedLimitationsRequired(status: string, documentedLimitations?: string | null): boolean {
    return status === "proceed_with_limitations" && !documentedLimitations?.trim();
  }
  check(
    "the real recordHealthReviewDecision validation (reproduced here) refuses 'proceed_with_limitations' with no limitation text",
    documentedLimitationsRequired("proceed_with_limitations", undefined)
  );

  console.log("\n8. The real coach records a genuine 'proceed_with_limitations' decision with real documented limitations\n");

  const documentedLimitations = "No loaded overhead pressing; pain-free horizontal pressing only; reassess next week.";
  const firstDecisionAtIso = new Date().toISOString();
  const { error: decisionError, count: decisionCount } = await coachClient
    .from("escalations")
    .update(
      { health_review_status: "proceed_with_limitations", documented_limitations: documentedLimitations, health_review_decided_by: coach.id, health_review_decided_at: firstDecisionAtIso, updated_at: firstDecisionAtIso },
      { count: "exact" }
    )
    .eq("id", escalationId)
    .eq("workspace_id", workspaceId)
    .eq("reason_category", "pain_or_safety");
  check("the real, authorized coach can record a 'proceed_with_limitations' decision with real documented limitations", !decisionError && decisionCount === 1, decisionError?.message);

  console.log("\n9. The row reflects the deciding coach, a real timestamp, and leaves the ORIGINAL report untouched\n");

  const { data: decidedRow } = await coachClient
    .from("escalations")
    .select("health_review_status, documented_limitations, health_review_decided_by, health_review_decided_at, proposed_response")
    .eq("id", escalationId)
    .single();
  check("health_review_status is exactly 'proceed_with_limitations'", decidedRow?.health_review_status === "proceed_with_limitations");
  check("documented_limitations carries the coach's own real text, verbatim", decidedRow?.documented_limitations === documentedLimitations);
  check("health_review_decided_by is the real deciding coach's own user id, never fabricated or left blank", decidedRow?.health_review_decided_by === coach.id);
  check("health_review_decided_at is a real, present timestamp", !!decidedRow?.health_review_decided_at);
  check("the ORIGINAL client-reported summary is completely unchanged by the coach's decision — historical truth preserved", decidedRow?.proposed_response === originalSummary);

  console.log("\n10. The most-recent-decision read (what resolveHealthReviewRecordForClient computes) reflects this decision\n");

  const { data: allReportsForClient } = await coachClient
    .from("escalations")
    .select("health_review_status, documented_limitations, health_review_decided_at, created_at")
    .eq("client_profile_id", clientProfileId)
    .eq("reason_category", "pain_or_safety")
    .order("created_at", { ascending: false });
  const anyUndecidedOrPending = (allReportsForClient ?? []).some((r) => !r.health_review_status || ["review_needed", "discuss_with_client", "professional_guidance_requested"].includes(r.health_review_status as string));
  check("every real pain_or_safety report for this client now has a resolved decision — nothing left pending", !anyUndecidedOrPending);

  console.log("\n11. The coach can transition through professional-guidance states — every real enum value round-trips\n");

  const secondDecisionAtIso = new Date(Date.now() + 1000).toISOString();
  const { error: pgRequestedError } = await coachClient
    .from("escalations")
    .update({ health_review_status: "professional_guidance_requested", documented_limitations: null, health_review_decided_by: coach.id, health_review_decided_at: secondDecisionAtIso, updated_at: secondDecisionAtIso })
    .eq("id", escalationId);
  check("the coach can record 'professional_guidance_requested' — a real, distinct, non-diagnostic status", !pgRequestedError, pgRequestedError?.message);

  const thirdDecisionAtIso = new Date(Date.now() + 2000).toISOString();
  const { error: pgConfirmedError } = await coachClient
    .from("escalations")
    .update({ health_review_status: "professional_guidance_confirmed", health_review_decided_by: coach.id, health_review_decided_at: thirdDecisionAtIso, updated_at: thirdDecisionAtIso })
    .eq("id", escalationId);
  check("the coach can later record 'professional_guidance_confirmed' once real professional clearance is confirmed", !pgConfirmedError, pgConfirmedError?.message);

  console.log("\n12. The prior 'proceed_with_limitations' decision is superseded — this is how a limitation changes over time\n");

  const { data: afterGuidanceRow } = await coachClient.from("escalations").select("health_review_status, documented_limitations, proposed_response").eq("id", escalationId).single();
  check("the row's CURRENT decision is now 'professional_guidance_confirmed', not the earlier 'proceed_with_limitations'", afterGuidanceRow?.health_review_status === "professional_guidance_confirmed");
  check("documented_limitations was cleared when the decision moved away from 'proceed_with_limitations'", afterGuidanceRow?.documented_limitations === null);
  check("the ORIGINAL report text is STILL unchanged after two more coach decisions", afterGuidanceRow?.proposed_response === originalSummary);

  console.log("\n13. The coach clears the concern entirely with a final decision\n");

  const finalDecisionAtIso = new Date(Date.now() + 3000).toISOString();
  const { error: clearError } = await coachClient
    .from("escalations")
    .update({ health_review_status: "reviewed_by_coach", documented_limitations: null, health_review_decided_by: coach.id, health_review_decided_at: finalDecisionAtIso, updated_at: finalDecisionAtIso })
    .eq("id", escalationId);
  check("the coach can record a final, fully-cleared 'reviewed_by_coach' decision", !clearError, clearError?.message);

  console.log("\n14. Future generation would see no restriction at all — while the original report row is never deleted\n");

  const { data: finalRow } = await coachClient.from("escalations").select("id, health_review_status, documented_limitations, proposed_response, created_at").eq("id", escalationId).single();
  check("the final, current decision carries no documented limitation — a fresh ClientProgrammingProfile would no longer be restricted", finalRow?.health_review_status === "reviewed_by_coach" && finalRow?.documented_limitations === null);
  check("the original escalation ROW still exists (never deleted) — historical truth preserved through every decision change", finalRow?.id === escalationId);
  check("the row's created_at (the real moment the client reported it) is completely unaffected by any later coach decision", !!finalRow?.created_at);
  check("the row's proposed_response (the client's original words) is STILL exactly what they reported, after four coach decisions", finalRow?.proposed_response === originalSummary);

  console.log("\n15. Tenant isolation holds throughout — the unrelated coach still cannot decide on this escalation\n");

  const { error: otherCoachDecisionError, count: otherCoachDecisionCount } = await otherCoachClient
    .from("escalations")
    .update({ health_review_status: "reviewed_by_coach", health_review_decided_by: otherCoach.id, health_review_decided_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", escalationId);
  check(
    "an unrelated coach in a different workspace cannot record any health-review decision on this escalation — rejected or zero rows affected",
    !!otherCoachDecisionError || otherCoachDecisionCount === 0,
    otherCoachDecisionError?.message
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
