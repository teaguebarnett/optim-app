// Gate U2 — LOCAL-ONLY end-to-end proof that a Unified Program proposal persists as a real parent row linking genuine
// DRAFT domain content, under a real coach session (RLS) against the local Supabase stack with migration 034 applied.
// Refuses to run against anything but 127.0.0.1. Scripted domain models (no paid calls).
//
//   npx supabase start && node --experimental-strip-types scripts/e2e-unified-drafts.mts

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runUnifiedProgram, type DomainResults } from "../lib/synthesis/unified/orchestrate.ts";
import type { UnifiedProgramProposal } from "../lib/synthesis/unified/contract.ts";
import { FOUNDATION_KNOWLEDGE } from "../lib/synthesis/knowledge/registry.ts";
import { sha256 } from "../lib/synthesis/reasoner/run.ts";
import { beginUnifiedProposal, completeUnifiedProposal, unifiedIdempotencyKey, type UnifiedArtifacts, type UnifiedRow } from "../lib/production/unified-drafts.ts";
import { insertDraftProgramVersion } from "../lib/production/draft-versions.ts";
import { validateSession, validateUniversalTrainingProgramContent } from "../lib/production/validation.ts";
import { createInitialState, reducer, buildStartedWorkoutSession } from "../lib/state.ts";
import { describeContinuousTarget } from "../lib/workout/continuous.ts";
import { describeIntervalOverview, describeIntervalPhaseTarget } from "../lib/workout/interval.ts";
import { fullCoach, LOWER, programContent, restrict, routerModel, scenarioInput, UPPER } from "../lib/synthesis/unified/eval/fixtures.ts";
import type { GenerationInputs, Session, UniversalTrainingProgramContent } from "../lib/training/types.ts";
import type { SynthesisInput } from "../lib/synthesis/synthesis-input.ts";
import type { ConfirmedCoachMethod } from "../lib/coach/coach-brain.ts";

function readLocalStatus(): Record<string, string> {
  const raw = execSync("npx supabase status -o env", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString();
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const st = readLocalStatus();
if (!st.API_URL?.includes("127.0.0.1")) {
  console.error(`Refusing to run: API_URL "${st.API_URL}" isn't the local stack. This script is local-only.`);
  process.exit(1);
}
const admin = createClient(st.API_URL, st.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const RUN = Date.now().toString(36);
const PASSWORD = `e2e-${randomUUID()}`;
const NOW = new Date().toISOString();

let passed = 0;
let failed = 0;
function check(description: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok  - ${description}`);
  } else {
    failed++;
    console.log(`  FAIL  - ${description}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`);
  }
}

async function user(tag: string) {
  const email = `e2e-u2-${tag}-${RUN}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: tag } });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  const session = createClient(st.API_URL, st.ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await session.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw new Error(`signIn ${tag}: ${e2.message}`);
  return { id: data.user.id, session };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- e2e: rows are checked field by field below
async function must(p: PromiseLike<{ data: any; error: { message: string } | null }>, what: string): Promise<any> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
async function workspace(owner: string, name: string) {
  const ws = await must(admin.from("workspaces").insert({ owner_user_id: owner, display_name: name, business_name: name }).select("id").single(), "workspace");
  await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: owner, role: "workspace_owner" }), "membership");
  return ws.id as string;
}
/** A real, confirmed coach_method_versions row carrying the fixture method (so provenance FKs are real). */
const brains = new Map<string, string>();
async function methodRow(ws: string, coach: string, method: ConfirmedCoachMethod) {
  const brain = brains.has(`${ws}:${coach}`) ? { id: brains.get(`${ws}:${coach}`) } : await must(admin.from("coach_brains").insert({ workspace_id: ws, coach_user_id: coach }).select("id").single(), "coach_brain");
  brains.set(`${ws}:${coach}`, brain.id);
  const mv = await must(admin.from("coach_method_versions").insert({ brain_id: brain.id, workspace_id: ws, coach_user_id: coach, version: method.version, source: "calibration", operating_model: method.operatingModel, ai_authority: method.aiAuthority ?? {}, calibration_answers: method.operatingModel.calibration?.answers ?? {}, confirmed_by: coach }).select("id").single(), "coach_method_version");
  return mv.id as string;
}
const withMethod = (input: SynthesisInput, versionId: string): SynthesisInput => ({ ...input, coach: input.coach ? { ...input.coach, versionId } : null });
const generationInputs = (versionId: string): GenerationInputs => ({ version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: versionId, playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } });

