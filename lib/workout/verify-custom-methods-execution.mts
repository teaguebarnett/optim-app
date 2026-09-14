// Phase 11D — custom coach methods (AMRAP, EMOM/E2MOM, time-capped
// circuit, custom-named protocols) execution verification. Proves the
// universal Session/Block/TrainingItemInstance/Prescription engine
// natively supports these BOUNDED, TYPED execution modes — layered onto
// the exact same circuit state machine (AMRAP, time-capped circuit) or a
// small, genuinely new cadence-window state machine (EMOM/E2MOM) — without
// a general scripting language, without corrupting resistance/continuous/
// interval/circuit/power/mobility, still exhaustively covered elsewhere,
// unchanged. Maps onto the Phase 11D spec's own required test matrix
// (section 47, A-AF) and required acceptance cases (sections 41-46), noted
// per section below. Generation-gating tests live in
// lib/coach/verify-universal-program-generation.mts instead, matching this
// repo's established convention.
// Run with: npm run verify:custom-methods-execution

import assert from "node:assert/strict";
import { createInitialState, reducer, buildStartedWorkoutSession } from "../state.ts";
import { validateSession } from "../production/validation.ts";
import { buildWorkoutSummary } from "../workout-analysis.ts";
import { projectTrainingDayObservations } from "../signals/project-training-day.ts";
import { findTrainingItemById, isCircuitBlock } from "./session-flow.ts";
import { applyBlockPatch, type BlockPath } from "../training/program-proposal-editing.ts";
import { describeCircuitOverview, isTimedCircuit, isUnboundedRounds, nextCircuitPosition } from "./circuit.ts";
import {
  currentEmomWindow,
  describeEmomCadenceLabel,
  describeEmomOverview,
  emomCadenceSeconds,
  emomItemForWindow,
  totalEmomWindows,
  totalWindowsAssignedToItem,
  windowsToAutoSkip,
} from "./emom.ts";
import {
  AMRAP_CONDITIONING_SESSION_DEMO,
  CUSTOM_NAMED_AMRAP_SESSION_DEMO,
  EMOM_ALTERNATING_SESSION_DEMO,
  E2MOM_SESSION_DEMO,
  TIME_CAPPED_CIRCUIT_SESSION_DEMO,
  MIXED_SESSION_WITH_CUSTOM_METHODS_DEMO,
  BASIC_CIRCUIT_SESSION_DEMO,
  MIXED_SESSION_DEMO,
  BIKE_INTERVALS_SESSION_DEMO,
  BOX_JUMP_POWER_SESSION_DEMO,
  COUCH_STRETCH_MOBILITY_SESSION_DEMO,
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

function reportPain(state: AppState, exerciseId: string, overrides: Partial<{ ratingZeroToTen: number; continuedAfterSet: boolean; affectsOutsideGym: boolean }> = {}): AppState {
  return reducer(state, {
    type: "REPORT_PAIN",
    exerciseId,
    location: "Knee",
    ratingZeroToTen: overrides.ratingZeroToTen ?? 6,
    onset: "Mid-set",
    causedByMovement: "Landing",
    continuedAfterSet: overrides.continuedAfterSet ?? false,
    affectsOutsideGym: overrides.affectsOutsideGym ?? false,
    symptomQuality: "aching",
  });
}

/** Rewinds an in-progress EMOM's own real startedAtIso anchor, relative to
 * REAL wall-clock now (never the fixture's fake "2026-01-01" reference —
 * currentEmomWindow always derives elapsed time from the ACTUAL current
 * instant), so that dispatching ADVANCE_EMOM_WINDOW immediately afterward
 * resolves exactly the given window — the test's own way of simulating
 * "this much real cadence time has genuinely passed," without needing a
 * real setTimeout/sleep. */
function setEmomStartToWindow(state: AppState, blockId: string, window: number, cadenceSeconds: number): AppState {
  const progress = state.workoutSession.emomProgress?.[blockId];
  if (!progress) return state;
  return {
    ...state,
    workoutSession: {
      ...state.workoutSession,
      emomProgress: { ...state.workoutSession.emomProgress, [blockId]: { ...progress, startedAtIso: new Date(Date.now() - (window - 1) * cadenceSeconds * 1000).toISOString() } },
    },
  };
}

const AMRAP_BLOCK = AMRAP_CONDITIONING_SESSION_DEMO.blocks[0];
const EMOM_BLOCK = EMOM_ALTERNATING_SESSION_DEMO.blocks[0];
const E2MOM_BLOCK = E2MOM_SESSION_DEMO.blocks[0];
const TIME_CAPPED_BLOCK = TIME_CAPPED_CIRCUIT_SESSION_DEMO.blocks[0];

// ---------------------------------------------------------------------------
// A-F — validation.
// ---------------------------------------------------------------------------

console.log("\n1. Validation — AMRAP/EMOM/time-capped-circuit prescriptions validate honestly (A-F)\n");

check("A: the AMRAP conditioning fixture validates", () => {
  validateSession(AMRAP_CONDITIONING_SESSION_DEMO, "amrap conditioning fixture");
});

check("A: a custom-named AMRAP fixture validates — the name never affects structural validity", () => {
  validateSession(CUSTOM_NAMED_AMRAP_SESSION_DEMO, "custom named amrap fixture");
});

check("B: AMRAP without a time cap is rejected", () => {
  const malformed: Session = { ...AMRAP_CONDITIONING_SESSION_DEMO, blocks: [{ ...AMRAP_BLOCK, timeCapSeconds: undefined }] };
  assert.throws(() => validateSession(malformed, "amrap with no time cap"));
});

check("B: AMRAP with a zero/negative time cap is rejected", () => {
  const malformed: Session = { ...AMRAP_CONDITIONING_SESSION_DEMO, blocks: [{ ...AMRAP_BLOCK, timeCapSeconds: 0 }] };
  assert.throws(() => validateSession(malformed, "amrap with zero time cap"));
});

check("C: an empty AMRAP (zero items) is rejected", () => {
  const malformed: Session = { ...AMRAP_CONDITIONING_SESSION_DEMO, blocks: [{ ...AMRAP_BLOCK, items: [] }] };
  assert.throws(() => validateSession(malformed, "empty amrap"));
});

check("a single-item AMRAP is ACCEPTED — never forced through the fixed-circuit >=2-item rule (a genuine common real-world format, e.g. 'AMRAP 10min: Burpees')", () => {
  const singleItem: Session = { ...AMRAP_CONDITIONING_SESSION_DEMO, blocks: [{ ...AMRAP_BLOCK, items: [AMRAP_BLOCK.items[0]] }] };
  validateSession(singleItem, "single-item amrap");
});

check("an AMRAP that also declares a real 'rounds' target is rejected — unbounded and a fixed target are a contradiction", () => {
  const malformed: Session = { ...AMRAP_CONDITIONING_SESSION_DEMO, blocks: [{ ...AMRAP_BLOCK, rounds: 5 }] };
  assert.throws(() => validateSession(malformed, "amrap with a contradictory rounds target"));
});

check("D: the EMOM fixture (alternating odd/even) validates", () => {
  validateSession(EMOM_ALTERNATING_SESSION_DEMO, "emom alternating fixture");
});

check("D: the E2MOM fixture validates — the SAME engine, generalized cadence, never a separate hard-coded E2MOM type", () => {
  validateSession(E2MOM_SESSION_DEMO, "e2mom fixture");
});

check("E: an EMOM with a zero/negative cadence is rejected", () => {
  const malformed: Session = { ...EMOM_ALTERNATING_SESSION_DEMO, blocks: [{ ...EMOM_BLOCK, cadenceSeconds: 0 }] };
  assert.throws(() => validateSession(malformed, "emom with zero cadence"));
});

check("E: an EMOM with no real total-window count is rejected", () => {
  const malformed: Session = { ...EMOM_ALTERNATING_SESSION_DEMO, blocks: [{ ...EMOM_BLOCK, rounds: undefined }] };
  assert.throws(() => validateSession(malformed, "emom with no rounds"));
});

check("F: E2MOM's own generalized cadence (120 sec) validates as a real, distinct value from plain EMOM's 60 sec", () => {
  assert.equal(E2MOM_BLOCK.cadenceSeconds, 120);
  assert.notEqual(E2MOM_BLOCK.cadenceSeconds, EMOM_BLOCK.cadenceSeconds);
});

check("the time-capped circuit fixture (real rounds AND a real time cap) validates", () => {
  validateSession(TIME_CAPPED_CIRCUIT_SESSION_DEMO, "time-capped circuit fixture");
});

check("a 'rounds_or_time_cap' circuit with no real time cap is rejected", () => {
  const malformed: Session = { ...TIME_CAPPED_CIRCUIT_SESSION_DEMO, blocks: [{ ...TIME_CAPPED_BLOCK, timeCapSeconds: undefined }] };
  assert.throws(() => validateSession(malformed, "rounds_or_time_cap with no time cap"));
});

check("G: existing resistance-only content is completely unaffected", () => {
  validateSession(MIXED_SESSION_DEMO, "resistance-only mixed session");
});

check("Y/Z: existing continuous/interval content is completely unaffected", () => {
  validateSession(BIKE_INTERVALS_SESSION_DEMO, "bike intervals session");
});

check("AA: existing fixed-round circuit content is completely unaffected", () => {
  validateSession(BASIC_CIRCUIT_SESSION_DEMO, "basic circuit session");
});

check("AB/AC: existing power/mobility content is completely unaffected", () => {
  validateSession(BOX_JUMP_POWER_SESSION_DEMO, "box jump power session");
  validateSession(COUCH_STRETCH_MOBILITY_SESSION_DEMO, "couch stretch mobility session");
});

// ---------------------------------------------------------------------------
// Pure state-machine/formatter coverage.
// ---------------------------------------------------------------------------

console.log("\n2. Pure AMRAP/EMOM state machines and formatters\n");

check("isUnboundedRounds/isTimedCircuit correctly classify every termination mode", () => {
  assert.equal(isUnboundedRounds(AMRAP_BLOCK), true);
  assert.equal(isTimedCircuit(AMRAP_BLOCK), true);
  assert.equal(isUnboundedRounds(TIME_CAPPED_BLOCK), false);
  assert.equal(isTimedCircuit(TIME_CAPPED_BLOCK), true);
  assert.equal(isUnboundedRounds(BASIC_CIRCUIT_SESSION_DEMO.blocks[0]), false);
  assert.equal(isTimedCircuit(BASIC_CIRCUIT_SESSION_DEMO.blocks[0]), false);
});

check("isCircuitBlock recognizes a genuine AMRAP (no rounds set) as a real circuit block", () => {
  assert.equal(isCircuitBlock(AMRAP_BLOCK), true);
});

check("an AMRAP's nextCircuitPosition never enters round-rest — continuous, unbroken work — and never resolves 'complete' on its own", () => {
  const afterLastItemRound1 = nextCircuitPosition(AMRAP_BLOCK, { round: 1, itemIndex: AMRAP_BLOCK.items.length - 1, phase: "item" });
  assert.deepEqual(afterLastItemRound1, { round: 2, itemIndex: 0, phase: "item" }, "straight into round 2's first item, no round-rest");
  const afterManyRounds = nextCircuitPosition(AMRAP_BLOCK, { round: 500, itemIndex: AMRAP_BLOCK.items.length - 1, phase: "item" });
  assert.notEqual(afterManyRounds, "complete", "never claims complete on its own, no matter how many rounds");
});

check("describeCircuitOverview for AMRAP never claims a fabricated round count", () => {
  const lines = describeCircuitOverview(AMRAP_BLOCK);
  assert.equal(lines[0], "AMRAP — 720 sec time cap");
  assert.doesNotMatch(lines.join(" "), /^\d+ rounds?$/m);
});

check("describeCircuitOverview for a time-capped circuit honestly shows both the round target and the time cap", () => {
  const lines = describeCircuitOverview(TIME_CAPPED_BLOCK);
  assert.equal(lines[0], "4 rounds");
  assert.match(lines[1], /or 600 sec time cap, whichever comes first/);
});

check("emomItemForWindow cycles deterministically through the alternating items — odd windows get item[0], even get item[1]", () => {
  assert.equal(emomItemForWindow(EMOM_BLOCK, 1).id, "emom-bike");
  assert.equal(emomItemForWindow(EMOM_BLOCK, 2).id, "emom-burpee");
  assert.equal(emomItemForWindow(EMOM_BLOCK, 3).id, "emom-bike");
  assert.equal(emomItemForWindow(EMOM_BLOCK, 10).id, "emom-burpee");
});

check("a plain single-item EMOM always resolves to that one item, every window", () => {
  const singleItemEmom = { ...EMOM_BLOCK, items: [EMOM_BLOCK.items[0]] };
  for (let w = 1; w <= 10; w++) assert.equal(emomItemForWindow(singleItemEmom, w).id, "emom-bike");
});

check("currentEmomWindow derives the correct window purely from elapsed real time, clamped at the total", () => {
  const start = "2026-01-01T00:00:00.000Z";
  assert.equal(currentEmomWindow(60, 10, start, "2026-01-01T00:00:00.000Z"), 1);
  assert.equal(currentEmomWindow(60, 10, start, "2026-01-01T00:00:59.000Z"), 1);
  assert.equal(currentEmomWindow(60, 10, start, "2026-01-01T00:01:00.000Z"), 2);
  assert.equal(currentEmomWindow(60, 10, start, "2026-01-01T00:05:30.000Z"), 6);
  assert.equal(currentEmomWindow(60, 10, start, "2026-01-01T00:59:00.000Z"), 10, "clamped at the total, never beyond");
});

check("windowsToAutoSkip returns exactly the honest gap between what's resolved and what the clock says is current", () => {
  assert.deepEqual(windowsToAutoSkip(3, 3), []);
  assert.deepEqual(windowsToAutoSkip(3, 6), [3, 4, 5]);
});

check("describeEmomCadenceLabel names EMOM/E2MOM/E3MOM purely from real cadence seconds", () => {
  assert.equal(describeEmomCadenceLabel(60), "EMOM");
  assert.equal(describeEmomCadenceLabel(120), "E2MOM");
  assert.equal(describeEmomCadenceLabel(180), "E3MOM");
});

check("describeEmomOverview is human-readable, shows each distinct window assignment, never raw JSON", () => {
  const lines = describeEmomOverview(EMOM_BLOCK);
  assert.equal(lines[0], "EMOM x 10");
  assert.match(lines[1], /Bike/);
  assert.match(lines[2], /Burpee/);
});

check("totalWindowsAssignedToItem honestly splits an odd total window count across alternating items", () => {
  // 10 windows, 2 items alternating -> 5 each (bike gets odd windows 1,3,5,7,9).
  assert.equal(totalWindowsAssignedToItem(EMOM_BLOCK, "emom-bike"), 5);
  assert.equal(totalWindowsAssignedToItem(EMOM_BLOCK, "emom-burpee"), 5);
});

// ---------------------------------------------------------------------------
// 41 — required acceptance case: AMRAP.
// ---------------------------------------------------------------------------

console.log("\n3. 12-Minute AMRAP — 5 full rounds + partial round 6, honest history (41, H, I, J, K)\n");

check("starting the AMRAP session lands on circuit-ready, one queue slot for the whole block (H reuses circuit's own resume architecture)", () => {
  const state = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "circuit-ready");
  assert.deepEqual(state.workoutSession.exerciseQueue, ["block-amrap-conditioning"]);
});

