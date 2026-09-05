// Phase 5.2 — coach-owned meal recommendations: construction, duplication,
// assignment isolation, and the platform-store reducer actions that create,
// edit, delete, and assign/unassign them.

import assert from "node:assert/strict";
import { createEmptyMealRecommendation, duplicateMealRecommendation, isAssignedToClient } from "./meal-recommendations.ts";
import { createInitialPlatformState, platformReducer } from "./platform-store.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, COACH_PROFILE_ALEX } from "../tenancy/seed.ts";
import type { ClientProfile } from "../tenancy/types";
import type { MealRecommendation } from "./types";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

console.log("\n1. Construction\n");

check("a fresh recommendation belongs to the creating coach, starts active with no assignments and no macros", () => {
  const r = createEmptyMealRecommendation({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, nowIso: "2026-01-01T00:00:00.000Z" });
  assert.equal(r.coachId, COACH_PROFILE_TEAGUE.id);
  assert.equal(r.status, "active");
  assert.deepEqual(r.assignedClientIds, []);
  assert.equal(r.macros, undefined);
});

console.log("\n2. Duplication\n");

check("duplicateMealRecommendation produces a new id and clears assignments, but keeps the coach and content", () => {
  const original: MealRecommendation = {
    ...createEmptyMealRecommendation({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, nowIso: "2026-01-01T00:00:00.000Z" }),
    name: "Chicken and rice bowl",
    assignedClientIds: ["client-1", "client-2"],
    macros: { calories: 500, proteinG: 40, carbsG: 50, fatG: 12 },
  };
  const copy = duplicateMealRecommendation(original, "2026-01-02T00:00:00.000Z");
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.coachId, original.coachId);
  assert.deepEqual(copy.macros, original.macros);
  assert.deepEqual(copy.assignedClientIds, []);
  assert.equal(copy.name, "Chicken and rice bowl (copy)");
});

console.log("\n3. isAssignedToClient\n");

check("isAssignedToClient reads assignedClientIds directly", () => {
  const r: MealRecommendation = { ...createEmptyMealRecommendation({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, nowIso: "2026-01-01T00:00:00.000Z" }), assignedClientIds: ["client-1"] };
  assert.equal(isAssignedToClient(r, "client-1"), true);
  assert.equal(isAssignedToClient(r, "client-2"), false);
});

console.log("\n4. Platform-store reducer\n");

function makeRecommendation(overrides: Partial<MealRecommendation> = {}): MealRecommendation {
  return { ...createEmptyMealRecommendation({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, nowIso: "2026-01-01T00:00:00.000Z" }), name: "Test meal", ...overrides };
}

check("SAVE_MEAL_RECOMMENDATION creates a new record when the id doesn't exist yet", () => {
  const state = platformReducer(createInitialPlatformState(), { type: "SAVE_MEAL_RECOMMENDATION", recommendation: makeRecommendation() });
  assert.equal(state.mealRecommendations.length, 1);
  assert.equal(state.mealRecommendations[0].name, "Test meal");
});

check("SAVE_MEAL_RECOMMENDATION updates an existing record in place rather than duplicating it", () => {
  const rec = makeRecommendation();
  let state = platformReducer(createInitialPlatformState(), { type: "SAVE_MEAL_RECOMMENDATION", recommendation: rec });
  state = platformReducer(state, { type: "SAVE_MEAL_RECOMMENDATION", recommendation: { ...rec, name: "Renamed meal" } });
  assert.equal(state.mealRecommendations.length, 1);
  assert.equal(state.mealRecommendations[0].name, "Renamed meal");
});

check("DELETE_MEAL_RECOMMENDATION only removes the record when the coachId also matches (isolation)", () => {
  const rec = makeRecommendation();
  let state = platformReducer(createInitialPlatformState(), { type: "SAVE_MEAL_RECOMMENDATION", recommendation: rec });
  state = platformReducer(state, { type: "DELETE_MEAL_RECOMMENDATION", recommendationId: rec.id, coachId: COACH_PROFILE_ALEX.id });
  assert.equal(state.mealRecommendations.length, 1, "a different coach's delete attempt must never remove another coach's recommendation");
  state = platformReducer(state, { type: "DELETE_MEAL_RECOMMENDATION", recommendationId: rec.id, coachId: COACH_PROFILE_TEAGUE.id });
  assert.equal(state.mealRecommendations.length, 0);
});

