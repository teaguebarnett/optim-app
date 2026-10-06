// Gate 4.0C-1B — Resistance Fitness Knowledge Pack. Pure; runs against the
// shipped registry, the real exercise library and the Gate 4.0C-1
// ConstraintSet types.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { EXERCISE_LIBRARY } from "../../coach/exercise-library.ts";
import type { Constraint, ConstraintSet, ConstraintTag } from "../constraints.ts";
import { compatibleWithConstraints, exerciseEligibility } from "../exercise-eligibility.ts";
import { RESISTANCE_CONCEPTS } from "./resistance/concepts.ts";
import { RESISTANCE_EXERCISES } from "./resistance/exercises.ts";
import { createKnowledgeRegistry, FOUNDATION_KNOWLEDGE as K, validateKnowledge } from "./registry.ts";
import { ALL_SOURCES, SOURCES } from "./sources.ts";
import { EQUIPMENT, MOVEMENT_PATTERNS, MUSCLES } from "./taxonomy.ts";
import type { ExerciseEntry, KnowledgeEntry } from "./types.ts";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

/** The ids Gate 4.0C-1 (d5a80eb) gave the legacy library — frozen. */
const LEGACY_IDS = ["exercise.barbell_back_squat", "exercise.front_squat", "exercise.goblet_squat", "exercise.leg_press", "exercise.bodyweight_squat", "exercise.bulgarian_split_squat", "exercise.walking_lunge", "exercise.reverse_lunge", "exercise.conventional_deadlift", "exercise.romanian_deadlift", "exercise.dumbbell_romanian_deadlift", "exercise.hip_thrust", "exercise.kettlebell_swing", "exercise.back_extension", "exercise.barbell_bench_press", "exercise.dumbbell_bench_press", "exercise.push_up", "exercise.machine_chest_press", "exercise.cable_chest_fly", "exercise.overhead_press", "exercise.dumbbell_shoulder_press", "exercise.machine_shoulder_press", "exercise.pike_push_up", "exercise.lateral_raise", "exercise.barbell_row", "exercise.dumbbell_row", "exercise.seated_cable_row", "exercise.chest_supported_row", "exercise.inverted_row", "exercise.pull_up", "exercise.lat_pulldown", "exercise.assisted_pull_up", "exercise.band_assisted_pull_up", "exercise.dumbbell_bicep_curl", "exercise.cable_triceps_pushdown", "exercise.leg_curl", "exercise.leg_extension", "exercise.calf_raise", "exercise.face_pull", "exercise.band_pull_apart", "exercise.plank", "exercise.hanging_knee_raise", "exercise.cable_pallof_press", "exercise.dead_bug", "exercise.farmer_s_carry", "exercise.kettlebell_suitcase_carry"];

const ids = (xs: ExerciseEntry[]) => xs.map((e) => e.id);
const set = (clientProfileId: string, tags: ConstraintTag[], extra: Partial<Constraint> = {}): ConstraintSet => ({
  clientProfileId,
  constraints: [{ id: `${clientProfileId}:test`, clientProfileId, category: "movement_restriction", source: { kind: "coach_documented", ref: "test" }, description: "test", tags, enforcement: "hard", confirmation: "coach_confirmed", review: { status: "resolved" }, ...extra }],
});
const shippedEntries = (): KnowledgeEntry[] => [...K.byDomain("anatomy"), ...K.byDomain("biomechanics"), ...RESISTANCE_EXERCISES, ...RESISTANCE_CONCEPTS].map((e) => structuredClone(e));
const issuesWith = (mutate: (entries: KnowledgeEntry[]) => void, sources = ALL_SOURCES.map((s) => ({ ...s }))) => {
  const entries = shippedEntries();
  mutate(entries);
  return validateKnowledge({ sources, entries });
};
const exAt = (entries: KnowledgeEntry[], id: string) => entries.find((e) => e.id === id) as ExerciseEntry;

console.log("\nGate 4.0C-1B — resistance knowledge pack\n");