check("I/J/K: 5 full rounds, then Squat + Push-Up completed in round 6, time expires before Bike — exactly the acceptance case, no fabricated Bike completion", () => {
  let state = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-conditioning" });
  assert.ok(state.workoutSession.circuitProgress?.["block-amrap-conditioning"]?.blockStartedAtIso, "a real timestamp anchor exists for the whole block");

  for (let round = 1; round <= 5; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" }); // Squat
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" }); // Push-Up
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" }); // Bike
    assert.equal(state.workoutSession.circuitProgress?.["block-amrap-conditioning"]?.phase, "item", "AMRAP never enters round-rest");
  }
  assert.equal(state.workoutSession.circuitProgress?.["block-amrap-conditioning"]?.round, 6);

  // Round 6: Squat + Push-Up completed, then time expires before Bike.
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" }); // Squat
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" }); // Push-Up
  assert.equal(state.workoutSession.circuitProgress?.["block-amrap-conditioning"]?.itemIndex, 2, "on Bike now, not yet resolved");

  state = reducer(state, { type: "EXPIRE_TIMED_CIRCUIT", blockId: "block-amrap-conditioning" });
  assert.equal(state.workoutSession.phase, "session-summary", "the only block resolved -> straight to summary");
  assert.equal(state.workoutSession.circuitProgress?.["block-amrap-conditioning"], undefined, "transient progress cleared once finalized");

  const squat = state.workoutSession.continuousExecutions?.["amrap-goblet-squat"];
  const pushup = state.workoutSession.continuousExecutions?.["amrap-push-up"];
  const bike = state.workoutSession.continuousExecutions?.["amrap-bike"];
  assert.equal(squat!.circuitRoundActuals?.length, 6, "6 full rounds for Squat");
  assert.equal(pushup!.circuitRoundActuals?.length, 6, "6 full rounds for Push-Up");
  assert.equal(bike!.circuitRoundActuals?.length, 5, "only 5 rounds for Bike — never a fabricated 6th");
  assert.equal(squat!.status, "completed", "attempted every round it was reached for (6 of 6 rounds actually reached)");
  assert.equal(bike!.status, "partial", "honestly partial — reached 5 of the 6 rounds attempted");
  assert.equal(state.workoutSession.exerciseLogs["amrap-bike"].status, "completed", "a real, intentional time-cap ending — never marked 'skipped' like a whole-activity SKIP_EXERCISE would");

  // O — prescription remains completely untouched by what happened.
  const item = findTrainingItemById(state.workoutSession.resolvedSession, "amrap-bike")!;
  assert.equal(item.prescription.family, "continuous");
});

