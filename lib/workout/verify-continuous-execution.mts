// Phase 4 — continuous-work execution verification. Proves the universal
// Session/Block/TrainingItemInstance/Prescription engine (lib/workout/
// session-flow.ts, lib/state.ts) natively supports a non-resistance
// TrainingItemInstance, end to end, without corrupting resistance execution
// (still exhaustively covered, unchanged, by lib/workout/verify-workout-flow.mts's
// 67 tests). Maps directly onto the Phase 4 spec's section 22 test list
// (A-P), noted per section below. Run with: npm run verify:continuous-execution

import assert from "node:assert/strict";
import { createInitialState, reducer, buildStartedWorkoutSession } from "../state.ts";
import { validateSession } from "../production/validation.ts";
import { buildWorkoutSummary } from "../workout-analysis.ts";
import { findTrainingItemById } from "./session-flow.ts";
import {
  classifyContinuousCompletion,
  describeContinuousTarget,
  formatDistance,
  formatDurationMinutes,
  formatHeartRate,
  formatPace,
} from "./continuous.ts";
import { MIXED_SESSION_DEMO, CONTINUOUS_BIKE_SESSION_DEMO, CONTINUOUS_RUN_SESSION_DEMO } from "../training/demo-fixtures.ts";
import type { AppState } from "../state.ts";
import type { Session } from "../training/types.ts";

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

/** Starts a live session directly from a hand-authored universal Session
 * fixture, exactly the way lib/state.ts's LOAD_PRESET "mixed-session" does
 * for MIXED_SESSION_DEMO — real production code (buildStartedWorkoutSession),
 * never a test-only shim. */
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

// ---------------------------------------------------------------------------
// C — continuous prescriptions validate correctly against the Phase 1
// universal grammar.
// ---------------------------------------------------------------------------

console.log("\n1. Continuous session fixtures validate against the Phase 1 universal grammar (C)\n");

check("the pure Zone 2 bike fixture validates", () => {
  validateSession(CONTINUOUS_BIKE_SESSION_DEMO, "continuous bike fixture");
});

check("the distance/pace run fixture validates", () => {
  validateSession(CONTINUOUS_RUN_SESSION_DEMO, "continuous run fixture");
});

check("the mixed resistance+continuous fixture validates", () => {
  validateSession(MIXED_SESSION_DEMO, "mixed session fixture");
});

// ---------------------------------------------------------------------------
// A, D — a pure continuous session (30 min bike, HR target) executes and
// completes through the universal engine.
// ---------------------------------------------------------------------------

console.log("\n2. Pure continuous session — 30 min bike, HR target (A, D)\n");

check("starting the bike session lands on continuous-ready, never a resistance phase", () => {
  const state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "continuous-ready");
  assert.equal(state.workoutSession.currentExerciseId, "zone2-bike-solo");
  assert.equal(state.workoutSession.resolvedWorkout, null, "a continuous session has no legacy Workout counterpart");
});

check("the ready panel's target lines describe duration and heart rate, nothing resistance-specific", () => {
  const item = findTrainingItemById(CONTINUOUS_BIKE_SESSION_DEMO, "zone2-bike-solo")!;
  const lines = describeContinuousTarget(item.prescription);
  assert.deepEqual(lines, ["30 min", "Target HR Zone 2 (135–150 BPM)"]);
});

check("BEGIN_CONTINUOUS_LOGGING moves to continuous-logging, and completing as prescribed resolves the item and the session", () => {
  let state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  assert.equal(state.workoutSession.phase, "continuous-logging");

  state = reducer(state, {
    type: "LOG_CONTINUOUS_EXECUTION",
    exerciseId: "zone2-bike-solo",
    actual: { duration: { seconds: 1800 }, heartRate: { low: 138, high: 148 } },
  });

  assert.equal(state.workoutSession.phase, "session-summary", "the only item resolved -> straight to summary");
  const execution = state.workoutSession.continuousExecutions?.["zone2-bike-solo"];
  assert.ok(execution);
  assert.equal(execution!.status, "completed");
  assert.equal(execution!.performedAsPrescribed, true);
  assert.equal(state.workoutSession.exerciseLogs["zone2-bike-solo"].status, "completed");
});