/** The production sequence: key → begin → (orchestrate only if needed) → complete. */
async function persist(session: SupabaseClient, uid: string, p: { ws: string; client: string; title: string; input: SynthesisInput; approved?: { versionId: string; content: UniversalTrainingProgramContent }; failBefore?: "nutrition"; methodVersionId: string }) {
  const src = p.approved ? { resistanceSource: "approved_program", sourceVersionId: p.approved.versionId, sourceContentHash: sha256(p.approved.content) } : { resistanceSource: "proposed_program", sourceVersionId: null, sourceContentHash: null };
  const key = unifiedIdempotencyKey({ clientStateHash: sha256(p.input.client), goalContractHash: sha256(p.input.goal), coachMethodVersionId: p.methodVersionId, title: p.title, unifiedVersion: "unified-program-u1.0.0", ...src });
  const begun = await beginUnifiedProposal(session, uid, { workspaceId: p.ws, clientProfileId: p.client, title: p.title, idempotencyKey: key, nowMs: Date.now() });
  if (begun.kind === "existing" || begun.kind === "in_progress") return { begun, key, proposal: null, result: null };
  let proposal: UnifiedProgramProposal;
  let artifacts: UnifiedArtifacts;
  let rowLinks: Partial<UnifiedRow> = {};
  if (begun.kind === "resume" && (begun.row.proposal as UnifiedProgramProposal).schema) {
    // Retry: rebuild from what was stored — never recompute (the linked drafts must stay coherent with it).
    proposal = begun.row.proposal as UnifiedProgramProposal;
    artifacts = begun.row.domain_runs as UnifiedArtifacts;
    rowLinks = begun.row;
  } else {
    let results: DomainResults | null = null;
    proposal = await runUnifiedProgram({ input: p.input, model: routerModel(), nowIso: NOW, approvedResistance: p.approved ?? null, maxAttempts: 1, onResults: (r) => (results = r) });
    const r = results as DomainResults | null;
    artifacts = {
      resistance: p.approved ? { source: "approved_program", versionId: p.approved.versionId, content: p.approved.content } : r?.resistance?.status === "PLANNED" ? { source: "proposed_program", result: r.resistance, generationInputs: generationInputs(p.methodVersionId) } : { source: "none" },
      cardio: r?.cardio ?? null,
      nutrition: r?.nutrition ?? null,
    };
  }
  const rowId = begun.kind === "started" ? begun.rowId : begun.row.id;
  const result = await completeUnifiedProposal(session, uid, { row: { id: rowId, training_program_version_id: rowLinks.training_program_version_id, nutrition_plan_version_id: rowLinks.nutrition_plan_version_id }, workspaceId: p.ws, clientProfileId: p.client, coachId: uid, title: p.title, nowIso: NOW, proposal, artifacts, knowledge: FOUNDATION_KNOWLEDGE, failBefore: p.failBefore });
  return { begun, key, proposal, result, rowId };
}

function startWorkout(session: Session) {
  const base = createInitialState();
  return { ...base, workoutSession: buildStartedWorkoutSession({ existingSession: base.workoutSession, workoutId: session.id, resolvedWorkout: null, trainingSession: session, nowIso: NOW }) };
}

console.log("\nGate U2 — unified drafts, persisted locally under real RLS\n");

// ---------------------------------------------------------------------------------------------------------------
const coachA = await user("coach-a");
const coachB = await user("coach-b");
const clientA = await user("client-a");
const wsA = await workspace(coachA.id, `U2 A ${RUN}`);
const wsB = await workspace(coachB.id, `U2 B ${RUN}`);
await must(admin.from("workspace_memberships").insert({ workspace_id: wsA, user_id: clientA.id, role: "client" }), "client membership");
const clientRow = await must(admin.from("client_profiles").insert({ workspace_id: wsA, user_id: clientA.id, display_name: "U2 Client A" }).select("id").single(), "client");
const CLIENT = clientRow.id as string;
await must(admin.from("coach_client_assignments").insert({ workspace_id: wsA, coach_user_id: coachA.id, client_profile_id: CLIENT, is_primary: true }), "assignment");
const coachMethod = fullCoach();
const MV = await methodRow(wsA, coachA.id, coachMethod);
const strengthInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { what_you_want: { primaryGoal: "get_stronger", successDefinition: "Squat 180 kg without getting gassed" }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] } } }), MV);
const versionsFor = async () => (await must(admin.from("training_program_versions").select("id").eq("workspace_id", wsA), "versions")).length;

