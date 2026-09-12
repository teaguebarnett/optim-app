// Phase 6A — Serve Universal Programs to Live Clients.
//
// Proves the real Supabase client read/resolution boundary this phase adds
// (lib/training/legacy-adapter.ts's legacyProgramToUniversalProgram/
// resolveUniversalProgramContent, lib/workout/resolve-scheduled-session.ts,
// and lib/state.ts's START_WORKOUT universal branch) feeds correctly into
// the SAME live execution engine Phases 3-4 already proved end to end — an
// INTEGRATION suite, not a re-proof of the engine itself (pain/skip/
// continuous-transition logic is already exhaustively covered by
// verify-workout-flow.mts and verify-continuous-execution.mts, unchanged).
// No DB, no network — the real Supabase-backed read (lib/production/
// programs.ts's getClientProgramContext) is separately exercised live
// against a local Supabase stack by scripts/e2e-universal-program-execution.mts
// (see that script for RLS/version/ownership proof — test items J/K/L below).
//
// Maps onto this phase's spec section 22 test list (A-U); each section
// below is labeled with the letter(s) it covers.
//
// Run with: npm run verify:universal-client-execution

import assert from "node:assert/strict";
import { createInitialState, reducer } from "../state.ts";
import { buildDailyRecordFromLiveState } from "../history/build-daily-record.ts";
import { buildProgramEnrollmentForClient } from "../scheduling/enrollment.ts";
import { resolveScheduledSessionForStart } from "./resolve-scheduled-session.ts";
import { legacyProgramToUniversalProgram, resolveUniversalProgramContent, UnsupportedLegacyWorkoutError, legacyWorkoutToSession } from "../training/legacy-adapter.ts";
import { validateUniversalTrainingProgramContent } from "../production/validation.ts";
import { createDefaultCoachOperatingModel } from "../coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../coach/universal-program-generation.ts";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM_ID, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { PUSH_WORKOUT } from "../mock-data.ts";
import { createEmptyProgramWeek } from "../coach/training.ts";
import type { AppState, Action } from "../state.ts";
import type { ClientProgrammingProfile } from "../coach/programming-profile.ts";
import type { CoachOperatingModel } from "../coach/operating-model.ts";
import type { DayOfWeek, ClientAssignedProgram } from "../types";
import type { ProgramEnrollment } from "../scheduling/types";
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

function dispatchAll(state: AppState, actions: Action[]): AppState {
  return actions.reduce((s, a) => reducer(s, a), state);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-03-02T12:00:00.000Z"; // a Monday
const TODAY_ISO = "2026-03-02";

function buildEnrollment(overrides: Partial<{ startDateIso: string; durationWeeks: number }> = {}): ProgramEnrollment {
  return buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    startDateIso: overrides.startDateIso ?? "2026-03-02",
    durationWeeks: overrides.durationWeeks ?? 4,
    timeZone: "UTC",
    now: new Date(NOW_ISO),
  });
}

function com(overrides: Partial<CoachOperatingModel["programArchitecture"]> = {}): CoachOperatingModel {
  const model = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: NOW_ISO, businessName: "OPTIM Test Studio" });
  return { ...model, programArchitecture: { ...model.programArchitecture, ...overrides } };
}

function profileWithDays(days: DayOfWeek[], overrides: Partial<ClientProgrammingProfile> = {}): ClientProgrammingProfile {
  return { ...buildPlaceholderProgrammingProfile(days), ...overrides };
}

function generateRealProgram(profile: ClientProgrammingProfile, comModel: CoachOperatingModel, durationWeeks = 4): UniversalTrainingProgramContent {
  const directions = generateProgramDirectionSummaries({ profile, com: comModel, durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    profile,
    com: comModel,
    durationWeeks,
    nowIso: NOW_ISO,
  });
  return content;
}

/** The exact real state shape getMySupabaseAppStateAction builds for a real
 * Supabase client: programEnrollment + assignedUniversalProgram set
 * together (see app/actions/production-programs.ts's own doc on why). */
