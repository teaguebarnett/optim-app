// Nutrition Reasoner V1 — deterministic energy and protein bounds. OPTIM computes; the Reasoner decides inside.
//
//   resting expenditure  Mifflin–St Jeor (sourced: concept.nutrition.energy_requirements#energy.ree_equation)
//   maintenance          × daily-activity multiplier RANGE — an internal heuristic (energy.activity_multipliers,
//                        source_needed) — plus training cost from Compendium MET ranges (training_energy_cost):
//                        (MET − 1) × kg × hours per session, averaged over the week. Always a range.
//   goal band            maintenance ± the COACH's own rate (% bodyweight/week), sized with a static
//                        energy-per-kg approximation (energy.energy_per_kg, source_needed)
//   floor                never below predicted resting expenditure — an internal safety heuristic
//
// Nothing here is a point estimate presented as fact, and nothing is invented: a missing input yields no number.

import { isKnown } from "../facts.ts";
import type { ClientState } from "../client-state.ts";
import type { GoalClass } from "../goal-contract.ts";
import type { NutritionMethod } from "./method.ts";

export const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
/** Static approximation, kcal per kg of bodyweight change (source_needed; see header). */
export const KCAL_PER_KG = 7700;

export interface TrainingContext {
  sessionsPerWeek: number;
  minutesPerSession: number;
  kind: "resistance" | "endurance" | "mixed";
  /** Where it came from: an approved program, a program proposed alongside this strategy (Unified Program U1 — not yet
   * approved), or the client's current habit. */
  source: "approved_program" | "proposed_program" | "client_current";
}

/** Internal heuristic multipliers by daily activity outside training (source_needed). */
const ACTIVITY: Record<string, [number, number]> = { mostly_sedentary: [1.2, 1.3], lightly_active: [1.3, 1.45], very_active: [1.45, 1.65] };
/** Compendium MET ranges by training kind (concept.nutrition.training_energy_cost): resistance 02054–02050, mixed =
 * circuit 02035–02040, endurance = running 12020–12070. Never a single value. */
export const TRAINING_MET: Record<TrainingContext["kind"], [number, number]> = { resistance: [3.5, 6], mixed: [5, 7.5], endurance: [7.5, 11] };

/** One session's energy cost above rest, kcal: (MET − 1) × kg × hours (1 MET = 1 kcal/kg/hour). */
export function sessionKcal(t: TrainingContext, kg: number): { low: number; high: number } {
  const [m0, m1] = TRAINING_MET[t.kind];
  const h = t.minutesPerSession / 60;
  return { low: Math.round(((m0 - 1) * kg * h) / 10) * 10, high: Math.round(((m1 - 1) * kg * h) / 10) * 10 };
}

const r50 = (n: number) => Math.round(n / 50) * 50;
const r5 = (n: number) => Math.round(n / 5) * 5;

export interface EnergyEstimate {
  /** Resting expenditure range (kcal/day): a range when sex is unknown, ± the equation's error otherwise. */
  restingKcal: { low: number; high: number };
  /** One training session's cost above rest (Compendium MET range); null without a training context. */
  sessionKcal: { low: number; high: number } | null;
  /** kcal/day that corresponds to 1% bodyweight change per week (static approximation). */
  kcalPerPctPerWeek: number;
  activityFactor: { low: number; high: number; basis: string[] };
  maintenanceKcal: { low: number; high: number };
  /** The band a target may lie in for this goal and the coach's rate; null when the goal doesn't set one. */
  targetBand: { low: number; high: number; rule: string } | null;
  /** Never prescribe below this (predicted resting expenditure, low end). */
  floorKcal: number;
  heuristics: string[];
}

export type EnergyRead = { ok: true; estimate: EnergyEstimate } | { ok: false; missing: Array<{ fact: string; why: string }> };

export function trainingContextFromClient(c: ClientState): TrainingContext | null {
  const sessions = isKnown(c.training.currentSessionsPerWeek) ? Number(c.training.currentSessionsPerWeek.value) : null;
  const len = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value.minutes : null;
  if (sessions === null || !Number.isFinite(sessions)) return null;
  return { sessionsPerWeek: sessions, minutesPerSession: len ?? 60, kind: "resistance", source: "client_current" };
}

