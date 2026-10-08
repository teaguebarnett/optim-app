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
import { clientFacingProgramContent, findClientCopyLeaks, reasonerReviewModel, sideOnlyNames, supportedSetupNames } from "../reasoner/review-gate.ts";
import { REASONER_SYSTEM_PROMPT } from "../reasoner/contract.ts";
import { applyApparatusAnswers, equipmentAnswerView, sanitizeApparatus } from "../equipment-answers.ts";
import { readFileSync } from "node:fs";
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
const col7 = (rows: string[], id: string) => rows.find((r) => r.startsWith(`${id}|`))?.split("|")[7];
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

await check("4. Lifecycle: unknown equipment never supersedes a draft; a confirmed absence of a planned machine does; confirming a machine the ideal solve already considered changes nothing", async () => {
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
  // The high row's machine was unknown at solve time: the ideal plan already considered it, so confirming it adds nothing.
  assert.ok(r.run.input!.exercises.some((x) => x.startsWith("exercise.machine_high_row|") && x.includes("high_row_machine?")));
  assert.equal(assess({ high_row_machine: "available" }).status, "unaffected");
  // A solve made before unknown apparatus was planned around: the same confirmation makes a better plan possible.
  const legacy = structuredClone(r.run);
  legacy.input!.exercises = legacy.input!.exercises.filter((x) => !x.includes("?"));
  const i2 = input([], "commercial_gym", { high_row_machine: "available" });
  const better = assessPlanningState({ run: legacy, content, current: { client: i2.client, goal: i2.goal, constraints: i2.constraints, coachMethodVersionId: i2.coach!.versionId, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION }, knowledge: K, openConsequence: false });
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

// ---------------------------------------------------------------------------
// Ideal plan → equipment resolution → execution exercise
// ---------------------------------------------------------------------------
const GI: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
const SQUAT_SINGLE_LEG: ConstraintTag[] = [{ kind: "avoid_movement_pattern", pattern: "squat" }, { kind: "avoid_movement_pattern", pattern: "single_leg" }];
/** Plans with the scripted model, putting `id` first in session 1 (the model's ideal choice). */
async function planWith(id: string, i: ReturnType<typeof input>, maxAttempts = 2) {
  const m = fakeModel((ri) => scriptedOutput(ri, (p: WirePlan) => (p.sessions[0].exercises[0] = { id, role: "accessory", sets: 3, reps: [8, 12], rir: [2, 3] })));
  const r = await runFitnessReasoner({ input: i, model: m, nowIso: NOW, runId: `eq-${id}`, maxAttempts });
  return { r, m };
}
const plannedIds = (r: ReasonerResult) => (r.status === "PLANNED" ? r.plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)) : []);
const review = (r: ReasonerResult, i: ReturnType<typeof input>) => {
  const p = r as Extract<ReasonerResult, { status: "PLANNED" }>;
  const content = reasonerResultToProgramContent({ result: p, knowledge: K, programId: "p", workspaceId: "ws", clientProfileId: "client-eval", coachId: "c", title: "t", jobId: "j", generationInputs: GI, nowIso: NOW });
  return reasonerReviewModel({ content, run: p.run, knowledge: K, current: { client: i.client, goal: i.goal, constraints: i.constraints, coachMethodVersionId: i.coach!.versionId, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION } });
};

