// Phase 11B — circuit/grouped-training execution verification. Proves the
// universal Session/Block/TrainingItemInstance/Prescription engine
// natively supports a repeated, multi-item circuit BLOCK — round/item
// state machine, per-item repeated round actuals, timer-free deterministic
// transitions, safety integration — without corrupting resistance
// (lib/workout/verify-workout-flow.mts's 67 tests), continuous
// (lib/workout/verify-continuous-execution.mts's 25), or interval
// (lib/workout/verify-interval-execution.mts's 34) execution, still
// exhaustively covered elsewhere, unchanged. Maps onto the Phase 11B spec's
// own required test matrix (section 45, A-AE) and required acceptance
// cases (section 39-44), noted per section below.
// Run with: npm run verify:circuit-execution

import assert from "node:assert/strict";
import { createInitialState, reducer, buildStartedWorkoutSession } from "../state.ts";
import { validateSession } from "../production/validation.ts";
import { buildWorkoutSummary } from "../workout-analysis.ts";
import { projectTrainingDayObservations } from "../signals/project-training-day.ts";
import { findTrainingItemById, isCircuitBlock } from "./session-flow.ts";
import { moveTrainingItem } from "../training/program-proposal-editing.ts";
import {
  circuitItemPerformedAsPrescribed,
  classifyCircuitCompletion,
  classifyCircuitItemCompletion,
  completedCircuitRounds,
  describeCircuitItemTarget,
  describeCircuitOverview,
  hasRichCircuitCapture,
  nextCircuitPosition,
  totalCircuitRounds,
} from "./circuit.ts";
import {
  BASIC_CIRCUIT_SESSION_DEMO,
  MIXED_SESSION_WITH_CIRCUIT_DEMO,
  MIXED_SESSION_WITH_INTERVALS_DEMO,
  MIXED_SESSION_DEMO,
  CONTINUOUS_BIKE_SESSION_DEMO,
} from "../training/demo-fixtures.ts";
import type { AppState } from "../state.ts";
import type { Session, UniversalTrainingProgramContent } from "../training/types.ts";

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

function startFromFixture(trainingSession: Session): AppState {
  const base = createInitialState();
  return {
    ...base,
    workoutSession: buildStartedWorkoutSession({
      existingSession: base.workoutSession,
      workoutId: trainingSession.id,
      resolvedWorkout: null,
      trainingSession,
      nowIso: "2026-01-01T00:00:00.000Z",
    }),
  };
}

const CIRCUIT_BLOCK = BASIC_CIRCUIT_SESSION_DEMO.blocks[0];

// ---------------------------------------------------------------------------
// A, B, C, D, E, F, G, H, I — circuit fixtures validate; straight/superset/
// interval blocks unaffected; mixed-family circuits are valid.
// ---------------------------------------------------------------------------

console.log("\n1. Circuit fixtures validate against the universal grammar; other block kinds unaffected (A-I)\n");

check("A: the basic circuit fixture (mixed resistance+continuous items) validates", () => {
  validateSession(BASIC_CIRCUIT_SESSION_DEMO, "basic circuit fixture");
});

check("D: a straight resistance block is completely unaffected — still validates and executes as before", () => {
  validateSession(MIXED_SESSION_DEMO, "mixed session fixture (straight blocks)");
});

check("F: an interval block is completely unaffected by circuit support existing", () => {
  validateSession(MIXED_SESSION_WITH_INTERVALS_DEMO, "mixed session with intervals fixture");
});

check("G: a circuit item may be a real resistance item", () => {
  const item = CIRCUIT_BLOCK.items.find((i) => i.id === "circuit-goblet-squat")!;
  assert.equal(item.prescription.family, "resistance");
});

check("H: a circuit item may be a real continuous item", () => {
  const item = CIRCUIT_BLOCK.items.find((i) => i.id === "circuit-bike")!;
  assert.equal(item.prescription.family, "continuous");
});

check("I: a mixed-family circuit (resistance + resistance + continuous) is structurally valid", () => {
  const families = CIRCUIT_BLOCK.items.map((i) => i.prescription.family);
  assert.deepEqual(families, ["resistance", "resistance", "continuous"]);
});

check("the mixed session with a real circuit block validates", () => {
  validateSession(MIXED_SESSION_WITH_CIRCUIT_DEMO, "mixed session with circuit fixture");
});

// ---------------------------------------------------------------------------
// Pure lib/workout/circuit.ts state-machine/formatter coverage.
// ---------------------------------------------------------------------------

console.log("\n2. Pure circuit state machine and formatters\n");

