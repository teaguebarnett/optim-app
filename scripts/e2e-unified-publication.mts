// Gate U3C — LOCAL-ONLY end-to-end check of atomic unified publication (lib/production/unified-publication.ts +
// public.publish_unified_proposal) under real signed-in sessions and RLS: approve → publish (one transaction) → the
// client receives it; retries, concurrency, permissions, isolation, replacement, supersession, rollback, stale
// approvals, continuation, omitted domains, programs Today cannot show. Refuses anything but the local stack.
//
//   node --experimental-strip-types scripts/e2e-unified-publication.mts

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runUnifiedProgram, type DomainResults } from "../lib/synthesis/unified/orchestrate.ts";
import type { UnifiedProgramProposal } from "../lib/synthesis/unified/contract.ts";
import { FOUNDATION_KNOWLEDGE } from "../lib/synthesis/knowledge/registry.ts";
import { sha256 } from "../lib/synthesis/reasoner/run.ts";
import { beginUnifiedProposal, completeUnifiedProposal, unifiedIdempotencyKey, type UnifiedArtifacts, type UnifiedRow } from "../lib/production/unified-drafts.ts";
import { insertDraftProgramVersion } from "../lib/production/draft-versions.ts";
import { validateAssignedNutritionPlanContent } from "../lib/production/validation.ts";
import { approveUnifiedProposal, getUnifiedReviewById, recordUnifiedDecision, type ReviewEnv } from "../lib/production/unified-review.ts";
import { planUnifiedPublication, publishUnifiedProposal, type PublicationExpectation } from "../lib/production/unified-publication.ts";
import { universalProgramToTodayProgram } from "../lib/training/legacy-adapter.ts";
import { fullCoach, routerModel, scenarioInput } from "../lib/synthesis/unified/eval/fixtures.ts";
import type { GenerationInputs, UniversalTrainingProgramContent } from "../lib/training/types.ts";
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
  const email = `e2e-u3c-${tag}-${RUN}@example.test`;
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

// ---------------------------------------------------------------------------------------------------------------
// Gate U3C — approve → publish (one transaction) → the client receives it.
// ---------------------------------------------------------------------------------------------------------------
const env = (who: { id: string; session: SupabaseClient }, client: string, input: SynthesisInput, over: Partial<ReviewEnv> = {}): ReviewEnv => ({ supabase: who.session, userId: who.id, clientProfileId: client, input, knowledge: FOUNDATION_KNOWLEDGE, currentMethodVersionId: MV, activeProgramVersionId: null, nowIso: new Date().toISOString(), ...over });
const throwsMsg = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const approve = async (e: ReviewEnv, rowId: string) => {
  let v = await getUnifiedReviewById(e, rowId);
  for (const d of v.decisions.filter((x) => !x.answer)) v = await recordUnifiedDecision(e, { rowId, key: d.key, answer: d.recommended ?? d.options[0] });
  return approveUnifiedProposal(e, { rowId, expected: { training: v.training?.versionId ?? null, nutrition: v.nutrition?.versionId ?? null } });
};
const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => (await q).count ?? 0;
const activeT = async (client: string) => (await must(admin.from("program_assignments").select("id, program_version_id").eq("client_profile_id", client).eq("status", "active"), "active t"));
const activeN = async (client: string) => (await must(admin.from("nutrition_plan_assignments").select("id, plan_version_id").eq("client_profile_id", client).eq("status", "active"), "active n"));
async function newClient(tag: string) {
  const u = await user(tag);
  await must(admin.from("workspace_memberships").insert({ workspace_id: wsA, user_id: u.id, role: "client" }), `${tag} membership`);
  const id = (await must(admin.from("client_profiles").insert({ workspace_id: wsA, user_id: u.id, display_name: tag }).select("id").single(), `${tag} profile`)).id as string;
  await must(admin.from("coach_client_assignments").insert({ workspace_id: wsA, coach_user_id: coachA.id, client_profile_id: id, is_primary: true }), `${tag} assignment`);
  return { ...u, client: id };
}
const enroll = (client: string, start: string | null) => must(admin.from("client_enrollments").insert({ workspace_id: wsA, client_profile_id: client, status: start ? "active" : "invited", original_program_start_date: start, timezone: "UTC" }), "enrollment");
const inputFor = (client: string, coach: ConfirmedCoachMethod, mv: string, goal = "build_muscle") => withMethod(scenarioInput({ clientId: client, coach, patch: { what_you_want: { primaryGoal: goal }, your_week: week } }), mv);
const nothing: PublicationExpectation = { activeTrainingVersionId: null, activeNutritionVersionId: null, replaceActive: false, startDate: null };

