// Gate 4.0C-5 — constraint-aware program re-synthesis lifecycle (offline: scripted model, no provider, no database).
// The database-level parts (single-flight job index, version rows, archive immutability) are covered by the local E2E.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOUNDATION_KNOWLEDGE as K, FOUNDATION_KNOWLEDGE_VERSION } from "../knowledge/registry.ts";
import { buildConfirmation, parseStoredLimitations, type StoredStructuredLimitations } from "../limitations/confirm.ts";
import { effectiveExerciseDecisions, type ExerciseFitDecisionRecord } from "../limitations/exercise-decisions.ts";
import { demandCompatibility, eligibilityBasis, exerciseEligibility } from "../exercise-eligibility.ts";
import { planningState, diffPlanningState } from "../planning-state.ts";
import { runFitnessReasoner, type ReasonerResult } from "./reasoner.ts";
import { reasonerResultToProgramContent } from "./to-program.ts";
import { clientFacingProgramContent, findClientCopyLeaks, reasonerReviewModel, removeExerciseEverywhere, supportedSetupNames } from "./review-gate.ts";
import { decideGenerationAfterPreflight, decideRevision, type CurrentPlanningInputs, type RevisionJobRecord } from "./lifecycle.ts";
import { coachMethod, fakeModel, NOW, scenarioInput, scriptedOutput, type Patch, type WirePlan } from "./eval/fixtures.ts";
import { SCENARIOS } from "./eval/scenarios.ts";
import type { HealthReviewRecord } from "../../coach/types.ts";
import { coachFact } from "../goal-contract.ts";
import { evaluateAdequacy, functionAvailability } from "./adequacy.ts";
import { buildPool, methodFor } from "../planners/resistance/planner.ts";
import type { ConfirmedCoachMethod } from "../../coach/coach-brain.ts";
import type { GenerationInputs, RevisionProvenance, UniversalTrainingProgramContent } from "../../training/types.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}
console.log("\nGate 4.0C-5 — constraint-aware re-synthesis lifecycle\n");

// ---------------------------------------------------------------------------
// Fixtures: the coach's confirmed limitation record (+ exercise decisions) → real ClientState / ConstraintSet.
// ---------------------------------------------------------------------------
type Planned = Extract<ReasonerResult, { status: "PLANNED" }>;
const TEXT = "No squats or deadlifts, no ab work, nothing that needs real bracing.";
function record(optionIds: string[], decisions: ExerciseFitDecisionRecord[] = [], opts: { text?: string; at?: string } = {}): StoredStructuredLimitations {
  const r = buildConfirmation({ sourceText: opts.text ?? TEXT, proposal: null, selectedOptionIds: optionIds, clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "coach-1", nowIso: opts.at ?? NOW, carriedExerciseDecisions: decisions }, K);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  return (r as { record: StoredStructuredLimitations }).record;
}
const review = (rec: StoredStructuredLimitations, text = rec.sourceText): HealthReviewRecord => ({ clientId: "client-eval", workspaceId: "ws-eval", status: "proceed_with_limitations", reasons: ["x"], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: text, decisionEscalationId: "esc-1", structuredLimitations: rec }) as HealthReviewRecord;
const INJURY: Patch = { health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["lower_back"], injuryRestrictions: "Heavy lifting.", safetyScreen: ["none"] } };
const input = (rec: StoredStructuredLimitations, opts: { patch?: Patch; coach?: ConfirmedCoachMethod; clientId?: string; priorityMuscles?: string[] } = {}) => scenarioInput({ healthReview: review(rec), patch: { ...INJURY, ...(opts.patch ?? {}) }, coach: opts.coach, clientId: opts.clientId, ...(opts.priorityMuscles ? { coachConfirmedGoal: { class: "hypertrophy" as const, priorityMuscles: coachFact(opts.priorityMuscles, "goal_contract.priority_muscles") } } : {}) });
const cur = (i: ReturnType<typeof scenarioInput>): CurrentPlanningInputs => ({ client: i.client, goal: i.goal, constraints: i.constraints, coachMethodVersionId: i.coach?.versionId ?? null, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION });
const keyOf = (i: ReturnType<typeof scenarioInput>) => planningState({ client: i.client, goal: i.goal, constraints: i.constraints, coachMethodVersionId: i.coach?.versionId ?? null, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION }).key;
const decision = (exerciseId: string, verdict: "excluded" | "cleared", constraintsForBasis?: ReturnType<typeof scenarioInput>["constraints"], at = "2026-10-06T10:00:00.000Z"): ExerciseFitDecisionRecord => {
  const ex = K.getExercise(exerciseId)!;
  if (verdict === "excluded") return { exerciseId, exerciseName: ex.name, verdict, conditions: [], source: { kind: "proposal_review", jobId: "job-A", versionId: "ver-A2", decisionKey: `constraint_fit:${exerciseId}` }, decidedBy: "coach-1", decidedAtIso: at };
  const elig = exerciseEligibility(ex, constraintsForBasis!);
  const lc = elig.loadConditions.find((l) => l.certainty === "uncertain")!;
  return { exerciseId, exerciseName: ex.name, verdict, conditions: lc.conditions, basis: eligibilityBasis(elig), source: { kind: "preflight" }, decidedBy: "coach-1", decidedAtIso: at };
};
const BRACING = ["avoid_bracing_moderate"];
const TEAGUE = ["avoid_lower_compounds", "avoid_direct_trunk", "avoid_bracing_moderate"];
const gi: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
const toContent = (r: Planned, jobId = "job-A", revision?: RevisionProvenance) => reasonerResultToProgramContent({ result: r, knowledge: K, programId: "program-1", workspaceId: "ws-eval", clientProfileId: "client-eval", coachId: "coach-1", title: "Program", jobId, generationInputs: gi, nowIso: NOW, ...(revision ? { revision } : {}) });
async function solve(i: ReturnType<typeof scenarioInput>, tweak?: (p: WirePlan) => void, opts: { legacy?: boolean; runId?: string } = {}) {
  const model = fakeModel((ri) => scriptedOutput(ri, tweak));
  const r = await runFitnessReasoner({ input: i, model, nowIso: NOW, runId: opts.runId ?? "job-A", ...(opts.legacy ? { uncertainFit: "legacy_allow" as const } : {}) });
  return { r, model };
}
const planned = (r: ReasonerResult): Planned => {
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status === "NEEDS_INPUT" ? JSON.stringify(r.missing) : r.status);
  return r as Planned;
};
const ids = (r: ReasonerResult) => (r.run.input?.exercises ?? []).map((x) => x.split("|")[0]);
const fitCode = (r: ReasonerResult, id: string) => (r.run.input?.exercises ?? []).find((x) => x.startsWith(`${id}|`))?.split("|").at(-1);
const put = (sessionIdx: number[], exerciseId: string, slot = 2, extra: Record<string, unknown> = {}) => (p: WirePlan) => {
  for (const i of sessionIdx) p.sessions[i].exercises[slot] = { id: exerciseId, role: "accessory", sets: 3, reps: [8, 12], rir: [2, 3], note: "Placed by test.", ...extra };
};