check("J/K: nextCircuitPosition advances item-by-item within a round", () => {
  const afterItem0 = nextCircuitPosition(CIRCUIT_BLOCK, { round: 1, itemIndex: 0, phase: "item" });
  assert.deepEqual(afterItem0, { round: 1, itemIndex: 1, phase: "item" });
  const afterItem1 = nextCircuitPosition(CIRCUIT_BLOCK, { round: 1, itemIndex: 1, phase: "item" });
  assert.deepEqual(afterItem1, { round: 1, itemIndex: 2, phase: "item" });
});

check("L: the final item in a round transitions to round-rest, never straight to the next round's item", () => {
  const afterLastItem = nextCircuitPosition(CIRCUIT_BLOCK, { round: 1, itemIndex: 2, phase: "item" });
  assert.deepEqual(afterLastItem, { round: 1, itemIndex: 2, phase: "round-rest" });
});

check("M: round-rest finishing moves to the next round's first item", () => {
  const afterRest = nextCircuitPosition(CIRCUIT_BLOCK, { round: 1, itemIndex: 2, phase: "round-rest" });
  assert.deepEqual(afterRest, { round: 2, itemIndex: 0, phase: "item" });
});

check("N: the final item of the FINAL round -> complete directly (never a pointless final round-rest)", () => {
  const result = nextCircuitPosition(CIRCUIT_BLOCK, { round: 3, itemIndex: 2, phase: "item" });
  assert.equal(result, "complete");
});

check("totalCircuitRounds defaults honestly to 1 for a malformed/missing rounds value, never crashes", () => {
  assert.equal(totalCircuitRounds({ ...CIRCUIT_BLOCK, rounds: undefined }), 1);
  assert.equal(totalCircuitRounds({ ...CIRCUIT_BLOCK, rounds: 0 }), 1);
});

check("isCircuitBlock requires BOTH kind='circuit' AND a real positive rounds count", () => {
  assert.equal(isCircuitBlock(CIRCUIT_BLOCK), true);
  assert.equal(isCircuitBlock({ ...CIRCUIT_BLOCK, rounds: undefined }), false, "no rounds -> not treated as a repeating circuit");
  assert.equal(isCircuitBlock({ ...CIRCUIT_BLOCK, kind: "superset" }), false, "E: a superset (kind changed, rounds still set) is never treated as a circuit");
});

check("W: describeCircuitOverview is human-readable, never raw JSON", () => {
  const lines = describeCircuitOverview(CIRCUIT_BLOCK);
  assert.deepEqual(lines, ["3 rounds", "1. Goblet Squat — 12 reps, 35 lb", "2. Push-Up — 15 reps", "3. Assault Bike — 30 sec", "90 sec between rounds"]);
});

check("describeCircuitItemTarget never fabricates a resistance set count — the circuit's own rounds are the repetition (spec section 10)", () => {
  const squat = CIRCUIT_BLOCK.items.find((i) => i.id === "circuit-goblet-squat")!;
  assert.equal(describeCircuitItemTarget(squat), "12 reps, 35 lb");
  assert.doesNotMatch(describeCircuitItemTarget(squat), /set/i);
});

check("hasRichCircuitCapture is true for resistance/continuous, false for a deferred family (interval-in-circuit, spec section 21)", () => {
  assert.equal(hasRichCircuitCapture({ family: "resistance" }), true);
  assert.equal(hasRichCircuitCapture({ family: "continuous" }), true);
  assert.equal(hasRichCircuitCapture({ family: "interval" }), false);
});

// ---------------------------------------------------------------------------
// 39 — full basic circuit completion (required acceptance case).
// ---------------------------------------------------------------------------

console.log("\n3. Full basic circuit completion — 3 rounds, all items, all rounds (39)\n");

check("starting the circuit session lands on circuit-ready, never a flat per-item queue", () => {
  const state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "circuit-ready");
  assert.equal(state.workoutSession.currentExerciseId, "block-full-body-circuit", "the BLOCK id occupies the queue slot, not any one item's id");
  assert.deepEqual(state.workoutSession.exerciseQueue, ["block-full-body-circuit"], "one queue slot for the whole circuit, never 3");
});

check("BEGIN_CIRCUIT_EXECUTION opens round 1, item 0", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  assert.equal(state.workoutSession.phase, "circuit-active");
  const progress = state.workoutSession.circuitProgress?.["block-full-body-circuit"];
  assert.ok(progress);
  assert.equal(progress!.round, 1);
  assert.equal(progress!.itemIndex, 0);
  assert.equal(progress!.phase, "item");
  assert.deepEqual(progress!.exposuresByItemId, {});
});