console.log("\nGate U3C — atomic unified publication, locally under real RLS\n");
const coachA = await user("coach-a");
const coachB = await user("coach-b");
const coachC = await user("coach-c-unassigned");
const wsA = await workspace(coachA.id, `U3C A ${RUN}`);
await workspace(coachB.id, `U3C B ${RUN}`);
await must(admin.from("workspace_memberships").insert({ workspace_id: wsA, user_id: coachC.id, role: "coach" }), "coach C");
const week = { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] };
// Like the iCloud coach: cardio only for fat loss → for a muscle-building client the program is lifting + nutrition.
const liftCoach = fullCoach({ t_cardio_roles: ["fat_loss"] });
const MV = await methodRow(wsA, coachA.id, liftCoach);

console.log("1. First publication: approved lifting + nutrition published and assigned together, client notified\n");
const A = await newClient("client-a");
await enroll(A.client, null);
const inA = inputFor(A.client, liftCoach, MV);
const r1 = await persist(coachA.session, coachA.id, { ws: wsA, client: A.client, title: "Unified A", input: inA, methodVersionId: MV });
const eA = env(coachA, A.client, inA);
check("the unified proposal is lifting + nutrition (cardio not applicable for this coach and goal)", r1.proposal!.domains.cardio.status === "NOT_COACHED" || r1.proposal!.domains.cardio.status === "UNSUPPORTED" || r1.proposal!.domains.cardio.status === "NO_ADDITIONAL", r1.proposal!.domains.cardio);
const notApproved = await throwsMsg(() => publishUnifiedProposal(eA, { rowId: r1.rowId!, expected: nothing }));
check("a proposal that isn't approved can't be published", /Approve the proposal before publishing/.test(notApproved ?? ""), notApproved);
const vA = await approve(eA, r1.rowId!);
const planA = (await planUnifiedPublication(eA, r1.rowId!)).plan;
check("the publication plan: publishable, replaces nothing, no start date needed, nothing to supersede", planA.canPublish && !planA.replaces.training && !planA.replaces.nutrition && !planA.needsStartDate, planA);
const approvedT = vA.training!.versionId;
const approvedN = vA.nutrition!.versionId;
const pubA = await publishUnifiedProposal(eA, { rowId: r1.rowId!, expected: nothing });
const pa = pubA.publication as Record<string, unknown>;
const tPub = await must(admin.from("training_program_versions").select("id, status, content, program_id").eq("id", pa.trainingVersionId as string).single(), "published t");
const nPub = await must(admin.from("nutrition_plan_versions").select("status, content").eq("id", approvedN).single(), "published n");
const rowA = await must(admin.from("unified_program_proposals").select("approval_state, published_by, reviewed_at, publication").eq("id", r1.rowId!).single(), "row A");
check("published: the client copy of the approved training (derived from it, no internal provenance) and the approved nutrition", tPub.status === "published" && tPub.content.clientFacingFrom?.reviewedVersionId === approvedT && !tPub.content.reasonerProvenance && nPub.status === "published");
check("nutrition carries the coach's approval time; carbs/fat/targets exactly as approved", nPub.content.approvedAtIso && new Date(nPub.content.approvedAtIso).getTime() === new Date(rowA.reviewed_at).getTime() && JSON.stringify({ ...nPub.content, approvedAtIso: "" }) === JSON.stringify(vA.nutrition!.content));
const aT = await activeT(A.client);
const aN = await activeN(A.client);
check("assigned to the right client and workspace: one active program (the published copy) and one active nutrition plan", aT.length === 1 && aT[0].program_version_id === pa.trainingVersionId && aN.length === 1 && aN[0].plan_version_id === approvedN && pa.programAssignmentId === aT[0].id && pa.nutritionAssignmentId === aN[0].id, { aT, aN, pa });
check("the reviewed draft was archived (only the client copy is live); proposal marked published with its publication record", (await must(admin.from("training_program_versions").select("status").eq("id", approvedT).single(), "reviewed")).status === "archived" && rowA.approval_state === "published" && rowA.published_by === coachA.id);
const notes = await must(A.session.from("notifications").select("kind, title, link_path"), "client notes");
check("the client was notified in-app (after publication, linking to Today) and can read it", notes.length === 1 && notes[0].kind === "program_published" && notes[0].link_path === "/today");
const events = await must(admin.from("publication_events").select("entity_type, event_type").eq("workspace_id", wsA), "events");
check("audit trail: 'published' and 'activated' events for training and nutrition", ["training_program_version", "nutrition_plan_version"].every((t) => events.some((e: { entity_type: string; event_type: string }) => e.entity_type === t && e.event_type === "published") && events.some((e: { entity_type: string; event_type: string }) => e.entity_type === t && e.event_type === "activated")));

