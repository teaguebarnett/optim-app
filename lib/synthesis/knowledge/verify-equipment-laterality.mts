// Equipment specificity + laterality (limb-specific restrictions) — offline, scripted model, no database.

import assert from "node:assert/strict";
import { FOUNDATION_KNOWLEDGE as K, FOUNDATION_KNOWLEDGE_VERSION } from "./registry.ts";
import { SPECIALTY_MACHINES, STANDARD_MACHINES } from "./taxonomy.ts";
import { demandCompatibility, exerciseEligibility } from "../exercise-eligibility.ts";
import { buildPool, methodFor } from "../planners/resistance/planner.ts";
import { resolveEquipmentAccess } from "../planners/resistance/equipment-access.ts";
import { runFitnessReasoner, type ReasonerResult } from "../reasoner/reasoner.ts";
import { assessPlanningState } from "../reasoner/lifecycle.ts";
import { reasonerResultToProgramContent } from "../reasoner/to-program.ts";
import { clientFacingProgramContent, findClientCopyLeaks, sideOnlyNames, supportedSetupNames } from "../reasoner/review-gate.ts";
import { fakeModel, NOW, restrict, scenarioInput, scriptedOutput, type WirePlan } from "../reasoner/eval/fixtures.ts";
import { resolveRestrictionOption, subsumes } from "../limitations/vocabulary.ts";
import { buildConfirmation } from "../limitations/confirm.ts";
import type { ConstraintTag } from "../constraints.ts";
import type { GenerationInputs } from "../../training/types.ts";

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
console.log("\nEquipment specificity + laterality\n");

type Env = "commercial_gym" | "private_gym" | "home_gym";
const env = (e: Env) => ({ your_week: { availableDays: ["mon", "tue", "wed", "thu"], maxSessionLength: "75", trainingEnvironment: [e] } });
const input = (tags: ConstraintTag[] = [], e: Env = "commercial_gym", equipment?: Record<string, "available" | "unavailable">) => scenarioInput({ restrictions: tags.length ? restrict(tags) : undefined, patch: env(e), ...(equipment ? { equipment } : {}) });
const pool = (tags: ConstraintTag[] = [], e: Env = "commercial_gym", equipment?: Record<string, "available" | "unavailable">) => {
  const i = input(tags, e, equipment);
  const m = methodFor(i)!;
  assert.ok(m.ok);
  return buildPool(i, (m as { method: Parameters<typeof buildPool>[1] }).method)!;
};
const ids = (p: ReturnType<typeof pool>) => p.pool.map((e) => e.id);
const elig = (id: string, tags: ConstraintTag[]) => exerciseEligibility(K.getExercise(id)!, input(tags).constraints);
const fit = (id: string, tags: ConstraintTag[]) => demandCompatibility(elig(id, tags));
const machineOf = (id: string) => K.getExercise(id)!.apparatus.find((a) => a.endsWith("_machine") || a === "smith_machine" || a === "plate_loaded_pulldown");

// ---------------------------------------------------------------------------
// Equipment specificity
// ---------------------------------------------------------------------------
await check("1. Every machine exercise names its specific machine; generic 'machine access' unlocks none of them by itself", () => {
  for (const e of K.exercises().filter((x) => x.equipment === "machine")) assert.ok(machineOf(e.id), `${e.id} names a machine`);
  const priv = pool([], "private_gym");
  assert.ok(!priv.pool.some((e) => e.equipment === "machine"), "private gym: no machine assumed");
  assert.ok(priv.unknownApparatus.has("high_row_machine") && priv.unknownApparatus.has("leg_press_machine"), "reported as unknown, not available");
  const com = pool([], "commercial_gym");
  assert.ok(com.pool.some((e) => e.id === "exercise.leg_press") && com.pool.some((e) => e.id === "exercise.chest_supported_row"), "commercial gym: standard machines assumed");
  for (const m of SPECIALTY_MACHINES) assert.ok(!com.pool.some((e) => e.apparatus.includes(m)), `${m} never assumed`);
  const access = resolveEquipmentAccess(input([], "commercial_gym").client)!;
  for (const m of STANDARD_MACHINES) assert.equal(access.apparatusBasis[m], "baseline", m);
  assert.ok(access.baselineAssumptions.some((b) => b.apparatus === "leg_press_machine"), "the assumption is recorded");
});

await check("2. Generic equipment still works at its level (dumbbells, barbells, cables, bands, bench)", () => {
  const priv = ids(pool([], "private_gym"));
  for (const id of ["exercise.dumbbell_row", "exercise.barbell_bench_press", "exercise.seated_cable_row", "exercise.band_seated_row", "exercise.incline_dumbbell_row"]) assert.ok(priv.includes(id), id);
});