check("walking through all 3 rounds x 3 items resolves the whole circuit and advances the session, with 3 real per-item round actuals each (J-N, O)", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });

  for (let round = 1; round <= 3; round++) {
    // Item 1: Goblet Squat.
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
    // Item 2: Push-Up.
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
    // Item 3: Bike (final item in the round).
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });

    if (round < 3) {
      assert.equal(state.workoutSession.phase, "circuit-active", `round ${round}: still active after the round's final item`);
      assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.phase, "round-rest", `round ${round}: round-rest entered`);
      // M: round-rest -> next round's first item.
      state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" });
      assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.round, round + 1);
      assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.itemIndex, 0);
      assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.phase, "item");
    } else {
      // N: the final item of the final round auto-finalizes and advances —
      // no separate "circuit-logging" step, unlike interval.
      assert.equal(state.workoutSession.phase, "session-summary", "the only block resolved -> straight to summary");
    }
  }

  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"], undefined, "transient progress cleared once finalized");

  for (const [itemId, expectedActuals] of [
    ["circuit-goblet-squat", 3],
    ["circuit-push-up", 3],
    ["circuit-bike", 3],
  ] as const) {
    const execution = state.workoutSession.continuousExecutions?.[itemId];
    assert.ok(execution, `${itemId} must have a real ExecutionRecord`);
    assert.equal(execution!.status, "completed");
    assert.equal(execution!.performedAsPrescribed, true);
    assert.equal(execution!.circuitRoundActuals?.length, expectedActuals, "O: 3 real per-round actuals preserved");
    assert.equal(state.workoutSession.exerciseLogs[itemId].status, "completed");
  }

  const item = findTrainingItemById(state.workoutSession.resolvedSession, "circuit-goblet-squat")!;
  assert.equal(item.prescription.reps?.low, 12, "the ORIGINAL prescription is never mutated to reflect what happened");
});

check("buildWorkoutSummary correctly counts a circuit's RESISTANCE items as completed (they carry zero loggedSets, unlike a standalone resistance exercise — must route through the circuit-aware branch, not silently read as 0 working sets)", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  for (let round = 1; round <= 3; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });
    if (round < 3) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" });
  }
  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:20:00.000Z");
  assert.equal(summary.exercisesCompleted, 3, "all 3 circuit items (2 resistance + 1 continuous) counted, not silently dropped");
  assert.equal(summary.workingSetsCompleted, 0, "circuit exposures are never miscounted as resistance working sets — they use a different logging model entirely (spec section 10)");
  assert.equal(summary.fullyCompleted, true);
  assert.match(summary.detail, /Goblet Squat: 3 rounds completed/);
});

// ---------------------------------------------------------------------------
// 40 — mixed actuals: distinct per-round values, never collapsed.
// ---------------------------------------------------------------------------

console.log("\n4. Mixed per-round actuals — distinct values retained, never collapsed (40, O)\n");

check("a resistance item that performed differently each round (12, 12, 9 reps) retains all three distinct round actuals", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });

  const squatReps = [12, 12, 9];
  for (let round = 1; round <= 3; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: squatReps[round - 1], high: squatReps[round - 1] } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });
    if (round < 3) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" });
  }

  const execution = state.workoutSession.continuousExecutions?.["circuit-goblet-squat"];
  assert.ok(execution);
  const actualReps = execution!.circuitRoundActuals!.map((r) => r.actual?.reps?.low);
  assert.deepEqual(actualReps, [12, 12, 9], "no collapse into one fake single value — each round's own real actual preserved");
});

// ---------------------------------------------------------------------------
// 41 — partial: 2 full rounds, then 2 of 3 items in round 3, then stop.
// ---------------------------------------------------------------------------

console.log("\n5. Partial circuit — 2 full rounds + 2 of 3 items in round 3, then stop (41, P)\n");

