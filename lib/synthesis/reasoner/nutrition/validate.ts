// Nutrition Reasoner V1 — deterministic validation. Errors reject the output (and become the one repair attempt's
// feedback); quality findings never block but go to the coach. Every rule enforces something OPTIM can know:
// the coach's method, OPTIM's computed bounds, the client's restrictions, the safety doctrine, provenance.

import { citationErrors } from "../expand.ts";
import { food } from "../../knowledge/nutrition/foods.ts";
import type { NutritionMethod } from "../../nutrition/method.ts";
import type { NutritionAllowed, NutritionReasoningInput } from "./input.ts";
import type { Grams, NutritionPlan } from "./contract.ts";

export interface NutritionQualityFinding {
  code: string;
  severity: "warning" | "info";
  message: string;
}

const NUMERIC_APPROACHES = new Set(["calories_protein", "full_macros", "meal_plan"]);
/** Never acceptable in a coaching strategy: punitive compensation, crash tactics, "detox". */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\b(earn(ed|ing)? (your|the|a) (food|meal|treat|carbs)|burn (it|that|them) off|make up for|compensat\w+ (for|by) (eating|food|calories)|punish\w*)\b/i, "punitive or compensatory language"],
  [/\b(detox|cleanse|juice fast|water fast|crash diet|starv\w+)\b/i, "a crash, detox or starvation tactic"],
  [/\bskip(ping)? (meals|breakfast|lunch|dinner) (to|so)\b/i, "skipping meals as a tool"],
  [/\b(cheat (meal|day)s?|bad foods?|clean eating only)\b/i, "moralized food language"],
];

const within = (r: Grams, lo: number, hi: number, tol = 0) => r.min >= lo - tol && r.max <= hi + tol;
const fmt = (r: Grams) => `${r.min}–${r.max}`;

function texts(plan: NutritionPlan): string[] {
  return [
    plan.objective.summary, plan.objective.rationale, plan.approach.rationale, plan.energy.rationale, plan.dayVariation?.note ?? "",
    plan.protein.rationale, plan.carbohydrate.rationale, plan.fat.rationale, plan.meals.rationale,
    ...plan.meals.slots.flatMap((s) => [s.name, s.timing, s.intent]),
    plan.training.before, plan.training.after, plan.training.during ?? "",
    ...plan.foods.substitutions.map((s) => s.why), ...plan.habits, plan.hydration, ...plan.supplements.flatMap((s) => [s.name, s.why]),
    plan.monitoring.cadence, ...plan.adjustments.flatMap((a) => [a.signal, a.change]), ...plan.assumptions,
    ...plan.uncertainties.flatMap((u) => [u.about, u.impact]), ...plan.coachQuestions.flatMap((q) => [q.question, q.why]),
    ...plan.decisions.flatMap((d) => [d.decision, d.because]),
  ].filter(Boolean);
}