console.log("1. Proposed lifting + executable cardio + nutrition → one parent row linking real drafts\n");
const r1 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified program", input: strengthInput, methodVersionId: MV });
check("orchestration produced a reviewable program", ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"].includes(r1.proposal?.status ?? ""), r1.proposal?.status);
check("the parent row is a reviewable draft (draft_ready / needs_coach_decision)", ["draft_ready", "needs_coach_decision"].includes(r1.result?.status ?? ""), r1.result);
const row1 = await must(coachA.session.from("unified_program_proposals").select("*").eq("id", r1.rowId!).single(), "row1");
check("row is proposed (never approved), owned by coach A's workspace and this client", row1.approval_state === "proposed" && row1.workspace_id === wsA && row1.client_profile_id === CLIENT && row1.requested_by === coachA.id);
check("row records provenance: coach method version, client/goal hashes, unified version, domain runs", row1.coach_method_version_id === MV && row1.client_state_hash === sha256(strengthInput.client) && row1.unified_version === "unified-program-u1.0.0" && !!row1.domain_runs?.cardio?.run && row1.resistance_source === "proposed_program");
const tv = await must(coachA.session.from("training_program_versions").select("id, status, content, proposed_for_client_profile_id").eq("id", row1.training_program_version_id).single(), "training version");
const content = tv.content as UniversalTrainingProgramContent;
check("linked training version is a DRAFT for this client, kept out of the legacy pending-proposal lookup", tv.status === "draft" && content.clientId === CLIENT && tv.proposed_for_client_profile_id === null);
let valid = true;
try {
  validateUniversalTrainingProgramContent(content);
} catch (e) {
  valid = false;
  console.log(`        ${(e as Error).message}`);
}
check("persisted content passes the production program validator", valid);
const allSessions = content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).map((s) => ({ w: w.weekNumber, s }))));
const cardioSessions = allSessions.filter((x) => x.s.id.startsWith("cardio-"));
const liftSessions = allSessions.filter((x) => !x.s.id.startsWith("cardio-"));
check("lifting AND cardio sessions coexist in the one program", cardioSessions.length > 0 && liftSessions.length > 0, { cardio: cardioSessions.length, lift: liftSessions.length });
check("cardio uses CR10 effort, never a resistance RPE", cardioSessions.every(({ s }) => s.blocks[0].items.every((i) => i.prescription.effort?.scale === "cr10" && i.prescription.rpe === undefined)));
check("content carries unified provenance (proposal run, cardio run and weeks)", content.unifiedProvenance?.proposalRunId === r1.proposal!.runId && !!content.unifiedProvenance?.cardio?.runId);

console.log("\n2. The persisted cardio executes in the real workout engine\n");
const steady = cardioSessions.find(({ s }) => s.blocks[0].items[0].prescription.family === "continuous")!.s;
validateSession(steady, "persisted steady cardio");
let state = startWorkout(steady);
const item = steady.blocks[0].items[0];
check("a steady cardio session starts as a workout with its continuous item current", state.workoutSession.currentExerciseId === item.id);
const lines = describeContinuousTarget(item.prescription);
check("the client sees duration and CR10 effort (e.g. 'Moderate — effort 4–5/10 …')", lines.some((l) => /min$/.test(l)) && lines.some((l) => /effort \d(–\d+)?\/10/.test(l)), lines);
state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
state = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: item.id, actual: { duration: { seconds: item.prescription.duration!.seconds } } });
check("logging the prescribed duration completes it as prescribed", state.workoutSession.continuousExecutions?.[item.id]?.performedAsPrescribed === true && state.workoutSession.phase === "session-summary");
const interval = cardioSessions.find(({ s }) => s.blocks[0].items[0].prescription.family === "interval")?.s;
if (interval) {
  validateSession(interval, "persisted interval cardio");
  const ip = interval.blocks[0].items[0];
  let istate = startWorkout(interval);
  istate = reducer(istate, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: ip.id });
  for (let k = 0; k < ip.prescription.rounds! * 2; k++) istate = reducer(istate, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: ip.id });
  istate = reducer(istate, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: ip.id });
  check("an interval cardio session runs every round and finalizes as completed", istate.workoutSession.continuousExecutions?.[ip.id]?.status === "completed" && istate.workoutSession.phase === "session-summary", istate.workoutSession.continuousExecutions?.[ip.id]);
  check("interval work and recovery phases show CR10 effort", describeIntervalOverview(ip.prescription).some((l) => /effort/.test(l)) && describeIntervalPhaseTarget(ip.prescription, "recovery").some((l) => /effort/.test(l)));
} else check("(no interval session in this program — interval execution covered offline)", true);