check("stopping mid-round-3 via whole-circuit skip preserves exactly 2 completed rounds, a truthful partial round 3, and no fabricated round 4", () => {
  const fourRoundCircuit = { ...BASIC_CIRCUIT_SESSION_DEMO, blocks: [{ ...CIRCUIT_BLOCK, rounds: 4 }] };
  let state = startFromFixture(fourRoundCircuit);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });

  for (let round = 1; round <= 2; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" }); // round-rest -> next round
  }
  // Round 3: 2 of 3 items, then stop.
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.round, 3);
  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.itemIndex, 2, "on the 3rd item (bike), not yet resolved");

  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "block-full-body-circuit", reason: "schedule-conflict", note: "Had to leave." });

  assert.equal(state.workoutSession.phase, "session-summary");
  const squatExec = state.workoutSession.continuousExecutions!["circuit-goblet-squat"];
  const pushupExec = state.workoutSession.continuousExecutions!["circuit-push-up"];
  const bikeExec = state.workoutSession.continuousExecutions!["circuit-bike"];
  assert.equal(squatExec.circuitRoundActuals?.length, 3, "P: squat done in all 3 attempted rounds (1, 2, 3)");
  assert.equal(pushupExec.circuitRoundActuals?.length, 3, "push-up done in all 3 attempted rounds");
  assert.equal(bikeExec.circuitRoundActuals?.length, 2, "bike only done in rounds 1-2 — round 3's bike never fabricated");
  assert.equal(squatExec.status, "partial");
  assert.equal(bikeExec.status, "partial");
  assert.equal(classifyCircuitCompletion(fourRoundCircuit.blocks[0], { "circuit-goblet-squat": squatExec.circuitRoundActuals!, "circuit-push-up": pushupExec.circuitRoundActuals!, "circuit-bike": bikeExec.circuitRoundActuals! }), "partial");
  assert.equal(completedCircuitRounds(fourRoundCircuit.blocks[0], { "circuit-goblet-squat": squatExec.circuitRoundActuals!, "circuit-push-up": pushupExec.circuitRoundActuals!, "circuit-bike": bikeExec.circuitRoundActuals! }), 2, "exactly 2 rounds where EVERY item completed — never Round 2 fabricated as more, never Round 4 fabricated at all");
});

// ---------------------------------------------------------------------------
// 42 — skip one item within a round; circuit continues honestly.
// ---------------------------------------------------------------------------

console.log("\n6. Skip one item within a round; circuit continues (42, Q)\n");

check("skipping ONE item exposure (e.g. bike in round 2) preserves that exposure as skipped, distinctly, and the circuit continues to round 3", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });

  // Round 1: all completed.
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" });
  // Round 2: squat + push-up completed, bike SKIPPED (no bike access).
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", skipped: true, skipReason: "equipment-unavailable" });
  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.phase, "round-rest", "the circuit continues into round-rest, never halting on one skipped item");
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" });
  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.round, 3, "R: other rounds unaffected — round 3 proceeds normally");
  // Round 3: all completed.
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });

  const bikeExec = state.workoutSession.continuousExecutions!["circuit-bike"];
  assert.equal(bikeExec.circuitRoundActuals?.length, 3);
  assert.equal(bikeExec.circuitRoundActuals?.[1]?.status, "skipped", "round 2's bike exposure preserved as skipped, distinctly");
  assert.equal(bikeExec.circuitRoundActuals?.[1]?.skipReason, "equipment-unavailable");
  assert.equal(bikeExec.circuitRoundActuals?.[0]?.status, "completed", "round 1's bike unaffected by round 2's skip");
  assert.equal(bikeExec.circuitRoundActuals?.[2]?.status, "completed", "round 3's bike unaffected by round 2's skip");
  assert.equal(bikeExec.status, "partial", "one skipped exposure means the item as a whole is honestly partial, never silently 'completed'");
});

// ---------------------------------------------------------------------------
// 15, R — whole-circuit skip (from ready, and mid-circuit).
// ---------------------------------------------------------------------------

console.log("\n7. Whole-circuit skip — before starting, and mid-circuit (15, R)\n");

check("skipping the whole circuit BEFORE starting it creates no execution records at all — a plain skip, exactly like continuous/interval", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "block-full-body-circuit", reason: "feeling-sick" });
  for (const itemId of ["circuit-goblet-squat", "circuit-push-up", "circuit-bike"]) {
    assert.equal(state.workoutSession.exerciseLogs[itemId].status, "skipped");
    assert.equal(state.workoutSession.exerciseLogs[itemId].skipReason, "feeling-sick");
    assert.equal(state.workoutSession.continuousExecutions?.[itemId], undefined);
  }
  assert.equal(state.workoutSession.phase, "session-summary");
});

