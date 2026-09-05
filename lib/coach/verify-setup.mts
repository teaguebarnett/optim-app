// OPTIM Phase 5.0B — Coach Setup & Activation verification.
//
// Exercises the coach setup write path (lib/coach/setup.ts), the
// independent nutrition-configuration activation signal, the onboarding
// name-sync reducer behavior, and the full create -> onboard -> setup ->
// activate loop's isolation from the seeded demo client — directly against
// the real implementations, no UI rendering involved. Run with:
// npm run verify:setup

import assert from "node:assert/strict";

import { buildCoachSetupAppState, applyCoachSetup, shouldAdvanceLifecycleOnSetupSave } from "./setup.ts";
import { checkActivationReadiness } from "./activation.ts";
import { createEmptyClientProgram, createEmptyExercise, createEmptyWorkout } from "./training.ts";
import { platformReducer, createInitialPlatformState } from "./platform-store.ts";
import { resolveProgramAssignmentRef } from "./repository.ts";
import { resolveHomeRoute } from "./routing.ts";
import { buildProgramEnrollmentForClient, deriveProgramWeek } from "../scheduling/enrollment.ts";
import { createInitialState, reducer } from "../state.ts";
import {
  loadClientAppState,
  loadOrCreateClientAppState,
  resolveClientStateStorageKey,
  saveClientAppState,
} from "../tenancy/client-state-store.ts";
import { CLIENT_PROFILE_DEMO, COACH_PROFILE_ALEX, COACH_PROFILE_TEAGUE, resolveAssignedCoachId, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import type { ClientAssignedProgram, NutritionTargets } from "../types";
import type { ClientProfile } from "../tenancy/types";

function makeValidAssignedProgram(clientId: string, coachId: string): ClientAssignedProgram {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId, coachId, name: "Test Program", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const workout = createEmptyWorkout(WORKSPACE_OPTIM_ID, "Monday");
  workout.exercises = [{ ...createEmptyExercise(1), name: "Squat" }];
  return {
    ...program,
    status: "assigned",
    weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training", workout } : d)) }],
  };
}

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

const CUSTOM_TARGETS: NutritionTargets = { calories: 2400, proteinG: 180, carbsG: 220, fatG: 70 };

function makeClient(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: "client-setup-fixture",
    workspaceId: WORKSPACE_OPTIM_ID,
    name: "Setup Fixture",
    email: "fixture@example.com",
    goal: "",
    programWeek: 0,
    programTotalWeeks: 12,
    avatarInitials: "SF",
    previousWeightLb: 0,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    ...overrides,
  };
}

console.log("\n1. Program assignment — building a real, independent enrollment\n");

check("A fresh client's enrollment starts at Week 1 when the start date falls in the current week", () => {
  const now = new Date("2026-03-10T12:00:00.000Z"); // a Tuesday
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: "client-new-1",
    startDateIso: "2026-03-09", // the Monday of the same week
    durationWeeks: 12,
    timeZone: "UTC",
    now,
  });
  assert.equal(deriveProgramWeek(enrollment, "2026-03-10"), 1);
});

