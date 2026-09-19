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
  mealIntentFor,
  mealProvenanceLabel,
  nextRelevantMealPeriod,
  remainingCalorieCaption,
  sumMealEstimateItems,
} from "./view-model.ts";
import { isUncertainMealSelection, localDemoMealVisionEstimator, resolvePhotoEstimateDisposition } from "./vision-estimator.ts";
import {
  BOUNDED_SUBSTITUTION_RULES,
  describeSubstitutionLog,
  findBoundedSubstitution,
  isValidationEligible,
  resolveSubstitutionDisposition,
} from "./substitution.ts";
import { defaultCoachAiAuthoritySettings } from "../coach/ai-authority.ts";
import { buildDailyRecordFromLiveState } from "../history/build-daily-record.ts";
import { MEAL_OPTIONS, NUTRITION_TARGETS } from "../mock-data.ts";
import type { AppState } from "../state.ts";
import type { BoundedSubstitutionRule } from "./substitution.ts";
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

// ---------------------------------------------------------------------------
// Gate 3A — Meal Intent
// ---------------------------------------------------------------------------

console.log("\nGate 3A.1 — Meal Intent stays attached to its planned recommendation, never confused with actual intake\n");

check("Selecting a coach-approved option snapshots its MealIntent (description) onto the log", () => {
  const option = MEAL_OPTIONS.breakfast[0];
  const state = reducer(createInitialState(), { type: "SELECT_MEAL_OPTION", period: "breakfast", optionId: option.id });
  assert.equal(mealIntentFor(state.meals.breakfast), option.description);
  assert.ok(mealIntentFor(state.meals.breakfast)!.length > 0, "the catalog fixture must have a real, non-empty intent");
});

check("MealIntent survives independently of the catalog — it is a snapshot, not a live optionId lookup", () => {
  const option = MEAL_OPTIONS.lunch[0];
  let state = reducer(createInitialState(), { type: "SELECT_MEAL_OPTION", period: "lunch", optionId: option.id });
  const capturedIntent = mealIntentFor(state.meals.lunch);
  // Changing training time (an unrelated action) must never touch a
  // meal already logged — the same invariant lib/planning/verify-planner.mts
  // already proves for macros/timestamps, now proven for mealIntent too.
  state = reducer(state, { type: "SET_TRAINING_TIME", time24: "18:00" });
  assert.equal(mealIntentFor(state.meals.lunch), capturedIntent);
});

check("MealIntent is never fabricated for a manual entry, photo estimate, skip, or plan-for-later — it describes WHY a planned meal exists, never what was actually eaten", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_MANUAL_MEAL", period: "breakfast", manualName: "Leftover pizza", macros: { calories: 600, proteinG: 25, carbsG: 60, fatG: 25 } });
  assert.equal(mealIntentFor(state.meals.breakfast), null);

  const items = [{ id: nextId("estimate-item"), name: "Chicken", quantityLabel: "6 oz", macros: { calories: 280, proteinG: 52, carbsG: 0, fatG: 6 } }];
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "lunch", items, macros: sumMealEstimateItems(items), confidence: "high" });
  assert.equal(mealIntentFor(state.meals.lunch), null);

  state = reducer(state, { type: "SKIP_MEAL", period: "dinner", reason: "forgot" });
  assert.equal(mealIntentFor(state.meals.dinner), null);

  state = reducer(state, { type: "PLAN_MEAL_LATER", period: "snack" });
  assert.equal(mealIntentFor(state.meals.snack), null);
});

check("MealIntent is distinct from what was actually eaten — the manual meal's real macros never leak into (or get overwritten by) the intent field", () => {
  const option = MEAL_OPTIONS.dinner[0];
  const state = reducer(createInitialState(), { type: "SELECT_MEAL_OPTION", period: "dinner", optionId: option.id });
  assert.deepEqual(state.meals.dinner?.macros, option.macros, "actual logged macros must still be the real option macros");
  assert.equal(mealIntentFor(state.meals.dinner), option.description, "intent is the WHY, kept separate from the WHAT");
  assert.notEqual(mealIntentFor(state.meals.dinner), JSON.stringify(state.meals.dinner?.macros), "sanity: intent is real text, never a serialized macro dump");
});

