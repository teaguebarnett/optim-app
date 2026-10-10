// Gate U3B — LOCAL-ONLY end-to-end check of the unified coach review (lib/production/unified-review.ts) under real
// signed-in sessions and RLS: one proposal, evidence, prepared decisions, revalidated edits, approve (no publication),
// reject, authority, preserved restrictions / approved programs / coach method. Refuses anything but the local stack.
//
//   node --experimental-strip-types scripts/e2e-unified-review.mts

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runUnifiedProgram, type DomainResults } from "../lib/synthesis/unified/orchestrate.ts";
import type { UnifiedProgramProposal } from "../lib/synthesis/unified/contract.ts";
import { FOUNDATION_KNOWLEDGE } from "../lib/synthesis/knowledge/registry.ts";
import { sha256 } from "../lib/synthesis/reasoner/run.ts";
import { beginUnifiedProposal, completeUnifiedProposal, unifiedIdempotencyKey, type UnifiedArtifacts, type UnifiedRow } from "../lib/production/unified-drafts.ts";
import { insertDraftProgramVersion } from "../lib/production/draft-versions.ts";
import { approveUnifiedProposal, editUnifiedNutrition, editUnifiedTraining, getUnifiedReview, getUnifiedReviewById, recordUnifiedDecision, rejectUnifiedProposal, type ReviewEnv, type UnifiedReviewView } from "../lib/production/unified-review.ts";
import type { TrainingItemPath } from "../lib/training/program-proposal-editing.ts";
import { fullCoach, LOWER, programContent, restrict, routerModel, scenarioInput, UPPER } from "../lib/synthesis/unified/eval/fixtures.ts";
import type { GenerationInputs, TrainingItemInstance, UniversalTrainingProgramContent } from "../lib/training/types.ts";
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
  const email = `e2e-u3b-${tag}-${RUN}@example.test`;
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
// Gate U3B — the coach reviews one unified proposal: evidence, decisions, edits (revalidated), approve / reject.
// ---------------------------------------------------------------------------------------------------------------
const env = (who: { id: string; session: SupabaseClient }, input: SynthesisInput, over: Partial<ReviewEnv> = {}): ReviewEnv => ({ supabase: who.session, userId: who.id, clientProfileId: CLIENT, input, knowledge: FOUNDATION_KNOWLEDGE, currentMethodVersionId: MV, activeProgramVersionId: null, nowIso: new Date().toISOString(), ...over });
const throwsMsg = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
type FoundItem = { path: TrainingItemPath; item: TrainingItemInstance };
/** The first item of a family in the program (week order), with its edit path. */
const itemOf = (c: UniversalTrainingProgramContent, family: "resistance" | "continuous" | "interval"): FoundItem | null => {
  for (const w of c.weeks)
    for (const d of w.days)
      for (const [si, s] of (d.sessions ?? []).entries())
        for (const b of s.blocks)
          for (const i of b.items) if (i.prescription.family === family) return { path: { weekNumber: w.weekNumber, dayOfWeek: d.dayOfWeek, sessionIndex: si, blockId: b.id, itemId: i.id }, item: i };
  return null;
};
const answerAll = async (e: ReviewEnv, view: UnifiedReviewView) => {
  let v = view;
  for (const d of view.decisions.filter((x) => !x.answer)) v = await recordUnifiedDecision(e, { rowId: v.rowId, key: d.key, answer: d.recommended ?? d.options[0] });
  return v;
};

