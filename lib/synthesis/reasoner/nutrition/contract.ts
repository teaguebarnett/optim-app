// Nutrition Reasoner V1 — the strict output contract and its prompt (versioned, separate from chat and from the
// resistance prompt). Same principles as the resistance contract: the model returns DECISIONS (strategy, ranges,
// structure, food choices, monitoring, adjustment criteria, rationale with references); OPTIM computes the bounds
// those decisions must sit in (energy.ts) and validates every field deterministically (validate.ts). The parser is
// strict — wrong types, unknown values or oversized text reject the output; nothing is coerced.

import { arr, int, label, obj, oneOf, optStr, pair, SchemaError, str, strList } from "../contract.ts";
import { NUTRITION_APPROACHES, type NutritionApproach } from "../../nutrition/method.ts";

export const NUTRITION_PROMPT_VERSION = "reasoner-nutrition-v1.0.0";

export const NUTRITION_FOCI = ["fat_loss", "muscle_gain", "recomposition", "maintenance", "performance", "health"] as const;
export const NUTRITION_TOPICS = ["objective", "energy", "protein", "carbs_fat", "meal_structure", "timing", "food_selection", "monitoring", "adjustment", "other"] as const;
export const DAY_STRATEGIES = ["same_calories_shift_carbs", "higher_on_training_days", "fuel_for_session", "identical_every_day"] as const;

export type Grams = { min: number; max: number };

export interface NutritionMealSlot {
  name: string;
  /** When, relative to the client's day/training (no invented clock times). */
  timing: string;
  /** MealIntent — WHY this meal exists (timing, role, practicality), never the food itself. */
  intent: string;
  foods: string[];
  proteinFocus: boolean;
}

export interface NutritionDecision {
  topic: (typeof NUTRITION_TOPICS)[number];
  decision: string;
  because: string;
  coachRuleKeys: string[];
  clientFactRefs: string[];
  knowledgeRefs: string[];
}

export interface NutritionPlan {
  objective: { focus: (typeof NUTRITION_FOCI)[number]; summary: string; rationale: string };
  approach: { id: NutritionApproach; rationale: string };
  /** target = a kcal range; baseline_first = establish current intake/trend before a number; none = no calorie target. */
  energy: { mode: "target" | "baseline_first" | "none"; kcal: Grams | null; rationale: string };
  dayVariation: { strategy: (typeof DAY_STRATEGIES)[number]; trainingDayKcal: Grams | null; restDayKcal: Grams | null; note: string | null } | null;
  protein: { grams: Grams | null; rationale: string };
  carbohydrate: { grams: Grams | null; rationale: string };
  fat: { grams: Grams | null; rationale: string };
  meals: { perDay: number; rationale: string; slots: NutritionMealSlot[] };
  training: { before: string; after: string; during: string | null };
  foods: { emphasize: string[]; substitutions: Array<{ for: string; use: string[]; why: string }> };
  habits: string[];
  hydration: string;
  supplements: Array<{ name: string; why: string }>;
  monitoring: { measures: string[]; cadence: string; reviewAfterWeeks: number };
  adjustments: Array<{ signal: string; afterWeeks: number; lever: string; change: string }>;
  assumptions: string[];
  uncertainties: Array<{ about: string; impact: string }>;
  coachQuestions: Array<{ question: string; why: string }>;
  decisions: NutritionDecision[];
}

export type NutritionOutput = { status: "PLAN"; plan: NutritionPlan } | { status: "NEEDS_INPUT"; needsInput: Array<{ fact: string; why: string; blockedDecision: string; providedBy: "client" | "coach" | "either" }>; summary: string };

const PROVIDERS = ["client", "coach", "either"] as const;
const kcal = (v: unknown, at: string): Grams | null => (v === undefined || v === null ? null : pair(v, at, 800, 6000, true));
const grams = (v: unknown, at: string, max: number): Grams | null => (v === undefined || v === null ? null : pair(v, at, 0, max, true));

