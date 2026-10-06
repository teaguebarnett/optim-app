// Gate 4.0C-4 — post-edit impact analysis + constrained repair (offline; scripted runs, test-double repair model).

import assert from "node:assert/strict";
import { FOUNDATION_KNOWLEDGE as K } from "../knowledge/registry.ts";
import { runFitnessReasoner, type ReasonerResult } from "./reasoner.ts";
import { reasonerResultToProgramContent } from "./to-program.ts";
import { clientFacingProgramContent, findClientCopyLeaks, reasonerReviewModel, removeExerciseEverywhere, supportedSetupNames } from "./review-gate.ts";
import { analyzeProgramIntegrity, applyReplacement, checkReplacement, defaultReplacement, feasibleCandidates, parseRepairOutput, repairInput, scriptedRepair, validateRepair } from "./edit-impact.ts";
import { fakeModel, NOW, restrict, scenarioInput, scriptedOutput, type WireExercise, type WirePlan } from "./eval/fixtures.ts";
import { methodFor } from "../planners/resistance/planner.ts";
import { validateUniversalTrainingProgramContent } from "../../production/validation.ts";
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
console.log("\nGate 4.0C-4 — post-edit impact analysis + constrained repair\n");

type Planned = Extract<ReasonerResult, { status: "PLANNED" }>;
const bracing = () => restrict([{ kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" }]);
const input = () => scenarioInput({ restrictions: bracing() });
const method = methodFor(input())!;
if (!method.ok) throw new Error("fixture method unreadable");
const M = method.method;
const ex = (id: string, sets = 2, reps = [8, 12], rir = [2, 3], note?: string): WireExercise => ({ id, role: "accessory", sets, reps, rir, ...(note ? { note } : {}) });
const U_NOTE = "Only option for this pattern; uncertain fit.";
/** A fully explicit 4-day plan (fixture anchors: 4 days, 8 weeks, deload weeks 4 & 8). */
async function plan(sessions: WireExercise[][]): Promise<Planned> {
  const put = (p: WirePlan) => p.sessions.forEach((s, i) => (s.exercises = sessions[i] ?? sessions[0]));
  // Pre-4.0C-5 policy: these fixtures model drafts generated with uncertain-fit exercises (the coach decides after generation).
  const r = await runFitnessReasoner({ input: input(), model: fakeModel((ri) => scriptedOutput(ri, put)), nowIso: NOW, runId: "job-1", uncertainFit: "legacy_allow" });
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  return r as Planned;
}
const gi: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
const content = (r: Planned) => reasonerResultToProgramContent({ result: r, knowledge: K, programId: "program-job-1", workspaceId: "ws", clientProfileId: "c", coachId: "co", title: "Program", jobId: "job-1", generationInputs: gi, nowIso: NOW });
const review = (r: Planned, original: UniversalTrainingProgramContent, current: UniversalTrainingProgramContent) => reasonerReviewModel({ content: current, run: r.run, knowledge: K, original });
const remove = (c: UniversalTrainingProgramContent, name: string) => {
  const x = removeExerciseEverywhere(c, name);
  assert.ok(x.ok, x.ok ? "" : x.message);
  return x.ok ? x.content : c;
};
const withResolutions = (c: UniversalTrainingProgramContent, rs: DecisionResolution[]) => ({ ...c, reasonerProvenance: { ...c.reasonerProvenance!, decisionResolutions: [...(c.reasonerProvenance!.decisionResolutions ?? []), ...rs] } });
const fitRemoved = (id: string, name: string): DecisionResolution => ({ key: `constraint_fit:${id}`, exerciseId: id, exerciseName: name, resolution: "removed", conditions: [], resolvedBy: "coach", resolvedAtIso: NOW });

// Plans. Under a moderate-bracing restriction: Lat Pulldown / Seated Cable Row are UNCERTAIN fit; Chest-Supported Row is compatible.
const PUSH = [ex("exercise.machine_chest_press", 3, [8, 12], [2, 3]), ex("exercise.cable_triceps_pushdown"), ex("exercise.lateral_raise")];
const LEGS = [ex("exercise.leg_extension", 3), ex("exercise.leg_curl", 3), ex("exercise.calf_raise")];
const covered = () => plan([PUSH, [ex("exercise.chest_supported_row", 3), ex("exercise.seated_cable_row", 2, [8, 12], [2, 3], U_NOTE), ex("exercise.dumbbell_bicep_curl")], LEGS, [ex("exercise.chest_supported_row", 3), ex("exercise.face_pull"), ex("exercise.hammer_curl")]]);
const verticalOnly = () => plan([PUSH, [ex("exercise.lat_pulldown", 3, [8, 12], [2, 3], U_NOTE), ex("exercise.face_pull"), ex("exercise.dumbbell_bicep_curl")], LEGS, [ex("exercise.lat_pulldown", 3, [8, 12], [2, 3], U_NOTE), ex("exercise.reverse_dumbbell_fly"), ex("exercise.hammer_curl")]]);
const horizontalOnly = () => plan([PUSH, [ex("exercise.seated_cable_row", 3, [8, 12], [2, 3], U_NOTE), ex("exercise.face_pull"), ex("exercise.dumbbell_bicep_curl")], LEGS, [ex("exercise.seated_cable_row", 3, [8, 12], [2, 3], U_NOTE), ex("exercise.reverse_dumbbell_fly"), ex("exercise.hammer_curl")]]);

await check("1. Removing an uncertain exercise whose purpose stays covered: decision resolves, no deficiency, approval eligible", async () => {
  const r = await covered();
  const v1 = content(r);
  assert.ok(review(r, v1, v1).approvalBlockedReason, "blocked before the decision");
  const v2 = withResolutions(remove(v1, "Seated Cable Row"), [fitRemoved("exercise.seated_cable_row", "Seated Cable Row")]);
  const m = review(r, v1, v2);
  assert.equal(m.decisions[0].status, "removed");
  assert.equal(m.integrity, null, JSON.stringify(m.integrity?.analysis.deficiencies));
  assert.equal(m.approvalBlockedReason, null);
});

await check("2. Removing it creates a real program hole: the fit decision resolves, a program-integrity decision appears, approval stays blocked", async () => {
  const r = await verticalOnly();
  const v1 = content(r);
  const v2 = withResolutions(remove(v1, "Lat Pulldown"), [fitRemoved("exercise.lat_pulldown", "Lat Pulldown")]);
  const m = review(r, v1, v2);
  assert.equal(m.decisions[0].status, "removed", "the exercise-level decision is resolved");
  assert.ok(m.integrity && m.integrity.status === "unresolved", "a new program-level consequence");
  const labels = m.integrity!.analysis.deficiencies.map((d) => d.label);
  assert.ok(labels.some((l) => /vertical pull/i.test(l)), labels.join("; "));
  assert.ok(labels.some((l) => /lats/i.test(l)), labels.join("; "));
  assert.deepEqual(m.integrity!.analysis.causes.map((c) => [c.exerciseName, c.setsAfter]), [["Lat Pulldown", 0]]);
  assert.ok(m.approvalBlockedReason && /underrepresented/.test(m.approvalBlockedReason));
  // One integrity decision for the whole consequence (deduplicated); Gate 4.0C-5 current-state adequacy also flags
  // the now-unbalanced week independently of v1 (edit-impact is not the quality standard).
  assert.equal(m.unresolvedCount - (m.adequacy?.status === "unresolved" ? 1 : 0), 1, "one integrity decision for the whole consequence (deduplicated)");
  assert.ok(m.adequacy?.status === "unresolved", "current-state adequacy flags the week too");
});

await check("3. Feasible alternatives are constraint-checked; a Reasoner recommendation is coach-reviewable and NOT applied", async () => {
  const r = await verticalOnly();
  const v1 = content(r);
  const v2 = remove(v1, "Lat Pulldown");
  const a = analyzeProgramIntegrity({ original: v1, current: v2, run: r.run, knowledge: K });
  assert.ok(a.candidates.length > 0);
  assert.ok(a.candidates.every((c) => c.fit === "compatible" || c.fit === "conditional"), "never uncertain or incompatible");
  const names = a.candidates.map((c) => c.exerciseName);
  for (const n of ["Lat Pulldown", "Seated Cable Row", "Dumbbell Row", "Assisted Pull-Up", "Pull-Up", "Barbell Row"]) assert.ok(!names.includes(n), `${n} must not be offered`);
  assert.ok(names.includes("Chest-Supported Row"), names.join(", "));
  // The Reasoner (test double) picks among feasible candidates; its answer is validated deterministically.
  const out = parseRepairOutput(scriptedRepair(repairInput({ analysis: a, current: v2, run: r.run, method: M, knowledge: K })));
  assert.ok(out.ok);
  const checked = validateRepair({ output: out.ok ? out.output : (null as never), analysis: a, method: M, current: v2 });
  assert.equal(checked.verdict, "repair");
  // Stored as a recommendation, the decision is still open.
  const recorded = { ...v2, reasonerProvenance: { ...v2.reasonerProvenance!, repairRecommendations: [{ key: a.key!, verdict: "repair" as const, rationale: "x", recommendation: { ...checked.recommendation!, exerciseName: "x", days: checked.recommendation!.days }, alternatives: [], tradeoff: null, rejected: [], model: { provider: "t", modelId: "t", promptVersion: "p", inputTokens: 0, outputTokens: 0, latencyMs: 0 }, requestedBy: "coach", createdAtIso: NOW }] } };
  const m = review(r, v1, recorded);
  assert.ok(m.integrity?.recommendation && m.integrity.status === "unresolved" && m.approvalBlockedReason, "recommendation shown, not silently accepted");
  assert.deepEqual(JSON.stringify(recorded.weeks), JSON.stringify(v2.weeks), "the plan itself is unchanged");
});

await check("4. A candidate that violates the same constraint is rejected → no confident repair, approval stays blocked", async () => {
  const r = await verticalOnly();
  const v1 = content(r);
  const v2 = remove(v1, "Lat Pulldown");
  const a = analyzeProgramIntegrity({ original: v1, current: v2, run: r.run, knowledge: K });
  for (const bad of ["exercise.seated_cable_row", "exercise.pull_up", "exercise.barbell_row", "exercise.lat_pulldown"]) {
    const out = parseRepairOutput({ verdict: "repair", rationale: "Restores lats.", recommendation: { exercise: bad, days: ["Tuesday"], sets: 2, reps: [8, 12], rir: [2, 3], why: "Same function." } });
    assert.ok(out.ok);
    const v = validateRepair({ output: out.ok ? out.output : (null as never), analysis: a, method: M, current: v2 });
    assert.equal(v.verdict, "no_confident_repair", bad);
    assert.ok(v.rejected.some((e) => /isn't a feasible option/.test(e)), v.rejected.join("; "));
  }
  // Out-of-range prescriptions are rejected too, even for a feasible candidate.
  const cand = a.candidates[0];
  const tooHeavy = validateRepair({ output: { verdict: "repair", rationale: "x", recommendation: { exerciseId: cand.exerciseId, days: ["Tuesday"], sets: 9, reps: { min: 1, max: 3 }, rir: { min: 0, max: 0 }, why: "x" }, alternatives: [], tradeoff: null }, analysis: a, method: M, current: v2 });
  assert.equal(tooHeavy.verdict, "no_confident_repair");
  assert.ok(review(r, v1, v2).approvalBlockedReason);
  // Nothing feasible at all → the double says so.
  const none = parseRepairOutput(scriptedRepair({ ...repairInput({ analysis: a, current: v2, run: r.run, method: M, knowledge: K }), candidates: [] }));
  assert.ok(none.ok && none.output.verdict === "no_confident_repair");
});

await check("5. Coach accepts a replacement: plan updates in every week, is re-analysed; approval clears only when nothing blocking remains", async () => {
  // Horizontal pull: the replacement restores the whole function → clears.
  const r = await horizontalOnly();
  const v1 = content(r);
  const v2 = withResolutions(remove(v1, "Seated Cable Row"), [fitRemoved("exercise.seated_cable_row", "Seated Cable Row")]);
  const before = review(r, v1, v2);
  assert.ok(before.integrity?.status === "unresolved");
  const cand = before.integrity!.analysis.candidates.find((c) => c.exerciseName === "Chest-Supported Row")!;
  const rep = defaultReplacement({ analysis: before.integrity!.analysis, candidate: cand, run: r.run, method: M });
  assert.deepEqual(checkReplacement({ replacement: rep, candidates: before.integrity!.analysis.candidates, method: M, current: v2 }), []);
  const v3 = applyReplacement({ content: v2, replacement: rep, run: r.run, method: M, knowledge: K });
  validateUniversalTrainingProgramContent(v3);
  const added = v3.weeks.map((w) => w.days.filter((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items[0].name === "Chest-Supported Row"))).map((d) => d.dayOfWeek));
  assert.ok(added.every((days) => days.length === rep.days.length), "added on its days in every week");
  const after = review(r, v1, withResolutions(v3, [{ key: before.integrity!.key, exerciseId: cand.exerciseId, exerciseName: cand.exerciseName, resolution: "accepted_replacement", conditions: [], replacement: { exerciseId: cand.exerciseId, exerciseName: cand.exerciseName, days: rep.days, fromRecommendation: false }, resolvedBy: "coach", resolvedAtIso: NOW }]));
  assert.equal(after.integrity, null, JSON.stringify(after.integrity?.analysis.deficiencies));
  assert.equal(after.approvalBlockedReason, null);
  // Vertical pull: a row restores lats but not the vertical pattern → still blocked (truthfully).
  const rv = await verticalOnly();
  const w1 = content(rv);
  const w2 = remove(w1, "Lat Pulldown");
  const a = review(rv, w1, w2).integrity!.analysis;
  const row = a.candidates.find((c) => c.exerciseName === "Chest-Supported Row")!;
  const w3 = applyReplacement({ content: w2, replacement: defaultReplacement({ analysis: a, candidate: row, run: rv.run, method: M }), run: rv.run, method: M, knowledge: K });
  const still = review(rv, w1, w3);
  assert.ok(still.integrity?.status === "unresolved" && still.integrity.analysis.deficiencies.every((d) => /vertical pull/i.test(d.label)), "remaining hole stays a decision");
});

await check("6. Coach consciously accepts the reduced stimulus: recorded with the exact deficiency, which does not disappear", async () => {
  const r = await verticalOnly();
  const v1 = content(r);
  const v2 = remove(v1, "Lat Pulldown");
  const open = review(r, v1, v2).integrity!;
  const tradeoff: DecisionResolution = { key: open.key, exerciseId: "", exerciseName: "Lat Pulldown", resolution: "accepted_tradeoff", conditions: [], tradeoff: open.analysis.deficiencies.map((d) => ({ dimension: `${d.dimension.kind}:${d.dimension.id}`, label: d.label, before: d.before, after: d.after, minAfter: d.minAfter })), resolvedBy: "coach", resolvedAtIso: NOW };
  const m = review(r, v1, withResolutions(withResolutions(v2, [fitRemoved("exercise.lat_pulldown", "Lat Pulldown")]), [tradeoff]));
  assert.equal(m.integrity?.status, "accepted_tradeoff");
  assert.ok(m.integrity!.analysis.deficiencies.length > 0, "the deficiency is still reported");
  // Gate 4.0C-5: accepting the edit's tradeoff doesn't accept the program's current-state adequacy — that's its own explicit decision.
  assert.ok(m.adequacy?.status === "unresolved" && /fix them, or accept them explicitly/.test(m.approvalBlockedReason ?? ""), m.approvalBlockedReason ?? "");
  const both = review(r, v1, withResolutions(withResolutions(withResolutions(v2, [fitRemoved("exercise.lat_pulldown", "Lat Pulldown")]), [tradeoff]), [{ key: m.adequacy!.key, exerciseId: "", exerciseName: "", resolution: "accepted_limitation", adequacySignature: m.adequacy!.signature, conditions: [], resolvedBy: "coach", resolvedAtIso: NOW }]));
  assert.equal(both.approvalBlockedReason, null);
  assert.ok(m.history.some((h) => h.resolution === "accepted_tradeoff" && (h.tradeoff ?? []).length > 0), "provenance of the conscious tradeoff");
});

await check("7. Stale resolutions are invalidated: a worse plan reopens the tradeoff; re-adding the uncertain exercise reopens its fit decision", async () => {
  const r = await verticalOnly();
  const v1 = content(r);
  const v2 = remove(v1, "Lat Pulldown");
  const open = review(r, v1, v2).integrity!;
  const tradeoff: DecisionResolution = { key: open.key, exerciseId: "", exerciseName: "Lat Pulldown", resolution: "accepted_tradeoff", conditions: [], tradeoff: open.analysis.deficiencies.map((d) => ({ dimension: `${d.dimension.kind}:${d.dimension.id}`, label: d.label, before: d.before, after: d.after, minAfter: d.minAfter })), resolvedBy: "coach", resolvedAtIso: NOW };
  const accepted = withResolutions(withResolutions(v2, [fitRemoved("exercise.lat_pulldown", "Lat Pulldown")]), [tradeoff]);
  const worse = remove(accepted, "Face Pull");
  assert.equal(review(r, v1, worse).integrity?.status, "unresolved", "more lost → decide again");
  const readded = { ...v1, reasonerProvenance: accepted.reasonerProvenance };
  const m = review(r, v1, readded);
  assert.equal(m.decisions[0].status, "unresolved", "removed then re-added → fit decision again");
  assert.equal(m.integrity, null, "the hole is gone, so the stale tradeoff no longer matters");
});

await check("8. Informational items never block when the edit left no real program consequence", async () => {
  const r = await covered();
  const v1 = content(r);
  const v2 = withResolutions(remove(v1, "Seated Cable Row"), [fitRemoved("exercise.seated_cable_row", "Seated Cable Row")]);
  const noisy = { ...v2, reasonerProvenance: { ...v2.reasonerProvenance!, needsYou: ["Tension with your method: main sets capped.", "The goal \"Bench\" still stands, but direct work is blocked."] } };
  const m = review(r, v1, noisy);
  assert.equal(m.approvalBlockedReason, null);
  assert.deepEqual(m.needsYou.map((n) => n.kind), ["method_tension", "acknowledgement"]);
  // A coach edit that keeps the intent (renaming a session) is not a consequence either.
  const renamed = structuredClone(v1);
  renamed.weeks.forEach((w) => w.days.forEach((d) => d.sessions?.forEach((s) => (s.name = `${s.name} (renamed)`))));
  assert.equal(review(r, v1, renamed).integrity, null);
});

await check("9. After a repair, the client-facing program carries no internal reasoning or review language", async () => {
  const r = await horizontalOnly();
  const v1 = content(r);
  const v2 = remove(v1, "Seated Cable Row");
  const a = analyzeProgramIntegrity({ original: v1, current: v2, run: r.run, knowledge: K });
  const v3 = applyReplacement({ content: v2, replacement: defaultReplacement({ analysis: a, candidate: a.candidates.find((c) => c.exerciseName === "Chest-Supported Row")!, run: r.run, method: M }), run: r.run, method: M, knowledge: K });
  const client = clientFacingProgramContent({ content: v3, reviewedVersionId: "v3", knowledge: K, supportedSetup: supportedSetupNames(r.run), nowIso: NOW });
  assert.deepEqual(findClientCopyLeaks(client), []);
  assert.ok(!/reasoner|coach review|uncertain|constraint|provenance|tradeoff|deficien|underrepresented|repair recommendation/i.test(JSON.stringify({ ...client, clientFacingFrom: undefined, generationInputs: undefined })));
});

await check("10. Multi-week edits are analysed across the whole program (per build week), not just one visible week", async () => {
  const r = await verticalOnly();
  const v1 = content(r);
  // Remove Lat Pulldown only in weeks 5–7 (as per-session edits would).
  const partial = structuredClone(v1);
  for (const w of partial.weeks) if (w.weekNumber >= 5 && w.weekNumber <= 7) for (const d of w.days) for (const s of d.sessions ?? []) s.blocks = s.blocks.filter((b) => b.items[0].name !== "Lat Pulldown");
  const a = analyzeProgramIntegrity({ original: v1, current: partial, run: r.run, knowledge: K });
  const vp = a.deficiencies.find((d) => /vertical pull/i.test(d.label))!;
  assert.deepEqual(vp.weeks, [5, 6, 7], "exactly the affected build weeks");
  // Global removal: every build week (deload weeks are intentionally lighter and excluded).
  const all = analyzeProgramIntegrity({ original: v1, current: remove(v1, "Lat Pulldown"), run: r.run, knowledge: K });
  const deloads = (r.run.result.spec?.resistance?.value.weeks ?? []).filter((w) => w.kind === "deload").map((w) => w.week);
  assert.deepEqual(all.deficiencies.find((d) => /vertical pull/i.test(d.label))!.weeks, v1.weeks.map((w) => w.weekNumber).filter((n) => !deloads.includes(n)));
  assert.ok(feasibleCandidates({ run: r.run, knowledge: K, deficiencies: all.deficiencies, current: remove(v1, "Lat Pulldown") }).length > 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
