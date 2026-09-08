// Phase 5.6A.1 — verifies the plan review decision workspace's pure
// presentation helpers: meaningful direction/strategy naming (spec Part 2's
// "'Best fit' cannot also be the strategy's only name") and detecting which
// nutrition assumptions are material enough to require coach acknowledgment
// before approval.

import assert from "node:assert/strict";
import { meaningfulTrainingDirectionName, meaningfulNutritionStrategyName, materialNutritionAssumptions, RANK_LABEL } from "./plan-presentation.ts";

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

check("meaningfulTrainingDirectionName derives a real name from split + frequency, never the ranking label", () => {
  assert.equal(meaningfulTrainingDirectionName({ splitName: "Upper / lower", frequencyPerWeek: 5 }), "Upper / lower — 5-Day Split");
  assert.notEqual(meaningfulTrainingDirectionName({ splitName: "Full body", frequencyPerWeek: 3 }), RANK_LABEL.best_fit);
});

check("meaningfulNutritionStrategyName: training/rest split targets always name the carb-cycling structure", () => {
  const name = meaningfulNutritionStrategyName({ trainingDayTargets: { calories: 2600, proteinG: 180, carbsG: 300, fatG: 70 }, mealStructureDescription: "Training-day / rest-day carb cycling." });
  assert.equal(name, "Training/Rest-Day Carb Cycling");
});

check("meaningfulNutritionStrategyName: a structured meal plan and a flexible framework get distinct real names", () => {
  assert.equal(meaningfulNutritionStrategyName({ mealStructureDescription: "A structured daily meal plan hitting these targets." }), "Structured Meal Framework");
  assert.equal(meaningfulNutritionStrategyName({ mealStructureDescription: "A flexible framework — hit these daily targets however fits the client's life." }), "Flexible Macro Targets");
});

check("materialNutritionAssumptions surfaces the averaged-sex and safety-floor-clamp assumptions, not routine methodology notes", () => {
  const assumptions = [
    "Estimated using the Mifflin-St Jeor formula from reported age/height/weight (sex not specified — averaged the male/female formula).",
    "Activity level estimated from 3 available training days/week — no separate daily-activity data was provided.",
    "Calculated deficit was clamped to a safe 1200-calorie floor.",
  ];
  const material = materialNutritionAssumptions(assumptions);
  assert.equal(material.length, 2);
  assert.ok(material.some((a) => a.includes("sex not specified")));
  assert.ok(material.some((a) => a.includes("clamped")));
});

check("materialNutritionAssumptions returns nothing when every assumption is routine methodology, not missing data", () => {
  const assumptions = ["Estimated using the Mifflin-St Jeor formula from reported age/height/weight.", "Activity level estimated from 5 available training days/week — no separate daily-activity data was provided."];
  assert.deepEqual(materialNutritionAssumptions(assumptions), []);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