console.log("\n3. Nutrition draft linked; nothing approved, published, assigned or activated\n");
const nv = await must(coachA.session.from("nutrition_plan_versions").select("status, content").eq("id", row1.nutrition_plan_version_id).single(), "nutrition version");
check("nutrition draft linked with real numeric targets and NO approval stamp", nv.status === "draft" && typeof nv.content.targets?.calories === "number" && nv.content.approvedAtIso === "");
check("no program or nutrition assignment exists for the client", (await must(admin.from("program_assignments").select("id").eq("client_profile_id", CLIENT), "pa")).length === 0 && (await must(admin.from("nutrition_plan_assignments").select("id").eq("client_profile_id", CLIENT), "na")).length === 0);
check("no enrollment was created or activated", (await must(admin.from("client_enrollments").select("id").eq("client_profile_id", CLIENT), "enr")).length === 0);

console.log("\n4. Idempotent retry: the same request returns the same row, creates nothing\n");
const before = await versionsFor();
const r1b = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified program", input: strengthInput, methodVersionId: MV });
check("the same request finds the existing proposal (no orchestration, no new drafts)", r1b.begun.kind === "existing" && (r1b.begun as { row: UnifiedRow }).row.id === r1.rowId && (await versionsFor()) === before);

console.log("\n5. Workspace and client isolation\n");
check("coach B (other workspace) can't see the proposal", (await must(coachB.session.from("unified_program_proposals").select("id").eq("id", r1.rowId!), "b read")).length === 0);
check("coach B can't see the linked drafts", (await must(coachB.session.from("training_program_versions").select("id").eq("id", row1.training_program_version_id), "b drafts")).length === 0);
const { error: hijack } = await coachB.session.from("unified_program_proposals").insert({ workspace_id: wsA, client_profile_id: CLIENT, requested_by: coachB.id, idempotency_key: "hijack", title: "x" });
check("coach B can't create a proposal in workspace A", !!hijack);
check("client A can't read the proposal or its drafts", (await must(clientA.session.from("unified_program_proposals").select("id"), "c read")).length === 0 && (await must(clientA.session.from("training_program_versions").select("id").eq("id", row1.training_program_version_id), "c drafts")).length === 0);
const bDraft = await insertDraftProgramVersion(coachB.session, coachB.id, { workspaceId: wsB, title: "B", content: { ...content, workspaceId: wsB } });
const { error: crossLink } = await coachA.session.from("unified_program_proposals").update({ training_program_version_id: bDraft.versionId }).eq("id", r1.rowId!);
check("coach A can't link a draft from another workspace (trigger / RLS)", !!crossLink);

console.log("\n6. An approved program is input only: never changed, a separate draft is proposed\n");
const approvedContent = { ...programContent([{ day: "Monday", exercises: LOWER }, { day: "Tuesday", exercises: UPPER }, { day: "Thursday", exercises: LOWER }, { day: "Friday", exercises: UPPER }], 8), clientId: CLIENT, workspaceId: wsA, coachId: coachA.id };
const appr = await insertDraftProgramVersion(coachA.session, coachA.id, { workspaceId: wsA, title: "Approved", content: approvedContent });
await must(coachA.session.from("training_program_versions").update({ status: "published", published_at: NOW, published_by: coachA.id }).eq("id", appr.versionId), "publish");
const assignmentId = await must(coachA.session.rpc("assign_active_program_version", { p_client_profile_id: CLIENT, p_program_version_id: appr.versionId }), "assign");
const apprBefore = await must(admin.from("training_program_versions").select("status, content, published_at").eq("id", appr.versionId).single(), "appr before");
const fatLossInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { what_you_want: { primaryGoal: "lose_fat" }, about_you: { age: 34, sex: "male", heightFeet: 5, heightInchesRemainder: 10, weightLb: 215, weightDirection: "stable" }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] } } }), MV);
const r2 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified fat loss", input: fatLossInput, approved: { versionId: appr.versionId, content: approvedContent }, methodVersionId: MV });
const apprAfter = await must(admin.from("training_program_versions").select("status, content, published_at").eq("id", appr.versionId).single(), "appr after");
check("a unified draft was created around the approved lifting", ["draft_ready", "needs_coach_decision"].includes(r2.result?.status ?? ""), r2.result);
check("the approved version is byte-for-byte unchanged and still published", JSON.stringify(apprBefore) === JSON.stringify(apprAfter) && apprAfter.status === "published");
const assignment = await must(admin.from("program_assignments").select("id, program_version_id, status").eq("client_profile_id", CLIENT), "assignment after");
check("the client's active assignment still points at the approved version", assignment.length === 1 && assignment[0].id === assignmentId && assignment[0].program_version_id === appr.versionId);
const row2 = await must(coachA.session.from("unified_program_proposals").select("training_program_version_id, source_resistance_version_id, resistance_source").eq("id", r2.rowId!).single(), "row2");
check("the new draft is a separate version; the approved one is recorded as its source", row2.training_program_version_id !== appr.versionId && row2.source_resistance_version_id === appr.versionId && row2.resistance_source === "approved_program");