// ---------------------------------------------------------------------------
// B — a distance/pace-based continuous session.
// ---------------------------------------------------------------------------

console.log("\n3. Distance-based continuous session — 5K run, target pace (B)\n");

check("the run fixture's target lines describe distance and pace, with no heart-rate/RPE fabricated", () => {
  const item = findTrainingItemById(CONTINUOUS_RUN_SESSION_DEMO, "easy-run-solo")!;
  const lines = describeContinuousTarget(item.prescription);
  assert.deepEqual(lines, ["5 km", "Target pace 6:30/km"]);
});

check("logging an actual distance/duration for the run resolves it correctly", () => {
  let state = startFromFixture(CONTINUOUS_RUN_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, {
    type: "LOG_CONTINUOUS_EXECUTION",
    exerciseId: "easy-run-solo",
    actual: { distance: { value: 5, unit: "km" }, duration: { seconds: 32 * 60 } },
  });
  const execution = state.workoutSession.continuousExecutions?.["easy-run-solo"];
  assert.equal(execution?.status, "completed");
  assert.equal(execution?.actual?.distance?.value, 5);
});

// ---------------------------------------------------------------------------
// E — partial completion preserves prescription vs. actual (never
// overwrites the original target).
// ---------------------------------------------------------------------------

console.log("\n4. Partial completion preserves prescribed vs. actual (E)\n");

check("logging 15 of 30 prescribed minutes classifies as partial, without changing the item's own prescription", () => {
  let state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, {
    type: "LOG_CONTINUOUS_EXECUTION",
    exerciseId: "zone2-bike-solo",
    actual: { duration: { seconds: 15 * 60 } },
    note: "Ran out of time.",
  });
  const execution = state.workoutSession.continuousExecutions?.["zone2-bike-solo"];
  assert.ok(execution);
  assert.equal(execution.status, "partial");
  assert.equal(execution.performedAsPrescribed, false);
  assert.equal(execution.actual?.duration?.seconds, 900, "actual reflects exactly what was logged");
  assert.equal(execution.note, "Ran out of time.");

  const item = findTrainingItemById(state.workoutSession.resolvedSession, "zone2-bike-solo")!;
  assert.equal(item.prescription.duration?.seconds, 1800, "the ORIGINAL 30-minute target must never be rewritten to 15");
});

// ---------------------------------------------------------------------------
// F — skip preserves reason/state.
// ---------------------------------------------------------------------------

console.log("\n5. Skip preserves reason and state, never fabricates an execution record (F)\n");

check("skipping a continuous item records the reason and never creates a continuousExecutions entry", () => {
  let state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "zone2-bike-solo", reason: "feeling-sick", note: "Not feeling well today." });
  assert.equal(state.workoutSession.exerciseLogs["zone2-bike-solo"].status, "skipped");
  assert.equal(state.workoutSession.exerciseLogs["zone2-bike-solo"].skipReason, "feeling-sick");
  assert.equal(state.workoutSession.continuousExecutions?.["zone2-bike-solo"], undefined);
  assert.equal(state.workoutSession.phase, "session-summary", "the only item skipped -> straight to summary");
});

// ---------------------------------------------------------------------------
// G — pain/safety interruption participates in the same architecture.
// ---------------------------------------------------------------------------

console.log("\n6. Pain/safety interruption blocks continuous progression exactly like resistance (G)\n");

