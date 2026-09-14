// Phase 11A — interval/HIIT execution verification. Proves the universal
// Session/Block/TrainingItemInstance/Prescription engine natively supports
// a distinct "interval" execution family — round/phase state machine,
// round-level actuals, timer-free deterministic transitions, safety
// integration — without corrupting resistance (lib/workout/verify-workout-flow.mts's
// 67 tests) or continuous (lib/workout/verify-continuous-execution.mts's 25
// tests) execution, still exhaustively covered elsewhere, unchanged. Maps
// onto the Phase 11A spec's own required test matrix (section 33, A-AA) and
// required acceptance scenarios (section 32, A-F), noted per section below.
// Run with: npm run verify:interval-execution

import assert from "node:assert/strict";
import { createInitialState, reducer, buildStartedWorkoutSession } from "../state.ts";
import { validateSession } from "../production/validation.ts";
import { buildWorkoutSummary } from "../workout-analysis.ts";
import { findTrainingItemById } from "./session-flow.ts";
import {
  classifyIntervalActivityCompletion,
  describeIntervalOverview,
  describeIntervalPhaseTarget,
  formatIntervalSeconds,
  hasRecoveryPhase,
  intervalPerformedAsPrescribed,
  nextIntervalProgress,
  totalIntervalRounds,
} from "./interval.ts";
import {
  BIKE_INTERVALS_SESSION_DEMO,
  RUN_INTERVALS_SESSION_DEMO,
  MIXED_SESSION_WITH_INTERVALS_DEMO,
} from "../training/demo-fixtures.ts";
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
// A, C, D, E, Z — interval prescriptions validate; rounds/work-time required
// fields behave correctly against the universal grammar validator.
// ---------------------------------------------------------------------------

console.log("\n1. Interval fixtures validate against the universal grammar (A, D, E, Z)\n");

check("the time-based bike-intervals fixture validates", () => {
  validateSession(BIKE_INTERVALS_SESSION_DEMO, "bike intervals fixture");
});

check("the distance-based run-intervals fixture (including recoveryDistance) validates", () => {
  validateSession(RUN_INTERVALS_SESSION_DEMO, "run intervals fixture");
});

check("the mixed warm-up/resistance/interval/cooldown fixture validates", () => {
  validateSession(MIXED_SESSION_WITH_INTERVALS_DEMO, "mixed session with intervals fixture");
});

// ---------------------------------------------------------------------------
// Pure lib/workout/interval.ts state-machine/formatter coverage.
// ---------------------------------------------------------------------------

console.log("\n2. Pure interval state machine and formatters\n");

check("nextIntervalProgress: work -> recovery -> next round's work, deterministically", () => {
  const prescription = BIKE_INTERVALS_SESSION_DEMO.blocks[0].items[0].prescription;
  const afterWork = nextIntervalProgress(prescription, { round: 1, phase: "work" });
  assert.deepEqual(afterWork, { round: 1, phase: "recovery" });
  const afterRecovery = nextIntervalProgress(prescription, { round: 1, phase: "recovery" });
  assert.deepEqual(afterRecovery, { round: 2, phase: "work" });
});

check("nextIntervalProgress: final round's recovery -> complete", () => {
  const prescription = BIKE_INTERVALS_SESSION_DEMO.blocks[0].items[0].prescription;
  const result = nextIntervalProgress(prescription, { round: 6, phase: "recovery" });
  assert.equal(result, "complete");
});

check("nextIntervalProgress: a prescription with no recovery phase goes straight to the next round's work", () => {
  const prescription = { family: "interval" as const, rounds: 3, workInterval: { seconds: 20 } };
  assert.equal(hasRecoveryPhase(prescription), false);
  const result = nextIntervalProgress(prescription, { round: 1, phase: "work" });
  assert.deepEqual(result, { round: 2, phase: "work" });
});

check("nextIntervalProgress: final round's work with no recovery phase -> complete directly", () => {
  const prescription = { family: "interval" as const, rounds: 2, workInterval: { seconds: 20 } };
  assert.equal(nextIntervalProgress(prescription, { round: 2, phase: "work" }), "complete");
});

check("totalIntervalRounds defaults honestly to 1 for a malformed/missing rounds value, never crashes", () => {
  assert.equal(totalIntervalRounds({ family: "interval" }), 1);
  assert.equal(totalIntervalRounds({ family: "interval", rounds: 0 }), 1);
});