check("SET_MEAL_RECOMMENDATION_ASSIGNMENT assigns and unassigns a client, and is idempotent", () => {
  const rec = makeRecommendation();
  let state = platformReducer(createInitialPlatformState(), { type: "SAVE_MEAL_RECOMMENDATION", recommendation: rec });
  state = platformReducer(state, { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId: rec.id, coachId: COACH_PROFILE_TEAGUE.id, clientId: "client-1", assigned: true });
  assert.deepEqual(state.mealRecommendations[0].assignedClientIds, ["client-1"]);

  // Assigning the same client again must never duplicate the entry.
  state = platformReducer(state, { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId: rec.id, coachId: COACH_PROFILE_TEAGUE.id, clientId: "client-1", assigned: true });
  assert.deepEqual(state.mealRecommendations[0].assignedClientIds, ["client-1"]);

  state = platformReducer(state, { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId: rec.id, coachId: COACH_PROFILE_TEAGUE.id, clientId: "client-1", assigned: false });
  assert.deepEqual(state.mealRecommendations[0].assignedClientIds, []);
});

check("SET_MEAL_RECOMMENDATION_ASSIGNMENT never assigns a client through a different coach's id", () => {
  const rec = makeRecommendation();
  let state = platformReducer(createInitialPlatformState(), { type: "SAVE_MEAL_RECOMMENDATION", recommendation: rec });
  state = platformReducer(state, { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId: rec.id, coachId: COACH_PROFILE_ALEX.id, clientId: "client-1", assigned: true });
  assert.deepEqual(state.mealRecommendations[0].assignedClientIds, []);
});

check("A recommendation can be assigned to multiple clients independently", () => {
  const rec = makeRecommendation();
  let state = platformReducer(createInitialPlatformState(), { type: "SAVE_MEAL_RECOMMENDATION", recommendation: rec });
  state = platformReducer(state, { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId: rec.id, coachId: COACH_PROFILE_TEAGUE.id, clientId: "client-1", assigned: true });
  state = platformReducer(state, { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId: rec.id, coachId: COACH_PROFILE_TEAGUE.id, clientId: "client-2", assigned: true });
  assert.deepEqual(state.mealRecommendations[0].assignedClientIds.sort(), ["client-1", "client-2"]);
  state = platformReducer(state, { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId: rec.id, coachId: COACH_PROFILE_TEAGUE.id, clientId: "client-1", assigned: false });
  assert.deepEqual(state.mealRecommendations[0].assignedClientIds, ["client-2"]);
});

console.log("\n5. Fresh-client isolation — a brand-new client never inherits an existing assignment\n");

function makeClient(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: "client-fresh-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    name: "Fresh Client",
    email: "fresh@example.com",
    goal: "",
    programWeek: 0,
    programTotalWeeks: 12,
    avatarInitials: "FC",
    previousWeightLb: 0,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    ...overrides,
  };
}

check("CREATE_CLIENT never touches mealRecommendations at all — a brand-new client is absent from every existing recommendation's assignedClientIds, including one already assigned to a different client", () => {
  const rec = makeRecommendation({ assignedClientIds: ["client-existing-1"] });
  let state = platformReducer(createInitialPlatformState(), { type: "SAVE_MEAL_RECOMMENDATION", recommendation: rec });

  const freshClient = makeClient();
  state = platformReducer(state, {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client: freshClient,
    intendedStartDateIso: "2026-02-01",
    intendedDurationWeeks: 8,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(state.mealRecommendations.length, 1, "creating a client must never create or duplicate a meal recommendation");
  assert.deepEqual(state.mealRecommendations[0].assignedClientIds, ["client-existing-1"], "the pre-existing assignment must be untouched");
  assert.equal(isAssignedToClient(state.mealRecommendations[0], freshClient.id), false, "a fresh client must never appear assigned to a recommendation nobody assigned them to");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
