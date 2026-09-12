// Phase 2 — Legacy <-> Universal Training Adapter. Pure logic tests for
// lib/training/legacy-adapter.ts, proving the universal grammar can
// losslessly represent today's real strength content before any production
// consumer migrates onto it. No DB, no network, no UI.
//
// Section 1 round-trips the app's actual authored fixture (lib/mock-data.ts's
// PUSH_WORKOUT) losslessly. Section 2 exercises every real-but-currently-
// unexercised legacy field (approvedSubstituteExerciseId, warmupInstruction,
// bodyweight/no-load exercises, superset/circuit grouping) with targeted
// fixtures built from the same real generators the app itself uses, per the
// Phase 2 brief's requirement not to declare 100% coverage without evidence.
// Section 3 proves the reverse-compatibility rejections (continuous/interval/
// circuit-with-rounds/hybrid content correctly returns null, never a lossy
// best-effort flattening). Section 4 covers the adapter's own hygiene
// (purity, determinism, no mutation, no magic coercion).
//
// Run with: npm run verify:legacy-adapter

import assert from "node:assert/strict";
import { PUSH_WORKOUT } from "../mock-data.ts";
import { buildPrescribedSets } from "../coach/training.ts";
import { validateSession } from "../production/validation.ts";
import { UnsupportedLegacyWorkoutError, checkSessionLegacyCompatibility, legacyWorkoutToSession, sessionToLegacyWorkout } from "./legacy-adapter.ts";
import type { Workout, Exercise } from "../types.ts";
import type { Session } from "./types.ts";

let passed = 0;
let failed = 0;

function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The deterministic semantic-equivalence rule for a round trip (Phase 2
 * spec section 6): every field must match exactly EXCEPT
 * `previousPerformance`, which is deliberately out of scope for the
 * Session/Prescription boundary (execution history, not prescription — see
 * legacy-adapter.ts's module doc). Rather than silently ignoring that field,
 * this asserts the exclusion is honest: the reconstructed side must be
 * empty, never a fabricated or leftover value. */
function assertWorkoutRoundTripEquivalent(original: Workout, reconstructed: Workout): void {
  for (const exercise of reconstructed.exercises) {
    assert.deepEqual(exercise.previousPerformance, [], `reconstructed exercise "${exercise.id}" must have empty previousPerformance, never fabricated`);
  }
  const normalizedOriginal: Workout = {
    ...original,
    exercises: original.exercises.map((e) => ({ ...e, previousPerformance: [] })),
  };
  assert.deepEqual(reconstructed, normalizedOriginal);
}

// ---------------------------------------------------------------------------
// 1. The app's real, currently-authored fixture — PUSH_WORKOUT
// ---------------------------------------------------------------------------

console.log("\n1. Real fixture: lib/mock-data.ts's PUSH_WORKOUT (5 exercises)\n");

check("PUSH_WORKOUT converts successfully to a universal Session", () => {
  const session = legacyWorkoutToSession(PUSH_WORKOUT);
  assert.equal(session.id, PUSH_WORKOUT.id);
  assert.equal(session.blocks.length, 5, "5 independent exercises -> 5 straight blocks");
});

check("the converted Session passes the Phase 1 universal validator (test requirement B)", () => {
  const session = legacyWorkoutToSession(PUSH_WORKOUT);
  const validated = validateSession(session, "adapter output");
  assert.equal(validated.blocks.length, 5);
});

check("legacy -> universal -> legacy is lossless for PUSH_WORKOUT (test requirement C)", () => {
  const session = legacyWorkoutToSession(PUSH_WORKOUT);
  const reconstructed = sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: PUSH_WORKOUT.dayOfWeek });
  assert.ok(reconstructed, "a genuinely legacy-compatible session must never return null");
  assertWorkoutRoundTripEquivalent(PUSH_WORKOUT, reconstructed!);
});

check("exercise ordering is preserved end to end (test requirement D)", () => {
  const session = legacyWorkoutToSession(PUSH_WORKOUT);
  const names = session.blocks.flatMap((b) => b.items).map((i) => i.name);
  assert.deepEqual(names, PUSH_WORKOUT.exercises.map((e) => e.name));
  const reconstructed = sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: PUSH_WORKOUT.dayOfWeek });
  assert.deepEqual(
    reconstructed!.exercises.map((e) => e.name),
    PUSH_WORKOUT.exercises.map((e) => e.name)
  );
});