console.log("\nGate U3B — unified coach review, locally under real RLS\n");
const coachA = await user("coach-a");
const coachB = await user("coach-b");
const coachC = await user("coach-c-unassigned");
const clientA = await user("client-a");
const wsA = await workspace(coachA.id, `U3B A ${RUN}`);
await workspace(coachB.id, `U3B B ${RUN}`);
await must(admin.from("workspace_memberships").insert([{ workspace_id: wsA, user_id: clientA.id, role: "client" }, { workspace_id: wsA, user_id: coachC.id, role: "coach" }]), "memberships");
const CLIENT = (await must(admin.from("client_profiles").insert({ workspace_id: wsA, user_id: clientA.id, display_name: "U3B Client" }).select("id").single(), "client")).id as string;
await must(admin.from("coach_client_assignments").insert({ workspace_id: wsA, coach_user_id: coachA.id, client_profile_id: CLIENT, is_primary: true }), "assignment");
const coachMethod = fullCoach();
const MV = await methodRow(wsA, coachA.id, coachMethod);
const week = { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] };
const strengthInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { what_you_want: { primaryGoal: "get_stronger", successDefinition: "Squat 180 kg without getting gassed" }, your_week: week } }), MV);

console.log("1. One coherent proposal: objective, domains, week, evidence, decisions, revalidation\n");
const r1 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified program", input: strengthInput, methodVersionId: MV });
const eA = env(coachA, strengthInput);
let v = (await getUnifiedReview(eA, { workspaceId: wsA, clientProfileId: CLIENT }))!;
check("the assigned coach gets ONE review: training + nutrition drafts, every domain's status and summary", !!v && v.rowId === r1.rowId && !!v.training && !!v.nutrition && (["resistance", "cardio", "nutrition"] as const).every((d) => !!v.proposal.domains[d].summary), v && { status: v.status, domains: v.proposal.domains });
check("reasoning and evidence: objective, the coordinated week and workload, cardio + nutrition decisions with their sources", !!v.proposal.objective.summary && v.revalidation.week.length === 7 && v.revalidation.workload.trainingDays > 0 && (v.evidence.cardio?.length ?? 0) > 0 && (v.evidence.nutrition?.length ?? 0) > 0 && v.evidence.nutrition!.some((e) => e.sources.length > 0), v.evidence);
check("the untouched proposal revalidates clean (no errors) and nothing is stale", v.revalidation.errors.length === 0 && v.staleReasons.length === 0, { errors: v.revalidation.errors, stale: v.staleReasons });
check("every prepared decision has a stable key and no answer yet; open decisions block approval", v.decisions.every((d) => !!d.key && !d.answer) && (v.decisions.length === 0 || v.blockers.some((b) => /decision/.test(b))), v.decisions.map((d) => d.about));

console.log("\n2. Authority: only the assigned coach (or an admin) reviews; others can't, at app AND database level\n");
check("an unassigned coach in the same workspace can't open the review", /assigned coach/.test((await throwsMsg(() => getUnifiedReview(env(coachC, strengthInput), { workspaceId: wsA, clientProfileId: CLIENT }))) ?? ""));
const cDirect = await coachC.session.from("unified_program_proposals").update({ coach_decisions: { forged: { answer: "x" } } }).eq("id", r1.rowId!).select("id");
check("…and a direct write by that coach is refused by the database trigger", !!cDirect.error && /assigned coach/.test(cDirect.error.message), cDirect.error);
check("a coach of another workspace can't see the proposal at all", (await must(coachB.session.from("unified_program_proposals").select("id").eq("id", r1.rowId!), "b read")).length === 0);
check("the client can't read the proposal or its drafts", (await must(clientA.session.from("unified_program_proposals").select("id"), "client read")).length === 0 && (await must(clientA.session.from("training_program_versions").select("id").eq("id", v.training!.versionId), "client drafts")).length === 0);