check("formatIntervalSeconds never collapses a real interval down to whole minutes", () => {
  assert.equal(formatIntervalSeconds(45), "45 sec");
  assert.equal(formatIntervalSeconds(90), "90 sec");
});

check("describeIntervalOverview describes rounds, work/recovery, and target RPE — nothing fabricated", () => {
  const lines = describeIntervalOverview(BIKE_INTERVALS_SESSION_DEMO.blocks[0].items[0].prescription);
  assert.deepEqual(lines, ["6 rounds", "45 sec work / 75 sec recovery", "Target RPE 9"]);
});

check("describeIntervalOverview describes a distance-based interval with a distance-based recovery", () => {
  const lines = describeIntervalOverview(RUN_INTERVALS_SESSION_DEMO.blocks[0].items[0].prescription);
  assert.deepEqual(lines, ["8 rounds", "400 m work / 200 m recovery", "Target pace 1:42/km"]);
});

check("describeIntervalPhaseTarget shows work-phase and recovery-phase lines distinctly", () => {
  const prescription = BIKE_INTERVALS_SESSION_DEMO.blocks[0].items[0].prescription;
  assert.deepEqual(describeIntervalPhaseTarget(prescription, "work"), ["45 sec", "Target RPE 9"]);
  assert.deepEqual(describeIntervalPhaseTarget(prescription, "recovery"), ["75 sec"]);
});

check("describeIntervalPhaseTarget's recovery line falls back to plain guidance when nothing is prescribed", () => {
  const prescription = { family: "interval" as const, rounds: 3, workInterval: { seconds: 20 } };
  assert.deepEqual(describeIntervalPhaseTarget(prescription, "recovery"), ["Easy — recover"]);
});

// ---------------------------------------------------------------------------
// A/32A — full time-based interval completion (acceptance scenario A).
// ---------------------------------------------------------------------------

console.log("\n3. Full time-based interval completion — 6 rounds, all completed (32A)\n");

check("starting the bike-intervals session lands on interval-ready, never continuous-ready", () => {
  const state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "interval-ready");
  assert.equal(state.workoutSession.currentExerciseId, "bike-intervals-solo");
});

check("BEGIN_INTERVAL_EXECUTION opens round 1's work phase with a real timestamp anchor", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  assert.equal(state.workoutSession.phase, "interval-active");
  const progress = state.workoutSession.intervalProgress?.["bike-intervals-solo"];
  assert.ok(progress);
  assert.equal(progress!.round, 1);
  assert.equal(progress!.phase, "work");
  assert.ok(progress!.phaseStartedAtIso);
  assert.deepEqual(progress!.roundActuals, []);
});

check("walking through all 6 rounds (I, J, K) resolves the item and advances the session, with 6 real round actuals preserved", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });

  for (let round = 1; round <= 6; round++) {
    // I — work -> recovery transition.
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
    if (round < 6) {
      assert.equal(state.workoutSession.phase, "interval-active", `round ${round}: still active after work`);
      assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.phase, "recovery");
      // J — recovery -> next round's work transition.
      state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
      assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.round, round + 1);
      assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.phase, "work");
    } else {
      // K — final round's work -> recovery, then recovery -> complete.
      assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.phase, "recovery");
      state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
      assert.equal(state.workoutSession.phase, "interval-logging", "K: final round done -> the one-shot final capture step");
    }
  }

  const beforeFinalize = state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.roundActuals ?? [];
  assert.equal(beforeFinalize.length, 6, "all 6 rounds recorded before finalizing");
  assert.ok(beforeFinalize.every((r) => r.status === "completed"));
  assert.ok(beforeFinalize.every((r) => r.actualWorkSeconds === 45), "M: real actuals captured per round, not assumed");

  state = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo", rpe: 9 });
  assert.equal(state.workoutSession.phase, "session-summary", "the only item resolved -> straight to summary");

  const execution = state.workoutSession.continuousExecutions?.["bike-intervals-solo"];
  assert.ok(execution);
  assert.equal(execution!.status, "completed");
  assert.equal(execution!.performedAsPrescribed, true);
  assert.equal(execution!.roundActuals?.length, 6, "M: round actuals preserved on the real ExecutionRecord");
  assert.equal(execution!.actual?.rpe, 9);
  assert.equal(state.workoutSession.exerciseLogs["bike-intervals-solo"].status, "completed");
  assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"], undefined, "transient progress cleared once finalized");

  // R — round actuals survive being read back exactly as written (the
  // in-memory equivalent of "survives reload" — the persisted shape is
  // identical either way, per lib/history/build-daily-record.ts's deep clone).
  const roundNumbers = execution!.roundActuals!.map((r) => r.roundNumber);
  assert.deepEqual(roundNumbers, [1, 2, 3, 4, 5, 6]);
});