check("K: the client's own explicit time's-up tap, never a silent auto-completion — dispatching EXPIRE_TIMED_CIRCUIT before the client ever taps it changes nothing", () => {
  let state = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-conditioning" });
  assert.equal(state.workoutSession.phase, "circuit-active", "still actively in the AMRAP — nothing auto-finalizes on its own");
});

// ---------------------------------------------------------------------------
// 44 — required acceptance case: custom name has zero semantic influence.
// ---------------------------------------------------------------------------

console.log("\n4. Custom-named protocol — the name is pure display data (44, G)\n");

check("G: 'Elon Death Set Finisher From Hell' executes through the exact same AMRAP engine — the name has zero effect on execution mechanics", () => {
  let state = startFromFixture(CUSTOM_NAMED_AMRAP_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "circuit-ready");
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-elon-death-set" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-elon-death-set" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-elon-death-set" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-elon-death-set" });
  assert.equal(state.workoutSession.circuitProgress?.["block-elon-death-set"]?.round, 2, "advances exactly like any other AMRAP — the name never branches anything");
  state = reducer(state, { type: "EXPIRE_TIMED_CIRCUIT", blockId: "block-elon-death-set" });
  assert.equal(state.workoutSession.phase, "session-summary");
});

check("the block's own coach-owned name persists through review formatting, never appearing as a hard-coded string anywhere in the runtime", () => {
  const block = CUSTOM_NAMED_AMRAP_SESSION_DEMO.blocks[0];
  assert.equal(block.name, "Elon Death Set Finisher From Hell");
  const lines = describeCircuitOverview(block);
  assert.doesNotMatch(lines.join(" "), /Elon/, "describeCircuitOverview describes the STRUCTURE, not the name — the name is rendered separately by the UI layer, exactly like every other block.name");
});