console.log("\n3. Edits create NEW draft versions and revalidate the affected domains + the whole week\n");
const t0 = v.training!;
const cardioItem = itemOf(t0.content, "continuous");
check("the program contains a steady cardio item to edit", !!cardioItem);
const minutesBefore = v.revalidation.workload.cardioMinutes.total;
v = await editUnifiedTraining(eA, { rowId: v.rowId, expectedVersionId: t0.versionId, edit: { kind: "patch", path: cardioItem!.path, patch: { durationSeconds: (cardioItem!.item.prescription.duration!.seconds) + 600, effortLow: 2, effortHigh: 3 } } });
const t0After = await must(admin.from("training_program_versions").select("status, content").eq("id", t0.versionId).single(), "t0 after");
check("the cardio edit made a new draft version; the original version is untouched and still a draft", v.training!.versionId !== t0.versionId && t0After.status === "draft" && JSON.stringify(t0After.content) === JSON.stringify(t0.content));
check("revalidation recomputed cardio: +10 min this week, CR10 'easy' label from the edited effort, cardio marked edited, lifting not", v.revalidation.workload.cardioMinutes.total === minutesBefore + 10 && v.revalidation.domains.cardio.edited && !v.revalidation.domains.resistance.edited, { before: minutesBefore, after: v.revalidation.workload.cardioMinutes, domains: v.revalidation.domains });
const editedSession = v.training!.content.weeks.find((w) => w.weekNumber === cardioItem!.path.weekNumber)!.days.find((d) => d.dayOfWeek === cardioItem!.path.dayOfWeek)!.sessions![cardioItem!.path.sessionIndex];
check("the persisted session says what its prescription says (name intensity 'easy', estimated minutes = new duration)", / — easy$/.test(editedSession.name) && editedSession.estimatedDurationMin === Math.round(cardioItem!.item.prescription.duration!.seconds / 60) + 10, { name: editedSession.name, min: editedSession.estimatedDurationMin });
check("the review history records who changed what, from → to version, in plain words", v.revisions.length === 1 && /duration, effort/.test(v.revisions[0].summary) && v.revisions[0].fromVersionId === t0.versionId && v.revisions[0].toVersionId === v.training!.versionId && v.revisions[0].byUserId === coachA.id);
const stale = await throwsMsg(() => editUnifiedTraining(eA, { rowId: v.rowId, expectedVersionId: t0.versionId, edit: { kind: "patch", path: cardioItem!.path, patch: { durationSeconds: 900 } } }));
check("an edit against an outdated version is refused (no lost update)", /changed since you opened it/.test(stale ?? ""), stale);
const nutr0 = v.nutrition!;
v = await editUnifiedNutrition(eA, { rowId: v.rowId, expectedVersionId: nutr0.versionId, edit: { targets: { proteinG: (nutr0.content.targets?.proteinG ?? nutr0.content.method!.prescribed.proteinG!) + 300 } } });
check("a nutrition edit made a new nutrition draft; protein far outside the coach's own range is flagged (coach authority, shown not blocked)", v.nutrition!.versionId !== nutr0.versionId && v.revalidation.findings.some((f) => f.code === "protein_outside_method_range") && v.revalidation.errors.length === 0, v.revalidation.findings);
v = await editUnifiedNutrition(eA, { rowId: v.rowId, expectedVersionId: v.nutrition!.versionId, edit: { targets: { proteinG: nutr0.content.targets?.proteinG ?? nutr0.content.method!.prescribed.proteinG! } } });
check("restoring protein clears the finding", !v.revalidation.findings.some((f) => f.code === "protein_outside_method_range"));