// ---------------------------------------------------------------------------
// B/32B, N — partial completion: 4 of 6 rounds, then the client finishes
// early. No fabricated final two rounds.
// ---------------------------------------------------------------------------

console.log("\n4. Partial interval completion — 4 of 6 rounds, then finish early (32B, N)\n");

check("finishing early after 4 rounds classifies as partial, with exactly 4 real round actuals — never 6 fabricated ones", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });

  for (let round = 1; round <= 4; round++) {
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
  }
  assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.round, 5, "round 5 not yet attempted");
  assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.roundActuals.length, 4);

  // Finish now — an explicit early end, still in "interval-active" (never
  // naturally reached "interval-logging").
  state = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });

  const execution = state.workoutSession.continuousExecutions?.["bike-intervals-solo"];
  assert.ok(execution);
  assert.equal(execution!.status, "partial");
  assert.equal(execution!.performedAsPrescribed, false);
  assert.equal(execution!.roundActuals?.length, 4, "exactly 4 real rounds — rounds 5 and 6 are simply absent, never fabricated");
  assert.equal(classifyIntervalActivityCompletion(BIKE_INTERVALS_SESSION_DEMO.blocks[0].items[0].prescription, execution!.roundActuals!), "partial");
  assert.equal(intervalPerformedAsPrescribed(BIKE_INTERVALS_SESSION_DEMO.blocks[0].items[0].prescription, execution!.roundActuals!), false);

  const item = findTrainingItemById(state.workoutSession.resolvedSession, "bike-intervals-solo")!;
  assert.equal(item.prescription.rounds, 6, "N: the ORIGINAL 6-round prescription is never rewritten to reflect what happened");
});

// ---------------------------------------------------------------------------
// C/32C — distance-based interval, including distance-based recovery.
// ---------------------------------------------------------------------------

console.log("\n5. Distance-based interval — 8 x 400m, distance-based recovery (32C, E)\n");

check("the distance-based interval has no time-based work interval and never fabricates one", () => {
  const item = findTrainingItemById(RUN_INTERVALS_SESSION_DEMO, "run-intervals-solo")!;
  assert.equal(item.prescription.workInterval, undefined);
  assert.equal(item.prescription.distance?.value, 400);
  assert.equal(item.prescription.recoveryDistance?.value, 200);
});

check("a distance-based interval executes through the exact same round/phase state machine, with a client-entered actual distance", () => {
  let state = startFromFixture(RUN_INTERVALS_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "interval-ready");
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "run-intervals-solo" });

  for (let round = 1; round <= 8; round++) {
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "run-intervals-solo", actualDistanceValue: 400 });
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "run-intervals-solo" });
  }
  assert.equal(state.workoutSession.phase, "interval-logging");
  state = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "run-intervals-solo" });

  const execution = state.workoutSession.continuousExecutions?.["run-intervals-solo"];
  assert.ok(execution);
  assert.equal(execution!.status, "completed");
  assert.equal(execution!.roundActuals?.length, 8);
  assert.ok(execution!.roundActuals!.every((r) => r.actualWorkDistanceValue === 400));
});

// ---------------------------------------------------------------------------
// O/32F, 15 — skipping one round vs. skipping the whole activity.
// ---------------------------------------------------------------------------

console.log("\n6. Skip one round vs. skip the whole activity (O, 32F)\n");

check("skipping ONE round (skipped: true) preserves that round's status distinctly from a completed one, and continues the activity", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", skipped: true });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
  const progress = state.workoutSession.intervalProgress?.["bike-intervals-solo"];
  assert.equal(progress?.round, 2, "the activity continues to round 2");
  assert.equal(progress?.roundActuals[0]?.status, "skipped");
});

check("skipping the WHOLE activity via SKIP_EXERCISE after 2 completed rounds preserves those rounds as a real partial record (14 — preserve completed rounds)", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
  assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.roundActuals.length, 2);

  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "bike-intervals-solo", reason: "schedule-conflict", note: "Had to leave early." });

  assert.equal(state.workoutSession.exerciseLogs["bike-intervals-solo"].status, "skipped");
  assert.equal(state.workoutSession.exerciseLogs["bike-intervals-solo"].skipReason, "schedule-conflict");
  const execution = state.workoutSession.continuousExecutions?.["bike-intervals-solo"];
  assert.ok(execution, "the 2 completed rounds must not be silently lost");
  assert.equal(execution!.status, "partial");
  assert.equal(execution!.roundActuals?.length, 2);
  assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"], undefined);
  assert.equal(state.workoutSession.phase, "session-summary");
});