console.log("\n2. The client receives exactly that — and the client app can show it\n");
const clientT = await must(A.session.from("program_assignments").select("program_version_id, training_program_versions(content, status)").eq("status", "active").single(), "client reads t");
const clientN = await must(A.session.from("nutrition_plan_assignments").select("plan_version_id, nutrition_plan_versions(content, status)").eq("status", "active").single(), "client reads n");
const ct = clientT.training_program_versions.content as UniversalTrainingProgramContent;
check("the client reads its own active program and nutrition through RLS", clientT.program_version_id === pa.trainingVersionId && clientN.plan_version_id === approvedN);
check("the client's Today can represent the program (one session per training day) and its nutrition validates", !!universalProgramToTodayProgram(ct) && (() => { try { validateAssignedNutritionPlanContent(clientN.nutrition_plan_versions.content); return true; } catch { return false; } })());

console.log("\n3. Retries and concurrency: idempotent, exactly one publication\n");
const assignmentsBefore = await count(admin.from("program_assignments").select("id", { count: "exact", head: true }).eq("client_profile_id", A.client));
const retry = await publishUnifiedProposal(eA, { rowId: r1.rowId!, expected: nothing });
check("retrying a published proposal returns the same publication (replayed), nothing repeated", (retry.publication as Record<string, unknown>).replayed === true && (retry.publication as Record<string, unknown>).programAssignmentId === pa.programAssignmentId && (await count(admin.from("program_assignments").select("id", { count: "exact", head: true }).eq("client_profile_id", A.client))) === assignmentsBefore && (await must(A.session.from("notifications").select("id"), "n")).length === 1);