check("all 5 exercises preserve identity, prescription, load, RPE, rest, and tempo independently (test requirement F)", () => {
  const session = legacyWorkoutToSession(PUSH_WORKOUT);
  const items = session.blocks.flatMap((b) => b.items);
  assert.equal(items.length, 5);
  for (let i = 0; i < PUSH_WORKOUT.exercises.length; i++) {
    const exercise = PUSH_WORKOUT.exercises[i];
    const item = items.find((it) => it.id === exercise.id)!;
    assert.ok(item, `item for exercise ${exercise.id} must exist`);
    assert.equal(item.prescription.sets, exercise.workingSets);
    assert.equal(item.prescription.warmupSets, exercise.warmupSets);
    assert.equal(item.prescription.reps?.low, exercise.targetRepsLow);
    assert.equal(item.prescription.reps?.high, exercise.targetRepsHigh);
    assert.equal(item.prescription.rpe, exercise.targetRpe);
    assert.equal(item.prescription.restSeconds, exercise.restSeconds);
    assert.equal(item.prescription.tempo, exercise.tempo);
    const workingSet = exercise.prescribedSets.find((s) => !s.isWarmup)!;
    assert.equal(item.prescription.load?.value, workingSet.prescribedWeightLb);
    assert.equal(item.prescription.load?.unit, "lb");
  }
});

check("conversion is deterministic — converting the same real fixture twice produces equivalent output (test requirement L)", () => {
  const first = legacyWorkoutToSession(PUSH_WORKOUT);
  const second = legacyWorkoutToSession(PUSH_WORKOUT);
  assert.deepEqual(first, second);
});

check("legacyWorkoutToSession never mutates the source Workout/Exercise objects (test requirement K)", () => {
  const before = structuredClone(PUSH_WORKOUT);
  legacyWorkoutToSession(PUSH_WORKOUT);
  assert.deepEqual(PUSH_WORKOUT, before);
});

// ---------------------------------------------------------------------------
// 2. Targeted fixtures for real legacy fields PUSH_WORKOUT never exercises —
//    built from the same real generator (buildPrescribedSets) the app's own
//    coach-authoring path uses, so these are genuine schema-valid content,
//    not unrealistic toy objects. Confirms section 11's "100% of today's
//    schema" claim against evidence, not assumption.
// ---------------------------------------------------------------------------

console.log("\n2. Targeted coverage for real legacy fields no current fixture exercises\n");

function buildExercise(input: {
  id: string;
  order: number;
  name: string;
  warmupSets: number;
  workingSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: 6 | 7 | 8 | 9 | 10;
  restSeconds: number;
  tempo: string;
  cue: string;
  workingWeightLb?: number;
  approvedSubstituteExerciseId?: string;
  warmupInstruction?: string;
  block?: { id: string; type: "superset" | "circuit" };
}): Exercise {
  return {
    id: input.id,
    order: input.order,
    name: input.name,
    warmupSets: input.warmupSets,
    workingSets: input.workingSets,
    targetRepsLow: input.targetRepsLow,
    targetRepsHigh: input.targetRepsHigh,
    targetRpe: input.targetRpe,
    restSeconds: input.restSeconds,
    tempo: input.tempo,
    cue: input.cue,
    previousPerformance: [],
    prescribedSets: buildPrescribedSets({
      warmupSets: input.warmupSets,
      workingSets: input.workingSets,
      targetRepsLow: input.targetRepsLow,
      targetRepsHigh: input.targetRepsHigh,
      targetRpe: input.targetRpe,
      workingWeightLb: input.workingWeightLb,
    }),
    ...(input.approvedSubstituteExerciseId !== undefined ? { approvedSubstituteExerciseId: input.approvedSubstituteExerciseId } : {}),
    ...(input.warmupInstruction !== undefined ? { warmupInstruction: input.warmupInstruction } : {}),
    ...(input.block !== undefined ? { block: input.block } : {}),
  };
}