// ---------------------------------------------------------------------------
await check("1. REMOVE → authoritative exclusion: future runs never offer it, and a revision that tries to use it is rejected", async () => {
  const before = input(record(BRACING));
  const after = input(record(BRACING, [decision("exercise.lat_pulldown", "excluded")]));
  assert.equal(demandCompatibility(exerciseEligibility(K.getExercise("exercise.lat_pulldown")!, after.constraints)), "incompatible");
  assert.ok(exerciseEligibility(K.getExercise("exercise.lat_pulldown")!, after.constraints).violations.some((v) => v.reason === "excluded by the coach"));
  const { r } = await solve(after);
  assert.ok(!ids(r).includes("exercise.lat_pulldown"), "not offered to the Reasoner");
  assert.ok(r.run.input!.constraints.some((c) => c.rules.includes("not Lat Pulldown")), "the exclusion is part of the enforced boundary");
  const forced = await solve(after, put([1, 3], "exercise.lat_pulldown"));
  assert.equal(forced.r.status, "REJECTED");
  assert.ok(forced.r.status === "REJECTED" && forced.r.errors.some((e) => /lat_pulldown wasn't among the eligible candidates/.test(e)));
  // Exercise-specific only — not generalized into a broader rule: other vertical pulls keep their own fit.
  assert.equal(demandCompatibility(exerciseEligibility(K.getExercise("exercise.assisted_pull_up")!, after.constraints)), demandCompatibility(exerciseEligibility(K.getExercise("exercise.assisted_pull_up")!, before.constraints)));
});

await check("2. KEEP-under-conditions → authoritative clearance with provenance; conditional only under its accepted conditions and basis", async () => {
  const base = input(record(BRACING));
  const cleared = decision("exercise.lat_pulldown", "cleared", base.constraints);
  const withClear = input(record(BRACING, [cleared]));
  const elig = exerciseEligibility(K.getExercise("exercise.lat_pulldown")!, withClear.constraints);
  assert.equal(demandCompatibility(elig), "conditional", "uncertain → conditional");
  assert.deepEqual(elig.clearedBy?.conditions, cleared.conditions);
  assert.ok(cleared.conditions.some((c) => /reps in reserve/.test(c)) && cleared.decidedBy === "coach-1" && cleared.source.kind === "preflight" && !!cleared.decidedAtIso, "provenance + conditions recorded");
  const { r } = await solve(withClear);
  assert.equal(fitCode(r, "exercise.lat_pulldown"), "K", "offered as conditional");
  // The accepted conditions are enforced: heavier/closer to failure is rejected.
  const heavy = await solve(withClear, put([1], "exercise.lat_pulldown", 2, { reps: [4, 6] }));
  assert.ok(heavy.r.status === "REJECTED" && heavy.r.errors.some((e) => /lat_pulldown has conditional\/uncertain constraint fit/.test(e)));
  // A clearance granted under a different eligibility basis is inert (never stretched to a new situation).
  const stale = { ...cleared, basis: "0".repeat(64) };
  const staleIn = input(record(BRACING, [stale]));
  assert.equal(demandCompatibility(exerciseEligibility(K.getExercise("exercise.lat_pulldown")!, staleIn.constraints)), "uncertain");
  // Exercise-specific: clearing Lat Pulldown doesn't clear Seated Cable Row.
  assert.equal(demandCompatibility(exerciseEligibility(K.getExercise("exercise.seated_cable_row")!, withClear.constraints)), "uncertain");
  // A revocation drops it.
  const revoked = input(record(BRACING, [cleared, { ...cleared, revoked: true, decidedAtIso: "2026-10-07T00:00:00.000Z" }]));
  assert.equal(demandCompatibility(exerciseEligibility(K.getExercise("exercise.lat_pulldown")!, revoked.constraints)), "uncertain");
});

await check("3. The material fingerprint ignores copy, notes, metadata, wording and re-confirming the same facts", () => {
  const a = input(record(TEAGUE));
  const same = [
    input(record(TEAGUE), { patch: { starting_point: { trainingExperience: "comfortable_common", weeklyFrequency: 4, recentConsistency: "very_consistent", trainingNotes: "Loves pressing." } } }),
    input(record(TEAGUE), { patch: { what_you_want: { primaryGoal: "build_muscle", secondaryGoals: [], successDefinition: "Look better at the beach" } } }),
    input(record(TEAGUE), { patch: { about_you: { age: 31, sex: "female", heightFeet: 5, heightInchesRemainder: 6, weightLb: 152, weightDirection: "stable" }, fuel_recovery: { typicalSleep: "6_7", hasDietaryRestrictions: "none" } } }),
    input(record(TEAGUE, [], { at: "2026-10-09T08:00:00.000Z" })), // re-confirmed later, same facts
    input(record(TEAGUE, [], { text: "No squats/deadlifts. No ab work. Nothing needing real bracing (typo fixed)." })), // wording only
  ];
  for (const [i, x] of same.entries()) assert.equal(keyOf(x), keyOf(a), `variant ${i} changed the key: ${diffPlanningState(planningState({ ...cur(a), exerciseName: (id) => id }), planningState({ ...cur(x), exerciseName: (id) => id })).map((c) => c.part).join(",")}`);
});

await check("4. The fingerprint changes for restrictions, exclusions, goal, method, equipment and availability — and names what changed", () => {
  const a = input(record(TEAGUE));
  const variants: Array<[string, ReturnType<typeof input>]> = [
    ["restrictions", input(record([...TEAGUE, "avoid_overhead"]))],
    ["exerciseFit", input(record(TEAGUE, [decision("exercise.lat_pulldown", "excluded")]))],
    ["goal", input(record(TEAGUE), { patch: { what_you_want: { primaryGoal: "get_stronger", secondaryGoals: [] } } })],
    ["method", input(record(TEAGUE), { coach: { ...coachMethod(), versionId: "mv-eval-8", version: 8 } })],
    ["equipment", input(record(TEAGUE), { patch: { your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], maxSessionLength: "75", trainingEnvironment: ["home_gym"] } } })],
    ["schedule", input(record(TEAGUE), { patch: { your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"] } } })],
  ];
  for (const [part, x] of variants) {
    assert.notEqual(keyOf(x), keyOf(a), `${part} didn't change the key`);
    const parts = diffPlanningState(planningState({ ...cur(a) }), planningState({ ...cur(x) })).map((c) => c.part);
    assert.ok(parts.includes(part as never), `${part}: diff named ${parts.join(",")}`);
  }
});

// Shared Teague-like dogfood fixture: v1 solved under the legacy policy with Lat Pulldown (U) in two pull sessions.
async function dogfood() {
  const stateA = input(record(TEAGUE), { patch: { your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"] }, starting_point: { trainingExperience: "experienced_consistent", weeklyFrequency: 6, recentConsistency: "very_consistent" } } });
  // An explicit six-day upper/lower-style week like the production draft: the pull days rely on Lat Pulldown for lats.
  const x = (id: string, sets = 3, note?: string) => ({ id, role: "accessory", sets, reps: [8, 12], rir: [2, 3], ...(note ? { note } : {}) });
  const U = "Only vertical pull left; U, coach review.";
  const week = [
    [x("exercise.machine_chest_press"), x("exercise.incline_dumbbell_press"), x("exercise.cable_triceps_pushdown")],
    [x("exercise.lat_pulldown", 3, U), x("exercise.chest_supported_row"), x("exercise.face_pull", 2), x("exercise.dumbbell_bicep_curl", 2)],
    [x("exercise.leg_extension"), x("exercise.leg_curl"), x("exercise.calf_raise")],
    [x("exercise.machine_chest_press"), x("exercise.lateral_raise"), x("exercise.overhead_cable_triceps_extension")],
    [x("exercise.lat_pulldown", 3, U), x("exercise.chest_supported_row"), x("exercise.reverse_dumbbell_fly", 2), x("exercise.hammer_curl", 2)],
    [x("exercise.leg_extension"), x("exercise.leg_curl"), x("exercise.seated_calf_raise")],
  ];
  const { r } = await solve(stateA, (p) => {
    p.sessions.forEach((s, i) => (s.exercises = week[i % week.length]));
    p.sessions[1].title = "OLD-PLAN-MARKER Upper B Pull";
  }, { legacy: true });
  const A = planned(r);
  const v1 = toContent(A);
  const v2 = removeExerciseEverywhere(v1, "Lat Pulldown");
  assert.ok(v2.ok);
  const v2c: UniversalTrainingProgramContent = { ...(v2 as { content: UniversalTrainingProgramContent }).content, reasonerProvenance: { ...v1.reasonerProvenance!, decisionResolutions: [{ key: "constraint_fit:exercise.lat_pulldown", exerciseId: "exercise.lat_pulldown", exerciseName: "Lat Pulldown", resolution: "removed", conditions: [], resolvedBy: "coach-1", resolvedAtIso: NOW }] } };
  const patch = { your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"] }, starting_point: { trainingExperience: "experienced_consistent", weeklyFrequency: 6, recentConsistency: "very_consistent" } };
  const stateB = input(record(TEAGUE, [decision("exercise.lat_pulldown", "excluded")]), { patch });
  return { stateA, stateB, A, v1, v2: v2c, patch };
}

await check("5. A material change supersedes the draft without touching it (draft content and run stay byte-identical)", async () => {
  const { stateA, stateB, A, v1, v2 } = await dogfood();
  const before = JSON.stringify({ v2, run: A.run, v1 });
  const atA = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stateA) });
  assert.equal(atA.lifecycle?.status, "current", "no state change yet: the draft-only removal is not a planning-state change");
  assert.equal(atA.decisions.find((d) => d.exerciseId === "exercise.lat_pulldown")?.authoritative, false, "draft-only decision flagged for confirmation");
  const atB = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stateB) });
  assert.equal(atB.lifecycle?.status, "superseded");
  assert.ok(atB.lifecycle!.reasons.some((x) => /Lat Pulldown \(you excluded it for this client\)/.test(x)), atB.lifecycle!.reasons.join(" | "));
  assert.deepEqual(atB.lifecycle!.changes.map((c) => c.part), ["exerciseFit"]);
  assert.ok(atB.approvalBlockedReason && /no longer the current solution/.test(atB.approvalBlockedReason), "a superseded draft can't be approved");
  assert.equal(atB.decisions.find((d) => d.exerciseId === "exercise.lat_pulldown")?.authoritative, true);
  assert.equal(JSON.stringify({ v2, run: A.run, v1 }), before, "nothing mutated");
});

await check("6. The revision is linked as the next solution of the same lineage: supersedes the draft, records both planning states and what changed", async () => {
  const { stateA, stateB, A, v1, v2 } = await dogfood();
  const assessment = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stateB) }).lifecycle!;
  assert.deepEqual(decideRevision({ assessment, draftJobId: "job-A", trigger: "fit_decision", jobs: [] }), { queue: true });
  const B = planned((await solve(stateB, undefined, { runId: "job-B" })).r);
  const prov: RevisionProvenance = { supersedesVersionId: "ver-A2", supersedesJobId: "job-A", trigger: "fit_decision", previousPlanningKey: assessment.solvedUnder.key, planningKey: assessment.current.key, changes: assessment.changes, reasons: assessment.reasons, requestedBy: "coach-1", requestedAtIso: NOW };
  const vB = toContent(B, "job-B", prov);
  assert.equal(vB.reasonerProvenance!.revision?.supersedesVersionId, "ver-A2");
  assert.equal(vB.reasonerProvenance!.planningKey, B.run.planningState!.key);
  assert.equal(B.run.planningState!.key, assessment.current.key, "the revision solved exactly the state that superseded the draft");
  assert.equal(keyOf(stateA), assessment.solvedUnder.key);
  assert.ok(vB.reasonerProvenance!.revision!.changes.some((c) => c.part === "exerciseFit" && c.added.includes("Not Lat Pulldown")));
  // Source: a revision is saved into the SAME program (next version) and the superseded drafts are archived, not deleted.
  const src = readFileSync(new URL("../../production/reasoner-lifecycle.ts", import.meta.url), "utf8");
  assert.ok(/createDraftProgramVersion\(\{ workspaceId: params\.workspaceId, \.\.\.\(params\.revision \? \{ programId: params\.revision\.programId \} : \{\}\)/.test(src), "revision → same programId");
  assert.ok(/archiveSiblingDraftVersions\(\{ workspaceId: params\.workspaceId, programId: params\.revision\.programId, resolvedVersionId: versionId \}\)/.test(src));
  assert.ok(!/\.delete\(/.test(src), "nothing is deleted");
});

await check("7. Idempotency: the same planning state never produces a second automatic revision of the same lineage", async () => {
  const { stateB, A, v1, v2 } = await dogfood();
  const assessment = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stateB) }).lifecycle!;
  const job = (status: RevisionJobRecord["status"], key = assessment.current.key, lineage = "job-A"): RevisionJobRecord => ({ jobId: `j-${status}`, status, planningKey: key, supersedesVersionId: "ver-A2", supersedesJobId: lineage });
  assert.deepEqual(decideRevision({ assessment, draftJobId: "job-A", trigger: "limitations_confirmed", jobs: [job("preparing")] }), { queue: false, reason: "in_flight" }, "double click / refresh while preparing");
  assert.deepEqual(decideRevision({ assessment, draftJobId: "job-A", trigger: "limitations_confirmed", jobs: [job("ready_for_review")] }), { queue: false, reason: "already_prepared" });
  for (const s of ["failed", "needs_input", "unsupported"] as const) assert.deepEqual(decideRevision({ assessment, draftJobId: "job-A", trigger: "fit_decision", jobs: [job(s)] }), { queue: false, reason: "already_attempted" }, `${s}: never auto-retried`);
  // A local edit to the old draft (new version id) is the same lineage — still no second automatic revision.
  assert.deepEqual(decideRevision({ assessment, draftJobId: "job-A", trigger: "fit_decision", jobs: [{ ...job("failed"), supersedesVersionId: "ver-A3" }] }), { queue: false, reason: "already_attempted" });
  // Only the coach's explicit request retries after a failure.
  assert.deepEqual(decideRevision({ assessment, draftJobId: "job-A", trigger: "coach_requested", jobs: [job("failed")] }), { queue: true });
  // A different (newer) state is a new problem → one revision for it.
  assert.deepEqual(decideRevision({ assessment, draftJobId: "job-A", trigger: "fit_decision", jobs: [job("failed", "other-key")] }), { queue: true });
  // Preflight answers: one generation per state.
  assert.equal(decideGenerationAfterPreflight({ currentKey: "k", jobs: [], questionsLeft: 0 }), true);
  assert.equal(decideGenerationAfterPreflight({ currentKey: "k", jobs: [{ jobId: "x", status: "needs_input", planningKey: "k", supersedesVersionId: null, supersedesJobId: null }], questionsLeft: 0 }), false);
  assert.equal(decideGenerationAfterPreflight({ currentKey: "k", jobs: [], questionsLeft: 1 }), false, "not until every question is answered");
});

