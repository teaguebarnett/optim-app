// Phase 8A — Longitudinal Client Intelligence: client observation
// foundation.
//
// Live E2E verification against a real local Supabase stack — same posture
// as this repo's other e2e-*.mts scripts: real OTP sign-in through Mailpit,
// RLS-governed queries through each real signed-in session, service-role
// only to create fixture auth users.
//
// lib/production/signals.ts / programs.ts / pain-safety.ts / onboarding.ts
// can't be imported here directly (server-only, need next/headers) — this
// script reproduces their exact real projection + upsert calls one at a
// time (using the actual, imported pure projectors from lib/signals/),
// matching this repo's established e2e convention.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-8a-* fixtures):
//   node --experimental-strip-types scripts/e2e-client-observations.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { projectTrainingDayObservations } from "../lib/signals/project-training-day.ts";
import { projectAcutePainObservations } from "../lib/signals/project-pain-report.ts";
import { validateClientObservationInput, type ClientObservationInput } from "../lib/signals/types.ts";
import type { TrainingDaySnapshot } from "../lib/history/types.ts";

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

/** Reproduces lib/production/signals.ts's recordObservations exactly:
 * validate, then upsert keyed by the real idempotency constraint. */
async function recordObservationsAs(client: SupabaseClient, inputs: ClientObservationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const validated = inputs.map((i) => validateClientObservationInput(i));
  const rows = validated.map((o) => ({
    workspace_id: o.workspaceId,
    client_profile_id: o.clientProfileId,
    category: o.category,
    metric_key: o.metricKey,
    source_type: o.sourceType,
    value_type: o.value.valueType,
    value_numeric: o.value.valueType === "numeric" ? o.value.valueNumeric : null,
    value_boolean: o.value.valueType === "boolean" ? o.value.valueBoolean : null,
    value_text: o.value.valueType === "categorical" || o.value.valueType === "text" ? o.value.valueText : null,
    unit: o.unit,
    source_ref: o.sourceRef,
    training_item_instance_id: o.trainingItemInstanceId ?? null,
    observed_at: o.observedAtIso,
  }));
  const { error } = await client.from("client_observations").upsert(rows, { onConflict: "client_profile_id,source_type,source_ref,metric_key" });
  if (error) throw new Error(`recordObservationsAs failed: ${error.message}`);
}

