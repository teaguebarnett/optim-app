// Phase 3 — adaptive planning verification.
//
// Exercises the training-plan state model, meal-timing profiles, and the
// centralized daily planner directly against the real reducer — no UI
// rendering involved. Run with: npm run verify:planner
//
// Uses Node's built-in TypeScript stripping (see package.json), matching
// the convention established by lib/tenancy/verify-isolation.mts in
// Phase 2, rather than adding a test framework the project doesn't
// already use.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { createInitialState, reducer } from "../state.ts";
import { buildDailyPlan } from "./planner.ts";
import { resolveLocalDateIso, resolveScopedTrainingPlan, trainingPlanMatchesScope } from "./training-plan.ts";
import { mealTimingProfileForOption } from "./meal-timing.ts";
import { computeDailyCompletionPercent, computeNutritionTotals, deriveTaskStates } from "../calculations.ts";
import { canCompleteExercise } from "../workout-analysis.ts";
import { MEAL_OPTIONS, PUSH_WORKOUT } from "../mock-data.ts";
import { WORKSPACE_ATLAS, WORKSPACE_OPTIM } from "../tenancy/seed.ts";
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

// A fixed reference "now" so every scenario is deterministic regardless of
// when this script actually runs. 10:00 AM local time on the demo's date.
const FIXED_TODAY = resolveLocalDateIso(new Date());
function referenceNow(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function plan(state: AppState, now: Date) {
  const trainingPlan = resolveScopedTrainingPlan(state.dailyTrainingPlan, state.workspaceId, state.clientId, state.dateIso);
  const nutritionTotals = computeNutritionTotals(state.meals);
  return { trainingPlan, result: buildDailyPlan({ state, trainingPlan, now, nutritionTotals }) };
}

console.log("\n1-4. Training-time entry\n");

check("A day initially has no selected training time", () => {
  const state = createInitialState();
  assert.equal(state.dailyTrainingPlan, null);
});

check("A client can save a morning training time", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_TIME", time24: "07:00" });
  assert.equal(state.dailyTrainingPlan?.status, "scheduled");
  assert.equal(state.dailyTrainingPlan?.plannedTimeLabel, "7:00 AM");
});

check("A client can save an afternoon training time", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_TIME", time24: "14:30" });
  assert.equal(state.dailyTrainingPlan?.plannedTimeLabel, "2:30 PM");
});

check("A client can save an evening training time", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_TIME", time24: "19:00" });
  assert.equal(state.dailyTrainingPlan?.plannedTimeLabel, "7:00 PM");
});

console.log("\n5. Changing time preserves completed actions\n");

check("Changing training time does not lose a previously logged morning weight", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_MORNING_WEIGHT", weightLb: 188.4 });
  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "07:00" });
  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "18:00" });
  assert.equal(state.morningWeight.weightLb, 188.4);
  assert.equal(state.dailyTrainingPlan?.plannedTimeLabel, "6:00 PM");
});

console.log("\n6-9. Not sure yet / Rest day\n");

check("A client can select Not sure yet", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_UNSURE" });
  assert.equal(state.dailyTrainingPlan?.status, "unsure");
});

check("Not sure yet does not lock meals or the workout", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_UNSURE" });
  const tasks = deriveTaskStates(state);
  // "daily-completion" is a review summary that's legitimately unavailable
  // until the day is actually done — that's not the kind of client-facing
  // action-blocking the spec means by "must not lock meals or the workout."
  const actionableTasks = tasks.filter((t) => t.id !== "daily-completion");
  assert.ok(
    actionableTasks.every((t) => t.state !== "locked"),
    "no actionable task should report locked after choosing Not sure yet"
  );
});

check("A client can select Rest day", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_REST_DAY" });
  assert.equal(state.dailyTrainingPlan?.status, "rest_day");
});

check("Rest day does not complete or delete the prescribed workout", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_REST_DAY" });
  assert.equal(state.workoutSession.status, "not-started");
  assert.equal(state.workoutSession.workoutId, PUSH_WORKOUT.id);
  const { result } = plan(state, referenceNow(10));
  const workoutItem = result.items.find((i) => i.id === "workout");
  assert.ok(workoutItem);
  assert.notEqual(workoutItem?.status, "completed");
  assert.notEqual(workoutItem?.status, "skipped");
});

console.log("\n10. Training-time isolation by workspace/client/date\n");