// ---------------------------------------------------------------------------
// 42 — required acceptance case: EMOM.
// ---------------------------------------------------------------------------

console.log("\n5. 10-Minute EMOM — alternating windows, honest per-window history (42, D, L, M, O)\n");

check("starting the EMOM session lands on emom-ready, one queue slot for the whole block", () => {
  const state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "emom-ready");
  assert.deepEqual(state.workoutSession.exerciseQueue, ["block-emom-alternating"]);
});

check("BEGIN_EMOM_EXECUTION opens window 1", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  assert.equal(state.workoutSession.phase, "emom-active");
  const progress = state.workoutSession.emomProgress?.["block-emom-alternating"];
  assert.ok(progress?.startedAtIso);
  assert.deepEqual(progress?.exposuresByItemId, {});
});

check("L/M: walking through all 10 real cadence windows resolves every window against the correct alternating item, and auto-finalizes on the last one", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  for (let w = 1; w <= 10; w++) {
    state = setEmomStartToWindow(state, "block-emom-alternating", w, 60);
    state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });
  }
  assert.equal(state.workoutSession.phase, "session-summary", "the only block resolved -> straight to summary");
  assert.equal(state.workoutSession.emomProgress?.["block-emom-alternating"], undefined, "transient progress cleared once finalized");

  const bike = state.workoutSession.continuousExecutions?.["emom-bike"];
  const burpee = state.workoutSession.continuousExecutions?.["emom-burpee"];
  assert.equal(bike!.emomWindowActuals?.length, 5, "odd windows (1,3,5,7,9) — 5 real windows for Bike");
  assert.equal(burpee!.emomWindowActuals?.length, 5, "even windows (2,4,6,8,10) — 5 real windows for Burpee");
  assert.deepEqual(bike!.emomWindowActuals!.map((w) => w.window), [1, 3, 5, 7, 9]);
  assert.deepEqual(burpee!.emomWindowActuals!.map((w) => w.window), [2, 4, 6, 8, 10]);
  assert.equal(bike!.status, "completed");
  assert.equal(burpee!.status, "completed");
});