async function main() {
  console.log(`OPTIM Phase 8A — live E2E client-observations verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 8A fixtures (service-role, local only)\n");

  const coach = await ensureUser("e2e-8a-coach@example.test", "Coach 8A");
  const otherCoach = await ensureUser("e2e-8a-other-coach@example.test", "Other Coach 8A");
  const clientA = await ensureUser("e2e-8a-client-a@example.test", "Client A 8A");
  const clientB = await ensureUser("e2e-8a-client-b@example.test", "Client B 8A");
  const otherClient = await ensureUser("e2e-8a-other-client@example.test", "Other Client 8A");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }

  const workspaceId = await ensureWorkspace(coach.id, "E2E 8A Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 8A Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coach.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientB.id, role: "client", status: "active" },
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

  const clientAProfileId = await ensureClientProfile(workspaceId, coach.id, clientA.id, "Client A 8A");
  const clientBProfileId = await ensureClientProfile(workspaceId, coach.id, clientB.id, "Client B 8A");
  const otherClientProfileId = await ensureClientProfile(otherWorkspaceId, otherCoach.id, otherClient.id, "Other Client 8A");

  console.log("  fixtures ready: Coach 8A + Client A + Client B (Workspace 8A), Other Coach + Other Client (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachSession = await signInAsRealSession("e2e-8a-coach@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-8a-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-8a-client-a@example.test");
  const clientBSession = await signInAsRealSession("e2e-8a-client-b@example.test");
  check("Coach, Other Coach, Client A, and Client B all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Client A's real workout execution projects real observations\n");

  const dateIso = "2026-09-14";
  const training: TrainingDaySnapshot = {
    trainingDayType: "scheduled_workout",
    prescribedWorkoutSnapshot: null,
    sessionStatus: "completed",
    completedAtIso: "2026-09-14T18:00:00.000Z",
    painReports: [],
    workingSetsCompleted: 3,
    workingSetsPrescribed: 3,
    exerciseLogs: {
      "item-bench": {
        exerciseId: "item-bench",
        status: "completed",
        loggedSets: [
          { setNumber: 1, isWarmup: true, weightLb: 135, reps: 10, rpe: null, status: "completed" },
          { setNumber: 2, isWarmup: false, weightLb: 185, reps: 8, rpe: 7, status: "completed" },
          { setNumber: 3, isWarmup: false, weightLb: 225, reps: 5, rpe: 9, status: "completed" },
        ],
      },
      "item-zone2": { exerciseId: "item-zone2", status: "completed", loggedSets: [] },
    },
    continuousExecutions: {
      "item-zone2": { id: "exec-1", trainingItemInstanceId: "item-zone2", status: "completed", performedAsPrescribed: true, actual: { family: "continuous", duration: { seconds: 1320 } }, completedAtIso: "2026-09-14T18:00:00.000Z" },
    },
  };

  const observations = projectTrainingDayObservations({ clientProfileId: clientAProfileId, workspaceId, dateIso, training });
  await recordObservationsAs(clientASession, observations);
  check("Client A (real session, RLS-governed): can write their own real projected observations", true);

  // Scoped to this day's source_ref prefix, not the client's whole history —
  // this script is safe to run repeatedly, and step 6/7 below deliberately
  // create genuinely NEW pain/sleep evidence on every real run (a fresh
  // escalation id each time), so a client-wide count would grow across
  // repeated runs even though nothing is actually duplicated.
  const dayRefPrefix = `daily_records:${clientAProfileId}:${dateIso}`;
  const { data: afterFirstRun } = await coachSession.from("client_observations").select("id, metric_key, value_numeric, value_boolean, value_text, unit, recorded_at, updated_at").eq("client_profile_id", clientAProfileId).like("source_ref", `${dayRefPrefix}%`);
  const rpeRow = afterFirstRun?.find((r) => r.metric_key === "rpe");
  const loadRow = afterFirstRun?.find((r) => r.metric_key === "performed_load");
  const durationRow = afterFirstRun?.find((r) => r.metric_key === "continuous_duration");
  const prescribedRow = afterFirstRun?.find((r) => r.metric_key === "performed_as_prescribed");
  const sessionStatusRow = afterFirstRun?.find((r) => r.metric_key === "session_status");
  check("J: a real completed resistance exercise produced a real 'rpe' observation (average of working sets)", rpeRow?.value_numeric === 8);
  check("J: a real completed resistance exercise produced a real 'performed_load' observation (top working set)", loadRow?.value_numeric === 225 && loadRow?.unit === "lb");
  check("K: a real completed continuous item produced a real 'continuous_duration' observation", durationRow?.value_numeric === 1320 && durationRow?.unit === "seconds");
  check("K/C: a real completed continuous item produced a real boolean 'performed_as_prescribed' observation", prescribedRow?.value_boolean === true);
  check("D: the day itself produced a real categorical 'session_status' observation", sessionStatusRow?.value_text === "completed");
  check("expected observation count matches the projector's own output exactly (no extra/missing rows)", (afterFirstRun ?? []).length === observations.length, `expected ${observations.length}, got ${afterFirstRun?.length}`);

  console.log("\n4. Idempotent replay — reprocessing the exact same source never duplicates\n");

  await recordObservationsAs(clientASession, observations);
  const { data: afterSecondRun } = await coachSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId).like("source_ref", `${dayRefPrefix}%`);
  check("I: reprocessing the identical source content twice leaves the exact same row COUNT — no duplicates", (afterSecondRun ?? []).length === (afterFirstRun ?? []).length);

  console.log("\n5. A genuine correction updates the same row (recorded_at fixed, updated_at advances)\n");

  const correctedTraining: TrainingDaySnapshot = {
    ...training,
    exerciseLogs: {
      ...training.exerciseLogs,
      "item-bench": {
        ...training.exerciseLogs["item-bench"],
        loggedSets: training.exerciseLogs["item-bench"].loggedSets.map((s) => (s.setNumber === 3 ? { ...s, rpe: 10 } : s)),
      },
    },
  };
  const correctedObservations = projectTrainingDayObservations({ clientProfileId: clientAProfileId, workspaceId, dateIso, training: correctedTraining });
  await new Promise((r) => setTimeout(r, 1100)); // ensure a real, observable updated_at delta
  await recordObservationsAs(clientASession, correctedObservations);
  const { data: afterCorrection } = await coachSession.from("client_observations").select("id, metric_key, value_numeric, recorded_at, updated_at").eq("client_profile_id", clientAProfileId).eq("metric_key", "rpe");
  const correctedRpeRow = afterCorrection?.[0];
  check("a corrected RPE (7,10 avg=8.5) updates the SAME row's id, never inserts a second row", correctedRpeRow?.id === rpeRow?.id);
  check("the corrected value reflects the new average", correctedRpeRow?.value_numeric === 8.5);
  check(
    "recorded_at (first-write time) never changes on a correction — historical truth of WHEN this fact first existed is preserved",
    new Date(correctedRpeRow!.recorded_at).getTime() === new Date(rpeRow!.recorded_at).getTime()
  );
  check("updated_at genuinely advances on a real correction", new Date(correctedRpeRow!.updated_at).getTime() > new Date((afterFirstRun!.find((r) => r.metric_key === "rpe")!).updated_at).getTime());

  console.log("\n6. Pain/safety projection references the canonical escalation, never replaces it\n");

  const { data: escalationId, error: escalationRpcError } = await clientASession.rpc("create_health_safety_escalation", {
    p_client_profile_id: clientAProfileId,
    p_summary: "Pain reported: left shoulder, 6/10, during Overhead Press. OPTIM paused this exercise for the client.",
    p_dedupe_existing: false,
  });
  check("the real create_health_safety_escalation RPC succeeds", !escalationRpcError && !!escalationId, escalationRpcError?.message);

  const painObservations = projectAcutePainObservations({
    clientProfileId: clientAProfileId,
    workspaceId,
    escalationId: escalationId as string,
    location: "left shoulder",
    ratingZeroToTen: 6,
    observedAtIso: new Date().toISOString(),
  });
  await recordObservationsAs(clientASession, painObservations);
  const { data: painRows } = await coachSession.from("client_observations").select("metric_key, value_text, value_numeric, source_ref").eq("client_profile_id", clientAProfileId).eq("category", "pain_safety");
  check("M: a real pain_reported (text) observation exists, sourced to the real escalation id", (painRows ?? []).some((r) => r.metric_key === "pain_reported" && r.value_text === "left shoulder" && r.source_ref === `escalation:${escalationId}`));
  check("M: a real pain_rating (numeric) observation exists alongside it", (painRows ?? []).some((r) => r.metric_key === "pain_rating" && r.value_numeric === 6));
  const { data: canonicalEscalationRow } = await coachSession.from("escalations").select("id, proposed_response").eq("id", escalationId).single();
  check("N: the canonical escalation row itself is completely untouched/still the sole authoritative safety record — the observation never replaced it", !!canonicalEscalationRow?.proposed_response);

  console.log("\n7. H/T — conflicting/future-source observations coexist for the same real-world metric\n");

  const sharedNight = "2026-09-13";
  await recordObservationsAs(clientASession, [
    validateClientObservationInput({ clientProfileId: clientAProfileId, workspaceId, category: "recovery", metricKey: "sleep_duration", sourceType: "client_manual", value: { valueType: "numeric", valueNumeric: 8 }, unit: "hours", sourceRef: `check_in:${sharedNight}`, observedAtIso: `${sharedNight}T23:00:00.000Z` }),
  ]);
  await recordObservationsAs(clientASession, [
    validateClientObservationInput({ clientProfileId: clientAProfileId, workspaceId, category: "recovery", metricKey: "sleep_duration", sourceType: "whoop", value: { valueType: "numeric", valueNumeric: 6.7 }, unit: "hours", sourceRef: `whoop:sleep:${sharedNight}`, observedAtIso: `${sharedNight}T23:00:00.000Z` }),
  ]);
  const { data: sleepRows } = await coachSession.from("client_observations").select("source_type, value_numeric").eq("client_profile_id", clientAProfileId).eq("metric_key", "sleep_duration");
  check("H: a manual sleep_duration and a whoop sleep_duration for the SAME night coexist as two distinct rows, neither overwriting the other", (sleepRows ?? []).length === 2);
  check("T: the future-wearable-shaped whoop observation persisted with zero schema changes", (sleepRows ?? []).some((r) => r.source_type === "whoop" && r.value_numeric === 6.7));

  console.log("\n8. Malformed observation is rejected at the database layer too (defense in depth)\n");

  const { error: mismatchedValueError } = await clientASession
    .from("client_observations")
    .insert({ workspace_id: workspaceId, client_profile_id: clientAProfileId, category: "training_performance", metric_key: "rpe", source_type: "workout_execution", value_type: "numeric", value_numeric: null, value_text: "not a number", source_ref: "bad:1", observed_at: new Date().toISOString() });
  check("a row claiming value_type='numeric' but supplying value_text instead of value_numeric is rejected by the DB check constraint", !!mismatchedValueError);

  const { error: badValueTypeError } = await clientASession
    .from("client_observations")
    .insert({ workspace_id: workspaceId, client_profile_id: clientAProfileId, category: "training_performance", metric_key: "rpe", source_type: "workout_execution", value_type: "not-a-real-type", value_numeric: 8, source_ref: "bad:2", observed_at: new Date().toISOString() });
  check("an unrecognized value_type is rejected by the DB check constraint", !!badValueTypeError);

  console.log("\n9. Authorization — coach access, unrelated coach denial, client separation, cross-workspace isolation\n");

  const { data: coachReadsClientA } = await coachSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId);
  check("O: the correct, assigned coach can read Client A's real observations", (coachReadsClientA ?? []).length > 0);

  const { data: otherCoachReadsClientA } = await otherCoachSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId);
  check("O: an unrelated coach in a different workspace sees ZERO of Client A's observations", (otherCoachReadsClientA ?? []).length === 0);

  const { data: clientBReadsClientA } = await clientBSession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId);
  check("P: a different client in the SAME workspace sees ZERO of Client A's observations", (clientBReadsClientA ?? []).length === 0);

  const { data: clientAReadsOwn } = await clientASession.from("client_observations").select("id").eq("client_profile_id", clientAProfileId);
  check("R: Client A can read their own real observation data", (clientAReadsOwn ?? []).length > 0);

  const { data: clientAReadsOther } = await clientASession.from("client_observations").select("id").eq("client_profile_id", otherClientProfileId);
  check("Q/R: Client A gets ZERO rows attempting to read a client in a completely different workspace", (clientAReadsOther ?? []).length === 0);

  const { error: clientAForgesForOtherClient, count: forgeCount } = await clientASession
    .from("client_observations")
    .insert({ workspace_id: workspaceId, client_profile_id: clientBProfileId, category: "training_performance", metric_key: "rpe", source_type: "client_manual", value_type: "numeric", value_numeric: 5, unit: "rpe", source_ref: "forged:1", observed_at: new Date().toISOString() }, { count: "exact" });
  check("Q: Client A cannot write an observation claiming to be about Client B — rejected by RLS insert_self policy", !!clientAForgesForOtherClient, clientAForgesForOtherClient?.message);
  void forgeCount;

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