await check("8. Confirming a material restriction queues exactly ONE revision (and confirmation is wired to the queue)", async () => {
  const { A, v1, v2, patch } = await dogfood();
  // The coach confirms a stricter restriction that hits a planned exercise still in the draft.
  const stricter = input(record([...TEAGUE, "avoid_prone"]), { patch });
  const m = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stricter) });
  assert.equal(m.lifecycle?.status, "superseded", m.lifecycle?.status);
  assert.ok(m.lifecycle!.hits.some((h) => h.exerciseName === "Chest-Supported Row" && h.inDraft));
  const jobs: RevisionJobRecord[] = [];
  const first = decideRevision({ assessment: m.lifecycle!, draftJobId: "job-A", trigger: "limitations_confirmed", jobs });
  assert.deepEqual(first, { queue: true });
  jobs.push({ jobId: "rev-1", status: "preparing", planningKey: m.lifecycle!.current.key, supersedesVersionId: "ver-A2", supersedesJobId: "job-A" });
  assert.equal(decideRevision({ assessment: m.lifecycle!, draftJobId: "job-A", trigger: "limitations_confirmed", jobs }).queue, false, "a second confirmation of the same facts queues nothing");
  const action = readFileSync(new URL("../../../app/actions/structured-limitations.ts", import.meta.url), "utf8");
  assert.ok(/queueRevisionIfMaterial\(\{ workspaceId: input\.workspaceId, clientProfileId: input\.clientProfileId, coachId: ctx\.userId, trigger: "limitations_confirmed" \}\)/.test(action), "confirmation → one revision check");
  assert.equal((action.match(/queueRevisionIfMaterial\(/g) ?? []).length, 2, "confirm + revoke only");
});