check("skipping the whole circuit MID-round (round 2, item 1 in progress) preserves round 1's completed work as a real partial record per item", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  // Round 1: all 3 items completed.
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" }); // round-rest -> round 2 begins
  // Round 2: squat and push-up done, bike (item 2) not yet reached.
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.itemIndex, 2, "sitting on bike, round 2, not yet resolved");

  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "block-full-body-circuit", reason: "out-of-time" });

  const squatExec = state.workoutSession.continuousExecutions?.["circuit-goblet-squat"];
  assert.ok(squatExec, "round 1 AND round 2's completed squat must not be silently lost");
  assert.equal(squatExec.circuitRoundActuals?.length, 2, "rounds 1 and 2 both preserved");
  assert.equal(squatExec.status, "partial", "2 of 3 prescribed rounds — honestly partial, never 'completed'");
  const bikeExec = state.workoutSession.continuousExecutions?.["circuit-bike"];
  assert.ok(bikeExec, "round 1's completed bike must not be silently lost either");
  assert.equal(bikeExec.circuitRoundActuals?.length, 1, "only round 1 — round 2's bike was never reached, never fabricated");
  assert.equal(bikeExec.status, "partial");
  assert.equal(state.workoutSession.exerciseLogs["circuit-bike"].status, "skipped");
  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"], undefined);
});

// ---------------------------------------------------------------------------
// 16, 43, S — pain preserves prior work, blocks progression, never
// silently continues.
// ---------------------------------------------------------------------------

console.log("\n8. Pain during a circuit item preserves prior work and blocks progression (16, 43, S)\n");

function reportPain(state: AppState, exerciseId: string, overrides: Partial<{ ratingZeroToTen: number; continuedAfterSet: boolean; affectsOutsideGym: boolean }> = {}): AppState {
  return reducer(state, {
    type: "REPORT_PAIN",
    exerciseId,
    location: "Shoulder",
    ratingZeroToTen: overrides.ratingZeroToTen ?? 6,
    onset: "During the push-up",
    causedByMovement: "Pressing",
    continuedAfterSet: overrides.continuedAfterSet ?? false,
    affectsOutsideGym: overrides.affectsOutsideGym ?? false,
    symptomQuality: "aching",
  });
}

check("reporting pain mid-circuit blocks ADVANCE_CIRCUIT_PHASE and preserves the round already completed", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  assert.equal(state.workoutSession.circuitProgress?.["block-full-body-circuit"]?.itemIndex, 1);

  // Pain reported on the CURRENT item (push-up) — the real circuit item's
  // own id, never the block id (spec: client always knows current activity).
  state = reportPain(state, "circuit-push-up", { ratingZeroToTen: 6 });
  assert.equal(state.workoutSession.phase, "pain-review");

  const blocked = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
  assert.equal(blocked.workoutSession.phase, "pain-review", "must never silently continue the circuit");
  assert.equal(blocked.workoutSession.circuitProgress?.["block-full-body-circuit"]?.itemIndex, 1, "no accidental advancement");
  assert.equal(Object.keys(blocked.workoutSession.circuitProgress?.["block-full-body-circuit"]?.exposuresByItemId ?? {}).length, 1, "the completed squat exposure survives, untouched");
});

check("a resume-eligible (mild) pain report resumes DIRECTLY into circuit-active at the same round/item, never discarding progress", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });

  state = reportPain(state, "circuit-push-up", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  assert.equal(state.workoutSession.activePainInterruption?.severity, "resume-eligible");

  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });

  assert.equal(state.workoutSession.phase, "circuit-active", "resumes directly into the live circuit flow, never a stuck pain-review screen");
  assert.equal(state.workoutSession.activePainInterruption, null);
  const progress = state.workoutSession.circuitProgress?.["block-full-body-circuit"];
  assert.equal(progress?.itemIndex, 1, "exactly where the client left off (push-up)");
  assert.equal(Object.keys(progress?.exposuresByItemId ?? {}).length, 1, "round 1's completed squat survived the interruption untouched");
});

// ---------------------------------------------------------------------------
// H, V — mixed session: warm-up -> resistance -> circuit -> interval ->
// cooldown, one universal engine.
// ---------------------------------------------------------------------------

console.log("\n9. Mixed session: warm-up -> resistance -> circuit -> interval -> cooldown (22, 44, V)\n");

check("the mixed session starts on the warm-up's own continuous-ready phase, in authored block order", () => {
  const state = startFromFixture(MIXED_SESSION_WITH_CIRCUIT_DEMO);
  assert.equal(state.workoutSession.currentExerciseId, "warmup-row");
  assert.equal(state.workoutSession.phase, "continuous-ready");
});