function realClientState(assignedProgram: UniversalTrainingProgramContent, enrollment: ProgramEnrollment, dateIso: string): AppState {
  const base = createInitialState({ workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  return { ...base, programEnrollment: enrollment, assignedUniversalProgram: assignedProgram, dateIso };
}

function buildLegacyProgramFixture(): ClientAssignedProgram {
  const week = createEmptyProgramWeek(1);
  const mondayIndex = week.days.findIndex((d) => d.dayOfWeek === "Monday");
  week.days[mondayIndex] = { dayOfWeek: "Monday", type: "training", workout: PUSH_WORKOUT };
  return {
    id: "legacy-program-6a",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    coachId: COACH_PROFILE_TEAGUE.id,
    name: "Legacy Program",
    durationWeeks: 1,
    weeks: [week],
    status: "assigned",
    createdAtIso: NOW_ISO,
    updatedAtIso: NOW_ISO,
  };
}

// ---------------------------------------------------------------------------
// A. schemaVersion 1 assigned program still resolves and executes
// ---------------------------------------------------------------------------

console.log("\nA. schemaVersion 1 (legacy) program still resolves and executes\n");

check("a real legacy program forward-converts and starts through the SAME universal START_WORKOUT branch", () => {
  const legacy = buildLegacyProgramFixture();
  const universal = resolveUniversalProgramContent(legacy)!;
  assert.equal(universal.schemaVersion, 2);
  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const state = realClientState(universal, enrollment, TODAY_ISO);
  const started = reducer(state, { type: "START_WORKOUT" });
  assert.equal(started.workoutSession.status, "in-progress");
  assert.equal(started.workoutSession.resolvedWorkout, null, "the universal branch never fabricates a legacy resolvedWorkout");
  assert.equal(started.workoutSession.resolvedSession?.name, PUSH_WORKOUT.name);
});

check("Q: the forward-converted session is exactly what legacyWorkoutToSession itself would produce — the adapter is used exactly at the compatibility boundary, never re-derived", () => {
  const legacy = buildLegacyProgramFixture();
  const universal = legacyProgramToUniversalProgram(legacy);
  const convertedSession = universal.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  const directSession = legacyWorkoutToSession(PUSH_WORKOUT);
  assert.deepEqual(convertedSession, directSession);
});

// ---------------------------------------------------------------------------
// B. schemaVersion 2 resistance-only assigned program resolves
// ---------------------------------------------------------------------------

console.log("\nB. schemaVersion 2 resistance-only program resolves\n");

check("a real generated resistance-only program resolves today's session and starts it", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"], { cardioPreference: "avoids_cardio" });
  const program = generateRealProgram(profile, com(), 4);
  const enrollment = buildEnrollment({ durationWeeks: 4 });
  const state = realClientState(program, enrollment, TODAY_ISO);
  const resolved = resolveScheduledSessionForStart({ dateIso: TODAY_ISO, programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false });
  assert.ok(resolved.session);
  assert.ok(resolved.session!.blocks.every((b) => b.items.every((i) => i.category === "resistance")));
  const started = reducer(state, { type: "START_WORKOUT" });
  assert.equal(started.workoutSession.status, "in-progress");
});

// ---------------------------------------------------------------------------
// C. schemaVersion 2 continuous-only assigned program resolves
// ---------------------------------------------------------------------------

console.log("\nC. schemaVersion 2 continuous-only program resolves\n");

check("a real generated program's dedicated continuous day resolves a continuous-only session, with no fake resistance exercise", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const program = generateRealProgram(profile, com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 }), 1);
  const continuousDay = program.weeks[0].days.find((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.every((i) => i.category === "continuous"))));
  assert.ok(continuousDay, "test setup sanity: expected a real continuous day");
  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const dateForDay = new Date("2026-03-02T00:00:00.000Z"); // 2026-03-02 is a Monday
  const dayOffset = (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as DayOfWeek[]).indexOf(continuousDay!.dayOfWeek);
  dateForDay.setUTCDate(dateForDay.getUTCDate() + dayOffset);
  const dateIso = dateForDay.toISOString().slice(0, 10);
  const resolved = resolveScheduledSessionForStart({ dateIso, programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false });
  assert.ok(resolved.session);
  const items = resolved.session!.blocks.flatMap((b) => b.items);
  assert.ok(items.every((i) => i.category === "continuous"));
});