console.log("\n7. Failure recovery: a failure after the training draft resumes on the same row without duplicates\n");
const recInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { what_you_want: { primaryGoal: "build_muscle" }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] } } }), MV);
const vBefore = await versionsFor();
const r3 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified recovery", input: recInput, failBefore: "nutrition", methodVersionId: MV });
const row3a = await must(coachA.session.from("unified_program_proposals").select("status, failure_category, training_program_version_id, nutrition_plan_version_id").eq("id", r3.rowId!).single(), "row3a");
check("the simulated failure leaves a failed row with its training draft linked and no nutrition", row3a.status === "failed" && row3a.failure_category === "draft_not_saved" && !!row3a.training_program_version_id && !row3a.nutrition_plan_version_id);
const r3b = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified recovery", input: recInput, methodVersionId: MV });
const row3b = await must(coachA.session.from("unified_program_proposals").select("status, training_program_version_id, nutrition_plan_version_id").eq("id", r3.rowId!).single(), "row3b");
check("the retry resumed the same row from its stored proposal", r3b.begun.kind === "resume" && r3b.rowId === r3.rowId);
check("…reused the same training draft and completed nutrition (exactly one new program version)", row3b.training_program_version_id === row3a.training_program_version_id && !!row3b.nutrition_plan_version_id && ["draft_ready", "needs_coach_decision"].includes(row3b.status) && (await versionsFor()) === vBefore + 1);

console.log("\n8. Blocked, missing and non-representable domains are recorded honestly\n");
const blockedInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { what_you_want: { primaryGoal: "build_muscle" }, your_week: { availableDays: [], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"] } } }), MV);
const vb = await versionsFor();
const r4 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified blocked", input: blockedInput, methodVersionId: MV });
check("no available days → needs_input row, 0 model calls, no drafts", r4.result?.status === "needs_input" && r4.proposal?.provenance.modelCalls === 0 && (await versionsFor()) === vb);
const proteinCoach = fullCoach({ n_approach: ["calories_protein"] });
const MV2 = await methodRow(wsA, coachA.id, { ...proteinCoach, version: 8 });
const npInput = withMethod(scenarioInput({ clientId: CLIENT, coach: proteinCoach, patch: { what_you_want: { primaryGoal: "build_muscle" }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] } } }), MV2);
const r5 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified calories-protein", input: npInput, methodVersionId: MV2 });
const row5 = await must(coachA.session.from("unified_program_proposals").select("status, nutrition_plan_version_id, nutrition_strategy, training_program_version_id").eq("id", r5.rowId!).single(), "row5");
check("a calories-and-protein strategy isn't forced into fake macros: no nutrition draft, strategy kept with the reason", !row5.nutrition_plan_version_id && /stores single calorie and macro targets/.test(row5.nutrition_strategy?.reason ?? "") && !!row5.nutrition_strategy?.strategy && !!row5.training_program_version_id, row5);
const cardioOff = fullCoach({ t_cardio_roles: ["fat_loss"] });
const MV3 = await methodRow(wsA, coachA.id, { ...cardioOff, version: 9 });
const coInput = withMethod(scenarioInput({ clientId: CLIENT, coach: cardioOff, patch: { what_you_want: { primaryGoal: "build_muscle", secondaryGoals: ["get_stronger"] }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] } } }), MV3);
const r6 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified fat-loss-cardio coach", input: coInput, methodVersionId: MV3 });
const t6 = r6.result?.trainingVersionId ? await must(coachA.session.from("training_program_versions").select("content").eq("id", r6.result.trainingVersionId).single(), "t6") : null;
check("a coach whose cardio is only for fat loss, with a muscle-gain client (the real test client's setup): no cardio forced", r6.proposal?.domains.cardio.status === "NOT_COACHED" && !!t6 && !(t6.content as UniversalTrainingProgramContent).weeks.some((w) => w.days.some((d) => (d.sessions ?? []).some((s) => s.id.startsWith("cardio-")))), r6.proposal?.domains.cardio);