await check("11. A — Unknown equipment doesn't remove an otherwise-valid exercise from ideal planning, and stays unknown", async () => {
  const i = input([], "private_gym"); // private gym: no machine is assumed
  assert.equal(resolveEquipmentAccess(i.client)!.apparatus.chest_supported_row_machine, "unknown");
  const m = methodFor(i)! as { method: Parameters<typeof buildPool>[1] };
  assert.ok(!buildPool(i, m.method)!.pool.some((e) => e.id === "exercise.chest_supported_row"), "deterministic planner: known-only, unchanged");
  assert.ok(buildPool(i, m.method, { apparatus: "ideal" })!.pool.some((e) => e.id === "exercise.chest_supported_row"), "ideal pool keeps it");
  const { r, m: model } = await planWith("exercise.chest_supported_row", i);
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  assert.ok(plannedIds(r).includes("exercise.chest_supported_row"), "planned as the model chose it");
  assert.equal(col7(model.lastInput!.exercises, "exercise.chest_supported_row"), "machine+chest_supported_row_machine?", "marked not confirmed, never as available");
  assert.ok(!model.lastInput!.equipment.apparatus.includes("chest_supported_row_machine") && model.lastInput!.equipment.apparatusUnknown.includes("chest_supported_row_machine"));
  assert.equal((r as Extract<ReasonerResult, { status: "PLANNED" }>).run.result.equipment, undefined, "nothing to resolve");
  const item = review(r, i).equipment.items.find((x) => x.apparatus === "chest_supported_row_machine")!;
  assert.deepEqual([item.state, item.basis, item.exercises], ["unknown", "unknown", ["Chest-Supported Row"]], "the review shows it as an unconfirmed dependency");
  assert.match(REASONER_SYSTEM_PROMPT, /Never describe "\?" apparatus as confirmed/);
});

await check("12. B — Confirmed available equipment is planned and executed normally", async () => {
  const i = input([], "private_gym", { chest_supported_row_machine: "available" });
  const { r, m } = await planWith("exercise.chest_supported_row", i);
  assert.equal(r.status, "PLANNED");
  assert.ok(plannedIds(r).includes("exercise.chest_supported_row"));
  assert.equal(col7(m.lastInput!.exercises, "exercise.chest_supported_row"), "machine+chest_supported_row_machine");
  const item = review(r, i).equipment.items.find((x) => x.apparatus === "chest_supported_row_machine")!;
  assert.deepEqual([item.state, item.basis], ["available", "coach_confirmed"]);
  assert.equal(review(r, i).equipment.substitutions.length, 0);
});

await check("13. C — Confirmed unavailable can't stay the execution exercise: the strongest valid equivalent replaces it, intent preserved", async () => {
  const i = input([], "private_gym", { chest_supported_row_machine: "unavailable" });
  const { r, m } = await planWith("exercise.chest_supported_row", i);
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  assert.equal(m.calls, 1, "resolved deterministically — no repair call");
  assert.equal(col7(m.lastInput!.exercises, "exercise.chest_supported_row"), "machine+chest_supported_row_machine!", "the ideal stage still saw it, marked absent");
  const p = r as Extract<ReasonerResult, { status: "PLANNED" }>;
  assert.ok(!plannedIds(r).includes("exercise.chest_supported_row"), "never the execution exercise");
  const res = p.run.result.equipment!;
  assert.equal(res.length, 1);
  assert.equal(res[0].status, "substituted");
  const o = K.getExercise("exercise.chest_supported_row")!;
  const sub = K.getExercise(res[0].substituteId!)!;
  assert.equal(sub.id, "exercise.incline_dumbbell_row", "same pattern, same muscles, chest-supported");
  assert.equal(sub.patterns[0], o.patterns[0]);
  assert.ok(o.primaryMuscles.every((x) => sub.primaryMuscles.includes(x)) && sub.trunkSupport === o.trunkSupport);
  assert.equal(p.plan.sessions[0].exercises[0].exerciseId, sub.id, "in the same slot");
  assert.deepEqual([p.plan.sessions[0].exercises[0].sets, p.plan.sessions[0].exercises[0].reps], [3, { min: 8, max: 12 }], "prescription kept");
  assert.match(p.plan.sessions[0].exercises[0].note ?? "", /Replaces Chest-Supported Row \(no chest-supported row machine\)/i);
  const rv = review(r, i);
  assert.deepEqual(rv.equipment.substitutions.map((x) => [x.from, x.to]), [["Chest-Supported Row", "Incline Chest-Supported Dumbbell Row"]]);
  assert.equal(rv.approvalBlockedReason?.includes("equipment") ?? false, false, "a good substitution doesn't block approval");
  // Deterministic: the same state resolves the same way.
  const again = await planWith("exercise.chest_supported_row", i);
  assert.deepEqual(plannedIds(again.r), plannedIds(r));
});

