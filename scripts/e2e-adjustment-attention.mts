// Phase 10C — Coach Attention Integration for Adjustment Proposals.
//
// Live E2E verification against a real local Supabase stack. Builds on
// scripts/e2e-adjustment-proposals.mts's own program-assignment/
// evidence-seeding/proposal-persistence patterns — this script's own
// focus is entirely the NEW discovery/priority/dedupe/staleness behavior
// Phase 10C adds on top of the already-proven Phase 10B lifecycle.
//
// lib/production/adjustment-proposals.ts and lib/production/coach-
// operations.ts are server-only (next/headers) and can't be imported
// directly here — this script reproduces getPendingAdjustmentAttentionItems'
// exact real query against real signed-in sessions, then calls the actual
// imported PURE functions (attentionItemFromAdjustmentProposal,
// attentionItemFromEscalation, mergeAttentionItems) those repositories
// call, exactly matching this repo's established e2e convention.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — wipes its own isolated e2e-10c-* fixture rows at the start
// of every run):
//   node --experimental-strip-types scripts/e2e-adjustment-attention.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { analyzeClientState } from "../lib/client-state/analyze-client-state.ts";
import { selectFindingsForCoachUI } from "../lib/client-state/presentation.ts";
import { scheduledTrainingDatesInWindow } from "../lib/client-state/schedule.ts";
import { evaluateAdjustmentForFinding } from "../lib/adjustment/build-proposal.ts";
import { addDaysToLocalDate, localDateDayOfWeek } from "../lib/shared/local-date.ts";
import { deriveProgramWeek } from "../lib/scheduling/enrollment.ts";
import { attentionItemFromAdjustmentProposal, attentionItemFromEscalation, mergeAttentionItems, type EscalationLike } from "../lib/coach/attention-item.ts";
import type { RawObservation } from "../lib/client-state/evidence.ts";
import type { ProgramEnrollment } from "../lib/scheduling/types";
import type { AdjustmentProvenance } from "../lib/training/types.ts";

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

function dayRef(clientProfileId: string, dateIso: string): string {
  return `daily_records:${clientProfileId}:${dateIso}`;
}

async function insertSessionObservation(session: SupabaseClient, params: { workspaceId: string; clientProfileId: string; dateIso: string; status: "completed" | "skipped"; skipReason?: string }) {
  const observedAt = `${params.dateIso}T18:00:00.000Z`;
  const rows: { workspace_id: string; client_profile_id: string; category: string; metric_key: string; source_type: string; value_type: string; value_text: string; source_ref: string; observed_at: string }[] = [
    { workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, category: "training_performance", metric_key: "session_status", source_type: "workout_execution", value_type: "categorical", value_text: params.status, source_ref: dayRef(params.clientProfileId, params.dateIso), observed_at: observedAt },
  ];
  if (params.status === "skipped" && params.skipReason) {
    rows.push({ workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, category: "adherence", metric_key: "skip_reason", source_type: "workout_execution", value_type: "categorical", value_text: params.skipReason, source_ref: dayRef(params.clientProfileId, params.dateIso), observed_at: observedAt });
  }
  const { error } = await session.from("client_observations").upsert(rows, { onConflict: "client_profile_id,source_type,source_ref,metric_key" });
  if (error) throw new Error(`insertSessionObservation failed: ${error.message}`);
}

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

function adjustmentTypeLabel(type: string): string {
  switch (type) {
    case "schedule_redistribution":
      return "Schedule adjustment";
    case "volume_reduction":
      return "Volume adjustment";
    case "intensity_reduction":
      return "Intensity adjustment";
    case "continuous_duration_reduction":
      return "Continuous-work adjustment";
    default:
      return "Adjustment";
  }
}

/** Reproduces lib/production/adjustment-proposals.ts's
 * getPendingAdjustmentAttentionItems exact query + staleness filter,
 * against a REAL signed-in session — RLS is what actually enforces
 * authorization here, exactly like every other read in this codebase's
 * e2e scripts. */