console.log("\n4. Approval: every decision answered, nothing stale, no errors → recorded; NOTHING published or assigned\n");
v = await answerAll(eA, v);
check("all decisions answered and recorded with the coach and the exact question", v.decisions.every((d) => d.answer?.decidedBy === coachA.id && d.answer.question === d.question), v.decisions);
const staleEnv = env(coachA, { ...strengthInput, client: { ...strengthInput.client, schedule: { ...strengthInput.client.schedule } , __changed: true } as never });
const staleView = await getUnifiedReviewById(staleEnv, v.rowId);
check("if the client's planning facts / restrictions changed since preparation, approval is blocked (stale)", staleView.blockers.some((b) => /planning facts or confirmed restrictions changed/.test(b)));
check("if the coach's confirmed method changed, approval is blocked", (await getUnifiedReviewById(env(coachA, strengthInput, { currentMethodVersionId: randomUUID() }), v.rowId)).blockers.some((b) => /method changed/.test(b)));
check("with everything answered and current, the proposal is approvable", v.blockers.length === 0, v.blockers);
const wrongExpect = await throwsMsg(() => approveUnifiedProposal(eA, { rowId: v.rowId, expected: { training: t0.versionId, nutrition: v.nutrition!.versionId } }));
check("approving with outdated versions is refused (the coach approves exactly what they reviewed)", /changed since you reviewed/.test(wrongExpect ?? ""), wrongExpect);
const approvedT = v.training!.versionId;
const approvedN = v.nutrition!.versionId;
v = await approveUnifiedProposal(eA, { rowId: v.rowId, expected: { training: approvedT, nutrition: approvedN } });
const rowA = await must(admin.from("unified_program_proposals").select("approval_state, reviewed_by, approved_training_version_id, approved_nutrition_version_id, approved_content_hashes").eq("id", v.rowId).single(), "approved row");
const tv = await must(admin.from("training_program_versions").select("status, content").eq("id", approvedT).single(), "approved t");
const nvA = await must(admin.from("nutrition_plan_versions").select("status, content").eq("id", approvedN).single(), "approved n");
check("approved: bound to the exact reviewed versions + content hashes, reviewer recorded", rowA.approval_state === "approved" && rowA.reviewed_by === coachA.id && rowA.approved_training_version_id === approvedT && rowA.approved_nutrition_version_id === approvedN && rowA.approved_content_hashes.training === sha256(tv.content) && rowA.approved_content_hashes.nutrition === sha256(nvA.content), rowA);
check("nothing published, assigned, enrolled or stamped: drafts stay drafts, no assignments, nutrition approvedAtIso still empty", tv.status === "draft" && nvA.status === "draft" && nvA.content.approvedAtIso === "" && (await must(admin.from("program_assignments").select("id").eq("client_profile_id", CLIENT), "pa")).length === 0 && (await must(admin.from("nutrition_plan_assignments").select("id").eq("client_profile_id", CLIENT), "na")).length === 0 && (await must(admin.from("client_enrollments").select("id").eq("client_profile_id", CLIENT), "enr")).length === 0);
const editAfter = await throwsMsg(() => editUnifiedTraining(eA, { rowId: v.rowId, expectedVersionId: approvedT, edit: { kind: "patch", path: cardioItem!.path, patch: { durationSeconds: 600 } } }));
const dbAfter = await coachA.session.from("unified_program_proposals").update({ coach_decisions: {} }).eq("id", v.rowId).select("id");
check("an approved proposal is frozen: app refuses edits, the database refuses any write", /already approved/.test(editAfter ?? "") && !!dbAfter.error && /immutable/.test(dbAfter.error.message), { editAfter, db: dbAfter.error?.message });