// ---------------------------------------------------------------------------
// Gate 3A — Bounded substitution rules
// ---------------------------------------------------------------------------

console.log("\nGate 3A.2 — Bounded substitution rules are validated decisions, never arbitrary suggestions\n");

function authoritySettingsAtLevel(level: "advisor" | "copilot" | "ai_led" | "review_only") {
  const base = defaultCoachAiAuthoritySettings("coach-test", "workspace-test", "2026-01-01T00:00:00.000Z");
  return { ...base, global: { level, domainOverrides: {} } };
}

check("A registered, validated substitution rule is found only for its exact declared from/to pair", () => {
  const found = findBoundedSubstitution("chicken breast", "turkey breast");
  assert.ok(found);
  assert.equal(found!.validation, "validated");
  assert.equal(found!.id, "sub-chicken-turkey");
  assert.equal(findBoundedSubstitution("Chicken Breast", "Turkey Breast")?.id, found!.id, "lookup must be case/whitespace tolerant, never a second silently-different match");
});

check("An unregistered substitution pair resolves to null — an honest 'unresolved,' never a fabricated rule", () => {
  assert.equal(findBoundedSubstitution("chicken breast", "candy bar"), null);
  assert.equal(findBoundedSubstitution("rice", "chicken breast"), null);
});

check("Every seeded BoundedSubstitutionRule declares every field the contract requires — no partial/ambiguous rules", () => {
  for (const rule of BOUNDED_SUBSTITUTION_RULES) {
    assert.ok(rule.fromLabel.length > 0);
    assert.ok(rule.toLabel.length > 0);
    assert.ok(rule.constraint.length > 0, "the permitted boundary/constraint must be stated, never implied");
    assert.ok(rule.rationale.length > 0, "why the substitution is acceptable must be stated");
    assert.ok(["high", "medium", "low"].includes(rule.confidence));
    assert.ok(["coach", "optim_bounded"].includes(rule.authority));
    assert.ok(isValidationEligible(rule.validation) === (rule.validation === "validated"));
  }
});

check("A valid, high-confidence bounded rule under a permissive authority resolves to auto_execute — accepted within its declared constraint, not beyond it", () => {
  const rule = findBoundedSubstitution("chicken breast", "turkey breast")!;
  const disposition = resolveSubstitutionDisposition(rule, authoritySettingsAtLevel("review_only"), "client-test");
  assert.equal(disposition, "auto_execute");
});

check("A missing (unknown) substitution never becomes an automatic recommendation, regardless of how permissive authority is", () => {
  const disposition = resolveSubstitutionDisposition(null, authoritySettingsAtLevel("review_only"), "client-test");
  assert.equal(disposition, "escalate");
});

check("An unvalidated candidate rule never becomes an automatic recommendation, even under the most permissive authority", () => {
  const unvalidated: BoundedSubstitutionRule = {
    id: "sub-test-unvalidated",
    period: null,
    fromLabel: "rice",
    toLabel: "quinoa",
    constraint: "Match cooked volume.",
    rationale: "Both are starchy carb sources.",
    confidence: "medium",
    authority: "optim_bounded",
    validation: "unvalidated",
  };
  assert.equal(resolveSubstitutionDisposition(unvalidated, authoritySettingsAtLevel("review_only"), "client-test"), "escalate");
});

check("A validated but low-confidence rule never becomes an automatic recommendation, even under the most permissive authority", () => {
  const lowConfidence: BoundedSubstitutionRule = {
    id: "sub-test-low-confidence",
    period: null,
    fromLabel: "beef",
    toLabel: "tofu",
    constraint: "Match protein grams as closely as possible.",
    rationale: "Both can serve as a meal's primary protein source.",
    confidence: "low",
    authority: "optim_bounded",
    validation: "validated",
  };
  assert.equal(resolveSubstitutionDisposition(lowConfidence, authoritySettingsAtLevel("review_only"), "client-test"), "escalate");
});

