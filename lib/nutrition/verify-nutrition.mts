// Nutrition feature verification — the photo-meal reducer path, macro/
// calorie view-model captions, meal-card status derivation, the intelligent
// status line, and the deterministic demo vision estimator. Exercises the
// real reducer and pure lib functions directly, no UI rendering involved.
// Run with: npm run verify:nutrition — matches the convention established by
// lib/planning/verify-planner.mts.

import assert from "node:assert/strict";

import { createInitialState, nextId, reducer } from "../state.ts";
import { computeNutritionTotals, MEAL_ORDER } from "../calculations.ts";
import { buildDailyPlan } from "../planning/planner.ts";
import { resolveScopedTrainingPlan } from "../planning/training-plan.ts";
import { deriveNutritionStatusLine } from "./status.ts";
import {
  deriveMealCardStatus,
  macroRemainingCaption,
  mealDisplayName,
  mealProvenanceLabel,
  nextRelevantMealPeriod,
  remainingCalorieCaption,
  sumMealEstimateItems,
} from "./view-model.ts";
import { localDemoMealVisionEstimator } from "./vision-estimator.ts";
import { NUTRITION_TARGETS } from "../mock-data.ts";
import type { AppState } from "../state.ts";
import type { MealEstimateItem } from "../types";

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

async function checkAsync(description: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

function plan(state: AppState, now: Date) {
  const trainingPlan = resolveScopedTrainingPlan(state.dailyTrainingPlan, state.workspaceId, state.clientId, state.dateIso);
  const nutritionTotals = computeNutritionTotals(state.meals);
  return { trainingPlan, result: buildDailyPlan({ state, trainingPlan, now, nutritionTotals }) };
}

function sampleItems(): MealEstimateItem[] {
  return [
    { id: nextId("estimate-item"), name: "Grilled chicken", quantityLabel: "6 oz", macros: { calories: 280, proteinG: 52, carbsG: 0, fatG: 6 } },
    { id: nextId("estimate-item"), name: "White rice", quantityLabel: "1 cup", macros: { calories: 205, proteinG: 4, carbsG: 45, fatG: 0 } },
  ];
}

// ---------------------------------------------------------------------------
// LOG_PHOTO_MEAL reducer behavior
// ---------------------------------------------------------------------------

check("LOG_PHOTO_MEAL logs a photo-estimate meal counted in daily totals", () => {
  let state = createInitialState();
  const items = sampleItems();
  const macros = sumMealEstimateItems(items);
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "lunch", items, macros, confidence: "medium" });

  assert.equal(state.meals.lunch?.source, "photo-estimate");
  assert.equal(state.meals.lunch?.isEstimate, true);
  assert.deepEqual(state.meals.lunch?.macros, macros);
  assert.equal(state.meals.lunch?.photoEstimate?.items.length, 2);

  const totals = computeNutritionTotals(state.meals);
  assert.equal(totals.calories, macros.calories);
  assert.equal(totals.proteinG, macros.proteinG);
});

check("Re-confirming a photo meal for the same period replaces, never doubles, totals", () => {
  let state = createInitialState();
  const firstItems = sampleItems();
  const firstMacros = sumMealEstimateItems(firstItems);
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "dinner", items: firstItems, macros: firstMacros, confidence: "high" });

  const editedItems: MealEstimateItem[] = [
    { id: nextId("estimate-item"), name: "Salmon", quantityLabel: "6 oz", macros: { calories: 310, proteinG: 40, carbsG: 0, fatG: 16 } },
  ];
  const editedMacros = sumMealEstimateItems(editedItems);
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "dinner", items: editedItems, macros: editedMacros, confidence: "high" });

  assert.equal(state.meals.dinner?.photoEstimate?.items.length, 1);
  const totals = computeNutritionTotals(state.meals);
  assert.equal(totals.calories, editedMacros.calories, "totals must reflect the edited entry, not both");
});