check("1. Knowledge registry validates", () => {
  assert.deepEqual(validateKnowledge({ sources: ALL_SOURCES, entries: shippedEntries() }), []);
  assert.equal(K.version, "0.5.0");
  assert.equal(K.byDomain("anatomy").length, Object.keys(MUSCLES).length);
  assert.ok(K.exercises().length >= 60, `${K.exercises().length} exercises`);
  assert.ok(K.concepts().length >= 12);
});

check("2. Existing canonical exercise IDs remain stable", () => {
  assert.equal(EXERCISE_LIBRARY.length, LEGACY_IDS.length);
  const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  for (const lib of EXERCISE_LIBRARY) {
    const matches = K.exercises().filter((e) => e.legacyName === lib.name);
    assert.equal(matches.length, 1, `exactly one knowledge entry for "${lib.name}"`);
    const e = matches[0];
    assert.equal(e.id, `exercise.${slug(lib.name)}`, "same id Gate 4.0C-1 derived");
    assert.ok(LEGACY_IDS.includes(e.id));
    assert.equal(e.equipment, lib.equipment, `${e.id} equipment`);
    assert.equal(e.mechanics, lib.isCompound ? "compound" : "isolation", `${e.id} mechanics`);
  }
  for (const id of LEGACY_IDS) assert.ok(K.getExercise(id), id);
});

check("3. Exercises reference valid muscles, patterns and equipment", () => {
  for (const e of K.exercises()) {
    for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) assert.equal(K.get(`muscle.${m}`)?.kind, "muscle", `${e.id}: ${m}`);
    for (const p of e.patterns) assert.equal(K.get(`pattern.${p}`)?.kind, "movement_pattern", `${e.id}: ${p}`);
    assert.ok((EQUIPMENT as readonly string[]).includes(e.equipment), e.id);
    assert.ok(e.patterns.length > 0 && e.primaryMuscles.length > 0, `${e.id} has programming taxonomy`);
  }
  // Every pattern in the taxonomy is used by at least one exercise.
  for (const p of Object.keys(MOVEMENT_PATTERNS)) assert.ok(K.exercisesForPattern(p as keyof typeof MOVEMENT_PATTERNS).length > 0, `pattern ${p} unused`);
});

check("4. Structured search returns expected exercise categories", () => {
  const vPull = ids(K.exercisesForPattern("vertical_pull"));
  assert.ok(vPull.includes("exercise.pull_up") && vPull.includes("exercise.lat_pulldown"));
  assert.ok(!vPull.includes("exercise.seated_cable_row"));
  assert.ok(ids(K.exercisesForMuscle("biceps")).includes("exercise.dumbbell_bicep_curl"));
  assert.ok(ids(K.exercisesForMuscle("biceps", "any")).includes("exercise.lat_pulldown"), "secondary via 'any'");
  // "Elbow flexion without a high trunk-stability requirement."
  const curls = K.findExercises({ patternsAnyOf: ["elbow_flexion"], maxDemands: { stability: "low", bracing: "low" } });
  assert.ok(curls.length >= 3 && curls.every((e) => e.patterns.includes("elbow_flexion") && e.demands.stability === "low"));
  // "Does this exercise require significant bracing?"
  assert.equal(K.getExercise("exercise.barbell_back_squat")!.demands.bracing, "high");
  assert.equal(K.getExercise("exercise.leg_press")!.demands.bracing, "low");
  // Taxonomy fixes over the legacy library: a lateral raise isn't a vertical push.
  assert.deepEqual(K.getExercise("exercise.lateral_raise")!.patterns, ["shoulder_isolation"]);
  // Hypertrophy-suitable horizontal pushes with dumbbells.
  const hp = K.findExercises({ patternsAnyOf: ["horizontal_push"], equipmentAnyOf: ["dumbbell"], suitableFor: { quality: "hypertrophy", atLeast: "high" } });
  assert.ok(ids(hp).includes("exercise.dumbbell_bench_press"));
  // Deterministic: same query, same order.
  assert.deepEqual(ids(K.findExercises({ musclesAnyOf: ["glutes"] })), ids(K.findExercises({ musclesAnyOf: ["glutes"] })));
});

