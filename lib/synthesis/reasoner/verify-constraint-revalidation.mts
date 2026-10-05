// Gate 4.0C-4 — multi-fact clarification + full draft revalidation against the CURRENT confirmed restrictions.
// Offline: scripted runs, no provider, no database.

import assert from "node:assert/strict";
import { FOUNDATION_KNOWLEDGE as K } from "../knowledge/registry.ts";
import { buildConfirmation, parseStoredLimitations, type ConfirmationInput } from "../limitations/confirm.ts";
import { clarificationDimensions, dimensionOf } from "../limitations/vocabulary.ts";
import type { InterpretationProposal } from "../limitations/interpret.ts";
import { exerciseEligibility, demandCompatibility } from "../exercise-eligibility.ts";
import { runFitnessReasoner, type ReasonerResult } from "./reasoner.ts";
import { reasonerResultToProgramContent } from "./to-program.ts";
import { clientFacingProgramContent, findClientCopyLeaks, reasonerReviewModel, removeExerciseEverywhere, supportedSetupNames } from "./review-gate.ts";
import { fakeModel, NOW, restrict, scenarioInput, scriptedOutput, type WireExercise, type WirePlan } from "./eval/fixtures.ts";
import type { ConstraintTag } from "../constraints.ts";
import type { DecisionResolution, GenerationInputs, UniversalTrainingProgramContent } from "../../training/types.ts";

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
console.log("\nGate 4.0C-4 — multi-fact clarification + full revalidation against current restrictions\n");

// ---------------------------------------------------------------------------
// Clarification → confirmation
// ---------------------------------------------------------------------------
const TEXT = "No movements that involve bracing like high effort lat pull downs.";
const proposal = (over: Partial<InterpretationProposal> = {}): InterpretationProposal => ({
  sourceText: TEXT,
  interpreter: { kind: "model", modelId: "test" },
  restrictions: [],
  clarifications: [{ quote: "bracing like high effort lat pull downs", why: "Could be a bracing limit and/or one exercise.", question: "What should this rule out?", choices: ["avoid_bracing_high", "avoid_bracing_moderate", "exercise:exercise.lat_pulldown"] }],
  unsupported: [],
  ...over,
});
const confirm = (over: Partial<ConfirmationInput>) => buildConfirmation({ sourceText: TEXT, proposal: proposal(), selectedOptionIds: [], clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "coach-1", nowIso: NOW, ...over }, K);
const Q = "bracing like high effort lat pull downs";

await check("1. One report → two independent constraints, both confirmed, persisted separately with their own provenance, both authoritative", () => {
  const r = confirm({ clarificationAnswers: { [Q]: ["avoid_bracing_moderate", "exercise:exercise.lat_pulldown"] } });
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  if (!r.ok) return;
  assert.deepEqual(r.record.restrictions.map((x) => [x.optionId, x.origin, x.quote]), [
    ["avoid_bracing_moderate", "clarified", Q],
    ["exercise:exercise.lat_pulldown", "clarified", Q],
  ]);
  assert.ok(parseStoredLimitations(JSON.parse(JSON.stringify(r.record)), K), "stored record re-validates");
  // Authoritative: both tags reach the ConstraintSet and both exclude exercises.
  const cs = scenarioInput({ restrictions: restrict(r.record.restrictions.flatMap((x) => x.tags)) }).constraints;
  assert.equal(demandCompatibility(exerciseEligibility(K.getExercise("exercise.lat_pulldown")!, cs)), "incompatible", "named exercise excluded");
  assert.equal(demandCompatibility(exerciseEligibility(K.getExercise("exercise.goblet_squat")!, cs)), "incompatible", "moderate bracing excluded");
});

await check("2. Truly mutually exclusive interpretations stay single-select (levels of one dimension); independent facts don't compete", () => {
  const dims = clarificationDimensions(["avoid_bracing_high", "avoid_bracing_moderate", "avoid_spinal_loading_high", "exercise:exercise.lat_pulldown"], K);
  assert.deepEqual(dims.map((d) => [d.key, d.exclusive, d.options.length]), [
    ["demand:bracing", true, 2],
    ["demand:spinal_loading", false, 1],
    ["option:exercise:exercise.lat_pulldown", false, 1],
  ]);
  assert.equal(dimensionOf("avoid_squat", K).key, "option:avoid_squat", "a movement pattern is its own fact");
  const both = confirm({ clarificationAnswers: { [Q]: ["avoid_bracing_high", "avoid_bracing_moderate"] } });
  assert.ok(!both.ok && both.errors.some((e) => /choose one level of bracing limit/i.test(e)), "two levels of one dimension contradict");
});

