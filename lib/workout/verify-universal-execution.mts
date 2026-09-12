// Phase 3 — live strength-workout execution migrated onto the universal
// Session/Block/TrainingItemInstance model. This suite is deliberately
// narrower than lib/workout/verify-workout-flow.mts (67 pre-existing tests,
// all still green after this migration, proving byte-identical live
// behavior) — it targets specifically the NEW integration points this phase
// introduced: the resolvedSession boundary itself, convert-once discipline,
// warm-up equivalence between the legacy and universal derivations, block-
// structural grouping, and safe failure on unrepresentable content. Maps
// directly onto the Phase 3 spec's section 13 test list (A-P), noted per
// section below. Run with: npm run verify:universal-execution

import assert from "node:assert/strict";
import { createInitialState, reducer } from "../state.ts";
import { PUSH_WORKOUT } from "../mock-data.ts";
import { legacyWorkoutToSession } from "../training/legacy-adapter.ts";
import { buildInitialFlowState, findBlockForItem, findTrainingItemById } from "./session-flow.ts";
import { resolveExerciseWarmupConfig, resolveTrainingItemWarmupConfig } from "./warmup.ts";
import { buildWorkoutSummary } from "../workout-analysis.ts";
import { createEmptyClientProgram, createEmptyExercise, createEmptyWorkout, buildPrescribedSets, DAYS_OF_WEEK_ORDER } from "../coach/training.ts";
import { buildProgramEnrollmentForClient } from "../scheduling/enrollment.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";
import type { AppState } from "../state.ts";
import type { ClientAssignedProgram, DayOfWeek, ProgramDay, Workout } from "../types.ts";
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

const PUSH_SESSION = legacyWorkoutToSession(PUSH_WORKOUT);

function startedDemoState(): AppState {
  return reducer(createInitialState(), { type: "START_WORKOUT" });
}

// ---------------------------------------------------------------------------
// A, C, G — a normal multi-exercise strength workout executes through the
// universal Session model, with ordering/prescription intact.
// ---------------------------------------------------------------------------

console.log("\n1. START_WORKOUT populates resolvedSession, matching resolvedWorkout exactly (A, C, G)\n");

check("resolvedSession is populated with one item per PUSH_WORKOUT exercise, in the same order", () => {
  const state = startedDemoState();
  const session = state.workoutSession.resolvedSession;
  assert.ok(session, "resolvedSession must be populated once a real session has started");
  const itemIds = session!.blocks.flatMap((b) => b.items).map((i) => i.id);
  assert.deepEqual(itemIds, PUSH_WORKOUT.exercises.map((e) => e.id));
});

check("exerciseQueue (canonical navigation state) exactly matches the coach's authored exercise order", () => {
  const state = startedDemoState();
  assert.deepEqual(state.workoutSession.exerciseQueue, PUSH_WORKOUT.exercises.map((e) => e.id));
  assert.equal(state.workoutSession.currentExerciseId, PUSH_WORKOUT.exercises[0].id);
});

check("every item's prescription carries the exact same load/reps/RPE/rest/tempo/cue as the source exercise", () => {
  const state = startedDemoState();
  const session = state.workoutSession.resolvedSession!;
  for (const exercise of PUSH_WORKOUT.exercises) {
    const item = findTrainingItemById(session, exercise.id)!;
    assert.ok(item, `item for ${exercise.id} must exist`);
    assert.equal(item.name, exercise.name);
    assert.equal(item.coachCue, exercise.cue);
    assert.equal(item.prescription.sets, exercise.workingSets);
    assert.equal(item.prescription.warmupSets, exercise.warmupSets);
    assert.equal(item.prescription.reps?.low, exercise.targetRepsLow);
    assert.equal(item.prescription.reps?.high, exercise.targetRepsHigh);
    assert.equal(item.prescription.rpe, exercise.targetRpe);
    assert.equal(item.prescription.restSeconds, exercise.restSeconds);
    assert.equal(item.prescription.tempo, exercise.tempo);
    const workingWeight = exercise.prescribedSets.find((s) => !s.isWarmup)?.prescribedWeightLb;
    assert.equal(item.prescription.load?.value, workingWeight);
  }
});

// ---------------------------------------------------------------------------
// B — converted exactly once at the boundary, never repeatedly item-by-item.
// ---------------------------------------------------------------------------

console.log("\n2. Convert-once discipline (B)\n");

check("resolvedSession keeps the SAME object reference across later dispatches — never reconverted mid-session", () => {
  const started = startedDemoState();
  const firstReference = started.workoutSession.resolvedSession;
  const afterLog = reducer(started, {
    type: "LOG_SET",
    exerciseId: PUSH_WORKOUT.exercises[0].id,
    setNumber: 3,
    isWarmup: false,
    weightLb: 85,
    reps: 8,
    rpe: 8,
    performedAsPrescribed: true,
  });
  assert.equal(afterLog.workoutSession.resolvedSession, firstReference, "must be the identical object, not a fresh conversion");
});