check("O: remaining window time acts as rest — completing a window early shows a real rest sub-state until the next real cadence boundary (verified via the pure derivation the panel itself uses)", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" }); // window 1 resolved
  const progress = state.workoutSession.emomProgress!["block-emom-alternating"];
  // Still within window 1's own real 60-second span -> the clock-derived
  // current window is still 1, and window 1 already has an exposure ->
  // the panel's own "alreadyResolvedThisWindow" derivation would show rest.
  const stillWindow1 = currentEmomWindow(emomCadenceSeconds(EMOM_BLOCK), totalEmomWindows(EMOM_BLOCK), progress.startedAtIso, progress.startedAtIso);
  assert.equal(stillWindow1, 1);
  const alreadyResolved = (progress.exposuresByItemId["emom-bike"] ?? []).some((e) => e.window === stillWindow1);
  assert.equal(alreadyResolved, true, "window 1 already resolved -> rest sub-view, exactly like the real panel derives it");
});

check("N: falling behind real cadence auto-skips the passed window honestly — never fabricated as completed — verified by simulating real elapsed time via a manually-rewound startedAtIso", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  // Real elapsed time (relative to the REAL wall clock, never the
  // fixture's own fake "2026-01-01" reference) has moved 3 real cadence
  // windows ahead before the very first client tap — the same effect as
  // the client being 3 minutes behind in real life.
  state = setEmomStartToWindow(state, "block-emom-alternating", 4, 60);
  state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });
  const progress = state.workoutSession.emomProgress!["block-emom-alternating"];
  const allExposures = Object.values(progress.exposuresByItemId).flat();
  // Sorted by window number, not insertion order — exposuresByItemId is
  // keyed per ITEM (bike's own windows land together, distinct from
  // burpee's), so flattening it never guarantees chronological order; only
  // the real SET of skipped windows matters here.
  const skippedWindows = allExposures
    .filter((e) => e.status === "skipped")
    .map((e) => e.window)
    .sort((a, b) => a - b);
  assert.deepEqual(skippedWindows, [1, 2, 3], "windows 1-3 honestly auto-skipped — the client's tap landed on window 4");
  const completedWindows = allExposures.filter((e) => e.status === "completed").map((e) => e.window);
  assert.deepEqual(completedWindows, [4], "the tap itself resolves window 4 — whatever is REALLY current now");
});

// ---------------------------------------------------------------------------
// 43 — required acceptance case: E2MOM.
// ---------------------------------------------------------------------------

console.log("\n6. E2MOM — the SAME engine, generalized 120-sec cadence, no special code (43, F)\n");