console.log("\n9. Single-flight\n");
await must(coachA.session.from("unified_program_proposals").insert({ workspace_id: wsA, client_profile_id: CLIENT, requested_by: coachA.id, idempotency_key: `inflight-${RUN}`, title: "in flight" }), "inflight insert");
const busy = await beginUnifiedProposal(coachA.session, coachA.id, { workspaceId: wsA, clientProfileId: CLIENT, title: "another", idempotencyKey: `other-${RUN}`, nowMs: Date.now() });
check("a second request while one is preparing is reported in progress, not duplicated", busy.kind === "in_progress");

console.log("\n10. Safety aligned with the canonical coach health review\n");
// Finish section 9's deliberately in-flight request so this client can start new proposals.
await must(coachA.session.from("unified_program_proposals").update({ status: "failed", failure_category: "superseded" }).eq("idempotency_key", `inflight-${RUN}`), "finish inflight");
const DOC = "No squats or lower body compounds like leg press; no bracing; no ab work.";
const review = (extra: Record<string, unknown> = {}) => ({ clientId: CLIENT, workspaceId: wsA, status: "proceed_with_limitations", reasons: ["Flagged being advised to limit or avoid exercise."], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: DOC, ...extra }) as never;
const flagged = { what_you_want: { primaryGoal: "build_muscle" }, health_finish: { hasInjuryHistory: false, safetyScreen: ["advised_limit", "joint_muscular"] }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] } };
const contradiction = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: flagged, healthReview: review({ structuredLimitations: { schema: 1, sourceText: DOC, restrictions: [], noExerciseRestrictions: true, confirmedBy: coachA.id, confirmedAtIso: NOW, interpretation: { interpreter: { kind: "manual", reason: "x" }, proposedOptionIds: [], removedOptionIds: [], addedOptionIds: [], clarifications: [] } } }) }), MV);
const vc = await versionsFor();
const r7 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified contradiction", input: contradiction, methodVersionId: MV });
const row7 = await must(coachA.session.from("unified_program_proposals").select("status, proposal, training_program_version_id").eq("id", r7.rowId!).single(), "row7");
check("a review whose structured confirmation contradicts its documented limits → needs_input row, decision recorded, 0 calls, no drafts", row7.status === "needs_input" && !row7.training_program_version_id && (row7.proposal.decisions ?? []).some((d: { about: string }) => d.about === "confirm_structured_limitations") && row7.proposal.provenance.modelCalls === 0 && (await versionsFor()) === vc);
const confirmed = restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }, { kind: "avoid_movement_pattern", pattern: "hinge" }, { kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]).map((r) => ({ ...r, interprets: [`${CLIENT}:coach_documented_limitation`] }));
const reviewedInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { ...flagged, what_you_want: { primaryGoal: "get_stronger" } }, healthReview: review(), restrictions: confirmed }), MV);
const r8 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified reviewed", input: reviewedInput, methodVersionId: MV });
const row8 = await must(coachA.session.from("unified_program_proposals").select("status, proposal, training_program_version_id, nutrition_plan_version_id").eq("id", r8.rowId!).single(), "row8");
const t8 = await must(coachA.session.from("training_program_versions").select("content").eq("id", row8.training_program_version_id).single(), "t8");
const t8c = t8.content as UniversalTrainingProgramContent;
check("reviewed limitations: lifting + nutrition drafts persisted, cardio held for clearance (domain-only), row needs a coach decision", row8.status === "needs_coach_decision" && !!row8.nutrition_plan_version_id && row8.proposal.domains.cardio.status === "ESCALATE" && (row8.proposal.decisions ?? []).some((d: { about: string }) => d.about === "cardio_clearance") && !t8c.weeks.some((w) => w.days.some((d) => (d.sessions ?? []).some((x) => x.id.startsWith("cardio-")))), row8.proposal?.domains);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