check("isValidationEligible exhaustively handles every declared SubstitutionValidationStatus — validated is the only eligible one", () => {
  assert.equal(isValidationEligible("validated"), true);
  assert.equal(isValidationEligible("unvalidated"), false);
  assert.equal(isValidationEligible("insufficient_confidence"), false);
});

// ---------------------------------------------------------------------------
// Gate 3A — Photo estimates remain uncertain evidence
// ---------------------------------------------------------------------------

console.log("\nGate 3A.3 — Photo estimates remain uncertain evidence, never a confirmed-exact record\n");

check("A confirmed photo-estimate meal is marked uncertain; a coach-approved option is not", () => {
  let state = createInitialState();
  const items = sampleItems();
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "lunch", items, macros: sumMealEstimateItems(items), confidence: "medium" });
  assert.equal(isUncertainMealSelection(state.meals.lunch), true);

  const option = MEAL_OPTIONS.dinner[0];
  state = reducer(state, { type: "SELECT_MEAL_OPTION", period: "dinner", optionId: option.id });
  assert.equal(isUncertainMealSelection(state.meals.dinner), false, "a coach-approved option is a known value, never marked as an estimate");
});

check("A manual entry (isEstimate: true) is also marked uncertain — estimated values must never silently present as exact", () => {
  const state = reducer(createInitialState(), {
    type: "SET_MANUAL_MEAL",
    period: "breakfast",
    manualName: "Homemade stir fry",
    macros: { calories: 500, proteinG: 30, carbsG: 40, fatG: 20 },
  });
  assert.equal(state.meals.breakfast?.isEstimate, true);
  assert.equal(isUncertainMealSelection(state.meals.breakfast), true);
});

check("A photo confirmation with no real, named items is refused at the reducer — missing evidence stays unknown, it never becomes a zero-calorie logged meal", () => {
  const state = reducer(createInitialState(), {
    type: "LOG_PHOTO_MEAL",
    period: "lunch",
    items: [],
    macros: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    confidence: "low",
  });
  assert.equal(state.meals.lunch, undefined, "must remain genuinely unlogged, not a zero-value MealSelection");
});

check("An unrecognized photo result always escalates regardless of authority — there is no real estimate behind it to act on", () => {
  assert.equal(resolvePhotoEstimateDisposition("unrecognized", "low", authoritySettingsAtLevel("review_only"), "client-test"), "escalate");
});

check("A low-confidence photo estimate never becomes an automatic recommendation, even under the most permissive authority", () => {
  assert.equal(resolvePhotoEstimateDisposition("low-confidence", "low", authoritySettingsAtLevel("review_only"), "client-test"), "escalate");
});

// ---------------------------------------------------------------------------
// Gate 3A — Authority: automatic vs draft vs escalation
// ---------------------------------------------------------------------------

console.log("\nGate 3A.4 — Automatic response requires both sufficient confidence AND explicit permission; draft and escalation stay distinct\n");

check("High confidence alone is not enough — advisor-level authority never auto-executes a substitution, it only suggests", () => {
  const rule = findBoundedSubstitution("chicken breast", "turkey breast")!;
  const disposition = resolveSubstitutionDisposition(rule, authoritySettingsAtLevel("advisor"), "client-test");
  assert.equal(disposition, "suggest");
  assert.notEqual(disposition, "auto_execute");
});

check("Permission alone is not enough — even the most permissive authority never auto-executes a low-confidence photo estimate", () => {
  assert.equal(resolvePhotoEstimateDisposition("low-confidence", "low", authoritySettingsAtLevel("review_only"), "client-test"), "escalate");
});

check("Both sufficient confidence and permissive authority together are what actually produce auto_execute", () => {
  assert.equal(resolvePhotoEstimateDisposition("ok", "high", authoritySettingsAtLevel("review_only"), "client-test"), "auto_execute");
});

check("Draft-for-approval and escalation are distinct outcomes, never conflated under copilot authority", () => {
  const validRule = findBoundedSubstitution("chicken breast", "turkey breast")!;
  const draftOutcome = resolveSubstitutionDisposition(validRule, authoritySettingsAtLevel("copilot"), "client-test");
  const escalateOutcome = resolveSubstitutionDisposition(null, authoritySettingsAtLevel("copilot"), "client-test");
  assert.equal(draftOutcome, "draft");
  assert.equal(escalateOutcome, "escalate");
  assert.notEqual(draftOutcome, escalateOutcome);
});