check("walking warm-up -> resistance -> circuit -> interval -> cooldown completes the whole mixed session through ONE universal engine", () => {
  let state = startFromFixture(MIXED_SESSION_WITH_CIRCUIT_DEMO);

  // Warm-up (continuous).
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "warmup-row", actual: { duration: { seconds: 300 } } });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "exercise-intro");

  // Resistance.
  state = reducer(state, { type: "BEGIN_EXERCISE" });
  assert.equal(state.workoutSession.phase, "exercise-warmup");
  state = reducer(state, { type: "ADVANCE_EXERCISE_WARMUP" });
  for (const setNumber of [2, 3, 4]) {
    state = reducer(state, { type: "LOG_SET", exerciseId: "bench-press-circuit-mixed", setNumber, isWarmup: false, weightLb: 135, reps: 7, rpe: 8, performedAsPrescribed: true });
    state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
  }
  assert.equal(state.workoutSession.currentExerciseId, "block-circuit-mixed");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "circuit-ready", "V: circuit is a distinct block behavior, never falling through to a flat item queue");

  // Circuit (2 rounds, per the mixed fixture).
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-circuit-mixed" });
  for (let round = 1; round <= 2; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-mixed", actual: { reps: { low: 12, high: 12 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-mixed", actual: { reps: { low: 15, high: 15 } } });
    if (round < 2) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-mixed" });
  }
  assert.equal(state.workoutSession.currentExerciseId, "interval-finisher-mixed");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "interval-ready", "the interval finisher is unaffected by the circuit existing earlier in the same session");

  // Interval finisher (4 rounds).
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "interval-finisher-mixed" });
  for (let round = 1; round <= 4; round++) {
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "interval-finisher-mixed", actualSeconds: 20 });
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "interval-finisher-mixed" });
  }
  state = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "interval-finisher-mixed" });
  assert.equal(state.workoutSession.currentExerciseId, "cooldown-walk-circuit-mixed");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "continuous-ready");

  // Cooldown (continuous).
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "cooldown-walk-circuit-mixed", actual: { duration: { seconds: 300 } } });
  assert.equal(state.workoutSession.phase, "session-summary", "session advancement correctly reaches the end after all 5 blocks");

  // H — each family's own data stayed correctly associated, never
  // cross-contaminated.
  assert.equal(state.workoutSession.exerciseLogs["bench-press-circuit-mixed"].loggedSets.length, 3);
  assert.ok(state.workoutSession.continuousExecutions?.["circuit-mixed-squat"]?.circuitRoundActuals);
  assert.equal(state.workoutSession.continuousExecutions?.["circuit-mixed-squat"]?.circuitRoundActuals?.length, 2);
  assert.ok(state.workoutSession.continuousExecutions?.["interval-finisher-mixed"]?.roundActuals);
  assert.equal(state.workoutSession.continuousExecutions?.["interval-finisher-mixed"]?.circuitRoundActuals, undefined, "an interval item never gains circuitRoundActuals");
  assert.equal(state.workoutSession.continuousExecutions?.["warmup-row"]?.circuitRoundActuals, undefined, "a plain continuous item never gains circuitRoundActuals");

  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:55:00.000Z");
  assert.equal(summary.exercisesCompleted, 6, "all 6 items across every block count: warm-up, bench, squat, push-up (both circuit items), interval finisher, cooldown");
  assert.equal(summary.workingSetsCompleted, 3, "only the resistance item's working sets count toward this resistance-specific tally");

  const completed = reducer(state, { type: "COMPLETE_WORKOUT", summary });
  assert.equal(completed.workoutSession.status, "completed", "the full mixed session completes correctly end to end");
});

// ---------------------------------------------------------------------------
// L (test matrix), U — cross-family confusion / idempotency safety.
// ---------------------------------------------------------------------------

console.log("\n10. Cross-family confusion and duplicate-dispatch safety (test matrix, U)\n");

check("ADVANCE_CIRCUIT_PHASE on a resistance item's id (not a block id) is a safe no-op", () => {
  const state = startFromFixture(MIXED_SESSION_WITH_CIRCUIT_DEMO);
  const after = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "bench-press-circuit-mixed", actual: {} });
  assert.equal(after, state);
});

check("BEGIN_CIRCUIT_EXECUTION on a continuous item's id is a safe no-op", () => {
  const state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  const after = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "zone2-bike-solo" });
  assert.equal(after, state);
});

check("U: re-dispatching ADVANCE_CIRCUIT_PHASE for a blockId that's no longer current (already finalized/advanced) is a safe no-op — never a duplicate exposure", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "block-full-body-circuit", reason: "feeling-sick" });
  assert.equal(state.workoutSession.phase, "session-summary");
  const before = JSON.stringify(state.workoutSession);
  const after = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  assert.equal(JSON.stringify(after.workoutSession), before, "the circuit is no longer current -> exact same state, no duplicate/stray exposure");
});

