// Nutrition Reasoner V1 — the safety gate. Deterministic, BEFORE any model call.
//
// ESCALATE (no strategy is prepared; the coach decides, usually with a qualified professional): pregnancy or
// breastfeeding, possible disordered eating, medical nutrition needs (named conditions, glucose-lowering or
// appetite-altering medication, bariatric surgery), a minor with a weight-change goal, a fat-loss goal while
// underweight, or a goal weight that would be underweight. Population entries: knowledge/nutrition/concepts.ts.
//
// CONSERVATIVE (a strategy may be prepared, with tighter rails): a minor without a weight goal (no deficit, ever),
// a safety-screen answer about medication or a condition (coach confirms with the client's provider).
//
// SCREENING (always): OPTIM's intake doesn't ask about pregnancy, disordered eating or medical diets, so every
// proposal carries those confirmations for the coach — the absence of a red flag is not proof there is none.

import { isKnown, type Fact } from "../facts.ts";
import type { ClientState } from "../client-state.ts";
import type { GoalContract } from "../goal-contract.ts";

export interface SafetyEscalation {
  code: "pregnancy_lactation" | "disordered_eating" | "medical_nutrition" | "minor_weight_goal" | "underweight_fat_loss" | "underweight_goal_weight";
  population: string;
  why: string;
}

export interface NutritionSafety {
  escalations: SafetyEscalation[];
  minor: boolean;
  bmi: number | null;
  warnings: string[];
  /** Confirmations the coach makes before approving anything (never blocking on their own). */
  screening: string[];
}

const PATTERNS: Array<[SafetyEscalation["code"], string, RegExp]> = [
  ["pregnancy_lactation", "population.nutrition.pregnancy_lactation", /\b(pregnan\w*|expecting a baby|breast ?feeding|breastfeed\w*|lactat\w*|postpartum|post-partum|nursing (my|a) (baby|infant))\b/i],
  ["disordered_eating", "population.nutrition.disordered_eating", /\b(eating disorder|disordered eating|anorexi\w*|bulimi\w*|binge[- ]eat\w*|purg\w*|orthorexi\w*|arfid|laxatives?|starv\w*|ed recovery)\b/i],
  ["medical_nutrition", "population.nutrition.medical", /\b(diabet\w*|insulin|metformin|kidney disease|renal|ckd|dialysis|bariatric|gastric (bypass|sleeve)|phenylketon\w*|pku|liver disease|cirrhosis|crohn'?s|colitis|ibd|gout|heart failure|warfarin|glp-?1|semaglutide|ozempic|wegovy|tirzepatide|mounjaro|zepbound)\b/i],
];

/** Every free-text field the client or coach wrote that could carry a red flag. */
function texts(c: ClientState, g: GoalContract): string[] {
  const out: string[] = [];
  const push = (f: Fact<string>) => {
    if (isKnown(f) && f.value.trim()) out.push(f.value);
  };
  const dr = isKnown(c.nutrition.dietaryRestrictions) ? c.nutrition.dietaryRestrictions.value.detail : null;
  if (dr) out.push(dr);
  for (const f of [c.health.restrictions, c.health.aggravatingFactors, c.health.bodyAreaOther, c.health.review.coachDocumentedLimitation, c.goals.primaryOther, c.goals.successDefinition, c.schedule.notes, c.training.notes, g.successDefinition]) push(f);
  return out;
}

export function nutritionSafety(c: ClientState, g: GoalContract): NutritionSafety {
  const escalations: SafetyEscalation[] = [];
  const warnings: string[] = [];
  const all = texts(c, g).join(" \n ");
  for (const [code, population, re] of PATTERNS) {
    const m = re.exec(all);
    if (m) escalations.push({ code, population, why: `The client's answers mention “${m[0]}”. ${code === "pregnancy_lactation" ? "Nutrition during pregnancy or breastfeeding is individualized by the client's healthcare provider" : code === "disordered_eating" ? "A possible history of disordered eating makes restriction-focused targets potentially harmful" : "This may change nutrition needs in ways that need medical nutrition guidance"} — OPTIM prepares no nutrition strategy until the coach has reviewed it.` });
  }
  const age = isKnown(c.body.age) ? c.body.age.value : null;
  const minor = age !== null && age < 18;
  const goal = g.primary?.class ?? null;
  const weightGoal = goal === "fat_loss" || goal === "weight_gain" || goal === "recomposition" || isKnown(c.goals.targetWeightLb);
  if (minor && weightGoal) escalations.push({ code: "minor_weight_goal", population: "population.nutrition.minor", why: `The client is ${age}. A weight-change goal for someone under 18 needs individualized professional guidance; OPTIM never sets energy targets for it.` });

  const lb = isKnown(c.body.weightLb) ? c.body.weightLb.value : null;
  const inches = isKnown(c.body.heightInches) ? c.body.heightInches.value : null;
  const bmiOf = (w: number) => (inches ? +((703 * w) / (inches * inches)).toFixed(1) : null);
  const bmi = lb ? bmiOf(lb) : null;
  if (bmi !== null && bmi < 18.5 && (goal === "fat_loss" || goal === "recomposition")) escalations.push({ code: "underweight_fat_loss", population: "population.nutrition.disordered_eating", why: `The client's BMI is about ${bmi} (below 18.5) with a ${goal.replace(/_/g, " ")} goal — OPTIM won't prepare a deficit; the coach reviews first.` });
  const target = isKnown(c.goals.targetWeightLb) ? c.goals.targetWeightLb.value : null;
  const targetBmi = target ? bmiOf(target) : null;
  if (targetBmi !== null && targetBmi < 18.5 && !escalations.some((e) => e.code === "underweight_fat_loss")) escalations.push({ code: "underweight_goal_weight", population: "population.nutrition.disordered_eating", why: `The goal weight (${target} lb) would be a BMI of about ${targetBmi}, below 18.5 — the coach reviews the goal before any targets.` });

  const screen = isKnown(c.health.safetyScreen) ? c.health.safetyScreen.value : [];
  if (screen.includes("medication_condition")) warnings.push("The client reported a medication or medical condition that may affect exercise — confirm it doesn't change nutrition needs before approving.");
  if (screen.includes("advised_limit")) warnings.push("The client was advised to limit exercise — energy needs may be lower than the training plan implies.");
  if (minor) warnings.push(`The client is ${age}: growth needs come first; OPTIM sets no energy deficit.`);

  const sex = isKnown(c.body.sex) ? c.body.sex.value : null;
  const screening = [
    ...(sex !== "male" && (age === null || age <= 55) ? ["Confirm the client isn't pregnant, trying to conceive or breastfeeding — OPTIM's intake doesn't ask."] : []),
    "Confirm there's no history of disordered eating — OPTIM's intake doesn't ask.",
    "Confirm no medical condition, medication or clinician's diet changes nutrition needs — OPTIM's intake doesn't ask about diet-specific conditions.",
  ];
  return { escalations, minor, bmi, warnings, screening };
}
