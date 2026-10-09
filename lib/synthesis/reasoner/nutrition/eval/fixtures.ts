// Nutrition Reasoner V1 — offline fixtures. Reuses the Fitness Reasoner's fixtures (scenarioInput, coachMethod,
// fakeModel) — the same intake shape, Coach Brain builder and scripted-model boundary — and adds a nutrition coach
// method and a scripted nutrition model that answers inside OPTIM's rails, so tests can corrupt one field at a time.

import { coachMethod, layer, range } from "../../eval/fixtures.ts";
import type { ConfirmedCoachMethod } from "../../../../coach/coach-brain.ts";
import type { NutritionReasoningInput } from "../input.ts";

export { fakeModel, NOW, scenarioInput } from "../../eval/fixtures.ts";

/** A full-scope nutrition coach (calories + protein / full macros, adaptive trend, protein per kg, 3–5 meals). */
export function nutritionCoach(over: Record<string, unknown> = {}): ConfirmedCoachMethod {
  return coachMethod({
    practice_goals: ["get_stronger", "build_muscle", "lose_fat", "recomposition"],
    nutrition_scope: "full",
    n_approach: ["full_macros", "calories_protein"],
    n_calorie_method: "adaptive_trend",
    n_protein_basis: "per_kg_bodyweight",
    n_protein_amount: layer(range(1.6, 2.2, "g/kg")),
    n_food_principles: ["whole_foods_majority", "protein_each_meal", "fiber_and_micronutrients"],
    n_training_rest: "same_calories_shift_carbs",
    n_measurements: ["weekly_average_weight", "waist", "performance", "hunger_energy"],
    data_threshold_weeks: range(2, 3, "weeks"),
    n_meal_structure: range(3, 5, "meals/day"),
    n_adherence_standard: "weekly_average",
    n_supplements: "food_first_basics",
    n_recomposition: "maintenance_high_protein",
    w_rate_of_loss: range(0.5, 1, "% bodyweight/week"),
    w_levers: ["calories", "steps", "cardio"],
    w_rate_of_gain: range(0.25, 0.5, "% bodyweight/week"),
    w_gain_levers: ["add_calories", "calorie_dense", "appetite_adherence"],
    w_maintenance_band: range(1, 2, "% bodyweight"),
    w_maintenance_adjust: ["habits", "calories", "steps"],
    ...over,
  });
}