await check("14. D — No adequate equivalent: the work leaves the execution plan and becomes an explicit, blocking coach decision", async () => {
  const i = input(SQUAT_SINGLE_LEG, "commercial_gym", { leg_extension_machine: "unavailable" });
  const { r } = await planWith("exercise.leg_extension", i);
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  const p = r as Extract<ReasonerResult, { status: "PLANNED" }>;
  assert.ok(!plannedIds(r).includes("exercise.leg_extension"));
  assert.deepEqual(p.run.result.equipment!.map((x) => [x.exerciseId, x.status, x.serves]), [["exercise.leg_extension", "unresolved", "knee extension — quadriceps"]]);
  const rv = review(r, i);
  assert.deepEqual(rv.equipment.unresolved.map((x) => x.exercise), ["Leg Extension"], "never silent");
  const f = rv.adequacy!.limitations.find((x) => x.code === "equipment_unresolved")!;
  assert.ok(f && /Leg Extension .*quadriceps.*no eligible exercise preserves that work/.test(f.message), f?.message);
  assert.equal(rv.adequacy!.status, "unresolved");
  assert.ok(rv.approvalBlockedReason && /restrictions and equipment/.test(rv.approvalBlockedReason), "blocks approval until the coach decides");
  // Confirming the equipment after all lifts the block (and the draft becomes improvable).
  const i2 = input(SQUAT_SINGLE_LEG, "commercial_gym", { leg_extension_machine: "available" });
  const content = reasonerResultToProgramContent({ result: p, knowledge: K, programId: "p", workspaceId: "ws", clientProfileId: "client-eval", coachId: "c", title: "t", jobId: "j", generationInputs: GI, nowIso: NOW });
  const after = reasonerReviewModel({ content, run: p.run, knowledge: K, current: { client: i2.client, goal: i2.goal, constraints: i2.constraints, coachMethodVersionId: i2.coach!.versionId, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION } });
  assert.equal(after.equipment.unresolved.length, 0);
  assert.equal(after.lifecycle?.status, "loosened");
});

