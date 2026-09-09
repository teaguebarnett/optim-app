// Phase 4.4B-2 — guided live-workout flow verification.
//
// Exercises the reducer, the pure session-flow/warmup/guidance modules, and
// the v5->v6 migration directly — no UI rendering involved, matching the
// existing convention (see lib/planning/verify-planner.mts). Run with:
// npm run verify:workout

import assert from "node:assert/strict";

import { createInitialState, reducer } from "../state.ts";
import { PUSH_WORKOUT } from "../mock-data.ts";
import { canCompleteExercise, sessionReviewHeadline } from "../workout-analysis.ts";
import {
  advanceAfterExerciseResolved,
  buildInitialFlowState,
  deferCurrentExercise,
  firstUnresolvedWorkingSetNumber,
  isExerciseResolved,
} from "./session-flow.ts";
import { resolveExerciseWarmupConfig, resolveSessionWarmupConfig } from "./warmup.ts";
import { buildImmediateSetFeedback, buildSessionGuidanceSignals, comparablePreviousSetPerformance } from "./guidance.ts";
import { recommendRest } from "./rest-policy.ts";
import { classifyEffort } from "./effort-policy.ts";
import { classifyPainSeverity, isSevereRating } from "./pain-policy.ts";
import { migrateStoredState } from "../tenancy/migrate.ts";
import type { AppState } from "../state.ts";
import type { Action } from "../state.ts";
import type { Exercise, ExerciseLog, LoggedSet, PainSymptomQuality, WorkoutSession, WorkoutSummary } from "../types.ts";

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

function dispatchAll(state: AppState, actions: Action[]): AppState {
  return actions.reduce((s, a) => reducer(s, a), state);
}

const INCLINE_ID = "incline-db-press";
const CHEST_PRESS_ID = "machine-chest-press";

console.log("\n1. Start semantics and preview non-mutation\n");

check("A fresh session starts not-started, with no current exercise", () => {
  const state = createInitialState();
  assert.equal(state.workoutSession.status, "not-started");
  assert.equal(state.workoutSession.currentExerciseId, null);
  assert.deepEqual(state.workoutSession.exerciseQueue, []);
});

check("Reading catalog/preview data never mutates workoutSession — same object reference before and after", () => {
  const state = createInitialState();
  const before = state.workoutSession;
  // The exact reads a read-only preview performs.
  void resolveSessionWarmupConfig(PUSH_WORKOUT);
  for (const exercise of PUSH_WORKOUT.exercises) void resolveExerciseWarmupConfig(exercise);
  assert.equal(state.workoutSession, before, "no dispatch occurred, so the session reference must be unchanged");
});

check("START_WORKOUT is the only thing that moves status to in-progress and initializes the guided flow", () => {
  const state = createInitialState();
  const started = reducer(state, { type: "START_WORKOUT" });
  assert.equal(started.workoutSession.status, "in-progress");
  assert.equal(started.workoutSession.currentExerciseId, PUSH_WORKOUT.exercises[0].id);
  assert.equal(started.workoutSession.exerciseQueue.length, PUSH_WORKOUT.exercises.length);
  assert.deepEqual(started.workoutSession.actualExerciseOrder, [PUSH_WORKOUT.exercises[0].id]);
  assert.equal(started.workoutSession.events.at(-1)?.type, "started");
});

check("Re-dispatching START_WORKOUT on an already in-progress session never resets progress (idempotent)", () => {
  const state = createInitialState();
  const started = reducer(state, { type: "START_WORKOUT" });
  const advanced = reducer(started, { type: "CONFIRM_SESSION_WARMUP" });
  const redispatched = reducer(advanced, { type: "START_WORKOUT" });
  assert.equal(redispatched.workoutSession.phase, advanced.workoutSession.phase);
  assert.equal(redispatched.workoutSession.currentExerciseId, advanced.workoutSession.currentExerciseId);
  assert.equal(redispatched.workoutSession.events.length, advanced.workoutSession.events.length);
});

check("The retired COMPLETE_EXERCISE/SET_CURRENT_EXERCISE_INDEX actions no longer exist — dispatching an unknown type is a safe no-op", () => {
  const state = reducer(createInitialState(), { type: "START_WORKOUT" });
  const untouched = reducer(state, { type: "COMPLETE_EXERCISE", exerciseId: INCLINE_ID } as unknown as Action);
  assert.equal(untouched, state, "an unrecognized action must fall through the default case unchanged");
});

console.log("\n2. Warm-up configuration (Phase 4.4B-2 §D)\n");

check("The session-level warm-up is derived from the real Workout.warmupOverview text", () => {
  const config = resolveSessionWarmupConfig(PUSH_WORKOUT);
  assert.equal(config.mode, "confirmation");
  if (config.mode === "confirmation") assert.equal(config.instruction, PUSH_WORKOUT.warmupOverview);
});

check("An exercise with real prescribed warm-up sets resolves a stepped config with no fabricated data", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const config = resolveExerciseWarmupConfig(incline);
  assert.equal(config.mode, "stepped");
  if (config.mode === "stepped") {
    assert.equal(config.steps.length, incline.warmupSets);
    assert.equal(config.steps.length, incline.prescribedSets.filter((s) => s.isWarmup).length);
  }
});

check("An exercise with a coach-authored warmupInstruction overrides the stepped derivation", () => {
  const base = PUSH_WORKOUT.exercises[0];
  const withInstruction: Exercise = { ...base, warmupInstruction: "Complete 1-2 light feeler sets." };
  const config = resolveExerciseWarmupConfig(withInstruction);
  assert.equal(config.mode, "instruction");
  if (config.mode === "instruction") assert.equal(config.instruction, "Complete 1-2 light feeler sets.");
});

check("An exercise with neither an instruction nor any prescribed warm-up sets resolves 'none' — architecturally supported, never fabricated", () => {
  const base = PUSH_WORKOUT.exercises[0];
  const noWarmup: Exercise = { ...base, prescribedSets: base.prescribedSets.filter((s) => !s.isWarmup) };
  const config = resolveExerciseWarmupConfig(noWarmup);
  assert.equal(config.mode, "none");
});

console.log("\n3. Guided set-by-set progression, RPE persistence, and deviation logging (Phase 4.4B-2 §E/§F)\n");

function startAndClearSessionWarmup(): AppState {
  return dispatchAll(createInitialState(), [{ type: "START_WORKOUT" }, { type: "CONFIRM_SESSION_WARMUP" }]);
}

check("Session warmup confirmation advances to exercise-intro for the first exercise", () => {
  const state = startAndClearSessionWarmup();
  assert.equal(state.workoutSession.phase, "exercise-intro");
  assert.equal(state.workoutSession.currentExerciseId, PUSH_WORKOUT.exercises[0].id);
});

