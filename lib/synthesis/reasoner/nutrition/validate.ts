// Nutrition Reasoner V1 — deterministic validation. Errors reject the output (and become the one repair attempt's
// feedback); quality findings never block but go to the coach. Every rule enforces something OPTIM can know:
// the coach's method, OPTIM's computed bounds, the client's restrictions, the safety doctrine, provenance.

import { citationErrors } from "../expand.ts";
import { food } from "../../knowledge/nutrition/foods.ts";
import type { NutritionMethod } from "../../nutrition/method.ts";
import type { NutritionAllowed, NutritionReasoningInput } from "./input.ts";
import { macroTolerance } from "./input.ts";
import type { AdjustmentDirection, Grams, NutritionPlan } from "./contract.ts";

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
const mid = (r: Grams) => (r.min + r.max) / 2;
const pct = (r: Grams) => `${r.min > 0 ? "+" : ""}${r.min.toFixed(2)} to ${r.max > 0 ? "+" : ""}${r.max.toFixed(2)}`;

/** What each lever can mean for ENERGY INTAKE (calibration lever vocabularies). The structure is the meaning: a lever
 * that only adds intake can never carry a decrease, whatever the explanation says. */
export const LEVER_DIRECTIONS: Record<string, AdjustmentDirection[]> = {
  calories: ["increase", "decrease"],
  add_calories: ["increase"],
  calorie_dense: ["increase", "none"],
  habits: ["none"],
  steps: ["none"],
  cardio: ["none"],
  training_volume: ["none"],
  reduce_activity: ["none"],
  appetite_adherence: ["none"],
  none: ["none"],
};
/** Largest single adjustment step OPTIM accepts (kcal/day) — "modest, specific steps". */
export const MAX_ADJUSTMENT_KCAL = 500;

/** The coach-facing meaning of an adjustment, rendered from its STRUCTURE (never from the model's wording). */
export function adjustmentSummary(a: NutritionPlan["adjustments"][number], kcal: Grams | null): string {
  if (a.direction === "none") return `No change to energy intake (lever: ${a.lever.replace(/_/g, " ")}).`;
  const verb = a.direction === "increase" ? "Increase" : "Decrease";
  if (!a.kcal) return `${verb} intake (lever: ${a.lever.replace(/_/g, " ")}) — by portion, not a kcal amount.`;
  const after = kcal ? (a.direction === "increase" ? ` → about ${kcal.min + a.kcal.min}–${kcal.max + a.kcal.max} kcal` : ` → about ${kcal.min - a.kcal.max}–${kcal.max - a.kcal.min} kcal`) : "";
  return `${verb} intake by ${a.kcal.min}–${a.kcal.max} kcal/day${after} (lever: ${a.lever.replace(/_/g, " ")}).`;
}
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

/**
 * errors       — contract, coach-method, numeric and provenance violations: the output is rejected (repair feedback).
 * restrictions — for a client under 18, anything restrictive (a fat-loss focus, energy below their own central
 *                maintenance, any intake decrease). OPTIM never prescribes these autonomously: they are repair
 *                feedback while attempts remain, and otherwise route the proposal to qualified human review.
 * quality      — never blocks; shown to the coach.
 */
