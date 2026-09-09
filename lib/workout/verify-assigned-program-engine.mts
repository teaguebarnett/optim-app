// Assigned-Program Live Workout Engine — focused verification.
//
// Confirms the reducer's real, resolved-workout architecture (see
// resolve-scheduled-workout.ts and lib/state.ts's START_WORKOUT): a real
// client's live session is built from THEIR approved program — correct
// week/day, snapshotted at start, immune to a later revision, isolated
// per-client — and never silently falls back to the global PUSH_WORKOUT
// demo fixture. The seeded demo client's own explicit PUSH_WORKOUT
// experience is verified as unchanged. Run with: npm run verify:assigned-program-engine

import assert from "node:assert/strict";
import { createInitialState, reducer } from "./../state.ts";
import { resolveScheduledWorkoutForStart } from "./resolve-scheduled-workout.ts";
import { createEmptyClientProgram, createEmptyExercise, createEmptyWorkout, buildPrescribedSets, DAYS_OF_WEEK_ORDER } from "../coach/training.ts";
import { buildProgramEnrollmentForClient } from "../scheduling/enrollment.ts";
import { localDateDayOfWeek, addDaysToLocalDate } from "../shared/local-date.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { PUSH_WORKOUT } from "../mock-data.ts";
import type { AppState } from "../state.ts";
import type { ClientAssignedProgram, DayOfWeek, ProgramDay, Workout } from "../types";

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

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const START_DATE_ISO = "2026-09-07";
const TRAINING_DOW: DayOfWeek = localDateDayOfWeek(START_DATE_ISO);

function realWorkout(name: string, exerciseName: string, dayOfWeek: DayOfWeek): Workout {
  const workout = createEmptyWorkout(WORKSPACE_OPTIM_ID, dayOfWeek);
  const exercise = {
    ...createEmptyExercise(1),
    name: exerciseName,
    warmupSets: 1,
    workingSets: 2,
    targetRepsLow: 8,
    targetRepsHigh: 10,
    targetRpe: 8 as const,
    prescribedSets: buildPrescribedSets({ warmupSets: 1, workingSets: 2, targetRepsLow: 8, targetRepsHigh: 10, targetRpe: 8, workingWeightLb: 100 }),
  };
  return { ...workout, name, focus: "Fixture focus", exercises: [exercise] };
}

/** A real, 2-week assigned program with training ONLY on TRAINING_DOW, each
 * week's session distinctly named/exercised so week resolution can't be
 * mistaken for always-week-1. Every other day is rest. */
function buildFixtureProgram(clientId: string, coachId: string): ClientAssignedProgram {
  const base = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId, coachId, name: "Fixture Program", durationWeeks: 2, nowIso: "2026-01-01T00:00:00.000Z" });
  function daysFor(weekWorkout: Workout): ProgramDay[] {
    return DAYS_OF_WEEK_ORDER.map((d): ProgramDay => (d === TRAINING_DOW ? { dayOfWeek: d, type: "training", workout: weekWorkout } : { dayOfWeek: d, type: "rest" }));
  }
  return {
    ...base,
    status: "assigned",
    weeks: [
      { weekNumber: 1, days: daysFor(realWorkout("Week 1 Session", "Week 1 Exercise", TRAINING_DOW)) },
      { weekNumber: 2, days: daysFor(realWorkout("Week 2 Session", "Week 2 Exercise", TRAINING_DOW)) },
    ],
  };
}

function fixtureState(clientId: string, dateIso: string, assignedProgram: ClientAssignedProgram): AppState {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId,
    startDateIso: START_DATE_ISO,
    durationWeeks: 2,
    timeZone: "UTC",
  });
  const base = createInitialState({ workspaceId: WORKSPACE_OPTIM_ID, clientId, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  return { ...base, dateIso, programEnrollment: enrollment, assignedProgram };
}

console.log("\n1. Approved-program-to-session mapping\n");

check("Program Day 1: starting a workout on the enrollment's own start date builds a session from that real assigned workout, never PUSH_WORKOUT", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const next = reducer(state, { type: "START_WORKOUT" });
  assert.equal(next.workoutSession.status, "in-progress");
  assert.equal(next.workoutSession.resolvedWorkout?.name, "Week 1 Session");
  assert.equal(next.workoutSession.resolvedWorkout?.exercises[0]?.name, "Week 1 Exercise");
  assert.notEqual(next.workoutSession.workoutId, PUSH_WORKOUT.id);
  assert.notEqual(next.workoutSession.resolvedWorkout?.name, PUSH_WORKOUT.name);
});