console.log("\n5. Confirmed restrictions are preserved: an edit that conflicts is caught and blocks approval\n");
const DOC = "No squats or lower body compounds like leg press; no bracing; no ab work.";
const review = (extra: Record<string, unknown> = {}) => ({ clientId: CLIENT, workspaceId: wsA, status: "proceed_with_limitations", reasons: ["Flagged being advised to limit or avoid exercise."], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: DOC, ...extra }) as never;
const confirmed = restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }, { kind: "avoid_movement_pattern", pattern: "hinge" }, { kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]).map((r) => ({ ...r, interprets: [`${CLIENT}:coach_documented_limitation`] }));
const reviewedInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { what_you_want: { primaryGoal: "get_stronger" }, health_finish: { hasInjuryHistory: false, safetyScreen: ["advised_limit", "joint_muscular"] }, your_week: week }, healthReview: review(), restrictions: confirmed }), MV);
const r2 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified reviewed", input: reviewedInput, methodVersionId: MV });
const eR = env(coachA, reviewedInput);
let v2 = await getUnifiedReviewById(eR, r2.rowId!);
const lift = itemOf(v2.training!.content, "resistance")!;
check("the restricted client's proposal is reviewable and its lifting fits the confirmed restrictions", v2.revalidation.errors.length === 0 && !!lift, v2.revalidation.errors);
v2 = await editUnifiedTraining(eR, { rowId: v2.rowId, expectedVersionId: v2.training!.versionId, edit: { kind: "patch", path: lift.path, patch: { name: "Barbell Back Squat" } } });
check("swapping in a squat (a confirmed 'avoid squat' restriction) → revalidation error naming it, and approval is blocked", v2.revalidation.errors.some((e) => e.area === "resistance" && /Barbell Back Squat conflicts with the confirmed restrictions/.test(e.message)) && v2.blockers.some((b) => /Barbell Back Squat/.test(b)), v2.revalidation.errors);
v2 = await answerAll(eR, v2);
check("…even with every decision answered it can't be approved", /can't be approved yet/.test((await throwsMsg(() => approveUnifiedProposal(eR, { rowId: v2.rowId, expected: { training: v2.training!.versionId, nutrition: v2.nutrition?.versionId ?? null } }))) ?? ""));
v2 = await editUnifiedTraining(eR, { rowId: v2.rowId, expectedVersionId: v2.training!.versionId, edit: { kind: "patch", path: lift.path, patch: { name: lift.item.name } } });
check("restoring the exercise clears the error (the restriction itself was never touched)", !v2.revalidation.errors.some((e) => /Barbell Back Squat/.test(e.message)));
check("a domain held for clearance stays held: cardio ESCALATE, no cardio forced into the draft", v2.proposal.domains.cardio.status === "ESCALATE" && !itemOf(v2.training!.content, "continuous") && !itemOf(v2.training!.content, "interval"));

console.log("\n6. Reject: the decision is recorded, the proposal's own drafts are archived, history kept\n");
const revisionVersions = v2.revisions.flatMap((r) => [r.fromVersionId, r.toVersionId]);
v2 = await rejectUnifiedProposal(eR, { rowId: v2.rowId, reason: "Prefer to rebuild after the client's next check-in." });
const rowR = await must(admin.from("unified_program_proposals").select("approval_state, reviewed_by, rejection_reason, approved_training_version_id").eq("id", v2.rowId).single(), "rejected row");
const archived = await must(admin.from("training_program_versions").select("id, status").in("id", revisionVersions), "archived");
check("rejected with the coach's reason; never marked approved", rowR.approval_state === "rejected" && rowR.reviewed_by === coachA.id && /rebuild/.test(rowR.rejection_reason) && rowR.approved_training_version_id === null, rowR);
check("every training version this proposal produced is archived (kept, never deleted, can't be published)", archived.length === new Set(revisionVersions).size && archived.every((x: { status: string }) => x.status === "archived"), archived);
check("approving a rejected proposal is refused", /already rejected/.test((await throwsMsg(() => approveUnifiedProposal(eR, { rowId: v2.rowId, expected: { training: null, nutrition: null } }))) ?? ""));

console.log("\n7. Approved lifting is input only; unsupported domains aren't forced; no invented nutrition targets\n");
const approvedContent = { ...programContent([{ day: "Monday", exercises: LOWER }, { day: "Tuesday", exercises: UPPER }, { day: "Thursday", exercises: LOWER }, { day: "Friday", exercises: UPPER }], 8), clientId: CLIENT, workspaceId: wsA, coachId: coachA.id };
const appr = await insertDraftProgramVersion(coachA.session, coachA.id, { workspaceId: wsA, title: "Approved", content: approvedContent });
await must(coachA.session.from("training_program_versions").update({ status: "published", published_at: NOW, published_by: coachA.id }).eq("id", appr.versionId), "publish");
await must(coachA.session.rpc("assign_active_program_version", { p_client_profile_id: CLIENT, p_program_version_id: appr.versionId }), "assign");
const fatLossInput = withMethod(scenarioInput({ clientId: CLIENT, coach: coachMethod, patch: { what_you_want: { primaryGoal: "lose_fat" }, about_you: { age: 34, sex: "male", heightFeet: 5, heightInchesRemainder: 10, weightLb: 215, weightDirection: "stable" }, your_week: week } }), MV);
const r3 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified fat loss", input: fatLossInput, approved: { versionId: appr.versionId, content: approvedContent }, methodVersionId: MV });
const eF = env(coachA, fatLossInput, { activeProgramVersionId: appr.versionId });
const v3 = await getUnifiedReviewById(eF, r3.rowId!);
const apprLift = itemOf(v3.training!.content, "resistance")!;
check("editing lifting that comes from the approved program is refused (use a program adjustment)", /approved program/.test((await throwsMsg(() => editUnifiedTraining(eF, { rowId: v3.rowId, expectedVersionId: v3.training!.versionId, edit: { kind: "patch", path: apprLift.path, patch: { sets: 9 } } }))) ?? ""));
check("if the client's active program is no longer that approved version, approval is blocked", (await getUnifiedReviewById(env(coachA, fatLossInput, { activeProgramVersionId: randomUUID() }), v3.rowId)).blockers.some((b) => /approved program isn't the one/.test(b)));
const proteinCoach = fullCoach({ n_approach: ["calories_protein"] });
const MV2 = await methodRow(wsA, coachA.id, { ...proteinCoach, version: 8 });
const cpInput = withMethod(scenarioInput({ clientId: CLIENT, coach: proteinCoach, patch: { what_you_want: { primaryGoal: "get_stronger" }, your_week: week } }), MV2);
const r4 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified calories+protein", input: cpInput, methodVersionId: MV2 });
const eP = env(coachA, cpInput, { currentMethodVersionId: MV2 });
const v4 = await getUnifiedReviewById(eP, r4.rowId!);
const addCarbs = await throwsMsg(() => editUnifiedNutrition(eP, { rowId: v4.rowId, expectedVersionId: v4.nutrition!.versionId, edit: { targets: { carbsG: 250 } } }));
check("calories+protein plan: adding a carb target is refused — the coach's method decides which targets exist", v4.nutrition?.content.method?.approach === "calories_protein" && /doesn't prescribe a carbs target/.test(addCarbs ?? ""), addCarbs);
const v4b = await editUnifiedNutrition(eP, { rowId: v4.rowId, expectedVersionId: v4.nutrition!.versionId, edit: { targets: { calories: (v4.nutrition!.content.method!.prescribed.calories ?? 2400) - 100 } } });
check("…while editing the prescribed calories works and keeps carbs/fat unprescribed (targets stay null)", v4b.nutrition!.content.method!.prescribed.carbsG === null && v4b.nutrition!.content.targets === null && v4b.revalidation.errors.length === 0, v4b.nutrition?.content.method?.prescribed);
const noNutritionCoach = fullCoach({ nutrition_scope: "none" });
const MV3 = await methodRow(wsA, coachA.id, { ...noNutritionCoach, version: 9 });
const nnInput = withMethod(scenarioInput({ clientId: CLIENT, coach: noNutritionCoach, patch: { what_you_want: { primaryGoal: "get_stronger" }, your_week: week } }), MV3);
const r5 = await persist(coachA.session, coachA.id, { ws: wsA, client: CLIENT, title: "Unified no nutrition", input: nnInput, methodVersionId: MV3 });
const v5 = await getUnifiedReviewById(env(coachA, nnInput, { currentMethodVersionId: MV3 }), r5.rowId!);
const nnEdit = await throwsMsg(() => editUnifiedNutrition(env(coachA, nnInput, { currentMethodVersionId: MV3 }), { rowId: v5.rowId, expectedVersionId: "none", edit: { targets: { calories: 2000 } } }));
check("a coach who doesn't coach nutrition: no nutrition draft in the review, domain NOT_COACHED, and no nutrition edit possible", !v5.nutrition && v5.proposal.domains.nutrition.status === "NOT_COACHED" && /has no nutrition plan \(nutrition is not coached\)/.test(nnEdit ?? ""), { nutrition: !!v5.nutrition, status: v5.proposal.domains.nutrition.status, nnEdit });

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
