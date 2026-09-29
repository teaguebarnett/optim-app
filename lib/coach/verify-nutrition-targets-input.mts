// Pure logic tests for lib/coach/nutrition-targets-input.ts — coach-entered
// nutrition targets must be explicit: blank stays missing (never a default,
// never 0), and malformed/out-of-range values are rejected before anything
// is saved. No DB, no network, no browser.
// Run with: npm run verify:nutrition-targets-input

import assert from "node:assert/strict";
import { parseNutritionTargetsInput, validateNutritionTargets } from "./nutrition-targets-input.ts";

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

const FULL = { calories: "2400", proteinG: "180", carbsG: "250", fatG: "75" };

console.log("parseNutritionTargetsInput");
check("explicit values parse exactly as entered", () => {
  const r = parseNutritionTargetsInput(FULL);
  assert.deepEqual(r, { ok: true, targets: { calories: 2400, proteinG: 180, carbsG: 250, fatG: 75 } });
});
check("surrounding whitespace is tolerated", () => {
  const r = parseNutritionTargetsInput({ ...FULL, calories: " 2400 " });
  assert.equal(r.ok && r.targets.calories, 2400);
});
check("an all-blank form is rejected, never defaulted", () => {
  const r = parseNutritionTargetsInput({ calories: "", proteinG: "", carbsG: "", fatG: "" });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /Calories, Protein, Carbs, Fat/);
  assert.match(!r.ok ? r.message : "", /nothing was saved/);
});
check("absent fields (null from FormData.get) are missing", () => {
  const r = parseNutritionTargetsInput({ calories: null, proteinG: null, carbsG: null, fatG: null });
  assert.equal(r.ok, false);
});
check("one blank field is missing, not 0", () => {
  const r = parseNutritionTargetsInput({ ...FULL, fatG: "" });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /Enter Fat/);
});
check("whitespace-only is missing", () => assert.equal(parseNutritionTargetsInput({ ...FULL, proteinG: "   " }).ok, false));
check("non-numeric is rejected", () => assert.equal(parseNutritionTargetsInput({ ...FULL, carbsG: "abc" }).ok, false));
check("decimals are rejected", () => assert.equal(parseNutritionTargetsInput({ ...FULL, calories: "2200.5" }).ok, false));
check("negative macros are rejected", () => assert.equal(parseNutritionTargetsInput({ ...FULL, fatG: "-5" }).ok, false));
check("implausibly low calories are rejected", () => assert.equal(parseNutritionTargetsInput({ ...FULL, calories: "0" }).ok, false));
check("implausibly high calories are rejected", () => assert.equal(parseNutritionTargetsInput({ ...FULL, calories: "20000" }).ok, false));
check("0g of a macro is an explicit, allowed value", () => {
  const r = parseNutritionTargetsInput({ ...FULL, carbsG: "0" });
  assert.equal(r.ok && r.targets.carbsG, 0);
});
check("Infinity is rejected", () => assert.equal(parseNutritionTargetsInput({ ...FULL, calories: "Infinity" }).ok, false));

console.log("validateNutritionTargets (server backstop)");
check("valid numbers pass through unchanged", () => {
  assert.deepEqual(validateNutritionTargets({ calories: 2400, proteinG: 180, carbsG: 250, fatG: 75 }), {
    ok: true,
    targets: { calories: 2400, proteinG: 180, carbsG: 250, fatG: 75 },
  });
});
check("NaN (the old Number(\"x\") path) is rejected", () => assert.equal(validateNutritionTargets({ calories: NaN, proteinG: 180, carbsG: 250, fatG: 75 }).ok, false));
check("undefined is missing", () => assert.equal(validateNutritionTargets({ calories: 2400, proteinG: undefined, carbsG: 250, fatG: 75 }).ok, false));
check("numeric strings are not accepted as numbers", () => assert.equal(validateNutritionTargets({ calories: "2400", proteinG: 180, carbsG: 250, fatG: 75 }).ok, false));
check("the old blank-as-0 calories is rejected", () => assert.equal(validateNutritionTargets({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }).ok, false));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