check("reporting pain during continuous-ready blocks BEGIN_CONTINUOUS_LOGGING and LOG_CONTINUOUS_EXECUTION", () => {
  let state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  state = reducer(state, {
    type: "REPORT_PAIN",
    exerciseId: "zone2-bike-solo",
    location: "Knee",
    ratingZeroToTen: 6,
    onset: "During warm-up",
    causedByMovement: "Pedaling",
    continuedAfterSet: false,
    affectsOutsideGym: false,
    symptomQuality: "aching",
  });
  assert.equal(state.workoutSession.phase, "pain-review");

  const blockedBegin = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  assert.equal(blockedBegin.workoutSession.phase, "pain-review", "must not silently advance past an active pain report");

  const blockedLog = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "zone2-bike-solo", actual: { duration: { seconds: 1800 } } });
  assert.equal(blockedLog.workoutSession.phase, "pain-review");
  assert.equal(blockedLog.workoutSession.continuousExecutions?.["zone2-bike-solo"], undefined, "no execution can be recorded while blocked");
});

// ---------------------------------------------------------------------------
// H, I, J — mixed session: resistance -> continuous, correct per-item
// association, full completion.
// ---------------------------------------------------------------------------

console.log("\n7. Mixed session: resistance -> continuous, correct association, full completion (H, I, J)\n");

check("a mixed session starts on the resistance item's own intro phase, not continuous-ready", () => {
  const state = startFromFixture(MIXED_SESSION_DEMO);
  assert.equal(state.workoutSession.currentExerciseId, "goblet-squat");
  assert.equal(state.workoutSession.phase, "exercise-intro");
});

check("walking through resistance then continuous keeps each item's data correctly associated, and completes the whole session", () => {
  let state = startFromFixture(MIXED_SESSION_DEMO);

  // Resistance item: 1 warm-up set, 3 working sets (per MIXED_SESSION_DEMO's
  // Goblet Squat prescription).
  state = reducer(state, { type: "BEGIN_EXERCISE" });
  assert.equal(state.workoutSession.phase, "exercise-warmup", "warmupSets: 1 configures a real stepped warm-up");
  state = reducer(state, { type: "ADVANCE_EXERCISE_WARMUP" });
  assert.equal(state.workoutSession.phase, "set-ready");
  assert.equal(state.workoutSession.currentSetNumber, 2, "warmupSets(1) + 1 = the first working set number");

  for (const setNumber of [2, 3, 4]) {
    state = reducer(state, {
      type: "LOG_SET",
      exerciseId: "goblet-squat",
      setNumber,
      isWarmup: false,
      weightLb: 35,
      reps: 9,
      rpe: 7,
      performedAsPrescribed: true,
    });
    state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
  }

  assert.equal(state.workoutSession.currentExerciseId, "zone2-bike", "resolving the squat must hand off to the bike");
  assert.equal(state.workoutSession.phase, "exercise-transition");

  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "continuous-ready", "the bike is continuous -- never exercise-intro");

  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, {
    type: "LOG_CONTINUOUS_EXECUTION",
    exerciseId: "zone2-bike",
    actual: { duration: { seconds: 1200 }, heartRate: { low: 140, high: 148 } },
  });

  assert.equal(state.workoutSession.phase, "session-summary");

  // H — each item's data stayed correctly associated with itself, never
  // cross-contaminated by the other family's logging. The stepped warm-up
  // itself is tracked separately (WorkoutSession.exerciseWarmups), never as
  // a LoggedSet — only the 3 explicitly logged working sets land here.
  assert.equal(state.workoutSession.exerciseLogs["goblet-squat"].loggedSets.length, 3, "3 working sets logged; the warm-up step is tracked separately");
  assert.equal(state.workoutSession.exerciseLogs["goblet-squat"].status, "completed");
  assert.equal(state.workoutSession.continuousExecutions?.["goblet-squat"], undefined, "the resistance item must never gain a continuous execution record");
  assert.equal(state.workoutSession.exerciseLogs["zone2-bike"].loggedSets.length, 0, "the continuous item must never gain LoggedSet entries");
  assert.ok(state.workoutSession.continuousExecutions?.["zone2-bike"]);

  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:45:00.000Z");
  assert.equal(summary.exercisesCompleted, 2, "both the squat and the bike count");
  assert.equal(summary.workingSetsCompleted, 3, "only the squat's working sets count toward this resistance-specific tally");
  assert.equal(summary.fullyCompleted, true);
  assert.equal(summary.needsReview, false);

  const completed = reducer(state, { type: "COMPLETE_WORKOUT", summary });
  assert.equal(completed.workoutSession.status, "completed", "J -- the mixed session completes correctly end to end");
});