await check("3. Specific KNOWN availability unlocks exactly that machine; a confirmed absence overrides a baseline", () => {
  const before = ids(pool([], "private_gym"));
  const after = ids(pool([], "private_gym", { high_row_machine: "available", leg_press_machine: "available" }));
  assert.deepEqual(after.filter((x) => !before.includes(x)).sort(), ["exercise.leg_press", "exercise.machine_high_row"]);
  const com = ids(pool([], "commercial_gym", { chest_supported_row_machine: "unavailable" }));
  assert.ok(!com.includes("exercise.chest_supported_row"), "coach said the gym doesn't have it");
  const access = resolveEquipmentAccess(input([], "private_gym", { high_row_machine: "available" }).client)!;
  assert.equal(access.apparatusBasis.high_row_machine, "coach_confirmed");
});

await check("4. Lifecycle: unknown equipment never supersedes a draft; a confirmed absence of a planned machine does; a confirmed machine is 'a better plan may be possible'", async () => {
  const base = input([], "commercial_gym");
  const res = await runFitnessReasoner({ input: base, model: fakeModel((ri) => scriptedOutput(ri, (p: WirePlan) => (p.sessions[0].exercises[0] = { id: "exercise.leg_press", role: "accessory", sets: 2, reps: [8, 12], rir: [2, 3] }))), nowIso: NOW, runId: "eq" });
  assert.equal(res.status, "PLANNED", res.status === "REJECTED" ? res.errors.join("; ") : res.status);
  const r = res as Extract<ReasonerResult, { status: "PLANNED" }>;
  const gi: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
  const content = reasonerResultToProgramContent({ result: r, knowledge: K, programId: "p", workspaceId: "ws", clientProfileId: "client-eval", coachId: "c", title: "t", jobId: "j", generationInputs: gi, nowIso: NOW });
  const assess = (equipment?: Record<string, "available" | "unavailable">, e: Env = "commercial_gym") => {
    const i = input([], e, equipment);
    return assessPlanningState({ run: r.run, content, current: { client: i.client, goal: i.goal, constraints: i.constraints, coachMethodVersionId: i.coach!.versionId, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION }, knowledge: K, openConsequence: false });
  };
  assert.equal(assess().status, "current");
  assert.equal(assess({ leg_press_machine: "unavailable" }).status, "superseded");
  assert.ok(assess({ leg_press_machine: "unavailable" }).reasons.some((x) => /Leg Press/.test(x)));
  const better = assess({ high_row_machine: "available" });
  assert.equal(better.status, "loosened");
  assert.ok(better.newlyAvailable.includes("Chest-Supported Machine High Row"));
});

// ---------------------------------------------------------------------------
// Laterality (limb-specific restrictions)
// ---------------------------------------------------------------------------
const RIGHT_ARM_PULLING: ConstraintTag = resolveRestrictionOption("avoid_right_arm_pulling", K)!.tags[0];
const RIGHT_KNEE: ConstraintTag = resolveRestrictionOption("avoid_right_knee_loading", K)!.tags[0];
const BOTH_SHOULDERS: ConstraintTag = { kind: "avoid_limb_loading", region: "shoulder", side: "both" };

await check("5. Vocabulary: lateralized limb restrictions exist for both sides, are structured, and fold correctly", () => {
  for (const id of ["avoid_right_arm_loading", "avoid_left_arm_loading", "avoid_right_arm_pulling", "avoid_left_arm_pressing", "avoid_right_shoulder_loading", "avoid_left_elbow_loading", "avoid_right_knee_loading", "avoid_left_leg_loading"]) {
    const o = resolveRestrictionOption(id, K);
    assert.ok(o && o.group === "limbs" && o.tags[0].kind === "avoid_limb_loading", id);
  }
  const t = (id: string) => resolveRestrictionOption(id, K)!.tags;
  assert.ok(subsumes(t("avoid_right_arm_loading"), t("avoid_right_arm_pulling")), "whole arm covers pulling");
  assert.ok(subsumes(t("avoid_right_arm_loading"), t("avoid_right_elbow_loading")), "arm covers elbow");
  assert.ok(!subsumes(t("avoid_right_arm_loading"), t("avoid_left_arm_pulling")), "never the other side");
  assert.ok(!subsumes(t("avoid_right_arm_pulling"), t("avoid_right_arm_loading")));
  const r = buildConfirmation({ sourceText: "x", proposal: null, selectedOptionIds: ["avoid_right_arm_loading", "avoid_right_arm_pulling", "avoid_left_knee_loading"], clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "c", nowIso: NOW }, K);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.record.restrictions.map((x) => x.optionId).sort(), ["avoid_left_knee_loading", "avoid_right_arm_loading"], "the weaker same-side fact folds; the other limb stays");
});

