// Gate U3A — the nutrition plan contract: every supported coach method is represented, validated and displayed
// faithfully, with no invented targets, and every existing four-number plan keeps working unchanged.

import assert from "node:assert/strict";
import { validateAssignedNutritionPlanContent } from "../production/validation.ts";
import { resolveDisplayTargets, summarizeNutritionPlan, targetText, NO_TARGET_LABEL } from "./plan-display.ts";
import { toAssignedNutritionPlanDraft } from "../synthesis/reasoner/nutrition/to-plan.ts";
import { runNutritionReasoner } from "../synthesis/reasoner/nutrition/reasoner.ts";
import { fakeModel, NOW, nutritionCoach, scenarioInput, scriptedNutrition } from "../synthesis/reasoner/nutrition/eval/fixtures.ts";
import type { NutritionPlan } from "../synthesis/reasoner/nutrition/contract.ts";
import type { AssignedNutritionPlan, NutritionPlanMethod } from "../types.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

const base = { id: "n-1", usesTrainingRestSplit: false, mealsPerDay: 4, mealStructureDescription: "", preTrainingGuidance: "", postTrainingGuidance: "", hydrationOzPerDay: 0, fiberGramsPerDay: 0, substitutionGuidance: "", supplementGuidance: "", adherenceStrategy: "", metricsToMonitor: [], weeklyAdjustmentRule: "", sourceStrategyLabel: "x", approvedAtIso: "" };
const LEGACY = { ...base, targets: { calories: 2400, proteinG: 180, carbsG: 250, fatG: 75 }, approvedAtIso: "2026-10-01T00:00:00.000Z" } as AssignedNutritionPlan;
const method = (over: Partial<NutritionPlanMethod>): NutritionPlanMethod => ({ schema: 1, approach: "calories_protein", energyMode: "target", prescribed: { calories: 2400, proteinG: 180, carbsG: null, fatG: null }, trainingDay: null, restDay: null, ranges: { calories: [2300, 2500], proteinG: [170, 190], carbsG: null, fatG: null }, baseline: null, habits: [], meals: [{ name: "Breakfast", timing: "Within an hour of waking", intent: "Protein-forward start", foods: ["Greek yogurt"] }], substitutions: [], monitoring: { measures: ["weekly_average_weight"], cadence: "Weekly", reviewAfterWeeks: 2 }, adjustments: [], ...over });
const plan = (m: NutritionPlanMethod, targets: AssignedNutritionPlan["targets"] = null) => ({ ...base, targets, method: m }) as AssignedNutritionPlan;
const rejects = (content: unknown, re: RegExp) => assert.throws(() => validateAssignedNutritionPlanContent(content), re);

console.log("\nGate U3A — nutrition plan contract\n");

await check("1. existing four-number plans validate, display and resolve EXACTLY as before (no method field)", () => {
  validateAssignedNutritionPlanContent(LEGACY);
  assert.deepEqual(resolveDisplayTargets({ nutritionTargets: LEGACY.targets, assignedNutritionPlan: LEGACY }), { calories: 2400, proteinG: 180, carbsG: 250, fatG: 75, planAssigned: true });
  assert.deepEqual(summarizeNutritionPlan(LEGACY).targets, ["2,400 kcal", "180 g protein", "250 g carbs", "75 g fat"]);
  rejects({ ...LEGACY, targets: { calories: 2400, proteinG: 180, carbsG: 250 } }, /targets\.fatG/);
});