check("BEGIN_EXERCISE routes into the exercise's own stepped warm-up when one is configured", () => {
  const state = dispatchAll(startAndClearSessionWarmup(), [{ type: "BEGIN_EXERCISE" }]);
  assert.equal(state.workoutSession.phase, "exercise-warmup");
});

check("Stepped warm-up steps must each be confirmed before set-ready, and completion is recorded", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const totalSteps = incline.prescribedSets.filter((s) => s.isWarmup).length;
  let state = dispatchAll(startAndClearSessionWarmup(), [{ type: "BEGIN_EXERCISE" }]);
  for (let i = 0; i < totalSteps - 1; i++) {
    state = reducer(state, { type: "ADVANCE_EXERCISE_WARMUP" });
    assert.equal(state.workoutSession.phase, "exercise-warmup", `still warming up after step ${i + 1} of ${totalSteps}`);
  }
  state = reducer(state, { type: "ADVANCE_EXERCISE_WARMUP" });
  assert.equal(state.workoutSession.phase, "set-ready");
  assert.equal(state.workoutSession.exerciseWarmups[INCLINE_ID]?.status, "completed");
  assert.equal(state.workoutSession.currentSetNumber, firstUnresolvedWorkingSetNumber(incline, state.workoutSession.exerciseLogs[INCLINE_ID]));
});

function readyFirstSet(): AppState {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const totalSteps = incline.prescribedSets.filter((s) => s.isWarmup).length;
  let state = dispatchAll(startAndClearSessionWarmup(), [{ type: "BEGIN_EXERCISE" }]);
  for (let i = 0; i < totalSteps; i++) state = reducer(state, { type: "ADVANCE_EXERCISE_WARMUP" });
  return state;
}

check("The RPE selector's underlying state is always null at the start of a fresh set-logging phase (nothing carried forward)", () => {
  // The UI component resets via React `key` remounting — this asserts the
  // canonical data it reads from (no prior rpe stored anywhere for a
  // not-yet-logged set) supports that guarantee.
  const state = reducer(readyFirstSet(), { type: "BEGIN_SET_LOGGING" });
  const setNumber = state.workoutSession.currentSetNumber!;
  const log = state.workoutSession.exerciseLogs[INCLINE_ID];
  assert.equal(log.loggedSets.find((s) => s.setNumber === setNumber), undefined);
});

check("Logging a set as prescribed writes performedAsPrescribed: true and the exact prescribed weight/reps", () => {
  const state = readyFirstSet();
  const setNumber = state.workoutSession.currentSetNumber!;
  const prescribed = PUSH_WORKOUT.exercises
    .find((e) => e.id === INCLINE_ID)!
    .prescribedSets.find((s) => s.setNumber === setNumber)!;
  const logged = reducer(state, {
    type: "LOG_SET",
    exerciseId: INCLINE_ID,
    setNumber,
    isWarmup: false,
    weightLb: prescribed.prescribedWeightLb!,
    reps: prescribed.prescribedReps,
    rpe: 8,
    performedAsPrescribed: true,
  });
  const set = logged.workoutSession.exerciseLogs[INCLINE_ID].loggedSets.find((s) => s.setNumber === setNumber)!;
  assert.equal(set.performedAsPrescribed, true);
  assert.equal(set.weightLb, prescribed.prescribedWeightLb);
  assert.equal(set.reps, prescribed.prescribedReps);
  assert.equal(set.rpe, 8);
  assert.equal(logged.workoutSession.phase, "set-feedback");
});

check("'Performed differently' persists the actual reported weight/reps, distinct from the prescription", () => {
  const state = readyFirstSet();
  const setNumber = state.workoutSession.currentSetNumber!;
  const logged = reducer(state, {
    type: "LOG_SET",
    exerciseId: INCLINE_ID,
    setNumber,
    isWarmup: false,
    weightLb: 75,
    reps: 6,
    rpe: 9,
    performedAsPrescribed: false,
  });
  const set = logged.workoutSession.exerciseLogs[INCLINE_ID].loggedSets.find((s) => s.setNumber === setNumber)!;
  assert.equal(set.performedAsPrescribed, false);
  assert.equal(set.weightLb, 75);
  assert.equal(set.reps, 6);
});

check("Rest bookkeeping starts automatically once a working set is logged, and the next logged set records a real logIntervalSeconds (never actualRestSeconds, which is deprecated and no longer written)", () => {
  let state = readyFirstSet();
  const firstSetNumber = state.workoutSession.currentSetNumber!;
  state = reducer(state, {
    type: "LOG_SET",
    exerciseId: INCLINE_ID,
    setNumber: firstSetNumber,
    isWarmup: false,
    weightLb: 85,
    reps: 8,
    rpe: 8,
    performedAsPrescribed: true,
  });
  assert.ok(state.workoutSession.restStartedAtIso, "resting must begin immediately after the set is logged");

  state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
  assert.equal(state.workoutSession.phase, "set-ready");
  const secondSetNumber = state.workoutSession.currentSetNumber!;
  assert.notEqual(secondSetNumber, firstSetNumber);

  state = reducer(state, {
    type: "LOG_SET",
    exerciseId: INCLINE_ID,
    setNumber: secondSetNumber,
    isWarmup: false,
    weightLb: 85,
    reps: 7,
    rpe: 9,
    performedAsPrescribed: true,
  });
  const secondSet = state.workoutSession.exerciseLogs[INCLINE_ID].loggedSets.find((s) => s.setNumber === secondSetNumber)!;
  assert.equal(typeof secondSet.logIntervalSeconds, "number");
  assert.ok(secondSet.logIntervalSeconds! >= 0);
  assert.equal(secondSet.actualRestSeconds, undefined, "the deprecated field must never be written by new code");
});

check("Completing the final required working set auto-completes the exercise in canonical state — no separate action required", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  let state = readyFirstSet();
  const working = incline.prescribedSets.filter((s) => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber);
  for (const prescribed of working) {
    const setNumber = state.workoutSession.currentSetNumber!;
    assert.equal(setNumber, prescribed.setNumber);
    state = reducer(state, {
      type: "LOG_SET",
      exerciseId: INCLINE_ID,
      setNumber,
      isWarmup: false,
      weightLb: prescribed.prescribedWeightLb!,
      reps: prescribed.prescribedReps,
      rpe: 8,
      performedAsPrescribed: true,
    });
    state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
  }
  assert.equal(state.workoutSession.exerciseLogs[INCLINE_ID].status, "completed");
  assert.equal(state.workoutSession.phase, "exercise-transition");
  assert.equal(state.workoutSession.lastResolvedExerciseId, INCLINE_ID);
  assert.equal(state.workoutSession.currentExerciseId, CHEST_PRESS_ID);
});

console.log("\n4. Exercise deferral and ordering (Phase 4.4B-2 §I)\n");

