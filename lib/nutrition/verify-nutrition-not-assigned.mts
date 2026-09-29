// A real client with no assigned nutrition plan has AppState.nutritionTargets
// === null (app/actions/production-programs.ts's getMySupabaseAppStateAction
// used to substitute the demo NUTRITION_TARGETS). These tests pin that null
// stays missing through every pure layer that reads it: status messages,
// the planner's snack recommendation, the daily-record snapshot, persisted
// content validation, and historical target-met derivation — and that demo
// mode's non-null default is unchanged. No DB, no network, no browser.
// Run with: npm run verify:nutrition-not-assigned

import assert from "node:assert/strict";
import { createInitialState } from "../state.ts";
import { NUTRITION_TARGETS } from "../mock-data.ts";
import { nutritionStatusMessage, computeNutritionTotals, NUTRITION_NOT_ASSIGNED_LABEL } from "../calculations.ts";
import { buildDailyPlan } from "../planning/planner.ts";
import { buildDailyRecordFromLiveState } from "../history/build-daily-record.ts";
import { deriveCalorieTargetMet, deriveProteinTargetMet } from "../history/derive-nutrition.ts";
import { validateDailyActivityContent } from "../production/validation.ts";
import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import type { AppState } from "../state.ts";

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

function demoState(): AppState {
  return createInitialState({ workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id });
}

function unassignedState(): AppState {
  return { ...demoState(), nutritionTargets: null, assignedNutritionPlan: undefined };
}

// Lunch logged two hours ago, dinner still open, tiny intake: with real
// targets this is a large remaining gap (snack "closes the gap" reason).
function withSmallLunch(state: AppState, now: Date): AppState {
  return {
    ...state,
    meals: {
      lunch: {
        period: "lunch",
        source: "manual",
        manualName: "Test lunch",
        macros: { calories: 300, proteinG: 20, carbsG: 30, fatG: 10 },
        completedAtIso: new Date(now.getTime() - 2 * 60 * 60_000).toISOString(),
      },
    },
  };
}

console.log("demo mode is unchanged");
check("createInitialState still defaults to the demo NUTRITION_TARGETS", () => assert.deepEqual(demoState().nutritionTargets, NUTRITION_TARGETS));

console.log("status message");
check("null targets produce the not-assigned message, never a progress claim", () => {
  const msg = nutritionStatusMessage({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, {}, null);
  assert.match(msg, new RegExp(NUTRITION_NOT_ASSIGNED_LABEL));
  assert.doesNotMatch(msg, /targets are set|on track|target reached/i);
});
check("null targets with intake logged still never judge progress", () => {
  const msg = nutritionStatusMessage({ calories: 2500, proteinG: 150, carbsG: 200, fatG: 80 }, {}, null);
  assert.match(msg, new RegExp(NUTRITION_NOT_ASSIGNED_LABEL));
});
check("real targets keep the existing messages", () => {
  assert.equal(nutritionStatusMessage({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, {}, NUTRITION_TARGETS), "Your nutrition targets are set for today.");
});

console.log("planner snack recommendation");
const NOW = new Date("2026-09-29T19:00:00Z");
check("with real targets, a large remaining gap recommends a snack (baseline)", () => {
  const state = withSmallLunch(demoState(), NOW);
  const plan = buildDailyPlan({ state, trainingPlan: null, now: NOW, nutritionTotals: computeNutritionTotals(state.meals) });
  assert.ok(plan.mealSchedule.entries.snack, "expected a snack entry with real targets");
});
check("with null targets, no snack is recommended from an invented gap", () => {
  const state = withSmallLunch(unassignedState(), NOW);
  const plan = buildDailyPlan({ state, trainingPlan: null, now: NOW, nutritionTotals: computeNutritionTotals(state.meals) });
  assert.equal(plan.mealSchedule.entries.snack, undefined);
});

console.log("daily record snapshot");
check("null targets snapshot as null, never zeros or demo targets", () => {
  const state = unassignedState();
  const record = buildDailyRecordFromLiveState(state, state.programEnrollment, "live");
  assert.equal(record.nutrition.targetsSnapshot, null);
});
check("real targets still snapshot exactly", () => {
  const state = demoState();
  const record = buildDailyRecordFromLiveState(state, state.programEnrollment, "live");
  assert.deepEqual(record.nutrition.targetsSnapshot, NUTRITION_TARGETS);
});
check("historical target-met is insufficient_data when no targets were in effect", () => {
  const state = withSmallLunch(unassignedState(), NOW);
  const record = buildDailyRecordFromLiveState(state, state.programEnrollment, "live");
  assert.equal(deriveCalorieTargetMet(record), "insufficient_data");
  assert.equal(deriveProteinTargetMet(record), "insufficient_data");
});

console.log("persisted content validation");
const BASE_ACTIVITY = {
  training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "completed", exerciseLogs: {}, painReports: [], workingSetsCompleted: 0, workingSetsPrescribed: 0 },
  nutrition: { meals: {}, periodsInPlan: [], targetsSnapshot: null as unknown },
};
check("a null targetsSnapshot is accepted (so no-plan days read back)", () => {
  const result = validateDailyActivityContent(BASE_ACTIVITY);
  assert.equal(result.nutrition.targetsSnapshot, null);
});
check("a non-object, non-null targetsSnapshot is still rejected", () => {
  assert.throws(() => validateDailyActivityContent({ ...BASE_ACTIVITY, nutrition: { ...BASE_ACTIVITY.nutrition, targetsSnapshot: 2200 } }));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