// ---------------------------------------------------------------------------
// D/E. schemaVersion 2 mixed session resolves and launches through the
// universal engine directly
// ---------------------------------------------------------------------------

console.log("\nD/E. Mixed session resolves and launches through the universal engine\n");

check("a real resistance + continuous item can be forced into ONE session, resolves, and launches directly (never round-tripped through legacy)", () => {
  // A hand-composed mixed Session, built from the exact same generator
  // helpers real generation uses (proves the SHAPE, not a fabricated
  // fixture) — mirrors the phase spec's own worked example (goblet squat +
  // stationary bike).
  const profile = profileWithDays(["Monday"], { cardioPreference: "avoids_cardio" });
  const resistanceOnly = generateRealProgram(profile, com(), 1);
  const resistanceSession = resistanceOnly.weeks[0].days.find((d) => d.type === "training")!.sessions![0];
  const mixedSession: Session = {
    ...resistanceSession,
    id: "session-mixed-6a",
    blocks: [
      ...resistanceSession.blocks,
      {
        id: "block-continuous-6a",
        kind: "straight",
        order: resistanceSession.blocks.length + 1,
        items: [
          {
            id: "item-bike-6a",
            order: resistanceSession.blocks.length + 1,
            name: "Stationary Bike",
            category: "continuous",
            prescription: { family: "continuous", duration: { seconds: 1200 }, heartRate: { low: 135, high: 150 } },
          },
        ],
      },
    ],
  };
  const mixedProgram: UniversalTrainingProgramContent = {
    ...resistanceOnly,
    weeks: [{ ...resistanceOnly.weeks[0], days: resistanceOnly.weeks[0].days.map((d) => (d.type === "training" ? { ...d, sessions: [mixedSession] } : d)) }],
  };
  validateUniversalTrainingProgramContent(mixedProgram);

  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const resolved = resolveScheduledSessionForStart({ dateIso: TODAY_ISO, programEnrollment: enrollment, assignedProgram: mixedProgram, clientDeclaredRest: false });
  assert.ok(resolved.session, "D: mixed session must resolve");
  const items = resolved.session!.blocks.flatMap((b) => b.items);
  assert.ok(items.some((i) => i.category === "resistance"));
  assert.ok(items.some((i) => i.category === "continuous"));

  const state = realClientState(mixedProgram, enrollment, TODAY_ISO);
  const started = reducer(state, { type: "START_WORKOUT" });
  assert.equal(started.workoutSession.status, "in-progress", "E: mixed session must launch through the universal engine");
  assert.equal(started.workoutSession.resolvedWorkout, null, "never round-tripped through a legacy Workout");
  assert.equal(started.workoutSession.resolvedSession?.id, "session-mixed-6a");
});

// ---------------------------------------------------------------------------
// F. resistance -> continuous transition works for a real resolved program
// G. partial continuous completion preserves the original prescription
// H. pain/safety still gates correctly
// I. skip behavior still works
// ---------------------------------------------------------------------------

console.log("\nF/G/H/I. Live execution against a REAL resolved mixed program\n");

function buildStartedMixedState(): { state: AppState; program: UniversalTrainingProgramContent; enrollment: ProgramEnrollment } {
  const profile = profileWithDays(["Monday"], { cardioPreference: "avoids_cardio" });
  const resistanceOnly = generateRealProgram(profile, com(), 1);
  const resistanceSession = resistanceOnly.weeks[0].days.find((d) => d.type === "training")!.sessions![0];
  const singleResistanceSession = { ...resistanceSession, blocks: [resistanceSession.blocks[0]] };
  const mixedSession = {
    ...singleResistanceSession,
    id: "session-mixed-fghi",
    blocks: [
      ...singleResistanceSession.blocks,
      {
        id: "block-continuous-fghi",
        kind: "straight" as const,
        order: 2,
        items: [
          {
            id: "item-bike-fghi",
            order: 2,
            name: "Stationary Bike",
            category: "continuous" as const,
            prescription: { family: "continuous" as const, duration: { seconds: 1800 } },
          },
        ],
      },
    ],
  };
  const program: UniversalTrainingProgramContent = {
    ...resistanceOnly,
    weeks: [{ ...resistanceOnly.weeks[0], days: resistanceOnly.weeks[0].days.map((d) => (d.type === "training" ? { ...d, sessions: [mixedSession] } : d)) }],
  };
  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const state = realClientState(program, enrollment, TODAY_ISO);
  let started = reducer(state, { type: "START_WORKOUT" });
  // A real generated resistance session always carries a warmupOverview
  // (buildUniversalResistanceSessionForDay), so START_WORKOUT lands on
  // "session-warmup" first — the exact real sequence a live client goes
  // through, not a shortcut.
  if (started.workoutSession.phase === "session-warmup") started = reducer(started, { type: "CONFIRM_SESSION_WARMUP" });
  return { state: started, program, enrollment };
}