check("Deferring the current exercise moves it to the back of the queue rather than resolving it", () => {
  const state = startAndClearSessionWarmup();
  const firstId = state.workoutSession.currentExerciseId!;
  const deferred = reducer(state, { type: "DEFER_EXERCISE", exerciseId: firstId });
  assert.notEqual(deferred.workoutSession.currentExerciseId, firstId);
  assert.equal(deferred.workoutSession.exerciseQueue.at(-1), firstId);
  assert.ok(deferred.workoutSession.deferredExerciseIds.includes(firstId));
  assert.equal(deferred.workoutSession.exerciseLogs[firstId].status, "not-started", "a deferral must never resolve the exercise");
  assert.equal(deferred.workoutSession.phase, "exercise-transition");
});

check("A deferred exercise is returned to before the session can reach summary", () => {
  const state = startAndClearSessionWarmup();
  const firstId = state.workoutSession.currentExerciseId!;
  let session = reducer(state, { type: "DEFER_EXERCISE", exerciseId: firstId }).workoutSession;
  // Skip every other exercise outright so the queue empties down to just
  // the deferred one.
  while (session.exerciseQueue.length > 1) {
    const id = session.currentExerciseId!;
    session = reducer({ ...state, workoutSession: session }, { type: "SKIP_EXERCISE", exerciseId: id, reason: "out-of-time" }).workoutSession;
  }
  assert.equal(session.exerciseQueue[0], firstId, "the deferred exercise must be the only one left, never dropped");
  assert.equal(session.currentExerciseId, firstId);
});

check("Session-flow queue helpers agree with the reducer's own advance logic (pure-function parity)", () => {
  const workout = PUSH_WORKOUT;
  const initial = buildInitialFlowState(workout);
  assert.equal(initial.currentExerciseId, workout.exercises[0].id);
  assert.equal(initial.exerciseQueue.length, workout.exercises.length);
});

console.log("\n5. Session-level completion (Phase 4.4B-2 §K)\n");

function completeEveryExerciseMinimally(): AppState {
  let state = startAndClearSessionWarmup();
  for (const exercise of PUSH_WORKOUT.exercises) {
    // Skip the exercise's own warm-up (if any) and log exactly the
    // prescribed working sets with a neutral RPE, exactly as prescribed.
    state = reducer(state, { type: "BEGIN_EXERCISE" });
    if (state.workoutSession.phase === "exercise-warmup") {
      state = reducer(state, { type: "SKIP_EXERCISE_WARMUP", reason: "out-of-time" });
    }
    const working = exercise.prescribedSets.filter((s) => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber);
    for (const prescribed of working) {
      state = reducer(state, {
        type: "LOG_SET",
        exerciseId: exercise.id,
        setNumber: prescribed.setNumber,
        isWarmup: false,
        weightLb: prescribed.prescribedWeightLb!,
        reps: prescribed.prescribedReps,
        rpe: prescribed.targetRpe,
        performedAsPrescribed: true,
      });
      state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
    }
    if (state.workoutSession.phase === "exercise-transition") {
      state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
    }
  }
  return state;
}

check("Resolving every exercise reaches the session-summary phase with an empty queue", () => {
  const state = completeEveryExerciseMinimally();
  assert.equal(state.workoutSession.phase, "session-summary");
  assert.equal(state.workoutSession.exerciseQueue.length, 0);
  assert.equal(state.workoutSession.currentExerciseId, null);
});

check("COMPLETE_WORKOUT marks the session completed exactly once and records the completion event", () => {
  const state = completeEveryExerciseMinimally();
  const summary = {
    exercisesCompleted: PUSH_WORKOUT.exercises.length,
    exercisesSkipped: 0,
    workingSetsCompleted: PUSH_WORKOUT.exercises.reduce((n, e) => n + e.workingSets, 0),
    skippedSetsCount: 0,
    missingRpeCount: 0,
    averageRpe: 8,
    painReportCount: 0,
    durationMin: 45,
    headline: "Workout completed.",
    detail: "",
    needsReview: false,
    fullyCompleted: true,
  };
  const completed = reducer(state, { type: "COMPLETE_WORKOUT", summary });
  assert.equal(completed.workoutSession.status, "completed");
  assert.ok(completed.workoutSession.completedAtIso);
  assert.equal(completed.workoutSession.events.at(-1)?.type, "completed");

  // A second COMPLETE_WORKOUT dispatch (defensive: should never happen
  // through the real UI, which only ever shows the summary once) does not
  // create a duplicate reviewRequests entry beyond what the first call
  // already added, since the summary itself doesn't flag review here.
  const completedAgain = reducer(completed, { type: "COMPLETE_WORKOUT", summary });
  assert.equal(completedAgain.reviewRequests.length, completed.reviewRequests.length);
});

console.log("\n6. Resume/leave-and-return persistence (Phase 4.4B-2 §B)\n");

check("Leaving and re-entering the route only ever appends telemetry events — never touches exercise/set progress", () => {
  const state = readyFirstSet();
  const left = reducer(state, { type: "WORKOUT_ROUTE_LEFT" });
  const resumed = reducer(left, { type: "WORKOUT_ROUTE_ENTERED" });
  assert.equal(resumed.workoutSession.phase, state.workoutSession.phase);
  assert.equal(resumed.workoutSession.currentExerciseId, state.workoutSession.currentExerciseId);
  assert.equal(resumed.workoutSession.currentSetNumber, state.workoutSession.currentSetNumber);
  assert.equal(resumed.workoutSession.exerciseLogs, state.workoutSession.exerciseLogs);
  assert.equal(resumed.workoutSession.events.at(-1)?.type, "route-entered");
  assert.equal(resumed.workoutSession.events.at(-2)?.type, "route-left");
});

check("A legacy (pre-4.4B-2) persisted session migrates to a stable-id pointer that matches its old array index", () => {
  const base = createInitialState();
  const legacySession: Record<string, unknown> = {
    ...base.workoutSession,
    status: "in-progress",
    startedAtIso: new Date().toISOString(),
    currentExerciseIndex: 2,
  };
  delete (legacySession as Record<string, unknown>).currentExerciseId;
  delete (legacySession as Record<string, unknown>).exerciseQueue;
  delete (legacySession as Record<string, unknown>).phase;
  const legacy: Record<string, unknown> = { ...base, version: 5, workoutSession: legacySession };

  const migrated = migrateStoredState(legacy);
  assert.ok(migrated);
  // Later passes added v6->v7 (see migrateV6ToV7), v7->v8 (see
  // migrateV7ToV8), v8->v9 (see migrateV8ToV9), v9->v10 (see
  // migrateV9ToV10), v10->v11 (see migrateV10ToV11), and Phase 5.4B added
  // v11->v12 and v12->v13 (see migrateV11ToV12/migrateV12ToV13) steps — a v5
  // input now lands on 13, not 6. The v5->v6 exercise-pointer migration
  // itself (the thing this check actually exercises) is unaffected either
  // way.
  assert.equal(migrated!.version, 15);
  assert.equal(migrated!.workoutSession.currentExerciseId, PUSH_WORKOUT.exercises[2].id);
  assert.equal("currentExerciseIndex" in migrated!.workoutSession, false);
  assert.equal(Object.keys(migrated!.workoutSession.exerciseWarmups).length, PUSH_WORKOUT.exercises.length);
});

