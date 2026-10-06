// Fitness Knowledge V2 — richer exercise metadata + coverage, verified offline (no provider, no database).
// The Teague dogfood restrictions are ONE regression fixture; nothing in knowledge or eligibility is client-specific.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOUNDATION_KNOWLEDGE as K, FOUNDATION_KNOWLEDGE_VERSION, validateKnowledge } from "./registry.ts";
import { ALL_SOURCES } from "./sources.ts";
import { KNOWLEDGE_EXERCISE_IDS } from "./history.ts";
import type { ExerciseEntry } from "./types.ts";
import { demandCompatibility, exerciseEligibility } from "../exercise-eligibility.ts";
import { buildPool, methodFor } from "../planners/resistance/planner.ts";
import { functionAvailability } from "../reasoner/adequacy.ts";
import { runFitnessReasoner } from "../reasoner/reasoner.ts";
import { assessPlanningState, decideRevision } from "../reasoner/lifecycle.ts";
import { fakeModel, NOW, restrict, scenarioInput, scriptedOutput } from "../reasoner/eval/fixtures.ts";
import type { ConstraintTag } from "../constraints.ts";
import type { ReasonerRun } from "../reasoner/run.ts";
import { reasonerResultToProgramContent } from "../reasoner/to-program.ts";
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
console.log("\nFitness Knowledge V2\n");