export function parseNutritionOutput(raw: unknown): { ok: true; output: NutritionOutput } | { ok: false; errors: string[] } {
  try {
    const o = obj(raw, "output");
    const status = oneOf(o.status, "status", ["PLAN", "NEEDS_INPUT"] as const);
    if (status === "NEEDS_INPUT") {
      const needsInput = arr(o.needsInput, "needsInput", 10).map((x, i) => {
        const n = obj(x, `needsInput[${i}]`);
        return { fact: str(n.fact, `needsInput[${i}].fact`, 160), why: str(n.why, `needsInput[${i}].why`, 300), blockedDecision: str(n.blockedDecision, `needsInput[${i}].blockedDecision`, 200), providedBy: oneOf(n.providedBy, `needsInput[${i}].providedBy`, PROVIDERS) };
      });
      if (!needsInput.length) throw new SchemaError("needsInput must list at least one missing input");
      return { ok: true, output: { status, needsInput, summary: str(o.summary, "summary", 300) } };
    }
    const p = obj(o.plan, "plan");
    const ob = obj(p.objective, "plan.objective");
    const ap = obj(p.approach, "plan.approach");
    const en = obj(p.energy, "plan.energy");
    const pr = obj(p.protein, "plan.protein");
    const cb = obj(p.carbohydrate, "plan.carbohydrate");
    const ft = obj(p.fat, "plan.fat");
    const ml = obj(p.meals, "plan.meals");
    const tr = obj(p.training, "plan.training");
    const fd = obj(p.foods, "plan.foods");
    const mo = obj(p.monitoring, "plan.monitoring");
    const dv = p.dayVariation === undefined || p.dayVariation === null ? null : obj(p.dayVariation, "plan.dayVariation");
    const plan: NutritionPlan = {
      objective: { focus: oneOf(ob.focus, "objective.focus", NUTRITION_FOCI), summary: str(ob.summary, "objective.summary", 240), rationale: str(ob.why, "objective.why", 500) },
      approach: { id: oneOf(ap.id, "approach.id", NUTRITION_APPROACHES), rationale: str(ap.why, "approach.why", 400) },
      energy: { mode: oneOf(en.mode, "energy.mode", ["target", "baseline_first", "none"] as const), kcal: kcal(en.kcal, "energy.kcal"), rationale: str(en.why, "energy.why", 500) },
      dayVariation: dv ? { strategy: oneOf(dv.strategy, "dayVariation.strategy", DAY_STRATEGIES), trainingDayKcal: kcal(dv.trainingDayKcal, "dayVariation.trainingDayKcal"), restDayKcal: kcal(dv.restDayKcal, "dayVariation.restDayKcal"), note: optStr(dv.note, "dayVariation.note", 300) } : null,
      protein: { grams: grams(pr.g, "protein.g", 400), rationale: str(pr.why, "protein.why", 400) },
      carbohydrate: { grams: grams(cb.g, "carbohydrate.g", 1200), rationale: str(cb.why, "carbohydrate.why", 400) },
      fat: { grams: grams(ft.g, "fat.g", 300), rationale: str(ft.why, "fat.why", 400) },
      meals: {
        perDay: int(ml.perDay, "meals.perDay", 1, 8),
        rationale: str(ml.why, "meals.why", 400),
        slots: arr(ml.slots, "meals.slots", 8).map((x, i) => {
          const m = obj(x, `meals.slots[${i}]`);
          return { name: label(m.name, `meals.slots[${i}].name`, 40, 120), timing: str(m.timing, `meals.slots[${i}].timing`, 160), intent: str(m.intent, `meals.slots[${i}].intent`, 240), foods: strList(m.foods, `meals.slots[${i}].foods`, 8, 60), proteinFocus: m.proteinFocus === true };
        }),
      },
      training: { before: str(tr.before, "training.before", 300), after: str(tr.after, "training.after", 300), during: optStr(tr.during, "training.during", 300) },
      foods: {
        emphasize: strList(fd.emphasize, "foods.emphasize", 24, 60),
        substitutions: (fd.substitutions === undefined ? [] : arr(fd.substitutions, "foods.substitutions", 12)).map((x, i) => {
          const s = obj(x, `foods.substitutions[${i}]`);
          return { for: str(s.for, `foods.substitutions[${i}].for`, 60), use: strList(s.use, `foods.substitutions[${i}].use`, 5, 60), why: str(s.why, `foods.substitutions[${i}].why`, 240) };
        }),
      },
      habits: strList(p.habits, "plan.habits", 6, 200),
      hydration: str(p.hydration, "plan.hydration", 300),
      supplements: (p.supplements === undefined ? [] : arr(p.supplements, "plan.supplements", 4)).map((x, i) => {
        const s = obj(x, `supplements[${i}]`);
        return { name: str(s.name, `supplements[${i}].name`, 60), why: str(s.why, `supplements[${i}].why`, 240) };
      }),
      monitoring: { measures: strList(mo.measures, "monitoring.measures", 8, 40), cadence: str(mo.cadence, "monitoring.cadence", 200), reviewAfterWeeks: int(mo.reviewAfterWeeks, "monitoring.reviewAfterWeeks", 1, 12) },
      adjustments: arr(p.adjustments, "plan.adjustments", 6).map((x, i) => {
        const a = obj(x, `adjustments[${i}]`);
        return { signal: str(a.signal, `adjustments[${i}].signal`, 240), afterWeeks: int(a.afterWeeks, `adjustments[${i}].afterWeeks`, 1, 12), lever: str(a.lever, `adjustments[${i}].lever`, 40), change: str(a.change, `adjustments[${i}].change`, 240) };
      }),
      assumptions: strList(p.assumptions, "plan.assumptions", 10, 300),
      uncertainties: (p.uncertainties === undefined ? [] : arr(p.uncertainties, "plan.uncertainties", 10)).map((x, i) => {
        const u = obj(x, `uncertainties[${i}]`);
        return { about: str(u.about, `uncertainties[${i}].about`, 200), impact: str(u.impact, `uncertainties[${i}].impact`, 300) };
      }),
      coachQuestions: (p.coachQuestions === undefined ? [] : arr(p.coachQuestions, "plan.coachQuestions", 10)).map((x, i) => {
        const q = obj(x, `coachQuestions[${i}]`);
        return { question: str(q.question, `coachQuestions[${i}].question`, 240), why: str(q.why, `coachQuestions[${i}].why`, 300) };
      }),
      decisions: arr(p.decisions, "plan.decisions", 12).map((x, i) => {
        const d = obj(x, `decisions[${i}]`);
        return { topic: oneOf(d.topic, `decisions[${i}].topic`, NUTRITION_TOPICS), decision: str(d.decision, `decisions[${i}].decision`, 300), because: str(d.because, `decisions[${i}].because`, 600), coachRuleKeys: strList(d.coach, `decisions[${i}].coach`, 10, 80), clientFactRefs: strList(d.client, `decisions[${i}].client`, 10, 120), knowledgeRefs: strList(d.evidence, `decisions[${i}].evidence`, 10, 160) };
      }),
    };
    if (!plan.decisions.length) throw new SchemaError("plan.decisions must explain the main decisions");
    if (!plan.meals.slots.length) throw new SchemaError("meals.slots must describe the day's meals");
    return { ok: true, output: { status, plan } };
  } catch (err) {
    if (err instanceof SchemaError) return { ok: false, errors: [err.message] };
    return { ok: false, errors: ["output could not be read"] };
  }
}