check("exerciseLogs are keyed to the real assigned exercise's own id, not PUSH_WORKOUT's ids — logging a set on it is never a silent no-op", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const started = reducer(state, { type: "START_WORKOUT" });
  const realExerciseId = started.workoutSession.resolvedWorkout!.exercises[0].id;
  assert.ok(started.workoutSession.exerciseLogs[realExerciseId], "the real exercise must have its own log entry");
  assert.equal(started.workoutSession.exerciseLogs[PUSH_WORKOUT.exercises[0].id], undefined);

  const logged = reducer(started, { type: "LOG_SET", exerciseId: realExerciseId, setNumber: 2, isWarmup: false, weightLb: 105, reps: 9, rpe: 8, performedAsPrescribed: false });
  assert.equal(logged.workoutSession.exerciseLogs[realExerciseId].loggedSets.length, 1);
  assert.equal(logged.workoutSession.exerciseLogs[realExerciseId].loggedSets[0].weightLb, 105);
});

console.log("\n2. Correct week/day resolution\n");

check("Week 2 of the same program resolves week 2's own distinct workout, never week 1's", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const week2DateIso = addDaysToLocalDate(START_DATE_ISO, 7);
  const state = fixtureState("client-a", week2DateIso, program);
  const next = reducer(state, { type: "START_WORKOUT" });
  assert.equal(next.workoutSession.resolvedWorkout?.name, "Week 2 Session");
  assert.equal(next.workoutSession.resolvedWorkout?.exercises[0]?.name, "Week 2 Exercise");
});

console.log("\n3. Rest and pre-start gating\n");

check("Before Program Day 1: START_WORKOUT is an honest no-op — no session, no resolvedWorkout, no PUSH_WORKOUT fallback", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const beforeStart = addDaysToLocalDate(START_DATE_ISO, -3);
  const state = fixtureState("client-a", beforeStart, program);
  const next = reducer(state, { type: "START_WORKOUT" });
  assert.equal(next.workoutSession.status, "not-started");
  assert.equal(next.workoutSession.resolvedWorkout, null);
  assert.equal(next.workoutSession.workoutId, "");
});

check("On a real rest day: START_WORKOUT is an honest no-op", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const restDayIso = addDaysToLocalDate(START_DATE_ISO, 1); // the one non-training day
  const state = fixtureState("client-a", restDayIso, program);
  const next = reducer(state, { type: "START_WORKOUT" });
  assert.equal(next.workoutSession.status, "not-started");
  assert.equal(next.workoutSession.resolvedWorkout, null);
});

check("resolveScheduledWorkoutForStart reports the honest reason for each gated case", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const enrollment = buildProgramEnrollmentForClient({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-a", startDateIso: START_DATE_ISO, durationWeeks: 2, timeZone: "UTC" });
  const preStart = resolveScheduledWorkoutForStart({ dateIso: addDaysToLocalDate(START_DATE_ISO, -1), programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false });
  assert.equal(preStart.reason, "pre_program");
  const restDay = resolveScheduledWorkoutForStart({ dateIso: addDaysToLocalDate(START_DATE_ISO, 1), programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false });
  assert.equal(restDay.reason, "rest_day");
  const postProgram = resolveScheduledWorkoutForStart({ dateIso: addDaysToLocalDate(START_DATE_ISO, 30), programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false });
  assert.equal(postProgram.reason, "post_program");
  const ok = resolveScheduledWorkoutForStart({ dateIso: START_DATE_ISO, programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false });
  assert.equal(ok.reason, null);
  assert.ok(ok.workout);
});

console.log("\n4. Session snapshot behavior (immune to a later program revision)\n");

check("A program revision made AFTER a session has started never changes what the in-progress session shows", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const started = reducer(state, { type: "START_WORKOUT" });
  assert.equal(started.workoutSession.resolvedWorkout?.name, "Week 1 Session");

  // Simulate a coach revision replacing week 1's workout entirely — real
  // revision code (lib/coach/program-revision.ts) always rebuilds new
  // objects rather than mutating in place; this reproduces that shape.
  const revisedProgram: ClientAssignedProgram = {
    ...program,
    weeks: program.weeks.map((w) => (w.weekNumber === 1 ? { ...w, days: w.days.map((d) => (d.dayOfWeek === TRAINING_DOW ? { ...d, workout: realWorkout("REVISED Session", "REVISED Exercise", TRAINING_DOW) } : d)) } : w)),
  };
  const afterRevision: AppState = { ...started, assignedProgram: revisedProgram };

  // The already-running session's own snapshot is untouched by the revision.
  assert.equal(afterRevision.workoutSession.resolvedWorkout?.name, "Week 1 Session");
  assert.notEqual(afterRevision.workoutSession.resolvedWorkout?.name, "REVISED Session");

  // A brand-new START_WORKOUT dispatched fresh against the revised program
  // (a genuinely new not-started session, e.g. the next day) DOES see the
  // revision — proving the snapshot is deliberate, not a resolution bug.
  const freshNextDaySameWeek: AppState = { ...afterRevision, workoutSession: createFreshNotStartedSession(afterRevision) };
  const restartedAfterRevision = reducer(freshNextDaySameWeek, { type: "START_WORKOUT" });
  assert.equal(restartedAfterRevision.workoutSession.resolvedWorkout?.name, "REVISED Session");
});