check("BEGIN_CIRCUIT_EXECUTION dispatched twice in a row is idempotent — never re-anchors or discards an already-started circuit", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  const before = JSON.stringify(state.workoutSession.circuitProgress);
  const after = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  assert.equal(JSON.stringify(after.workoutSession.circuitProgress), before, "already in progress -> no-op, never resets to round 1");
});

// ---------------------------------------------------------------------------
// B/C — malformed circuit content rejected (matrix items B, C).
// ---------------------------------------------------------------------------

console.log("\n11. Malformed circuit content — validation guards intent (B, C)\n");

check("classifyCircuitItemCompletion/circuitItemPerformedAsPrescribed handle zero exposures honestly (never-reached item)", () => {
  assert.equal(classifyCircuitItemCompletion(3, []), "skipped");
  assert.equal(circuitItemPerformedAsPrescribed(3, []), false);
});

check("classifyCircuitItemCompletion is 'partial' for some-but-not-all rounds, 'completed' only once every round is present", () => {
  assert.equal(classifyCircuitItemCompletion(3, [{ roundNumber: 1, status: "completed" }, { roundNumber: 2, status: "completed" }]), "partial");
  assert.equal(classifyCircuitItemCompletion(3, [{ roundNumber: 1, status: "completed" }, { roundNumber: 2, status: "completed" }, { roundNumber: 3, status: "completed" }]), "completed");
});

check("B: a circuit block with zero items is rejected (generic block-level guard, applies to every block kind)", () => {
  const malformed: Session = {
    id: "malformed-circuit-empty",
    name: "Malformed",
    focus: "Malformed",
    estimatedDurationMin: 5,
    blocks: [{ id: "block-empty", kind: "circuit", order: 1, rounds: 3, items: [] }],
  };
  assert.throws(() => validateSession(malformed, "malformed empty circuit"));
});

check("C: a circuit block with an invalid (zero/negative) round count is rejected", () => {
  const malformed: Session = { ...BASIC_CIRCUIT_SESSION_DEMO, blocks: [{ ...CIRCUIT_BLOCK, rounds: 0 }] };
  assert.throws(() => validateSession(malformed, "malformed zero-round circuit"));
});

check("C: a circuit block with only ONE item (rounds set) is rejected — not a real circuit, spec section 3's 'multiple different items'", () => {
  const malformed: Session = { ...BASIC_CIRCUIT_SESSION_DEMO, blocks: [{ ...CIRCUIT_BLOCK, items: [CIRCUIT_BLOCK.items[0]] }] };
  assert.throws(() => validateSession(malformed, "malformed single-item circuit"));
});

check("a 'circuit'-kind block with NO rounds set is left alone (same posture as an equally unimplemented superset) — never rejected merely for having one item or no rounds", () => {
  const oneItemNoRounds: Session = { ...BASIC_CIRCUIT_SESSION_DEMO, blocks: [{ ...CIRCUIT_BLOCK, rounds: undefined, items: [CIRCUIT_BLOCK.items[0]] }] };
  validateSession(oneItemNoRounds, "one-item circuit-kind block, no rounds");
});

// ---------------------------------------------------------------------------
// Y (test matrix) — item reorder is safe for a REAL circuit block.
// moveTrainingItem (lib/training/program-proposal-editing.ts) already swaps
// order fields for any multi-item block generically (proven for a
// superset-shaped block in lib/training/verify-program-proposal-editing.mts's
// own "I" test) — this proves it specifically for a genuine kind:"circuit"
// block: item order swaps, the circuit's own rounds/kind/name are
// completely untouched, and isCircuitBlock stays true throughout, per spec
// section 27's "item order if current editor safely supports it" and
// section 45's "item-reorder-safe" test-matrix requirement. No separate
// circuit editor was built — this is the same moveTrainingItem every other
// block kind uses.
// ---------------------------------------------------------------------------

console.log("\n11b. Y — coach-editing item reorder is safe for a real circuit block\n");

