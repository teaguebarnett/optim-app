// Cardio Reasoner V1 — evaluation scenarios. `hard` checks are deterministic invariants every result must meet
// (offline and live); `quality` checks are coaching-quality signals a scripted model can't be judged on — they are
// reported for the live run and for human review, never used to pass a plan.

import { isKnown } from "../../../facts.ts";
import type { SynthesisInput } from "../../../synthesis-input.ts";
import { coachFact } from "../../../goal-contract.ts";
import { DAY_ORDER } from "../../../client-state.ts";
import { cardioModality } from "../../../knowledge/cardio/modalities.ts";
import type { ResistanceWeek } from "../../../cardio/schedule.ts";
import type { CardioReasonerResult } from "../reasoner.ts";
import { cardioCoach, enduranceCoach, LOWER, resistanceProgram, restrict, scenarioInput, UPPER, UPPER_LOWER } from "./fixtures.ts";
import { range } from "../../eval/fixtures.ts";

export interface CardioScenario {
  id: string;
  title: string;
  category: string;
  input: () => SynthesisInput;
  resistance?: ResistanceWeek;
  expected: CardioReasonerResult["status"][];
  expectsModel: boolean;
  hard?: (r: CardioReasonerResult, i: SynthesisInput) => string[];
  quality?: (r: Extract<CardioReasonerResult, { status: "PLANNED" }>, i: SynthesisInput) => Array<{ check: string; pass: boolean }>;
}

type Patch = NonNullable<Parameters<typeof scenarioInput>[0]>["patch"];
const person = (p: { age?: number; sex?: "female" | "male"; lb?: number; goal: string; secondary?: string[]; success?: string; days?: string[]; len?: string; env?: string[]; exp?: string; recent?: string; sleep?: string; obstacles?: string[]; cardio?: string; more?: Patch }): Patch => ({
  about_you: { age: p.age ?? 32, sex: p.sex ?? "male", heightFeet: 5, heightInchesRemainder: 10, weightLb: p.lb ?? 185, weightDirection: "stable" },
  what_you_want: { primaryGoal: p.goal, secondaryGoals: p.secondary ?? [], ...(p.success ? { successDefinition: p.success } : {}) },
  your_week: { availableDays: p.days ?? ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: p.len ?? "75", trainingEnvironment: p.env ?? ["commercial_gym"], preferredTrainingTime: ["evening"], schedulePredictability: "mostly_predictable" },
  starting_point: { trainingExperience: p.exp ?? "experienced_consistent", recentConsistency: p.recent ?? "very_consistent", weeklyFrequency: 4 },
  fuel_recovery: { typicalSleep: p.sleep ?? "7_8", hasDietaryRestrictions: "none", consistencyObstacles: p.obstacles ?? [], ...(p.cardio ? { cardioPreference: p.cardio } : {}) },
  ...(p.more ?? {}),
});
const inp = (patch: Patch, extra: Omit<NonNullable<Parameters<typeof scenarioInput>[0]>, "patch"> = {}) => () => scenarioInput({ patch, coach: cardioCoach(), ...extra });

const status = (r: CardioReasonerResult, ok: CardioReasonerResult["status"][]) => (ok.includes(r.status) ? [] : [`status ${r.status}, expected ${ok.join("/")}${r.status === "REJECTED" ? `: ${r.errors.join("; ")}` : ""}`]);
const planned = (r: CardioReasonerResult) => (r.status === "PLANNED" ? r : null);
const isHard = (s: { type: string; intensity: string }) => s.type === "intervals" || s.intensity === "vigorous";

