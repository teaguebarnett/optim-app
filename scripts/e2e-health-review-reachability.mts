// Health review reachable after the queue item is cleared — the production blocker found in real iCloud client
// testing (2026-10-12): a coach cleared a client's onboarding PAIN/SAFETY report from the Escalations queue
// ("Resolve without messaging") without recording a health-review decision. Clearing is correctly NOT medical
// clearance, so the client stayed "health review still open" — but the decision controls only existed for OPEN
// queue items, so the review became unreachable and generation stayed blocked.
//
// This reproduces that exact sequence against the real local database (RLS, the real RPC, the app's exact write
// shapes) and runs the real pure readiness / inbox code on the resulting rows:
//   1. onboarding injury report → health-safety escalation (the onboarding RPC path);
//   2. the coach clears it from the queue exactly as resolveEscalationWithoutMessaging does (pending → proposed → resolved);
//   3. readiness is still blocked (no decision) and the inbox now surfaces it as awaiting a decision;
//   4. other coaches / the client can't decide it; the assigned coach records "proceed with limitations" on the
//      resolved row (recordHealthReviewDecision's exact update);
//   5. readiness clears, the documented limitation reaches the programming profile, and the confirmed structured
//      restriction is stored on the decision row the planner reads.
//
// Local only (refuses unless the API URL is 127.0.0.1); isolated e2e-hrr-* fixtures; safe to re-run.
//   node --experimental-strip-types scripts/e2e-health-review-reachability.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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

if (!url || !url.includes("127.0.0.1")) {
  console.error(`Refusing to run: API_URL "${url}" doesn't look like the local stack. This script is local-only.`);
  process.exit(1);
}
if (!anonKey || !serviceRoleKey) {
  console.error("Missing ANON_KEY/SERVICE_ROLE_KEY from `supabase status -o env` — is the local stack running?");
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

/** A real user session from a local magic-link token (the local sign-in email carries a link, not a 6-digit code). */
async function signInAsRealSession(email: string) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties?.hashed_token) throw new Error(`generateLink failed for ${email}: ${linkError?.message}`);
  const { data, error } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
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

import { BASE_INTAKE_ANSWERS } from "../lib/synthesis/reasoner/eval/fixtures.ts";
import { extractClientProgrammingProfile, resolveProgrammingProfileReadiness } from "../lib/coach/programming-profile.ts";
import { attentionItemFromEscalation, splitResolvedForHealthReview } from "../lib/coach/attention-item.ts";
import { RESOLVED_HEALTH_REVIEW_STATUSES, type HealthReviewRecord, type HealthReviewStatus, type OnboardingProgress } from "../lib/coach/types.ts";

/** Mirrors lib/production/pain-safety.ts's resolveHealthReviewRecordForClient policy (server-only, not importable here). */
function recordFromRows(clientId: string, workspaceId: string, rows: { id: string; health_review_status: string | null; documented_limitations: string | null; health_review_decided_at: string | null; created_at: string; updated_at: string; proposed_response: string | null }[]): HealthReviewRecord | null {
  if (rows.length === 0) return null;
  const reasons = rows.map((r) => r.proposed_response).filter((r): r is string => !!r);
  const open = rows.some((r) => !r.health_review_status || !RESOLVED_HEALTH_REVIEW_STATUSES.has(r.health_review_status as HealthReviewStatus));
  if (open) return { clientId, workspaceId, status: "review_needed", reasons, createdAtIso: rows[0].created_at, updatedAtIso: rows[0].updated_at };
  const latest = [...rows].sort((a, b) => (b.health_review_decided_at ?? "").localeCompare(a.health_review_decided_at ?? ""))[0];
  return { clientId, workspaceId, status: latest.health_review_status as HealthReviewStatus, reasons, documentedLimitations: latest.documented_limitations ?? undefined, createdAtIso: rows[0].created_at, updatedAtIso: latest.health_review_decided_at ?? latest.updated_at, decisionEscalationId: latest.id };
}