// ---------------------------------------------------------------------------
// K, L — resistance execution is unchanged, and the two families' state can
// never be confused with each other.
// ---------------------------------------------------------------------------

console.log("\n8. Resistance execution is unchanged, and cross-family confusion is structurally prevented (K, L)\n");

check("LOG_SET on the continuous item's id is a safe no-op (never accumulates a stray LoggedSet)", () => {
  const state = startFromFixture(MIXED_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.exerciseLogs["zone2-bike"]);
  const after = reducer(state, {
    type: "LOG_SET",
    exerciseId: "zone2-bike",
    setNumber: 1,
    isWarmup: false,
    weightLb: 10,
    reps: 10,
    rpe: 8,
    performedAsPrescribed: true,
  });
  assert.equal(JSON.stringify(after.workoutSession.exerciseLogs["zone2-bike"]), before);
});

check("SKIP_SET on the continuous item's id is a safe no-op", () => {
  const state = startFromFixture(MIXED_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.exerciseLogs["zone2-bike"]);
  const after = reducer(state, { type: "SKIP_SET", exerciseId: "zone2-bike", setNumber: 1, isWarmup: false, reason: "forgot" });
  assert.equal(JSON.stringify(after.workoutSession.exerciseLogs["zone2-bike"]), before);
});

check("LOG_CONTINUOUS_EXECUTION on the resistance item's id is a safe no-op", () => {
  const state = startFromFixture(MIXED_SESSION_DEMO);
  const after = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "goblet-squat", actual: { duration: { seconds: 60 } } });
  assert.equal(after.workoutSession.continuousExecutions?.["goblet-squat"], undefined);
  assert.equal(after.workoutSession.exerciseLogs["goblet-squat"].status, "not-started");
});

// ---------------------------------------------------------------------------
// M — invalid/incomplete continuous content fails safely.
// ---------------------------------------------------------------------------

console.log("\n9. Invalid/incomplete continuous content fails safely (M)\n");

check("a continuous item prescribing nothing at all still logs safely, without inventing a target to compare against", () => {
  const bareSession: Session = {
    id: "bare-session",
    name: "Bare",
    focus: "Bare",
    estimatedDurationMin: 10,
    blocks: [
      {
        id: "block-bare",
        kind: "straight",
        order: 1,
        items: [{ id: "bare-item", order: 1, name: "Mystery Activity", category: "continuous", prescription: { family: "continuous" } }],
      },
    ],
  };
  validateSession(bareSession, "bare session"); // structurally valid per the Phase 1 grammar
  let state = startFromFixture(bareSession);
  assert.equal(state.workoutSession.phase, "continuous-ready");
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  assert.doesNotThrow(() => {
    state = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "bare-item", actual: {} });
  });
  assert.equal(state.workoutSession.continuousExecutions?.["bare-item"]?.status, "completed", "no specified target means nothing to fall short of");
});

check("LOG_CONTINUOUS_EXECUTION before any session has started is a safe no-op, never a crash", () => {
  const state = createInitialState();
  assert.doesNotThrow(() => {
    reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "anything", actual: {} });
  });
  const after = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "anything", actual: {} });
  assert.equal(after, state, "no current session to touch -> the exact same state reference back");
});

// ---------------------------------------------------------------------------
// N — unit handling is deterministic.
// ---------------------------------------------------------------------------

console.log("\n10. Unit handling is deterministic (N)\n");

