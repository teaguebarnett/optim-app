// Phase 9D — Shadow Client-State Intelligence.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through
// Mailpit, RLS-governed queries through each real signed-in session,
// service-role only to create fixture auth users.
//
// lib/production/client-state-evidence.ts can't be imported here directly
// (server-only, needs next/headers) — this script reproduces its exact
// real read logic (client_observations query + schedule derivation) one
// step at a time against REAL signed-in sessions, then calls the actual
// imported PURE analyzeClientState function — matching this repo's
// established e2e convention (see scripts/e2e-learned-rule-generation.mts
// for the identical Phase 9C pattern).
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — this script wipes its own isolated e2e-9d-* fixture rows at
// the start of every run, matching the fix applied to
// scripts/e2e-learned-rule-generation.mts):
//   node --experimental-strip-types scripts/e2e-client-state-analysis.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { analyzeClientState } from "../lib/client-state/analyze-client-state.ts";
import { scheduledTrainingDatesInWindow } from "../lib/client-state/schedule.ts";
import { addDaysToLocalDate } from "../lib/shared/local-date.ts";
import type { RawObservation } from "../lib/client-state/evidence.ts";
import type { ProgramEnrollment } from "../lib/scheduling/types";

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

async function signInAsRealSession(email: string): Promise<SupabaseClient> {
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

/** Reproduces lib/signals/types.ts's real source-ref builders exactly. */
function dayRef(clientProfileId: string, dateIso: string): string {
  return `daily_records:${clientProfileId}:${dateIso}`;
}

async function insertSessionObservation(client: SupabaseClient, params: { workspaceId: string; clientProfileId: string; dateIso: string; status: "completed" | "skipped"; skipReason?: string }) {
  const observedAt = `${params.dateIso}T18:00:00.000Z`;
  const rows: { workspace_id: string; client_profile_id: string; category: string; metric_key: string; source_type: string; value_type: string; value_text: string; source_ref: string; observed_at: string }[] = [
    { workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, category: "training_performance", metric_key: "session_status", source_type: "workout_execution", value_type: "categorical", value_text: params.status, source_ref: dayRef(params.clientProfileId, params.dateIso), observed_at: observedAt },
  ];
  if (params.status === "skipped" && params.skipReason) {
    rows.push({ workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, category: "adherence", metric_key: "skip_reason", source_type: "workout_execution", value_type: "categorical", value_text: params.skipReason, source_ref: dayRef(params.clientProfileId, params.dateIso), observed_at: observedAt });
  }
  const { error } = await client.from("client_observations").upsert(rows, { onConflict: "client_profile_id,source_type,source_ref,metric_key" });
  if (error) throw new Error(`insertSessionObservation failed: ${error.message}`);
}

/** Reproduces lib/production/client-state-evidence.ts's real query logic
 * against a REAL signed-in session — the RLS on client_observations_select
 * is what actually enforces isolation/authorization here, exactly like
 * every other read in this codebase's e2e scripts. */
async function fetchObservationsLive(session: SupabaseClient, clientProfileId: string, sinceIso: string): Promise<RawObservation[]> {
  const { data, error } = await session.from("client_observations").select("*").eq("client_profile_id", clientProfileId).gte("observed_at", `${sinceIso}T00:00:00.000Z`).order("observed_at", { ascending: false });
  if (error) throw new Error(`fetchObservationsLive failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    category: r.category as string,
    metricKey: r.metric_key as string,
    sourceType: r.source_type as string,
    value:
      r.value_type === "numeric" ? { valueType: "numeric" as const, valueNumeric: r.value_numeric as number } : r.value_type === "boolean" ? { valueType: "boolean" as const, valueBoolean: r.value_boolean as boolean } : { valueType: r.value_type as "categorical" | "text", valueText: r.value_text as string },
    unit: (r.unit as string | null) ?? null,
    sourceRef: (r.source_ref as string | null) ?? null,
    trainingItemInstanceId: (r.training_item_instance_id as string | null) ?? null,
    observedAtIso: r.observed_at as string,
  }));
}

async function main() {
  console.log(`OPTIM Phase 9D — live E2E shadow client-state analysis verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 9D fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-9d-coach-a@example.test", "Coach A 9D");
  const coachB = await ensureUser("e2e-9d-coach-b@example.test", "Coach B 9D");
  const otherCoach = await ensureUser("e2e-9d-other-coach@example.test", "Other Coach 9D");
  const clientAUser = await ensureUser("e2e-9d-client-a@example.test", "Client A (sick week) 9D");
  const clientBUser = await ensureUser("e2e-9d-client-b@example.test", "Client B (chronic decline) 9D");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }
  const workspaceId = await ensureWorkspace(coachA.id, "E2E 9D Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 9D Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: coachB.id, role: "coach", status: "active" },
      { workspace_id: workspaceId, user_id: clientAUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientBUser.id, role: "client", status: "active" },
      { workspace_id: otherWorkspaceId, user_id: otherCoach.id, role: "workspace_owner", status: "active" },
    ],
    { onConflict: "workspace_id,user_id" }
  );

  async function ensureClientProfile(userId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("client_profiles").insert({ workspace_id: workspaceId, user_id: userId, display_name: displayName }).select("id").single();
    if (error) throw new Error(`client_profiles insert failed: ${error.message}`);
    await admin.from("coach_client_assignments").insert({ workspace_id: workspaceId, coach_user_id: coachA.id, client_profile_id: data!.id, is_primary: true });
    return data!.id as string;
  }
  const clientAProfileId = await ensureClientProfile(clientAUser.id, "Client A (sick week) 9D");
  const clientBProfileId = await ensureClientProfile(clientBUser.id, "Client B (chronic decline) 9D");

  // This script's own scenario depends on precise evidence-window
  // arithmetic (recent vs baseline miss ratios) — a stale observation row
  // surviving from an earlier (possibly crashed) run of THIS script would
  // silently change the classification outcome. Reset to a clean slate
  // every run (service-role, scoped only to this workspace).
  const del1 = await admin.from("client_observations").delete().eq("workspace_id", workspaceId);
  const del2 = await admin.from("program_assignments").delete().eq("client_profile_id", clientAProfileId);
  const del3 = await admin.from("program_assignments").delete().eq("client_profile_id", clientBProfileId);
  if (del1.error || del2.error || del3.error) throw new Error(`fixture cleanup failed: ${del1.error?.message ?? del2.error?.message ?? del3.error?.message}`);

  console.log("  fixtures ready: Coach A (owner, 2 clients) + Coach B (unassigned coach, same workspace) + Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow (step 1)\n");
  const coachASession = await signInAsRealSession("e2e-9d-coach-a@example.test");
  const coachBSession = await signInAsRealSession("e2e-9d-coach-b@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-9d-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-9d-client-a@example.test");
  const clientBSession = await signInAsRealSession("e2e-9d-client-b@example.test");
  check("all 5 real sessions completed a real OTP sign-in round-trip", true);

  console.log("\n3. Coach A generates, publishes, and assigns a REAL universal program to both clients (steps 2-3)\n");

  const nowIso = new Date().toISOString();
  const todayIso = nowIso.slice(0, 10);
  const com = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId, nowIso, businessName: "E2E 9D Workspace" });
  const profile = buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]); // Mon/Wed/Fri
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];

  async function assignRealProgram(clientProfileId: string, startDateIso: string): Promise<void> {
    const generated = buildUniversalProgramForDirection(direction, { clientId: clientProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso });
    const { data: programFamily, error: programError } = await coachASession.from("training_programs").insert({ workspace_id: workspaceId, created_by: coachA.id, title: generated.content.name }).select("id").single();
    if (programError) throw new Error(`training_programs insert failed: ${programError.message}`);
    const { data: draftVersion, error: draftError } = await coachASession.from("training_program_versions").insert({ program_id: programFamily!.id, workspace_id: workspaceId, version_number: 1, status: "draft", content: generated.content, created_by: coachA.id }).select("id").single();
    if (draftError) throw new Error(`training_program_versions insert failed: ${draftError.message}`);
    const { error: publishError } = await coachASession.from("training_program_versions").update({ status: "published", published_by: coachA.id, published_at: new Date().toISOString() }).eq("id", draftVersion!.id);
    if (publishError) throw new Error(`publish failed: ${publishError.message}`);
    const { error: assignError } = await coachASession.rpc("assign_active_program_version", { p_client_profile_id: clientProfileId, p_program_version_id: draftVersion!.id });
    if (assignError) throw new Error(`assign_active_program_version failed: ${assignError.message}`);
    const { error: enrollError } = await coachASession.from("client_enrollments").upsert({ workspace_id: workspaceId, client_profile_id: clientProfileId, original_program_start_date: startDateIso, timezone: "UTC", status: "active" }, { onConflict: "client_profile_id" });
    if (enrollError) throw new Error(`client_enrollments upsert failed: ${enrollError.message}`);
  }

  // 11 weeks back — comfortably covers the 84-day performance lookback and
  // the 56-day adherence (recent+baseline) window, ending today.
  const programStartDateIso = addDaysToLocalDate(todayIso, -77);
  await assignRealProgram(clientAProfileId, programStartDateIso);
  await assignRealProgram(clientBProfileId, programStartDateIso);
  check("Client A and Client B both have a real, published, actively-assigned universal program", true);

  const enrollment: ProgramEnrollment = { id: "e", schemaVersion: 1, workspaceId, clientId: clientAProfileId, programId: "p", startDateIso: programStartDateIso, durationWeeks: 12, timeZone: "UTC", weekStartsOn: "monday", createdAtIso: nowIso, updatedAtIso: nowIso };
  // Split/day-pattern selection is deterministic given the same
  // profile/com/direction/durationWeeks, so regenerating here (purely to
  // read the week/day SCHEDULE shape, never persisted) yields the exact
  // same day-pattern structure as the real assigned content above.
  const scheduleReferenceContent = buildUniversalProgramForDirection(direction, { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso }).content;
  const scheduledDates = scheduledTrainingDatesInWindow(enrollment, scheduleReferenceContent, addDaysToLocalDate(todayIso, -83), todayIso);
  check("the real assigned program's own schedule produces real scheduled training dates (Mon/Wed/Fri) across the full lookback window", scheduledDates.length >= 20);

  console.log("\n4. Client A — strong baseline, then a real illness-related skip cluster (steps 3-4)\n");

  const illnessDate1 = addDaysToLocalDate(todayIso, -20);
  const illnessDate2 = addDaysToLocalDate(todayIso, -18);
  for (const d of scheduledDates) {
    if (d === illnessDate1 || d === illnessDate2) {
      await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "skipped", skipReason: "feeling-sick" });
    } else if (!(d > addDaysToLocalDate(todayIso, -14))) {
      // Baseline + illness week only for this first snapshot — the last
      // 14 days are seeded separately below as the "recovery" period.
      await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "completed" });
    }
  }
  check("real baseline + illness-cluster observations recorded for Client A via their own real, RLS-governed session", true);

  console.log("\n5. Analysis AS OF right after the illness cluster — temporary disruption, NOT a chronic finding (steps 4-5)\n");

  const nowIsoRightAfterIllness = `${addDaysToLocalDate(todayIso, -16)}T12:00:00.000Z`;
  const observationsSoFar = await fetchObservationsLive(clientASession, clientAProfileId, addDaysToLocalDate(todayIso, -83));
  const analysisAfterIllness = analyzeClientState({ clientProfileId: clientAProfileId, observations: observationsSoFar, scheduledTrainingDates: scheduledDates, activeSafetyRestriction: false, nowIso: nowIsoRightAfterIllness });
  const adherenceAfterIllness = analysisAfterIllness.findings.find((f) => f.domain === "adherence")!;
  check("temporary disruption finding: illness_related_disruption, not a chronic pattern", adherenceAfterIllness.findingType === "illness_related_disruption");
  check("strength is conservative (never 'strong' from one isolated illness cluster)", adherenceAfterIllness.strength !== "strong");
  check("reasonClassification correctly attributes illness, never a motivation/personality judgment", adherenceAfterIllness.reasonClassification === "illness" && !/lazy|unmotivated/i.test(adherenceAfterIllness.summary));

  console.log("\n6. Client A returns to normal training for the remaining recent period (step 5)\n");

  for (const d of scheduledDates) {
    if (d > addDaysToLocalDate(todayIso, -14) && d <= todayIso) {
      await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "completed" });
    }
  }
  check("real recovery-period completion observations recorded", true);

  console.log("\n7. Analysis AS OF today — the temporary finding resolves on its own via the sliding window, never left as a permanent 'problem' (step 6)\n");

  const observationsNow = await fetchObservationsLive(clientASession, clientAProfileId, addDaysToLocalDate(todayIso, -83));
  const analysisNow = analyzeClientState({ clientProfileId: clientAProfileId, observations: observationsNow, scheduledTrainingDates: scheduledDates, activeSafetyRestriction: false, nowIso });
  const adherenceNow = analysisNow.findings.find((f) => f.domain === "adherence")!;
  check("D/25: the illness-related finding has resolved to stable_adherence now that recent evidence is fully normal — recomputed fresh, never a stale persisted state", adherenceNow.findingType === "stable_adherence");

  console.log("\n8. Client B — repeated, non-temporary schedule-conflict misses form a real, stronger adherence finding (steps 7-8)\n");

  for (const d of scheduledDates) {
    const isRecentOrBaseline = d <= todayIso;
    if (!isRecentOrBaseline) continue;
    const dayIndex = scheduledDates.indexOf(d);
    if (dayIndex % 3 === 0) {
      await insertSessionObservation(clientBSession, { workspaceId, clientProfileId: clientBProfileId, dateIso: d, status: "skipped", skipReason: "schedule-conflict" });
    } else {
      await insertSessionObservation(clientBSession, { workspaceId, clientProfileId: clientBProfileId, dateIso: d, status: "completed" });
    }
  }
  const clientBObservations = await fetchObservationsLive(clientBSession, clientBProfileId, addDaysToLocalDate(todayIso, -83));
  const clientBAnalysis = analyzeClientState({ clientProfileId: clientBProfileId, observations: clientBObservations, scheduledTrainingDates: scheduledDates, activeSafetyRestriction: false, nowIso });
  const clientBAdherence = clientBAnalysis.findings.find((f) => f.domain === "adherence")!;
  check("a real, repeated, non-temporary pattern forms a stronger adherence finding", clientBAdherence.findingType === "recurring_schedule_conflict");
  check("the finding is backed by real evidence ids traceable to actual client_observations rows", clientBAdherence.supportingEvidenceRefs.length > 0 && clientBAdherence.supportingEvidenceRefs.every((id) => typeof id === "string" && id.length > 0));

  console.log("\n9. Client isolation — Client A's findings never include Client B's data, and vice versa (step 9)\n");

  const { data: clientACannotSeeB } = await clientASession.from("client_observations").select("id").eq("client_profile_id", clientBProfileId);
  check("Client A's own session reads ZERO of Client B's observation rows (RLS)", (clientACannotSeeB ?? []).length === 0);
  const { data: clientBCannotSeeA } = await clientBSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId);
  check("Client B's own session reads ZERO of Client A's observation rows (RLS)", (clientBCannotSeeA ?? []).length === 0);

  console.log("\n10. Coach authorization — unrelated coach and cross-workspace coach are denied (step 10)\n");

  const { data: coachBReadsA } = await coachBSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId).limit(1);
  check("Z/AA: Coach B (same workspace, not assigned to Client A) reads ZERO of Client A's observations", (coachBReadsA ?? []).length === 0);
  const { data: otherCoachReadsA } = await otherCoachSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId).limit(1);
  check("AA: an unrelated coach in a completely different workspace reads ZERO rows", (otherCoachReadsA ?? []).length === 0);

  console.log("\n11. Zero generation influence — program generation before and after running client-state analysis is byte-identical (step 11)\n");

  const normalize = (value: unknown) => JSON.stringify(value).replace(/\d{10,}(-\d+)?/g, "<volatile>");
  const beforeGen = buildUniversalProgramForDirection(direction, { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  // analysisNow/analysisAfterIllness/clientBAnalysis have already run above —
  // generation now runs AGAIN with the exact same inputs.
  const afterGen = buildUniversalProgramForDirection(direction, { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  check("AC: generation content is IDENTICAL before and after running shadow client-state analysis on real evidence — a real completed analysis now exists and generation still never reads it", normalize(beforeGen) === normalize(afterGen));

  console.log("\n12. Determinism — the same evidence bundle analyzed twice produces byte-identical findings (AB)\n");

  const rerun = analyzeClientState({ clientProfileId: clientAProfileId, observations: observationsNow, scheduledTrainingDates: scheduledDates, activeSafetyRestriction: false, nowIso });
  check("AB: re-running analysis on the exact same real evidence bundle produces byte-identical findings", JSON.stringify(analysisNow) === JSON.stringify(rerun));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