await check("15. E — Hard client restrictions override every equipment state", async () => {
  // Confirmed available, but the restriction excludes it: never offered, and the model can't plan it.
  const i = input(SQUAT_SINGLE_LEG, "commercial_gym", { leg_press_machine: "available" });
  const { r, m } = await planWith("exercise.leg_press", i, 1);
  assert.ok(!m.lastInput!.exercises.some((x) => x.startsWith("exercise.leg_press|")));
  assert.ok(r.status === "REJECTED" && r.errors.some((e) => /exercise\.leg_press wasn't among the eligible candidates/.test(e)));
  // Substitutes come only from the constraint-eligible pool.
  const { r: c } = await planWith("exercise.leg_extension", input(SQUAT_SINGLE_LEG, "commercial_gym", { leg_extension_machine: "unavailable" }));
  for (const id of plannedIds(c)) assert.ok(exerciseEligibility(K.getExercise(id)!, i.constraints).eligible, id);
  // Unknown equipment doesn't override a restriction either.
  const u = input(SQUAT_SINGLE_LEG, "private_gym");
  const um = methodFor(u)! as { method: Parameters<typeof buildPool>[1] };
  assert.ok(!buildPool(u, um.method, { apparatus: "ideal" })!.pool.some((e) => e.patterns.some((x) => x === "squat" || x === "single_leg")));
});

await check("16. F — Equipment answers round-trip: stored, read back, drive planning; Unknown removes the answer", () => {
  let stored = applyApparatusAnswers({}, { chest_supported_row_machine: "available", leg_press_machine: "unavailable" })!;
  assert.deepEqual(sanitizeApparatus(JSON.parse(JSON.stringify(stored))), stored, "jsonb round trip");
  let access = resolveEquipmentAccess(input([], "private_gym", stored).client)!;
  assert.deepEqual([access.apparatus.chest_supported_row_machine, access.apparatusBasis.chest_supported_row_machine, access.apparatus.leg_press_machine], ["available", "coach_confirmed", "unavailable"]);
  stored = applyApparatusAnswers(stored, { chest_supported_row_machine: "unknown" })!;
  assert.deepEqual(stored, { leg_press_machine: "unavailable" }, "Unknown deletes the answer — never stored as a value");
  access = resolveEquipmentAccess(input([], "private_gym", stored).client)!;
  assert.deepEqual([access.apparatus.chest_supported_row_machine, access.apparatusBasis.chest_supported_row_machine], ["unknown", "unknown"]);
  assert.equal(applyApparatusAnswers(stored, { not_a_machine: "available" } as never), null, "unknown equipment ids are refused");
  assert.deepEqual(sanitizeApparatus({ leg_press_machine: "maybe", bogus: "available", smith_machine: "available" }), { smith_machine: "available" });
  // The commercial-gym baseline is overridden by an answer, and restored by Unknown.
  const com = (eq: Record<string, "available" | "unavailable">) => resolveEquipmentAccess(input([], "commercial_gym", eq).client)!;
  assert.deepEqual([com({ leg_press_machine: "unavailable" }).apparatus.leg_press_machine, com({}).apparatusBasis.leg_press_machine], ["unavailable", "baseline"]);
});

await check("17. G — The answer control shows the click immediately (saving), then saved; failures revert with a reason", () => {
  const pressed = (v: ReturnType<typeof equipmentAnswerView>) => v.options.filter((o) => o.pressed).map((o) => o.value);
  const idle = equipmentAnswerView({ shown: "unknown", saving: false, justSaved: false, error: null });
  assert.deepEqual([pressed(idle), idle.status, idle.tone], [["unknown"], "Not confirmed", "warning"]);
  const clicked = equipmentAnswerView({ shown: "available", saving: true, justSaved: false, error: null });
  assert.deepEqual([pressed(clicked), clicked.status], [["available"], "Saving…"], "the chosen answer is selected at once");
  assert.ok(clicked.options.find((o) => o.value === "available")!.loading && !clicked.options.find((o) => o.value === "unknown")!.loading);
  const saved = equipmentAnswerView({ shown: "available", saving: false, justSaved: true, error: null });
  assert.deepEqual([saved.status, saved.tone], ["Saved", "success"]);
  assert.equal(equipmentAnswerView({ shown: "available", saving: false, justSaved: false, error: null }).status, "Confirmed: they have it");
  assert.equal(equipmentAnswerView({ shown: "unknown", saving: false, justSaved: false, error: "Nothing was saved." }).status, "Nothing was saved.");
  assert.deepEqual(equipmentAnswerView({ shown: "unavailable", saving: false, justSaved: false, error: null }).options.map((o) => o.label), ["Have it", "Don't have it", "Unknown"]);
  // The component wires this to React's optimistic state inside a transition, with an accessible pressed state.
  const src = readFileSync(new URL("../../../components/coach/equipment-answer.tsx", import.meta.url), "utf8");
  assert.ok(/useOptimistic\(saved\)/.test(src) && /setShown\(next\)/.test(src) && /aria-pressed=\{o\.pressed\}/.test(src) && /role="status"/.test(src) && /variant=\{o\.pressed \? "primary" : "secondary"\}/.test(src));
  const reviewSrc = readFileSync(new URL("../../../components/coach/program-proposal-review.tsx", import.meta.url), "utf8");
  assert.ok(!/Not used — equipment not confirmed/.test(reviewSrc) && /Equipment this plan uses/.test(reviewSrc), "review language: unknown no longer reads as 'can't plan'");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