export function validateNutritionPlan(params: { plan: NutritionPlan; reasoning: NutritionReasoningInput; allowed: NutritionAllowed; method: NutritionMethod; weightKg: number | null; goal: string | null }): { ok: boolean; errors: string[]; restrictions: string[]; quality: NutritionQualityFinding[] } {
  const { plan, reasoning: ri, allowed, method } = params;
  const errors: string[] = [];
  const restrictions: string[] = [];
  const minor = ri.safety.minor;
  const noDeficit = ri.bounds.minorNoDeficitKcal;
  const FLOOR_NOTE = "a minimum OPTIM never crosses — not evidence that a target is safe";
  const quality: NutritionQualityFinding[] = [];
  const b = ri.bounds;
  const numeric = NUMERIC_APPROACHES.has(plan.approach.id);

  // Approach — only one the coach uses.
  if (!allowed.approaches.has(plan.approach.id)) errors.push(`Approach "${plan.approach.id}" isn't one this coach uses (${[...allowed.approaches].join(", ")}).`);

  // Objective follows the goal.
  const expected: Record<string, string[]> = { fat_loss: ["fat_loss"], weight_gain: ["muscle_gain"], hypertrophy: ["muscle_gain"], recomposition: ["recomposition"], maintenance: ["maintenance", "health"], strength: ["muscle_gain", "performance", "maintenance"], endurance: ["performance"], event_performance: ["performance"], sport_performance: ["performance"], general_fitness: ["health", "maintenance"] };
  if (params.goal && expected[params.goal] && !expected[params.goal].includes(plan.objective.focus)) errors.push(`Objective "${plan.objective.focus}" doesn't match the client's ${params.goal.replace(/_/g, " ")} goal (expected ${expected[params.goal].join(" or ")}).`);
  if (minor && plan.objective.focus === "fat_loss") restrictions.push("A fat-loss focus for a client under 18.");

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
      if (b.floorKcal !== null && e.kcal.min < b.floorKcal) errors.push(`energy.kcal ${fmt(e.kcal)} goes below predicted resting expenditure (${b.floorKcal} kcal — ${FLOOR_NOTE}).`);
    }
  }

  if (minor && noDeficit !== null && e.kcal && e.kcal.min < noDeficit) restrictions.push(`Energy ${fmt(e.kcal)} kcal reaches below this client's central maintenance estimate (~${noDeficit} kcal) — a deficit for a client under 18.`);

  // Weight-change rate — OPTIM's calculation from the chosen energy, not the model's arithmetic.
  const directional = params.goal === "fat_loss" || params.goal === "weight_gain" || params.goal === "hypertrophy";
  const coachRate = method.rate?.value ?? null;
  const signedCoach = coachRate ? (params.goal === "fat_loss" ? { min: -coachRate.max, max: -coachRate.min } : { min: coachRate.min, max: coachRate.max }) : null;
  let implied: Grams | null = null;
  if (e.mode === "target" && e.kcal && b.centralMaintenanceKcal && b.kcalPerPctPerWeek) {
    implied = { min: +((e.kcal.min - b.centralMaintenanceKcal) / b.kcalPerPctPerWeek).toFixed(2), max: +((e.kcal.max - b.centralMaintenanceKcal) / b.kcalPerPctPerWeek).toFixed(2) };
    if (!e.rate && directional) errors.push(`Give energy.rate (% bodyweight/week, negative = loss): ${fmt(e.kcal)} kcal against central maintenance ~${b.centralMaintenanceKcal} kcal is ${pct(implied)}%/week (${b.kcalPerPctPerWeek} kcal/day ≈ 1%/week).`);
    if (e.rate && Math.abs(mid(e.rate) - mid(implied)) > 0.15) errors.push(`energy.rate ${pct(e.rate)}%/week doesn't match the energy target: ${fmt(e.kcal)} kcal against central maintenance ~${b.centralMaintenanceKcal} kcal is ${pct(implied)}%/week (${b.kcalPerPctPerWeek} kcal/day ≈ 1%/week).`);
  }
  if (e.rate && signedCoach && (e.rate.min < signedCoach.min - 0.05 || e.rate.max > signedCoach.max + 0.05)) errors.push(`energy.rate ${pct(e.rate)}%/week is outside the coach's rate (${pct(signedCoach)}%/week).`);

  // Training / rest days — the coach's strategy, only with an energy target.
  const dv = plan.dayVariation;
  if (dv) {
    const coachStrategy = method.trainingRest?.value ?? null;
    if (coachStrategy && dv.strategy !== coachStrategy) errors.push(`dayVariation.strategy "${dv.strategy}" isn't the coach's (${coachStrategy}).`);
    if (!coachStrategy && dv.strategy !== "identical_every_day") errors.push("The coach set no training/rest-day strategy — use identical_every_day or omit dayVariation.");
    if (e.mode !== "target" && (dv.trainingDayKcal || dv.restDayKcal)) errors.push("Training/rest-day kcal need an energy target.");
    if (dv.trainingDayKcal && dv.restDayKcal && dv.trainingDayKcal.min < dv.restDayKcal.min) errors.push("Training-day energy can't be below rest-day energy.");
    if (dv.strategy === "same_calories_shift_carbs" && (dv.trainingDayKcal || dv.restDayKcal) && e.kcal && [dv.trainingDayKcal, dv.restDayKcal].some((x) => x && (Math.abs(x.min - e.kcal!.min) > 25 || Math.abs(x.max - e.kcal!.max) > 25))) errors.push("The coach keeps calories the same on training and rest days (carbs shift) — day kcal must equal the energy target.");
    for (const x of [dv.trainingDayKcal, dv.restDayKcal]) if (x && b.floorKcal !== null && x.min < b.floorKcal) errors.push(`A day target (${fmt(x)}) goes below predicted resting expenditure (${b.floorKcal} kcal — ${FLOOR_NOTE}).`);
    // Days that differ: the energy range is the WEEKLY average, and the difference is sized to the session's cost.
    const sessions = ri.training ? Math.min(7, ri.training.sessionsPerWeek) : null;
    if ((dv.strategy === "higher_on_training_days" || dv.strategy === "fuel_for_session") && e.mode === "target" && e.kcal) {
      if (!dv.trainingDayKcal || !dv.restDayKcal) errors.push(`The coach's "${dv.strategy}" strategy needs trainingDayKcal and restDayKcal.`);
      else if (sessions !== null && sessions > 0 && sessions < 7) {
        const td = mid(dv.trainingDayKcal);
        const rd = mid(dv.restDayKcal);
        const avg = (sessions * td + (7 - sessions) * rd) / 7;
        if (avg < e.kcal.min - 50 || avg > e.kcal.max + 50) errors.push(`Training and rest days average ${Math.round(avg)} kcal over the week (${sessions} training days) — outside the energy range ${fmt(e.kcal)}, which is the weekly average.`);
        // Worst case across the full ranges: the lowest weekly average the day targets allow.
        const worstAvg = (sessions * dv.trainingDayKcal.min + (7 - sessions) * dv.restDayKcal.min) / 7;
        if (minor && noDeficit !== null && worstAvg < noDeficit) restrictions.push(`Training/rest day targets can average ~${Math.round(worstAvg)} kcal over the week — below this client's central maintenance estimate (~${noDeficit} kcal), a deficit for a client under 18.`);
        if (b.sessionKcal) {
          const lo = Math.round(b.sessionKcal[0] * 0.5);
          const hi = Math.round(b.sessionKcal[1] * 1.25);
          if (td - rd < lo || td - rd > hi) errors.push(`Training days are ${Math.round(td - rd)} kcal above rest days, but one session costs about ${b.sessionKcal[0]}–${b.sessionKcal[1]} kcal above rest (Compendium MET range) — size the difference to the session (${lo}–${hi} kcal).`);
        }
      }
    }
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
  // Macros FIT the energy prescription (not merely overlap it): the minimums together can't total less than the energy
  // minimum and the maximums together can't total more than the energy maximum, within a stated tolerance; and the
  // midpoints agree. Flexibility is trading carbohydrate and fat within the same calories.
  if (pg && e.kcal) {
    const tol = b.macroToleranceKcal ?? macroTolerance(mid(e.kcal));
    if (cg && fg) {
      const lo = 4 * pg.min + 4 * cg.min + 9 * fg.min;
      const hi = 4 * pg.max + 4 * cg.max + 9 * fg.max;
      if (lo < e.kcal.min - tol || hi > e.kcal.max + tol) errors.push(`Macro ranges total ${Math.round(lo)}–${Math.round(hi)} kcal; they must fit inside energy ${fmt(e.kcal)} (±${tol} kcal) — narrow carbohydrate and fat so they trade within the same calories.`);
      const ms = 4 * mid(pg) + 4 * mid(cg) + 9 * mid(fg);
      if (Math.abs(ms - mid(e.kcal)) > tol) errors.push(`Macro midpoints total ${Math.round(ms)} kcal, not the energy midpoint ${Math.round(mid(e.kcal))} kcal (±${tol}).`);
    } else {
      const lo = 4 * pg.min + 4 * (cg?.min ?? 0) + 9 * (fg?.min ?? 0);
      if (lo > e.kcal.max + tol) errors.push(`The given macro minimums alone total ${Math.round(lo)} kcal — above energy ${fmt(e.kcal)}.`);
    }
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
  // Adjustments are validated by their STRUCTURE — lever, direction of energy intake, kcal magnitude — and their
  // numerical effect, never by their wording (V1.1: a reduction worded as "trimming" escaped a word-based rule).
  for (const [i, a] of plan.adjustments.entries()) {
    const at = `adjustments[${i}]`;
    const coachLevers = [...allowed.levers];
    const noCoachLeverFor = (d: AdjustmentDirection) => !coachLevers.some((l) => (LEVER_DIRECTIONS[l] ?? ["increase", "decrease", "none"]).includes(d));
    const genericCalories = a.lever === "calories" && a.direction !== "none" && noCoachLeverFor(a.direction);
    if (a.lever !== "none" && coachLevers.length && !allowed.levers.has(a.lever) && !genericCalories) errors.push(`${at}.lever "${a.lever}" isn't one of the coach's levers (${coachLevers.join(", ")}).`);
    const means = LEVER_DIRECTIONS[a.lever];
    if (means && !means.includes(a.direction)) errors.push(`${at}: lever "${a.lever}" ${means.length === 1 && means[0] === "none" ? "changes no energy intake" : `can only ${means.filter((d) => d !== "none").join(" or ")} intake`} — it can't carry direction "${a.direction}".`);
    if (a.direction === "none" && a.kcal) errors.push(`${at}: direction "none" changes no intake, so it has no kcal amount.`);
    if (a.direction !== "none" && numeric && e.mode === "target" && !a.kcal) errors.push(`${at}: an intake ${a.direction} in a numeric strategy needs "kcal" (per-day amount).`);
    if (a.kcal && a.kcal.max > MAX_ADJUSTMENT_KCAL) errors.push(`${at}: ${fmt(a.kcal)} kcal/day isn't a modest step (max ${MAX_ADJUSTMENT_KCAL}).`);
    // Worst case across the full ranges: a decrease lands at (energy minimum − kcal maximum).
    if (a.direction === "decrease" && a.kcal && e.kcal && !minor) {
      const after = e.kcal.min - a.kcal.max;
      if (b.floorKcal !== null && after < b.floorKcal) errors.push(`${at}: at its worst case (energy minimum ${e.kcal.min} − ${a.kcal.max}) this decrease reaches ~${after} kcal — below predicted resting expenditure (${b.floorKcal} kcal, ${FLOOR_NOTE}). Size kcal so energy minimum − kcal maximum stays at or above it, or use a lever that changes no intake.`);
    }
    // Under 18: no autonomous intake decrease of any size or wording — it goes to qualified human review.
    if (minor && a.direction === "decrease") restrictions.push(`${at} decreases intake for a client under 18 ("${a.change.slice(0, 80)}").`);
    if (th && a.afterWeeks < th.min) errors.push(`${at} acts after ${a.afterWeeks} week(s) — the coach wants at least ${th.min} weeks of data.`);
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
  // Model-written weekly rates in prose are not trusted: any number outside what OPTIM can account for is flagged.
  const kgNow = params.weightKg;
  const known: number[] = [0.25, 0.5, 0.7, 1, 1.4, ...(coachRate ? [coachRate.min, coachRate.max] : []), ...(e.rate ? [Math.abs(e.rate.min), Math.abs(e.rate.max)] : []), ...(implied ? [Math.abs(implied.min), Math.abs(implied.max)] : [])];
  const lo = Math.min(...known) - 0.1;
  const hi = Math.max(...known) + 0.1;
  const stated: number[] = [];
  for (const m of all.matchAll(/(\d+(?:\.\d+)?)\s*(?:[–-]|to)\s*(\d+(?:\.\d+)?)\s*%[^.\n]{0,25}?(?:\/|per |a )\s*(?:wk|week)|(\d+(?:\.\d+)?)\s*%[^.\n]{0,25}?(?:\/|per |a )\s*(?:wk|week)/gi)) stated.push(...[m[1], m[2], m[3]].filter(Boolean).map(Number));
  if (kgNow) for (const m of all.matchAll(/(\d+(?:\.\d+)?)\s*(?:[–-]|to)?\s*(\d+(?:\.\d+)?)?\s*(lb|kg)s?\s*(?:\/|per |a )\s*(?:wk|week)/gi)) for (const v of [m[1], m[2]].filter(Boolean).map(Number)) stated.push(+((m[3].toLowerCase() === "lb" ? v * 0.45359237 : v) / kgNow * 100).toFixed(2));
  const odd = stated.filter((v) => v < lo || v > hi);
  if (odd.length) quality.push({ code: "prose_rate_unverified", severity: "warning", message: `The explanation states weekly rates (${odd.map((v) => `${v}%`).join(", ")}) that don't match OPTIM's calculation${implied ? ` (${pct(implied)}%/week)` : ""} or the coach's rate — rely on OPTIM's estimate.` });
  if (plan.decisions.some((d) => !d.coachRuleKeys.length && !d.clientFactRefs.length && !d.knowledgeRefs.length)) quality.push({ code: "unattributed_decision", severity: "warning", message: "A decision cites no coach rule, client fact or evidence." });
  return { ok: errors.length === 0, errors, restrictions, quality };
}
