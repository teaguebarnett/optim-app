// Nutrition Reasoner V1 — the compact canonical input (what the model sees) and the Allowed sets the validator
// checks against. Conventions shared with the resistance input: coach rules are [Brain key, label, value] tuples,
// client facts are keyed by their source ref, evidence comes from the shared claim retrieval (conceptClaims), and
// nothing client-identifying beyond the facts themselves is sent.

import { isKnown, type Fact } from "../../facts.ts";
import type { SynthesisInput } from "../../synthesis-input.ts";
import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";
import { conceptClaims, type EvidenceClaim } from "../retrieval.ts";
import { FOODS, restrictionTags, type DietaryTag } from "../../knowledge/nutrition/foods.ts";
import type { NutritionMethod } from "../../nutrition/method.ts";
import type { EnergyEstimate, TrainingContext } from "../../nutrition/energy.ts";
import type { NutritionSafety } from "../../nutrition/safety.ts";

export const NUTRITION_REASONER_VERSION = "nutrition-reasoner-v1.1.1";

export const NUTRITION_TOPICS_RETRIEVED = ["energy_requirements", "training_energy_cost", "rate_of_loss", "rate_of_gain", "protein", "protein_distribution", "carbohydrate", "dietary_fat", "recomposition", "diet_quality", "hydration", "adherence", "supplements", "energy_availability"];

export const FOOD_ROW_LEGEND = "id|name|roles|prep (none / minimal / cook)|household portion";

export interface NutritionReasoningInput {
  v: { reasoner: string; prompt: string; knowledge: string };
  goal: { primary: string | null; secondary: string[]; success: string | null; targetWeightLb: number | null };
  coach: { method: string; scope: "full" | "guidance"; approaches: string[]; rules: Array<[string, string, unknown]>; wontAdvise: string[] };
  client: { facts: Record<string, unknown>; missing: string[] };
  training: (TrainingContext & { conflicts: string[] }) | null;
  bounds: {
    energyKcal: [number, number] | null;
    energyRule: string | null;
    maintenanceKcal: [number, number] | null;
    restingKcal: [number, number] | null;
    floorKcal: number | null;
    /** V1.1 — the weekly-change calculation, day-target sizing, macro fit and the minor floor, all computed by OPTIM. */
    centralMaintenanceKcal: number | null;
    kcalPerPctPerWeek: number | null;
    sessionKcal: [number, number] | null;
    macroToleranceKcal: number | null;
    /** Minors only: OPTIM's central maintenance estimate for THIS client — intake below it is a restriction that goes
     * to qualified human review. A detection line, never a "safe minimum". */
    minorNoDeficitKcal: number | null;
    activityBasis: string[];
    proteinG: [number, number] | null;
    proteinPerKg: [number, number] | null;
    proteinBasis: string | null;
    notes: string[];
  };
  restrictions: { stated: string | null; excludedTags: DietaryTag[]; uninterpreted: boolean };
  safety: { warnings: string[]; minor: boolean };
  evidence: Array<{ ref: string; claim: string; source: string; params?: EvidenceClaim["parameters"] }>;
  foodsLegend: string;
  foods: string[];
}

/** How far the totals of the macro minimums/maximums may sit outside the energy range (rounding and food variance). */
export const macroTolerance = (kcalMid: number) => Math.max(100, Math.round(kcalMid * 0.05));
/** Minors: the client's own central maintenance estimate. Intake below it — or any decrease — is a restriction OPTIM
 * never prescribes autonomously; it is routed to qualified human review (no universal calorie minimum is involved). */
export const minorNoDeficit = (e: EnergyEstimate) => Math.round((e.maintenanceKcal.low + e.maintenanceKcal.high) / 2 / 50) * 50;

export interface NutritionAllowed {
  coachRuleKeys: Set<string>;
  clientFactRefs: Set<string>;
  knowledgeRefs: Set<string>;
  constraintIds: Set<string>;
  foods: Set<string>;
  approaches: Set<string>;
  measures: Set<string>;
  levers: Set<string>;
}

