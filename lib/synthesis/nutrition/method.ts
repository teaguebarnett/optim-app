// Nutrition Reasoner V1 — the coach's canonical nutrition methodology, read straight from the active Coach Brain
// version's v2 calibration answers (nutrition + weight-management chapters). Same rules as the resistance reader
// (planners/resistance/method.ts): every value keeps the Brain key it came from so decisions can cite it, and nothing
// is defaulted — a missing required answer is reported, never filled with an OPTIM preference.

import type { ConfirmedCoachMethod } from "../../coach/coach-brain.ts";
import { asLayered, asRange } from "../../coach/calibration/model.ts";
import type { GoalClass } from "../goal-contract.ts";
import type { Range, Sourced } from "../planners/resistance/method.ts";

export const NUTRITION_APPROACHES = ["meal_plan", "calories_protein", "full_macros", "portion_guides", "habit_based"] as const;
export type NutritionApproach = (typeof NUTRITION_APPROACHES)[number];
export type CalorieMethod = "formula" | "current_intake" | "adaptive_trend" | "no_calorie_targets";
export type ProteinBasis = "per_lb_bodyweight" | "per_kg_bodyweight" | "per_lb_goal_weight" | "per_kg_goal_weight" | "fixed_grams" | "no_target";
export type TrainingRestStrategy = "same_calories_shift_carbs" | "higher_on_training_days" | "fuel_for_session" | "identical_every_day";
export type SupplementStance = "food_first_basics" | "evidence_based_stack" | "outside_scope";
export type RecompositionApproach = "small_deficit_high_protein" | "maintenance_high_protein" | "alternating_blocks";

export interface NutritionMethod {
  versionId: string;
  version: number;
  scope: "full" | "guidance";
  /** How the coach expresses nutrition (full scope only; guidance coaches don't set targets). */
  approaches: Sourced<NutritionApproach[]>;
  calorieMethod: Sourced<CalorieMethod> | null;
  /** Protein for THIS client's goal: the coach's goal exception, else their base range. Null = no protein target. */
  protein: Sourced<{ basis: Exclude<ProteinBasis, "no_target">; range: Range; unit: string }> | null;
  foodPrinciples: Sourced<string[]> | null;
  trainingRest: Sourced<TrainingRestStrategy> | null;
  measurements: Sourced<string[]> | null;
  /** Weeks of data before targets change or a stall is called. */
  dataThresholdWeeks: Sourced<Range> | null;
  /** % bodyweight / week for the client's direction of change (loss or gain); null when not applicable. */
  rate: Sourced<Range> | null;
  /** Ranked first-adjustment levers for the client's goal (fat loss / gain / maintenance). */
  levers: Sourced<string[]> | null;
  maintenanceBandPercent: Sourced<Range> | null;
  recomposition: Sourced<RecompositionApproach> | null;
  adherenceStandard: Sourced<string> | null;
  mealsPerDay: Sourced<Range> | null;
  supplements: Sourced<SupplementStance> | null;
  wontAdvise: Sourced<string[]>;
  dietBreaks: Sourced<string> | null;
  endurance: { fuelingGramsPerHour: Sourced<Range> | null; periodizesCarbs: Sourced<boolean> | null };
}

export type NutritionMethodRead =
  | { ok: true; method: NutritionMethod }
  | { ok: false; reason: "not_coached"; message: string }
  | { ok: false; reason: "incomplete"; missing: Array<{ key: string; why: string }> };

