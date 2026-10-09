// Cardio Reasoner V1 — the safety gate. Deterministic, BEFORE any model call (population.cardio.*).
//
// ESCALATE (no cardio is prescribed; the coach decides with a qualified professional): pre-participation screen
//   answers for cardiovascular disease/symptoms, chest pain/dizziness/fainting, blood pressure, or advice to limit
//   exercise (concept.cardio.screening); pregnancy; known cardiac/metabolic conditions in the client's own words;
//   a minor with a weight-change goal.
// CONSERVATIVE: a medication or condition that may affect exercise → no vigorous work and no heart-rate targets
//   (some medications change heart rate) until the coach confirms; minors → no vigorous fat-loss conditioning.

import { isKnown, type Fact } from "../facts.ts";
import type { ClientState } from "../client-state.ts";
import type { GoalContract } from "../goal-contract.ts";

export interface CardioSafety {
  escalations: Array<{ code: string; why: string }>;
  noVigorous: boolean;
  noHeartRate: boolean;
  minor: boolean;
  warnings: string[];
  screening: string[];
}

const ESCALATE_SCREEN: Record<string, string> = {
  cardiovascular: "a known cardiovascular condition or concerning symptoms",
  chest_dizziness: "unexplained chest pain, dizziness or fainting",
  blood_pressure: "a blood-pressure concern",
  advised_limit: "advice to limit or avoid exercise",
};
const TEXT_FLAGS: Array<[RegExp, string]> = [
  [/\b(pregnan\w*|postpartum|post-partum)\b/i, "pregnancy or the postpartum period"],
  [/\b(heart (disease|condition|attack|failure)|arrhythmi\w*|atrial fibrillation|afib|angina|stent|pacemaker|cardiomyopath\w*)\b/i, "a heart condition"],
  [/\b(diabet\w*|insulin)\b/i, "diabetes or insulin use (exercise changes blood glucose)"],
  [/\b(faint\w*|passed out|syncope|chest pain)\b/i, "fainting or chest pain"],
];
const HR_MEDS = /\b(beta[- ]?blocker\w*|metoprolol|atenolol|propranolol|bisoprolol|carvedilol)\b/i;

export function cardioSafety(c: ClientState, g: GoalContract): CardioSafety {
  const escalations: CardioSafety["escalations"] = [];
  const warnings: string[] = [];
  const screen = isKnown(c.health.safetyScreen) ? c.health.safetyScreen.value : [];
  for (const [k, what] of Object.entries(ESCALATE_SCREEN)) if (screen.includes(k)) escalations.push({ code: `screen_${k}`, why: `The pre-participation screen reports ${what}. Exercise-related cardiac events are often preceded by warning signs; OPTIM prescribes no cardio until the coach has reviewed it, with medical clearance where indicated.` });
  const texts = [c.health.restrictions, c.health.aggravatingFactors, c.health.bodyAreaOther, c.health.review.coachDocumentedLimitation, c.schedule.notes, c.training.notes, c.goals.primaryOther, g.successDefinition] as Array<Fact<string>>;
  const all = texts.filter(isKnown).map((f) => (f as { value: string }).value).join(" \n ");
  const dr = isKnown(c.nutrition.dietaryRestrictions) ? c.nutrition.dietaryRestrictions.value.detail ?? "" : "";
  const blob = `${all} \n ${dr}`;
  for (const [re, what] of TEXT_FLAGS) {
    const m = re.exec(blob);
    if (m) escalations.push({ code: "text_flag", why: `The client's answers mention “${m[0]}” — ${what}. Cardio prescription needs the coach's review (and the client's clinician where relevant) first.` });
  }
  const age = isKnown(c.body.age) ? c.body.age.value : null;
  const minor = age !== null && age < 18;
  const goal = g.primary?.class ?? null;
  if (minor && (goal === "fat_loss" || goal === "weight_gain" || isKnown(c.goals.targetWeightLb))) escalations.push({ code: "minor_weight_goal", why: `The client is ${age} with a weight-change goal — cardio for weight change in a minor needs individualized professional guidance.` });
  const medication = screen.includes("medication_condition");
  const hrMed = HR_MEDS.test(blob);
  if (medication) warnings.push("The client reported a medication or condition that may affect exercise — OPTIM keeps cardio at easy-to-moderate effort and uses no heart-rate targets until the coach confirms.");
  if (hrMed) warnings.push("A heart-rate-altering medication is mentioned — heart-rate targets would be misleading; use talk test or perceived effort.");
  if (minor) warnings.push(`The client is ${age}: cardio supports performance and health only — no fat-loss conditioning.`);
  return {
    escalations,
    noVigorous: medication,
    noHeartRate: medication || hrMed,
    minor,
    warnings,
    screening: ["Confirm the client has no new chest pain, dizziness, fainting or unusual breathlessness on exertion — the intake screen is a one-time snapshot."],
  };
}