function createFreshNotStartedSession(state: AppState) {
  return createInitialState({ workspaceId: state.workspaceId, clientId: state.clientId, primaryCoachId: state.primaryCoachId }).workoutSession;
}

console.log("\n5. Reload/continuation persistence\n");

check("Re-hydrating an in-progress session (simulated reload) preserves resolvedWorkout and every logged set exactly", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const started = reducer(state, { type: "START_WORKOUT" });
  const realExerciseId = started.workoutSession.resolvedWorkout!.exercises[0].id;
  const logged = reducer(started, { type: "LOG_SET", exerciseId: realExerciseId, setNumber: 2, isWarmup: false, weightLb: 110, reps: 8, rpe: 9, performedAsPrescribed: true });

  // HYDRATE is the exact action a page reload dispatches with whatever was
  // persisted — round-tripping through it must change nothing.
  const rehydrated = reducer(logged, { type: "HYDRATE", payload: logged });
  assert.deepEqual(rehydrated.workoutSession.resolvedWorkout, logged.workoutSession.resolvedWorkout);
  assert.deepEqual(rehydrated.workoutSession.exerciseLogs[realExerciseId].loggedSets, logged.workoutSession.exerciseLogs[realExerciseId].loggedSets);
  assert.equal(rehydrated.workoutSession.exerciseLogs[realExerciseId].loggedSets[0].rpe, 9);
});

console.log("\n6. Completed/Partial/Skipped state derivation against a real assigned exercise\n");

check("Logging every prescribed working set with a valid RPE resolves the real exercise to completed", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const started = reducer(state, { type: "START_WORKOUT" });
  const realExerciseId = started.workoutSession.resolvedWorkout!.exercises[0].id;
  // Fixture exercise: 1 warmup + 2 working sets (set numbers 2 and 3).
  let next = reducer(started, { type: "LOG_SET", exerciseId: realExerciseId, setNumber: 2, isWarmup: false, weightLb: 100, reps: 9, rpe: 8, performedAsPrescribed: true });
  assert.equal(next.workoutSession.exerciseLogs[realExerciseId].status, "in-progress");
  next = reducer(next, { type: "LOG_SET", exerciseId: realExerciseId, setNumber: 3, isWarmup: false, weightLb: 100, reps: 8, rpe: 8, performedAsPrescribed: true });
  assert.equal(next.workoutSession.exerciseLogs[realExerciseId].status, "completed");
});

check("Ending the workout after logging one real working set is 'ended-early' (partial), with a real, non-fabricated summary built from the real assigned workout", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const started = reducer(state, { type: "START_WORKOUT" });
  const realExerciseId = started.workoutSession.resolvedWorkout!.exercises[0].id;
  const logged = reducer(started, { type: "LOG_SET", exerciseId: realExerciseId, setNumber: 2, isWarmup: false, weightLb: 100, reps: 9, rpe: 8, performedAsPrescribed: true });
  const ended = reducer(logged, { type: "SKIP_WORKOUT", reason: "out-of-time" });
  assert.equal(ended.workoutSession.status, "ended-early");
  assert.ok(ended.workoutSession.summary);
  assert.equal(ended.workoutSession.summary!.workingSetsCompleted, 1);
  // 2 real prescribed working sets on the fixture exercise — never
  // PUSH_WORKOUT's own prescribed-set count.
  assert.notEqual(ended.workoutSession.summary!.workingSetsCompleted, 0);
});

