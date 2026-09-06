// Phase 5.5A — the nutrition side of the unified OPTIM Plan (spec Part 8).
//
// Reuses lib/coach/activation-generation.ts's real generateThreeNutritionStrategies
// (three genuinely computed calorie/macro directions) as Stage A — this
// file adds the pieces that were missing for nutrition to reach the same
// AI-first rigor training already has: a complete prescription (meal
// count, pre/post-training guidance, substitutions, coach-curated food
// sources), conversational revision, and the persisted plan clients
// actually see. Additive only — generateThreeNutritionStrategies itself is
// untouched.

import type { GeneratedNutritionStrategy, OptionKind } from "./activation-generation.ts";
import type { ClientProgrammingProfile } from "./programming-profile.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { NutritionTargets } from "../types";
import type { MealRecommendation } from "./types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

// ---------------------------------------------------------------------------
// Stage B — the complete nutrition prescription (spec Part 8's field list)
// ---------------------------------------------------------------------------

const MEALS_PER_DAY_BY_PREFERENCE: Record<string, number> = {
  "2_3_meals": 3,
  "3_4_meals": 4,
  "5_plus_meals": 5,
  client_preference: 4,
};

function mealsPerDayFor(com: CoachOperatingModel): number {
  return MEALS_PER_DAY_BY_PREFERENCE[com.nutritionPhilosophy.mealFrequencyPreference] ?? 4;
}

function preTrainingGuidanceFor(profile: ClientProgrammingProfile, com: CoachOperatingModel): string {
  const timing = profile.preferredTrainingTimes[0];
  const base =
    com.nutritionPhilosophy.mealTimingPhilosophy === "flexible_around_training"
      ? "A real meal 2-3 hours before training, or a lighter carb+protein snack 30-60 minutes out if training soon after waking."
      : "Follow the coach's fixed meal schedule — no separate pre-training timing adjustment.";
  return timing ? `${base} (Client's usual training window: ${timing}.)` : base;
}

function postTrainingGuidanceFor(com: CoachOperatingModel): string {
  return com.nutritionPhilosophy.mealTimingPhilosophy === "flexible_around_training"
    ? "Protein + carbohydrate within a couple of hours post-training — the next real meal is enough; no supplement is required to hit this."
    : "Covered by the next scheduled meal on the coach's fixed structure.";
}

function substitutionGuidanceFor(profile: ClientProgrammingProfile, com: CoachOperatingModel): string {
  if (!profile.hasDietaryRestrictions) return "No dietary restrictions reported — no substitutions required.";
  const detail = profile.dietaryRestrictionsDetail?.trim();
  if (!detail) return "The client reported a dietary restriction but no detail — confirm specifics before finalizing food sources.";
  return com.nutritionPhilosophy.dietaryRestrictionHandling === "accommodate_within_targets"
    ? `Substitute around: ${detail}. Keep the same calorie/macro targets — swap food sources, not the numbers.`
    : `Reported restriction: ${detail}. Review against this coach's dietary-restriction handling before assigning.`;
}

function supplementGuidanceFor(com: CoachOperatingModel): string {
  if (com.nutritionPhilosophy.supplementBoundaries === "outside_my_scope") return "Supplement advice is outside this coach's scope — do not recommend any.";
  if (com.nutritionPhilosophy.supplementBoundaries === "open_to_evidence_based_supplements") return "Open to a broader evidence-based stack per the coach's philosophy.";
  return "Food first — only basics (protein, creatine) per the coach's philosophy.";
}

/** A widely-cited, conservative fiber estimate (14g per 1000kcal) — not a
 * fabricated number, but also not a substitute for a real dietitian's
 * guidance on medical cases; see Part 8's safety-boundary note below. */
function fiberGramsPerDayFor(calories: number): number {
  return Math.round((calories / 1000) * 14);
}

export interface CompleteNutritionPrescription {
  sourceStrategyKind: OptionKind;
  label: string;
  targets: NutritionTargets;
  usesTrainingRestSplit: boolean;
  trainingDayTargets?: NutritionTargets;
  restDayTargets?: NutritionTargets;
  mealsPerDay: number;
  mealStructureDescription: string;
  preTrainingGuidance: string;
  postTrainingGuidance: string;
  hydrationOzPerDay: number;
  fiberGramsPerDay: number;
  substitutionGuidance: string;
  supplementGuidance: string;
  adherenceStrategy: string;
  metricsToMonitor: string[];
  weeklyAdjustmentRule: string;
  conditionsPreventingAutoAdjustment: string[];
  requiresCoachApproval: boolean;
  assumptions: string[];
  whyItFits: string;
  tradeoff: string;
  clientFactsUsed: string[];
  coachingRulesUsed: string[];
}