export function estimateEnergy(params: { client: ClientState; goal: GoalClass | null; method: NutritionMethod; training: TrainingContext | null; minor: boolean }): EnergyRead {
  const { client: c } = params;
  const missing: Array<{ fact: string; why: string }> = [];
  if (!isKnown(c.body.weightLb)) missing.push({ fact: "onboarding.about_you.weightLb", why: "Bodyweight is needed to estimate energy needs." });
  if (!isKnown(c.body.heightInches)) missing.push({ fact: "onboarding.about_you.height", why: "Height is needed to estimate resting energy expenditure." });
  if (!isKnown(c.body.age)) missing.push({ fact: "onboarding.about_you.age", why: "Age is needed to estimate resting energy expenditure." });
  if (missing.length) return { ok: false, missing };
  const kg = (c.body.weightLb as { value: number }).value * KG_PER_LB;
  const cm = (c.body.heightInches as { value: number }).value * CM_PER_IN;
  const age = (c.body.age as { value: number }).value;
  const sex = isKnown(c.body.sex) ? c.body.sex.value : "prefer_not_to_say";
  const base = 10 * kg + 6.25 * cm - 5 * age;
  const male = base + 5;
  const female = base - 161;
  // Equation error (some individuals > 10% off measured) — the range carries it; unknown sex spans both equations.
  const resting = sex === "male" ? [male * 0.9, male * 1.1] : sex === "female" ? [female * 0.9, female * 1.1] : [female * 0.9, male * 1.1];

  const basis: string[] = [];
  const activity = isKnown(c.schedule.dailyActivity) ? c.schedule.dailyActivity.value : null;
  const [a0, a1] = (activity && ACTIVITY[activity]) || [1.2, 1.5];
  basis.push(activity && ACTIVITY[activity] ? `daily activity: ${activity.replace(/_/g, " ")}` : "daily activity not reported — widest range");
  const t = params.training;
  const session = t ? sessionKcal(t, kg) : null;
  const perDayTraining = t && session ? { low: (session.low * Math.min(7, t.sessionsPerWeek)) / 7, high: (session.high * Math.min(7, t.sessionsPerWeek)) / 7 } : { low: 0, high: 0 };
  if (t && session) basis.push(`${t.sessionsPerWeek} ${t.kind} sessions/week × ~${t.minutesPerSession} min (${t.source === "approved_program" ? "approved program" : t.source === "proposed_program" ? "proposed program, not yet approved" : "client's current habit"}): ${session.low}–${session.high} kcal per session above rest (Compendium ${TRAINING_MET[t.kind][0]}–${TRAINING_MET[t.kind][1]} MET)`);
  const factor = { low: a0, high: a1, basis };
  const maintenance = { low: r50(resting[0] * factor.low + perDayTraining.low), high: r50(resting[1] * factor.high + perDayTraining.high) };
  const floorKcal = r50(resting[0]);

  // Goal band from the coach's rate (% bodyweight/week), set around the CENTRAL maintenance estimate: the range above
  // is the uncertainty (shown to the coach, corrected by the trend); the direction of change is relative to the best
  // estimate. Knowledge ranges are used only if the coach set no rate.
  const perDay = (pct: number) => (pct / 100) * kg * KCAL_PER_KG / 7;
  const mid = (maintenance.low + maintenance.high) / 2;
  const band = (lo: number, hi: number, rule: string) => ({ low: Math.max(floorKcal, r50(lo)), high: r50(hi), rule });
  let targetBand: EnergyEstimate["targetBand"] = null;
  const rate = params.method.rate?.value;
  const g = params.goal;
  if (g === "fat_loss" && !params.minor) {
    const [lo, hi] = rate ? [rate.min, rate.max] : [0.5, 1];
    targetBand = band(mid - perDay(hi), mid - perDay(lo), `central maintenance (~${r50(mid)} kcal) minus ${lo}–${hi}% bodyweight/week (${rate ? "coach's rate" : "knowledge range; the coach set no rate"})`);
  } else if (g === "weight_gain" || g === "hypertrophy") {
    const [lo, hi] = rate ? [rate.min, rate.max] : [0.25, 0.5];
    targetBand = band(mid + perDay(lo), mid + perDay(hi), `central maintenance (~${r50(mid)} kcal) plus ${lo}–${hi}% bodyweight/week (${rate ? "coach's rate" : "knowledge range; the coach set no rate"})`);
  } else if (g === "recomposition" && !params.minor) {
    const approach = params.method.recomposition?.value;
    targetBand = approach === "small_deficit_high_protein" ? band(mid * 0.85, mid * 0.95, `a small deficit, 5–15% below central maintenance (~${r50(mid)} kcal) — internal heuristic sizing the coach's 'small deficit'`) : band(mid * 0.95, mid * 1.05, `central maintenance (~${r50(mid)} kcal) ± 5% (${approach === "alternating_blocks" ? "the coach alternates deficit and maintenance blocks" : "coach's recomposition approach"})`);
  } else if (g === "strength") {
    targetBand = band(mid, mid * 1.1, `central maintenance (~${r50(mid)} kcal) to a small surplus (up to 10%) supporting strength training`);
  } else if (g) {
    // A minor's band never starts below their own central maintenance estimate (no deficit, ever).
    targetBand = band(params.minor ? mid : mid * 0.95, mid * 1.05, params.minor ? `central maintenance (~${r50(mid)} kcal) to +5% — OPTIM never sets an energy deficit for a minor` : `central maintenance (~${r50(mid)} kcal) ± 5%`);
  }
  if (targetBand && targetBand.low > targetBand.high) targetBand = { ...targetBand, low: targetBand.high };
  return {
    ok: true,
    estimate: {
      restingKcal: { low: r50(resting[0]), high: r50(resting[1]) },
      sessionKcal: session,
      kcalPerPctPerWeek: Math.round((kg * KCAL_PER_KG) / 7 / 100),
      activityFactor: factor,
      maintenanceKcal: maintenance,
      targetBand,
      floorKcal,
      heuristics: ["Daily-activity multipliers are an internal heuristic (no verified source); training cost uses Compendium MET ranges; the bodyweight trend corrects both.", `Energy per kg of change is a static approximation (~${KCAL_PER_KG} kcal/kg) that overstates long-term change.`, "Never below predicted resting expenditure — a minimum OPTIM never crosses, not evidence that a target is safe. Clients under 18 are never given a deficit: anything below their own central maintenance estimate goes to human review."],
    },
  };
}