await check("9. Nothing is approved or published automatically (lifecycle + decision writers never publish, assign or approve)", () => {
  const lifecycle = readFileSync(new URL("../../production/reasoner-lifecycle.ts", import.meta.url), "utf8");
  const limits = readFileSync(new URL("../../production/structured-limitations.ts", import.meta.url), "utf8");
  for (const [name, src] of [["reasoner-lifecycle", lifecycle], ["structured-limitations", limits]] as const) {
    assert.ok(!/publishProgramVersion|assignProgramVersionToClient|approveProgramProposal|assign_active_program_version|status: "published"/.test(src), `${name} must never publish/assign/approve`);
    assert.ok(!/coach_brain|operating_model|coachMethod.*update|from\("coach_methods"\)/.test(src.replace(/resolveCoachIntelligenceForClient|coachMethodVersionId/g, "")), `${name} never writes Coach Brain`);
  }
  assert.ok(!/structured_limitations/.test(lifecycle), "the lifecycle never edits confirmed constraints");
  const actions = readFileSync(new URL("../../../app/actions/production-programs.ts", import.meta.url), "utf8");
  const queueFns = actions.split("export async function ").slice(1).filter((f) => /queueRevision|queueAfterPreflight/.test(f) && !/^approveProgramProposalAction/.test(f));
  assert.ok(queueFns.length >= 4, "the queueing actions were found");
  assert.ok(queueFns.every((f) => !/publishProgramVersion|assignProgramVersionToClient/.test(f)), "no queueing action publishes");
});