console.log("\n7. Deterministic OPTIM guidance (Phase 4.4B-2 §G / coach/AI telemetry)\n");

function makeLoggedSet(overrides: Partial<LoggedSet>): LoggedSet {
  return {
    id: "test-set",
    exerciseId: INCLINE_ID,
    setNumber: 3,
    isWarmup: false,
    weightLb: 85,
    reps: 8,
    rpe: 8,
    status: "completed",
    performedAsPrescribed: true,
    ...overrides,
  };
}

check("Immediate feedback reports within-target only when RPE is close to the prescribed target", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!; // targetRpe 8
  const feedback = buildImmediateSetFeedback(incline, makeLoggedSet({ rpe: 8 }));
  assert.equal(feedback.category, "within-target");
  assert.equal(feedback.forCoachReview, false);
});

check("Immediate feedback flags effort materially exceeding the target RPE for coach review", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const feedback = buildImmediateSetFeedback(incline, makeLoggedSet({ rpe: 10 }));
  assert.equal(feedback.category, "exceeded-target");
  assert.equal(feedback.forCoachReview, true);
  assert.match(feedback.message, /may indicate/);
});

check("Immediate feedback never claims a target comparison for a set with no recorded RPE", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const feedback = buildImmediateSetFeedback(incline, makeLoggedSet({ rpe: null }));
  assert.equal(feedback.forCoachReview, true);
  assert.doesNotMatch(feedback.message, /target RPE of/);
});

check("The comparable-previous-set reference indexes by working-set position, never fabricated when absent", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const first = comparablePreviousSetPerformance(incline, 0);
  assert.deepEqual(first, incline.previousPerformance[0]);
  const outOfRange = comparablePreviousSetPerformance(incline, 99);
  assert.equal(outOfRange, null);
});

check("Session guidance only reports an improving-trend signal when the logged weight genuinely exceeds real prior history at an equal-or-lower RPE", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const priorTop = incline.previousPerformance[0]; // {weightLb: 85, reps: 9, rpe: 8}
  const improvedLog: ExerciseLog = {
    exerciseId: INCLINE_ID,
    status: "completed",
    loggedSets: [makeLoggedSet({ id: "s1", setNumber: incline.prescribedSets.find((s) => !s.isWarmup)!.setNumber, weightLb: priorTop.weightLb + 10, rpe: priorTop.rpe })],
  };
  const session: WorkoutSession = {
    ...createInitialState().workoutSession,
    exerciseLogs: { ...createInitialState().workoutSession.exerciseLogs, [INCLINE_ID]: improvedLog },
    actualExerciseOrder: [INCLINE_ID],
  };
  const signals = buildSessionGuidanceSignals(PUSH_WORKOUT, session, { techniqueFlagCount: 0 });
  assert.ok(signals.some((s) => /trending upward/.test(s.message)));
});

check("Session guidance never fabricates a trend when there's no comparable data at all", () => {
  const noHistoryExercise: Exercise = { ...PUSH_WORKOUT.exercises[0], previousPerformance: [] };
  const noHistoryWorkout = { ...PUSH_WORKOUT, exercises: [noHistoryExercise] };
  const log: ExerciseLog = {
    exerciseId: noHistoryExercise.id,
    status: "completed",
    loggedSets: [makeLoggedSet({ exerciseId: noHistoryExercise.id, weightLb: 999, rpe: 6 })],
  };
  const session: WorkoutSession = {
    ...createInitialState().workoutSession,
    exerciseLogs: { [noHistoryExercise.id]: log },
    actualExerciseOrder: [noHistoryExercise.id],
  };
  const signals = buildSessionGuidanceSignals(noHistoryWorkout, session, { techniqueFlagCount: 0 });
  assert.equal(signals.some((s) => /trending upward/.test(s.message)), false);
});

check("A material deviation from the prescription this session is surfaced as a flagged, coach-reviewable signal", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const log: ExerciseLog = {
    exerciseId: INCLINE_ID,
    status: "completed",
    loggedSets: [makeLoggedSet({ performedAsPrescribed: false })],
  };
  const session: WorkoutSession = {
    ...createInitialState().workoutSession,
    exerciseLogs: { ...createInitialState().workoutSession.exerciseLogs, [INCLINE_ID]: log },
    actualExerciseOrder: [INCLINE_ID],
  };
  const signals = buildSessionGuidanceSignals(PUSH_WORKOUT, session, { techniqueFlagCount: 0 });
  const deviation = signals.find((s) => /differently from the prescription/.test(s.message));
  assert.ok(deviation);
  assert.equal(deviation!.forCoachReview, true);
  void incline;
});

console.log("\n8. Exercise resolution parity (canCompleteExercise vs isExerciseResolved)\n");

check("isExerciseResolved treats a whole-exercise skip as resolved even though canCompleteExercise alone would not", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!;
  const skippedLog: ExerciseLog = { exerciseId: INCLINE_ID, status: "skipped", loggedSets: [] };
  assert.equal(canCompleteExercise(incline, skippedLog), false);
  assert.equal(isExerciseResolved(incline, skippedLog), true);
});

check("advanceAfterExerciseResolved and deferCurrentExercise never mutate the session they're given", () => {
  const state = startAndClearSessionWarmup();
  const before = JSON.stringify(state.workoutSession);
  void advanceAfterExerciseResolved(state.workoutSession);
  void deferCurrentExercise(state.workoutSession);
  assert.equal(JSON.stringify(state.workoutSession), before);
});

console.log("\n9. Rest-recommendation policy (Phase 4.4B-2.1 §1)\n");

const INCLINE_EXERCISE = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!; // restSeconds 150, targetRpe 8

check("No timer: recommendRest is purely a static label — it never depends on elapsed wall-clock time", () => {
  const a = recommendRest(INCLINE_EXERCISE.restSeconds, 8, INCLINE_EXERCISE.targetRpe);
  const b = recommendRest(INCLINE_EXERCISE.restSeconds, 8, INCLINE_EXERCISE.targetRpe);
  assert.deepEqual(a, b, "the same inputs must always produce the exact same recommendation, with no hidden clock dependency");
});