/** Protein grams/day from the coach's basis and range. Null with a reason when the basis needs a missing fact. */
export function proteinGrams(params: { client: ClientState; method: NutritionMethod }): { ok: true; grams: { low: number; high: number }; perKg: { low: number; high: number } | null; basis: string } | { ok: false; why: string; fact: string } | null {
  const p = params.method.protein?.value;
  if (!p) return null;
  const c = params.client;
  const weightLb = isKnown(c.body.weightLb) ? c.body.weightLb.value : null;
  const goalLb = isKnown(c.goals.targetWeightLb) ? c.goals.targetWeightLb.value : null;
  const ref = p.basis.includes("goal_weight") ? goalLb : weightLb;
  if (p.basis !== "fixed_grams" && ref === null) return { ok: false, fact: p.basis.includes("goal_weight") ? "onboarding.what_you_want.targetWeight" : "onboarding.about_you.weightLb", why: `The coach sets protein ${p.basis.replace(/_/g, " ")}; that weight isn't known.` };
  const perUnit = p.basis.startsWith("per_kg") ? (ref! * KG_PER_LB) : ref ?? 0;
  const grams = p.basis === "fixed_grams" ? { low: r5(p.range.min), high: r5(p.range.max) } : { low: r5(p.range.min * perUnit), high: r5(p.range.max * perUnit) };
  const kg = weightLb ? weightLb * KG_PER_LB : null;
  return { ok: true, grams, perKg: kg ? { low: +(grams.low / kg).toFixed(2), high: +(grams.high / kg).toFixed(2) } : null, basis: `${p.range.min}–${p.range.max} ${p.unit || p.basis.replace(/_/g, " ")}${ref ? ` × ${ref} lb${p.basis.startsWith("per_kg") ? " (in kg)" : ""}` : ""}` };
}

/** The weekly bodyweight change an energy range implies against OPTIM's maintenance estimate — a CALCULATED estimate
 * (static energy-per-kg approximation), never a promise. `central` uses central maintenance; `plausible` spans the
 * maintenance uncertainty. Negative = loss. % bodyweight per week. */
export function impliedRate(e: EnergyEstimate, kcal: { min: number; max: number }): { central: { low: number; high: number }; plausible: { low: number; high: number } } {
  const mid = (e.maintenanceKcal.low + e.maintenanceKcal.high) / 2;
  const pct = (kcalDelta: number) => +(kcalDelta / e.kcalPerPctPerWeek).toFixed(2);
  return { central: { low: pct(kcal.min - mid), high: pct(kcal.max - mid) }, plausible: { low: pct(kcal.min - e.maintenanceKcal.high), high: pct(kcal.max - e.maintenanceKcal.low) } };
}

/** Material contradictions between the client's stated schedule and the training the nutrition must support. */
export function scheduleConflicts(c: ClientState, t: TrainingContext | null): string[] {
  if (!t || t.source === "client_current") return [];
  const out: string[] = [];
  const len = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value : null;
  const which = t.source === "approved_program" ? "approved" : "proposed";
  if (len && !len.openEnded && t.minutesPerSession > len.minutes) out.push(`The ${which} program's sessions run ~${t.minutesPerSession} min, but the client reported a ${len.minutes}-min maximum — the training energy cost depends on which is current.`);
  const days = isKnown(c.schedule.availableDays) ? c.schedule.availableDays.value.length : null;
  if (days !== null && t.sessionsPerWeek > days) out.push(`The ${which} program has ${t.sessionsPerWeek} sessions/week, but the client reported ${days} available day(s).`);
  return out;
}
