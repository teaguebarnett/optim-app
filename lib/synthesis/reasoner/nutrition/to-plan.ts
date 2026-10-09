// Nutrition Reasoner V1 — mapping a proposal onto the EXISTING nutrition contract (AssignedNutritionPlan, the content
// of a draft nutrition_plan_versions row). Pure; nothing is written. Proposed ≠ approved: the result carries no
// approval time and no id — the existing coach review/publish path supplies both.
//
// The existing contract requires single calorie/macro numbers, so only a numeric strategy with all four can be
// represented today; habit- and portion-based strategies (and baseline-first ones) return the reason instead of a
// fabricated target. Fields the contract stores as numbers but the strategy expresses in words (hydration, fiber)
// stay 0 = "not set", the convention production already uses (createPublishAndAssignNutritionAction).

import type { AssignedNutritionPlan } from "../../../types.ts";
import { food } from "../../knowledge/nutrition/foods.ts";
import { adjustmentSummary } from "./validate.ts";
import type { NutritionPlan } from "./contract.ts";

const mid = (r: { min: number; max: number }) => Math.round((r.min + r.max) / 2);

export type DraftNutritionContent = Omit<AssignedNutritionPlan, "id" | "approvedAtIso">;

export function toAssignedNutritionPlanDraft(plan: NutritionPlan): { ok: true; content: DraftNutritionContent } | { ok: false; reason: string } {
  const e = plan.energy.kcal;
  const p = plan.protein.grams;
  const c = plan.carbohydrate.grams;
  const f = plan.fat.grams;
  if (plan.energy.mode !== "target" || !e || !p || !c || !f) return { ok: false, reason: `The existing nutrition contract stores single calorie and macro targets; this ${plan.approach.id.replace(/_/g, " ")} strategy${plan.energy.mode === "baseline_first" ? " sets calories after a baseline" : ""} doesn't have all four, so it can't be stored as an assigned plan yet.` };
  const name = (id: string) => food(id)?.name ?? id;
  const dv = plan.dayVariation;
  const split = !!dv && dv.strategy !== "identical_every_day" && !!dv.trainingDayKcal && !!dv.restDayKcal;
  return {
    ok: true,
    content: {
      targets: { calories: mid(e), proteinG: mid(p), carbsG: mid(c), fatG: mid(f) },
      usesTrainingRestSplit: split,
      ...(split ? { trainingDayTargets: { calories: mid(dv!.trainingDayKcal!), proteinG: mid(p), carbsG: mid(c), fatG: mid(f) }, restDayTargets: { calories: mid(dv!.restDayKcal!), proteinG: mid(p), carbsG: mid(c), fatG: mid(f) } } : {}),
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