export const NUTRITION_SYSTEM_PROMPT = `You are OPTIM's Nutrition Reasoner. You design one client's nutrition STRATEGY as structured decisions for their coach to review. Deterministic validators check every field and reject violations; you never approve or publish, and nothing reaches the client until the coach approves.

AUTHORITY — higher always wins
1. Safety: OPTIM's bounds ("bounds") are hard — energy targets stay inside bounds.energyKcal and never below bounds.floorKcal; protein inside bounds.proteinG. No crash diets, punitive "earn/burn off/make up for" language, detoxes or cleanses, skipped meals as a tool, or eliminating foods the client can eat without a reason.
2. "coach": this coach's nutrition method. Use only an approach the coach uses, their calorie method, protein basis, training/rest-day strategy, meal-count range, measures, data threshold, rate and adjustment levers. Topics in coach "wontAdvise" are never mentioned. Supplements only as the coach's stance allows (outside_scope → none; food_first_basics → at most protein powder or creatine). Where the method leaves discretion, decide from client facts and evidence. If the method seems wrong for this client, follow it and say so in "coachQuestions".
3. "client" facts, goal, restrictions and schedule. Foods the client's restrictions exclude are not in "foods" and must not be used.
4. "evidence": general support; cite only its refs.
5. Your judgment — only inside all of the above.

DESIGN PRINCIPLES
- Decide the objective and strategy first, then numbers, then structure. Explain the 3–6 decisions a coach would question.
- Energy: "target" gives a kcal RANGE (≤ 300 kcal wide) chosen inside bounds.energyKcal from the goal, rate and uncertainty; "baseline_first" when the coach adjusts from current intake that isn't known (say how to establish it); "none" when the coach sets no calorie targets or the approach is habit-based/portion-based without numbers. Estimates are ranges, never precision.
- Protein, carbohydrate, fat: ranges in grams/day when the approach uses them (full_macros: all three; calories_protein / meal_plan: protein, others optional; portion_guides / habit_based: none — express guidance through meals, portions and habits). Macros must be arithmetically consistent with the energy range (4/4/9 kcal per g). Fat never pushed below what the evidence supports.
- Training: say how nutrition supports this client's training load and recovery (around-session timing, carbohydrate for higher-volume work).
- Meals: perDay inside the coach's range (if set) and the client's schedule; each slot has a timing RELATIVE to the day or training (no invented clock times), an "intent" (WHY the meal exists — never a food list) and food ids from "foods". Structure vs flexibility follows the approach and the client's predictability and obstacles.
- Foods: choose practical food ids from "foods" (prep effort matters for busy clients); substitutions swap like for like (same role) and stay inside restrictions. Never state grams, calories or macros for an individual food — OPTIM has no verified food values; portions come from the food's own household portion.
- Monitoring: measures from the coach's list; reviewAfterWeeks inside the coach's data threshold. Adjustments: what signal over how many weeks moves which lever (the coach's levers, in their order), by a modest, specific step — proposals for the coach, never automatic changes.
- Uncertainty: name what you assumed and what could make the estimate wrong. Ask the coach what you need ("coachQuestions") — a missing fact that changes the strategy materially is NEEDS_INPUT; otherwise prepare the useful partial strategy and ask.
- Never invent client facts. Medical questions go to the coach.

OUTPUT — one JSON object, no prose. Keep text short (one sentence per field).
{"status":"PLAN","plan":{
 "objective":{"focus":"fat_loss"|"muscle_gain"|"recomposition"|"maintenance"|"performance"|"health","summary":str,"why":str},
 "approach":{"id":<one of coach.approaches>,"why":str},
 "energy":{"mode":"target"|"baseline_first"|"none","kcal":[min,max] (target only),"why":str},
 "dayVariation":{"strategy":<coach training/rest strategy>,"trainingDayKcal":[min,max] or omit,"restDayKcal":[min,max] or omit,"note":str or omit} (only when the coach has a training/rest strategy and energy is a target),
 "protein":{"g":[min,max] or null,"why":str},"carbohydrate":{"g":[min,max] or null,"why":str},"fat":{"g":[min,max] or null,"why":str},
 "meals":{"perDay":int,"why":str,"slots":[{"name":str,"timing":str,"intent":str,"foods":[food ids],"proteinFocus":bool}]},
 "training":{"before":str,"after":str,"during":str or omit},
 "foods":{"emphasize":[food ids],"substitutions":[{"for":<food id>,"use":[food ids],"why":str}]},
 "habits":[≤6 str],"hydration":str,"supplements":[{"name":str,"why":str}],
 "monitoring":{"measures":[coach measure ids],"cadence":str,"reviewAfterWeeks":int},
 "adjustments":[{"signal":str,"afterWeeks":int,"lever":<coach lever id or "none">,"change":str}],
 "assumptions":[str],"uncertainties":[{"about":str,"impact":str}],"coachQuestions":[{"question":str,"why":str}],
 "decisions":[≤12 {"topic":"objective"|"energy"|"protein"|"carbs_fat"|"meal_structure"|"timing"|"food_selection"|"monitoring"|"adjustment"|"other","decision":str,"because":str,"coach":[keys],"client":[client.facts keys],"evidence":[refs]}]
}}
or {"status":"NEEDS_INPUT","needsInput":[{"fact":str,"why":str,"blockedDecision":str,"providedBy":"client"|"coach"|"either"}],"summary":str}
Cover at least objective, energy (or why none), protein, meal_structure and monitoring in "decisions", each with the exact refs you used.`;