check("duration/distance/pace/heart-rate formatting is deterministic and unit-aware", () => {
  assert.equal(formatDurationMinutes(1800), "30 min");
  assert.equal(formatDurationMinutes(1800), formatDurationMinutes(1800));
  assert.equal(formatDistance({ value: 5, unit: "km" }), "5 km");
  assert.equal(formatDistance({ value: 3.2, unit: "mi" }), "3.2 mi");
  assert.equal(formatDistance({ value: 400, unit: "m" }), "400 m");
  assert.equal(formatPace({ value: 6.5, unit: "min_per_km" }), "6:30/km");
  assert.equal(formatHeartRate({ low: 135, high: 150 }), "135–150 BPM");
  assert.equal(formatHeartRate({ low: 135, high: 150, zoneLabel: "Zone 2" }), "Zone 2 (135–150 BPM)");
});

check("classifyContinuousCompletion is a pure, deterministic function of prescription + actual", () => {
  const prescription = { family: "continuous" as const, duration: { seconds: 1800 } };
  const first = classifyContinuousCompletion(prescription, { durationSeconds: 1600 });
  const second = classifyContinuousCompletion(prescription, { durationSeconds: 1600 });
  assert.equal(first, second, "the same inputs must always produce the same classification");
  assert.equal(first, "partial", "1600/1800 = 88.9%, honestly under the 90% completion threshold");
});

check("the completion threshold boundary is exact and honest, never a fuzzy guess", () => {
  const prescription = { family: "continuous" as const, duration: { seconds: 1800 } };
  assert.equal(classifyContinuousCompletion(prescription, { durationSeconds: 1620 }), "completed", "exactly 90% is still completed");
  assert.equal(classifyContinuousCompletion(prescription, { durationSeconds: 1619 }), "partial", "one second under 90% is honestly partial");
});

// ---------------------------------------------------------------------------
// O — source prescription is never destructively mutated.
// ---------------------------------------------------------------------------

console.log("\n11. resolvedSession is never mutated by continuous logging (O)\n");

check("resolvedSession's own JSON is byte-identical before and after a full continuous log/complete sequence", () => {
  const state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.resolvedSession);
  let next = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  next = reducer(next, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "zone2-bike-solo", actual: { duration: { seconds: 900 } } });
  assert.equal(JSON.stringify(next.workoutSession.resolvedSession), before);
});

// ---------------------------------------------------------------------------
// P — summary never fabricates resistance metrics for continuous work.
// ---------------------------------------------------------------------------

console.log("\n12. Summary never produces bogus resistance metrics for continuous-only work (P)\n");

check("a fully completed PURE continuous session reports zero resistance metrics honestly, never a fabricated set count", () => {
  let state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, {
    type: "LOG_CONTINUOUS_EXECUTION",
    exerciseId: "zone2-bike-solo",
    actual: { duration: { seconds: 1800 }, heartRate: { low: 140, high: 148 } },
  });
  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:30:00.000Z");
  assert.equal(summary.workingSetsCompleted, 0, "no resistance sets exist in this session at all");
  assert.equal(summary.missingRpeCount, 0);
  assert.equal(summary.averageRpe, null, "never a fabricated RPE average with no RPE data");
  assert.equal(summary.exercisesCompleted, 1);
  assert.equal(summary.fullyCompleted, true);
  assert.match(summary.detail, /Stationary Bike/);
  assert.doesNotMatch(summary.headline, /No performance data/i, "real continuous data was submitted -- this must never be reported as nothing submitted");
});

check("COMPLETE_WORKOUT accepts a pure continuous session's summary (the old workingSetsCompleted-only guard would have wrongly refused this)", () => {
  let state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "zone2-bike-solo", actual: { duration: { seconds: 1800 } } });
  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:30:00.000Z");
  const completed = reducer(state, { type: "COMPLETE_WORKOUT", summary });
  assert.equal(completed.workoutSession.status, "completed");
});

check("a genuinely empty session (nothing logged at all) is still correctly reported as no performance data", () => {
  const state = startFromFixture(CONTINUOUS_BIKE_SESSION_DEMO);
  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:01:00.000Z");
  assert.match(summary.headline, /No performance data/i);
  const completed = reducer(state, { type: "COMPLETE_WORKOUT", summary });
  assert.equal(completed.workoutSession.status, "in-progress", "the guard correctly refuses -- status stays exactly what it was, never advances to completed");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