async function discoverPendingAdjustments(session: SupabaseClient, workspaceId: string) {
  const { data, error } = await session
    .from("training_program_versions")
    .select("id, content, created_at, proposed_for_client_profile_id, client_profiles!proposed_for_client_profile_id(display_name)")
    .eq("workspace_id", workspaceId)
    .eq("status", "draft")
    .not("proposed_for_client_profile_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`discoverPendingAdjustments failed: ${error.message}`);

  const candidates = (data ?? [])
    .map((row) => {
      const content = row.content as { adjustmentProvenance?: AdjustmentProvenance };
      if (!content.adjustmentProvenance) return null;
      const clientProfile = row.client_profiles as unknown as { display_name: string } | null;
      return {
        versionId: row.id as string,
        clientProfileId: row.proposed_for_client_profile_id as string,
        clientDisplayName: clientProfile?.display_name ?? "Client",
        adjustmentTypeLabel: adjustmentTypeLabel(content.adjustmentProvenance.adjustmentType),
        rationale: content.adjustmentProvenance.rationale,
        activeProgramVersionId: content.adjustmentProvenance.activeProgramVersionId,
        createdAtIso: row.created_at as string,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (candidates.length === 0) return [];

  const currentActiveByClient = new Map<string, string | null>();
  await Promise.all(
    candidates.map(async (c) => {
      if (currentActiveByClient.has(c.clientProfileId)) return;
      const { data: assignment } = await session.from("program_assignments").select("program_version_id").eq("client_profile_id", c.clientProfileId).eq("status", "active").maybeSingle();
      currentActiveByClient.set(c.clientProfileId, (assignment?.program_version_id as string | null) ?? null);
    })
  );
  return candidates.filter((c) => currentActiveByClient.get(c.clientProfileId) === c.activeProgramVersionId).map((c) => ({ versionId: c.versionId, clientProfileId: c.clientProfileId, clientDisplayName: c.clientDisplayName, adjustmentTypeLabel: c.adjustmentTypeLabel, rationale: c.rationale, createdAtIso: c.createdAtIso }));
}

async function main() {
  console.log(`OPTIM Phase 10C — live E2E adjustment-proposal attention integration verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 10C fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-10c-coach-a@example.test", "Coach A 10C");
  const coachB = await ensureUser("e2e-10c-coach-b@example.test", "Coach B 10C");
  const otherCoach = await ensureUser("e2e-10c-other-coach@example.test", "Other Coach 10C");
  const clientAUser = await ensureUser("e2e-10c-client-a@example.test", "Client A (schedule) 10C");
  const clientBUser = await ensureUser("e2e-10c-client-b@example.test", "Client B (reject) 10C");
  const clientSafetyUser = await ensureUser("e2e-10c-client-safety@example.test", "Client Safety 10C");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }
  const workspaceId = await ensureWorkspace(coachA.id, "E2E 10C Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 10C Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: coachB.id, role: "coach", status: "active" },
      { workspace_id: workspaceId, user_id: clientAUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientBUser.id, role: "client", status: "active" },
      { workspace_id: workspaceId, user_id: clientSafetyUser.id, role: "client", status: "active" },
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
  const clientAProfileId = await ensureClientProfile(clientAUser.id, "Client A (schedule) 10C");
  const clientBProfileId = await ensureClientProfile(clientBUser.id, "Client B (reject) 10C");
  const clientSafetyProfileId = await ensureClientProfile(clientSafetyUser.id, "Client Safety 10C");

  const cleanupResults = await Promise.all([admin.from("client_observations").delete().eq("workspace_id", workspaceId), admin.from("coach_decision_evidence").delete().eq("workspace_id", workspaceId), admin.from("escalations").delete().eq("workspace_id", workspaceId)]);
  for (const cid of [clientAProfileId, clientBProfileId, clientSafetyProfileId]) await admin.from("program_assignments").delete().eq("client_profile_id", cid);
  const { data: staleVersions } = await admin.from("training_program_versions").select("id, program_id").eq("workspace_id", workspaceId);
  const staleVersionIds = (staleVersions ?? []).map((v) => v.id as string);
  const staleProgramIds = [...new Set((staleVersions ?? []).map((v) => v.program_id as string))];
  if (staleVersionIds.length > 0) await admin.from("training_program_versions").delete().in("id", staleVersionIds);
  if (staleProgramIds.length > 0) await admin.from("training_programs").delete().in("id", staleProgramIds);
  if (cleanupResults.some((c) => c.error)) throw new Error(`fixture cleanup failed: ${cleanupResults.map((c) => c.error?.message).join(", ")}`);

  console.log("  fixtures ready: Coach A (owner, 3 clients) + Coach B (unassigned coach, same workspace) + Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachASession = await signInAsRealSession("e2e-10c-coach-a@example.test");
  const coachBSession = await signInAsRealSession("e2e-10c-coach-b@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-10c-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-10c-client-a@example.test");
  const clientBSession = await signInAsRealSession("e2e-10c-client-b@example.test");
  check("all sessions completed a real OTP sign-in round-trip", true);

  console.log("\n3. Assign a real universal program to Client A and Client B; seed a real safety escalation for Client Safety (steps 1-2)\n");

  const nowIso = new Date().toISOString();
  const todayIso = nowIso.slice(0, 10);
  const com = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId, nowIso, businessName: "E2E 10C Workspace" });
  const profile = buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]);
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];

  async function assignRealProgram(clientProfileId: string, startDateIso: string): Promise<string> {
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
    return draftVersion!.id as string;
  }

  const programStartDateIso = addDaysToLocalDate(todayIso, -21);
  const versionAId = await assignRealProgram(clientAProfileId, programStartDateIso);
  const versionBId = await assignRealProgram(clientBProfileId, programStartDateIso);

  const escalationId = crypto.randomUUID();
  const { error: escalationError } = await admin.from("escalations").insert({ id: escalationId, workspace_id: workspaceId, client_profile_id: clientSafetyProfileId, reason_category: "pain_or_safety", proposed_response: "Client reported knee discomfort during squats.", created_at: nowIso, updated_at: nowIso });
  check("a real safety escalation exists for Client Safety", !escalationError, escalationError?.message);

  const enrollment: ProgramEnrollment = { id: "e", schemaVersion: 1, workspaceId, clientId: clientAProfileId, programId: "p", startDateIso: programStartDateIso, durationWeeks: 12, timeZone: "UTC", weekStartsOn: "monday", createdAtIso: nowIso, updatedAtIso: nowIso };
  const currentProgramWeek = deriveProgramWeek(enrollment, todayIso)!;
  const scheduleReferenceContent = buildUniversalProgramForDirection(direction, { clientId: clientAProfileId, workspaceId, coachId: coachA.id, profile, com, durationWeeks: 12, nowIso }).content;
  const scheduledDates = scheduledTrainingDatesInWindow(enrollment, scheduleReferenceContent, addDaysToLocalDate(todayIso, -20), todayIso);

  console.log("\n4. Client A accumulates real schedule-conflict evidence; Phase 9D/10B produce a real pending adjustment proposal (steps 2-4)\n");

  const dowCounts = new Map<string, string[]>();
  for (const d of scheduledDates) {
    const dow = localDateDayOfWeek(d);
    const list = dowCounts.get(dow) ?? [];
    list.push(d);
    dowCounts.set(dow, list);
  }
  const [conflictDay, conflictDates] = [...dowCounts.entries()].reduce((a, b) => (b[1].length > a[1].length ? b : a));
  for (const d of scheduledDates) {
    if (conflictDates.slice(0, 3).includes(d)) await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "skipped", skipReason: "schedule-conflict" });
    else await insertSessionObservation(clientASession, { workspaceId, clientProfileId: clientAProfileId, dateIso: d, status: "completed" });
  }
  const clientAObservations = await fetchObservationsLive(coachASession, clientAProfileId, addDaysToLocalDate(todayIso, -83));
  const clientAAnalysis = analyzeClientState({ clientProfileId: clientAProfileId, observations: clientAObservations, scheduledTrainingDates: scheduledDates, activeSafetyRestriction: false, nowIso });
  const scheduleFinding = selectFindingsForCoachUI(clientAAnalysis).find((f) => f.finding.findingType === "recurring_schedule_conflict");
  check("3: a real recurring_schedule_conflict finding appears for Client A", !!scheduleFinding);

  const engineResult = evaluateAdjustmentForFinding({ finding: scheduleFinding!.finding, observations: clientAObservations, activeContent: scheduleReferenceContent, activeProgramVersionId: versionAId, com, applicableRules: [], avoidedTerms: [], currentProgramWeek, clientProfileId: clientAProfileId });
  check("4: Phase 10B produces a real eligible adjustment proposal", engineResult.outcome === "proposal");

  async function persistAdjustment(coachSession: SupabaseClient, clientProfileId: string, result: typeof engineResult, title: string) {
    if (result.outcome !== "proposal") throw new Error("expected a proposal");
    const provenance: AdjustmentProvenance = { adjustmentType: result.proposal.adjustmentType, scope: result.proposal.scope, rationale: result.proposal.rationale, sourceFindingDomain: result.proposal.sourceFindingDomain, sourceFindingType: result.proposal.sourceFindingType, sourceEvidenceRefs: result.proposal.sourceEvidenceRefs, activeProgramVersionId: result.proposal.activeProgramVersionId, learnedRuleIdsUsed: result.proposal.learnedRuleIdsUsed, changeDescriptions: result.proposal.changeDescriptions, proposalSignature: result.proposal.proposalSignature };
    const content = { ...result.proposal.content, name: title, directionLabel: `Proposed adjustment: ${title}`, adjustmentProvenance: provenance };
    const { data: programFamily } = await coachSession.from("training_programs").insert({ workspace_id: workspaceId, created_by: coachA.id, title }).select("id").single();
    const { data: version, error } = await coachSession.from("training_program_versions").insert({ program_id: programFamily!.id, workspace_id: workspaceId, version_number: 1, status: "draft", content, created_by: coachA.id, proposed_for_client_profile_id: clientProfileId }).select("id, program_id").single();
    if (error) throw new Error(`persistAdjustment failed: ${error.message}`);
    return version!;
  }
  const adjVersionA = await persistAdjustment(coachASession, clientAProfileId, engineResult, "Adjustment — Schedule");
  check("the adjustment proposal is persisted as a real draft training_program_versions row", !!adjVersionA);

  console.log("\n5. Coach dashboard discovery shows exactly one new adjustment item; safety still outranks it (steps 5-7)\n");

  const discoveredA = await discoverPendingAdjustments(coachASession, workspaceId);
  check("A: exactly one pending adjustment proposal is discovered", discoveredA.length === 1);
  check("I: the discovered item carries the real client name", discoveredA[0]?.clientDisplayName === "Client A (schedule) 10C");
  check("J: the discovered item carries the real proposal type/rationale", discoveredA[0]?.adjustmentTypeLabel === "Schedule adjustment" && discoveredA[0]?.rationale === (engineResult.outcome === "proposal" ? engineResult.proposal.rationale : ""));
  check("K: the discovered item carries the real navigation target (client id + version id)", discoveredA[0]?.clientProfileId === clientAProfileId && discoveredA[0]?.versionId === adjVersionA.id);

  const realEscalation: EscalationLike = { id: escalationId, clientProfileId: clientSafetyProfileId, clientDisplayName: "Client Safety 10C", sourceMessageBody: null, reasonCategory: "pain_or_safety", status: "pending", proposedResponse: "Client reported knee discomfort during squats.", createdAtIso: nowIso, priority: 0, healthReviewStatus: null, documentedLimitations: null };
  const merged = mergeAttentionItems([attentionItemFromEscalation(realEscalation)], discoveredA.map((d) => attentionItemFromAdjustmentProposal(d)));
  check("5/6/L: the dashboard queue shows both real items, with the safety escalation ranked first, never outranked by the adjustment", merged.length === 2 && merged[0].escalationReason === "pain_or_safety" && !!merged[1].adjustmentProposal);
  check("7: the attention count increases correctly — exactly 2, never double-counted for one real proposal", merged.length === 2);

  console.log("\n6. Coach edits the proposal — it remains exactly one pending item (steps 9-11)\n");

  if (engineResult.outcome !== "proposal") throw new Error("expected a proposal for the edit step");
  const lastTouchedWeek = Math.max(...engineResult.proposal.changeDescriptions.map((c) => c.weekNumber));
  const originalDayForThatWeek = scheduleReferenceContent.weeks.find((w) => w.weekNumber === lastTouchedWeek)?.days.find((d) => d.dayOfWeek === conflictDay);
  const editedWeeks = engineResult.proposal.content.weeks.map((w) => (w.weekNumber === lastTouchedWeek ? { ...w, days: w.days.map((d) => (d.dayOfWeek === conflictDay ? originalDayForThatWeek! : d)) } : w));
  const editProvenance: AdjustmentProvenance = { adjustmentType: engineResult.proposal.adjustmentType, scope: engineResult.proposal.scope, rationale: engineResult.proposal.rationale, sourceFindingDomain: engineResult.proposal.sourceFindingDomain, sourceFindingType: engineResult.proposal.sourceFindingType, sourceEvidenceRefs: engineResult.proposal.sourceEvidenceRefs, activeProgramVersionId: engineResult.proposal.activeProgramVersionId, learnedRuleIdsUsed: engineResult.proposal.learnedRuleIdsUsed, changeDescriptions: engineResult.proposal.changeDescriptions, proposalSignature: engineResult.proposal.proposalSignature };
  const editedContentA = { ...engineResult.proposal.content, name: "Adjustment — Schedule", directionLabel: "Proposed adjustment: Schedule", weeks: editedWeeks, adjustmentProvenance: editProvenance };
  const { data: editedVersion, error: editError } = await coachASession.from("training_program_versions").insert({ program_id: adjVersionA.program_id, workspace_id: workspaceId, version_number: 2, status: "draft", content: editedContentA, created_by: coachA.id, proposed_for_client_profile_id: clientAProfileId }).select("id, program_id").single();
  if (editError) throw new Error(`edit insert failed: ${editError.message}`);
  await coachASession.from("training_program_versions").update({ status: "archived" }).eq("id", adjVersionA.id).eq("status", "draft");

  const discoveredAfterEdit = await discoverPendingAdjustments(coachASession, workspaceId);
  check("G/H: after an edit (version 2 replaces version 1 in the same family), exactly ONE pending adjustment item remains — never two", discoveredAfterEdit.length === 1 && discoveredAfterEdit[0].versionId === editedVersion!.id);

  console.log("\n7. Approval removes the item; a new active program is live (steps 12-14)\n");

  const { error: publishError } = await coachASession.from("training_program_versions").update({ status: "published", published_by: coachA.id, published_at: new Date().toISOString() }).eq("id", editedVersion!.id).eq("status", "draft");
  if (publishError) throw new Error(`publish failed: ${publishError.message}`);
  const { error: assignError } = await coachASession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: editedVersion!.id });
  if (assignError) throw new Error(`assign failed: ${assignError.message}`);

  const discoveredAfterApproval = await discoverPendingAdjustments(coachASession, workspaceId);
  check("O: after approval, the attention item is gone", discoveredAfterApproval.length === 0);
  const { data: activeAfterApproval } = await coachASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientAProfileId).eq("status", "active").maybeSingle();
  check("14: the new approved version is now genuinely active", activeAfterApproval?.program_version_id === editedVersion!.id);

  console.log("\n8. A second valid proposal (Client B) is rejected — the item disappears and does not respawn (steps 15-17)\n");

  for (const d of scheduledDates) {
    if (conflictDates.slice(0, 3).includes(d)) await insertSessionObservation(clientBSession, { workspaceId, clientProfileId: clientBProfileId, dateIso: d, status: "skipped", skipReason: "schedule-conflict" });
    else await insertSessionObservation(clientBSession, { workspaceId, clientProfileId: clientBProfileId, dateIso: d, status: "completed" });
  }
  const clientBObservations = await fetchObservationsLive(coachASession, clientBProfileId, addDaysToLocalDate(todayIso, -83));
  const clientBAnalysis = analyzeClientState({ clientProfileId: clientBProfileId, observations: clientBObservations, scheduledTrainingDates: scheduledDates, activeSafetyRestriction: false, nowIso });
  const clientBFinding = selectFindingsForCoachUI(clientBAnalysis).find((f) => f.finding.findingType === "recurring_schedule_conflict");
  const engineResultB = clientBFinding ? evaluateAdjustmentForFinding({ finding: clientBFinding.finding, observations: clientBObservations, activeContent: scheduleReferenceContent, activeProgramVersionId: versionBId, com, applicableRules: [], avoidedTerms: [], currentProgramWeek, clientProfileId: clientBProfileId }) : null;
  check("15: a real, legitimate second adjustment proposal is generated for Client B", engineResultB?.outcome === "proposal");
  const adjVersionB = await persistAdjustment(coachASession, clientBProfileId, engineResultB!, "Adjustment — Schedule (B)");

  const discoveredBeforeReject = await discoverPendingAdjustments(coachASession, workspaceId);
  check("Client B's proposal is discoverable before rejection", discoveredBeforeReject.some((d) => d.versionId === adjVersionB.id));

  await coachASession.from("training_program_versions").update({ status: "archived" }).eq("id", adjVersionB.id).eq("status", "draft");
  const discoveredAfterReject = await discoverPendingAdjustments(coachASession, workspaceId);
  check("P: after rejection, the attention item disappears", !discoveredAfterReject.some((d) => d.versionId === adjVersionB.id));
  const { data: activeAfterReject } = await coachASession.from("program_assignments").select("program_version_id").eq("client_profile_id", clientBProfileId).eq("status", "active").maybeSingle();
  check("rejection leaves Client B's active program unchanged", activeAfterReject?.program_version_id === versionBId);

  console.log("\n9. Staleness — a proposal whose active version has since changed is excluded from discovery (F)\n");

  // Create a third real active version for Client A directly (simulating
  // some OTHER later program change) — the earlier edited/approved
  // version is still what adjustmentProvenance would reference for a NEW
  // hypothetical proposal built against the version BEFORE this change.
  const { data: staleTestVersion } = await coachASession.from("training_program_versions").insert({ program_id: adjVersionA.program_id, workspace_id: workspaceId, version_number: 3, status: "draft", content: { ...scheduleReferenceContent, name: "Later change" }, created_by: coachA.id }).select("id").single();
  await coachASession.from("training_program_versions").update({ status: "published", published_by: coachA.id, published_at: new Date().toISOString() }).eq("id", staleTestVersion!.id);
  await coachASession.rpc("assign_active_program_version", { p_client_profile_id: clientAProfileId, p_program_version_id: staleTestVersion!.id });
  // Now persist a new "pending" adjustment draft that still claims the
  // OLD (now no-longer-active) version as its basis.
  const staleAdjustment = await persistAdjustment(coachASession, clientAProfileId, engineResult, "Adjustment — Stale");
  const discoveredWithStale = await discoverPendingAdjustments(coachASession, workspaceId);
  check("F: a proposal built against a version that is no longer active is excluded from discovery, never actionable", !discoveredWithStale.some((d) => d.versionId === staleAdjustment.id));

  console.log("\n10. Security — unrelated coach, cross-workspace coach, and client are all denied (steps 18-19)\n");

  // A genuinely current, non-stale pending proposal must exist while
  // running these checks — otherwise "discovers zero" would be true
  // regardless of RLS and would prove nothing.
  const engineResultForSecurity = evaluateAdjustmentForFinding({ finding: scheduleFinding!.finding, observations: clientAObservations, activeContent: scheduleReferenceContent, activeProgramVersionId: staleTestVersion!.id as string, com, applicableRules: [], avoidedTerms: [], currentProgramWeek, clientProfileId: clientAProfileId });
  check("a genuinely current adjustment proposal exists to exercise RLS against", engineResultForSecurity.outcome === "proposal");
  const securityTestAdjustment = await persistAdjustment(coachASession, clientAProfileId, engineResultForSecurity, "Adjustment — Security Check");
  const discoveredByCoachA = await discoverPendingAdjustments(coachASession, workspaceId);
  check("the workspace owner genuinely discovers the current pending proposal", discoveredByCoachA.some((d) => d.versionId === securityTestAdjustment.id));

  // training_program_versions_select alone is workspace-staff-wide (any
  // 'coach' role in the same workspace — see app_private.is_workspace_staff),
  // but discoverPendingAdjustments's embedded client_profiles!...(display_name)
  // join is resolved under the SAME caller's RLS — and client_profiles_select
  // is scoped to app_private.can_access_client (self / workspace admin /
  // assigned coach only), not workspace-staff-wide. A coach who is staff but
  // not assigned to this specific client can't resolve that embedded row, so
  // PostgREST drops the whole joined row. Net effect, verified live here: a
  // same-workspace but unassigned coach discovers zero items for a client
  // they don't coach — a real, pre-existing assignment-scoped boundary this
  // phase inherits for free, not a Phase 10C regression to "fix".
  const discoveredByCoachB = await discoverPendingAdjustments(coachBSession, workspaceId);
  check("Q: a same-workspace coach who is not assigned to this client discovers zero items for it (assignment-scoped via the embedded client_profiles join's own RLS)", discoveredByCoachB.length === 0);
  const discoveredByOtherCoach = await discoverPendingAdjustments(otherCoachSession, workspaceId);
  check("R: a cross-workspace coach discovers zero adjustment items", discoveredByOtherCoach.length === 0);
  const { data: clientReadsVersions } = await clientASession.from("training_program_versions").select("id").eq("workspace_id", workspaceId).eq("status", "draft");
  check("S: a client cannot read any draft/pending training_program_versions row at all", (clientReadsVersions ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