await check("3. Confirming a clarified fact doesn't discard an independent fact from the same report", () => {
  const p = proposal({ restrictions: [{ optionId: "exercise:exercise.lat_pulldown", quote: "lat pull downs" }], clarifications: [{ quote: "bracing", why: "", question: "Which level?", choices: ["avoid_bracing_high", "avoid_bracing_moderate"] }] });
  const r = confirm({ proposal: p, selectedOptionIds: ["exercise:exercise.lat_pulldown"], clarificationAnswers: { bracing: ["avoid_bracing_moderate"] } });
  assert.ok(r.ok && r.record.restrictions.length === 2, r.ok ? "" : r.errors.join("; "));
  if (r.ok) assert.deepEqual(r.record.restrictions.map((x) => [x.optionId, x.origin, x.quote]), [["exercise:exercise.lat_pulldown", "proposed", "lat pull downs"], ["avoid_bracing_moderate", "clarified", "bracing"]]);
});

await check("4. Equivalent / implied duplicates are deduplicated safely (strictest kept, the implied one recorded)", () => {
  const a = confirm({ selectedOptionIds: ["avoid_bracing_high"], clarificationAnswers: { [Q]: ["avoid_bracing_moderate"] } });
  assert.ok(a.ok);
  if (a.ok) {
    assert.deepEqual(a.record.restrictions.map((x) => x.optionId), ["avoid_bracing_moderate"]);
    assert.deepEqual(a.record.interpretation.subsumedOptionIds, ["avoid_bracing_high"]);
  }
  const b = confirm({ proposal: null, selectedOptionIds: ["avoid_squat", "avoid_lower_compounds", "avoid_squat"], clarificationAnswers: {} });
  assert.ok(b.ok && b.record.restrictions.map((x) => x.optionId).join() === "avoid_lower_compounds", b.ok ? JSON.stringify(b.record.restrictions.map((x) => x.optionId)) : b.errors.join());
});

await check("5. Conflicting answers fail clearly instead of overwriting each other", () => {
  const none = confirm({ clarificationAnswers: { [Q]: ["none", "avoid_bracing_moderate"] } });
  assert.ok(!none.ok && none.errors.some((e) => /not both/.test(e)));
  const noRestr = confirm({ selectedOptionIds: ["avoid_squat"], noExerciseRestrictions: true, clarificationAnswers: { [Q]: "none" } });
  assert.ok(!noRestr.ok && noRestr.errors.some((e) => /either restrictions or/.test(e)));
  const unanswered = confirm({ clarificationAnswers: {} });
  assert.ok(!unanswered.ok && unanswered.errors.some((e) => /Answer the clarification/.test(e)));
  const legacy = confirm({ clarificationAnswers: { [Q]: "avoid_bracing_high" } });
  assert.ok(legacy.ok, "a single string answer still works");
});