await check("2. calories and protein (the iCloud coach's method): valid with carbs/fat NOT prescribed; no flat targets; nothing invented", () => {
  const p = plan(method({}));
  validateAssignedNutritionPlanContent(p);
  rejects(plan(method({ prescribed: { calories: 2400, proteinG: 180, carbsG: 250, fatG: null } })), /prescribes no carb or fat targets/);
  rejects(plan(method({ prescribed: { calories: 2400, proteinG: 180, carbsG: 0, fatG: 0 } })), /positive number or null/);
  rejects(plan(method({}), { calories: 2400, proteinG: 180, carbsG: 0, fatG: 0 }), /must be null when the method doesn't prescribe all four/);
  rejects(plan(method({ prescribed: { calories: null, proteinG: 180, carbsG: null, fatG: null } })), /must prescribe calories/);
});

await check("3. full macros through the method: all four prescribed and the flat targets ARE the prescription", () => {
  const four = { calories: 2600, proteinG: 190, carbsG: 290, fatG: 80 };
  validateAssignedNutritionPlanContent(plan(method({ approach: "full_macros", prescribed: four }), four));
  rejects(plan(method({ approach: "full_macros", prescribed: four }), { ...four, carbsG: 300 }), /targets\.carbsG" must equal/);
  rejects(plan(method({ approach: "full_macros", prescribed: { ...four, fatG: null } })), /full-macro plan prescribes calories, protein, carbs and fat/);
});

await check("4. habit-based and portion-based: no numbers at all, energy 'none', guidance required", () => {
  const habit = method({ approach: "habit_based", energyMode: "none", prescribed: { calories: null, proteinG: null, carbsG: null, fatG: null }, ranges: { calories: null, proteinG: null, carbsG: null, fatG: null }, habits: ["Protein at each meal.", "Vegetables at two meals."] });
  validateAssignedNutritionPlanContent(plan(habit));
  rejects(plan({ ...habit, prescribed: { ...habit.prescribed, proteinG: 150 } }), /prescribes no numeric targets/);
  rejects(plan({ ...habit, energyMode: "target" }), /energyMode must be "none"/);
  rejects(plan({ ...habit, habits: [], meals: [] }), /needs its habits or meal guidance/);
  validateAssignedNutritionPlanContent(plan({ ...habit, approach: "portion_guides", habits: [] }));
});

await check("5. baseline first: calories come after the baseline (null now), with the baseline instruction; protein may be set", () => {
  const bl = method({ energyMode: "baseline_first", prescribed: { calories: null, proteinG: 170, carbsG: null, fatG: null }, baseline: { instruction: "log two weeks of normal eating" } });
  validateAssignedNutritionPlanContent(plan(bl));
  rejects(plan({ ...bl, prescribed: { ...bl.prescribed, calories: 2400 } }), /sets calories after the baseline/);
  rejects(plan({ ...bl, baseline: null }), /needs "method\.baseline"/);
});

await check("6. Nutrition Reasoner proposals convert to valid drafts for every method — every number traces to a proposed range, nothing filled in", async () => {
  const coaches: Array<[string, Record<string, unknown>, string]> = [
    ["iCloud coach: calories + protein, meal plan, formula", { n_approach: ["calories_protein", "meal_plan"], n_calorie_method: "formula", n_training_rest: "same_calories_shift_carbs" }, "build_muscle"],
    ["full macros", {}, "build_muscle"],
    ["habit-based", { n_approach: ["habit_based"], n_calorie_method: "no_calorie_targets", n_protein_basis: "no_target", n_protein_amount: undefined }, "health_consistency"],
    ["baseline first", { n_approach: ["calories_protein"], n_calorie_method: "current_intake" }, "build_muscle"],
  ];
  for (const [label, over, goal] of coaches) {
    const r = await runNutritionReasoner({ input: scenarioInput({ coach: nutritionCoach(over), patch: { what_you_want: { primaryGoal: goal } } }), model: fakeModel((ri) => scriptedNutrition(ri as never)), nowIso: NOW, maxAttempts: 1 });
    assert.equal(r.status, "PLANNED", `${label}: ${r.status}`);
    const p = (r as { plan: NutritionPlan }).plan;
    const d = toAssignedNutritionPlanDraft(p);
    assert.ok(d.ok, label);
    if (!d.ok) continue;
    const content = { id: "x", ...d.content, approvedAtIso: "" };
    validateAssignedNutritionPlanContent(content);
    const pr = d.content.method!.prescribed;
    const src = { calories: p.energy.mode === "target" ? p.energy.kcal : null, proteinG: p.protein.grams, carbsG: p.carbohydrate.grams, fatG: p.fat.grams };
    for (const k of ["calories", "proteinG", "carbsG", "fatG"] as const) {
      if (src[k] === null) assert.equal(pr[k], null, `${label}: ${k} invented`);
      else assert.ok(pr[k]! >= src[k]!.min && pr[k]! <= src[k]!.max, `${label}: ${k} outside the proposed range`);
    }
    assert.equal(d.content.method!.approach, p.approach.id);
    assert.equal(d.content.method!.meals.length, p.meals.slots.length, `${label}: MealIntent carried`);
    if (label.startsWith("iCloud")) assert.ok(pr.calories !== null && pr.proteinG !== null && pr.carbsG === null && pr.fatG === null && d.content.targets === null, `${label}: ${JSON.stringify(pr)}`);
  }
});

await check("7. display: only prescribed targets; 'No target' for an unprescribed macro on an assigned plan; 'not assigned' only without a plan", () => {
  const cp = plan(method({}));
  const d = resolveDisplayTargets({ nutritionTargets: null, assignedNutritionPlan: cp });
  assert.deepEqual(d, { calories: 2400, proteinG: 180, carbsG: null, fatG: null, planAssigned: true });
  assert.equal(targetText(d.carbsG, d.planAssigned, "Nutrition not assigned", (n) => `${n}g`), NO_TARGET_LABEL);
  assert.equal(targetText(d.calories, d.planAssigned, "Nutrition not assigned", (n) => `${n} cal`), "2400 cal");
  const none = resolveDisplayTargets({ nutritionTargets: null, assignedNutritionPlan: null });
  assert.equal(targetText(none.calories, none.planAssigned, "Nutrition not assigned", String), "Nutrition not assigned");
  const habit = summarizeNutritionPlan(plan(method({ approach: "habit_based", energyMode: "none", prescribed: { calories: null, proteinG: null, carbsG: null, fatG: null }, habits: ["Protein at each meal."] })));
  assert.deepEqual(habit.targets, []);
  assert.match(habit.note!, /No calorie numbers/);
  const bl = summarizeNutritionPlan(plan(method({ energyMode: "baseline_first", prescribed: { calories: null, proteinG: 170, carbsG: null, fatG: null }, baseline: { instruction: "log two weeks of normal eating" } })));
  assert.equal(bl.note, "Baseline first: Log two weeks of normal eating. Your coach sets calorie targets from that baseline.");
  assert.deepEqual(bl.targets, ["170 g protein"]);
  const s = summarizeNutritionPlan(cp);
  assert.deepEqual(s.targets, ["2,400 kcal", "180 g protein"]);
  assert.equal(s.meals[0].intent, "Protein-forward start");
  assert.equal(s.monitoring, "Weekly average bodyweight · Weekly", "client sees the coach's measure label, never a raw id");
});

await check("8. proposed vs approved vs actual stay distinct: a draft carries no approval stamp; intake is never part of the plan", () => {
  const draft = plan(method({}));
  assert.equal(draft.approvedAtIso, "");
  validateAssignedNutritionPlanContent(draft);
  assert.ok(!("meals" in draft && Array.isArray((draft as unknown as { meals: unknown }).meals)), "logged meals live in daily records, not the plan");
});

console.log("\n  consumers (U3A compatibility)\n");
const { nutritionStatusMessage } = await import("../calculations.ts");
const { createInitialState } = await import("../state.ts");
const { buildDailyRecordFromLiveState } = await import("../history/build-daily-record.ts");
const { deriveCalorieTargetMet, deriveProteinTargetMet } = await import("../history/derive-nutrition.ts");

await check("9. status line: legacy unchanged; calories+protein judged on both; habit plans never judged on calories; no plan → not assigned", () => {
  const meals = createInitialState().meals;
  const t = { calories: 2000, proteinG: 150, carbsG: 0, fatG: 0 };
  const legacyTargets = { calories: 2400, proteinG: 180, carbsG: 250, fatG: 75 };
  assert.equal(nutritionStatusMessage({ ...t }, meals, legacyTargets), nutritionStatusMessage({ ...t }, meals, { calories: 2400, proteinG: 180 }), "same message from the same calories/protein");
  assert.equal(nutritionStatusMessage({ calories: 2400, proteinG: 180, carbsG: 0, fatG: 0 }, meals, { calories: 2400, proteinG: 180 }), "Daily target reached. Nice work staying consistent.");
  assert.match(nutritionStatusMessage({ calories: 1200, proteinG: 50, carbsG: 0, fatG: 0 }, meals, { calories: null, proteinG: null }), /coach's guidance|meal remaining/);
  assert.doesNotMatch(nutritionStatusMessage({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, meals, { calories: null, proteinG: null }), /not assigned|target reached/i);
  assert.match(nutritionStatusMessage({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, meals, null), /not assigned/i);
});

await check("10. daily record + history: a calories-and-protein day snapshots its prescribed targets and is judged on them; legacy days unchanged; habit days 'insufficient data' (no invented target)", () => {
  const st = createInitialState();
  const enrollment = st.programEnrollment;
  const withPlan = (p: AssignedNutritionPlan) => ({ ...st, nutritionTargets: p.targets, assignedNutritionPlan: p });
  const legacyRec = buildDailyRecordFromLiveState(withPlan(LEGACY), enrollment, "live" as never);
  assert.deepEqual(legacyRec.nutrition.targetsSnapshot, LEGACY.targets);
  assert.equal(legacyRec.nutrition.prescribedSnapshot, undefined, "legacy days are byte-identical");
  const cpRec = buildDailyRecordFromLiveState(withPlan(plan(method({}))), enrollment, "live" as never);
  assert.equal(cpRec.nutrition.targetsSnapshot, null);
  assert.deepEqual(cpRec.nutrition.prescribedSnapshot, { calories: 2400, proteinG: 180, carbsG: null, fatG: null });
  const habitRec = buildDailyRecordFromLiveState(withPlan(plan(method({ approach: "habit_based", energyMode: "none", prescribed: { calories: null, proteinG: null, carbsG: null, fatG: null }, habits: ["x"] }))), enrollment, "live" as never);
  // Nothing logged: totals are known zeros. A calories-and-protein day is judged against ITS targets (not met); a
  // habit day has no target to judge (insufficient data) — before U3A both read as "no plan".
  assert.equal(deriveProteinTargetMet(cpRec), "not_met");
  assert.equal(deriveCalorieTargetMet(cpRec), "not_met");
  assert.equal(deriveProteinTargetMet(habitRec), "insufficient_data");
  assert.equal(deriveCalorieTargetMet(habitRec), "insufficient_data");
  assert.equal(deriveProteinTargetMet(legacyRec), "not_met", "legacy judged exactly as before");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