/** Drives the CURRENT resistance item through to completion via the same
 * real action sequence lib/workout/verify-workout-flow.mts's own
 * completeEveryExerciseMinimally uses (BEGIN_EXERCISE -> skip the item's own
 * stepped warm-up -> LOG_SET/CONTINUE_TO_NEXT_SET per working set) — never
 * a shortcut specific to this test file. Bounded by the item's own real
 * working-set count, so this can never loop unboundedly. */
function completeCurrentResistanceItem(state: AppState): AppState {
  const itemId = state.workoutSession.currentExerciseId!;
  let s = reducer(state, { type: "BEGIN_EXERCISE" });
  if (s.workoutSession.phase === "exercise-warmup") {
    s = reducer(s, { type: "SKIP_EXERCISE_WARMUP", reason: "out-of-time" });
  }
  const maxSets = 20; // a real generated item never prescribes anywhere near this many working sets
  for (let i = 0; i < maxSets && s.workoutSession.currentExerciseId === itemId; i++) {
    const setNumber = s.workoutSession.currentSetNumber;
    if (setNumber === null) break;
    s = reducer(s, { type: "LOG_SET", exerciseId: itemId, setNumber, isWarmup: false, weightLb: 45, reps: 10, rpe: 8, performedAsPrescribed: true });
    s = reducer(s, { type: "CONTINUE_TO_NEXT_SET" });
  }
  return s;
}