check("A logged photo meal survives UNDO then a fresh manual entry without double counting", () => {
  let state = createInitialState();
  const items = sampleItems();
  const macros = sumMealEstimateItems(items);
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "breakfast", items, macros, confidence: "medium" });
  state = reducer(state, { type: "UNDO_MEAL_SELECTION", period: "breakfast" });
  assert.equal(state.meals.breakfast, undefined);

  state = reducer(state, {
    type: "SET_MANUAL_MEAL",
    period: "breakfast",
    manualName: "Oatmeal",
    macros: { calories: 300, proteinG: 10, carbsG: 50, fatG: 5 },
  });
  const totals = computeNutritionTotals(state.meals);
  assert.equal(totals.calories, 300, "only the manual entry should count, not the undone photo estimate");
});

// ---------------------------------------------------------------------------
// View-model captions
// ---------------------------------------------------------------------------

check("macroRemainingCaption reports remaining/reached/over correctly", () => {
  assert.equal(macroRemainingCaption(150, 200), "50g remaining");
  assert.equal(macroRemainingCaption(200, 200), "Target reached");
  assert.equal(macroRemainingCaption(220, 200), "20g over target");
});

check("remainingCalorieCaption mirrors the same three states", () => {
  assert.equal(remainingCalorieCaption(2500, 3000), "500 cal");
  assert.equal(remainingCalorieCaption(3000, 3000), "Target reached");
  assert.equal(remainingCalorieCaption(3200, 3000), "200 cal over");
});

check("sumMealEstimateItems sums macros across items and tolerates zero items", () => {
  const items = sampleItems();
  const total = sumMealEstimateItems(items);
  assert.equal(total.calories, 485);
  assert.equal(total.proteinG, 56);
  assert.deepEqual(sumMealEstimateItems([]), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
});

check("mealDisplayName / mealProvenanceLabel distinguish option, manual, and photo-estimate sources", () => {
  const optionSelection = { period: "lunch", source: "option", optionId: "l-1" } as const;
  const manualSelection = { period: "lunch", source: "manual", manualName: "Sandwich" } as const;
  const photoSelection = { period: "lunch", source: "photo-estimate", manualName: "Chicken, rice" } as const;

  assert.equal(mealProvenanceLabel(optionSelection), "Coach-approved option");
  assert.equal(mealProvenanceLabel(manualSelection), "Your manual entry");
  assert.equal(mealProvenanceLabel(photoSelection), "OPTIM photo estimate");
  assert.equal(mealDisplayName("lunch", manualSelection), "Sandwich");
  assert.equal(mealDisplayName("lunch", photoSelection), "Chicken, rice");
});

// ---------------------------------------------------------------------------
// Meal-card status derivation
// ---------------------------------------------------------------------------

check("deriveMealCardStatus: completed task state always reads as logged", () => {
  const status = deriveMealCardStatus({ taskState: "completed", isNextAction: false, scheduleEntry: undefined, now: new Date() });
  assert.equal(status, "logged");
});

check("deriveMealCardStatus: the planner's next-action meal reads as current", () => {
  const status = deriveMealCardStatus({ taskState: "recommended-now", isNextAction: true, scheduleEntry: undefined, now: new Date() });
  assert.equal(status, "current");
});

check("deriveMealCardStatus: a long-past unresolved recommendation reads as missed", () => {
  const now = new Date("2026-01-01T18:00:00.000Z");
  const entry = {
    period: "lunch" as const,
    role: "normal" as const,
    category: "medium" as const,
    recommendedAtIso: "2026-01-01T12:00:00.000Z",
    timeLabel: "Recommended around 12:00 PM",
    isLocked: false,
  };
  const status = deriveMealCardStatus({ taskState: "recommended-now", isNextAction: false, scheduleEntry: entry, now });
  assert.equal(status, "missed");
});

check("deriveMealCardStatus: a recent recommendation stays upcoming, not missed", () => {
  const now = new Date("2026-01-01T12:30:00.000Z");
  const entry = {
    period: "lunch" as const,
    role: "normal" as const,
    category: "medium" as const,
    recommendedAtIso: "2026-01-01T12:00:00.000Z",
    timeLabel: "Recommended around 12:00 PM",
    isLocked: false,
  };
  const status = deriveMealCardStatus({ taskState: "upcoming", isNextAction: false, scheduleEntry: entry, now });
  assert.equal(status, "upcoming");
});

check("nextRelevantMealPeriod falls back to the earliest pending meal when the global next action isn't a meal at all", () => {
  let state = createInitialState();
  // Log breakfast via photo so it's resolved, but morning weight/training
  // time are both still open — the planner's global nextAction will be
  // "morning-weight" (or the training-time prompt), never a meal. Meal-card
  // emphasis (and the photo estimator's suggested period) must still fall
  // back to the next real open meal — the same one the status line names.
  const items = sampleItems();
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "breakfast", items, macros: sumMealEstimateItems(items), confidence: "high" });

  const { result } = plan(state, new Date());
  assert.notEqual(result.nextAction?.kind, "meal", "expected the global next action to be a non-meal task in this scenario");

  const nextMeal = nextRelevantMealPeriod(state, result);
  assert.equal(nextMeal, "postWorkout", "expected the earliest still-pending meal after breakfast");
});