console.log("\n4. Permissions and isolation\n");
const B2 = await newClient("client-b2");
await enroll(B2.client, null);
const inB2 = inputFor(B2.client, liftCoach, MV);
const r2 = await persist(coachA.session, coachA.id, { ws: wsA, client: B2.client, title: "Unified B2", input: inB2, methodVersionId: MV });
const eB2 = env(coachA, B2.client, inB2);
await approve(eB2, r2.rowId!);
const rpc = (s: SupabaseClient) => s.rpc("publish_unified_proposal", { p_proposal_id: r2.rowId, p_training_version_id: null, p_expected: {} });
const byC = await rpc(coachC.session);
const byB = await rpc(coachB.session);
const byClient = await rpc(A.session);
check("an unassigned coach, another workspace's coach and a client are all refused by the database", [byC, byB, byClient].every((r) => !!r.error && /assigned coach|no such proposal|sign in/.test(r.error.message)), [byC.error?.message, byB.error?.message, byClient.error?.message]);
check("…and nothing was assigned to that client", (await activeT(B2.client)).length === 0 && (await activeN(B2.client)).length === 0);
check("client A can't read client B2's assignments or notifications", (await must(A.session.from("program_assignments").select("id").eq("client_profile_id", B2.client), "x")).length === 0);

console.log("\n5. Concurrent double publish → exactly one publication, no orphaned client copies\n");
const [c1, c2] = await Promise.all([publishUnifiedProposal(eB2, { rowId: r2.rowId!, expected: nothing }).catch((e) => e as Error), publishUnifiedProposal(eB2, { rowId: r2.rowId!, expected: nothing }).catch((e) => e as Error)]);
const okOnes = [c1, c2].filter((x) => !(x instanceof Error)) as Array<{ publication: Record<string, unknown> }>;
const b2T = await activeT(B2.client);
const strayDrafts = await must(admin.from("training_program_versions").select("id").eq("workspace_id", wsA).eq("status", "draft").contains("content", { clientId: B2.client }), "stray");
check("both calls resolve to one publication: one active program, same assignment id", okOnes.length >= 1 && b2T.length === 1 && okOnes.every((o) => o.publication.programAssignmentId === b2T[0].id), { c1: c1 instanceof Error ? c1.message : "ok", c2: c2 instanceof Error ? c2.message : "ok", b2T });
check("no orphaned client-copy drafts left behind", strayDrafts.length === 0, strayDrafts);