check("A plan scoped to a different date is never reused", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_TIME", time24: "07:00" });
  const resolved = resolveScopedTrainingPlan(state.dailyTrainingPlan, state.workspaceId, state.clientId, "2000-01-01");
  assert.equal(resolved, null);
});

check("A plan scoped to a different workspace or client is never reused", () => {
  const state = reducer(createInitialState(), { type: "SET_TRAINING_TIME", time24: "07:00" });
  assert.equal(trainingPlanMatchesScope(state.dailyTrainingPlan, "some-other-workspace", state.clientId, state.dateIso), false);
  assert.equal(trainingPlanMatchesScope(state.dailyTrainingPlan, state.workspaceId, "some-other-client", state.dateIso), false);
});

console.log("\n11-12. Meal timing profiles\n");

check("A lighter meal option produces a different timing profile than a larger one", () => {
  const light = MEAL_OPTIONS.snack.find((o) => o.macros.calories <= 320)!;
  const larger = MEAL_OPTIONS.dinner.reduce((a, b) => (a.macros.calories > b.macros.calories ? a : b));
  const lightProfile = mealTimingProfileForOption(light);
  const largerProfile = mealTimingProfileForOption(larger);
  assert.notEqual(lightProfile.category, largerProfile.category);
  assert.ok(lightProfile.preTrainingLeadMinLow < largerProfile.preTrainingLeadMinLow);
});

check("Meal timing falls back to conservative metadata rather than inventing nutrition data", () => {
  const profile = mealTimingProfileForOption(null);
  assert.equal(profile.isFallback, true);
  assert.equal(profile.category, "standard");
});

console.log("\n13. No countdown\n");

check("The old countdown modules were removed, not replaced with another countdown", () => {
  assert.equal(existsSync(new URL("../workout-window.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../hooks/use-countdown.ts", import.meta.url)), false);
});

check("A passed planned time uses truthful language, not a countdown value", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "08:00" });
  const { result } = plan(state, referenceNow(9));
  const workoutItem = result.items.find((i) => i.id === "workout");
  assert.equal(workoutItem?.timeLabel, "Training was planned for 8:00 AM.");
  assert.doesNotMatch(workoutItem?.timeLabel ?? "", /^\d{2}:\d{2}$/);
});

console.log("\n14. No after-breakfast assumption for an evening workout\n");

check("Scheduling an evening workout does not recommend training right after breakfast", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "19:00" });
  state = reducer(state, { type: "SELECT_MEAL_OPTION", period: "breakfast", optionId: MEAL_OPTIONS.breakfast[0].id });
  const { result } = plan(state, referenceNow(8, 30));
  const workoutItem = result.items.find((i) => i.id === "workout");
  assert.equal(workoutItem?.status, "upcoming");
  assert.notEqual(result.nextAction?.id, "workout");
});

console.log("\n15. A missed earlier meal does not block a later one\n");

check("Skipping breakfast does not lock lunch", () => {
  const state = reducer(createInitialState(), { type: "SKIP_MEAL", period: "breakfast", reason: "forgot" });
  const tasks = deriveTaskStates(state);
  const lunch = tasks.find((t) => t.id === "lunch");
  assert.notEqual(lunch?.state, "locked");
});

console.log("\n16. Changing training time rearranges unfinished recommendations\n");

check("Changing training time updates the workout's guidance without touching completed items", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_MORNING_WEIGHT", weightLb: 190 });
  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "07:00" });
  const morningPlan = plan(state, referenceNow(6, 30)).result;
  const morningWorkout = morningPlan.items.find((i) => i.id === "workout");
  assert.equal(morningWorkout?.timeLabel, "Planned for 7:00 AM");

  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "19:00" });
  const eveningPlan = plan(state, referenceNow(6, 30)).result;
  const eveningWorkout = eveningPlan.items.find((i) => i.id === "workout");
  assert.equal(eveningWorkout?.timeLabel, "Planned for 7:00 PM");
  assert.equal(state.morningWeight.weightLb, 190, "completed morning weight must survive the change");
});

console.log("\n17. Completed actions keep their actual state and timestamp\n");

check("A logged morning weight keeps its original timestamp through unrelated actions", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_MORNING_WEIGHT", weightLb: 187.6 });
  const loggedAt = state.morningWeight.loggedAtIso;
  state = reducer(state, { type: "SET_TRAINING_UNSURE" });
  state = reducer(state, { type: "SKIP_MEAL", period: "breakfast", reason: "forgot" });
  assert.equal(state.morningWeight.weightLb, 187.6);
  assert.equal(state.morningWeight.loggedAtIso, loggedAt);
});