check("skipping the activity BEFORE starting it (from interval-ready) never fabricates a round-based execution record — a plain skip, exactly like continuous", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "bike-intervals-solo", reason: "feeling-sick" });
  assert.equal(state.workoutSession.exerciseLogs["bike-intervals-solo"].status, "skipped");
  assert.equal(state.workoutSession.continuousExecutions?.["bike-intervals-solo"], undefined);
});

// ---------------------------------------------------------------------------
// P/32E — pain interruption during an interval preserves completed rounds
// and blocks further progression, never silently continuing.
// ---------------------------------------------------------------------------

console.log("\n7. Pain interruption during an interval round (32E, P)\n");

function reportPain(state: AppState, exerciseId: string, overrides: Partial<{ ratingZeroToTen: number; continuedAfterSet: boolean; affectsOutsideGym: boolean }> = {}): AppState {
  return reducer(state, {
    type: "REPORT_PAIN",
    exerciseId,
    location: "Knee",
    ratingZeroToTen: overrides.ratingZeroToTen ?? 6,
    onset: "During the work interval",
    causedByMovement: "Pedaling hard",
    continuedAfterSet: overrides.continuedAfterSet ?? false,
    affectsOutsideGym: overrides.affectsOutsideGym ?? false,
    symptomQuality: "aching",
  });
}

check("reporting pain mid-interval blocks ADVANCE_INTERVAL_PHASE/FINALIZE_INTERVAL_EXECUTION and preserves rounds already completed", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
  assert.equal(state.workoutSession.intervalProgress?.["bike-intervals-solo"]?.roundActuals.length, 1);

  state = reportPain(state, "bike-intervals-solo", { ratingZeroToTen: 6 });
  assert.equal(state.workoutSession.phase, "pain-review");

  const blockedAdvance = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
  assert.equal(blockedAdvance.workoutSession.phase, "pain-review", "must never silently continue the interval");
  assert.equal(blockedAdvance.workoutSession.intervalProgress?.["bike-intervals-solo"]?.roundActuals.length, 1, "the completed round is preserved, untouched");

  const blockedFinalize = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  assert.equal(blockedFinalize.workoutSession.phase, "pain-review");
  assert.equal(blockedFinalize.workoutSession.continuousExecutions?.["bike-intervals-solo"], undefined, "no execution can be finalized while blocked");
});

check("a resume-eligible (mild) pain report resumes DIRECTLY into interval-active at the same round, never discarding progress or requiring a restart", () => {
  let state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" }); // now round 2, work

  // Mild: rating 1-3, did not continue after, no outside-gym effect, no
  // concerning symptom quality -> resume-eligible per lib/workout/pain-policy.ts.
  state = reportPain(state, "bike-intervals-solo", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  assert.equal(state.workoutSession.activePainInterruption?.severity, "resume-eligible");

  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });

  assert.equal(state.workoutSession.phase, "interval-active", "resumes directly into the live interval flow, never a blank/wrong screen");
  assert.equal(state.workoutSession.activePainInterruption, null);
  const progress = state.workoutSession.intervalProgress?.["bike-intervals-solo"];
  assert.equal(progress?.round, 2, "exactly where the client left off");
  assert.equal(progress?.roundActuals.length, 1, "round 1's completed data survived the interruption untouched");
});

check("a resume-eligible pain report on a CONTINUOUS item also resumes correctly (regression fix — previously hardcoded to a resistance-only 'set-ready' phase)", () => {
  const continuousFixture: Session = {
    id: "continuous-pain-fixture",
    name: "Zone 2 Bike",
    focus: "Aerobic",
    estimatedDurationMin: 20,
    blocks: [{ id: "block-bike", kind: "straight", order: 1, items: [{ id: "bike-solo", order: 1, name: "Bike", category: "continuous", prescription: { family: "continuous", duration: { seconds: 1200 } } }] }],
  };
  let state = startFromFixture(continuousFixture);
  state = reportPain(state, "bike-solo", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  assert.equal(state.workoutSession.activePainInterruption?.severity, "resume-eligible");
  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });
  assert.equal(state.workoutSession.phase, "continuous-ready", "never the old hardcoded set-ready, which would have rendered a blank screen for a continuous item");
});