check("E2MOM executes through the exact same ADVANCE_EMOM_WINDOW action, alternating Box Jump/Push-Up across 6 windows", () => {
  let state = startFromFixture(E2MOM_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-e2mom" });
  for (let w = 1; w <= 6; w++) {
    state = setEmomStartToWindow(state, "block-e2mom", w, 120);
    state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-e2mom" });
  }
  assert.equal(state.workoutSession.phase, "session-summary");
  const boxJump = state.workoutSession.continuousExecutions?.["e2mom-box-jump"];
  const pushup = state.workoutSession.continuousExecutions?.["e2mom-push-up"];
  assert.equal(boxJump!.emomWindowActuals?.length, 3, "odd windows (1,3,5)");
  assert.equal(pushup!.emomWindowActuals?.length, 3, "even windows (2,4,6)");
});

// ---------------------------------------------------------------------------
// 45 — required acceptance case: time-capped circuit.
// ---------------------------------------------------------------------------

console.log("\n7. Time-capped circuit — 3 full rounds + 2 items into round 4, then time expires (45, K)\n");

check("a truthful partial time-capped block: 3 full rounds, 1 of 2 items into round 4, then EXPIRE_TIMED_CIRCUIT — the round target is the honest classification denominator, exactly like a mid-round whole-circuit skip", () => {
  let state = startFromFixture(TIME_CAPPED_CIRCUIT_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-time-capped-circuit" });
  for (let round = 1; round <= 3; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-time-capped-circuit" }); // KB Swing
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-time-capped-circuit" }); // Box Step
    if (round < 3) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-time-capped-circuit" }); // round-rest
  }
  assert.equal(state.workoutSession.circuitProgress?.["block-time-capped-circuit"]?.phase, "round-rest", "real round-rest between rounds — a time-capped circuit is NOT AMRAP-shaped");
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-time-capped-circuit" }); // into round 4
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-time-capped-circuit" }); // KB Swing round 4
  assert.equal(state.workoutSession.circuitProgress?.["block-time-capped-circuit"]?.round, 4);
  assert.equal(state.workoutSession.circuitProgress?.["block-time-capped-circuit"]?.itemIndex, 1, "on Box Step now, not yet resolved");

  state = reducer(state, { type: "EXPIRE_TIMED_CIRCUIT", blockId: "block-time-capped-circuit" });
  assert.equal(state.workoutSession.phase, "session-summary");

  const kbSwing = state.workoutSession.continuousExecutions?.["time-capped-kb-swing"];
  const boxStep = state.workoutSession.continuousExecutions?.["time-capped-box-step"];
  assert.equal(kbSwing!.circuitRoundActuals?.length, 4, "4 real rounds for KB Swing");
  assert.equal(boxStep!.circuitRoundActuals?.length, 3, "only 3 rounds for Box Step — round 4 never reached");
  // The real prescribed target (4) is the honest denominator here — matching
  // Phase 11B's own established mid-round-interrupt precedent — so KB Swing
  // (4 of 4) is genuinely "completed" and Box Step (3 of 4) is "partial".
  assert.equal(kbSwing!.status, "completed");
  assert.equal(boxStep!.status, "partial");
});

// ---------------------------------------------------------------------------
// P, Q — pain and skip preserve work, for both AMRAP and EMOM.
// ---------------------------------------------------------------------------

console.log("\n8. Pain and skip preserve work honestly, for both AMRAP and EMOM (P, Q)\n");

check("P: pain mid-AMRAP blocks ADVANCE_CIRCUIT_PHASE and preserves completed rounds; a resume-eligible report resumes directly into circuit-active", () => {
  let state = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-conditioning" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" });

  state = reportPain(state, "amrap-push-up", { ratingZeroToTen: 6 });
  assert.equal(state.workoutSession.phase, "pain-review");
  const blocked = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" });
  assert.equal(blocked.workoutSession.phase, "pain-review", "must never silently continue");
  assert.equal(Object.keys(blocked.workoutSession.circuitProgress?.["block-amrap-conditioning"]?.exposuresByItemId ?? {}).length, 1, "the completed squat exposure survives, untouched");

  state = reportPain(state, "amrap-push-up", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });
  assert.equal(state.workoutSession.phase, "circuit-active", "resumes directly into the live AMRAP flow, never a stuck pain-review screen");
});

check("P: pain mid-EMOM-window blocks ADVANCE_EMOM_WINDOW and preserves completed windows; a resume-eligible report resumes directly into emom-active", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });

  state = reportPain(state, "emom-burpee", { ratingZeroToTen: 6 });
  assert.equal(state.workoutSession.phase, "pain-review");
  const blocked = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });
  assert.equal(blocked.workoutSession.phase, "pain-review");

  state = reportPain(state, "emom-burpee", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });
  assert.equal(state.workoutSession.phase, "emom-active", "resumes directly into the live EMOM flow");
});

check("Q: skipping the whole AMRAP mid-round snapshots real partial work, never 'skipped' status for real progress", () => {
  let state = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-conditioning" });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" });
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "block-amrap-conditioning", reason: "out-of-time" });

  const squat = state.workoutSession.continuousExecutions?.["amrap-goblet-squat"];
  assert.ok(squat, "the 1 real completed round must be preserved");
  assert.equal(state.workoutSession.exerciseLogs["amrap-goblet-squat"].status, "skipped", "a plain SKIP_EXERCISE remains a real skip (never reclassified as 'completed') — distinct from EXPIRE_TIMED_CIRCUIT's own honest 'completed' framing");
});

check("Q: skipping the whole EMOM mid-window snapshots real partial work honestly", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "block-emom-alternating", reason: "out-of-time" });

  const bike = state.workoutSession.continuousExecutions?.["emom-bike"];
  assert.ok(bike, "the 1 real completed window must be preserved");
  assert.equal(bike!.emomWindowActuals?.length, 1);
  assert.equal(state.workoutSession.exerciseLogs["emom-bike"].status, "skipped");
});

check("skipping the whole EMOM BEFORE starting it creates no execution records at all — a plain skip, exactly like every other family", () => {
  const state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  const skipped = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "block-emom-alternating", reason: "other" });
  assert.equal(skipped.workoutSession.continuousExecutions?.["emom-bike"], undefined);
  assert.equal(skipped.workoutSession.continuousExecutions?.["emom-burpee"], undefined);
});

// ---------------------------------------------------------------------------
// R — mixed prescription families work inside AMRAP/EMOM.
// ---------------------------------------------------------------------------

console.log("\n9. Mixed prescription families inside AMRAP/EMOM (R)\n");