await check("10. Only-uncertain options for a GOAL-required muscle → stops BEFORE the paid call and asks; otherwise withheld, never asked", async () => {
  // Without a goal requirement, lats having only uncertain options is NOT a planning blocker: planning proceeds, the
  // Reasoner is told lats is unavailable (pending the coach's fit decision), and the options are listed for the coach.
  // Build "lats can only be trained by uncertain-fit exercises" from METADATA: exclude every confirmed-compatible /
  // conditional lats option the pool offers under the bracing restriction (whatever Fitness Knowledge contains).
  const base = input(record(BRACING));
  const bm = methodFor(base)!;
  const bp = buildPool(base, (bm as { method: Parameters<typeof buildPool>[1] }).method)!;
  const certainLats = functionAvailability(bp.pool, bp.loadConditions).find((f) => f.target === "lats")!.certain;
  const uncertainLats = functionAvailability(bp.pool, bp.loadConditions).find((f) => f.target === "lats")!.uncertain;
  assert.ok(certainLats.length > 1 && uncertainLats.length > 0, "fixture premise");
  const exclusions = () => certainLats.map((id) => decision(id, "excluded"));
  const noGoal = await solve(input(record(BRACING, exclusions())));
  assert.equal(noGoal.r.status, "PLANNED");
  assert.ok(noGoal.r.run.input!.functions!.unavailable.some((u) => u.target === "lats" && /unconfirmed/.test(u.why)) && noGoal.r.run.input!.functions!.required.length === 0);
  const i = input(record(BRACING, exclusions()), { priorityMuscles: ["lats"] });
  const { r, model } = await solve(i);
  assert.equal(r.status, "NEEDS_INPUT");
  assert.equal(model.calls, 0, "no model call");
  assert.ok(r.status === "NEEDS_INPUT" && r.source === "preflight");
  const q = r.run.preflight!.questions.map((x) => x.exerciseId).sort();
  assert.deepEqual(q, [...uncertainLats].sort(), "asks about exactly the uncertain lats options");
  assert.ok(r.run.preflight!.questions.every((x) => x.serves.includes("lats") && x.conditions.length > 0));
  // The coach answers → the state changes → planning proceeds with exactly what the coach decided.
  const cs = i.constraints;
  const [clear, ...rest] = [...uncertainLats].sort();
  const answered = input(record(BRACING, [...exclusions(), decision(clear, "cleared", cs), ...rest.map((x) => decision(x, "excluded"))]), { priorityMuscles: ["lats"] });
  const next = await solve(answered);
  const p = planned(next.r);
  assert.equal(fitCode(p, clear), "K");
  assert.ok(!ids(p).some((x) => [...rest, ...certainLats].includes(x)));
  // When a compatible option exists, uncertain ones are WITHHELD (never planned and deferred to coach review).
  const { r: plain } = await solve(input(record(BRACING)));
  assert.equal(plain.status, "PLANNED");
  assert.ok(plain.run.preflight!.withheld.length > 0 && plain.run.preflight!.withheld.every((id) => fitCode(planned(plain), id) === undefined), "uncertain options are withheld, not offered");
  assert.ok(!(plain.run.input?.exercises ?? []).some((x) => x.endsWith("|U")), "no U row reaches the model");
});