// ---------------------------------------------------------------------------
// H, Q — mixed session: warm-up (continuous) -> resistance -> interval ->
// cooldown (continuous), one universal engine, no separate HIIT engine.
// ---------------------------------------------------------------------------

console.log("\n8. Mixed session: warm-up -> resistance -> interval -> cooldown (32D, H, Q)\n");

check("the mixed session starts on the warm-up's own continuous-ready phase, in authored block order", () => {
  const state = startFromFixture(MIXED_SESSION_WITH_INTERVALS_DEMO);
  assert.equal(state.workoutSession.currentExerciseId, "warmup-bike");
  assert.equal(state.workoutSession.phase, "continuous-ready");
});

check("walking warm-up -> resistance -> interval -> cooldown completes the whole mixed session through ONE universal engine", () => {
  let state = startFromFixture(MIXED_SESSION_WITH_INTERVALS_DEMO);

  // Warm-up (continuous).
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "warmup-bike", actual: { duration: { seconds: 300 } } });
  assert.equal(state.workoutSession.currentExerciseId, "bench-press");
  assert.equal(state.workoutSession.phase, "exercise-transition");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "exercise-intro", "resistance keeps its own real intro/warm-up flow unchanged");

  // Resistance.
  state = reducer(state, { type: "BEGIN_EXERCISE" });
  assert.equal(state.workoutSession.phase, "exercise-warmup", "warmupSets: 1 configures a real stepped warm-up");
  state = reducer(state, { type: "ADVANCE_EXERCISE_WARMUP" });
  for (const setNumber of [2, 3, 4]) {
    state = reducer(state, { type: "LOG_SET", exerciseId: "bench-press", setNumber, isWarmup: false, weightLb: 135, reps: 7, rpe: 8, performedAsPrescribed: true });
    state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
  }
  assert.equal(state.workoutSession.currentExerciseId, "bike-intervals-mixed");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "interval-ready", "H: interval is a distinct family, never falling through to continuous-ready");

  // Interval (4 rounds, per the mixed fixture).
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-mixed" });
  for (let round = 1; round <= 4; round++) {
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-mixed", actualSeconds: 30 });
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-mixed" });
  }
  assert.equal(state.workoutSession.phase, "interval-logging");
  state = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "bike-intervals-mixed" });
  assert.equal(state.workoutSession.currentExerciseId, "cooldown-walk");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "continuous-ready", "the cooldown is a plain continuous item, unaffected by interval existing in the same session");

  // Cooldown (continuous).
  state = reducer(state, { type: "BEGIN_CONTINUOUS_LOGGING" });
  state = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "cooldown-walk", actual: { duration: { seconds: 300 } } });
  assert.equal(state.workoutSession.phase, "session-summary", "Q: session advancement correctly reaches the end after all 4 items");

  // H — each family's own data stayed correctly associated, never
  // cross-contaminated.
  assert.equal(state.workoutSession.exerciseLogs["bench-press"].loggedSets.length, 3);
  assert.equal(state.workoutSession.continuousExecutions?.["bench-press"], undefined);
  assert.ok(state.workoutSession.continuousExecutions?.["bike-intervals-mixed"]?.roundActuals);
  assert.equal(state.workoutSession.continuousExecutions?.["bike-intervals-mixed"]?.roundActuals?.length, 4);
  assert.equal(state.workoutSession.continuousExecutions?.["warmup-bike"]?.roundActuals, undefined, "a plain continuous item never gains roundActuals");

  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:50:00.000Z");
  assert.equal(summary.exercisesCompleted, 4, "all 4 items across all 4 families count");
  assert.equal(summary.workingSetsCompleted, 3, "only the resistance item's working sets count toward this resistance-specific tally");

  const completed = reducer(state, { type: "COMPLETE_WORKOUT", summary });
  assert.equal(completed.workoutSession.status, "completed", "the full mixed session completes correctly end to end");
});

// ---------------------------------------------------------------------------
// L — cross-family confusion is structurally prevented (mirrors the
// continuous suite's own K/L section).
// ---------------------------------------------------------------------------

console.log("\n9. Cross-family confusion is structurally prevented (L)\n");