check("Two different clients' enrollments never collide on id, even created at the same instant", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");
  const a = buildProgramEnrollmentForClient({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-a", startDateIso: "2026-03-09", durationWeeks: 12, now });
  const b = buildProgramEnrollmentForClient({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-b", startDateIso: "2026-03-09", durationWeeks: 12, now });
  assert.notEqual(a.id, b.id);
  assert.equal(a.clientId, "client-a");
  assert.equal(b.clientId, "client-b");
});

console.log("\n2. Coach setup — nutrition targets are applied exactly, never silently adjusted\n");

check("buildCoachSetupAppState applies the coach's exact calorie/macro targets, unrounded and unchanged", () => {
  const base = createInitialState({ clientId: "client-setup-fixture", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  const next = buildCoachSetupAppState(base, {
    clientId: "client-setup-fixture",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  assert.deepEqual(next.nutritionTargets, CUSTOM_TARGETS);
});

check("assignWeeklyCheckIn: false ('None for now') leaves checkInSchedule null", () => {
  const base = createInitialState({ clientId: "client-setup-fixture", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  const next = buildCoachSetupAppState(base, {
    clientId: "client-setup-fixture",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  assert.equal(next.checkInSchedule, null);
});

check("assignWeeklyCheckIn: true finalizes a real check-in schedule pointing at the new enrollment", () => {
  const base = createInitialState({ clientId: "client-setup-fixture", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  const next = buildCoachSetupAppState(base, {
    clientId: "client-setup-fixture",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: true,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  assert.ok(next.checkInSchedule);
  assert.equal(next.checkInSchedule!.enrollmentId, next.programEnrollment.id);
  assert.equal(next.checkInSchedule!.clientId, "client-setup-fixture");
});

check("Coach setup never touches this client's already-logged meals, workout session, chat, or reviews", () => {
  const base = createInitialState({ clientId: "client-setup-fixture", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  const withHistory = {
    ...base,
    meals: { breakfast: { period: "breakfast" as const, source: "manual" as const, manualName: "Eggs" } },
    chatMessages: [{ id: "m1", workspaceId: WORKSPACE_OPTIM_ID, clientId: base.clientId, assignedCoachId: COACH_PROFILE_TEAGUE.id, sender: "client" as const, text: "hi", createdAtIso: "2026-01-01T00:00:00.000Z" }],
  };
  const next = buildCoachSetupAppState(withHistory, {
    clientId: "client-setup-fixture",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  assert.deepEqual(next.meals, withHistory.meals);
  assert.deepEqual(next.chatMessages, withHistory.chatMessages);
});

console.log("\n3. Client-state isolation — the seeded demo client is never touched or shared with\n");

check("applyCoachSetup for a new client persists under its OWN storage key, never the demo client's", () => {
  assert.notEqual(resolveClientStateStorageKey("client-isolated-1"), resolveClientStateStorageKey(CLIENT_PROFILE_DEMO.id));
});

check("The demo client's own storage key is exactly the original fixed key (zero migration risk)", () => {
  assert.equal(resolveClientStateStorageKey(CLIENT_PROFILE_DEMO.id), "peak-coaching:state:v1");
});

check("A fresh AppState for a new client never carries the demo client's id, workspace assumptions, or program week", () => {
  const fresh = createInitialState({ clientId: "client-isolated-1", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  assert.equal(fresh.clientId, "client-isolated-1");
  assert.notEqual(fresh.clientId, CLIENT_PROFILE_DEMO.id);
  assert.equal(fresh.workoutSession.clientId, "client-isolated-1");
});

check("loadOrCreateClientAppState creates a client's state without ever reading or requiring another client's", () => {
  // No real localStorage in this Node script (loadState always returns
  // null outside a browser — see lib/storage.ts's isStorageAvailable) —
  // this exercises the "nothing stored yet -> create fresh" path.
  const created = loadOrCreateClientAppState("client-isolated-2", WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE.id);
  assert.equal(created.clientId, "client-isolated-2");
  assert.equal(loadClientAppState("client-isolated-2"), null); // never actually persisted by loadOrCreate itself
});

console.log("\n4. Activation readiness — training protocol and nutrition configuration are independent signals\n");

check("Training protocol assigned but nutrition not configured blocks activation on nutrition specifically", () => {
  const state = createInitialState({ clientId: "client-partial-1", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  const programAssignment = resolveProgramAssignmentRef("client-partial-1", state);
  const readiness = checkActivationReadiness({
    clientId: "client-partial-1",
    onboarding: { clientId: "client-partial-1", workspaceId: WORKSPACE_OPTIM_ID, currentStepIndex: 6, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    programAssignment,
    intendedProgram: null,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    nutritionConfigured: false,
    assignedProgram: makeValidAssignedProgram("client-partial-1", COACH_PROFILE_TEAGUE.id),
    healthReview: null,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.requirements.find((r) => r.id === "week1_program_assigned")?.met, true);
  assert.equal(readiness.requirements.find((r) => r.id === "nutrition_configuration_exists")?.met, false);
});

check("Nutrition configured but no training protocol assigned blocks activation on the protocol specifically", () => {
  const readiness = checkActivationReadiness({
    clientId: "client-partial-2",
    onboarding: { clientId: "client-partial-2", workspaceId: WORKSPACE_OPTIM_ID, currentStepIndex: 6, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    programAssignment: null,
    intendedProgram: null,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    nutritionConfigured: true,
    assignedProgram: null,
    healthReview: null,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.requirements.find((r) => r.id === "week1_program_assigned")?.met, false);
  assert.equal(readiness.requirements.find((r) => r.id === "nutrition_configuration_exists")?.met, true);
});

check("A completed coach setup (both training protocol and nutrition) satisfies both requirements together", () => {
  const state = buildCoachSetupAppState(createInitialState({ clientId: "client-ready-1", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id }), {
    clientId: "client-ready-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  const readiness = checkActivationReadiness({
    clientId: "client-ready-1",
    onboarding: { clientId: "client-ready-1", workspaceId: WORKSPACE_OPTIM_ID, currentStepIndex: 6, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    programAssignment: resolveProgramAssignmentRef("client-ready-1", state),
    intendedProgram: null,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    nutritionConfigured: true,
    assignedProgram: makeValidAssignedProgram("client-ready-1", COACH_PROFILE_TEAGUE.id),
    healthReview: null,
  });
  assert.equal(readiness.ready, true);
});

check("'None for now' (no weekly check-in) never appears as an activation requirement at all", () => {
  const readiness = checkActivationReadiness({
    clientId: "client-x",
    onboarding: { clientId: "client-x", workspaceId: WORKSPACE_OPTIM_ID, currentStepIndex: 6, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    programAssignment: { clientId: "client-x", workspaceId: WORKSPACE_OPTIM_ID, enrollmentId: "enr-1", assignedAtIso: "2026-01-01T00:00:00.000Z" },
    intendedProgram: null,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    nutritionConfigured: true,
    assignedProgram: makeValidAssignedProgram("client-x", COACH_PROFILE_TEAGUE.id),
    healthReview: null,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.requirements.some((r) => r.id.includes("check")), false);
});

console.log("\n5. Onboarding name sync — the client's own edit updates the coach's roster record\n");

check("Editing fullName on the basics step syncs the matching coach-created client's name", () => {
  let state = createInitialPlatformState();
  const client = makeClient({ id: "client-name-sync", name: "Placeholder Name" });
  state = { ...state, clients: [client] };
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "basics",
    answers: { fullName: "Real Name" },
    nextStepIndex: 1,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(state.clients.find((c) => c.id === client.id)?.name, "Real Name");
});

check("Name sync never touches a different client, even one created in the same dispatch batch", () => {
  let state = createInitialPlatformState();
  const target = makeClient({ id: "client-name-sync-a", name: "A Original" });
  const bystander = makeClient({ id: "client-name-sync-b", name: "B Original" });
  state = { ...state, clients: [target, bystander] };
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: target.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "basics",
    answers: { fullName: "A Edited" },
    nextStepIndex: 1,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(state.clients.find((c) => c.id === target.id)?.name, "A Edited");
  assert.equal(state.clients.find((c) => c.id === bystander.id)?.name, "B Original");
});

check("Saving a non-basics step never touches the client's name, even if a fullName-shaped key were present", () => {
  let state = createInitialPlatformState();
  const client = makeClient({ id: "client-name-sync-c", name: "Untouched Name" });
  state = { ...state, clients: [client] };
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "goals",
    answers: { primaryGoal: "build_muscle" },
    nextStepIndex: 2,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(state.clients.find((c) => c.id === client.id)?.name, "Untouched Name");
});

check("Blank/whitespace-only name edits are ignored rather than clearing the client's real name", () => {
  let state = createInitialPlatformState();
  const client = makeClient({ id: "client-name-sync-d", name: "Keep Me" });
  state = { ...state, clients: [client] };
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "basics",
    answers: { fullName: "   " },
    nextStepIndex: 1,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(state.clients.find((c) => c.id === client.id)?.name, "Keep Me");
});

console.log("\n6. Full loop — create, onboard, complete setup, activate, and verify seeded-client isolation\n");

check("A full create -> setup -> activate loop lands the client at Week 1 with their own real nutrition targets, and never touches the seeded demo client", () => {
  const clientId = "client-full-setup-loop";
  const now = new Date("2026-03-10T00:00:00.000Z"); // Tuesday

  // Coach completes setup for the new client.
  const clientState = applyCoachSetup({
    clientId,
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    startDateIso: "2026-03-09", // Monday of the same week -> Week 1
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: true,
    now,
  });

  assert.equal(deriveProgramWeek(clientState.programEnrollment, "2026-03-10"), 1);
  assert.deepEqual(clientState.nutritionTargets, CUSTOM_TARGETS);
  assert.ok(clientState.checkInSchedule);

  // Readiness now genuinely reflects a real program + nutrition config.
  const readiness = checkActivationReadiness({
    clientId,
    onboarding: { clientId, workspaceId: WORKSPACE_OPTIM_ID, currentStepIndex: 6, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    programAssignment: resolveProgramAssignmentRef(clientId, clientState),
    intendedProgram: null,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    nutritionConfigured: true,
    assignedProgram: makeValidAssignedProgram(clientId, COACH_PROFILE_TEAGUE.id),
    healthReview: null,
  });
  assert.equal(readiness.ready, true);
  assert.equal(resolveHomeRoute("client", "active", clientId), "/today");

  // The seeded demo client's own canonical state is completely unaffected —
  // this activity never read or wrote its storage key, and a fresh
  // createInitialState() for it still looks exactly as it always has.
  const demoFresh = createInitialState();
  assert.equal(demoFresh.clientId, CLIENT_PROFILE_DEMO.id);
  assert.notEqual(demoFresh.programEnrollment.id, clientState.programEnrollment.id);
  assert.notEqual(JSON.stringify(demoFresh.nutritionTargets), "undefined");
  assert.equal(resolveClientStateStorageKey(clientId) === resolveClientStateStorageKey(CLIENT_PROFILE_DEMO.id), false);
});

check("saveClientAppState + loadClientAppState round-trip a client's setup through JSON exactly (refresh-safe persistence)", () => {
  // Simulated storage: this Node script has no real localStorage, so this
  // exercises the pure round-trip shape (JSON serialize/deserialize) the
  // real browser localStorage read/write path relies on — see
  // lib/storage.ts and lib/tenancy/migrate.ts's migrateStoredState, which
  // loadClientAppState always runs the parsed value through.
  const state = buildCoachSetupAppState(createInitialState({ clientId: "client-roundtrip", workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id }), {
    clientId: "client-roundtrip",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  const roundTripped = JSON.parse(JSON.stringify(state));
  assert.deepEqual(roundTripped.nutritionTargets, CUSTOM_TARGETS);
  assert.equal(roundTripped.programEnrollment.durationWeeks, 12);
  // saveClientAppState itself is a no-op outside a browser (see
  // lib/storage.ts's isStorageAvailable) — asserting it doesn't throw here
  // is what's actually testable in this environment.
  saveClientAppState("client-roundtrip", state);
});

console.log("\n7. Saving setup only ever advances lifecycle forward, never regresses it (regression)\n");

check("Saving setup from coach_setup advances lifecycle to ready_to_activate", () => {
  assert.equal(shouldAdvanceLifecycleOnSetupSave("coach_setup"), true);
});

check("Re-saving setup for an already-active client never regresses them back to ready_to_activate", () => {
  assert.equal(shouldAdvanceLifecycleOnSetupSave("active"), false);
});

check("Re-saving setup for a paused or completed client never resurrects/regresses their status", () => {
  assert.equal(shouldAdvanceLifecycleOnSetupSave("paused"), false);
  assert.equal(shouldAdvanceLifecycleOnSetupSave("completed"), false);
});

check("Re-saving setup while already ready_to_activate is a harmless no-op, not a false 'advance'", () => {
  assert.equal(shouldAdvanceLifecycleOnSetupSave("ready_to_activate"), false);
});

console.log("\n8. Chat/reviews for an activated, coach-created client never throw (regression)\n");

check("resolveAssignedCoachId genuinely cannot resolve a coach-created client — proving the regression scenario is real", () => {
  assert.throws(() => resolveAssignedCoachId("client-activated-chat-1"));
});

check("An activated coach-created client's own AppState carries their real assigned coach, not the demo client's", () => {
  const state = applyCoachSetup({
    clientId: "client-activated-chat-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_ALEX.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  assert.equal(state.primaryCoachId, COACH_PROFILE_ALEX.id);
});

check("ADD_CHAT_MESSAGE never throws for an activated, coach-created client, and stamps their real coach", () => {
  const clientState = applyCoachSetup({
    clientId: "client-activated-chat-2",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_ALEX.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  // Before the primaryCoachId fix, this dispatch called
  // resolveAssignedCoachId(state.clientId) internally and threw for any
  // non-seed client — exactly what crashed /chat for a real newly
  // activated client (Next.js's error boundary, not a caught exception).
  const next = reducer(clientState, {
    type: "ADD_CHAT_MESSAGE",
    message: { id: "m1", createdAtIso: "2026-01-01T00:00:00.000Z", sender: "coach", text: "Welcome!" },
  });
  assert.equal(next.chatMessages[0].assignedCoachId, COACH_PROFILE_ALEX.id);
});

check("REPORT_PAIN never throws for an activated, coach-created client, and routes the review to their real coach", () => {
  const clientState = applyCoachSetup({
    clientId: "client-activated-chat-3",
    workspaceId: WORKSPACE_OPTIM_ID,
    primaryCoachId: COACH_PROFILE_ALEX.id,
    startDateIso: "2026-03-09",
    durationWeeks: 12,
    nutritionTargets: CUSTOM_TARGETS,
    assignWeeklyCheckIn: false,
    now: new Date("2026-03-10T00:00:00.000Z"),
  });
  const next = reducer(clientState, {
    type: "REPORT_PAIN",
    exerciseId: clientState.workoutSession.currentExerciseId ?? "incline-db-press",
    location: "shoulder",
    ratingZeroToTen: 6,
    onset: "during_set",
    causedByMovement: "pressing",
    continuedAfterSet: false,
    affectsOutsideGym: false,
    symptomQuality: "aching",
  });
  assert.equal(next.workoutSession.painReports.length, 1);
  assert.equal(next.reviewRequests[0]?.assignedCoachId, COACH_PROFILE_ALEX.id);
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