check("5. Substitution search respects target + equipment", () => {
  const subs = K.substitutesFor("exercise.barbell_back_squat", { equipmentAnyOf: ["dumbbell", "machine", "bodyweight"] });
  const s = subs.map((c) => c.exercise.id);
  assert.ok(s.includes("exercise.goblet_squat") && s.includes("exercise.leg_press"));
  assert.ok(subs.every((c) => c.exercise.equipment !== "barbell" && c.sharedPrimaryMuscles.length > 0 && c.sharedPatterns.includes("squat") && c.sameMechanics));
  assert.ok(!s.includes("exercise.leg_extension"), "isolation doesn't preserve intent");
  assert.ok(!s.includes("exercise.bulgarian_split_squat"), "different pattern under the default");
  assert.ok(K.substitutesFor("exercise.barbell_back_squat", { preserve: "target", equipmentAnyOf: ["dumbbell"] }).some((c) => c.exercise.id === "exercise.bulgarian_split_squat"));
  // The legacy library's deadlift had no substitute at all.
  assert.ok(K.substitutesFor("exercise.conventional_deadlift").some((c) => c.exercise.id === "exercise.trap_bar_deadlift"));
  // Apparatus: with no pull-up bar, a pull-up isn't a valid pulldown substitute.
  assert.ok(K.substitutesFor("exercise.lat_pulldown").some((c) => c.exercise.id === "exercise.pull_up"));
  assert.ok(!K.substitutesFor("exercise.lat_pulldown", { apparatusAvailable: [] }).some((c) => c.exercise.id === "exercise.pull_up"));
  // Demand-limited substitutes.
  assert.ok(K.substitutesFor("exercise.barbell_row", { maxDemands: { bracing: "low" } }).every((c) => c.exercise.demands.bracing === "low"));
  assert.throws(() => K.substitutesFor("exercise.nope"));
});