// ---------------------------------------------------------------------------
// Full revalidation of an existing draft against the CURRENT restrictions
// ---------------------------------------------------------------------------
type Planned = Extract<ReasonerResult, { status: "PLANNED" }>;
const ex = (id: string, sets = 2, reps = [8, 12], rir = [2, 3], note?: string): WireExercise => ({ id, role: "accessory", sets, reps, rir, ...(note ? { note } : {}) });
const PULL = [ex("exercise.lat_pulldown", 3), ex("exercise.chest_supported_row", 3), ex("exercise.dumbbell_bicep_curl")];
const PUSH = [ex("exercise.machine_chest_press", 3), ex("exercise.cable_triceps_pushdown"), ex("exercise.lateral_raise")];
const LEGS = [ex("exercise.goblet_squat", 3), ex("exercise.leg_curl", 3), ex("exercise.calf_raise")];
let modelCalls = 0;
/** A draft generated with NO confirmed restrictions (they're confirmed later). */
async function draft(): Promise<Planned> {
  const m = fakeModel((ri) => scriptedOutput(ri, (p: WirePlan) => p.sessions.forEach((s, i) => (s.exercises = [PUSH, PULL, LEGS, PULL][i] ?? PUSH))));
  const r = await runFitnessReasoner({ input: scenarioInput(), model: m, nowIso: NOW, runId: "job-1" });
  modelCalls += m.calls;
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  return r as Planned;
}
const gi: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
const content = (r: Planned) => reasonerResultToProgramContent({ result: r, knowledge: K, programId: "program-job-1", workspaceId: "ws", clientProfileId: "client-eval", coachId: "co", title: "Program", jobId: "job-1", generationInputs: gi, nowIso: NOW });
const constraintsWith = (tags: ConstraintTag[]) => scenarioInput({ restrictions: restrict(tags) }).constraints;
const BRACING_MOD: ConstraintTag = { kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" };
const NO_PULLDOWN: ConstraintTag = { kind: "avoid_exercise", exerciseId: "exercise.lat_pulldown" };
const review = (r: Planned, c: UniversalTrainingProgramContent, tags: ConstraintTag[] | null, original?: UniversalTrainingProgramContent) => reasonerReviewModel({ content: c, run: r.run, knowledge: K, original: original ?? null, currentConstraints: tags ? constraintsWith(tags) : null });
const withRes = (c: UniversalTrainingProgramContent, rs: DecisionResolution[]) => ({ ...c, reasonerProvenance: { ...c.reasonerProvenance!, decisionResolutions: [...(c.reasonerProvenance!.decisionResolutions ?? []), ...rs] } });
const byKey = (m: ReturnType<typeof review>, id: string) => m.decisions.find((d) => d.key === `constraint_fit:${id}`);

await check("6. A newly confirmed restriction triggers full revalidation of an existing multi-week draft (no model call)", async () => {
  const r = await draft();
  const c = content(r);
  const callsBefore = modelCalls;
  assert.equal(review(r, c, null).approvalBlockedReason, null, "valid against its own (empty) snapshot");
  const m = review(r, c, [BRACING_MOD]);
  assert.ok(m.constraintsChanged);
  assert.ok(!reasonerReviewModel({ content: c, run: r.run, knowledge: K, currentConstraints: scenarioInput().constraints }).constraintsChanged, "same facts (re-derived) → not a change");
  assert.equal(byKey(m, "exercise.goblet_squat")?.fit, "incompatible", "base moderate bracing now excluded");
  assert.equal(byKey(m, "exercise.lat_pulldown")?.fit, "uncertain", "load-sensitive, no trunk support");
  assert.ok(!byKey(m, "exercise.machine_chest_press"), "conditional fit is information, not a decision");
  assert.ok(m.approvalBlockedReason);
  assert.equal(modelCalls, callsBefore, "deterministic revalidation made no model call");
});

await check("7. An exercise in a different week/session that becomes incompatible is detected", async () => {
  const r = await draft();
  const c = structuredClone(content(r));
  // The coach added Dumbbell Row only in week 6 (Friday's session).
  const fri = c.weeks[5].days.find((d) => d.type === "training" && d.dayOfWeek !== "Monday")!.sessions![0];
  fri.blocks.push({ id: "b-x", kind: "straight", order: fri.blocks.length + 1, items: [{ id: "i-x", order: 1, name: "Dumbbell Row", category: "resistance", prescription: { family: "resistance", sets: 2, reps: { low: 8, high: 12 }, rir: 2 } }] });
  const m = review(r, c, [BRACING_MOD]);
  assert.equal(byKey(m, "exercise.dumbbell_row")?.fit, "uncertain", "found though it's only in one session of one week");
  // A coach-typed exercise OPTIM doesn't know is never treated as cleared.
  fri.blocks.push({ id: "b-y", kind: "straight", order: fri.blocks.length + 1, items: [{ id: "i-y", order: 1, name: "Mystery Machine Press", category: "resistance", prescription: { family: "resistance", sets: 2, reps: { low: 8, high: 12 } } }] });
  assert.equal(byKey(review(r, c, [BRACING_MOD]), "custom:mystery machine press")?.fit, "unverifiable");
  assert.ok(!byKey(review(r, c, null), "custom:mystery machine press"), "no confirmed restrictions → nothing to check against");
});

await check("8. A previously resolved decision that the new restrictions invalidate is reopened", async () => {
  const r = await draft();
  const c = content(r);
  const a = review(r, c, [BRACING_MOD]);
  const lat = byKey(a, "exercise.lat_pulldown")!;
  const accepted = withRes(c, [{ key: lat.key, exerciseId: lat.exerciseId, exerciseName: lat.exerciseName, resolution: "accepted_with_conditions", conditions: lat.conditions, fitBasis: lat.fitBasis, resolvedBy: "coach", resolvedAtIso: NOW }]);
  assert.equal(byKey(review(r, accepted, [BRACING_MOD]), "exercise.lat_pulldown")?.status, "accepted_with_conditions");
  const stricter = byKey(review(r, accepted, [BRACING_MOD, NO_PULLDOWN]), "exercise.lat_pulldown")!;
  assert.deepEqual([stricter.status, stricter.fit], ["unresolved", "incompatible"], "now explicitly excluded → reopened, keep not allowed");
  const anyBracing = byKey(review(r, accepted, [{ kind: "avoid_demand", demand: "bracing", atOrAbove: "low" }]), "exercise.lat_pulldown")!;
  assert.deepEqual([anyBracing.status, anyBracing.fit], ["unresolved", "incompatible"], "basis changed (base bracing now excluded) → reopened");
});

await check("9. An unaffected decision stays resolved (no churn) and a now-compatible exercise drops out", async () => {
  const r = await draft();
  const c = content(r);
  const lat = byKey(review(r, c, [BRACING_MOD]), "exercise.lat_pulldown")!;
  const accepted = withRes(c, [{ key: lat.key, exerciseId: lat.exerciseId, exerciseName: lat.exerciseName, resolution: "accepted_with_conditions", conditions: lat.conditions, fitBasis: lat.fitBasis, resolvedBy: "coach", resolvedAtIso: NOW }]);
  const unrelated = review(r, accepted, [BRACING_MOD, { kind: "avoid_movement_pattern", pattern: "calf_raise" }]);
  assert.equal(byKey(unrelated, "exercise.lat_pulldown")?.status, "accepted_with_conditions", "an unrelated new restriction doesn't reopen it");
  assert.equal(byKey(unrelated, "exercise.calf_raise")?.fit, "incompatible", "…but the newly excluded exercise is caught");
  assert.ok(!byKey(review(r, accepted, [{ kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]), "exercise.lat_pulldown"), "looser restriction → no decision at all");
});

await check("10. Revalidation feeds the program-integrity layer: excluded exercise → removed → deficiency → blocked until resolved", async () => {
  const r = await draft();
  const v1 = content(r);
  const tags = [BRACING_MOD, NO_PULLDOWN];
  assert.equal(byKey(review(r, v1, tags, v1), "exercise.lat_pulldown")?.fit, "incompatible");
  const removed = removeExerciseEverywhere(v1, "Lat Pulldown");
  assert.ok(removed.ok);
  if (!removed.ok) return;
  const v2 = withRes(removed.content, [{ key: "constraint_fit:exercise.lat_pulldown", exerciseId: "exercise.lat_pulldown", exerciseName: "Lat Pulldown", resolution: "removed", conditions: [], resolvedBy: "coach", resolvedAtIso: NOW }]);
  const m = review(r, v2, tags, v1);
  assert.equal(byKey(m, "exercise.lat_pulldown")?.status, "removed");
  assert.ok(m.integrity?.status === "unresolved" && m.integrity.analysis.deficiencies.some((d) => /vertical pull/i.test(d.label)), JSON.stringify(m.integrity?.analysis.deficiencies.map((d) => d.label)));
  assert.ok(m.integrity!.analysis.candidates.every((x) => x.exerciseName !== "Lat Pulldown" && x.exerciseName !== "Assisted Pull-Up"), "candidates checked against the CURRENT restrictions");
  assert.ok(m.approvalBlockedReason);
});

await check("11. Informational items alone never block", async () => {
  const r = await draft();
  const c = content(r);
  const noisy = { ...c, reasonerProvenance: { ...c.reasonerProvenance!, needsYou: ["Tension with your method: main sets capped."] } };
  const m = review(r, noisy, [{ kind: "avoid_movement_pattern", pattern: "carry" }]);
  assert.equal(m.decisions.length, 0);
  assert.equal(m.approvalBlockedReason, null);
});

await check("12. Client-facing copy stays clean after revalidation-driven edits", async () => {
  const r = await draft();
  const removed = removeExerciseEverywhere(content(r), "Goblet Squat");
  assert.ok(removed.ok);
  if (!removed.ok) return;
  const client = clientFacingProgramContent({ content: removed.content, reviewedVersionId: "v2", knowledge: K, supportedSetup: supportedSetupNames(r.run), nowIso: NOW });
  assert.deepEqual(findClientCopyLeaks(client), []);
});

await check("13. Earlier immutable versions and the ReasonerRun are never mutated by revalidation", async () => {
  const r = await draft();
  const c = content(r);
  const before = JSON.stringify({ c, run: r.run });
  review(r, c, [BRACING_MOD, NO_PULLDOWN], c);
  removeExerciseEverywhere(c, "Lat Pulldown");
  assert.equal(JSON.stringify({ c, run: r.run }), before);
});

await check("14. No cross-client leakage: another client's restrictions are never applied to this draft (fails closed)", async () => {
  const r = await draft();
  const other = scenarioInput({ clientId: "client-other", restrictions: restrict([NO_PULLDOWN]) }).constraints;
  const m = reasonerReviewModel({ content: content(r), run: r.run, knowledge: K, currentConstraints: other });
  assert.ok(!m.available && m.approvalBlockedReason, "refused");
  assert.equal(m.decisions.length, 0, "nothing from the other client's restrictions surfaces");
});

await check("15. Deterministic revalidation needs no model; the run's frozen generation-time view is not what decides", async () => {
  const r = await draft();
  const c = content(r);
  const before = modelCalls;
  for (let i = 0; i < 3; i++) review(r, c, [BRACING_MOD]);
  assert.equal(modelCalls, before);
  // Generated with no restrictions, so the run itself marks nothing uncertain — the CURRENT restrictions decide.
  assert.ok(!r.run.input!.exercises.some((row) => row.endsWith("|U")));
  assert.ok(review(r, c, [BRACING_MOD]).decisions.length > 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