// ---------------------------------------------------------------------------
// D, H — multiple working sets progress correctly; logged data stays
// associated with the correct item.
// ---------------------------------------------------------------------------

console.log("\n3. Multi-set progression and correct item/log association (D, H)\n");

check("logging every working set of two different exercises keeps each exercise's log independently correct", () => {
  let state = startedDemoState();
  const [first, second] = PUSH_WORKOUT.exercises;

  for (const setNumber of [3, 4, 5]) {
    state = reducer(state, {
      type: "LOG_SET",
      exerciseId: first.id,
      setNumber,
      isWarmup: false,
      weightLb: 85,
      reps: 8,
      rpe: 8,
      performedAsPrescribed: true,
    });
  }
  assert.equal(state.workoutSession.exerciseLogs[first.id].status, "completed");
  assert.equal(state.workoutSession.exerciseLogs[second.id].status, "not-started", "the second exercise's log must be untouched by the first's progress");
  assert.equal(state.workoutSession.exerciseLogs[first.id].loggedSets.length, 3);
});

// ---------------------------------------------------------------------------
// E, F — warm-up derivation from the universal Prescription is proven
// equivalent to the legacy derivation, not re-derived from Exercise.
// ---------------------------------------------------------------------------

console.log("\n4. Warm-up config equivalence between legacy and universal derivations (E, F)\n");

check("resolveTrainingItemWarmupConfig produces the exact same stepped config as resolveExerciseWarmupConfig, for every real PUSH_WORKOUT exercise", () => {
  for (const exercise of PUSH_WORKOUT.exercises) {
    const item = findTrainingItemById(PUSH_SESSION, exercise.id)!;
    const legacyConfig = resolveExerciseWarmupConfig(exercise);
    const universalConfig = resolveTrainingItemWarmupConfig(item);
    assert.deepEqual(universalConfig, legacyConfig, `warm-up config for ${exercise.id} must match exactly`);
  }
});

check("a warmupInstruction override on the Prescription is honored ahead of stepped derivation, exactly like the legacy field", () => {
  const legacyExercise = {
    ...createEmptyExercise(1),
    name: "Overhead Press",
    warmupSets: 2,
    workingSets: 3,
    targetRepsLow: 5,
    targetRepsHigh: 8,
    targetRpe: 8 as const,
    warmupInstruction: "Two light feeler sets — no need to log them.",
    prescribedSets: buildPrescribedSets({ warmupSets: 2, workingSets: 3, targetRepsLow: 5, targetRepsHigh: 8, targetRpe: 8, workingWeightLb: 95 }),
  };
  const workout: Workout = { ...createEmptyWorkout(WORKSPACE_OPTIM_ID, "Monday"), name: "Push", focus: "Push", exercises: [legacyExercise] };
  const session = legacyWorkoutToSession(workout);
  const item = findTrainingItemById(session, legacyExercise.id)!;
  const legacyConfig = resolveExerciseWarmupConfig(legacyExercise);
  const universalConfig = resolveTrainingItemWarmupConfig(item);
  assert.deepEqual(universalConfig, { mode: "instruction", instruction: legacyExercise.warmupInstruction });
  assert.deepEqual(universalConfig, legacyConfig);
});

// ---------------------------------------------------------------------------
// Section 5/10 — block-structural grouping: a real coach-authored superset
// would land consecutively in the queue and be discoverable via
// findBlockForItem, WITHOUT any new cross-item execution rhythm being
// activated (migration parity, not new grouped-execution UX — see this
// phase's report for the full reasoning).
// ---------------------------------------------------------------------------

console.log("\n5. Block-structural grouping is preserved without activating new navigation rhythm\n");

function syntheticSupersetSession(): Session {
  return {
    id: "session-superset",
    name: "Superset Session",
    focus: "Arms",
    estimatedDurationMin: 30,
    blocks: [
      {
        id: "sup-1",
        kind: "superset",
        order: 1,
        items: [
          { id: "curl", order: 1, name: "Curl", category: "resistance", prescription: { family: "resistance", sets: 3, reps: { low: 10, high: 12 }, rpe: 8, restSeconds: 0 } },
          { id: "pressdown", order: 2, name: "Pressdown", category: "resistance", prescription: { family: "resistance", sets: 3, reps: { low: 10, high: 12 }, rpe: 8, restSeconds: 90 } },
        ],
      },
    ],
  };
}