const BODYWEIGHT_PUSHUP = buildExercise({
  id: "bodyweight-pushup",
  order: 1,
  name: "Push-up",
  warmupSets: 0,
  workingSets: 3,
  targetRepsLow: 12,
  targetRepsHigh: 20,
  targetRpe: 8,
  restSeconds: 60,
  tempo: "2-0-1",
  cue: "Keep a straight line from shoulders to ankles.",
  // no workingWeightLb -- a genuine, currently-real bodyweight case
});

const EXERCISE_WITH_SUBSTITUTE = buildExercise({
  id: "barbell-row",
  order: 2,
  name: "Barbell Row",
  warmupSets: 1,
  workingSets: 3,
  targetRepsLow: 8,
  targetRepsHigh: 10,
  targetRpe: 8,
  restSeconds: 120,
  tempo: "2-0-1",
  cue: "Pull to the lower ribcage.",
  workingWeightLb: 135,
  approvedSubstituteExerciseId: "bodyweight-pushup",
});

const EXERCISE_WITH_WARMUP_INSTRUCTION = buildExercise({
  id: "overhead-press",
  order: 3,
  name: "Overhead Press",
  warmupSets: 0,
  workingSets: 3,
  targetRepsLow: 5,
  targetRepsHigh: 8,
  targetRpe: 8,
  restSeconds: 120,
  tempo: "2-0-1",
  cue: "Brace hard before unracking.",
  workingWeightLb: 95,
  warmupInstruction: "Two light feeler sets before your first working set — no need to log them.",
});

const SUPERSET_A = buildExercise({
  id: "superset-curl",
  order: 4,
  name: "Dumbbell Curl",
  warmupSets: 0,
  workingSets: 3,
  targetRepsLow: 10,
  targetRepsHigh: 12,
  targetRpe: 8,
  restSeconds: 0,
  tempo: "2-0-1",
  cue: "No swinging.",
  workingWeightLb: 25,
  block: { id: "sup-1", type: "superset" },
});

const SUPERSET_B = buildExercise({
  id: "superset-pressdown",
  order: 5,
  name: "Triceps Pressdown",
  warmupSets: 0,
  workingSets: 3,
  targetRepsLow: 10,
  targetRepsHigh: 12,
  targetRpe: 8,
  restSeconds: 90,
  tempo: "2-0-1",
  cue: "Elbows pinned.",
  workingWeightLb: 40,
  block: { id: "sup-1", type: "superset" },
});

const CIRCUIT_A = buildExercise({
  id: "circuit-squat",
  order: 6,
  name: "Kettlebell Goblet Squat",
  warmupSets: 0,
  workingSets: 4,
  targetRepsLow: 15,
  targetRepsHigh: 15,
  targetRpe: 7,
  restSeconds: 0,
  tempo: "2-0-1",
  cue: "Sit between your heels.",
  workingWeightLb: 35,
  block: { id: "circ-1", type: "circuit" },
});

const CIRCUIT_B = buildExercise({
  id: "circuit-swing",
  order: 7,
  name: "Kettlebell Swing",
  warmupSets: 0,
  workingSets: 4,
  targetRepsLow: 15,
  targetRepsHigh: 15,
  targetRpe: 7,
  restSeconds: 60,
  tempo: "1-0-1",
  cue: "Hinge, don't squat.",
  workingWeightLb: 35,
  block: { id: "circ-1", type: "circuit" },
});

const EDGE_CASE_WORKOUT: Workout = {
  id: "edge-case-workout",
  workspaceId: PUSH_WORKOUT.workspaceId,
  name: "Full-Body Edge Cases",
  dayOfWeek: "Wednesday",
  focus: "Coverage of every real, currently-unexercised legacy field",
  estimatedDurationMin: 70,
  warmupOverview: "5 minutes easy cardio.",
  coachNote: "Exercises this adapter's less-common but real legacy fields.",
  exercises: [
    BODYWEIGHT_PUSHUP,
    EXERCISE_WITH_SUBSTITUTE,
    EXERCISE_WITH_WARMUP_INSTRUCTION,
    SUPERSET_A,
    SUPERSET_B,
    CIRCUIT_A,
    CIRCUIT_B,
  ],
};