export function buildNutritionInput(params: {
  input: SynthesisInput;
  knowledge: FitnessKnowledgeRegistry;
  method: NutritionMethod;
  energy: EnergyEstimate | null;
  protein: { grams: { low: number; high: number }; perKg: { low: number; high: number } | null; basis: string } | null;
  training: TrainingContext | null;
  safety: NutritionSafety;
  conflicts: string[];
  promptVersion: string;
  notes: string[];
}): { reasoning: NutritionReasoningInput; allowed: NutritionAllowed; evidenceRefs: string[] } {
  const { input, method } = params;
  const c = input.client;
  const rules: NutritionReasoningInput["coach"]["rules"] = [];
  const rule = (key: string | undefined, labelText: string, value: unknown) => key && value !== undefined && value !== null && rules.push([key, labelText, value]);
  const rng = (r: { min: number; max: number }) => [r.min, r.max];
  rule(method.approaches.keys[0], "nutrition approaches", method.approaches.value);
  if (method.calorieMethod) rule(method.calorieMethod.keys[0], "calorie method", method.calorieMethod.value);
  if (method.protein) rule(method.protein.keys[0], "protein", `${method.protein.value.range.min}–${method.protein.value.range.max} ${method.protein.value.unit} (${method.protein.value.basis.replace(/_/g, " ")})`);
  if (method.foodPrinciples) rule(method.foodPrinciples.keys[0], "food principles", method.foodPrinciples.value);
  if (method.trainingRest) rule(method.trainingRest.keys[0], "training vs rest days", method.trainingRest.value);
  if (method.measurements) rule(method.measurements.keys[0], "progress measures", method.measurements.value);
  if (method.dataThresholdWeeks) rule(method.dataThresholdWeeks.keys[0], "weeks of data before a change", rng(method.dataThresholdWeeks.value));
  if (method.rate) rule(method.rate.keys[0], "rate % bodyweight/week", rng(method.rate.value));
  if (method.levers) rule(method.levers.keys[0], "adjust first (in order)", method.levers.value);
  if (method.maintenanceBandPercent) rule(method.maintenanceBandPercent.keys[0], "maintenance band % bodyweight", rng(method.maintenanceBandPercent.value));
  if (method.recomposition) rule(method.recomposition.keys[0], "recomposition approach", method.recomposition.value);
  if (method.adherenceStandard) rule(method.adherenceStandard.keys[0], "on plan means", method.adherenceStandard.value);
  if (method.mealsPerDay) rule(method.mealsPerDay.keys[0], "meals/day", rng(method.mealsPerDay.value));
  if (method.supplements) rule(method.supplements.keys[0], "supplements", method.supplements.value);
  if (method.dietBreaks) rule(method.dietBreaks.keys[0], "diet breaks", method.dietBreaks.value);
  if (method.endurance.fuelingGramsPerHour) rule(method.endurance.fuelingGramsPerHour.keys[0], "in-session carbs g/hour", rng(method.endurance.fuelingGramsPerHour.value));
  if (method.endurance.periodizesCarbs) rule(method.endurance.periodizesCarbs.keys[0], "periodizes carbs", method.endurance.periodizesCarbs.value);

  const factList = [
    c.body.age, c.body.sex, c.body.heightInches, c.body.weightLb, c.body.weightTrend,
    c.schedule.preferredTimes, c.schedule.predictability, c.schedule.dailyActivity, c.schedule.notes, c.schedule.maxSessionLength,
    c.training.experience, c.training.recentConsistency, c.training.currentSessionsPerWeek,
    c.recovery.sleep, c.recovery.obstacles, c.nutrition.approach, c.nutrition.dietaryRestrictions,
    c.goals.primary, c.goals.secondary, c.goals.targetWeightLb, c.goals.successDefinition,
  ] as Array<Fact<unknown>>;
  const facts: Record<string, unknown> = {};
  for (const f of factList) if (isKnown(f)) facts[f.source.ref] = f.value;
  const missing = ([c.body.weightLb, c.body.heightInches, c.body.age, c.body.sex, c.schedule.dailyActivity, c.schedule.preferredTimes, c.nutrition.dietaryRestrictions] as Fact<unknown>[]).filter((f) => !isKnown(f)).map((f) => (f as { ref?: string }).ref ?? "unknown");

  const detail = isKnown(c.nutrition.dietaryRestrictions) && c.nutrition.dietaryRestrictions.value.has ? c.nutrition.dietaryRestrictions.value.detail : null;
  const r = restrictionTags(detail);
  const excluded = new Set(r.tags);
  const foods = FOODS.filter((x) => !x.tags.some((t) => excluded.has(t)));

  const goalClass = input.goal.primary?.class ?? null;
  const { claims, refs } = conceptClaims(params.knowledge, NUTRITION_TOPICS_RETRIEVED, (claim) => {
    const g = claim.appliesTo?.goalClasses;
    return !g || !goalClass || g.includes(goalClass) || input.goal.secondary.some((s) => g.includes(s.class));
  });

  const e = params.energy;
  const p = params.protein;
  const reasoning: NutritionReasoningInput = {
    v: { reasoner: NUTRITION_REASONER_VERSION, prompt: params.promptVersion, knowledge: params.knowledge.version },
    goal: { primary: goalClass, secondary: input.goal.secondary.map((s) => s.class), success: isKnown(input.goal.successDefinition) ? input.goal.successDefinition.value : null, targetWeightLb: isKnown(c.goals.targetWeightLb) ? c.goals.targetWeightLb.value : null },
    coach: { method: `v${method.version}`, scope: method.scope, approaches: method.approaches.value, rules, wontAdvise: method.wontAdvise.value },
    client: { facts, missing },
    training: params.training ? { ...params.training, conflicts: params.conflicts } : null,
    bounds: {
      energyKcal: e?.targetBand ? [e.targetBand.low, e.targetBand.high] : null,
      energyRule: e?.targetBand?.rule ?? null,
      maintenanceKcal: e ? [e.maintenanceKcal.low, e.maintenanceKcal.high] : null,
      restingKcal: e ? [e.restingKcal.low, e.restingKcal.high] : null,
      floorKcal: e?.floorKcal ?? null,
      centralMaintenanceKcal: e ? Math.round((e.maintenanceKcal.low + e.maintenanceKcal.high) / 2) : null,
      kcalPerPctPerWeek: e?.kcalPerPctPerWeek ?? null,
      sessionKcal: e?.sessionKcal ? [e.sessionKcal.low, e.sessionKcal.high] : null,
      macroToleranceKcal: e?.targetBand ? macroTolerance((e.targetBand.low + e.targetBand.high) / 2) : null,
      minorNoDeficitKcal: params.safety.minor && e ? minorNoDeficit(e) : null,
      activityBasis: e?.activityFactor.basis ?? [],
      proteinG: p ? [p.grams.low, p.grams.high] : null,
      proteinPerKg: p?.perKg ? [p.perKg.low, p.perKg.high] : null,
      proteinBasis: p?.basis ?? null,
      notes: [...(e?.heuristics ?? []), ...params.notes],
    },
    restrictions: { stated: detail, excludedTags: r.tags, uninterpreted: !!detail && !r.understood },
    safety: { warnings: params.safety.warnings, minor: params.safety.minor },
    evidence: claims.map((x) => ({ ref: x.ref, claim: x.statement, source: x.support, ...(x.parameters ? { params: x.parameters } : {}) })),
    foodsLegend: FOOD_ROW_LEGEND,
    foods: foods.map((x) => [x.id, x.name, x.roles.join(","), x.prep, x.portion].join("|")),
  };
  return {
    reasoning,
    evidenceRefs: [...refs],
    allowed: {
      coachRuleKeys: new Set(rules.map((x) => x[0])),
      clientFactRefs: new Set(Object.keys(facts)),
      knowledgeRefs: new Set(claims.map((x) => x.ref)),
      constraintIds: new Set(),
      foods: new Set(foods.map((x) => x.id)),
      approaches: new Set(method.approaches.value),
      measures: new Set(method.measurements?.value ?? []),
      levers: new Set(method.levers?.value ?? []),
    },
  };
}