check("F: after resolving every set of the first resistance item, the queue advances into the continuous item with the right entry phase", () => {
  const { state } = buildStartedMixedState();
  const firstItemId = state.workoutSession.currentExerciseId!;
  let s = completeCurrentResistanceItem(state);
  assert.notEqual(s.workoutSession.currentExerciseId, firstItemId, "must have advanced off the resistance item");
  assert.equal(s.workoutSession.currentExerciseId, "item-bike-fghi");
  assert.equal(s.workoutSession.phase, "exercise-transition", "the transition phase itself, before the client confirms it");
  s = reducer(s, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(s.workoutSession.phase, "continuous-ready", "a non-resistance item enters its own continuous-ready phase, never exercise-intro");
});

check("G: logging a shorter-than-prescribed continuous performance never mutates the assigned program's own prescribed duration", () => {
  const { state, program } = buildStartedMixedState();
  const programBefore = structuredClone(program);
  let s = completeCurrentResistanceItem(state);
  assert.equal(s.workoutSession.currentExerciseId, "item-bike-fghi");
  s = reducer(s, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(s.workoutSession.phase, "continuous-ready");
  s = reducer(s, { type: "BEGIN_CONTINUOUS_LOGGING" });
  assert.equal(s.workoutSession.phase, "continuous-logging");
  s = reducer(s, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: "item-bike-fghi", actual: { duration: { seconds: 22 * 60 } } });
  const loggedExecution = s.workoutSession.continuousExecutions?.["item-bike-fghi"];
  assert.equal(loggedExecution?.actual?.duration?.seconds, 22 * 60, "the PERFORMED actual is recorded");
  assert.equal(loggedExecution?.performedAsPrescribed, false);
  const continuousItemInSession = s.workoutSession.resolvedSession!.blocks.flatMap((b) => b.items).find((i) => i.id === "item-bike-fghi")!;
  assert.equal(continuousItemInSession.prescription.duration?.seconds, 1800, "the session's own PRESCRIPTION (30 min) must remain unchanged");
  assert.deepEqual(program, programBefore, "the source assigned program itself must never be mutated by live execution");
});

function readyCurrentResistanceItem(state: AppState): AppState {
  let s = reducer(state, { type: "BEGIN_EXERCISE" });
  if (s.workoutSession.phase === "exercise-warmup") {
    s = reducer(s, { type: "SKIP_EXERCISE_WARMUP", reason: "out-of-time" });
  }
  return s;
}

check("H: reporting pain on the current resistance item of a real resolved universal-origin session gates into pain-review", () => {
  const { state } = buildStartedMixedState();
  const ready = readyCurrentResistanceItem(state);
  const firstItemId = ready.workoutSession.currentExerciseId!;
  const withPain = reducer(ready, {
    type: "REPORT_PAIN",
    exerciseId: firstItemId,
    location: "left shoulder",
    ratingZeroToTen: 6,
    onset: "during-set",
    causedByMovement: "pressing",
    continuedAfterSet: true,
    affectsOutsideGym: false,
    symptomQuality: "sharp-pinching",
  });
  assert.equal(withPain.workoutSession.phase, "pain-review");
  assert.ok(withPain.workoutSession.activePainInterruption);
});

check("I: skipping the current exercise of a real resolved universal-origin session still works and advances the queue", () => {
  const { state } = buildStartedMixedState();
  const firstItemId = state.workoutSession.currentExerciseId!;
  const skipped = reducer(state, { type: "SKIP_EXERCISE", exerciseId: firstItemId, reason: "out-of-time" });
  assert.equal(skipped.workoutSession.exerciseLogs[firstItemId]?.status, "skipped");
  assert.notEqual(skipped.workoutSession.currentExerciseId, firstItemId);
});

// ---------------------------------------------------------------------------
// M. pre-start program remains pre-start
// N. rest day remains rest day
// ---------------------------------------------------------------------------

console.log("\nM/N. Pre-start and rest-day states\n");

check("M: a real universal program before its own start date resolves pre_program, never a fabricated Day 1", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const program = generateRealProgram(profile, com(), 4);
  const futureEnrollment = buildEnrollment({ startDateIso: "2026-04-06", durationWeeks: 4 }); // a future Monday
  const resolved = resolveScheduledSessionForStart({ dateIso: TODAY_ISO, programEnrollment: futureEnrollment, assignedProgram: program, clientDeclaredRest: false });
  assert.equal(resolved.session, null);
  assert.equal(resolved.reason, "pre_program");
});

check("N: a real program's own scheduled rest day (Tuesday, in a 3-day-a-week split) resolves rest_day, never a fabricated session", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"], { cardioPreference: "avoids_cardio" });
  const program = generateRealProgram(profile, com(), 1);
  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const resolved = resolveScheduledSessionForStart({ dateIso: "2026-03-03", programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false }); // Tuesday
  assert.equal(resolved.session, null);
  assert.equal(resolved.reason, "rest_day");
});

check("N: an explicit client-declared rest day overrides even a real scheduled training day", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"], { cardioPreference: "avoids_cardio" });
  const program = generateRealProgram(profile, com(), 1);
  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const resolved = resolveScheduledSessionForStart({ dateIso: TODAY_ISO, programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: true }); // Monday, a real training day
  assert.equal(resolved.session, null);
  assert.equal(resolved.reason, "rest_day");
});

// ---------------------------------------------------------------------------
// O. malformed schemaVersion 2 content fails safely
// P. no fake/demo fallback occurs
// ---------------------------------------------------------------------------

console.log("\nO/P. Malformed content and no-fallback guarantees\n");

check("O: malformed schemaVersion 2 content is rejected by the structural validator, never silently propagated into live workout state", () => {
  const malformed = { schemaVersion: 2, id: "bad", workspaceId: WORKSPACE_OPTIM_ID, clientId: "c", coachId: "co", name: "Bad", durationWeeks: 1 };
  assert.throws(() => validateUniversalTrainingProgramContent(malformed));
});