const isNa = (v: unknown) => !!v && typeof v === "object" && (v as { notApplicable?: boolean }).notApplicable === true;
const toRange = (v: unknown): Range | null => {
  const r = asRange(v);
  return r ? { min: r.min, max: r.max ?? r.min, ...(typeof r.preferred === "number" ? { preferred: r.preferred } : {}) } : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const strs = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
const src = <T>(value: T | null, ...keys: string[]): Sourced<T> | null => (value === null ? null : { value, keys });

/** The coach's goal key (calibration GOAL_KEYS) for a client goal class. */
export function coachGoalKey(goal: GoalClass | null): "lose_fat" | "maintenance" | "build_muscle" | null {
  if (goal === "fat_loss") return "lose_fat";
  if (goal === "maintenance" || goal === "recomposition" || goal === "general_fitness") return "maintenance";
  if (goal === "hypertrophy" || goal === "weight_gain" || goal === "strength") return "build_muscle";
  return null;
}

export function readNutritionMethod(method: ConfirmedCoachMethod, goal: GoalClass | null): NutritionMethodRead {
  const cal = method.operatingModel.calibration;
  if (cal?.schema !== 2) return { ok: false, reason: "incomplete", missing: [{ key: "calibration.schema", why: "The coach's method predates canonical calibration (v1). Refining it in Settings gives OPTIM the coach's own nutrition rules." }] };
  const a = cal.answers as Record<string, unknown>;
  const scope = str(a.nutrition_scope);
  if (scope === "none") return { ok: false, reason: "not_coached", message: "This coach doesn't coach nutrition, so OPTIM prepares no nutrition strategy for their clients." };
  if (scope !== "full" && scope !== "guidance") return { ok: false, reason: "incomplete", missing: [{ key: "nutrition_scope", why: "Whether the coach coaches nutrition decides whether OPTIM may propose any." }] };

  const missing: Array<{ key: string; why: string }> = [];
  const need = <T>(v: T | null, key: string, why: string): T | null => {
    if (v === null) missing.push({ key, why });
    return v;
  };
  const full = scope === "full";
  const approaches = full ? need(strs(a.n_approach)?.filter((x): x is NutritionApproach => (NUTRITION_APPROACHES as readonly string[]).includes(x)) ?? null, "n_approach", "How the coach expresses nutrition (targets, portions, habits…) decides the shape of the proposal.") : (["habit_based", "portion_guides"] as NutritionApproach[]);
  if (approaches && !approaches.length) missing.push({ key: "n_approach", why: "No recognized nutrition approach is set." });
  const calorieMethod = full ? need(str(a.n_calorie_method) as CalorieMethod | null, "n_calorie_method", "How the coach sets calorie targets (or that they don't).") : null;

  const basis = str(a.n_protein_basis) as ProteinBasis | null;
  let protein: NutritionMethod["protein"] = null;
  if (basis && basis !== "no_target") {
    const layered = asLayered(a.n_protein_amount);
    const gk = coachGoalKey(goal);
    const exception = layered?.varies === "goal" && gk ? toRange(layered.exceptions?.[gk]) : null;
    const range = exception ?? toRange(layered ? layered.base : a.n_protein_amount);
    const unit = asRange(layered ? (exception ? layered.exceptions?.[gk!] : layered.base) : a.n_protein_amount)?.unit ?? "";
    if (range) protein = { value: { basis, range, unit }, keys: [exception ? `n_protein_amount.exceptions.${gk}` : "n_protein_amount"] };
    else missing.push({ key: "n_protein_amount", why: "The coach's protein basis is set but its amount isn't." });
  } else if (!basis && (full || a.n_protein_basis !== undefined)) missing.push({ key: "n_protein_basis", why: "How the coach sets protein." });

  const direction = goal === "fat_loss" ? "loss" : goal === "weight_gain" || goal === "hypertrophy" ? "gain" : null;
  const rate =
    direction === "loss" ? src(toRange(a.w_rate_of_loss), "w_rate_of_loss")
    : direction === "gain" ? (src(toRange(a.w_rate_of_gain), "w_rate_of_gain") ?? src(toRange(a.n_rate_of_gain), "n_rate_of_gain"))
    : null;
  const levers = goal === "fat_loss" ? src(strs(a.w_levers), "w_levers") : direction === "gain" ? src(strs(a.w_gain_levers), "w_gain_levers") : src(strs(a.w_maintenance_adjust), "w_maintenance_adjust");

  if (full) {
    if (!str(a.n_training_rest)) missing.push({ key: "n_training_rest", why: "Whether training and rest days differ." });
    if (!strs(a.n_measurements)?.length) missing.push({ key: "n_measurements", why: "Which measures judge progress." });
    if (!toRange(a.data_threshold_weeks)) missing.push({ key: "data_threshold_weeks", why: "How much data the coach wants before changing targets." });
  }
  if (missing.length) return { ok: false, reason: "incomplete", missing };

  return {
    ok: true,
    method: {
      versionId: method.versionId,
      version: method.version,
      scope,
      approaches: { value: approaches!, keys: [full ? "n_approach" : "nutrition_scope"] },
      calorieMethod: src(calorieMethod, "n_calorie_method"),
      protein,
      foodPrinciples: src(strs(a.n_food_principles), "n_food_principles"),
      trainingRest: src(str(a.n_training_rest) as TrainingRestStrategy | null, "n_training_rest"),
      measurements: src(strs(a.n_measurements), "n_measurements"),
      dataThresholdWeeks: src(toRange(a.data_threshold_weeks), "data_threshold_weeks"),
      rate,
      levers,
      maintenanceBandPercent: src(toRange(a.w_maintenance_band), "w_maintenance_band"),
      recomposition: goal === "recomposition" ? src(str(a.n_recomposition) as RecompositionApproach | null, "n_recomposition") : null,
      adherenceStandard: src(str(a.n_adherence_standard), "n_adherence_standard"),
      mealsPerDay: isNa(a.n_meal_structure) ? null : src(toRange(a.n_meal_structure), "n_meal_structure"),
      supplements: src(str(a.n_supplements) as SupplementStance | null, "n_supplements"),
      wontAdvise: { value: strs(a.n_wont_advise) ?? [], keys: ["n_wont_advise"] },
      dietBreaks: goal === "fat_loss" ? src(str(a.w_breaks), "w_breaks") : null,
      endurance: { fuelingGramsPerHour: src(toRange(a.n_fueling), "n_fueling"), periodizesCarbs: typeof a.n_carb_periodization === "boolean" ? { value: a.n_carb_periodization, keys: ["n_carb_periodization"] } : null },
    },
  };
}