check("6. Constraint filtering uses metadata, not exercise-name substrings", () => {
  const noSquat = compatibleWithConstraints(K, set("c1", [{ kind: "avoid_movement_pattern", pattern: "squat" }]));
  const excluded = noSquat.excluded.map((x) => x.exercise.id);
  assert.ok(excluded.includes("exercise.leg_press"), "Leg Press has no 'squat' in its name but is a squat pattern");
  assert.ok(ids(noSquat.eligible).includes("exercise.bulgarian_split_squat"), "'squat' in the name, but a single-leg pattern");
  assert.ok(noSquat.excluded.every((x) => x.violations.every((v) => v.basis === "metadata")));
  const noHinge = compatibleWithConstraints(K, set("c1", [{ kind: "avoid_movement_pattern", pattern: "hinge" }]));
  const hingeOut = noHinge.excluded.map((x) => x.exercise.id);
  assert.ok(hingeOut.includes("exercise.kettlebell_swing") && hingeOut.includes("exercise.back_extension"));
  assert.ok(ids(noHinge.eligible).includes("exercise.hip_thrust"), "hip thrust is hip-dominant without a hinge");
  // The knowledge layer itself contains no name-based logic.
  for (const f of ["registry.ts", "taxonomy.ts", "../exercise-eligibility.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/\.name\.(toLowerCase|includes)|name\.includes\(|\/(squat|deadlift|press)\//i.test(src), `${f} uses names as logic`);
  }
});

check("7. High-bracing filtering works where metadata declares high bracing", () => {
  const r = compatibleWithConstraints(K, set("c1", [{ kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]));
  const out = r.excluded.map((x) => x.exercise.id);
  for (const id of ["exercise.barbell_back_squat", "exercise.conventional_deadlift", "exercise.overhead_press", "exercise.barbell_row", "exercise.farmer_s_carry"]) assert.ok(out.includes(id), id);
  for (const id of ["exercise.leg_press", "exercise.machine_chest_press", "exercise.chest_supported_row"]) assert.ok(ids(r.eligible).includes(id), id);
  assert.ok(r.excluded.every((x) => x.exercise.demands.bracing === "high"));
  assert.ok(r.eligible.every((e) => e.demands.bracing !== "high"));
});

check("8. Loaded single-leg classification", () => {
  const sl = ids(K.exercisesForPattern("single_leg"));
  for (const id of ["exercise.bulgarian_split_squat", "exercise.walking_lunge", "exercise.reverse_lunge", "exercise.dumbbell_split_squat", "exercise.dumbbell_step_up"]) assert.ok(sl.includes(id), id);
  for (const id of ["exercise.leg_press", "exercise.barbell_back_squat", "exercise.single_leg_calf_raise", "exercise.single_leg_romanian_deadlift"]) assert.ok(!sl.includes(id), id);
  const r = compatibleWithConstraints(K, set("c1", [{ kind: "avoid_movement_pattern", pattern: "single_leg" }]));
  assert.deepEqual(r.excluded.map((x) => x.exercise.id).sort(), [...sl].sort());
});

check("9. Invalid knowledge references fail validation", () => {
  const expectIssue = (re: RegExp, mutate: (e: KnowledgeEntry[]) => void, sources?: typeof ALL_SOURCES) => {
    const issues = issuesWith(mutate, sources);
    assert.ok(issues.some((i) => re.test(i)), `expected ${re} in: ${issues.join(" | ") || "(none)"}`);
  };
  expectIssue(/unknown muscle/, (e) => ((exAt(e, "exercise.plank").primaryMuscles as string[]) = ["sixpack"]));
  expectIssue(/unknown movement pattern/, (e) => ((exAt(e, "exercise.plank").patterns as string[]) = ["planking"]));
  expectIssue(/no primary muscle/, (e) => (exAt(e, "exercise.plank").primaryMuscles = []));
  expectIssue(/Duplicate entry id/, (e) => e.push(structuredClone(exAt(e, "exercise.plank"))));
  expectIssue(/harder variant exercise.nope doesn't exist/, (e) => (exAt(e, "exercise.plank").harderVariants = ["exercise.nope"]));
  expectIssue(/Harder-variant cycle/, (e) => (exAt(e, "exercise.barbell_back_squat").harderVariants = ["exercise.bodyweight_squat"]));
  expectIssue(/collides with/, (e) => (exAt(e, "exercise.leg_press").aliases = ["Back Squat"]));
  expectIssue(/cites unknown source/, (e) => (exAt(e, "exercise.plank").evidence = { status: "internal_curation", sources: [{ sourceId: "src.made_up" }], reviewedByQualifiedExpert: false }));
  expectIssue(/sourced evidence cites internal curation/, (e) => (exAt(e, "exercise.plank").evidence = { status: "sourced", level: "meta_analysis", sources: [{ sourceId: SOURCES.internalTaxonomy.id }] }));
  expectIssue(/doesn't match source type/, (e) => (exAt(e, "exercise.plank").evidence = { status: "sourced", level: "meta_analysis", sources: [{ sourceId: SOURCES.acsm2009.id }] }));
  expectIssue(/numeric parameters require a sourced claim/, (e) => {
    const c = e.find((x) => x.id === "concept.resistance.deload")!;
    if (c.kind === "concept") c.claims[1].parameters = { everyWeeks: { min: 4, max: 6, unit: "weeks" } };
  });
  expectIssue(/must be sourced or marked source_needed/, (e) => {
    const c = e.find((x) => x.id === "concept.resistance.deload")!;
    if (c.kind === "concept") c.claims[1].evidence = { status: "internal_curation", sources: [{ sourceId: SOURCES.internalTaxonomy.id }], reviewedByQualifiedExpert: false };
  });
  expectIssue(/external sources need a citation/, () => {}, ALL_SOURCES.map((s) => (s.id === SOURCES.acsm2009.id ? { ...s, doi: undefined, pmid: undefined } : s)));
  expectIssue(/malformed DOI/, () => {}, ALL_SOURCES.map((s) => (s.id === SOURCES.acsm2009.id ? { ...s, doi: "not-a-doi" } : s)));
  // createKnowledgeRegistry refuses corrupted knowledge outright.
  const bad = shippedEntries();
  (exAt(bad, "exercise.plank").primaryMuscles as string[]) = ["sixpack"];
  assert.throws(() => createKnowledgeRegistry({ version: "x", sources: ALL_SOURCES, entries: bad }), /Invalid knowledge/);
});

check("10. Source provenance can be retrieved for sourced knowledge", () => {
  const [src] = K.sourcesFor("concept.resistance.volume", "volume.dose_response_hypertrophy");
  assert.equal(src.id, SOURCES.schoenfeld2017Volume.id);
  assert.equal(src.doi, "10.1080/02640414.2016.1210197");
  assert.equal(src.pmid, "27433992");
  for (const c of K.concepts()) {
    for (const claim of c.claims) {
      if (claim.evidence.status !== "sourced") continue;
      const sources = K.sourcesFor(c.id, claim.id);
      assert.ok(sources.length > 0, `${c.id}#${claim.id}`);
      for (const s of sources) assert.ok(s.type !== "internal_curation" && s.citation && s.doi && s.pmid && s.verifiedVia, `${s.id} fully cited and verified`);
    }
  }
});

check("11. Unsourced claims are distinguishable from sourced claims", () => {
  const needed = K.sourceNeeded();
  assert.ok(needed.some((n) => n.claimId === "deload.timing"));
  for (const n of needed) assert.deepEqual(K.sourcesFor(n.entryId, n.claimId), [], `${n.claimId} has no sources`);
  for (const c of K.concepts()) {
    for (const claim of c.claims) {
      if (claim.kind !== "definition") assert.ok(claim.evidence.status === "sourced" || claim.evidence.status === "source_needed", `${claim.id}: guidance is sourced or flagged`);
      if (claim.evidence.status !== "sourced") assert.equal(claim.parameters, undefined, `${claim.id}: unsourced claims carry no numbers`);
    }
  }
  // Exercise ratings are honestly internal curation, not reviewed science.
  assert.ok(K.exercises().every((e) => e.evidence.status === "internal_curation" && !e.evidence.reviewedByQualifiedExpert));
});

const knowledgeFiles = (): string[] => {
  const dir = new URL(".", import.meta.url).pathname;
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".ts") ? [join(d, f)] : []));
  return walk(dir);
};

check("12. Fitness Knowledge remains separate from the Coach Brain", () => {
  for (const f of knowledgeFiles()) {
    const imports = [...readFileSync(f, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const i of imports) assert.ok(!/coach-brain|operating-model|calibration|method-resolution|production|supabase/.test(i), `${f} imports ${i}`);
  }
  // Every guidance claim names the coach-method dimension that governs it.
  for (const c of K.concepts()) if (c.claims.some((x) => x.kind !== "definition")) assert.ok(c.coachMethodDimension, `${c.id} names what the coach decides`);
});

check("13. No client-specific facts leak into Fitness Knowledge", () => {
  for (const f of knowledgeFiles()) {
    const imports = [...readFileSync(f, "utf8").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)];
    for (const m of imports) {
      if (/client-state|constraints|readiness|synthesis-input|planner|access|exercise-eligibility/.test(m[2])) assert.fail(`${f} imports client-side module ${m[2]}`);
      if (/goal-contract/.test(m[2])) assert.ok(m[1], `${f} may only import goal-class vocabulary as a type`);
    }
  }
  const before = JSON.stringify(K.exercises());
  assert.ok(!/clientProfileId|workspaceId|onboarding/.test(before + JSON.stringify(K.concepts())));
  // Evaluating a client's constraints never changes the knowledge.
  exerciseEligibility(K.getExercise("exercise.leg_press")!, set("c1", [{ kind: "avoid_movement_pattern", pattern: "squat" }]));
  compatibleWithConstraints(K, set("c2", [{ kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" }]));
  assert.equal(JSON.stringify(K.exercises()), before);
  assert.throws(() => ((K.getExercise("exercise.leg_press")!.patterns as string[]).push("hinge")));
  // A superseded constraint doesn't apply; a different client's constraints don't either.
  const superseded = set("c1", [{ kind: "avoid_movement_pattern", pattern: "squat" }], { supersededBy: "c1:other" });
  assert.equal(exerciseEligibility(K.getExercise("exercise.leg_press")!, superseded).eligible, true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