// ---------------------------------------------------------------------------
// Gate 3A — Attribution and planned-vs-actual survive downstream transformations
// ---------------------------------------------------------------------------

console.log("\nGate 3A.5 — Attribution and planned-vs-actual semantics survive archival, and existing nutrition behavior stays compatible\n");

check("MealIntent, provenance, and estimate status all survive the existing daily-record archival snapshot unchanged", () => {
  const option = MEAL_OPTIONS.breakfast[0];
  let state = reducer(createInitialState(), { type: "SELECT_MEAL_OPTION", period: "breakfast", optionId: option.id });
  const items = sampleItems();
  state = reducer(state, { type: "LOG_PHOTO_MEAL", period: "lunch", items, macros: sumMealEstimateItems(items), confidence: "medium" });

  const record = buildDailyRecordFromLiveState(state, state.programEnrollment, "live");

  assert.equal(record.nutrition.meals.breakfast?.mealIntent, option.description, "MealIntent must survive archival exactly as logged");
  assert.equal(mealProvenanceLabel(record.nutrition.meals.breakfast), "Coach-approved option");
  assert.equal(mealProvenanceLabel(record.nutrition.meals.lunch), "OPTIM photo estimate");
  assert.equal(isUncertainMealSelection(record.nutrition.meals.lunch), true, "the archived record must still read as uncertain evidence, never silently promoted to exact");
});

check("Existing nutrition totals/provenance behavior is unchanged by the Gate 3A additions", () => {
  const option = MEAL_OPTIONS.snack[0];
  const state = reducer(createInitialState(), { type: "SELECT_MEAL_OPTION", period: "snack", optionId: option.id });
  const totals = computeNutritionTotals(state.meals);
  assert.equal(totals.calories, option.macros.calories, "totals math is unaffected by carrying mealIntent alongside macros");
  assert.equal(mealDisplayName("snack", state.meals.snack), option.name);
});

// ---------------------------------------------------------------------------
// Gate 3B — Client Nutrition Loop: accepted substitutions log honestly, and
// the planned meal is never overwritten or fabricated in the process.
// ---------------------------------------------------------------------------

console.log("\nGate 3B.1 — An accepted bounded substitution logs the original meal's real macros, never a fabricated number for the swapped food\n");