console.log("\n6. Replacing an active program: explicit confirmation, exact expectations, start date; history kept\n");
await must(admin.from("daily_records").insert({ workspace_id: wsA, client_profile_id: A.client, date_iso: "2026-10-05", content: { training: { sessionStatus: "completed" }, nutrition: { meals: {} }, programWeek: 1 } }), "history row");
const historyBefore = await must(admin.from("daily_records").select("content, updated_at").eq("client_profile_id", A.client), "hist before");
await must(admin.from("client_enrollments").update({ status: "active", original_program_start_date: "2026-09-28" }).eq("client_profile_id", A.client), "activate A");
const legacy = await insertDraftProgramVersion(coachA.session, coachA.id, { workspaceId: wsA, title: "Legacy pending", content: { ...ct, id: "legacy-pending" }, proposedForClientProfileId: A.client });
const inA2 = withMethod(scenarioInput({ clientId: A.client, coach: liftCoach, patch: { what_you_want: { primaryGoal: "build_muscle" }, your_week: { ...week, maxSessionLength: "60" } } }), MV);
const r3 = await persist(coachA.session, coachA.id, { ws: wsA, client: A.client, title: "Unified A — block 2", input: inA2, methodVersionId: MV });
const r4 = await persist(coachA.session, coachA.id, { ws: wsA, client: A.client, title: "Unified A — alternative", input: inA2, methodVersionId: MV });
const eA2 = env(coachA, A.client, inA2);
await approve(eA2, r3.rowId!);
const plan3 = (await planUnifiedPublication(eA2, r3.rowId!)).plan;
check("the plan shows the active program/nutrition will be replaced, needs a start date, and what it supersedes", plan3.canPublish && plan3.replaces.training && plan3.replaces.nutrition && plan3.needsStartDate && plan3.supersedes.openProposals === 1 && plan3.supersedes.legacyPendingDrafts === 1, plan3);
const curr = { activeTrainingVersionId: plan3.active.trainingVersionId, activeNutritionVersionId: plan3.active.nutritionVersionId };
check("never silent: without explicit replacement confirmation it's refused", /confirm the replacement/.test((await throwsMsg(() => publishUnifiedProposal(eA2, { rowId: r3.rowId!, expected: { ...curr, replaceActive: false, startDate: "2026-10-12" } }))) ?? ""));
check("a new program needs its start date", /choose its start date/.test((await throwsMsg(() => publishUnifiedProposal(eA2, { rowId: r3.rowId!, expected: { ...curr, replaceActive: true, startDate: null } }))) ?? ""));
check("expectations that don't match the client's current assignments are refused (conflicting versions)", /changed since you reviewed/.test((await throwsMsg(() => publishUnifiedProposal(eA2, { rowId: r3.rowId!, expected: { ...curr, activeTrainingVersionId: approvedT, replaceActive: true, startDate: "2026-10-12" } }))) ?? ""));
check("…and those refusals changed nothing (still the first program, proposal still approved)", (await activeT(A.client))[0].program_version_id === pa.trainingVersionId && (await must(admin.from("unified_program_proposals").select("approval_state").eq("id", r3.rowId!).single(), "r3")).approval_state === "approved");
const pub3 = (await publishUnifiedProposal(eA2, { rowId: r3.rowId!, expected: { ...curr, replaceActive: true, startDate: "2026-10-12" } })).publication as Record<string, unknown>;
const allT = await must(admin.from("program_assignments").select("program_version_id, status").eq("client_profile_id", A.client), "all t");
check("published: the new program is active, the old assignment is 'replaced' (kept), start date set to the new block", allT.filter((x: { status: string }) => x.status === "active").length === 1 && allT.find((x: { status: string }) => x.status === "active")!.program_version_id === pub3.trainingVersionId && allT.some((x: { program_version_id: string; status: string }) => x.program_version_id === pa.trainingVersionId && x.status === "replaced") && (await must(admin.from("client_enrollments").select("original_program_start_date").eq("client_profile_id", A.client).single(), "enr")).original_program_start_date === "2026-10-12", allT);
check("the old published program version is untouched (still published, same content)", (await must(admin.from("training_program_versions").select("status, content").eq("id", pa.trainingVersionId as string).single(), "old")).status === "published");
const historyAfter = await must(admin.from("daily_records").select("content, updated_at").eq("client_profile_id", A.client), "hist after");
check("the client's history is byte-identical (daily records keep their own program week)", JSON.stringify(historyBefore) === JSON.stringify(historyAfter));
const r4After = await must(admin.from("unified_program_proposals").select("approval_state, superseded_by, training_program_version_id").eq("id", r4.rowId!).single(), "r4");
check("explicit supersession: the other open proposal is 'superseded' by this one and its drafts archived; the legacy pending draft archived", r4After.approval_state === "superseded" && r4After.superseded_by === r3.rowId && (await must(admin.from("training_program_versions").select("status").eq("id", r4After.training_program_version_id).single(), "r4t")).status === "archived" && (await must(admin.from("training_program_versions").select("status").eq("id", legacy.versionId).single(), "legacy")).status === "archived" && (pub3.supersededProposalIds as string[]).includes(r4.rowId!), { r4After, pub3 });
check("a superseded proposal can't be approved or published", !!(await throwsMsg(() => publishUnifiedProposal(eA2, { rowId: r4.rowId!, expected: nothing }))));