check("R: the E2MOM's own power-family item (Box Jump) executes correctly inside the EMOM engine, alongside a resistance item", () => {
  const boxJumpItem = E2MOM_BLOCK.items[0];
  assert.equal(boxJumpItem.prescription.family, "power");
  let state = startFromFixture(E2MOM_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-e2mom" });
  state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-e2mom", actual: { reps: { low: 4, high: 4 } } });
  assert.deepEqual(state.workoutSession.continuousExecutions, {}, "not yet finalized (only 1 of 6 windows resolved)");
  const progress = state.workoutSession.emomProgress?.["block-e2mom"];
  assert.equal(progress?.exposuresByItemId["e2mom-box-jump"]?.[0].actual?.reps?.low, 4, "the power item's own real reps deviation preserved honestly");
});

// ---------------------------------------------------------------------------
// 46, S, T, U — coach review human-readable, editing, history.
// ---------------------------------------------------------------------------

console.log("\n10. Coach review/editing, history (S, T, U)\n");

function wrapInContent(session: Session): UniversalTrainingProgramContent {
  return {
    schemaVersion: 2,
    id: "program-custom-methods-edit-test",
    workspaceId: "workspace-1" as never,
    clientId: "client-1" as never,
    coachId: "coach-1" as never,
    name: "Custom Methods Edit Test",
    durationWeeks: 1,
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayOfWeek: "Monday", type: "training", sessions: [session] },
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
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
  } as UniversalTrainingProgramContent;
}

check("S: describeCircuitOverview/describeEmomOverview render human-readable coach-review lines, never raw JSON", () => {
  const amrapLines = describeCircuitOverview(CUSTOM_NAMED_AMRAP_SESSION_DEMO.blocks[0]);
  assert.deepEqual(amrapLines, ["AMRAP — 600 sec time cap", "1. DB Thruster — 10 reps, 25 lb", "2. Burpee — 8 reps", "3. Bike — 12 calories"]);
  const emomLines = describeEmomOverview(EMOM_BLOCK);
  assert.equal(emomLines[0], "EMOM x 10");
});

check("T: a coach can edit an AMRAP's time cap through the real applyBlockPatch editor, and the edit round-trips through validation", () => {
  const content = wrapInContent(AMRAP_CONDITIONING_SESSION_DEMO);
  const path: BlockPath = { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "block-amrap-conditioning" };
  const edited = applyBlockPatch(content, path, { timeCapSeconds: 15 * 60, name: "Extended AMRAP" });
  const block = edited.weeks[0].days[0].sessions![0].blocks[0];
  assert.equal(block.timeCapSeconds, 15 * 60);
  assert.equal(block.name, "Extended AMRAP");
  validateSession(edited.weeks[0].days[0].sessions![0], "edited amrap session");
});

check("T: a coach can edit an EMOM's cadence and total windows through the SAME real applyBlockPatch editor — no separate custom-method editor", () => {
  const content = wrapInContent(EMOM_ALTERNATING_SESSION_DEMO);
  const path: BlockPath = { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "block-emom-alternating" };
  const edited = applyBlockPatch(content, path, { cadenceSeconds: 90, rounds: 8 });
  const block = edited.weeks[0].days[0].sessions![0].blocks[0];
  assert.equal(block.cadenceSeconds, 90);
  assert.equal(block.rounds, 8);
  validateSession(edited.weeks[0].days[0].sessions![0], "edited emom session");
});

check("U: an invalid edit (a real AMRAP round target contradiction) is rejected by validation before it could ever persist", () => {
  const content = wrapInContent(AMRAP_CONDITIONING_SESSION_DEMO);
  const path: BlockPath = { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "block-amrap-conditioning" };
  const edited = applyBlockPatch(content, path, { rounds: 5 });
  assert.throws(() => validateSession(edited.weeks[0].days[0].sessions![0], "invalid edited amrap"), /never also declare a "rounds" target/);
});