check("Y: moveTrainingItem swaps two items' real order within a genuine kind:'circuit' block, leaving rounds/kind/name and every other item untouched", () => {
  const content: UniversalTrainingProgramContent = {
    schemaVersion: 2,
    id: "program-circuit-reorder-test",
    workspaceId: "workspace-1" as never,
    clientId: "client-1" as never,
    coachId: "coach-1" as never,
    name: "Circuit Reorder Test Program",
    durationWeeks: 1,
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayOfWeek: "Monday", type: "training", sessions: [{ ...BASIC_CIRCUIT_SESSION_DEMO, blocks: [CIRCUIT_BLOCK] }] },
          { dayOfWeek: "Tuesday", type: "rest" },
          { dayOfWeek: "Wednesday", type: "rest" },
          { dayOfWeek: "Thursday", type: "rest" },
          { dayOfWeek: "Friday", type: "rest" },
          { dayOfWeek: "Saturday", type: "rest" },
          { dayOfWeek: "Sunday", type: "rest" },
        ],
      },
    ],
    status: "draft",
    createdAtIso: "2026-09-16T00:00:00.000Z",
    updatedAtIso: "2026-09-16T00:00:00.000Z",
  } as UniversalTrainingProgramContent;

  const secondItem = [...CIRCUIT_BLOCK.items].sort((a, b) => a.order - b.order)[1];
  const moved = moveTrainingItem(content, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: CIRCUIT_BLOCK.id, itemId: secondItem.id }, "up");
  const movedBlock = moved.weeks[0].days[0].sessions![0].blocks[0];
  const sorted = [...movedBlock.items].sort((a, b) => a.order - b.order);

  assert.equal(sorted[0].id, secondItem.id, "the moved item is now first by real order");
  assert.equal(sorted.length, CIRCUIT_BLOCK.items.length, "no item was added or lost");
  assert.equal(movedBlock.rounds, CIRCUIT_BLOCK.rounds, "the circuit's own round count is untouched by an item reorder");
  assert.equal(movedBlock.kind, "circuit", "the block is still a real circuit after reordering");
  assert.equal(movedBlock.name, CIRCUIT_BLOCK.name, "the circuit's coach-owned name is untouched");
  assert.equal(isCircuitBlock(movedBlock), true, "isCircuitBlock still recognizes it as a real circuit after the edit");
  validateSession(moved.weeks[0].days[0].sessions![0], "reordered circuit session");
});

// ---------------------------------------------------------------------------
// AC (test matrix), 30 — observations remain factual.
// ---------------------------------------------------------------------------

console.log("\n12. Observation projection — circuit facts are honest, never a derived score (AC, 30)\n");

check("a completed circuit item's real round count projects as the SAME 'completed_rounds' fact interval already uses — never a fabricated 'circuit fitness score'", () => {
  let state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  for (let round = 1; round <= 3; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 15, high: 15 } } });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { duration: { seconds: 30 } } });
    if (round < 3) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit" });
  }

  const observations = projectTrainingDayObservations({
    clientProfileId: "client-1",
    workspaceId: "workspace-1",
    dateIso: "2026-01-01",
    training: {
      trainingDayType: "scheduled_workout",
      prescribedWorkoutSnapshot: null,
      sessionStatus: "completed",
      exerciseLogs: state.workoutSession.exerciseLogs,
      workingSetsCompleted: 0,
      workingSetsPrescribed: 0,
      painReports: [],
      continuousExecutions: state.workoutSession.continuousExecutions,
    },
  });

  const squatRounds = observations.find((o) => o.trainingItemInstanceId === "circuit-goblet-squat" && o.metricKey === "completed_rounds");
  assert.ok(squatRounds, "the squat's own real completed-round count must be preserved as a raw fact");
  assert.deepEqual(squatRounds!.value, { valueType: "numeric", valueNumeric: 3 });
  const squatStatus = observations.find((o) => o.trainingItemInstanceId === "circuit-goblet-squat" && o.metricKey === "exercise_status");
  assert.ok(squatStatus, "the generic exercise_status fact still fires for a circuit item, unchanged");
  assert.deepEqual(squatStatus!.value, { valueType: "categorical", valueText: "completed" });
  assert.ok(!observations.some((o) => o.metricKey.toLowerCase().includes("score") || o.metricKey.toLowerCase().includes("fitness")), "no derived circuit score of any kind");
});

// ---------------------------------------------------------------------------
// O (test matrix) — resolvedSession is never mutated.
// ---------------------------------------------------------------------------

console.log("\n13. resolvedSession is never mutated by circuit execution\n");

check("resolvedSession's own JSON is byte-identical before and after a full circuit round/finalize sequence", () => {
  const state = startFromFixture(BASIC_CIRCUIT_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.resolvedSession);
  let next = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-full-body-circuit" });
  next = reducer(next, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-full-body-circuit", actual: { reps: { low: 12, high: 12 } } });
  next = reducer(next, { type: "SKIP_EXERCISE", exerciseId: "block-full-body-circuit", reason: "feeling-sick" });
  assert.equal(JSON.stringify(next.workoutSession.resolvedSession), before);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