await check("6. Tristan-style: right-arm pulling restricted → LEFT-arm unilateral pulls stay (side-limited), bilateral pulls go, the limb holding a load is uncertain", () => {
  const tags = [RIGHT_ARM_PULLING];
  for (const id of ["exercise.dumbbell_row", "exercise.single_arm_cable_pulldown", "exercise.single_arm_seated_cable_row"]) {
    const e = elig(id, tags);
    assert.equal(demandCompatibility(e), "conditional", id);
    assert.equal(e.sideOnly?.side, "left", id);
  }
  for (const id of ["exercise.seated_cable_row", "exercise.lat_pulldown", "exercise.chest_supported_row", "exercise.barbell_row", "exercise.pull_up", "exercise.barbell_curl", "exercise.machine_high_row"]) assert.equal(fit(id, tags), "incompatible", id);
  for (const id of ["exercise.conventional_deadlift", "exercise.farmer_s_carry"]) assert.equal(fit(id, tags), "uncertain", `${id}: the right arm holds the load`);
  assert.equal(elig("exercise.kettlebell_suitcase_carry", tags).sideOnly?.side, "left", "one-hand carry with the left hand");
  for (const id of ["exercise.barbell_bench_press", "exercise.leg_press", "exercise.leg_extension", "exercise.lateral_raise"]) assert.equal(fit(id, tags), "compatible", `${id}: not pulling with the right arm`);
});

await check("7. Tristan-style through the Reasoner: S rows, the side is named, the client copy says 'Left side only.'", async () => {
  const i = input([RIGHT_ARM_PULLING]);
  const m = fakeModel((ri) => scriptedOutput(ri, (p: WirePlan) => (p.sessions[0].exercises[2] = { id: "exercise.dumbbell_row", role: "accessory", sets: 3, reps: [8, 12], rir: [2, 3], note: "Left arm only." })));
  const r = await runFitnessReasoner({ input: i, model: m, nowIso: NOW, runId: "lat" });
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  const rows = m.lastInput!.exercises;
  assert.equal(rows.find((x) => x.startsWith("exercise.dumbbell_row|"))!.split("|").at(-1), "S");
  assert.ok(m.lastInput!.constraints.some((c) => c.rules.some((x) => /right arm: no elbow flexion/.test(x) && /left side only/.test(x))));
  assert.ok(!rows.some((x) => x.startsWith("exercise.seated_cable_row|")), "bilateral pull not offered");
  // The side must be stated.
  const unnamed = await runFitnessReasoner({ input: i, model: fakeModel((ri) => scriptedOutput(ri, (p: WirePlan) => (p.sessions[0].exercises[2] = { id: "exercise.dumbbell_row", role: "accessory", sets: 3, reps: [8, 12], rir: [2, 3], note: "One arm." }))), nowIso: NOW, runId: "lat2", maxAttempts: 1 });
  assert.ok(unnamed.status === "REJECTED" && unnamed.errors.some((e) => /side-limited \(S\): perform it with the left side only/.test(e)));
  const p = r as Extract<ReasonerResult, { status: "PLANNED" }>;
  const gi: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
  const content = reasonerResultToProgramContent({ result: p, knowledge: K, programId: "p", workspaceId: "ws", clientProfileId: "client-eval", coachId: "c", title: "t", jobId: "j", generationInputs: gi, nowIso: NOW });
  const client = clientFacingProgramContent({ content, reviewedVersionId: "v", knowledge: K, supportedSetup: supportedSetupNames(p.run, K), sideOnly: sideOnlyNames(p.run, K), nowIso: NOW });
  const row = client.weeks[0].days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items))).find((x) => x.name === "Dumbbell Row");
  assert.ok(row && /^Left side only\./.test(row.coachCue ?? ""), row?.coachCue);
  assert.deepEqual(findClientCopyLeaks(client), []);
});

await check("8. Right knee: bilateral knee work goes; split stances (both legs) go; single-stance unilateral work stays for the LEFT leg", () => {
  const tags = [RIGHT_KNEE];
  for (const id of ["exercise.leg_extension", "exercise.leg_press", "exercise.barbell_back_squat"]) assert.equal(fit(id, tags), "incompatible", id);
  assert.equal(fit("exercise.bulgarian_split_squat", tags), "incompatible", "split stance loads both knees");
  assert.equal(elig("exercise.dumbbell_step_up", tags).sideOnly?.side, "left");
  for (const id of ["exercise.barbell_bench_press", "exercise.lat_pulldown", "exercise.single_leg_calf_raise"]) assert.equal(fit(id, tags), "compatible", `${id}: no right-knee action`);
});

await check("9. Both shoulders: no side alternative — unilateral shoulder work goes too", () => {
  for (const id of ["exercise.cable_lateral_raise", "exercise.lateral_raise", "exercise.overhead_press", "exercise.dumbbell_row"]) assert.equal(fit(id, [BOTH_SHOULDERS]), "incompatible", id);
  assert.equal(fit("exercise.leg_extension", [BOTH_SHOULDERS]), "compatible");
});

await check("10. No restriction = no filtering, no side limits, no load conditions", () => {
  const p = pool([]);
  assert.equal(p.sideOnly.size, 0);
  assert.equal(p.loadConditions.size, 0);
  for (const e of p.pool) assert.equal(fit(e.id, []), "compatible", e.id);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