// ---------------------------------------------------------------------------
// Intelligent daily status line
// ---------------------------------------------------------------------------

check("deriveNutritionStatusLine: nothing logged yet", () => {
  const state = createInitialState();
  const { result } = plan(state, new Date());
  const line = deriveNutritionStatusLine({
    state,
    dailyPlan: result,
    totals: computeNutritionTotals(state.meals),
    targets: NUTRITION_TARGETS,
    now: new Date(),
  });
  assert.ok(line.toLowerCase().includes("nothing logged"), `expected a "nothing logged" line, got: ${line}`);
});

check("deriveNutritionStatusLine: fully resolved day reads as complete", () => {
  let state = createInitialState();
  // The optional snack recommendation is itself state-dependent (see
  // lib/planning/planner.ts's evaluateSnackRecommendation) — resolving the
  // core meals can make it newly appear. Run to a fixed point rather than
  // assuming one fixed period list, so this stays correct regardless of
  // that recommendation's own decision.
  for (let i = 0; i < 3; i++) {
    const periodsNow = Object.keys(plan(state, new Date()).result.mealSchedule.entries) as (typeof MEAL_ORDER)[number][];
    const stillUnresolved = periodsNow.filter((p) => !state.meals[p]);
    if (stillUnresolved.length === 0) break;
    for (const period of stillUnresolved) {
      state = reducer(state, { type: "SKIP_MEAL", period, reason: "forgot" });
    }
  }
  const { result } = plan(state, new Date());
  const line = deriveNutritionStatusLine({
    state,
    dailyPlan: result,
    totals: computeNutritionTotals(state.meals),
    targets: NUTRITION_TARGETS,
    now: new Date(),
  });
  assert.ok(line.toLowerCase().includes("accounted for"), `expected an "accounted for" line, got: ${line}`);
});

// ---------------------------------------------------------------------------
// Local demo vision estimator — deterministic, isolated from any real
// backend, but must exercise every documented outcome branch.
// ---------------------------------------------------------------------------

await checkAsync("localDemoMealVisionEstimator: same file always returns the same outcome", async () => {
  const file = new File(["a".repeat(4096)], "meal.jpg", { type: "image/jpeg", lastModified: 1700000000000 });
  const first = await localDemoMealVisionEstimator.estimate(file);
  const second = await localDemoMealVisionEstimator.estimate(file);
  assert.deepEqual(first.status, second.status);
  assert.deepEqual(
    first.items.map((i) => i.name),
    second.items.map((i) => i.name)
  );
});

await checkAsync("localDemoMealVisionEstimator: a returned 'ok'/'low-confidence' result always has real items with macros", async () => {
  const file = new File(["b".repeat(9000)], "meal2.jpg", { type: "image/jpeg", lastModified: 1650000000000 });
  const result = await localDemoMealVisionEstimator.estimate(file);
  if (result.status === "unrecognized") {
    assert.equal(result.items.length, 0);
  } else {
    assert.ok(result.items.length > 0, "expected at least one estimated item");
    for (const item of result.items) {
      assert.ok(item.name.length > 0);
      assert.ok(item.macros.calories >= 0);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