const pattern = (p: string): ConstraintTag => ({ kind: "avoid_movement_pattern", pattern: p as never });
const BRACING: ConstraintTag = { kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" };
const TEAGUE_TAGS: ConstraintTag[] = [BRACING, ...["squat", "hinge", "single_leg", "hip_thrust", "trunk_flexion", "trunk_rotation", "anti_extension", "anti_rotation", "anti_lateral_flexion"].map(pattern), { kind: "avoid_exercise", exerciseId: "exercise.lat_pulldown" }];
const SIX_DAYS = { your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"] }, starting_point: { trainingExperience: "experienced_consistent", weeklyFrequency: 6, recentConsistency: "very_consistent" }, what_you_want: { primaryGoal: "build_muscle", secondaryGoals: ["get_stronger"] } };
const inputFor = (tags: ConstraintTag[], patch: Record<string, Record<string, unknown>> = {}) => scenarioInput({ restrictions: restrict(tags), patch: { ...SIX_DAYS, ...patch } });
const poolFor = (tags: ConstraintTag[], patch: Record<string, Record<string, unknown>> = {}) => {
  const i = inputFor(tags, patch);
  const m = methodFor(i)!;
  assert.ok(m.ok);
  return { input: i, pool: buildPool(i, (m as { method: Parameters<typeof buildPool>[1] }).method)! };
};
const fit = (id: string, tags: ConstraintTag[]) => demandCompatibility(exerciseEligibility(K.getExercise(id)!, inputFor(tags).constraints));
const fitCodeOf = (rows: string[], id: string) => rows.find((r) => r.startsWith(`${id}|`))?.split("|").at(-1);
const col = (rows: string[], id: string, i: number) => rows.find((r) => r.startsWith(`${id}|`))?.split("|")[i];
const isBackCompound = (e: ExerciseEntry) => e.mechanics === "compound" && e.primaryMuscles.some((m) => m === "lats" || m === "mid_back");
const isLatWork = (e: ExerciseEntry) => e.primaryMuscles.includes("lats");

await check("1. V2 registry validates; version bumped; V1 ids all preserved; coverage materially larger", () => {
  assert.equal(FOUNDATION_KNOWLEDGE_VERSION, "0.5.0");
  const v1 = KNOWLEDGE_EXERCISE_IDS["0.4.0"];
  assert.equal(v1.length, 71);
  for (const id of v1) assert.ok(K.getExercise(id), `V1 id ${id} still exists`);
  assert.ok(K.exercises().length >= 100, `${K.exercises().length} exercises`);
  for (const e of K.exercises()) {
    assert.ok(e.emphasis.length && e.emphasis.every((m) => [...e.primaryMuscles, ...e.secondaryMuscles].includes(m)), `${e.id} emphasis`);
    assert.ok(["external", "partial", "thigh_anchored", "none"].includes(e.trunkSupport), `${e.id} trunk support`);
    assert.ok(e.role, `${e.id} role`);
  }
});

await check("2. Validation rejects bad V2 metadata (emphasis outside its muscles, unknown transfer target, bad trunk support)", () => {
  const good = K.getExercise("exercise.machine_low_row")!;
  const entries = (over: Partial<ExerciseEntry>) => [...K.exercises().filter((e) => e.id !== good.id), { ...structuredClone(good), ...over }, ...K.concepts(), ...K.byDomain("anatomy"), ...K.byDomain("biomechanics")];
  const issues = (over: Partial<ExerciseEntry>) => validateKnowledge({ sources: ALL_SOURCES, entries: entries(over) as never });
  assert.ok(issues({ emphasis: ["quadriceps"] }).some((x) => /emphasis quadriceps isn't one of its muscles/.test(x)));
  assert.ok(issues({ specificity: [{ exerciseId: "exercise.nope", level: "high" }] }).some((x) => /specificity target exercise.nope doesn't exist/.test(x)));
  assert.ok(issues({ trunkSupport: "sort_of" as never }).some((x) => /trunkSupport missing or invalid/.test(x)));
  assert.ok(issues({ setupVariations: [{ label: "", changes: "" }] }).some((x) => /setup variation/.test(x)));
});

await check("3. Trunk support is honest: chest pad carries the trunk; a thigh pad only anchors the pelvis (never 'supported')", () => {
  assert.equal(K.getExercise("exercise.lat_pulldown")!.trunkSupport, "thigh_anchored");
  assert.equal(K.getExercise("exercise.machine_pulldown")!.trunkSupport, "thigh_anchored");
  for (const id of ["exercise.machine_high_row", "exercise.machine_low_row", "exercise.incline_dumbbell_row", "exercise.chest_supported_row"]) assert.equal(K.getExercise(id)!.trunkSupport, "external", id);
  // Under a moderate-bracing restriction: thigh-anchored loaded pulls stay UNCERTAIN; chest-supported ones are compatible.
  assert.equal(fit("exercise.machine_pulldown", [BRACING]), "uncertain");
  assert.equal(fit("exercise.machine_high_row", [BRACING]), "compatible");
  // The registry-wide rule, not a list: every thigh-anchored or unsupported load-sensitive exercise is uncertain.
  const cs = inputFor([BRACING]).constraints;
  for (const e of K.exercises()) {
    const c = exerciseEligibility(e, cs);
    if (!c.loadConditions.length) continue;
    assert.equal(c.loadConditions[0].certainty, e.trunkSupport === "partial" || e.trunkSupport === "external" ? "conditional" : "uncertain", e.id);
  }
});

await check("4. Stimulus bias distinguishes what a variation actually trains (lat-biased vs upper-back-biased pulls)", () => {
  assert.equal(K.getExercise("exercise.machine_low_row")!.emphasis[0], "lats");
  assert.equal(K.getExercise("exercise.wide_grip_seated_cable_row")!.emphasis[0], "mid_back");
  assert.equal(K.getExercise("exercise.straight_arm_cable_pulldown")!.emphasis[0], "lats");
  assert.equal(K.getExercise("exercise.reverse_pec_deck")!.emphasis[0], "rear_delts");
  assert.equal(K.getExercise("exercise.close_grip_bench_press")!.specificity.find((s) => s.exerciseId === "exercise.barbell_bench_press")?.level, "high");
  // Variations are distinct exercises only when something material differs (equipment / support / pattern / emphasis / laterality).
  const sig = (e: ExerciseEntry) => JSON.stringify([e.patterns[0], e.equipment, e.trunkSupport, e.laterality, e.emphasis[0], e.positions.slice().sort(), e.path?.plane ?? "", e.path?.elbows ?? ""]);
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const e of K.exercises()) {
    const k = sig(e);
    if (seen.has(k) && !KNOWLEDGE_EXERCISE_IDS["0.4.0"].includes(e.id)) dupes.push(`${e.id} ≈ ${seen.get(k)}`);
    seen.set(k, e.id);
  }
  assert.deepEqual(dupes, [], "no trivial V2 duplicates");
});

await check("5. Teague dogfood fixture: materially richer pool — several legitimate back/lat compounds, honest fit classes, Lat Pulldown excluded", async () => {
  const { pool } = poolFor(TEAGUE_TAGS);
  const certain = (e: ExerciseEntry) => !pool.loadConditions.get(e.id)?.some((c) => c.certainty === "uncertain");
  const backCompounds = pool.pool.filter((e) => isBackCompound(e) && certain(e)).map((e) => e.id);
  const latWork = pool.pool.filter((e) => isLatWork(e) && certain(e)).map((e) => e.id);
  const v1BackCompounds = backCompounds.filter((id) => KNOWLEDGE_EXERCISE_IDS["0.4.0"].includes(id));
  assert.deepEqual(v1BackCompounds, ["exercise.chest_supported_row"], "V1: one confirmed-compatible back/lat compound");
  assert.ok(backCompounds.length >= 4, `V2 back/lat compounds: ${backCompounds.join(", ")}`);
  assert.ok(latWork.length >= 5, `V2 lat options: ${latWork.join(", ")}`);
  assert.ok(pool.pool.some((e) => e.patterns.includes("vertical_pull") && certain(e)), "a confirmed-compatible vertical-ish pull exists");
  // Excluded stays excluded; incompatible stays incompatible; uncertain stays uncertain; conditional stays conditional.
  assert.equal(fit("exercise.lat_pulldown", TEAGUE_TAGS), "incompatible");
  assert.ok(!pool.pool.some((e) => e.id === "exercise.lat_pulldown"));
  for (const id of ["exercise.pull_up", "exercise.barbell_row", "exercise.barbell_back_squat", "exercise.plank"]) assert.equal(fit(id, TEAGUE_TAGS), "incompatible", id);
  for (const id of ["exercise.machine_pulldown", "exercise.seated_cable_row", "exercise.single_arm_cable_pulldown"]) assert.equal(fit(id, TEAGUE_TAGS), "uncertain", id);
  for (const id of ["exercise.machine_chest_press", "exercise.incline_machine_press"]) assert.equal(fit(id, TEAGUE_TAGS), "conditional", id);
});

await check("6. Teague fixture through the Reasoner (scripted model): rows carry enough to tell supported from unsupported options", async () => {
  const i = inputFor(TEAGUE_TAGS);
  const m = fakeModel((ri) => scriptedOutput(ri));
  const r = await runFitnessReasoner({ input: i, model: m, nowIso: NOW, runId: "v2-teague" });
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  const rows = m.lastInput!.exercises;
  assert.ok(!rows.some((x) => x.startsWith("exercise.lat_pulldown|")), "excluded exercise never offered");
  assert.ok(m.lastInput!.constraints.some((c) => c.rules.includes("not Lat Pulldown")));
  // Columns: 9 = trunk support, 13 = role, 14 = emphasis, 15 = path, 16 = strength transfer; fit stays last.
  assert.equal(col(rows, "exercise.machine_high_row", 9), "E");
  assert.equal(col(rows, "exercise.machine_low_row", 14)?.split(",")[0], "lats");
  assert.equal(col(rows, "exercise.chest_supported_row", 14)?.split(",")[0], "mid_back");
  assert.equal(col(rows, "exercise.machine_chest_press", 9), "P");
  assert.equal(fitCodeOf(rows, "exercise.machine_chest_press"), "K");
  assert.ok(!rows.some((x) => x.endsWith("|U")), "uncertain options are withheld, not offered");
  assert.ok(r.run.preflight!.withheld.includes("exercise.machine_pulldown"), "uncertain thigh-anchored pulldown withheld for the coach");
  assert.ok(m.lastInput!.exerciseLegend.includes("T thigh/knee pad only"));
  assert.ok(rows.length > 40, `${rows.length} candidates`);
  // Budget sanity: the richer input stays well inside the model's context.
  assert.ok(m.lastUserMessage.length < 60_000, `${m.lastUserMessage.length} chars`);
});

await check("7. Generalization: unilateral upper-limb needs — unilateral options exist and are labelled for the Reasoner", () => {
  const { pool } = poolFor([]);
  const uniUpper = pool.pool.filter((e) => e.laterality === "unilateral" && e.patterns.some((p) => ["horizontal_pull", "vertical_pull", "vertical_push", "shoulder_isolation", "elbow_flexion"].includes(p)));
  assert.ok(uniUpper.length >= 5, uniUpper.map((e) => e.id).join(","));
  assert.ok(uniUpper.some((e) => e.patterns.includes("vertical_pull")) && uniUpper.some((e) => e.patterns.includes("horizontal_pull")));
});

await check("8. Generalization: unavailable equipment (dumbbells only) — lats still trainable, nothing needing machines/cables offered", () => {
  const noKit: ConstraintTag[] = ["machine", "cable", "barbell", "bands", "kettlebell"].map((equipment) => ({ kind: "avoid_equipment", equipment: equipment as never }));
  const { pool } = poolFor(noKit);
  assert.ok(pool.pool.every((e) => e.equipment === "dumbbell" || e.equipment === "bodyweight"));
  const lats = functionAvailability(pool.pool, pool.loadConditions).find((f) => f.target === "lats")!;
  assert.equal(lats.state, "available", "dumbbell row / pullover / incline row");
});

await check("9. Generalization: lower-body spinal-loading restriction — spine-friendly squat options stay, heavy barbell ones go", () => {
  const spine: ConstraintTag[] = [{ kind: "avoid_demand", demand: "spinal_loading", atOrAbove: "moderate" }];
  assert.equal(fit("exercise.barbell_back_squat", spine), "incompatible");
  assert.equal(fit("exercise.belt_squat", spine), "compatible");
  assert.equal(fit("exercise.leg_press", spine), "compatible");
  const { pool } = poolFor(spine);
  assert.equal(functionAvailability(pool.pool, pool.loadConditions).find((f) => f.target === "quadriceps")!.state, "available");
});

await check("10. Generalization: overhead restriction — every overhead-position exercise goes, lats remain trainable, a non-overhead press exists", () => {
  const overhead: ConstraintTag[] = [{ kind: "avoid_position", position: "overhead" }];
  const { pool } = poolFor(overhead);
  assert.ok(!pool.pool.some((e) => e.positions.includes("overhead")));
  assert.equal(functionAvailability(pool.pool, pool.loadConditions).find((f) => f.target === "lats")!.state, "available");
  assert.ok(pool.pool.some((e) => e.id === "exercise.landmine_press"), "angled press as a non-overhead vertical push");
  for (const id of ["exercise.machine_high_row", "exercise.straight_arm_cable_pulldown", "exercise.dumbbell_pullover"]) assert.equal(fit(id, overhead), "incompatible", `${id} is conservatively overhead`);
});

await check("11. Generalization: exercise-specific exclusion removes exactly that exercise", () => {
  const ex: ConstraintTag[] = [{ kind: "avoid_exercise", exerciseId: "exercise.chest_supported_row" }];
  const all = poolFor([]).pool.pool.map((e) => e.id);
  const withEx = poolFor(ex).pool.pool.map((e) => e.id);
  assert.deepEqual(all.filter((id) => !withEx.includes(id)), ["exercise.chest_supported_row"]);
});

await check("12. Generalization: no relevant restriction — everything the equipment allows is offered, all compatible", () => {
  const { pool } = poolFor([]);
  assert.equal(pool.loadConditions.size, 0, "no load conditions without a restriction");
  assert.ok(pool.pool.length > 80, `${pool.pool.length}`);
  for (const f of functionAvailability(pool.pool, pool.loadConditions)) assert.equal(f.state, "available", f.target);
});

await check("13. A new knowledge version may make a better plan possible — surfaced as 'loosened', never an automatic paid revision", async () => {
  const i = inputFor(TEAGUE_TAGS);
  const r = await runFitnessReasoner({ input: i, model: fakeModel((ri) => scriptedOutput(ri)), nowIso: NOW, runId: "old" });
  assert.equal(r.status, "PLANNED");
  // Simulate the same draft solved under the V1 knowledge set (offered rows limited to V1 ids).
  const v1Ids = new Set(KNOWLEDGE_EXERCISE_IDS["0.4.0"]);
  const old: ReasonerRun = structuredClone(r.run);
  old.versions.knowledge = "0.4.0";
  delete old.planningState;
  old.input!.exercises = old.input!.exercises.filter((x) => v1Ids.has(x.split("|")[0]));
  old.result.plan!.sessions = old.result.plan!.sessions.map((s) => ({ ...s, exercises: s.exercises.filter((e) => v1Ids.has(e.exerciseId)) }));
  const gi: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
  const content = reasonerResultToProgramContent({ result: { ...(r as Extract<typeof r, { status: "PLANNED" }>), run: old, plan: old.result.plan! }, knowledge: K, programId: "p", workspaceId: "ws", clientProfileId: "client-eval", coachId: "c", title: "t", jobId: "j", generationInputs: gi, nowIso: NOW });
  const a = assessPlanningState({ run: old, content, current: { client: i.client, goal: i.goal, constraints: i.constraints, coachMethodVersionId: i.coach!.versionId, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION }, knowledge: K, openConsequence: false });
  assert.deepEqual(a.changes.map((c) => c.part), ["knowledge"]);
  assert.equal(a.status, "loosened", `${a.status} ${a.reasons.join(" ")}`);
  assert.ok(a.newlyAvailable.includes("Chest-Supported Machine High Row"), a.newlyAvailable.join(", "));
  assert.equal(decideRevision({ assessment: a, draftJobId: "j", trigger: "limitations_confirmed", jobs: [] }).queue, false, "no automatic paid call");
  assert.equal(decideRevision({ assessment: a, draftJobId: "j", trigger: "coach_requested", jobs: [] }).queue, true, "the coach may ask for it");
});

await check("14. Knowledge stays generic: no client, condition or dogfood-specific substitution in knowledge or eligibility", () => {
  for (const f of ["./resistance/exercises.ts", "./registry.ts", "./taxonomy.ts", "../exercise-eligibility.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/teague|hernia|dogfood|substitute for lat|instead of lat pulldown/i.test(src), f);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