await check("11. Re-synthesis solves from the CURRENT state only — the old program is never fed in as an anchor", async () => {
  const { stateB, A } = await dogfood();
  const model = fakeModel((ri) => scriptedOutput(ri));
  planned(await runFitnessReasoner({ input: stateB, model, nowIso: NOW, runId: "job-B" }));
  assert.ok(!model.lastUserMessage.includes("OLD-PLAN-MARKER"), "previous session titles never reach the model");
  const oldIds = new Set(A.plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  assert.deepEqual(Object.keys(model.lastInput!).sort(), Object.keys(A.reasoning).sort(), "same input shape as a first proposal — no previous-plan field");
  assert.ok(oldIds.size > 0);
  const src = readFileSync(new URL("../../production/reasoner-lifecycle.ts", import.meta.url), "utf8");
  assert.ok(/loadInput: \(\) => loadSynthesisInputForClient\(params\.clientProfileId\)/.test(src), "revision input = the client's current SynthesisInput");
  const reasonerSrc = readFileSync(new URL("./reasoner.ts", import.meta.url), "utf8");
  assert.ok(!/previousPlan|priorPlan|supersed/.test(reasonerSrc), "the Reasoner has no previous-plan parameter");
});

await check("12. Adequacy blocks a structurally valid plan that makes false claims (a session labelled for muscles it doesn't train; dishonest coverage)", async () => {
  const i = input(record(BRACING));
  const padded = (p: WirePlan) => {
    p.sessions[1].targets = ["lats", "mid_back"];
    p.sessions[1].exercises = ["exercise.dumbbell_bicep_curl", "exercise.hammer_curl", "exercise.cable_curl"].map((id) => ({ id, role: "accessory", sets: 3, reps: [8, 12], rir: [2, 3] }));
  };
  const { r, model } = await solve(i, padded);
  const p = planned(r);
  assert.equal(model.calls, 2, "the deficiency was fed back once (the existing repair budget), not looped");
  assert.ok(p.adequacy!.findings.some((f) => f.kind === "deficiency" && f.code === "session_targets"), JSON.stringify(p.adequacy!.findings));
  const m = reasonerReviewModel({ content: toContent(p), run: p.run, knowledge: K, current: cur(i) });
  assert.equal(m.adequacy?.status, "unresolved");
  assert.ok(m.approvalBlockedReason && /fix them, or accept them explicitly/.test(m.approvalBlockedReason));
  // Dishonest coverage: claiming a target trained that gets no sets.
  const dishonest = await solve(i, (pl) => {
    pl.sessions.forEach((s) => (s.exercises = s.exercises.filter((e) => !["exercise.calf_raise", "exercise.seated_calf_raise", "exercise.single_leg_calf_raise"].includes(e.id))));
    pl.coverage = (i.goal ? ["chest", "lats", "mid_back", "side_delts", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves", "abdominals"] : []).map((t) => ({ target: t, status: "trained" }));
  });
  const d = planned(dishonest.r);
  assert.ok(d.adequacy!.findings.some((f) => f.code === "coverage_dishonest"), JSON.stringify(d.adequacy!.findings.map((f) => f.code)));
  // An adequate plan passes on the first attempt.
  const fine = await solve(i);
  assert.equal(fine.model.calls, 1);
});

await check("13. An infeasible function: honest declaration required; a coach decision ONLY when the goal requires it", async () => {
  // Make lats + mid-back genuinely untrainable from METADATA: no rows / pulldowns, and exclude whatever else in
  // Fitness Knowledge still trains them (e.g. pullovers) — the premise holds however large the registry is.
  const restr = ["avoid_horizontal_pull", "avoid_vertical_pull"];
  const others = K.exercises().filter((e) => e.primaryMuscles.some((m) => m === "lats" || m === "mid_back") && !e.patterns.some((p) => p === "horizontal_pull" || p === "vertical_pull")).map((e) => decision(e.id, "excluded"));
  const rec13 = (opts: Parameters<typeof input>[1] = {}) => input(record(restr, others), opts);
  const plain = rec13();
  const honest = planned((await solve(plain)).r);
  assert.deepEqual(honest.reasoning.functions!.unavailable.map((f) => f.target).sort(), ["lats", "mid_back"]);
  assert.ok(honest.plan.coverage!.filter((c) => ["lats", "mid_back"].includes(c.target)).every((c) => c.status === "not_trained"));
  // Not a goal requirement → shown as information, never blocking (the coach's own restriction removed it).
  const m0 = reasonerReviewModel({ content: toContent(honest), run: honest.run, knowledge: K, current: cur(plain) });
  assert.equal(m0.adequacy, null, JSON.stringify(m0.adequacy));
  assert.ok(m0.adequacyNotes.some((n) => /Lats isn't trained/.test(n)));
  // The goal names lats as a priority → limitation = blocking coach decision; explicit acceptance of this exact set clears it.
  const goal = rec13({ priorityMuscles: ["lats"] });
  const g = planned((await solve(goal)).r);
  const m = reasonerReviewModel({ content: toContent(g), run: g.run, knowledge: K, current: cur(goal) });
  assert.ok(m.adequacy && m.adequacy.limitations.some((f) => f.code === "goal_target_infeasible" && f.target === "lats") && m.adequacy.status === "unresolved", JSON.stringify(m.adequacy));
  const accepted = { ...toContent(g), reasonerProvenance: { ...toContent(g).reasonerProvenance!, decisionResolutions: [{ key: m.adequacy!.key, exerciseId: "", exerciseName: "", resolution: "accepted_limitation" as const, adequacySignature: m.adequacy!.signature, conditions: [], resolvedBy: "coach-1", resolvedAtIso: NOW }] } };
  assert.equal(reasonerReviewModel({ content: accepted, run: g.run, knowledge: K, current: cur(goal) }).approvalBlockedReason, null);
  // Claiming the infeasible function, or labelling a session with it, is rejected as a false claim (A).
  const claim = planned((await solve(plain, (p) => (p.coverage = ["chest", "lats", "mid_back", "side_delts", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves", "abdominals"].map((t) => ({ target: t, status: "trained" }))))).r);
  assert.ok(claim.adequacy!.findings.some((f) => f.code === "coverage_dishonest" && f.target === "lats"));
  const pad = planned((await solve(plain, (p) => (p.sessions[0].targets = ["lats"]))).r);
  assert.ok(pad.adequacy!.findings.some((f) => f.code === "session_targets" && /nothing in it trains it/.test(f.message)));
});

await check("14. A local coach edit keeps the local path: same planning state, edit-impact answers it, no revision", async () => {
  const i = input(record(BRACING));
  const r = planned((await solve(i)).r);
  const v1 = toContent(r);
  // Coach swaps one compatible accessory for another (preference).
  const v2 = structuredClone(v1);
  const names = new Set(r.plan.sessions.flatMap((s) => s.exercises.map((e) => K.getExercise(e.exerciseId)!.name)));
  const swap = names.has("Lateral Raise") ? ["Lateral Raise", "Cable Lateral Raise"] : names.has("Cable Lateral Raise") ? ["Cable Lateral Raise", "Lateral Raise"] : ["Hammer Curl", "Cable Curl"];
  for (const w of v2.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const it of b.items) if (it.name === swap[0]) it.name = swap[1];
  const m = reasonerReviewModel({ content: v2, run: r.run, knowledge: K, original: v1, current: cur(i) });
  assert.equal(m.lifecycle?.status, "current");
  assert.equal(decideRevision({ assessment: m.lifecycle!, draftJobId: "job-A", trigger: "fit_decision", jobs: [] }).queue, false);
  // edit-impact still runs for coach edits (here the swap keeps the function: no integrity decision).
  assert.equal(m.integrity, null);
  // A removal the program absorbs is local too; one that leaves a hole is an integrity decision (still local — the state didn't change).
  const holed = removeExerciseEverywhere(v1, K.getExercise(r.plan.sessions[0].exercises[0].exerciseId)!.name);
  if (holed.ok) assert.equal(reasonerReviewModel({ content: holed.content, run: r.run, knowledge: K, original: v1, current: cur(i) }).lifecycle?.status, "current");
});

await check("15. Constraint change → revision → later coach review keeps full provenance (states, trigger, superseded draft, decision source)", async () => {
  const { stateB, A, v1, v2 } = await dogfood();
  const atB = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stateB) }).lifecycle!;
  const B = planned((await solve(stateB, undefined, { runId: "job-B" })).r);
  const vB = toContent(B, "job-B", { supersedesVersionId: "ver-A2", supersedesJobId: "job-A", trigger: "fit_decision", previousPlanningKey: atB.solvedUnder.key, planningKey: atB.current.key, changes: atB.changes, reasons: atB.reasons, requestedBy: "coach-1", requestedAtIso: NOW });
  const later = reasonerReviewModel({ content: vB, run: B.run, knowledge: K, original: vB, current: cur(stateB) });
  assert.equal(later.lifecycle?.status, "current", "the revision is the current solution");
  assert.equal(later.revision?.supersedesJobId, "job-A");
  assert.equal(later.revision?.previousPlanningKey, A.run.planningState!.key);
  assert.ok(!later.decisions.some((d) => d.exerciseId === "exercise.lat_pulldown" && d.status === "unresolved"), "the decided exercise isn't re-asked");
  const recorded = effectiveExerciseDecisions((stateB.client.health.review.coachStructuredLimitations as { value: StoredStructuredLimitations }).value.exerciseDecisions);
  assert.deepEqual(recorded.map((d) => [d.exerciseId, d.verdict, d.source.jobId, d.source.versionId, d.decidedBy]), [["exercise.lat_pulldown", "excluded", "job-A", "ver-A2", "coach-1"]]);
  assert.equal(A.run.planningState!.key, atB.solvedUnder.key, "the old run keeps the state it solved under");
});

await check("16. Client-facing copy stays clean — no revision/lineage/adequacy language; cleared exercises without a pad get no pad cue", async () => {
  const base = input(record(BRACING));
  const withClear = input(record(BRACING, [decision("exercise.lat_pulldown", "cleared", base.constraints)]));
  const r = planned((await solve(withClear, put([1], "exercise.lat_pulldown"))).r);
  const content = toContent(r, "job-B", { supersedesVersionId: "v", supersedesJobId: "j", trigger: "limitations_confirmed", previousPlanningKey: "a", planningKey: "b", changes: [{ part: "exerciseFit", added: ["Lat Pulldown cleared under conditions"], removed: [] }], reasons: ["Confirmed restrictions changed."], requestedBy: "coach-1", requestedAtIso: NOW });
  const client = clientFacingProgramContent({ content, reviewedVersionId: "ver-B", knowledge: K, supportedSetup: supportedSetupNames(r.run, K), nowIso: NOW });
  assert.deepEqual(findClientCopyLeaks(client), []);
  assert.equal(client.reasonerProvenance, undefined);
  assert.ok(!JSON.stringify(client).match(/revision|supersed|planningKey|adequacy|limitation|cleared/i), "no lifecycle language");
  const pulldown = client.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items)))).find((x) => x.name === "Lat Pulldown");
  assert.ok(pulldown && !/pad or bench/.test(pulldown.coachCue ?? ""), "no false pad cue for a cleared exercise without trunk support");
});

await check("17. Cross-client isolation: another client's state never assesses or approves this client's draft", async () => {
  const i = input(record(BRACING));
  const r = planned((await solve(i)).r);
  const other = input(record(BRACING), { clientId: "client-other" });
  const m = reasonerReviewModel({ content: toContent(r), run: r.run, knowledge: K, current: cur(other) });
  assert.equal(m.available, false);
  assert.equal(m.lifecycle, null);
  assert.ok(m.approvalBlockedReason);
  const src = readFileSync(new URL("../../production/reasoner-lifecycle.ts", import.meta.url), "utf8");
  assert.ok(/export async function requireAssignedCoach/.test(src) && /coach_client_assignments/.test(src));
  const limits = readFileSync(new URL("../../production/structured-limitations.ts", import.meta.url), "utf8");
  assert.ok(/export async function recordExerciseFitDecisions[\s\S]{0,400}requireClientCoachAuthority/.test(limits), "fit decisions authorize the coach for this client first");
});

await check("18. Approval stays fail-closed: missing run, superseded draft, open adequacy all block; approval re-checks current state", async () => {
  const { stateB, A, v1, v2 } = await dogfood();
  assert.ok(reasonerReviewModel({ content: v2, run: null, knowledge: K, current: cur(stateB) }).approvalBlockedReason);
  assert.ok(/no longer the current solution/.test(reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stateB) }).approvalBlockedReason ?? ""));
  const actions = readFileSync(new URL("../../../app/actions/production-programs.ts", import.meta.url), "utf8");
  const approve = actions.slice(actions.indexOf("export async function approveProgramProposalAction"), actions.indexOf("export async function rejectProgramProposalAction"));
  assert.ok(/current = \(await planningContextFor\(params\.clientProfileId\)\)\.current;\s*\} catch \{\s*throw new Error/.test(approve), "state load failure → approval refused");
  assert.ok(approve.indexOf("approvalBlockedReason) throw") < approve.indexOf("publishProgramVersion("), "gate before publish");
});