export function validateNutritionPlan(params: { plan: NutritionPlan; reasoning: NutritionReasoningInput; allowed: NutritionAllowed; method: NutritionMethod; weightKg: number | null; goal: string | null }): { ok: boolean; errors: string[]; quality: NutritionQualityFinding[] } {
  const { plan, reasoning: ri, allowed, method } = params;
  const errors: string[] = [];
  const quality: NutritionQualityFinding[] = [];
  const b = ri.bounds;
  const numeric = NUMERIC_APPROACHES.has(plan.approach.id);

  // Approach — only one the coach uses.
  if (!allowed.approaches.has(plan.approach.id)) errors.push(`Approach "${plan.approach.id}" isn't one this coach uses (${[...allowed.approaches].join(", ")}).`);

  // Objective follows the goal.
  const expected: Record<string, string[]> = { fat_loss: ["fat_loss"], weight_gain: ["muscle_gain"], hypertrophy: ["muscle_gain"], recomposition: ["recomposition"], maintenance: ["maintenance", "health"], strength: ["muscle_gain", "performance", "maintenance"], endurance: ["performance"], event_performance: ["performance"], sport_performance: ["performance"], general_fitness: ["health", "maintenance"] };
  if (params.goal && expected[params.goal] && !expected[params.goal].includes(plan.objective.focus)) errors.push(`Objective "${plan.objective.focus}" doesn't match the client's ${params.goal.replace(/_/g, " ")} goal (expected ${expected[params.goal].join(" or ")}).`);
  if (ri.safety.minor && plan.objective.focus === "fat_loss") errors.push("The client is a minor: no fat-loss strategy.");

  // Energy — the coach's calorie method and OPTIM's bounds decide what's allowed.
  const cm = method.calorieMethod?.value ?? null;
  const e = plan.energy;
  if (e.mode !== "target" && e.kcal) errors.push(`energy.kcal is only given when energy.mode is "target".`);
  if (!numeric && e.mode === "target") errors.push(`The "${plan.approach.id}" approach doesn't use calorie numbers — energy.mode must be "none".`);
  if (cm === "no_calorie_targets" && e.mode !== "none") errors.push(`The coach doesn't set calorie targets — energy.mode must be "none".`);
  if (cm === "current_intake" && e.mode === "target") errors.push(`The coach sets calories from current intake, which isn't known — energy.mode must be "baseline_first", with how to establish it.`);
  if (numeric && (cm === "formula" || cm === "adaptive_trend") && e.mode !== "target") errors.push(`The coach sets calorie targets (${cm.replace(/_/g, " ")}) — give energy.mode "target" with a kcal range inside ${b.energyKcal ? `${b.energyKcal[0]}–${b.energyKcal[1]}` : "the bounds"}.`);
  if (e.mode === "target") {
    if (!e.kcal) errors.push(`energy.kcal is required when energy.mode is "target".`);
    else if (!b.energyKcal) errors.push("OPTIM couldn't compute energy bounds for this client — energy.mode can't be \"target\".");
    else {
      if (!within(e.kcal, b.energyKcal[0], b.energyKcal[1], 25)) errors.push(`energy.kcal ${fmt(e.kcal)} is outside OPTIM's bounds ${b.energyKcal[0]}–${b.energyKcal[1]} (${b.energyRule}).`);
      if (e.kcal.max - e.kcal.min > 300) errors.push(`energy.kcal ${fmt(e.kcal)} is wider than 300 kcal — narrow it to a usable target range.`);
      if (b.floorKcal !== null && e.kcal.min < b.floorKcal) errors.push(`energy.kcal ${fmt(e.kcal)} goes below predicted resting expenditure (${b.floorKcal} kcal).`);
    }
  }

  // Training / rest days — the coach's strategy, only with an energy target.
  const dv = plan.dayVariation;
  if (dv) {
    const coachStrategy = method.trainingRest?.value ?? null;
    if (coachStrategy && dv.strategy !== coachStrategy) errors.push(`dayVariation.strategy "${dv.strategy}" isn't the coach's (${coachStrategy}).`);
    if (!coachStrategy && dv.strategy !== "identical_every_day") errors.push("The coach set no training/rest-day strategy — use identical_every_day or omit dayVariation.");
    if (e.mode !== "target" && (dv.trainingDayKcal || dv.restDayKcal)) errors.push("Training/rest-day kcal need an energy target.");
    if (dv.trainingDayKcal && dv.restDayKcal && dv.trainingDayKcal.min < dv.restDayKcal.min) errors.push("Training-day energy can't be below rest-day energy.");
    if (dv.strategy === "same_calories_shift_carbs" && (dv.trainingDayKcal || dv.restDayKcal) && e.kcal && [dv.trainingDayKcal, dv.restDayKcal].some((x) => x && (Math.abs(x.min - e.kcal!.min) > 25 || Math.abs(x.max - e.kcal!.max) > 25))) errors.push("The coach keeps calories the same on training and rest days (carbs shift) — day kcal must equal the energy target.");
    for (const x of [dv.trainingDayKcal, dv.restDayKcal]) if (x && b.floorKcal !== null && x.min < b.floorKcal) errors.push(`A day target (${fmt(x)}) goes below predicted resting expenditure (${b.floorKcal} kcal).`);
  }

  // Protein — the coach's basis and amount, as OPTIM computed them.
  const pg = plan.protein.grams;
  if (!numeric && pg) errors.push(`The "${plan.approach.id}" approach doesn't use gram targets — protein.g must be null (guide protein through meals and portions).`);
  if (numeric && !method.protein && pg) errors.push("The coach doesn't set a protein target — protein.g must be null.");
  if (numeric && method.protein && b.proteinG && !pg) errors.push(`Give protein.g inside the coach's ${b.proteinG[0]}–${b.proteinG[1]} g/day.`);
  if (pg && b.proteinG && !within(pg, b.proteinG[0], b.proteinG[1], 5)) errors.push(`protein.g ${fmt(pg)} is outside the coach's ${b.proteinG[0]}–${b.proteinG[1]} g/day (${b.proteinBasis}).`);

  // Carbohydrate and fat.
  const cg = plan.carbohydrate.grams;
  const fg = plan.fat.grams;
  if (!numeric && (cg || fg)) errors.push(`The "${plan.approach.id}" approach doesn't use gram targets — carbohydrate.g and fat.g must be null.`);
  if (plan.approach.id === "full_macros" && (!cg || !fg || !pg)) errors.push("Full macro targets need protein.g, carbohydrate.g and fat.g.");
  if (pg && cg && fg && e.kcal) {
    const lo = 4 * pg.min + 4 * cg.min + 9 * fg.min;
    const hi = 4 * pg.max + 4 * cg.max + 9 * fg.max;
    if (hi < e.kcal.min * 0.92 || lo > e.kcal.max * 1.08) errors.push(`Macros add up to ${Math.round(lo)}–${Math.round(hi)} kcal, inconsistent with energy ${fmt(e.kcal)} (4/4/9 kcal per g).`);
  }
  if (fg && e.kcal && fg.min * 9 < e.kcal.min * 0.15) errors.push(`fat.g ${fmt(fg)} puts fat below 15% of energy — under what the evidence supports (concept.nutrition.dietary_fat).`);
  if (fg && params.weightKg && (params.goal === "hypertrophy" || params.goal === "weight_gain") && fg.min < params.weightKg * 0.5 - 2) errors.push(`fat.g ${fmt(fg)} is below ~0.5 g/kg while gaining (concept.nutrition.dietary_fat#fat.gaining).`);

  // Meals — the coach's range, every slot with an intent and real food ids.
  const m = plan.meals;
  const mr = method.mealsPerDay?.value;
  if (mr && (m.perDay < mr.min || m.perDay > mr.max)) errors.push(`meals.perDay ${m.perDay} is outside the coach's ${mr.min}–${mr.max}.`);
  if (m.slots.length !== m.perDay) errors.push(`meals.slots lists ${m.slots.length} meals but perDay is ${m.perDay}.`);
  const foodErr = (id: string, where: string) => {
    if (allowed.foods.has(id)) return;
    errors.push(food(id) ? `${where} uses ${id}, which the client's restrictions exclude.` : `${where} uses "${id}", which isn't in the food list.`);
  };
  for (const [i, s] of m.slots.entries()) {
    for (const id of s.foods) foodErr(id, `meals.slots[${i}]`);
    const named = s.foods.map((id) => food(id)?.name.toLowerCase()).filter((n): n is string => !!n);
    if (s.intent.trim().length < 12 || named.filter((n) => s.intent.toLowerCase().includes(n.split(" (")[0])).length >= 2) errors.push(`meals.slots[${i}].intent must say WHY the meal exists (timing, role, practicality) — not list its foods.`);
    if (/\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(s.timing)) errors.push(`meals.slots[${i}].timing names a clock time OPTIM doesn't know — time it relative to the day or training.`);
  }
  for (const id of plan.foods.emphasize) foodErr(id, "foods.emphasize");
  for (const [i, s] of plan.foods.substitutions.entries()) {
    foodErr(s.for, `foods.substitutions[${i}].for`);
    const from = food(s.for);
    for (const id of s.use) {
      foodErr(id, `foods.substitutions[${i}].use`);
      const to = food(id);
      if (from && to && !to.roles.some((r) => from.roles.includes(r))) errors.push(`foods.substitutions[${i}]: ${to.name} doesn't play the same role as ${from.name}.`);
    }
  }

  // Supplements — only as the coach's stance allows.
  const stance = method.supplements?.value ?? null;
  if (plan.supplements.length && (!stance || stance === "outside_scope")) errors.push(stance ? "Supplements are outside this coach's scope — recommend none." : "The coach hasn't said whether they advise on supplements — recommend none.");
  if (stance === "food_first_basics") for (const s of plan.supplements) if (!/\b(protein( powder)?|whey|casein|pea protein|creatine)\b/i.test(s.name)) errors.push(`"${s.name}" isn't a basic (protein powder or creatine) — this coach is food first.`);

  // Language and topics the coach won't advise on.
  const all = texts(plan).join(" \n ");
  for (const [re, what] of FORBIDDEN) {
    const hit = re.exec(all);
    if (hit) errors.push(`Uses ${what} ("${hit[0]}") — never part of an OPTIM strategy.`);
  }
  for (const topic of method.wontAdvise.value) if (topic.trim().length > 2 && all.toLowerCase().includes(topic.trim().toLowerCase())) errors.push(`Mentions "${topic}", which this coach doesn't advise on.`);

  // Monitoring and adjustments — the coach's measures, threshold and levers.
  const mo = plan.monitoring;
  if (allowed.measures.size) for (const x of mo.measures) if (!allowed.measures.has(x)) errors.push(`Measure "${x}" isn't one this coach uses (${[...allowed.measures].join(", ")}).`);
  if (!mo.measures.length) errors.push("monitoring.measures must name how progress is judged.");
  const th = method.dataThresholdWeeks?.value;
  if (th && (mo.reviewAfterWeeks < th.min || mo.reviewAfterWeeks > (th.max ?? th.min))) errors.push(`monitoring.reviewAfterWeeks ${mo.reviewAfterWeeks} is outside the coach's ${th.min}–${th.max} weeks of data before a change.`);
  for (const [i, a] of plan.adjustments.entries()) {
    if (a.lever !== "none" && allowed.levers.size && !allowed.levers.has(a.lever)) errors.push(`adjustments[${i}].lever "${a.lever}" isn't one of the coach's levers (${[...allowed.levers].join(", ")}).`);
    if (th && a.afterWeeks < th.min) errors.push(`adjustments[${i}] acts after ${a.afterWeeks} week(s) — the coach wants at least ${th.min} weeks of data.`);
    if (ri.safety.minor && /\b(reduc|cut|lower|deficit|decreas)\w*\b/i.test(a.change) && /\b(calor|kcal|intake|food|carb|fat)\w*/i.test(a.change)) errors.push(`adjustments[${i}] reduces intake for a minor — not allowed.`);
  }
  if (!plan.adjustments.length && e.mode === "target") errors.push("An energy target needs at least one adjustment rule (signal, weeks, lever, change).");

  // Provenance — namespaced citations, and the decisions a coach will question.
  for (const d of plan.decisions) errors.push(...citationErrors("coach", d.coachRuleKeys, allowed), ...citationErrors("client", d.clientFactRefs, allowed), ...citationErrors("evidence", d.knowledgeRefs, allowed));
  const topics = new Set(plan.decisions.map((d) => d.topic));
  for (const t of ["objective", "energy", "meal_structure", "monitoring", ...(pg ? ["protein"] : [])]) if (!topics.has(t as never)) errors.push(`decisions must explain the ${t.replace(/_/g, " ")} decision.`);

  // Quality (non-blocking): where the coach's method and the evidence diverge, the coach should see it.
  if (pg && params.weightKg) {
    const perKg = pg.min / params.weightKg;
    if ((params.goal === "hypertrophy" || params.goal === "weight_gain" || params.goal === "strength") && perKg < 1.4) quality.push({ code: "protein_below_evidence", severity: "warning", message: `Protein starts at ${perKg.toFixed(2)} g/kg — below the 1.4–2.0 g/kg the ISSN position supports for building muscle (the coach's range allows it).` });
  }
  const rate = method.rate?.value;
  if (params.goal === "fat_loss" && rate && rate.max > 1) quality.push({ code: "rate_above_evidence", severity: "warning", message: `The coach's loss rate reaches ${rate.max}%/week — above the 0.5–1%/week recommended to retain muscle.` });
  if (plan.decisions.some((d) => !d.coachRuleKeys.length && !d.clientFactRefs.length && !d.knowledgeRefs.length)) quality.push({ code: "unattributed_decision", severity: "warning", message: "A decision cites no coach rule, client fact or evidence." });
  return { ok: errors.length === 0, errors, quality };
}