/** Invariants for every PLANNED result, whatever produced it. */
export function plannedInvariants(r: CardioReasonerResult, i: SynthesisInput): string[] {
  const p = planned(r);
  if (!p) return [];
  const out: string[] = [];
  const ri = p.run.input!;
  const avail = new Set(isKnown(i.client.schedule.availableDays) ? i.client.schedule.availableDays.value : []);
  for (const s of p.plan.sessions) {
    if (!avail.has(s.day)) out.push(`session on unavailable ${s.day}`);
    if (!ri.modalities.some((m) => m.startsWith(`${s.modality}|`))) out.push(`${s.modality} wasn't offered`);
    if (isHard(s) && ri.safety.noVigorous) out.push(`hard session despite safety.noVigorous (${s.day})`);
    if (s.hrPct && !ri.zones) out.push(`heart rate without zones (${s.day})`);
  }
  const weeks = p.review.workload.weeks;
  for (const w of weeks) if (w.hardSessions > ri.bounds.maxHardSessions) out.push(`week ${w.week}: ${w.hardSessions} hard sessions > ${ri.bounds.maxHardSessions}`);
  const range = ri.bounds.minutesByRole[p.plan.role];
  if (range && weeks.some((w) => w.minutes.total > range[1])) out.push(`a week above the coach's ${range[1]} min/week`);
  const cap = ri.capacity.weeklyMaxMinutes;
  if (cap !== null && weeks.some((w) => w.minutes.total > cap)) out.push(`a week doesn't fit the client's ${cap} min of capacity`);
  if (p.plan.role === "optional_low_intensity" && [...p.plan.sessions, ...p.plan.progression.flatMap((w) => w.sessions)].some((x) => !x.optional)) out.push("optional cardio made mandatory");
  for (const c of ri.conflicts) if (!p.plan.coachDecisions.some((d) => d.about === c.id)) out.push(`no prepared coach decision for ${c.id}`);
  if (p.plan.dose.vsCoachRange === "below" && !p.plan.decisions.some((d) => d.topic === "dose")) out.push("below-range dose not explained");
  if (p.run.versions.coachMethod === null) out.push("no coach method recorded");
  return out;
}

/** No hard, leg-dominant cardio on, or the day before, a lower-body resistance day. */
const noLegInterference = (r: CardioReasonerResult) => {
  const p = planned(r);
  if (!p || !p.run.snapshots.resistance) return [];
  const lower = new Set(p.run.snapshots.resistance.days.filter((d) => d.lowerBody).map((d) => d.day));
  return p.plan.sessions.filter((s) => isHard(s) && ["moderate", "high"].includes(cardioModality(s.modality)?.lowerBodyInterference ?? "none") && (lower.has(s.day) || lower.has(DAY_ORDER[(DAY_ORDER.indexOf(s.day) + 1) % 7]))).map((s) => `hard ${s.modality} on/before a lower-body day (${s.day})`);
};

const enduranceGoal = (event?: string) => ({ class: "endurance" as const, event: event ? coachFact(event, "coach.event") : ({ status: "unknown", reason: "not_provided" } as never), eventDateIso: event ? coachFact("2027-04-11", "coach.event_date") : ({ status: "unknown", reason: "not_provided" } as never), currentBaseline: coachFact("runs 2× a week, 30 min easy", "coach.baseline") });

/** The coach has reviewed the health answers (resolved — never a medical clearance). */
const REVIEWED = { clientId: "client-eval", workspaceId: "ws-eval", status: "reviewed_by_coach", reasons: ["Positive pre-participation safety response"], createdAtIso: "2026-10-01T00:00:00.000Z", updatedAtIso: "2026-10-01T00:00:00.000Z" } as never;