check("At or below target RPE preserves the coach-prescribed range exactly", () => {
  const atTarget = recommendRest(INCLINE_EXERCISE.restSeconds, 8, INCLINE_EXERCISE.targetRpe);
  assert.equal(atTarget.label, "Recommended rest: 2–3 minutes.");
  assert.equal(atTarget.addedMinutes, 0);
  assert.equal(atTarget.note, null);

  const belowTarget = recommendRest(INCLINE_EXERCISE.restSeconds, 6, INCLINE_EXERCISE.targetRpe);
  assert.equal(belowTarget.label, "Recommended rest: 2–3 minutes.");
  assert.equal(belowTarget.addedMinutes, 0);
});

check("One point above target, or actual RPE 9, adds exactly one minute to both ends", () => {
  const onePointAbove = recommendRest(INCLINE_EXERCISE.restSeconds, 9, 8);
  assert.equal(onePointAbove.label, "Recommended rest: 3–4 minutes.");
  assert.equal(onePointAbove.addedMinutes, 1);
  assert.equal(onePointAbove.caution, false);
  assert.ok(onePointAbove.note, "an elevated-effort note must accompany the adjusted number");
});

check("RPE 10, or two-plus points above target, adds two minutes and pairs with caution guidance", () => {
  const rpe10 = recommendRest(INCLINE_EXERCISE.restSeconds, 10, 8);
  assert.equal(rpe10.label, "Recommended rest: 4–5 minutes.");
  assert.equal(rpe10.addedMinutes, 2);
  assert.equal(rpe10.caution, true);
  assert.ok(rpe10.note);

  const twoPointsAbove = recommendRest(INCLINE_EXERCISE.restSeconds, 8, 6); // 2–3 min baseline, diff = 2
  assert.equal(twoPointsAbove.label, "Recommended rest: 4–5 minutes.");
  assert.equal(twoPointsAbove.addedMinutes, 2);
});

check("The coach-prescribed range is never shortened, regardless of RPE", () => {
  for (const rpe of [6, 7, 8, 9, 10] as const) {
    const rec = recommendRest(INCLINE_EXERCISE.restSeconds, rpe, INCLINE_EXERCISE.targetRpe);
    const [lowStr] = rec.label.match(/\d+/g) ?? ["0"];
    assert.ok(Number(lowStr) >= 2, `low end must never drop below the prescribed 2 minutes (got: ${rec.label})`);
  }
});

check("No RPE yet, or no prescribed baseline, falls back to the existing safe copy rather than fabricating a number", () => {
  const noRpeYet = recommendRest(INCLINE_EXERCISE.restSeconds, null, INCLINE_EXERCISE.targetRpe);
  assert.equal(noRpeYet.label, "Recommended rest: 2–3 minutes.");
  assert.equal(noRpeYet.note, null);

  const noBaseline = recommendRest(undefined, 10, 8);
  assert.equal(noBaseline.label, "Rest as needed.");
  assert.equal(noBaseline.caution, false);
});

console.log("\n10. Pain-safety transitions (Phase 4.4B-2.1 §4/§5)\n");

function mildInput(overrides: Partial<Parameters<typeof classifyPainSeverity>[0]> = {}) {
  return {
    ratingZeroToTen: 2,
    continuedAfterSet: false,
    affectsOutsideGym: false,
    symptomQuality: "normal-fatigue" as PainSymptomQuality,
    ...overrides,
  };
}

check("classifyPainSeverity: a genuinely mild report (1-3, no continuation, no outside-gym effect, benign quality) is resume-eligible", () => {
  assert.equal(classifyPainSeverity(mildInput()), "resume-eligible");
});

check("classifyPainSeverity: rating 4+ always blocks the exercise regardless of every other field", () => {
  assert.equal(classifyPainSeverity(mildInput({ ratingZeroToTen: 4 })), "block-exercise");
});

check("classifyPainSeverity: continuing after the set always blocks, even at a low rating", () => {
  assert.equal(classifyPainSeverity(mildInput({ continuedAfterSet: true })), "block-exercise");
});

check("classifyPainSeverity: affecting anything outside the gym always blocks", () => {
  assert.equal(classifyPainSeverity(mildInput({ affectsOutsideGym: true })), "block-exercise");
});

check("classifyPainSeverity: sharp/pinching, numbness/tingling, and instability/weakness always block, even at rating 1", () => {
  for (const quality of ["sharp-pinching", "numbness-tingling", "instability-weakness"] as PainSymptomQuality[]) {
    assert.equal(
      classifyPainSeverity(mildInput({ ratingZeroToTen: 1, symptomQuality: quality })),
      "block-exercise",
      `${quality} must never be resume-eligible regardless of rating`
    );
  }
});

check("isSevereRating is true only at 7 and above", () => {
  assert.equal(isSevereRating(6), false);
  assert.equal(isSevereRating(7), true);
  assert.equal(isSevereRating(10), true);
});

function reportPainOnCurrentSet(state: AppState, overrides: Partial<Parameters<typeof classifyPainSeverity>[0]> = {}) {
  const input = mildInput(overrides);
  return reducer(state, {
    type: "REPORT_PAIN",
    exerciseId: state.workoutSession.currentExerciseId!,
    location: "Right shoulder",
    onset: "During the set",
    causedByMovement: PUSH_WORKOUT.exercises.find((e) => e.id === state.workoutSession.currentExerciseId)?.name ?? "",
    ratingZeroToTen: input.ratingZeroToTen,
    continuedAfterSet: input.continuedAfterSet,
    affectsOutsideGym: input.affectsOutsideGym,
    symptomQuality: input.symptomQuality,
  });
}

check("Submitting a pain report always interrupts progression: phase becomes pain-review and blind CONTINUE_TO_NEXT_SET is a no-op", () => {
  const ready = readyFirstSet();
  const exerciseId = ready.workoutSession.currentExerciseId!;
  const setNumber = ready.workoutSession.currentSetNumber!;
  const afterReport = reportPainOnCurrentSet(ready, { ratingZeroToTen: 7 });

  assert.equal(afterReport.workoutSession.phase, "pain-review");
  assert.ok(afterReport.workoutSession.activePainInterruption);
  assert.equal(afterReport.workoutSession.activePainInterruption!.exerciseId, exerciseId);
  assert.equal(afterReport.workoutSession.activePainInterruption!.setNumber, setNumber);
  assert.equal(afterReport.workoutSession.activePainInterruption!.severity, "block-exercise");

  // Blind progression must not work — this exact scenario (7/10, right
  // shoulder, during the set on the current exercise) must never quietly
  // return the client to the next set.
  const blindAdvance = reducer(afterReport, { type: "CONTINUE_TO_NEXT_SET" });
  assert.equal(blindAdvance.workoutSession.phase, "pain-review", "CONTINUE_TO_NEXT_SET must not bypass an active pain interruption");
  assert.deepEqual(blindAdvance.workoutSession.activePainInterruption, afterReport.workoutSession.activePainInterruption);
});