check("ADVANCE_INTERVAL_PHASE on a resistance item's id is a safe no-op", () => {
  const state = startFromFixture(MIXED_SESSION_WITH_INTERVALS_DEMO);
  const after = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bench-press", actualSeconds: 30 });
  assert.equal(after, state, "not the current item and not an interval at all -> exact same state reference back");
});

check("LOG_CONTINUOUS_EXECUTION on an interval item's id is a safe no-op (interval has its own dedicated actions)", () => {
  const state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  const after = reducer(state, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "bike-intervals-solo", actual: {} });
  assert.equal(after.workoutSession.continuousExecutions?.["bike-intervals-solo"], undefined);
  assert.equal(after.workoutSession.exerciseLogs["bike-intervals-solo"].status, "not-started");
});

check("BEGIN_INTERVAL_EXECUTION on a continuous item's id is a safe no-op", () => {
  const continuousFixture: Session = {
    id: "guard-fixture",
    name: "Bike",
    focus: "Aerobic",
    estimatedDurationMin: 20,
    blocks: [{ id: "block-bike", kind: "straight", order: 1, items: [{ id: "bike-solo", order: 1, name: "Bike", category: "continuous", prescription: { family: "continuous", duration: { seconds: 1200 } } }] }],
  };
  const state = startFromFixture(continuousFixture);
  const after = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-solo" });
  assert.equal(after, state);
});

// ---------------------------------------------------------------------------
// B, C — malformed interval content is rejected; rounds/work-target are
// required where applicable. M — a genuinely minimal-but-VALID interval
// item still executes safely.
// ---------------------------------------------------------------------------

console.log("\n10. Malformed interval content is rejected; a minimal valid one executes safely (B, C, M)\n");

check("B: an interval prescription with no rounds at all is rejected by validation, never silently accepted", () => {
  const malformed: Session = {
    id: "malformed-interval",
    name: "Malformed",
    focus: "Malformed",
    estimatedDurationMin: 5,
    blocks: [{ id: "block-malformed", kind: "interval", order: 1, items: [{ id: "malformed-item", order: 1, name: "Missing Rounds", category: "interval", prescription: { family: "interval", workInterval: { seconds: 20 } } }] }],
  };
  assert.throws(() => validateSession(malformed, "malformed interval session"));
});

check("C: an interval prescription with rounds but no real work target (neither workInterval nor distance) is rejected", () => {
  const malformed: Session = {
    id: "malformed-interval-2",
    name: "Malformed",
    focus: "Malformed",
    estimatedDurationMin: 5,
    blocks: [{ id: "block-malformed-2", kind: "interval", order: 1, items: [{ id: "malformed-item-2", order: 1, name: "No Work Target", category: "interval", prescription: { family: "interval", rounds: 4 } }] }],
  };
  assert.throws(() => validateSession(malformed, "malformed interval session 2"));
});

check("M: a genuinely minimal but VALID interval item (rounds + a work target, nothing else) still executes safely end to end", () => {
  const minimalFixture: Session = {
    id: "minimal-interval",
    name: "Minimal Interval",
    focus: "Minimal",
    estimatedDurationMin: 5,
    blocks: [{ id: "block-minimal", kind: "interval", order: 1, items: [{ id: "minimal-interval-item", order: 1, name: "Minimal Interval", category: "interval", prescription: { family: "interval", rounds: 1, workInterval: { seconds: 20 } } }] }],
  };
  validateSession(minimalFixture, "minimal interval session");
  let state = startFromFixture(minimalFixture);
  assert.equal(state.workoutSession.phase, "interval-ready");
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "minimal-interval-item" });
  state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "minimal-interval-item", actualSeconds: 20 });
  assert.equal(state.workoutSession.phase, "interval-logging", "1 round, no recovery -> immediately complete after round 1's work");
  state = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "minimal-interval-item" });
  assert.equal(state.workoutSession.continuousExecutions?.["minimal-interval-item"]?.status, "completed");
});

// ---------------------------------------------------------------------------
// O — resolvedSession is never mutated by interval logging.
// ---------------------------------------------------------------------------

console.log("\n11. resolvedSession is never mutated by interval execution (O)\n");

check("resolvedSession's own JSON is byte-identical before and after a full interval round/finalize sequence", () => {
  const state = startFromFixture(BIKE_INTERVALS_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.resolvedSession);
  let next = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  next = reducer(next, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo", actualSeconds: 45 });
  next = reducer(next, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "bike-intervals-solo" });
  next = reducer(next, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "bike-intervals-solo" });
  assert.equal(JSON.stringify(next.workoutSession.resolvedSession), before);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