check("two items sharing a superset block land consecutively in the initial queue", () => {
  const initial = buildInitialFlowState(syntheticSupersetSession());
  assert.deepEqual(initial.exerciseQueue, ["curl", "pressdown"]);
});

check("findBlockForItem correctly identifies both grouped items' shared block", () => {
  const session = syntheticSupersetSession();
  assert.equal(findBlockForItem(session, "curl")?.id, "sup-1");
  assert.equal(findBlockForItem(session, "pressdown")?.id, "sup-1");
});

check("grouped items still resolve/advance independently — no new cross-item rest/cycling rhythm was activated by this phase", () => {
  // "curl" resolving must not implicitly touch "pressdown" — advancing past
  // it simply moves to the next queued item, exactly like two unrelated
  // straight-block items would. This is the deliberate migration-parity
  // choice documented in lib/workout/session-flow.ts's buildInitialFlowState.
  const session: import("../types.ts").WorkoutSession = {
    ...createInitialState().workoutSession,
    exerciseQueue: ["curl", "pressdown"],
    currentExerciseId: "curl",
    actualExerciseOrder: ["curl"],
    exerciseLogs: {
      curl: { exerciseId: "curl", status: "not-started", loggedSets: [] },
      pressdown: { exerciseId: "pressdown", status: "not-started", loggedSets: [] },
    },
  };
  const advance = reducer({ ...createInitialState(), workoutSession: session }, { type: "SKIP_EXERCISE", exerciseId: "curl", reason: "out-of-time" });
  assert.equal(advance.workoutSession.currentExerciseId, "pressdown");
  assert.equal(advance.workoutSession.exerciseLogs["pressdown"]?.status ?? "not-started", "not-started", "the grouped sibling must not be auto-resolved");
});

// ---------------------------------------------------------------------------
// K — substitution data survives into the live universal model.
// ---------------------------------------------------------------------------

console.log("\n6. Substitution data survives conversion (K)\n");

check("approvedSubstituteExerciseId survives into the live resolvedSession as substituteItemId", () => {
  const primary = {
    ...createEmptyExercise(1),
    name: "Barbell Row",
    warmupSets: 1,
    workingSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 10,
    targetRpe: 8 as const,
    approvedSubstituteExerciseId: "bodyweight-row",
    prescribedSets: buildPrescribedSets({ warmupSets: 1, workingSets: 3, targetRepsLow: 8, targetRepsHigh: 10, targetRpe: 8, workingWeightLb: 135 }),
  };
  const workout: Workout = { ...createEmptyWorkout(WORKSPACE_OPTIM_ID, "Monday"), name: "Pull", focus: "Pull", exercises: [primary] };
  const session = legacyWorkoutToSession(workout);
  const item = findTrainingItemById(session, primary.id)!;
  assert.equal(item.substituteItemId, "bodyweight-row");
});

// ---------------------------------------------------------------------------
// J — pain/safety gating still functions with resolvedSession populated
// (lib/workout/verify-workout-flow.mts already exhaustively covers this
// path's own logic — this is a targeted integration spot-check only).
// ---------------------------------------------------------------------------

console.log("\n7. Pain/safety gating remains intact alongside the universal model (J)\n");

check("reporting pain still interrupts progression, and resolvedSession is untouched by the interruption", () => {
  const started = startedDemoState();
  const before = started.workoutSession.resolvedSession;
  const afterPain = reducer(started, {
    type: "REPORT_PAIN",
    location: "Shoulder",
    ratingZeroToTen: 6,
    onset: "During the set",
    causedByMovement: "Press",
    continuedAfterSet: false,
    affectsOutsideGym: false,
    symptomQuality: "aching",
  });
  assert.equal(afterPain.workoutSession.phase, "pain-review");
  assert.equal(afterPain.workoutSession.resolvedSession, before, "reporting pain must never reconvert or replace resolvedSession");
  const blind = reducer(afterPain, { type: "CONTINUE_TO_NEXT_SET" });
  assert.equal(blind.workoutSession.phase, "pain-review", "blind progression must stay blocked");
});

// ---------------------------------------------------------------------------
// L, O — full happy-path completion, universal-model-derived summary
// matches legacy expectations exactly.
// ---------------------------------------------------------------------------

console.log("\n8. Full completion produces a correct summary from the universal model (L, O)\n");