check("a bodyweight exercise (no prescribed load) converts with prescription.load left undefined, never fabricated", () => {
  const session = legacyWorkoutToSession(EDGE_CASE_WORKOUT);
  const item = session.blocks.flatMap((b) => b.items).find((i) => i.id === "bodyweight-pushup")!;
  assert.equal(item.prescription.load, undefined);
});

check("approvedSubstituteExerciseId round-trips exactly", () => {
  const session = legacyWorkoutToSession(EDGE_CASE_WORKOUT);
  const item = session.blocks.flatMap((b) => b.items).find((i) => i.id === "barbell-row")!;
  assert.equal(item.substituteItemId, "bodyweight-pushup");
  const reconstructed = sessionToLegacyWorkout(session, { workspaceId: EDGE_CASE_WORKOUT.workspaceId, dayOfWeek: EDGE_CASE_WORKOUT.dayOfWeek });
  const reconstructedExercise = reconstructed!.exercises.find((e) => e.id === "barbell-row")!;
  assert.equal(reconstructedExercise.approvedSubstituteExerciseId, "bodyweight-pushup");
});

check("warmupInstruction round-trips exactly", () => {
  const session = legacyWorkoutToSession(EDGE_CASE_WORKOUT);
  const item = session.blocks.flatMap((b) => b.items).find((i) => i.id === "overhead-press")!;
  assert.equal(item.prescription.warmupInstruction, "Two light feeler sets before your first working set — no need to log them.");
  const reconstructed = sessionToLegacyWorkout(session, { workspaceId: EDGE_CASE_WORKOUT.workspaceId, dayOfWeek: EDGE_CASE_WORKOUT.dayOfWeek });
  const reconstructedExercise = reconstructed!.exercises.find((e) => e.id === "overhead-press")!;
  assert.equal(reconstructedExercise.warmupInstruction, "Two light feeler sets before your first working set — no need to log them.");
});

check("two exercises sharing a superset block id convert into ONE Block with two items, in order", () => {
  const session = legacyWorkoutToSession(EDGE_CASE_WORKOUT);
  const supersetBlock = session.blocks.find((b) => b.id === "sup-1")!;
  assert.equal(supersetBlock.kind, "superset");
  assert.deepEqual(
    supersetBlock.items.map((i) => i.id),
    ["superset-curl", "superset-pressdown"]
  );
});

check("two exercises sharing a circuit block id convert into ONE Block with two items, in order", () => {
  const session = legacyWorkoutToSession(EDGE_CASE_WORKOUT);
  const circuitBlock = session.blocks.find((b) => b.id === "circ-1")!;
  assert.equal(circuitBlock.kind, "circuit");
  assert.deepEqual(
    circuitBlock.items.map((i) => i.id),
    ["circuit-squat", "circuit-swing"]
  );
});

check("the full edge-case workout (bodyweight + substitute + warmup instruction + superset + circuit) round-trips losslessly", () => {
  const session = legacyWorkoutToSession(EDGE_CASE_WORKOUT);
  validateSession(session, "edge-case adapter output");
  const reconstructed = sessionToLegacyWorkout(session, { workspaceId: EDGE_CASE_WORKOUT.workspaceId, dayOfWeek: EDGE_CASE_WORKOUT.dayOfWeek });
  assert.ok(reconstructed, "the edge-case workout uses only legacy-representable universal capabilities");
  assertWorkoutRoundTripEquivalent(EDGE_CASE_WORKOUT, reconstructed!);
});

// ---------------------------------------------------------------------------
// 3. Reverse-compatibility rejections — universal capabilities legacy has
//    nowhere to store must return null, never a lossy best-effort flatten.
// ---------------------------------------------------------------------------

console.log("\n3. Universal capabilities with no legacy equivalent are rejected, never flattened\n");

function minimalResistanceSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    name: "Session",
    focus: "Focus",
    estimatedDurationMin: 45,
    blocks: [
      {
        id: "block-1",
        kind: "straight",
        order: 1,
        items: [
          {
            id: "item-1",
            order: 1,
            name: "Back Squat",
            category: "resistance",
            prescription: { family: "resistance", sets: 3, reps: { low: 5, high: 5 }, rpe: 8, restSeconds: 120 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

check("a continuous-work session (test requirement G) returns null, never a fabricated legacy Exercise", () => {
  const session = minimalResistanceSession({
    blocks: [
      {
        id: "block-1",
        kind: "straight",
        order: 1,
        items: [
          {
            id: "item-1",
            order: 1,
            name: "Zone 2 Run",
            category: "continuous",
            prescription: { family: "continuous", duration: { seconds: 1800 }, heartRate: { low: 135, high: 150 } },
          },
        ],
      },
    ],
  });
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason!, /category "continuous"/);
  assert.equal(sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: "Monday" }), null);
});

check("an interval block with rounds/work/recovery (test requirement H) returns null", () => {
  const session = minimalResistanceSession({
    blocks: [
      {
        id: "block-intervals",
        kind: "interval",
        order: 1,
        rounds: 6,
        restBetweenRoundsSeconds: 90,
        items: [
          {
            id: "item-400m",
            order: 1,
            name: "400m",
            category: "interval",
            prescription: { family: "interval", distance: { value: 400, unit: "m" }, workInterval: { seconds: 95 }, recoveryInterval: { seconds: 90 } },
          },
        ],
      },
    ],
  });
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason!, /kind "interval"/);
  assert.equal(sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: "Monday" }), null);
});

check("a circuit block carrying rounds/rest-between-rounds (test requirement I) returns null — grouping alone isn't enough, the round structure would be lost", () => {
  const session = minimalResistanceSession({
    blocks: [
      {
        id: "block-circuit",
        kind: "circuit",
        order: 1,
        rounds: 5,
        restBetweenRoundsSeconds: 60,
        timeCapSeconds: 1200,
        items: [
          { id: "item-kb-swing", order: 1, name: "KB Swing", category: "resistance", prescription: { family: "resistance", reps: { low: 15, high: 15 }, rpe: 7, sets: 1, restSeconds: 0 } },
          { id: "item-box-step", order: 2, name: "Box Step-up", category: "resistance", prescription: { family: "resistance", reps: { low: 10, high: 10 }, rpe: 7, sets: 1, restSeconds: 0 } },
        ],
      },
    ],
  });
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason!, /rounds/);
  assert.equal(sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: "Monday" }), null);
});

check("a hybrid multi-block session with an incompatible warmup/cooldown block (test requirement J) returns null", () => {
  const session: Session = {
    id: "session-hybrid",
    name: "Athletic Performance",
    focus: "Power + conditioning",
    estimatedDurationMin: 90,
    blocks: [
      {
        id: "block-warmup",
        kind: "warmup",
        order: 1,
        items: [
          {
            id: "item-dynamic-warmup",
            order: 1,
            name: "Dynamic Warm-up Flow",
            category: "quality",
            prescription: { family: "quality", duration: { seconds: 480 } },
          },
        ],
      },
      {
        id: "block-strength",
        kind: "straight",
        order: 2,
        items: [
          {
            id: "item-trap-bar-deadlift",
            order: 2,
            name: "Trap Bar Deadlift",
            category: "resistance",
            prescription: { family: "resistance", sets: 4, reps: { low: 3, high: 3 }, load: { value: 275, unit: "lb" }, rpe: 8, restSeconds: 150 },
          },
        ],
      },
    ],
  };
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason!, /kind "warmup"/);
  assert.equal(sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: "Monday" }), null);
});

check("RIR (a genuine universal-only capability, no legacy field) is rejected rather than silently dropped", () => {
  const session = minimalResistanceSession({
    blocks: [
      {
        id: "block-1",
        order: 1,
        kind: "straight",
        items: [
          {
            id: "item-1",
            order: 1,
            name: "Squat",
            category: "resistance",
            prescription: { family: "resistance", sets: 3, reps: { low: 5, high: 5 }, rir: 2, restSeconds: 120 },
          },
        ],
      },
    ],
  });
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason!, /RIR/);
});