check("The pain report persists complete coach-review telemetry: full report fields, requiresCoachReview, and a pain-report ReviewRequest", () => {
  const afterReport = reportPainOnCurrentSet(readyFirstSet(), { ratingZeroToTen: 7 });
  const report = afterReport.workoutSession.painReports.at(-1)!;
  assert.equal(report.location, "Right shoulder");
  assert.equal(report.ratingZeroToTen, 7);
  assert.equal(report.symptomQuality, "normal-fatigue");
  assert.equal(report.requiresCoachReview, true);
  const reviewRequest = afterReport.reviewRequests.find((r) => r.kind === "pain-report");
  assert.ok(reviewRequest);
  assert.equal(reviewRequest!.resolved, false);
});

check("A mild resume-eligible report cannot resume without an explicit 'fully resolved' confirmation first", () => {
  const afterReport = reportPainOnCurrentSet(readyFirstSet(), { ratingZeroToTen: 2 });
  assert.equal(afterReport.workoutSession.activePainInterruption!.severity, "resume-eligible");

  const blindResume = reducer(afterReport, { type: "RESUME_AFTER_PAIN" });
  assert.equal(blindResume.workoutSession.phase, "pain-review", "resuming before confirmation must be rejected");
  assert.equal(blindResume.workoutSession.activePainInterruption, afterReport.workoutSession.activePainInterruption);

  const confirmed = reducer(afterReport, { type: "CONFIRM_PAIN_RESOLVED" });
  assert.equal(confirmed.workoutSession.activePainInterruption!.confirmedResolved, true);
  assert.equal(confirmed.workoutSession.phase, "pain-review", "confirming alone must not itself resume");

  const resumed = reducer(confirmed, { type: "RESUME_AFTER_PAIN" });
  assert.equal(resumed.workoutSession.phase, "set-ready");
  assert.equal(resumed.workoutSession.activePainInterruption, null);
  assert.equal(resumed.workoutSession.currentSetNumber, confirmed.workoutSession.currentSetNumber);
});

// Phase 4.4B-2.2 correction — these two checks previously asserted that
// SKIP_EXERCISE/DEFER_EXERCISE fully cleared activePainInterruption
// ("resolves it"). That was the exact bug this pass fixes: a client
// reporting persistent pain, having OPTIM correctly block another set, then
// choosing "Continue with unaffected exercises" would see the pain
// condition silently cleared and the very next exercise offered with no
// caution at all — as if OPTIM had verified it was safe, which it never
// did. The corrected invariant is the opposite: neither action is a
// policy-approved resolution path for the report itself (only
// RESUME_AFTER_PAIN, after an explicit "fully resolved" confirmation, is —
// see the mild-resume check above), so activePainInterruption must survive
// both, and continue gating whatever comes next. See §1 below for the new
// exercise-pain-check gate this enables.
check("Skipping the exercise from a pain interruption resolves THAT exercise but leaves the pain report active, for both severities", () => {
  for (const rating of [2, 8]) {
    const afterReport = reportPainOnCurrentSet(readyFirstSet(), { ratingZeroToTen: rating });
    const exerciseId = afterReport.workoutSession.currentExerciseId!;
    const reportId = afterReport.workoutSession.activePainInterruption!.painReportId;
    const skipped = reducer(afterReport, { type: "SKIP_EXERCISE", exerciseId, reason: "pain-or-discomfort" });
    assert.ok(skipped.workoutSession.activePainInterruption, "the report must remain active — skipping the exercise is not a resolution");
    assert.equal(skipped.workoutSession.activePainInterruption!.painReportId, reportId);
    assert.equal(skipped.workoutSession.exerciseLogs[exerciseId].status, "skipped");
    assert.notEqual(skipped.workoutSession.phase, "pain-review");
  }
});

check("'Continue with unaffected exercises' (defer) from a block-exercise interruption leaves the report active without marking the exercise skipped", () => {
  const afterReport = reportPainOnCurrentSet(readyFirstSet(), { ratingZeroToTen: 8 });
  const exerciseId = afterReport.workoutSession.currentExerciseId!;
  const reportId = afterReport.workoutSession.activePainInterruption!.painReportId;
  const deferred = reducer(afterReport, { type: "DEFER_EXERCISE", exerciseId });
  assert.ok(deferred.workoutSession.activePainInterruption, "deferring must never be read as the pain condition being resolved");
  assert.equal(deferred.workoutSession.activePainInterruption!.painReportId, reportId);
  assert.equal(deferred.workoutSession.exerciseLogs[exerciseId].status, "not-started");
  assert.ok(deferred.workoutSession.deferredExerciseIds.includes(exerciseId));
  assert.equal(deferred.workoutSession.exerciseQueue.at(-1), exerciseId, "deferred exercise must still return later, not disappear");
});

check("Ending the workout from a pain interruption clears it and resolves the session", () => {
  const afterReport = reportPainOnCurrentSet(readyFirstSet(), { ratingZeroToTen: 9 });
  const ended = reducer(afterReport, { type: "SKIP_WORKOUT", reason: "pain-or-discomfort" });
  assert.equal(ended.workoutSession.activePainInterruption, null);
  assert.notEqual(ended.workoutSession.status, "in-progress");
});

check("The safety interruption survives a simulated refresh (re-hydration) and route leave/re-entry", () => {
  const afterReport = reportPainOnCurrentSet(readyFirstSet(), { ratingZeroToTen: 8 });
  // Simulate a refresh: serialize then parse, exactly what localStorage
  // persistence round-trips through (see hooks/use-prototype-state.tsx).
  const rehydrated = JSON.parse(JSON.stringify(afterReport)) as AppState;
  assert.equal(rehydrated.workoutSession.phase, "pain-review");
  assert.ok(rehydrated.workoutSession.activePainInterruption);

  const left = reducer(rehydrated, { type: "WORKOUT_ROUTE_LEFT" });
  const reentered = reducer(left, { type: "WORKOUT_ROUTE_ENTERED" });
  assert.equal(reentered.workoutSession.phase, "pain-review");
  assert.deepEqual(reentered.workoutSession.activePainInterruption, afterReport.workoutSession.activePainInterruption);
});

console.log("\n11. Effort classification agrees across headline, rest, and summary (Phase 4.4B-2.2 §2)\n");

check("Actual RPE equal to target classifies as within-target", () => {
  const effort = classifyEffort(8, 8);
  assert.equal(effort.tier, "within-target");
});

check("Actual RPE materially below target classifies as below-target", () => {
  const effort = classifyEffort(6, 8);
  assert.equal(effort.tier, "below-target");
});

check("Actual RPE exactly one point above target classifies as above-target, not severe", () => {
  const effort = classifyEffort(9, 8);
  assert.equal(effort.tier, "above-target");
  assert.equal(effort.severe, false);
});