check("describeSubstitutionLog carries the original planned meal's exact macros, never invents new ones for the substituted food", () => {
  const rule = findBoundedSubstitution("chicken breast", "turkey breast")!;
  const originalMacros = { calories: 480, proteinG: 52, carbsG: 45, fatG: 8 };
  const logged = describeSubstitutionLog(rule, originalMacros);
  assert.deepEqual(logged.macros, originalMacros, "macros must be the original meal's real values, not a guess for the substituted food");
  assert.match(logged.manualName, /turkey breast/);
  assert.match(logged.manualName, /chicken breast/);
  assert.match(logged.mealIntent, /keep the meal's protein and total calories/i);
});

check("SET_MANUAL_MEAL preserves an accepted substitution's mealIntent onto the actual logged record, distinct from a true free-text manual entry", () => {
  const rule = findBoundedSubstitution("chicken breast", "turkey breast")!;
  const logged = describeSubstitutionLog(rule, { calories: 480, proteinG: 52, carbsG: 45, fatG: 8 });

  const substitutionState = reducer(createInitialState(), {
    type: "SET_MANUAL_MEAL",
    period: "dinner",
    manualName: logged.manualName,
    macros: logged.macros,
    mealIntent: logged.mealIntent,
  });
  assert.equal(substitutionState.meals.dinner?.mealIntent, logged.mealIntent);
  assert.equal(mealProvenanceLabel(substitutionState.meals.dinner), "Accepted substitution");

  const freeTextState = reducer(createInitialState(), {
    type: "SET_MANUAL_MEAL",
    period: "dinner",
    manualName: "A sandwich I made at home",
    macros: { calories: 400, proteinG: 20, carbsG: 40, fatG: 12 },
  });
  assert.equal(freeTextState.meals.dinner?.mealIntent, undefined, "a true free-text manual entry has no MealIntent to preserve");
  assert.equal(mealProvenanceLabel(freeTextState.meals.dinner), "Your manual entry");
});

check("An accepted substitution never mutates the original catalog option's own description", () => {
  const option = MEAL_OPTIONS.dinner.find((o) => o.mainIngredients.some((i) => i.toLowerCase().includes("chicken")));
  assert.ok(option, "fixture must contain a chicken-based dinner option for this swap to be demo-reachable");
  const originalDescription = option!.description;
  const rule = findBoundedSubstitution("chicken breast", "turkey breast")!;
  describeSubstitutionLog(rule, option!.macros);
  assert.equal(option!.description, originalDescription, "reading a rule to build a log must never touch the planned catalog it was measured against");
});

console.log("\nGate 3B.2 — Unlogged stays honestly unknown\n");

check("A meal period with no selection at all reports no provenance, no MealIntent, and is never treated as uncertain evidence (there is no evidence yet)", () => {
  const state = createInitialState();
  assert.equal(mealProvenanceLabel(state.meals.lunch), null);
  assert.equal(mealIntentFor(state.meals.lunch), null);
  assert.equal(isUncertainMealSelection(state.meals.lunch), false);
});

console.log("\nGate 3B correction pass — a partial manual entry preserves which fields were never entered, distinct from a real zero\n");

check("SET_MANUAL_MEAL threads unknownMacroFields onto the live selection unchanged; omitting it (a fully-entered entry) leaves it absent", () => {
  const partial = reducer(createInitialState(), {
    type: "SET_MANUAL_MEAL",
    period: "breakfast",
    manualName: "Turkey sandwich",
    macros: { calories: 450, proteinG: 0, carbsG: 0, fatG: 0 },
    unknownMacroFields: ["proteinG", "carbsG", "fatG"],
  });
  assert.deepEqual(partial.meals.breakfast?.unknownMacroFields, ["proteinG", "carbsG", "fatG"]);
  assert.equal(partial.meals.breakfast?.macros?.calories, 450, "the known field's real value must still be stored and summable");

  const full = reducer(createInitialState(), {
    type: "SET_MANUAL_MEAL",
    period: "breakfast",
    manualName: "Turkey sandwich",
    macros: { calories: 450, proteinG: 30, carbsG: 40, fatG: 10 },
  });
  assert.equal(full.meals.breakfast?.unknownMacroFields, undefined, "a fully-entered manual entry has nothing to mark unknown");
});

console.log("\nGate 3C — a coach's own Meal Intent override, once authored, is what SELECT_MEAL_OPTION actually snapshots\n");

check("SELECT_MEAL_OPTION uses the coach's coachMealPlan override for that period instead of the catalog option's own description, when one exists", () => {
  const option = MEAL_OPTIONS.breakfast[0];
  const base = createInitialState();
  const withOverride = {
    ...base,
    coachMealPlan: {
      ...base.coachMealPlan,
      breakfast: {
        mealIntentOverride: "Coach's own note: keep this light before your 7am session.",
        updatedAtIso: "2026-01-01T00:00:00.000Z",
        updatedByCoachId: "coach-test",
        updatedByCoachName: "Teague",
      },
    },
  };
  const state = reducer(withOverride, { type: "SELECT_MEAL_OPTION", period: "breakfast", optionId: option.id });
  assert.equal(state.meals.breakfast?.mealIntent, "Coach's own note: keep this light before your 7am session.");
  assert.notEqual(state.meals.breakfast?.mealIntent, option.description, "once a coach has authored an override, the stock catalog description must never win");
});

check("a period the coach has never touched still snapshots the catalog option's own description unchanged — Gate 3B's original behavior", () => {
  const option = MEAL_OPTIONS.lunch[0];
  const state = reducer(createInitialState(), { type: "SELECT_MEAL_OPTION", period: "lunch", optionId: option.id });
  assert.equal(state.meals.lunch?.mealIntent, option.description);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