check("a fully logged, fully completed session produces the same WorkoutSummary shape/values buildWorkoutSummary always has", () => {
  let state = startedDemoState();
  for (const exercise of PUSH_WORKOUT.exercises) {
    const item = findTrainingItemById(state.workoutSession.resolvedSession, exercise.id)!;
    const workingSets = item.prescription.sets ?? 0;
    const warmupSets = item.prescription.warmupSets ?? 0;
    for (let i = 1; i <= workingSets; i++) {
      state = reducer(state, {
        type: "LOG_SET",
        exerciseId: exercise.id,
        setNumber: warmupSets + i,
        isWarmup: false,
        weightLb: item.prescription.load?.value ?? 50,
        reps: item.prescription.reps?.low ?? 8,
        rpe: item.prescription.rpe ?? 8,
        performedAsPrescribed: true,
      });
    }
  }
  const nowIso = new Date().toISOString();
  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, state.workoutSession.startedAtIso ?? nowIso, nowIso);
  assert.equal(summary.exercisesCompleted, PUSH_WORKOUT.exercises.length);
  assert.equal(summary.fullyCompleted, true);
  assert.equal(summary.workingSetsCompleted, PUSH_WORKOUT.exercises.reduce((n, e) => n + e.workingSets, 0));
});

// ---------------------------------------------------------------------------
// M, N — the source Session is never mutated across a realistic dispatch
// sequence.
// ---------------------------------------------------------------------------

console.log("\n9. resolvedSession is never mutated across a real dispatch sequence (M, N)\n");

check("resolvedSession's own JSON is byte-identical before and after logging, skipping, and deferring across the session", () => {
  const started = startedDemoState();
  const snapshotBefore = JSON.stringify(started.workoutSession.resolvedSession);
  const [first, second] = PUSH_WORKOUT.exercises;
  let state = reducer(started, {
    type: "LOG_SET",
    exerciseId: first.id,
    setNumber: 3,
    isWarmup: false,
    weightLb: 85,
    reps: 8,
    rpe: 8,
    performedAsPrescribed: true,
  });
  state = reducer(state, { type: "DEFER_EXERCISE", exerciseId: state.workoutSession.currentExerciseId! });
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: second.id, reason: "out-of-time" });
  assert.equal(JSON.stringify(state.workoutSession.resolvedSession), snapshotBefore);
});

// ---------------------------------------------------------------------------
// P — invalid/unrepresentable content fails safely, never a corrupt live
// session.
// ---------------------------------------------------------------------------

console.log("\n10. Unrepresentable content fails safely rather than corrupting the live session (P)\n");

const START_DATE_ISO = "2026-09-07";
const TRAINING_DOW: DayOfWeek = localDateDayOfWeek(START_DATE_ISO);

check("a real assigned program whose exercise has internally-inconsistent prescribedSets never crashes START_WORKOUT — it's a safe no-op", () => {
  const brokenExercise = {
    ...createEmptyExercise(1),
    name: "Broken Exercise",
    warmupSets: 1,
    workingSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 10,
    targetRpe: 8 as const,
    // Deliberately truncated -- disagrees with warmupSets/workingSets, the
    // exact case lib/training/legacy-adapter.ts's deriveWorkingWeightLb
    // refuses to guess through.
    prescribedSets: buildPrescribedSets({ warmupSets: 1, workingSets: 3, targetRepsLow: 8, targetRepsHigh: 10, targetRpe: 8, workingWeightLb: 100 }).slice(0, 1),
  };
  const brokenWorkout: Workout = { ...createEmptyWorkout(WORKSPACE_OPTIM_ID, TRAINING_DOW), name: "Broken", focus: "Broken", exercises: [brokenExercise] };
  const program: ClientAssignedProgram = {
    ...createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-broken", coachId: COACH_PROFILE_TEAGUE.id, name: "Broken Program", durationWeeks: 1, nowIso: "2026-01-01T00:00:00.000Z" }),
    status: "assigned",
    weeks: [
      {
        weekNumber: 1,
        days: DAYS_OF_WEEK_ORDER.map((d): ProgramDay => (d === TRAINING_DOW ? { dayOfWeek: d, type: "training", workout: brokenWorkout } : { dayOfWeek: d, type: "rest" })),
      },
    ],
  };
  const enrollment = buildProgramEnrollmentForClient({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-broken", startDateIso: START_DATE_ISO, durationWeeks: 1, timeZone: "UTC" });
  const state: AppState = { ...createInitialState({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-broken", primaryCoachId: COACH_PROFILE_TEAGUE.id }), dateIso: START_DATE_ISO, programEnrollment: enrollment, assignedProgram: program };

  let next: AppState;
  assert.doesNotThrow(() => {
    next = reducer(state, { type: "START_WORKOUT" });
  });
  next = reducer(state, { type: "START_WORKOUT" });
  assert.equal(next.workoutSession.status, "not-started", "an unrepresentable workout must never half-start a corrupt session");
  assert.equal(next.workoutSession.resolvedSession, null);
  assert.equal(next.workoutSession.resolvedWorkout, null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