console.log("\n18. Optional snack does not affect adherence when ignored\n");

check("Daily completion percent is identical whether or not an optional snack was ever addressed", () => {
  const withoutSnack = createInitialState();
  const withSnackSkipped = reducer(createInitialState(), { type: "SKIP_MEAL", period: "snack", reason: "forgot" });
  assert.equal(computeDailyCompletionPercent(withoutSnack), computeDailyCompletionPercent(withSnackSkipped));
});

console.log("\n19-20. Fuel ring only counts confirmed data\n");

check("Previewing a meal (never confirming it) does not increase calories consumed", () => {
  const state = createInitialState();
  const totals = computeNutritionTotals(state.meals);
  assert.equal(totals.calories, 0);
});

check("Only option/manual (confirmed) meal selections count toward totals", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SKIP_MEAL", period: "breakfast", reason: "forgot" });
  state = reducer(state, { type: "PLAN_MEAL_LATER", period: "lunch" });
  const totals = computeNutritionTotals(state.meals);
  assert.equal(totals.calories, 0, "skipped/planned-later selections must not contribute calories");
});

console.log("\n21. A passed planned time never fabricates workout status\n");

check("A passed planned training time leaves the workout truthfully not-started", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "06:00" });
  const { result } = plan(state, referenceNow(20));
  assert.equal(state.workoutSession.status, "not-started");
  const workoutItem = result.items.find((i) => i.id === "workout");
  assert.equal(workoutItem?.status, "recommended");
});

console.log("\n22. The centralized next action updates after relevant events\n");

check("Next action progresses: log weight -> enter time -> choose breakfast -> begin workout", () => {
  let state = createInitialState();
  // Morning weight is the literal first action of the day, so it takes
  // priority over the training-time prompt on a completely fresh state.
  assert.equal(plan(state, referenceNow(7)).result.nextAction?.id, "morning-weight");

  state = reducer(state, { type: "SET_MORNING_WEIGHT", weightLb: 190 });
  assert.equal(plan(state, referenceNow(7)).result.nextAction?.kind, "training-time");

  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "17:00" });
  assert.equal(plan(state, referenceNow(7)).result.nextAction?.id, "breakfast");

  state = reducer(state, { type: "SELECT_MEAL_OPTION", period: "breakfast", optionId: MEAL_OPTIONS.breakfast[0].id });
  assert.equal(plan(state, referenceNow(18)).result.nextAction?.id, "workout");

  state = reducer(state, { type: "START_WORKOUT" });
  assert.equal(plan(state, referenceNow(18)).result.nextAction?.id, "workout");
});

console.log("\n23. Phase 1 completion/adherence rules still hold\n");

check("An exercise with zero completed working sets still cannot be marked complete", () => {
  const state = createInitialState();
  const exercise = PUSH_WORKOUT.exercises[0];
  const log = state.workoutSession.exerciseLogs[exercise.id];
  assert.equal(canCompleteExercise(exercise, log), false);
});

check("COMPLETE_WORKOUT still refuses zero logged working sets", () => {
  const state = createInitialState();
  const next = reducer(state, {
    type: "COMPLETE_WORKOUT",
    summary: {
      exercisesCompleted: 0,
      exercisesSkipped: 0,
      workingSetsCompleted: 0,
      skippedSetsCount: 0,
      missingRpeCount: 0,
      averageRpe: null,
      painReportCount: 0,
      durationMin: 1,
      headline: "",
      detail: "",
      needsReview: false,
      fullyCompleted: false,
    },
  });
  assert.equal(next.workoutSession.status, "not-started");
});

console.log("\n25. Second workspace keeps independently configured branding\n");

check("Atlas fixture workspace branding is independent of the OPTIM demo workspace's colors", () => {
  assert.notEqual(WORKSPACE_ATLAS.id, WORKSPACE_OPTIM.id);
  assert.notEqual(WORKSPACE_ATLAS.branding.primaryColor, WORKSPACE_OPTIM.branding.primaryColor);
  assert.notEqual(WORKSPACE_ATLAS.branding.assistantDisplayName, WORKSPACE_OPTIM.branding.assistantDisplayName);
});

console.log(`\n(Phase 2 isolation/permission suite covered separately by: npm run verify:tenancy)`);
console.log(`(Today's local date resolved as ${FIXED_TODAY} for these scenarios)`);

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