/**
 * Builds the real, complete prescription for one already-generated nutrition
 * strategy — the piece spec Part 8 calls out as missing when a nutrition
 * system "only produces high-level strategy summaries." Every field is
 * computed from the client's real profile and the coach's real,
 * previously-uninspected nutritionPhilosophy answers (meal frequency,
 * training/rest-day strategy, dietary-restriction handling, supplement
 * boundaries) — never a static sample plan.
 */
export function buildCompleteNutritionPrescription(strategy: GeneratedNutritionStrategy, profile: ClientProgrammingProfile, com: CoachOperatingModel): CompleteNutritionPrescription {
  return {
    sourceStrategyKind: strategy.kind,
    label: strategy.label,
    targets: strategy.targets,
    usesTrainingRestSplit: !!strategy.trainingDayTargets && com.nutritionPhilosophy.trainingDayVsRestDayStrategy !== "identical_every_day",
    trainingDayTargets: strategy.trainingDayTargets,
    restDayTargets: strategy.restDayTargets,
    mealsPerDay: mealsPerDayFor(com),
    mealStructureDescription: strategy.mealStructureDescription,
    preTrainingGuidance: preTrainingGuidanceFor(profile, com),
    postTrainingGuidance: postTrainingGuidanceFor(com),
    hydrationOzPerDay: strategy.hydrationOzPerDay,
    fiberGramsPerDay: fiberGramsPerDayFor(strategy.targets.calories),
    substitutionGuidance: substitutionGuidanceFor(profile, com),
    supplementGuidance: supplementGuidanceFor(com),
    adherenceStrategy: strategy.adherenceStrategy,
    metricsToMonitor: strategy.metricsToMonitor,
    weeklyAdjustmentRule: strategy.weeklyAdjustmentRule,
    conditionsPreventingAutoAdjustment: strategy.conditionsPreventingAutoAdjustment,
    requiresCoachApproval: strategy.requiresCoachApproval,
    assumptions: strategy.assumptions,
    whyItFits: strategy.explanation.whyItFits,
    tradeoff: strategy.explanation.tradeoff,
    clientFactsUsed: strategy.explanation.clientFactsUsed,
    coachingRulesUsed: strategy.explanation.coachingRulesUsed,
  };
}

/** Real, coach-curated food-source recommendations already assigned to
 * this client (see lib/coach/meal-recommendations.ts) — Part 8's "coach-
 * curated food-source recommendations" requirement, satisfied by reusing
 * the existing library rather than inventing a second one. */
export function foodSourceRecommendationsFor(allRecommendations: MealRecommendation[], coachId: CoachProfileId, clientId: ClientProfileId): MealRecommendation[] {
  return allRecommendations.filter((r) => r.coachId === coachId && r.status === "active" && r.assignedClientIds.includes(clientId));
}

// ---------------------------------------------------------------------------
// Conversational revision (mirrors program-revision.ts's honest, pattern-
// matched — never fabricated-NLP — approach, scoped to nutrition's real
// levers instead of weeks/days).
// ---------------------------------------------------------------------------

export type NutritionRevisionKind = "adjust_protein" | "adjust_calories" | "adjust_meal_count" | "toggle_training_rest_split" | "unrecognized";

export interface NutritionRevisionPlan {
  kind: NutritionRevisionKind;
  proteinDeltaGPerLb?: number;
  calorieDeltaPercent?: number;
  mealsPerDay?: number;
  enableSplit?: boolean;
  summary: string;
}

export function interpretNutritionRevisionInstruction(instruction: string): NutritionRevisionPlan {
  const lower = instruction.toLowerCase();

  if (/(more|increase|higher).{0,15}protein/.test(lower)) {
    return { kind: "adjust_protein", proteinDeltaGPerLb: 0.1, summary: "Increase the daily protein target." };
  }
  if (/(less|decrease|lower|reduce).{0,15}protein/.test(lower)) {
    return { kind: "adjust_protein", proteinDeltaGPerLb: -0.1, summary: "Reduce the daily protein target." };
  }
  if (/(more|increase|higher).{0,15}(calorie|energy)/.test(lower)) {
    return { kind: "adjust_calories", calorieDeltaPercent: 0.05, summary: "Increase daily calories by about 5%." };
  }
  if (/(less|decrease|lower|reduce|cut).{0,15}(calorie|energy)/.test(lower)) {
    return { kind: "adjust_calories", calorieDeltaPercent: -0.05, summary: "Reduce daily calories by about 5%." };
  }
  const mealCountMatch = lower.match(/(\d+)\s*meals?/);
  if (mealCountMatch) {
    return { kind: "adjust_meal_count", mealsPerDay: Number(mealCountMatch[1]), summary: `Restructure to ${mealCountMatch[1]} meals/day.` };
  }
  if (/(add|use|enable).{0,20}(training.day|carb cycl|rest.day split)/.test(lower)) {
    return { kind: "toggle_training_rest_split", enableSplit: true, summary: "Split targets between training days and rest days." };
  }
  if (/(flat|same|remove|disable).{0,20}(every day|training.day|rest.day split)/.test(lower)) {
    return { kind: "toggle_training_rest_split", enableSplit: false, summary: "Use one flat daily target instead of a training/rest split." };
  }

  return { kind: "unrecognized", summary: "Couldn't confidently interpret this as a specific nutrition change — try naming protein, calories, meal count, or training/rest-day splitting." };
}