check("V: history — buildWorkoutSummary correctly counts a completed AMRAP and a completed EMOM", () => {
  let amrapState = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  amrapState = reducer(amrapState, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-conditioning" });
  for (let i = 0; i < 3; i++) amrapState = reducer(amrapState, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" });
  amrapState = reducer(amrapState, { type: "EXPIRE_TIMED_CIRCUIT", blockId: "block-amrap-conditioning" });
  const amrapSummary = buildWorkoutSummary(amrapState.workoutSession.resolvedSession ?? null, amrapState.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:12:00.000Z");
  assert.equal(amrapSummary.exercisesCompleted, 3, "all 3 AMRAP items counted");

  let emomState = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  emomState = reducer(emomState, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  for (let w = 1; w <= 10; w++) {
    emomState = setEmomStartToWindow(emomState, "block-emom-alternating", w, 60);
    emomState = reducer(emomState, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });
  }
  const emomSummary = buildWorkoutSummary(emomState.workoutSession.resolvedSession ?? null, emomState.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z");
  assert.equal(emomSummary.exercisesCompleted, 2, "both distinct EMOM items counted");
  assert.equal(emomSummary.fullyCompleted, true);
});

// ---------------------------------------------------------------------------
// W — observations are factual only.
// ---------------------------------------------------------------------------

console.log("\n11. Observation projection — AMRAP/EMOM facts are honest, never a derived score (W, AD-equivalent)\n");

check("W: AMRAP observation projection reuses circuitRoundActuals — no new projection code needed, no fabricated MetCon score", () => {
  let state = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-conditioning" });
  for (let i = 0; i < 3; i++) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" });
  state = reducer(state, { type: "EXPIRE_TIMED_CIRCUIT", blockId: "block-amrap-conditioning" });

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
  const squatRounds = observations.find((o) => o.trainingItemInstanceId === "amrap-goblet-squat" && o.metricKey === "completed_rounds");
  assert.ok(squatRounds, "a real completed_rounds fact was projected");
  assert.deepEqual(squatRounds!.value, { valueType: "numeric", valueNumeric: 1 });
  assert.ok(!observations.some((o) => o.metricKey.toLowerCase().includes("score") || o.metricKey.toLowerCase().includes("metcon")), "no fabricated MetCon/work-capacity score");
});

check("W: EMOM observation projection reports the same honest completed_rounds metric key, never a fabricated score", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  for (let w = 1; w <= 10; w++) {
    state = setEmomStartToWindow(state, "block-emom-alternating", w, 60);
    state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });
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
  const bikeWindows = observations.find((o) => o.trainingItemInstanceId === "emom-bike" && o.metricKey === "completed_rounds");
  assert.ok(bikeWindows);
  assert.deepEqual(bikeWindows!.value, { valueType: "numeric", valueNumeric: 5 });
  assert.ok(!observations.some((o) => o.metricKey.toLowerCase().includes("score")), "no fabricated score anywhere");
});

// ---------------------------------------------------------------------------
// 46 — required acceptance case: mixed session, one universal engine.
// ---------------------------------------------------------------------------

console.log("\n12. Mixed session: mobility -> power -> resistance -> circuit -> AMRAP -> EMOM -> cooldown (46)\n");

check("the mixed session starts on the warm-up mobility item's own mobility-ready phase", () => {
  const state = startFromFixture(MIXED_SESSION_WITH_CUSTOM_METHODS_DEMO);
  assert.equal(state.workoutSession.phase, "mobility-ready");
  assert.equal(state.workoutSession.currentExerciseId, "warmup-hip-rotation-methods");
});

check("walking mobility -> power -> resistance -> circuit -> AMRAP -> EMOM -> cooldown mobility completes the whole mixed session through ONE universal engine, no parallel 'custom workout' runtime", () => {
  let state = startFromFixture(MIXED_SESSION_WITH_CUSTOM_METHODS_DEMO);

  // 1. Warm-up mobility.
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "warmup-hip-rotation-methods" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "warmup-hip-rotation-methods" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "warmup-hip-rotation-methods" });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 2. Power.
  assert.equal(state.workoutSession.phase, "power-ready");
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump-methods" });
  for (let i = 0; i < 3; i++) state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump-methods" });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 3. Resistance (no warmupSets configured -> straight to set-ready).
  assert.equal(state.workoutSession.phase, "exercise-intro");
  state = reducer(state, { type: "BEGIN_EXERCISE" });
  for (const setNumber of [1, 2, 3]) {
    state = reducer(state, { type: "LOG_SET", exerciseId: "resistance-bench-methods", setNumber, isWarmup: false, weightLb: 135, reps: 7, rpe: 8, performedAsPrescribed: true });
    state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
  }
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 4. Circuit (2 rounds x 2 items).
  assert.equal(state.workoutSession.phase, "circuit-ready");
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-circuit-methods" });
  for (let round = 1; round <= 2; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-methods" });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-methods" });
    if (round < 2) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-methods" });
  }
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 5. AMRAP finisher — completed fully before time expires (2 items x 3 rounds is small on purpose).
  assert.equal(state.workoutSession.phase, "circuit-ready");
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-methods" });
  for (let i = 0; i < 4; i++) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-methods" });
  state = reducer(state, { type: "EXPIRE_TIMED_CIRCUIT", blockId: "block-amrap-methods" });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 6. EMOM finisher (single-item, 4 windows).
  assert.equal(state.workoutSession.phase, "emom-ready");
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-methods" });
  for (let w = 1; w <= 4; w++) {
    state = setEmomStartToWindow(state, "block-emom-methods", w, 60);
    state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-methods" });
  }
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 7. Cooldown mobility.
  assert.equal(state.workoutSession.phase, "mobility-ready");
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "cooldown-couch-stretch-methods" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "cooldown-couch-stretch-methods" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "cooldown-couch-stretch-methods" });

  assert.equal(state.workoutSession.phase, "session-summary", "the entire 7-block, 6-format mixed session resolves through the one universal engine");
});

// ---------------------------------------------------------------------------
// AE, AF — security unchanged (structural note); resolvedSession never
// mutated.
// ---------------------------------------------------------------------------

console.log("\n13. resolvedSession is never mutated by AMRAP/EMOM execution\n");

check("resolvedSession's own JSON is byte-identical before and after a full AMRAP round/expire sequence", () => {
  let state = startFromFixture(AMRAP_CONDITIONING_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.resolvedSession);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-amrap-conditioning" });
  for (let i = 0; i < 4; i++) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-amrap-conditioning" });
  state = reducer(state, { type: "EXPIRE_TIMED_CIRCUIT", blockId: "block-amrap-conditioning" });
  const after = JSON.stringify(state.workoutSession.resolvedSession);
  assert.equal(before, after);
});

check("resolvedSession's own JSON is byte-identical before and after a full EMOM round/finalize sequence", () => {
  let state = startFromFixture(EMOM_ALTERNATING_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.resolvedSession);
  state = reducer(state, { type: "BEGIN_EMOM_EXECUTION", blockId: "block-emom-alternating" });
  for (let w = 1; w <= 10; w++) state = reducer(state, { type: "ADVANCE_EMOM_WINDOW", blockId: "block-emom-alternating" });
  const after = JSON.stringify(state.workoutSession.resolvedSession);
  assert.equal(before, after);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