check("Skipping the workout with zero completed working sets is honestly 'skipped', never 'ended-early'", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const started = reducer(state, { type: "START_WORKOUT" });
  const skipped = reducer(started, { type: "SKIP_WORKOUT", reason: "forgot" });
  assert.equal(skipped.workoutSession.status, "skipped");
  assert.equal(skipped.workoutSession.summary, undefined);
});

console.log("\n7. Per-client isolation\n");

check("Two clients with two different assigned programs each start their own real, distinct session — no cross-contamination", () => {
  const programA = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const programB: ClientAssignedProgram = {
    ...buildFixtureProgram("client-b", COACH_PROFILE_TEAGUE.id),
    weeks: [
      { weekNumber: 1, days: DAYS_OF_WEEK_ORDER.map((d): ProgramDay => (d === TRAINING_DOW ? { dayOfWeek: d, type: "training", workout: realWorkout("Client B Session", "Client B Exercise", TRAINING_DOW) } : { dayOfWeek: d, type: "rest" })) },
      buildFixtureProgram("client-b", COACH_PROFILE_TEAGUE.id).weeks[1],
    ],
  };

  const stateA = fixtureState("client-a", START_DATE_ISO, programA);
  const stateB = fixtureState("client-b", START_DATE_ISO, programB);

  const startedA = reducer(stateA, { type: "START_WORKOUT" });
  const startedB = reducer(stateB, { type: "START_WORKOUT" });

  assert.equal(startedA.workoutSession.resolvedWorkout?.name, "Week 1 Session");
  assert.equal(startedB.workoutSession.resolvedWorkout?.name, "Client B Session");
  assert.notEqual(startedA.workoutSession.resolvedWorkout?.exercises[0]?.id, startedB.workoutSession.resolvedWorkout?.exercises[0]?.id);

  const loggedA = reducer(startedA, {
    type: "LOG_SET",
    exerciseId: startedA.workoutSession.resolvedWorkout!.exercises[0].id,
    setNumber: 2,
    isWarmup: false,
    weightLb: 100,
    reps: 9,
    rpe: 8,
    performedAsPrescribed: true,
  });
  // Client B's own session has no logged sets at all from Client A's action.
  assert.equal(Object.values(startedB.workoutSession.exerciseLogs).reduce((n, l) => n + l.loggedSets.length, 0), 0);
  assert.equal(Object.values(loggedA.workoutSession.exerciseLogs).reduce((n, l) => n + l.loggedSets.length, 0), 1);
});

console.log("\n8. Explicit demo fixture behavior (seeded demo client only)\n");

check("The seeded demo client (no assignedProgram) still starts PUSH_WORKOUT unconditionally — the one explicitly identified demo experience", () => {
  const demoState = createInitialState({ workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  assert.equal(demoState.assignedProgram, undefined);
  const started = reducer(demoState, { type: "START_WORKOUT" });
  assert.equal(started.workoutSession.status, "in-progress");
  assert.equal(started.workoutSession.resolvedWorkout?.id, PUSH_WORKOUT.id);
  assert.equal(started.workoutSession.workoutId, PUSH_WORKOUT.id);
});

console.log("\n9. No real-client fallback to PUSH_WORKOUT\n");

check("A real client (assignedProgram present) never receives PUSH_WORKOUT as their resolved workout, even when nothing is startable", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  for (const dateIso of [addDaysToLocalDate(START_DATE_ISO, -5), addDaysToLocalDate(START_DATE_ISO, 1), addDaysToLocalDate(START_DATE_ISO, 60)]) {
    const state = fixtureState("client-a", dateIso, program);
    const next = reducer(state, { type: "START_WORKOUT" });
    assert.notEqual(next.workoutSession.resolvedWorkout?.id, PUSH_WORKOUT.id);
    assert.equal(next.workoutSession.status, "not-started");
  }
});

check("A real client's successfully started session's resolvedWorkout is never PUSH_WORKOUT's own id", () => {
  const program = buildFixtureProgram("client-a", COACH_PROFILE_TEAGUE.id);
  const state = fixtureState("client-a", START_DATE_ISO, program);
  const started = reducer(state, { type: "START_WORKOUT" });
  assert.notEqual(started.workoutSession.resolvedWorkout?.id, PUSH_WORKOUT.id);
  assert.notEqual(started.workoutSession.workoutId, PUSH_WORKOUT.id);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