export interface NutritionRevisionChange {
  field: string;
  before: string;
  after: string;
}

export interface ApplyNutritionRevisionResult {
  revisedPrescription: CompleteNutritionPrescription;
  changes: NutritionRevisionChange[];
}

function recomputeMacrosAtCalories(calories: number, proteinGPerLb: number, weightLb: number, fatPercent = 0.3): NutritionTargets {
  const proteinG = Math.round(proteinGPerLb * weightLb);
  const fatG = Math.round((calories * fatPercent) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  return { calories, proteinG, carbsG, fatG };
}

/**
 * Applies a plan to a prescription — pure and deterministic, never claims a
 * change occurred when the instruction was unrecognized. Recomputes real
 * macros rather than only nudging a label, so the client's actual assigned
 * numbers change exactly as described.
 */
export function applyNutritionRevision(prescription: CompleteNutritionPrescription, plan: NutritionRevisionPlan, weightLb: number, baseProteinGPerLb: number): ApplyNutritionRevisionResult {
  const changes: NutritionRevisionChange[] = [];
  let revised: CompleteNutritionPrescription = { ...prescription };

  if (plan.kind === "adjust_protein" && plan.proteinDeltaGPerLb) {
    const newProteinGPerLb = Math.max(0.5, baseProteinGPerLb + plan.proteinDeltaGPerLb);
    const newTargets = recomputeMacrosAtCalories(prescription.targets.calories, newProteinGPerLb, weightLb);
    changes.push({ field: "Protein", before: `${prescription.targets.proteinG}g`, after: `${newTargets.proteinG}g` });
    revised = { ...revised, targets: newTargets };
  }

  if (plan.kind === "adjust_calories" && plan.calorieDeltaPercent) {
    const newCalories = Math.round(prescription.targets.calories * (1 + plan.calorieDeltaPercent));
    const proteinGPerLb = prescription.targets.proteinG / weightLb;
    const newTargets = recomputeMacrosAtCalories(newCalories, proteinGPerLb, weightLb);
    changes.push({ field: "Calories", before: `${prescription.targets.calories} kcal`, after: `${newTargets.calories} kcal` });
    revised = { ...revised, targets: newTargets };
  }

  if (plan.kind === "adjust_meal_count" && plan.mealsPerDay) {
    changes.push({ field: "Meals/day", before: `${prescription.mealsPerDay}`, after: `${plan.mealsPerDay}` });
    revised = { ...revised, mealsPerDay: plan.mealsPerDay };
  }

  if (plan.kind === "toggle_training_rest_split") {
    changes.push({ field: "Training/rest-day split", before: prescription.usesTrainingRestSplit ? "Split" : "Flat", after: plan.enableSplit ? "Split" : "Flat" });
    revised = {
      ...revised,
      usesTrainingRestSplit: !!plan.enableSplit,
      trainingDayTargets: plan.enableSplit ? (prescription.trainingDayTargets ?? recomputeMacrosAtCalories(Math.round(prescription.targets.calories * 1.08), prescription.targets.proteinG / weightLb, weightLb)) : undefined,
      restDayTargets: plan.enableSplit ? (prescription.restDayTargets ?? recomputeMacrosAtCalories(Math.round(prescription.targets.calories * 0.92), prescription.targets.proteinG / weightLb, weightLb)) : undefined,
    };
  }

  return { revisedPrescription: revised, changes };
}

export interface NutritionRevisionRecord {
  id: string;
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  instruction: string;
  plan: NutritionRevisionPlan;
  changes: NutritionRevisionChange[];
  prescriptionBeforeRevision: CompleteNutritionPrescription;
  prescriptionAfterRevision: CompleteNutritionPrescription;
  createdAtIso: string;
  confirmedAtIso?: string;
}