await check("19. Multi-fact clarification intact; re-confirming the limitation carries the coach's exercise decisions forward verbatim", () => {
  const ex = decision("exercise.lat_pulldown", "excluded");
  const r = buildConfirmation({ sourceText: TEXT, proposal: { sourceText: TEXT, interpreter: { kind: "model", modelId: "t" }, restrictions: [], unsupported: [], clarifications: [{ quote: "real bracing", why: "x", question: "q", choices: ["avoid_bracing_high", "avoid_bracing_moderate", "exercise:exercise.lat_pulldown"] }] }, selectedOptionIds: ["avoid_lower_compounds"], clarificationAnswers: { "real bracing": ["avoid_bracing_moderate", "exercise:exercise.lat_pulldown"] }, noExerciseRestrictions: false, coachUserId: "coach-1", nowIso: NOW, carriedExerciseDecisions: [ex] }, K);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  if (!r.ok) return;
  assert.deepEqual(r.record.restrictions.map((x) => x.optionId), ["avoid_lower_compounds", "avoid_bracing_moderate", "exercise:exercise.lat_pulldown"]);
  assert.deepEqual(r.record.exerciseDecisions, [ex]);
  assert.ok(parseStoredLimitations(JSON.parse(JSON.stringify(r.record)), K), "stored record re-validates");
  assert.equal(parseStoredLimitations({ ...r.record, exerciseDecisions: [{ ...ex, exerciseId: "exercise.nope" }] }, K), null, "a malformed decision fails closed");
  const conflict = buildConfirmation({ sourceText: TEXT, proposal: null, selectedOptionIds: [], clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "c", nowIso: NOW }, K);
  assert.equal(conflict.ok, false);
});