check("a kg-denominated load (legacy is pounds-only) is rejected rather than silently converted", () => {
  const session = minimalResistanceSession({
    blocks: [
      {
        id: "block-1",
        order: 1,
        kind: "straight",
        items: [
          {
            id: "item-1",
            order: 1,
            name: "Squat",
            category: "resistance",
            prescription: { family: "resistance", sets: 3, reps: { low: 5, high: 5 }, rpe: 8, restSeconds: 120, load: { value: 140, unit: "kg" } },
          },
        ],
      },
    ],
  });
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason!, /pounds-only/);
});

check("a genuinely legacy-compatible session (E: optional fields absent) still converts successfully — rejection is specific, not overbroad", () => {
  const session = minimalResistanceSession();
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, true);
  const reconstructed = sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: "Monday" });
  assert.ok(reconstructed);
  assert.equal(reconstructed!.exercises[0].warmupSets, 0, "an absent warmupSets defaults honestly to 0, matching lib/coach/training.ts's own createEmptyExercise default");
  assert.equal(reconstructed!.exercises[0].tempo, "", "an absent tempo defaults honestly to empty string, matching lib/coach/training.ts's own createEmptyExercise default");
  assert.equal(reconstructed!.exercises[0].cue, "");
});

// ---------------------------------------------------------------------------
// 4. Adapter hygiene — purity, no mutation, no magic coercion
// ---------------------------------------------------------------------------

console.log("\n4. Adapter hygiene\n");

check("sessionToLegacyWorkout never mutates the source Session/Block/TrainingItemInstance objects (test requirement K)", () => {
  const session = minimalResistanceSession();
  const before = structuredClone(session);
  sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: "Monday" });
  assert.deepEqual(session, before);
});

check("checkSessionLegacyCompatibility on a Session missing required prescription fields is not magically coerced (test requirement M) — it is reported as incompatible with a specific reason, not silently defaulted", () => {
  const session = minimalResistanceSession({
    blocks: [
      {
        id: "block-1",
        order: 1,
        kind: "straight",
        items: [
          // no sets, no reps, no rpe, no restSeconds at all -- structurally
          // valid per the Phase 1 grammar (every Prescription field beyond
          // `family` is optional) but nowhere near enough to build a real
          // legacy Exercise (which requires all of them).
          { id: "item-1", order: 1, name: "Mystery Movement", category: "resistance", prescription: { family: "resistance" } },
        ],
      },
    ],
  });
  const compatibility = checkSessionLegacyCompatibility(session);
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason!, /no prescribed working sets/);
  assert.equal(sessionToLegacyWorkout(session, { workspaceId: PUSH_WORKOUT.workspaceId, dayOfWeek: "Monday" }), null);
});

check("legacyWorkoutToSession throws UnsupportedLegacyWorkoutError (never returns a partial Session) for a draft/unusable exercise", () => {
  const draftWorkout: Workout = {
    ...PUSH_WORKOUT,
    id: "draft-workout",
    exercises: [
      {
        id: "unusable",
        order: 1,
        name: "",
        warmupSets: 0,
        workingSets: 0,
        targetRepsLow: 0,
        targetRepsHigh: 0,
        targetRpe: 8,
        restSeconds: 0,
        tempo: "",
        cue: "",
        previousPerformance: [],
        prescribedSets: [],
      },
    ],
  };
  assert.throws(() => legacyWorkoutToSession(draftWorkout), UnsupportedLegacyWorkoutError);
});

check("legacyWorkoutToSession throws for a Workout with zero exercises (an authoring placeholder, not real content)", () => {
  const emptyWorkout: Workout = { ...PUSH_WORKOUT, id: "empty-workout", exercises: [] };
  assert.throws(() => legacyWorkoutToSession(emptyWorkout), UnsupportedLegacyWorkoutError);
});

check("legacyWorkoutToSession throws for an exercise whose prescribedSets disagree with its own summary fields (hand-varied data this adapter does not support)", () => {
  const inconsistent: Workout = {
    ...PUSH_WORKOUT,
    id: "inconsistent-workout",
    exercises: [
      {
        ...PUSH_WORKOUT.exercises[0],
        prescribedSets: PUSH_WORKOUT.exercises[0].prescribedSets.slice(0, 1), // truncated -- disagrees with warmupSets/workingSets
      },
    ],
  };
  assert.throws(() => legacyWorkoutToSession(inconsistent), UnsupportedLegacyWorkoutError);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