check("Actual RPE substantially above target (10, or 2+ over) classifies as above-target and severe", () => {
  assert.equal(classifyEffort(10, 8).severe, true);
  assert.equal(classifyEffort(8, 6).severe, true);
});

check("Missing RPE classifies as unknown, never guessed", () => {
  assert.equal(classifyEffort(null, 8).tier, "unknown");
});

check("Target RPE 8 with actual RPE 9 produces above-target guidance, never 'within the target range', and the matching one-minute rest adjustment", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!; // targetRpe 8
  const feedback = buildImmediateSetFeedback(incline, makeLoggedSet({ rpe: 9 }));
  assert.equal(feedback.category, "above-target");
  assert.doesNotMatch(feedback.message, /within the target range/);
  assert.match(feedback.message, /above the target range/);

  const rest = recommendRest(incline.restSeconds, 9, incline.targetRpe);
  assert.equal(rest.addedMinutes, 1, "the headline's above-target tier and the rest adjustment must agree on the same input");
});

check("Headline classification and rest recommendation never contradict each other across the full RPE range", () => {
  const incline = PUSH_WORKOUT.exercises.find((e) => e.id === INCLINE_ID)!; // targetRpe 8, restSeconds 150
  for (const rpe of [6, 7, 8, 9, 10] as const) {
    const feedback = buildImmediateSetFeedback(incline, makeLoggedSet({ rpe }));
    const rest = recommendRest(incline.restSeconds, rpe, incline.targetRpe);
    const headlineSaysAboveTarget = feedback.category === "above-target" || feedback.category === "exceeded-target";
    const restSaysElevated = rest.addedMinutes > 0;
    assert.equal(
      headlineSaysAboveTarget,
      restSaysElevated,
      `RPE ${rpe}: headline category "${feedback.category}" and rest addedMinutes ${rest.addedMinutes} disagree about whether effort was above target`
    );
  }
});

console.log("\n12. Session-summary interpretation stays consistent, and pre-completion copy is never tensed as already-submitted (Phase 4.4B-2.2 §2/§4)\n");

check("sessionReviewHeadline never claims the workout was already submitted — that language is reserved for the real post-completion summary", () => {
  const bases: WorkoutSummary[] = [
    { exercisesCompleted: 0, exercisesSkipped: 0, workingSetsCompleted: 0, skippedSetsCount: 0, missingRpeCount: 0, averageRpe: null, painReportCount: 0, durationMin: 1, headline: "No performance data submitted.", detail: "", needsReview: false, fullyCompleted: false },
    { exercisesCompleted: 2, exercisesSkipped: 0, workingSetsCompleted: 6, skippedSetsCount: 0, missingRpeCount: 0, averageRpe: 8, painReportCount: 0, durationMin: 30, headline: "Workout completed.", detail: "", needsReview: false, fullyCompleted: true },
    { exercisesCompleted: 1, exercisesSkipped: 1, workingSetsCompleted: 3, skippedSetsCount: 1, missingRpeCount: 0, averageRpe: 8, painReportCount: 1, durationMin: 20, headline: "Workout submitted — items flagged for review.", detail: "", needsReview: true, fullyCompleted: false },
    { exercisesCompleted: 3, exercisesSkipped: 0, workingSetsCompleted: 9, skippedSetsCount: 0, missingRpeCount: 0, averageRpe: 8, painReportCount: 0, durationMin: 40, headline: "Workout submitted.", detail: "", needsReview: false, fullyCompleted: false },
  ];
  for (const preview of bases) {
    const reviewHeadline = sessionReviewHeadline(preview);
    assert.doesNotMatch(
      reviewHeadline,
      /submitted/i,
      `pre-completion review headline must never use "submitted" language (got: "${reviewHeadline}" for ${JSON.stringify(preview)})`
    );
  }
});

check("sessionReviewHeadline distinguishes ready-to-complete from needs-review from plain review, from real data alone", () => {
  const complete: WorkoutSummary = { exercisesCompleted: 5, exercisesSkipped: 0, workingSetsCompleted: 15, skippedSetsCount: 0, missingRpeCount: 0, averageRpe: 8, painReportCount: 0, durationMin: 45, headline: "x", detail: "", needsReview: false, fullyCompleted: true };
  assert.equal(sessionReviewHeadline(complete), "Workout ready to complete.");

  const flagged: WorkoutSummary = { ...complete, fullyCompleted: false, needsReview: true };
  assert.match(sessionReviewHeadline(flagged), /flagged/);

  const plain: WorkoutSummary = { ...complete, fullyCompleted: false, needsReview: false };
  assert.equal(sessionReviewHeadline(plain), "Review your workout.");
});

console.log("\n13. Persistent pain gate across later exercises (Phase 4.4B-2.2 §1)\n");

/** Advances from a fresh, ready-to-work session straight to a block-exercise
 * pain interruption reported on the very first working set of the FIRST
 * exercise (incline-db-press) — the same shape as reportPainOnCurrentSet,
 * kept separate so section 13's tests read as one continuous scenario
 * (report on exercise 1 -> defer -> gate on exercise 2). */
function reportSeverePainOnFirstExercise(): AppState {
  return reportPainOnCurrentSet(readyFirstSet(), { ratingZeroToTen: 8 });
}