async function main() {
  console.log(`Health review reachability after queue resolution — live E2E against ${url}\n`);
  const coach = await ensureUser("e2e-hrr-coach@example.test", "Coach HRR");
  const otherCoach = await ensureUser("e2e-hrr-other-coach@example.test", "Other Coach HRR");
  const client = await ensureUser("e2e-hrr-client@example.test", "Client HRR");
  const ws = async (ownerId: string, name: string) => {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", name).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: name, business_name: name }).select("id").single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  };
  const workspaceId = await ws(coach.id, "E2E HRR Workspace");
  const otherWorkspaceId = await ws(otherCoach.id, "E2E HRR Other Workspace");
  await admin.from("workspace_memberships").upsert([{ workspace_id: workspaceId, user_id: coach.id, role: "workspace_owner", status: "active" }, { workspace_id: workspaceId, user_id: client.id, role: "client", status: "active" }, { workspace_id: otherWorkspaceId, user_id: otherCoach.id, role: "workspace_owner", status: "active" }], { onConflict: "workspace_id,user_id" });
  // A fresh client profile per run, so the scenario always starts from a brand-new onboarding report.
  const { data: oldProfiles } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceId).eq("user_id", client.id);
  for (const p of oldProfiles ?? []) await admin.from("client_profiles").delete().eq("id", p.id);
  const { data: cp, error: cpErr } = await admin.from("client_profiles").insert({ workspace_id: workspaceId, user_id: client.id, display_name: "Client HRR" }).select("id").single();
  if (cpErr) throw new Error(cpErr.message);
  const clientProfileId = cp!.id as string;
  await admin.from("coach_client_assignments").insert({ workspace_id: workspaceId, coach_user_id: coach.id, client_profile_id: clientProfileId, is_primary: true });

  const coachDb = await signInAsRealSession("e2e-hrr-coach@example.test");
  const otherCoachDb = await signInAsRealSession("e2e-hrr-other-coach@example.test");
  const clientDb = await signInAsRealSession("e2e-hrr-client@example.test");

  console.log("1. Onboarding with a reported injury → health-safety escalation\n");
  const answers = structuredClone(BASE_INTAKE_ANSWERS) as Record<string, Record<string, unknown>>;
  answers.health_finish = { safetyScreen: ["none"], hasInjuryHistory: true, injuryBodyAreas: ["other"], injuryBodyAreaOther: "Core/abs (hernia)", injuryRestrictions: "No bracing or valsalva — no heavy squats or deadlifts.", injuryAggravatingFactors: "Bracing", injuryWorkingWithProfessional: true };
  const completedAtIso = new Date().toISOString();
  const { error: onbErr } = await clientDb.from("client_onboarding_progress").upsert({ workspace_id: workspaceId, client_profile_id: clientProfileId, current_step_index: 6, answers, completed_at: completedAtIso }, { onConflict: "client_profile_id" });
  check("the client saves completed onboarding with the injury report under their own session", !onbErr, onbErr?.message);
  const { data: escalationId, error: rpcErr } = await clientDb.rpc("create_health_safety_escalation", { p_client_profile_id: clientProfileId, p_summary: "Onboarding: injury history — Core/abs (hernia). No bracing or valsalva.", p_dedupe_existing: true });
  check("the onboarding report creates one pain_or_safety escalation", !rpcErr && !!escalationId, rpcErr?.message);
  const onboarding: OnboardingProgress = { clientId: clientProfileId, workspaceId, currentStepIndex: 6, completedAtIso, updatedAtIso: completedAtIso, answers: answers as OnboardingProgress["answers"] };

  const rows = async () => (await coachDb.from("escalations").select("id, status, health_review_status, documented_limitations, health_review_decided_at, created_at, updated_at, proposed_response, structured_limitations").eq("client_profile_id", clientProfileId).eq("reason_category", "pain_or_safety").order("created_at", { ascending: false })).data ?? [];
  const readiness = async () => resolveProgrammingProfileReadiness(extractClientProgrammingProfile(onboarding, recordFromRows(clientProfileId, workspaceId, (await rows()) as never)));
  check("before any coach action: generation is blocked on the health review", (await readiness()).status === "needs_coach_review");

  console.log("\n2. The coach clears it from the queue (Resolve without messaging) — the production sequence\n");
  const now = new Date().toISOString();
  const t1 = await coachDb.from("escalations").update({ status: "proposed", updated_at: now }).eq("id", escalationId).eq("workspace_id", workspaceId).eq("status", "pending");
  const t2 = await coachDb.from("escalations").update({ status: "resolved", resolved_by: coach.id, resolved_at: now, updated_at: now }).eq("id", escalationId).eq("workspace_id", workspaceId).eq("status", "proposed");
  check("pending → proposed → resolved succeeds (the two PATCHes seen in production)", !t1.error && !t2.error, t1.error?.message ?? t2.error?.message);
  const [afterResolve] = await rows();
  check("the queue item is resolved, but NO health-review decision was recorded (matches the production row)", afterResolve?.status === "resolved" && afterResolve?.health_review_status === null && afterResolve?.documented_limitations === null);

  console.log("\n3. Resolving the chat escalation is not clearance — and the review stays reachable\n");
  check("generation is STILL blocked on the health review (never treated as medical clearance)", (await readiness()).status === "needs_coach_review");
  const resolvedForInbox = (await coachDb.from("escalations").select("id, client_profile_id, reason_category, status, proposed_response, created_at, health_review_status, documented_limitations").eq("workspace_id", workspaceId).eq("status", "resolved")).data ?? [];
  const items = resolvedForInbox.map((r) => attentionItemFromEscalation({ id: r.id, clientProfileId: r.client_profile_id, clientDisplayName: "Client HRR", sourceMessageBody: null, reasonCategory: r.reason_category, status: r.status, proposedResponse: r.proposed_response, createdAtIso: r.created_at, priority: 0, healthReviewStatus: r.health_review_status, documentedLimitations: r.documented_limitations } as never));
  const split = splitResolvedForHealthReview(items);
  check("the coach inbox lists it under 'Health reviews awaiting your decision' (not buried in resolved history)", split.awaitingDecision.some((i) => i.id === escalationId) && !split.resolved.some((i) => i.id === escalationId));

  console.log("\n4. Coach authority and isolation on the resolved row\n");
  const forge = await clientDb.from("escalations").update({ health_review_status: "reviewed_by_coach" }, { count: "exact" }).eq("id", escalationId);
  check("the client cannot decide their own health review", !!forge.error || forge.count === 0);
  const foreign = await otherCoachDb.from("escalations").update({ health_review_status: "reviewed_by_coach", health_review_decided_by: otherCoach.id, health_review_decided_at: now }, { count: "exact" }).eq("id", escalationId);
  check("a coach from another workspace cannot decide it", !!foreign.error || foreign.count === 0);
  check("…and the row is still undecided after both attempts", (await rows())[0]?.health_review_status === null);
  const documented = "No bracing or valsalva — avoid heavy squats and deadlifts; core-stability demands only at low effort.";
  const decidedAt = new Date().toISOString();
  const dec = await coachDb.from("escalations").update({ health_review_status: "proceed_with_limitations", documented_limitations: documented, health_review_decided_by: coach.id, health_review_decided_at: decidedAt, updated_at: decidedAt }).eq("id", escalationId).eq("workspace_id", workspaceId).eq("reason_category", "pain_or_safety").select("client_profile_id");
  check("the assigned coach records 'proceed with documented limitations' on the already-resolved row", !dec.error && (dec.data ?? []).length === 1, dec.error?.message);

  console.log("\n5. Readiness clears and the limitations reach planning\n");
  const ready = await readiness();
  check("generation readiness is no longer blocked by the health review", ready.status !== "needs_coach_review", ready.status);
  const profile = extractClientProgrammingProfile(onboarding, recordFromRows(clientProfileId, workspaceId, (await rows()) as never));
  check("the programming profile carries the coach's documented limitation verbatim and reads as resolved", "profile" in profile && profile.profile.healthReviewResolved === true && JSON.stringify(profile.profile).includes(documented));
  const resolvedAgain = (await coachDb.from("escalations").select("id, client_profile_id, reason_category, status, proposed_response, created_at, health_review_status, documented_limitations").eq("id", escalationId)).data ?? [];
  const split2 = splitResolvedForHealthReview(resolvedAgain.map((r) => attentionItemFromEscalation({ id: r.id, clientProfileId: r.client_profile_id, clientDisplayName: "Client HRR", sourceMessageBody: null, reasonCategory: r.reason_category, status: r.status, proposedResponse: r.proposed_response, createdAtIso: r.created_at, priority: 0, healthReviewStatus: r.health_review_status, documentedLimitations: r.documented_limitations } as never)));
  check("once decided, it leaves 'awaiting decision' and returns to the resolved history", split2.awaitingDecision.length === 0 && split2.resolved.length === 1);
  const structured = { version: 1, restrictions: [{ optionId: "no_axial_spinal_loading", interprets: [] }], confirmedForText: documented };
  const conf = await coachDb.from("escalations").update({ structured_limitations: structured, structured_limitations_confirmed_by: coach.id, structured_limitations_confirmed_at: new Date().toISOString() }).eq("id", escalationId).eq("workspace_id", workspaceId).select("id");
  check("the coach can confirm structured restrictions on the decision row the planner reads", !conf.error && (conf.data ?? []).length === 1, conf.error?.message);
  check("the confirmed structured restrictions are stored on that decision row", JSON.stringify((await rows())[0]?.structured_limitations ?? null).includes("no_axial_spinal_loading"));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