export const CARDIO_SCENARIOS: CardioScenario[] = [
  {
    id: "C01",
    title: "Strength athlete who needs cardiovascular fitness (upper/lower split)",
    category: "strength_athlete",
    input: inp(person({ goal: "get_stronger", success: "Squat 180 kg without getting gassed on stairs" })),
    resistance: UPPER_LOWER(),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => [...noLegInterference(r), ...(planned(r) && !planned(r)!.plan.decisions.some((d) => d.topic === "interference") ? ["interference not explained"] : [])],
    quality: (r) => [
      { check: "prefers low-interference modalities (cycling/elliptical/walking) for hard work", pass: r.plan.sessions.filter(isHard).every((s) => ["none", "low"].includes(cardioModality(s.modality)?.lowerBodyInterference ?? "")) },
      { check: "weekly cardio stays modest (≤ 120 min)", pass: r.review.workload.weeklyMinutes.total <= 120 },
    ],
  },
  {
    id: "C02",
    title: "Fat-loss client with low endurance capacity (new to training, not training recently)",
    category: "fat_loss_low_capacity",
    input: inp(person({ goal: "lose_fat", lb: 230, exp: "new", recent: "not_recently", cardio: "neutral_on_cardio", days: ["mon", "wed", "thu", "sat", "sun"], len: "45" })),
    resistance: resistanceProgram([{ day: "Monday", exercises: ["Leg Press", "Lat Pulldown", "Dumbbell Shoulder Press"], minutes: 40 }, { day: "Thursday", exercises: ["Romanian Deadlift", "Seated Cable Row", "Barbell Bench Press"], minutes: 40 }]),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      return [...(p.review.workload.weeks.filter((w) => w.week <= 2).some((w) => w.hardSessions > 0) ? ["hard sessions in the first 2 weeks"] : []), ...(p.run.input!.resistance!.days.every((d) => d.lowerBody) ? [] : ["full-body days not recognized as loading the legs"])];
    },
    quality: (r) => [
      { check: "week 1 starts from the client's capacity, below the coach's 120-min fat-loss floor", pass: r.plan.dose.vsCoachRange === "below" && r.review.workload.weeklyMinutes.total < 120 },
      { check: "no intervals before week 4 for a deconditioned beginner", pass: r.review.workload.weeks.filter((w) => w.week < 4).every((w) => w.hardSessions === 0) },
      { check: "walking or another low-impact modality", pass: r.plan.sessions.every((s) => (cardioModality(s.modality)?.demands.impact ?? "none") !== "high") },
    ],
  },
  {
    id: "C03",
    title: "Hypertrophy client with limited recovery (short sleep, stress)",
    category: "hypertrophy_limited_recovery",
    input: inp(person({ goal: "build_muscle", sleep: "under_6", obstacles: ["stress", "schedule"] })),
    resistance: resistanceProgram([{ day: "Monday", exercises: LOWER }, { day: "Tuesday", exercises: UPPER }, { day: "Thursday", exercises: LOWER }, { day: "Friday", exercises: UPPER }, { day: "Saturday", exercises: ["Barbell Bench Press", "Leg Press", "Lat Pulldown"] }]),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      return [...(p.plan.sessions.some(isHard) ? ["hard cardio despite limited recovery"] : []), ...(p.plan.decisions.some((d) => d.topic === "recovery") ? [] : ["recovery decision missing"])];
    },
    quality: (r) => [
      { check: "no added cardio, or a deliberately reduced dose (below the coach's range)", pass: !r.plan.warranted || r.plan.dose.vsCoachRange === "below" },
      { check: "no new training day without a prepared coach decision", pass: !r.plan.sessions.some((x) => x.placement === "separate_day") || r.plan.coachDecisions.some((d) => d.about === "added_training_day") },
      { check: "any growth is gated on recovery improving (or the coach)", pass: r.review.workload.weeks.every((w) => w.week === 1 || w.minutes.total <= r.review.workload.weeks[0].minutes.total || w.gate !== "none") },
      { check: "names recovery as an uncertainty or coach question", pass: [...r.plan.uncertainties.map((u) => u.about + u.impact), ...r.plan.coachQuestions.map((q) => q.question)].some((t) => /sleep|recover|stress/i.test(t)) },
    ],
  },
  {
    id: "C04",
    title: "Endurance-focused client, no event (endurance coach, aerobic base)",
    category: "endurance_base",
    input: () => scenarioInput({ patch: person({ goal: "health_consistency", age: 41 }), coach: enduranceCoach(), coachConfirmedGoal: enduranceGoal() }),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      const ri = p.run.input!;
      return [...(ri.zones?.hrMaxEstimate === Math.round(208 - 0.7 * 41) ? [] : ["HRmax estimate isn't Tanaka's"]), ...(ri.bounds.maxWeeklyIncreasePct === 10 ? [] : ["coach's weekly-increase cap not applied"]), ...(ri.endurance?.discipline === "running" ? [] : ["the coach's sport wasn't passed to the model"])];
    },
    quality: (r) => {
      const m = r.review.workload.weeklyMinutes;
      return [
        { check: "mostly easy (polarized coach): ≥ 70% of minutes easy", pass: m.total > 0 && m.easy / m.total >= 0.7 },
        { check: "uses heart-rate zones (coach method)", pass: r.plan.intensityMethod.primary === "heart_rate" },
        { check: "trains the coach's sport (running) in week 1", pass: r.plan.sessions.some((x) => x.modality === "cardio.running") },
        { check: "down week on the coach's cadence (weeks 3–4)", pass: r.review.workload.weeks.some((w, k) => k > 0 && w.week >= 3 && w.week <= 4 && w.minutes.total < r.review.workload.weeks[k - 1].minutes.total) },
      ];
    },
  },
  {
    id: "C04E",
    title: "Endurance client with a race (half marathon in April) → UNSUPPORTED, never resistance-routed",
    category: "endurance_unsupported",
    input: () => scenarioInput({ patch: person({ goal: "health_consistency" }), coach: enduranceCoach(), coachConfirmedGoal: enduranceGoal("Half marathon") }),
    expected: ["UNSUPPORTED"],
    expectsModel: false,
  },
  {
    id: "C04T",
    title: "Race goal in the client's own words (strength goal, 'finish my first marathon') → UNSUPPORTED",
    category: "endurance_unsupported",
    input: inp(person({ goal: "get_stronger", success: "Finish my first marathon next autumn" })),
    expected: ["UNSUPPORTED"],
    expectsModel: false,
  },
  {
    id: "C05",
    title: "Hybrid athlete (strength primary, wants a better running engine)",
    category: "hybrid",
    input: inp(person({ goal: "get_stronger", success: "Deadlift 220 kg and comfortably run for an hour" })),
    resistance: UPPER_LOWER(),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => [...noLegInterference(r), ...(planned(r) && !planned(r)!.run.input!.hybrid ? ["hybrid not recognized"] : [])],
    quality: (r) => [{ check: "includes some aerobic development (≥ 60 min/week)", pass: r.review.workload.weeklyMinutes.total >= 60 }],
  },
  {
    id: "C06",
    title: "Beginner with limited equipment (home, no machines confirmed)",
    category: "beginner_limited_equipment",
    input: inp(person({ goal: "health_consistency", exp: "new", recent: "not_recently", env: ["limited_equipment"], days: ["mon", "wed", "fri", "sat"], len: "30" })),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      return [...(p.plan.sessions.some(isHard) ? ["hard work for a beginner"] : []), ...(p.run.input!.modalities.filter((m) => m.split("|")[6] === "assumed").length ? ["machines assumed outside a commercial gym"] : [])];
    },
    quality: (r) => [
      { check: "uses equipment-free cardio (walking/running) or flags the machine to confirm", pass: r.plan.sessions.every((s) => cardioModality(s.modality)?.equipmentAnyOf.includes("none")) || r.review.quality.some((q) => q.code === "equipment_unconfirmed") },
      { check: "progression stays within 4 days × 30 min", pass: r.review.workload.weeks.every((w) => w.minutes.total <= 120) },
    ],
  },
  {
    id: "C07A",
    title: "Coach-confirmed restriction: no high-impact work (running excluded)",
    category: "restrictions",
    input: inp(person({ goal: "lose_fat" }), { restrictions: restrict([{ kind: "avoid_demand", demand: "impact", atOrAbove: "moderate" }]) }),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      return [...(p.plan.sessions.some((s) => s.modality === "cardio.running") ? ["running despite the impact restriction"] : []), ...(p.review.withheld.some((w) => w.modality === "Running") ? [] : ["running not reported as withheld"])];
    },
  },
  {
    id: "C07B",
    title: "Coach-confirmed restriction: no knee loading on either side → every modality excluded → NEEDS_INPUT",
    category: "restrictions",
    input: inp(person({ goal: "lose_fat" }), { restrictions: restrict([{ kind: "avoid_limb_loading", region: "knee", side: "both" }]) }),
    expected: ["NEEDS_INPUT"],
    expectsModel: false,
  },
  {
    id: "C07C",
    title: "Insufficient information: client-reported knee pain, not yet structured by the coach",
    category: "insufficient_information",
    input: inp(person({ goal: "lose_fat", more: { health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["knee"], injuryRestrictions: "running hurts my knee", safetyScreen: ["none"] } } })),
    expected: ["NEEDS_INPUT"],
    expectsModel: false,
  },
  {
    id: "C07D",
    title: "Insufficient information: no available days",
    category: "insufficient_information",
    input: inp(person({ goal: "lose_fat", days: [] })),
    expected: ["NEEDS_INPUT"],
    expectsModel: false,
  },
  {
    id: "C07E",
    title: "Medication or condition reported (no other flags): easy/moderate only, no heart-rate targets",
    category: "restrictions",
    input: () => scenarioInput({ patch: person({ goal: "health_consistency", more: { health_finish: { hasInjuryHistory: false, safetyScreen: ["medication_condition"] } } }), coach: cardioCoach({ g_intensity_guide: ["heart_rate", "rpe"] }), healthReview: REVIEWED }),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      return [...(p.plan.sessions.some(isHard) ? ["vigorous work despite the medication flag"] : []), ...(p.plan.sessions.some((s) => s.hrPct) || p.run.input!.zones ? ["heart-rate targets despite the medication flag"] : [])];
    },
  },
  {
    id: "C08",
    title: "Approved schedule conflicts: program trains Saturday (client unavailable) and runs past the 60-min cap",
    category: "schedule_conflict",
    input: inp(person({ goal: "build_muscle", days: ["mon", "tue", "wed", "thu", "fri"], len: "60" })),
    resistance: resistanceProgram([{ day: "Monday", exercises: LOWER, minutes: 70 }, { day: "Wednesday", exercises: UPPER, minutes: 55 }, { day: "Saturday", exercises: LOWER, minutes: 60 }]),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      return [...(p.review.questions.some((q) => /Saturday/.test(q)) ? [] : ["Saturday conflict not surfaced"]), ...(p.review.questions.some((q) => /Monday/.test(q) && /cap/.test(q)) ? [] : ["Monday over-cap not surfaced"]), ...(p.plan.sessions.some((s) => s.day === "Monday" && s.placement === "after_resistance") ? ["cardio stacked onto an over-cap session"] : [])];
    },
    quality: (r) => [{ check: "every conflict has a prepared decision with a recommendation", pass: r.review.coachDecisions.every((d) => d.recommended !== null && d.options.length >= 2) }],
  },
  {
    id: "C09",
    title: "Safety screen: chest pain / dizziness → ESCALATE before any model call",
    category: "safety",
    input: () => scenarioInput({ patch: person({ goal: "lose_fat", more: { health_finish: { hasInjuryHistory: false, safetyScreen: ["chest_dizziness"] } } }), coach: cardioCoach(), healthReview: REVIEWED }),
    expected: ["ESCALATE"],
    expectsModel: false,
  },
  {
    id: "C10",
    title: "Minor with a fat-loss goal → ESCALATE",
    category: "safety",
    input: inp(person({ goal: "lose_fat", age: 16 })),
    expected: ["ESCALATE"],
    expectsModel: false,
  },
  {
    id: "C11",
    title: "Coach doesn't prescribe cardio → NOT_COACHED (no proposal)",
    category: "coach_scope",
    input: () => scenarioInput({ patch: person({ goal: "lose_fat" }), coach: cardioCoach({ t_cardio_roles: ["none"] }) }),
    expected: ["NOT_COACHED"],
    expectsModel: false,
  },
  {
    id: "C12",
    title: "Sport-specific conditioning (athletic performance) → UNSUPPORTED",
    category: "endurance_unsupported",
    input: inp(person({ goal: "athletic_performance" })),
    expected: ["UNSUPPORTED"],
    expectsModel: false,
  },
  {
    id: "C13",
    title: "Optional-low-intensity coach, fat-loss client: optional easy cardio only, steps from the coach",
    category: "coach_scope",
    input: () => scenarioInput({ patch: person({ goal: "lose_fat" }), coach: cardioCoach({ t_cardio_roles: ["optional_low_intensity"], g_steps_target: range(7000, 10000, "steps/day") }) }),
    expected: ["PLANNED"],
    expectsModel: true,
    hard: (r) => {
      const p = planned(r);
      if (!p) return [];
      return [...(p.plan.role === "optional_low_intensity" ? [] : [`role ${p.plan.role}, expected optional_low_intensity`]), ...(p.plan.sessions.some(isHard) ? ["hard work for an optional-low-intensity coach"] : []), ...(p.run.input!.bounds.minutesByRole.fat_loss ? ["another role's minute budget was offered"] : [])];
    },
    quality: (r) => [
      { check: "optional cardio stays flat unless the coach confirms a dose (optional_dose decision)", pass: r.review.workload.weeks.every((w) => w.optionalMinutes <= r.review.workload.weeks[0].optionalMinutes || (w.gate === "coach_confirmed" && r.plan.coachDecisions.some((d) => d.about === "optional_dose"))) },
      { check: "dose not sized from weekly-minute guidance", pass: !r.plan.decisions.some((d) => d.topic === "dose" && d.knowledgeRefs.some((x) => /fatloss\.dose|dose\.acsm|dose\.who/.test(x))) },
    ],
  },
];

export const scenarioHard = (s: CardioScenario, r: CardioReasonerResult, i: SynthesisInput) => [...status(r, s.expected), ...plannedInvariants(r, i), ...(s.hard?.(r, i) ?? [])];