/** The wire shape a model returns — loose so tests can corrupt any field. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test wire shape: tests corrupt arbitrary fields
export type WireNutrition = Record<string, unknown> & { plan: Record<string, any> };

const ruleVal = (ri: NutritionReasoningInput, labelText: string) => ri.coach.rules.find((r) => r[1] === labelText)?.[2];
const ruleKey = (ri: NutritionReasoningInput, labelText: string) => ri.coach.rules.find((r) => r[1] === labelText)?.[0];

/** A plausible, rail-respecting strategy built from the input (scripted model — rails only, not coaching quality). */
export function scriptedNutrition(ri: NutritionReasoningInput, tweak?: (p: WireNutrition["plan"]) => void): WireNutrition {
  const approaches = ri.coach.approaches;
  const approach = approaches.includes("full_macros") ? "full_macros" : approaches[0];
  const numeric = ["full_macros", "calories_protein", "meal_plan"].includes(approach);
  const method = ruleVal(ri, "calorie method") as string | undefined;
  const band = ri.bounds.energyKcal;
  const mode = !numeric || method === "no_calorie_targets" ? "none" : method === "current_intake" ? "baseline_first" : band ? "target" : "none";
  const mid = band ? Math.round((band[0] + band[1]) / 2 / 50) * 50 : 0;
  const kcal = mode === "target" && band ? [Math.max(band[0], mid - 100), Math.min(band[1], mid + 100)] : null;
  const p = numeric && ri.bounds.proteinG ? [ri.bounds.proteinG[0], Math.min(ri.bounds.proteinG[1], ri.bounds.proteinG[0] + 30)] : null;
  const kgOf = (ri.client.facts["onboarding.about_you.weightLb"] as number | undefined) ? (ri.client.facts["onboarding.about_you.weightLb"] as number) * 0.4536 : 75;
  const fatMin = kcal ? Math.max(Math.ceil((kcal[0] * 0.25) / 9), Math.ceil(kgOf * 0.6)) : null;
  const fat = kcal && fatMin ? [fatMin, fatMin + 10] : null;
  const carbs = kcal && p && fat ? [Math.max(0, Math.round((kcal[0] - 4 * p[0] - 9 * fat[0]) / 4)), Math.max(0, Math.round((kcal[1] - 4 * p[1] - 9 * fat[1]) / 4))].sort((a, b) => a - b) : null;
  const meals = (ruleVal(ri, "meals/day") as number[] | undefined) ?? [3, 4];
  const perDay = Math.min(Math.max(4, meals[0]), meals[1]);
  const foods = ri.foods.map((r) => r.split("|")).map(([id, , roles]) => ({ id, roles: roles.split(",") }));
  const pick = (role: string, n: number) => foods.filter((f) => f.roles.includes(role)).slice(0, n).map((f) => f.id);
  const protein = pick("protein", 4);
  const carb = pick("carbohydrate", 4);
  const produce = pick("produce", 2);
  const slots = Array.from({ length: perDay }, (_, i) => ({ name: ["Breakfast", "Lunch", "Pre- or post-training meal", "Dinner", "Snack"][i] ?? `Meal ${i + 1}`, timing: ["Within an hour of waking", "Midday", "1–2 hours before or after training", "Evening", "Between meals"][i] ?? "Spaced through the day", intent: ["Starts the day with a protein-forward meal that's quick to put together.", "Keeps protein evenly spaced and covers fiber with vegetables.", "Fuels the session and supports recovery around training.", "Closes the day's protein and carbohydrate needs with a familiar meal.", "Bridges a long gap so hunger stays manageable."][i] ?? "Keeps intake evenly spread.", foods: [protein[i % protein.length], carb[i % carb.length], produce[i % produce.length]].filter(Boolean), proteinFocus: true }));
  const measures = ((ruleVal(ri, "progress measures") as string[] | undefined) ?? ["weekly_average_weight"]).slice(0, 2);
  const th = (ruleVal(ri, "weeks of data before a change") as number[] | undefined) ?? [2, 3];
  const levers = (ruleVal(ri, "adjust first (in order)") as string[] | undefined) ?? [];
  const strategy = ruleVal(ri, "training vs rest days") as string | undefined;
  const goal = ri.goal.primary;
  const focus = goal === "fat_loss" ? "fat_loss" : goal === "hypertrophy" || goal === "weight_gain" || goal === "strength" ? "muscle_gain" : goal === "recomposition" ? "recomposition" : goal === "maintenance" ? "maintenance" : goal === "general_fitness" ? "health" : "performance";
  const coachKey = ruleKey(ri, "nutrition approaches") ?? ri.coach.rules[0]?.[0];
  // A decrease that would cross a floor isn't proposed — the next coach lever that changes no intake is used instead.
  const adjustment = () => {
    // Worst case: a decrease lands at energy minimum − 150. Minors never get a decrease.
    const floor = ri.bounds.floorKcal ?? 0;
    const lever = levers.find((l) => leverDirection(l, goal) !== "decrease" || (!ri.safety.minor && (!kcal || kcal[0] - 150 >= floor))) ?? "none";
    const direction = leverDirection(lever, goal);
    return { signal: "the weekly average moves outside the expected rate", afterWeeks: th[0], lever, direction, ...(direction !== "none" ? { kcal: [100, 150] } : {}), change: "Adjust by a modest step." };
  };
  // V1.1: the stated rate is the one the energy implies; day targets keep the weekly average and size to the session.
  const central = ri.bounds.centralMaintenanceKcal;
  const kpp = ri.bounds.kcalPerPctPerWeek;
  const rate = kcal && central && kpp ? [+((kcal[0] - central) / kpp).toFixed(2), +((kcal[1] - central) / kpp).toFixed(2)] : null;
  const dayKcal = (strategy: string, k: number[]) => {
    if (strategy === "same_calories_shift_carbs" || strategy === "identical_every_day") return { trainingDayKcal: k, restDayKcal: k };
    const n = Math.min(6, Math.max(1, ri.training?.sessionsPerWeek ?? 3));
    const d = ri.bounds.sessionKcal ? Math.round((ri.bounds.sessionKcal[0] + ri.bounds.sessionKcal[1]) / 2) : 300;
    const rest = k.map((x) => Math.round(x - (n / 7) * d));
    return { trainingDayKcal: rest.map((x) => x + d), restDayKcal: rest };
  };
  const fact = Object.keys(ri.client.facts)[0];
  const ev = ri.evidence[0]?.ref;
  const refs = { coach: coachKey ? [coachKey] : [], client: fact ? [fact] : [], evidence: ev ? [ev] : [] };
  const plan: WireNutrition["plan"] = {
    objective: { focus, summary: `Scripted ${focus.replace(/_/g, " ")} strategy.`, why: "Scripted." },
    approach: { id: approach, why: "Scripted: the coach's first numeric approach." },
    energy: { mode, ...(kcal ? { kcal } : {}), ...(rate ? { rate } : {}), why: mode === "baseline_first" ? "Two weeks of normal eating, logged, sets the baseline." : "Scripted." },
    ...(strategy && kcal ? { dayVariation: { strategy, ...dayKcal(strategy, kcal), note: "Scripted." } } : {}),
    protein: { g: p, why: "Scripted." },
    carbohydrate: { g: approach === "full_macros" ? carbs : null, why: "Scripted." },
    fat: { g: approach === "full_macros" ? fat : null, why: "Scripted." },
    meals: { perDay, why: "Scripted.", slots },
    training: { before: "A normal meal 1–3 hours before training.", after: "A protein-containing meal within about two hours after training." },
    foods: { emphasize: [...protein.slice(0, 2), ...carb.slice(0, 2), ...produce.slice(0, 1)], substitutions: protein.length > 1 ? [{ for: protein[0], use: [protein[1]], why: "Same role, more variety." }] : [] },
    habits: ["Protein at each meal.", "Vegetables at two meals a day."],
    hydration: "Drink to thirst and replace sweat losses around training.",
    supplements: [],
    monitoring: { measures, cadence: "Weekly check-in.", reviewAfterWeeks: th[0] },
    adjustments: mode === "target" ? [adjustment()] : [],
    assumptions: ["Scripted assumption."],
    uncertainties: [{ about: "Energy expenditure", impact: "The estimate may be off; the trend corrects it." }],
    coachQuestions: [],
    decisions: (["objective", "energy", "protein", "meal_structure", "monitoring"] as const).map((topic) => ({ topic, decision: `Scripted ${topic}`, because: "Scripted.", ...refs })),
  };
  tweak?.(plan);
  return { status: "PLAN", plan };
}

/** The intake direction a lever implies for a goal (scripted model only). */
function leverDirection(lever: string, goal: string | null): "increase" | "decrease" | "none" {
  if (lever === "add_calories" || lever === "calorie_dense") return "increase";
  if (lever === "calories") return goal === "fat_loss" ? "decrease" : "increase";
  return "none";
}