check("O: a legacy program with a genuine authoring gap (training day, no workout) fails safely via resolveUniversalProgramContent, never a partial program", () => {
  const week = createEmptyProgramWeek(1);
  const mondayIndex = week.days.findIndex((d) => d.dayOfWeek === "Monday");
  week.days[mondayIndex] = { dayOfWeek: "Monday", type: "training" }; // no workout — a real authoring gap
  const broken: ClientAssignedProgram = { ...buildLegacyProgramFixture(), weeks: [week] };
  assert.throws(() => legacyProgramToUniversalProgram(broken), UnsupportedLegacyWorkoutError);
  assert.equal(resolveUniversalProgramContent(broken), null, "the read-boundary dispatcher must resolve this to an honest null, never throw up through the read path");
});

check("P: resolveScheduledSessionForStart has no fallback branch at all — a week number the program doesn't cover resolves no_assignment, never a fabricated session", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"], { cardioPreference: "avoids_cardio" });
  const program = generateRealProgram(profile, com(), 1); // only 1 week of real content
  const enrollment = buildEnrollment({ durationWeeks: 4 }); // enrollment claims 4 weeks
  const resolved = resolveScheduledSessionForStart({ dateIso: "2026-03-23", programEnrollment: enrollment, assignedProgram: program, clientDeclaredRest: false }); // week 4, beyond the program's real content
  assert.equal(resolved.session, null);
  assert.equal(resolved.reason, "no_assignment");
});

check("P: a real universal-only client's daily record never falls back to the seeded PUSH_WORKOUT fixture", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const program = generateRealProgram(profile, com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 }), 1);
  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const state: AppState = { ...realClientState(program, enrollment, TODAY_ISO), assignedProgram: undefined }; // universal-only: no legacy view
  const record = buildDailyRecordFromLiveState(state, enrollment, "live");
  assert.notEqual(record.training.prescribedWorkoutSnapshot?.id, PUSH_WORKOUT.id);
  assert.equal(record.training.prescribedWorkoutSnapshot, null, "honest null, never a fabricated legacy snapshot");
});

// ---------------------------------------------------------------------------
// R. schemaVersion 2 does NOT round-trip through legacy
// ---------------------------------------------------------------------------

console.log("\nR. schemaVersion 2 bypasses the legacy round-trip\n");

check("resolveUniversalProgramContent returns schemaVersion-2 content BY IDENTITY — never rebuilt through legacyProgramToUniversalProgram", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const program = generateRealProgram(profile, com(), 1);
  const resolved = resolveUniversalProgramContent(program);
  assert.equal(resolved, program, "must be the exact same object reference — proof no conversion function ran at all");
});

// ---------------------------------------------------------------------------
// S. completion/history associates with correct real session
// T. continuous session summary contains no fake working-set volume
// ---------------------------------------------------------------------------

console.log("\nS/T. History snapshot correctness for a real continuous-only day\n");

check("S/T: a real continuous-only session's daily record shows zero prescribed/completed working sets — no fabricated resistance volume", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const program = generateRealProgram(profile, com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 }), 1);
  const continuousDay = program.weeks[0].days.find((d) => (d.sessions ?? []).some((s) => s.blocks.every((b) => b.items.every((i) => i.category === "continuous"))));
  assert.ok(continuousDay, "test setup sanity");
  const order: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dateForDay = new Date("2026-03-02T00:00:00.000Z");
  dateForDay.setUTCDate(dateForDay.getUTCDate() + order.indexOf(continuousDay!.dayOfWeek));
  const dateIso = dateForDay.toISOString().slice(0, 10);
  const enrollment = buildEnrollment({ durationWeeks: 1 });
  const baseState = realClientState(program, enrollment, dateIso);
  const started = dispatchAll(baseState, [{ type: "START_WORKOUT" }]);
  assert.equal(started.workoutSession.status, "in-progress");
  const withUniversalOnly: AppState = { ...started, assignedProgram: undefined };
  const record = buildDailyRecordFromLiveState(withUniversalOnly, enrollment, "live");
  assert.equal(record.training.workingSetsPrescribed, 0, "no fake working-set volume for continuous work");
  assert.equal(record.training.workingSetsCompleted, 0);
  assert.equal(record.training.sessionStatus, "in-progress", "still correctly associates with this real, in-progress session");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