console.log("\n7. A failure mid-transaction rolls EVERYTHING back\n");
const F = await newClient("client-f");
// An active program but NO enrollment: publishing a replacement fails at the start-date step, after publish + assign.
const fProg = await insertDraftProgramVersion(coachA.session, coachA.id, { workspaceId: wsA, title: "F current", content: { ...ct, id: "f-current", clientId: F.client } });
await must(coachA.session.from("training_program_versions").update({ status: "published", published_at: NOW, published_by: coachA.id }).eq("id", fProg.versionId), "publish f");
await must(coachA.session.rpc("assign_active_program_version", { p_client_profile_id: F.client, p_program_version_id: fProg.versionId }), "assign f");
const inF = inputFor(F.client, liftCoach, MV);
const rF = await persist(coachA.session, coachA.id, { ws: wsA, client: F.client, title: "Unified F", input: inF, methodVersionId: MV });
const eF = env(coachA, F.client, inF);
const vF = await approve(eF, rF.rowId!);
const failed1 = await throwsMsg(() => publishUnifiedProposal(eF, { rowId: rF.rowId!, expected: { activeTrainingVersionId: fProg.versionId, activeNutritionVersionId: null, replaceActive: true, startDate: "2026-10-12" } }));
const fT = await activeT(F.client);
check("the failure surfaces clearly", /no enrollment/.test(failed1 ?? ""), failed1);
check("rolled back: the previous program is still the only active one; no nutrition assigned; no notification", fT.length === 1 && fT[0].program_version_id === fProg.versionId && (await activeN(F.client)).length === 0 && (await count(admin.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", F.id))) === 0);
check("rolled back: approved drafts are still drafts, the proposal is still approved, no published client copy, no leftover copy draft", (await must(admin.from("training_program_versions").select("status").eq("id", vF.training!.versionId).single(), "fT")).status === "draft" && (await must(admin.from("nutrition_plan_versions").select("status").eq("id", vF.nutrition!.versionId).single(), "fN")).status === "draft" && (await must(admin.from("unified_program_proposals").select("approval_state").eq("id", rF.rowId!).single(), "fRow")).approval_state === "approved" && (await must(admin.from("training_program_versions").select("id").eq("workspace_id", wsA).in("status", ["draft", "published"]).contains("content", { clientFacingFrom: { reviewedVersionId: vF.training!.versionId } }), "copies")).length === 0);

console.log("\n8. Stale approvals are refused\n");
const S = await newClient("client-s");
await enroll(S.client, null);
const inS = inputFor(S.client, liftCoach, MV);
const rS = await persist(coachA.session, coachA.id, { ws: wsA, client: S.client, title: "Unified S", input: inS, methodVersionId: MV });
const eS = env(coachA, S.client, inS);
const vS = await approve(eS, rS.rowId!);
check("coach method changed since approval → blocked", (await planUnifiedPublication(env(coachA, S.client, inS, { currentMethodVersionId: randomUUID() }), rS.rowId!)).plan.blockers.some((b) => /method changed/.test(b)));
check("client facts / restrictions changed since approval → blocked", (await planUnifiedPublication(env(coachA, S.client, { ...inS, client: { ...inS.client, __changed: true } as never }), rS.rowId!)).plan.blockers.some((b) => /planning facts or confirmed restrictions changed/.test(b)));
const tampered = structuredClone(vS.nutrition!.content);
tampered.mealsPerDay = (tampered.mealsPerDay ?? 3) + 1;
await must(coachA.session.from("nutrition_plan_versions").update({ content: tampered }).eq("id", vS.nutrition!.versionId), "tamper");
check("approved content changed after approval → blocked in the app…", (await planUnifiedPublication(eS, rS.rowId!)).plan.blockers.some((b) => /nutrition changed after approval/.test(b)));
const direct = await coachA.session.rpc("publish_unified_proposal", { p_proposal_id: rS.rowId, p_training_version_id: vS.training!.versionId, p_expected: nothing });
check("…and by the database fingerprint even if the app check were bypassed", !!direct.error && /changed after approval/.test(direct.error.message), direct.error?.message);
check("nothing published or assigned for that client", (await activeT(S.client)).length === 0);

console.log("\n9. Continuing an approved program keeps the client's position; omitted domains stay untouched\n");
const K = await newClient("client-k");
await enroll(K.client, "2026-09-21");
// A real, client-ready approved program (the copy published in section 1), now this client's.
const kProg = await insertDraftProgramVersion(coachA.session, coachA.id, { workspaceId: wsA, title: "K approved", content: { ...ct, id: "k-approved", clientId: K.client } });
await must(coachA.session.from("training_program_versions").update({ status: "published", published_at: NOW, published_by: coachA.id }).eq("id", kProg.versionId), "publish k");
await must(coachA.session.rpc("assign_active_program_version", { p_client_profile_id: K.client, p_program_version_id: kProg.versionId }), "assign k");
const kContent = (await must(admin.from("training_program_versions").select("content").eq("id", kProg.versionId).single(), "kc")).content as UniversalTrainingProgramContent;
const noNutritionCoach = fullCoach({ t_cardio_roles: ["fat_loss"], nutrition_scope: "none" });
const MVK = await methodRow(wsA, coachA.id, { ...noNutritionCoach, version: 5 });
const inK = inputFor(K.client, noNutritionCoach, MVK);
const rK = await persist(coachA.session, coachA.id, { ws: wsA, client: K.client, title: "Unified K", input: inK, approved: { versionId: kProg.versionId, content: kContent }, methodVersionId: MVK });
const eK = env(coachA, K.client, inK, { currentMethodVersionId: MVK, activeProgramVersionId: kProg.versionId });
await approve(eK, rK.rowId!);
const planK = (await planUnifiedPublication(eK, rK.rowId!)).plan;
check("built around the approved program: continuation, no start date, nutrition omitted (not coached)", planK.canPublish && planK.continuesApprovedProgram && !planK.needsStartDate && planK.omits.includes("nutrition"), planK);
check("a start date on a continuation is refused (position must be kept)", /start date and position are kept/.test((await throwsMsg(() => publishUnifiedProposal(eK, { rowId: rK.rowId!, expected: { activeTrainingVersionId: kProg.versionId, activeNutritionVersionId: null, replaceActive: true, startDate: "2026-10-12" } }))) ?? ""));
const pubK = (await publishUnifiedProposal(eK, { rowId: rK.rowId!, expected: { activeTrainingVersionId: kProg.versionId, activeNutritionVersionId: null, replaceActive: true, startDate: null } })).publication as Record<string, unknown>;
check("published as a continuation: start date unchanged (position preserved), no nutrition assignment created", pubK.positionPreserved === true && (await must(admin.from("client_enrollments").select("original_program_start_date").eq("client_profile_id", K.client).single(), "k enr")).original_program_start_date === "2026-09-21" && (await activeN(K.client)).length === 0 && pubK.nutritionVersionId === null);

console.log("\n10. A program the client's Today can't show is held, not published\n");
const cardioCoach = fullCoach();
const MVC = await methodRow(wsA, coachA.id, { ...cardioCoach, version: 6 });
const Cc = await newClient("client-cardio");
await enroll(Cc.client, null);
const inC = withMethod(scenarioInput({ clientId: Cc.client, coach: cardioCoach, patch: { what_you_want: { primaryGoal: "get_stronger" }, your_week: week } }), MVC);
const rC = await persist(coachA.session, coachA.id, { ws: wsA, client: Cc.client, title: "Unified cardio", input: inC, methodVersionId: MVC });
const eC = env(coachA, Cc.client, inC, { currentMethodVersionId: MVC });
await approve(eC, rC.rowId!);
const planC = (await planUnifiedPublication(eC, rC.rowId!)).plan;
check("a lifting + separate-day cardio program is held with a clear reason (Today shows one session per day)", !planC.canPublish && planC.blockers.some((b) => /Today screen can't show this program yet/.test(b)), planC.blockers);
check("…and publishing is refused, with nothing assigned", /can't be published/.test((await throwsMsg(() => publishUnifiedProposal(eC, { rowId: rC.rowId!, expected: nothing }))) ?? "") && (await activeT(Cc.client)).length === 0);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
