// Nutrition Reasoner — mapping a proposal onto the production nutrition contract (AssignedNutritionPlan, the content of
// a draft nutrition_plan_versions row). Pure; nothing is written. Proposed ≠ approved: the result carries no approval
// time and no id — the coach review/publish path supplies both.
//
// Gate U3A: every approach the coach can use is represented through `method` (NutritionPlanMethod) — only the targets
// the strategy actually prescribes (single numbers = the midpoint of each proposed range, the existing convention; the
// ranges are kept as provenance), with carbs/fat/calories left null when the method doesn't set them. The flat
// `targets` set exists only when all four are prescribed (so every existing four-number consumer keeps working).
// Fields the legacy contract stores as numbers but the strategy expresses in words (hydration, fiber) stay 0 = "not
// set", the convention production already uses (createPublishAndAssignNutritionAction).

import { NUMERIC_NUTRITION_APPROACHES, type AssignedNutritionPlan, type NutritionPlanApproach, type NutritionPlanMethod, type PrescribedNutritionTargets } from "../../../types.ts";
import { food } from "../../knowledge/nutrition/foods.ts";
import { adjustmentSummary } from "./validate.ts";
import type { Grams, NutritionPlan } from "./contract.ts";

const mid = (r: { min: number; max: number }) => Math.round((r.min + r.max) / 2);
const midOr = (r: Grams | null) => (r ? mid(r) : null);
const range = (r: Grams | null): [number, number] | null => (r ? [r.min, r.max] : null);

export type DraftNutritionContent = Omit<AssignedNutritionPlan, "id" | "approvedAtIso">;

export function toAssignedNutritionPlanDraft(plan: NutritionPlan): { ok: true; content: DraftNutritionContent } | { ok: false; reason: string } {
  const name = (id: string) => food(id)?.name ?? id;
  const target = plan.energy.mode === "target";
  // Only what the coach's approach prescribes (the persisted nutrition-plan contract, Gate U3A): a
  // non-numeric approach prescribes no numbers; calories-and-protein prescribes calories (in "target" mode) and
  // protein — carb and fat grams the strategy reasons about stay guidance, never targets; full macros / meal plan
  // prescribe what the strategy gives.
  const approach = plan.approach.id as NutritionPlanApproach;
  const numeric = NUMERIC_NUTRITION_APPROACHES.has(approach);
  const carbFat = numeric && approach !== "calories_protein";
  const prescribed: PrescribedNutritionTargets = { calories: numeric && target ? midOr(plan.energy.kcal) : null, proteinG: numeric ? midOr(plan.protein.grams) : null, carbsG: carbFat ? midOr(plan.carbohydrate.grams) : null, fatG: carbFat ? midOr(plan.fat.grams) : null };
  const all = prescribed.calories !== null && prescribed.proteinG !== null && prescribed.carbsG !== null && prescribed.fatG !== null;
  const dv = plan.dayVariation;
  const split = target && !!dv && dv.strategy !== "identical_every_day" && !!dv.trainingDayKcal && !!dv.restDayKcal;
  const day = (kcal: Grams | null): PrescribedNutritionTargets => ({ ...prescribed, calories: midOr(kcal) });
  const method: NutritionPlanMethod = {
    schema: 1,
    approach: plan.approach.id,
    energyMode: plan.energy.mode,
    prescribed,
    trainingDay: split ? day(dv!.trainingDayKcal) : null,
    restDay: split ? day(dv!.restDayKcal) : null,
    ranges: { calories: numeric && target ? range(plan.energy.kcal) : null, proteinG: numeric ? range(plan.protein.grams) : null, carbsG: carbFat ? range(plan.carbohydrate.grams) : null, fatG: carbFat ? range(plan.fat.grams) : null },
    baseline: plan.energy.mode === "baseline_first" ? { instruction: plan.energy.rationale } : null,
    habits: plan.habits,
    meals: plan.meals.slots.map((s) => ({ name: s.name, timing: s.timing, intent: s.intent, foods: s.foods.map(name) })),
    substitutions: plan.foods.substitutions.map((s) => ({ for: name(s.for), use: s.use.map(name), why: s.why })),
    monitoring: { measures: plan.monitoring.measures, cadence: plan.monitoring.cadence, reviewAfterWeeks: plan.monitoring.reviewAfterWeeks },
    adjustments: plan.adjustments.map((a) => ({ signal: a.signal, afterWeeks: a.afterWeeks, change: adjustmentSummary(a, plan.energy.kcal) })),
  };
  const full = (t: PrescribedNutritionTargets) => ({ calories: t.calories!, proteinG: t.proteinG!, carbsG: t.carbsG!, fatG: t.fatG! });
  return {
    ok: true,
    content: {
      targets: all ? full(prescribed) : null,
      method,
      // The legacy split flags/targets are set only when they can be complete four-number sets.
      usesTrainingRestSplit: split && all,
      ...(split && all ? { trainingDayTargets: full(method.trainingDay!), restDayTargets: full(method.restDay!) } : {}),
      mealsPerDay: plan.meals.perDay,
      mealStructureDescription: plan.meals.slots.map((s) => `${s.name} (${s.timing}): ${s.intent}`).join(" "),
      preTrainingGuidance: plan.training.before,
      postTrainingGuidance: plan.training.after,
      hydrationOzPerDay: 0,
      fiberGramsPerDay: 0,
      substitutionGuidance: plan.foods.substitutions.map((s) => `${name(s.for)} → ${s.use.map(name).join(" or ")} (${s.why})`).join(" "),
      supplementGuidance: plan.supplements.map((s) => `${s.name}: ${s.why}`).join(" "),
      adherenceStrategy: plan.habits.join(" "),
      metricsToMonitor: plan.monitoring.measures,
      weeklyAdjustmentRule: plan.adjustments.map((a) => `If ${a.signal} (${a.afterWeeks} wk): ${adjustmentSummary(a, plan.energy.kcal)}`).join(" "),
      sourceStrategyLabel: `Nutrition Reasoner proposal — ${plan.objective.summary}`,
    },
  };
}