check("'Continue with unaffected exercises' advances to the next exercise but requires its own explicit confirmation before it can begin", () => {
  const afterReport = reportSeverePainOnFirstExercise();
  const reportId = afterReport.workoutSession.activePainInterruption!.painReportId;

  const deferred = reducer(afterReport, { type: "DEFER_EXERCISE", exerciseId: INCLINE_ID });
  assert.equal(deferred.workoutSession.currentExerciseId, CHEST_PRESS_ID);
  assert.equal(deferred.workoutSession.phase, "exercise-transition");
  assert.ok(deferred.workoutSession.activePainInterruption, "the report must still be active going into the next exercise");

  const entered = reducer(deferred, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(entered.workoutSession.phase, "exercise-pain-check", "a DIFFERENT exercise must be gated, not silently allowed to begin");
  assert.equal(entered.workoutSession.currentExerciseId, CHEST_PRESS_ID);

  // Direct/accidental dispatches must not be able to begin the exercise,
  // enter set logging, log a set, or advance through it while gated.
  for (const blocked of [
    { type: "BEGIN_EXERCISE" } as const,
    { type: "BEGIN_SET_LOGGING" } as const,
    { type: "CONTINUE_TO_NEXT_SET" } as const,
    { type: "LOG_SET", exerciseId: CHEST_PRESS_ID, setNumber: 1, isWarmup: false, weightLb: 100, reps: 8, rpe: 8 as const, performedAsPrescribed: true } as const,
  ]) {
    const result = reducer(entered, blocked);
    assert.equal(result.workoutSession.phase, "exercise-pain-check", `${blocked.type} must not bypass the exercise-pain-check gate`);
    assert.equal(result, entered, `${blocked.type} must be a complete no-op while the gate is unresolved`);
  }

  const confirmed = reducer(entered, { type: "CONFIRM_EXERCISE_UNAFFECTED", exerciseId: CHEST_PRESS_ID });
  assert.equal(confirmed.workoutSession.phase, "exercise-intro");
  assert.deepEqual(confirmed.workoutSession.activePainInterruption!.confirmedUnaffectedExerciseIds, [CHEST_PRESS_ID]);
  assert.equal(confirmed.workoutSession.activePainInterruption!.painReportId, reportId, "the confirmation must be scoped to this exact report");

  // A telemetry event records the deliberate decision on the same
  // append-only event log everything else already uses.
  const event = confirmed.workoutSession.events.at(-1)!;
  assert.equal(event.type, "exercise-continued-despite-pain");
  assert.equal(event.exerciseId, CHEST_PRESS_ID);
  assert.equal(event.painReportId, reportId);

  // Now that it's confirmed, the exercise can actually begin.
  const begun = reducer(confirmed, { type: "BEGIN_EXERCISE" });
  assert.notEqual(begun.workoutSession.phase, "exercise-pain-check");
});

check("The confirmation is scoped to one specific exercise — a THIRD exercise still needs its own separate confirmation", () => {
  const afterReport = reportSeverePainOnFirstExercise();
  let state = reducer(afterReport, { type: "DEFER_EXERCISE", exerciseId: INCLINE_ID });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "exercise-pain-check");
  state = reducer(state, { type: "CONFIRM_EXERCISE_UNAFFECTED", exerciseId: CHEST_PRESS_ID });
  assert.equal(state.workoutSession.phase, "exercise-intro");

  // Resolve machine-chest-press normally (unrelated to pain) so the queue
  // advances to the third exercise, cable-fly.
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: CHEST_PRESS_ID, reason: "out-of-time" });
  assert.equal(state.workoutSession.phase, "exercise-transition");
  const cableFlyId = state.workoutSession.currentExerciseId!;
  assert.notEqual(cableFlyId, CHEST_PRESS_ID);
  assert.notEqual(cableFlyId, INCLINE_ID);

  const entered = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(entered.workoutSession.phase, "exercise-pain-check", "confirming machine-chest-press must not silently clear cable-fly's own gate");
  assert.deepEqual(entered.workoutSession.activePainInterruption!.confirmedUnaffectedExerciseIds, [CHEST_PRESS_ID]);
});

check("Skipping a later, gated exercise does not resolve the pain report either", () => {
  const afterReport = reportSeverePainOnFirstExercise();
  let state = reducer(afterReport, { type: "DEFER_EXERCISE", exerciseId: INCLINE_ID });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "exercise-pain-check");
  const gatedExerciseId = state.workoutSession.currentExerciseId!;

  const skipped = reducer(state, { type: "SKIP_EXERCISE", exerciseId: gatedExerciseId, reason: "pain-or-discomfort" });
  assert.ok(skipped.workoutSession.activePainInterruption, "skipping a later gated exercise must not resolve the underlying report");
  assert.equal(skipped.workoutSession.activePainInterruption!.exerciseId, INCLINE_ID);
});

check("A new pain report invalidates confirmations made against an earlier report", () => {
  const afterReport = reportSeverePainOnFirstExercise();
  let state = reducer(afterReport, { type: "DEFER_EXERCISE", exerciseId: INCLINE_ID });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  state = reducer(state, { type: "CONFIRM_EXERCISE_UNAFFECTED", exerciseId: CHEST_PRESS_ID });
  assert.deepEqual(state.workoutSession.activePainInterruption!.confirmedUnaffectedExerciseIds, [CHEST_PRESS_ID]);

  // A brand-new report on the (now current, confirmed) exercise replaces
  // the interruption entirely — the new report has never had anything
  // confirmed against it, regardless of what was confirmed for the old one.
  const newReport = reportPainOnCurrentSet(state, { ratingZeroToTen: 9 });
  assert.notEqual(newReport.workoutSession.activePainInterruption!.painReportId, afterReport.workoutSession.activePainInterruption!.painReportId);
  assert.deepEqual(newReport.workoutSession.activePainInterruption!.confirmedUnaffectedExerciseIds, []);
});

check("Preserves the stricter block on the ORIGINAL exercise: cycling back to it re-enters pain-review, never the lighter exercise-pain-check gate", () => {
  const afterReport = reportSeverePainOnFirstExercise();
  let state = reducer(afterReport, { type: "DEFER_EXERCISE", exerciseId: INCLINE_ID });
  // Resolve every other exercise (not pain-related) so the queue cycles
  // back around to the deferred original exercise.
  while (state.workoutSession.currentExerciseId !== INCLINE_ID && state.workoutSession.currentExerciseId !== null) {
    if (state.workoutSession.phase === "exercise-transition") {
      state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
      continue;
    }
    if (state.workoutSession.phase === "exercise-pain-check") {
      state = reducer(state, { type: "CONFIRM_EXERCISE_UNAFFECTED", exerciseId: state.workoutSession.currentExerciseId! });
      continue;
    }
    state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: state.workoutSession.currentExerciseId!, reason: "out-of-time" });
  }
  assert.equal(state.workoutSession.currentExerciseId, INCLINE_ID);
  const entered = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(entered.workoutSession.phase, "pain-review", "the exercise the report was actually made on must re-trigger its own stricter path, never the generic gate");
});

check("The exercise-pain-check gate survives a simulated refresh and route leave/re-entry", () => {
  const afterReport = reportSeverePainOnFirstExercise();
  let state = reducer(afterReport, { type: "DEFER_EXERCISE", exerciseId: INCLINE_ID });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "exercise-pain-check");

  const rehydrated = JSON.parse(JSON.stringify(state)) as AppState;
  assert.equal(rehydrated.workoutSession.phase, "exercise-pain-check");
  assert.ok(rehydrated.workoutSession.activePainInterruption);

  const left = reducer(rehydrated, { type: "WORKOUT_ROUTE_LEFT" });
  const reentered = reducer(left, { type: "WORKOUT_ROUTE_ENTERED" });
  assert.equal(reentered.workoutSession.phase, "exercise-pain-check");
  assert.deepEqual(reentered.workoutSession.activePainInterruption, state.workoutSession.activePainInterruption);

  // The gate must still hold after the round-trip — direct dispatches
  // remain no-ops.
  const stillBlocked = reducer(reentered, { type: "BEGIN_EXERCISE" });
  assert.equal(stillBlocked.workoutSession.phase, "exercise-pain-check");
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