await check("20. Existing Fitness Reasoner eval scenarios still pass their hard assertions (scripted model)", async () => {
  const failures: string[] = [];
  for (const s of SCENARIOS) {
    const inp = s.input();
    const m = fakeModel((ri) => scriptedOutput(ri));
    const r = await runFitnessReasoner({ input: inp, model: m, nowIso: NOW, runId: `eval-${s.id}` });
    const hard = s.hard(r, inp);
    if (hard.length) failures.push(`${s.id}: ${hard.join("; ")}`);
    if (!s.expectsModel && m.calls) failures.push(`${s.id}: unexpected model call`);
  }
  assert.deepEqual(failures, []);
});

await check("21. Dogfood case (generic, not hardcoded): Lat Pulldown excluded → superseded → revision solves the whole program without it", async () => {
  const { stateB, A, v1, v2 } = await dogfood();
  const atB = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(stateB) });
  assert.equal(atB.lifecycle?.status, "superseded");
  const { r, model } = await solve(stateB, undefined, { runId: "job-B" });
  const B = planned(r);
  assert.equal(model.calls, 1);
  assert.ok(!B.plan.sessions.some((s) => s.exercises.some((e) => e.exerciseId === "exercise.lat_pulldown")));
  assert.ok(B.run.preflight!.withheld.length > 0 && B.adequacy, "uncertain options withheld; adequacy evaluated against the current state");
  for (const f of ["lifecycle.ts", "adequacy.ts", "reasoner.ts", "../planning-state.ts", "../../production/reasoner-lifecycle.ts"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.ok(!/lat_pulldown|Lat Pulldown|pulldown/i.test(src), `${f}: no exercise-specific substitution`);
  }
});

await check("22. Regression: no muscle is required just because it exists in knowledge — Teague-like restrictions, no goal priorities → untrainable muscles are information, not blockers", async () => {
  const { stateB } = await dogfood();
  assert.deepEqual(stateB.goal.primary?.class, "hypertrophy");
  const B = planned((await solve(stateB, undefined, { runId: "job-B" })).r);
  assert.deepEqual(B.reasoning.functions!.required, [], "the goal names no priority muscles");
  // Whatever the restrictions make untrainable (abdominals here; which muscles depends on Fitness Knowledge) is
  // information, never a blocking limitation, because the goal doesn't require it.
  const unavailable = B.reasoning.functions!.unavailable.map((u) => u.target);
  assert.ok(unavailable.includes("abdominals"), unavailable.join(","));
  const m = reasonerReviewModel({ content: toContent(B, "job-B"), run: B.run, knowledge: K, current: cur(stateB) });
  assert.ok(!(m.adequacy?.limitations ?? []).some((f) => unavailable.includes(f.target ?? "")), JSON.stringify(m.adequacy?.limitations));
  for (const t of unavailable) assert.ok(m.adequacyNotes.some((n) => n.toLowerCase().startsWith(t.replace(/_/g, " ")) && /isn't trained/.test(n)), `${t} shown as information`);
});

await check("23. Adequacy boundary: no global number blocks — push/pull imbalance and a minority-share session target are information/judgment only", () => {
  const i = input(record(BRACING));
  const m = methodFor(i)!;
  assert.ok(m.ok);
  const pool = buildPool(i, (m as { method: Parameters<typeof buildPool>[1] }).method)!;
  const functions = functionAvailability(pool.pool, pool.loadConditions).map((f) => (f.state === "uncertain_only" ? { ...f, state: "available" as const } : f));
  const x = (id: string, sets: number) => ({ exerciseId: id, name: id, sets });
  const week = [
    { day: "mon", title: "Push", targets: ["chest"], items: [x("exercise.machine_chest_press", 4), x("exercise.incline_dumbbell_press", 4), x("exercise.cable_chest_fly", 4)] },
    // "Pull" day: lats/mid-back trained (3 sets) but most sets are arms — a quality judgment, not a contradiction.
    { day: "tue", title: "Pull", targets: ["lats", "mid_back"], items: [x("exercise.chest_supported_row", 3), x("exercise.dumbbell_bicep_curl", 4), x("exercise.hammer_curl", 4)] },
  ];
  const r = evaluateAdequacy({ week, knowledge: K, functions, required: [], declared: null, checkSessions: true });
  assert.ok(r.findings.some((f) => f.code === "push_pull_note" && f.kind === "information"), "imbalance surfaced as information");
  assert.equal(r.signature, null, `nothing blocks: ${JSON.stringify(r.findings.filter((f) => f.kind !== "information"))}`);
  for (const f of r.findings) assert.ok(["A", "B", "C", "D"].includes(f.basis));
  const src = readFileSync(new URL("./adequacy.ts", import.meta.url), "utf8");
  assert.ok(!/\* 2 < total|onTarget/.test(src), "no session share threshold");
});

await check("24. One canonical exercise-level fact: 'Avoid Lat Pulldown' confirmed as a limitation ≡ an exclusion decision; a draft-only REMOVE resolves against it — no second confirmation", async () => {
  const viaLimitation = input(record([...TEAGUE, "exercise:exercise.lat_pulldown"]));
  const viaDecision = input(record(TEAGUE, [decision("exercise.lat_pulldown", "excluded")]));
  const both = input(record([...TEAGUE, "exercise:exercise.lat_pulldown"], [decision("exercise.lat_pulldown", "excluded")]));
  assert.equal(keyOf(viaLimitation), keyOf(viaDecision), "same fact → same planning state, whichever way it was confirmed");
  assert.equal(keyOf(both), keyOf(viaDecision), "recorded twice = one fact");
  const { A, v1, v2 } = await dogfood();
  const m = reasonerReviewModel({ content: v2, run: A.run, knowledge: K, original: v1, current: cur(input(record([...TEAGUE, "exercise:exercise.lat_pulldown"]), { patch: (await dogfood()).patch })) });
  const d = m.decisions.find((x) => x.exerciseId === "exercise.lat_pulldown")!;
  assert.equal(d.status, "removed");
  assert.equal(d.authoritative, true, "the confirmed limitation already makes the draft's REMOVE authoritative — no 'Confirm: exclude' button");
  assert.equal(m.lifecycle?.status, "superseded", "the confirmed exclusion is the state change that supersedes the draft");
  const limits = readFileSync(new URL("../../production/structured-limitations.ts", import.meta.url), "utf8");
  assert.ok(/Already excluded by ANY confirmed fact[\s\S]{0,300}excluded by the coach/.test(limits), "recording an exclusion that already exists is a no-op");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
