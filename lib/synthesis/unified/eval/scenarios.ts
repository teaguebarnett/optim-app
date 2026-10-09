// Unified Program U1 — evaluation scenarios. `hard` checks are invariants of ONE coherent program (offline and live);
// `quality` checks are coaching signals for review, never used to pass a program. Every scenario is judged on the
// whole program — schedule, workload, recovery, cross-domain consistency and decisions — not on the three domain
// outputs separately.

import type { SynthesisInput } from "../../synthesis-input.ts";
import type { UniversalTrainingProgramContent } from "../../../training/types.ts";
import type { UnifiedProgramProposal, UnifiedStatus, DomainId, DomainOutcome } from "../contract.ts";
import { coachMethod, fullCoach, CARDIO_METHOD, LOWER, programContent, scenarioInput, UPPER } from "./fixtures.ts";

export interface UnifiedScenario {
  id: string;
  title: string;
  category: string;
  input: () => SynthesisInput;
  approved?: { versionId: string; content: UniversalTrainingProgramContent };
  proceedWithoutResistance?: boolean;
  expected: UnifiedStatus[];
  /** Expected status per domain (only those listed are checked). */
  domains?: Partial<Record<DomainId, Array<DomainOutcome["status"]>>>;
  /** Model calls the program may make at most (0 = gated before any call). */
  maxCalls?: number;
  hard?: (u: UnifiedProgramProposal, i: SynthesisInput) => string[];
  quality?: (u: UnifiedProgramProposal) => Array<{ check: string; pass: boolean }>;
}

type Patch = NonNullable<Parameters<typeof scenarioInput>[0]>["patch"];
const person = (p: { goal: string; success?: string; days?: string[]; len?: string; sleep?: string; obstacles?: string[]; exp?: string; recent?: string; lb?: number; more?: Patch }): Patch => ({
  about_you: { age: 34, sex: "male", heightFeet: 5, heightInchesRemainder: 10, weightLb: p.lb ?? 190, weightDirection: "stable" },
  what_you_want: { primaryGoal: p.goal, secondaryGoals: [], ...(p.success ? { successDefinition: p.success } : {}) },
  your_week: { availableDays: p.days ?? ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: p.len ?? "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening"], schedulePredictability: "mostly_predictable", dailyActivityLevel: "lightly_active" },
  starting_point: { trainingExperience: p.exp ?? "experienced_consistent", recentConsistency: p.recent ?? "very_consistent", weeklyFrequency: 4 },
  fuel_recovery: { typicalSleep: p.sleep ?? "7_8", hasDietaryRestrictions: "none", nutritionApproach: "general_habits", consistencyObstacles: p.obstacles ?? [] },
  ...(p.more ?? {}),
});
const inp = (patch: Patch, coach = fullCoach()) => () => scenarioInput({ patch, coach });
const UL = (minutes = 60) => programContent([{ day: "Monday", exercises: LOWER, minutes }, { day: "Tuesday", exercises: UPPER, minutes }, { day: "Thursday", exercises: LOWER, minutes }, { day: "Friday", exercises: UPPER, minutes }], 8);
const approvedUL = { versionId: "pv-approved-ul", content: UL() };

/** Invariants of every unified result, whatever the scenario. */
export function programInvariants(u: UnifiedProgramProposal): string[] {
  const out: string[] = [];
  for (const d of Object.values(u.domains)) {
    if (d.status === "HELD" && d.run) out.push(`${d.domain} is HELD but has a run`);
    if (d.status === "PROPOSED" && !d.run) out.push(`${d.domain} is PROPOSED without a run artifact`);
    if (d.status === "APPROVED_EXISTING" && !u.provenance.approvedResistance) out.push("approved program used without its provenance");
  }
  if ((u.status === "ESCALATE" || u.status === "NEEDS_INPUT") && u.provenance.modelCalls > 0 && !Object.values(u.domains).some((d) => d.status === "ESCALATE" && d.run)) out.push(`${u.status} after ${u.provenance.modelCalls} model call(s)`);
  if (u.status === "READY_FOR_REVIEW" && (u.decisions.length || u.crossDomain.errors.length)) out.push("READY_FOR_REVIEW with open decisions or cross-domain errors");
  for (const d of u.week) if ((d.cardio || d.resistance?.source === "proposed_program") && !d.available) out.push(`${d.day}: proposed training on an unavailable day`);
  if (u.workload.trainingDays + u.workload.restDays !== 7) out.push("workload days don't add up");
  return out;
}

const status = (u: UnifiedProgramProposal, s: UnifiedScenario) => [
  ...(s.expected.includes(u.status) ? [] : [`status ${u.status}, expected ${s.expected.join("/")}${u.crossDomain.errors.length ? `: ${u.crossDomain.errors.join("; ")}` : ""}${Object.values(u.domains).filter((d) => ["REJECTED", "NEEDS_INPUT"].includes(d.status)).map((d) => ` | ${d.domain} ${d.status}: ${d.reasons.join("; ").slice(0, 300)}`).join("")}`]),
  ...Object.entries(s.domains ?? {}).flatMap(([d, ok]) => (ok!.includes(u.domains[d as DomainId].status) ? [] : [`${d} ${u.domains[d as DomainId].status}, expected ${ok!.join("/")}`])),
  ...(s.maxCalls !== undefined && u.provenance.modelCalls > s.maxCalls ? [`${u.provenance.modelCalls} model calls > ${s.maxCalls}`] : []),
];
export const scenarioHard = (s: UnifiedScenario, u: UnifiedProgramProposal, i: SynthesisInput) => [...status(u, s), ...programInvariants(u), ...(s.hard?.(u, i) ?? [])];

export const UNIFIED_SCENARIOS: UnifiedScenario[] = [
  {
    id: "U01",
    title: "Fat loss with an approved resistance program, cardio and nutrition",
    category: "fat_loss",
    input: inp(person({ goal: "lose_fat", lb: 215 })),
    approved: approvedUL,
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["APPROVED_EXISTING"], cardio: ["PROPOSED", "NO_ADDITIONAL"], nutrition: ["PROPOSED"] },
    hard: (u) => [...(u.domains.resistance.run ? ["approved program was regenerated"] : []), ...(u.provenance.approvedResistance?.versionId === "pv-approved-ul" ? [] : ["approved version not recorded"])],
    quality: (u) => [
      { check: "nutrition's energy covers lifting; cardio cost stated, not blended", pass: u.uncertainties.some((x) => /isn't added to it/.test(x)) || u.workload.cardioMinutes.total === 0 },
      { check: "leaves at least one rest day", pass: u.workload.restDays >= 1 },
    ],
  },
  {
    id: "U01X",
    title: "Fat loss with NO resistance program: the Fitness Reasoner can't plan it → explicit, dependents held, no model call",
    category: "fat_loss",
    input: inp(person({ goal: "lose_fat", lb: 215 })),
    expected: ["INCOMPLETE"],
    domains: { resistance: ["UNSUPPORTED"], cardio: ["HELD"], nutrition: ["HELD"] },
    maxCalls: 0,
    hard: (u) => (u.decisions.some((d) => d.about === "resistance_unavailable" && d.options.length >= 2) ? [] : ["no prepared decision for the missing resistance program"]),
  },
  {
    id: "U01P",
    title: "Fat loss, coach chose to proceed without a resistance program: cardio and nutrition around current training",
    category: "fat_loss",
    input: inp(person({ goal: "lose_fat", lb: 215 })),
    proceedWithoutResistance: true,
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["UNSUPPORTED"], cardio: ["PROPOSED", "NO_ADDITIONAL"], nutrition: ["PROPOSED"] },
    hard: (u) => (u.domains.resistance.reasons.some((r) => /proceed without it/.test(r)) ? [] : ["the coach's choice isn't recorded on the resistance outcome"]),
  },
  {
    id: "U02",
    title: "Muscle gain with limited recovery (short sleep, stress): cardio must not add a training day",
    category: "muscle_gain_recovery",
    input: inp(person({ goal: "build_muscle", sleep: "under_6", obstacles: ["stress"] })),
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["PROPOSED"], cardio: ["PROPOSED", "NO_ADDITIONAL"], nutrition: ["PROPOSED"] },
    hard: (u) => [...(u.recovery.limited ? [] : ["limited recovery not recognized"]), ...(u.week.some((d) => d.cardio && !d.resistance) && !u.decisions.some((d) => d.about === "added_training_day") ? ["cardio added a training day without a coach decision"] : []), ...(u.workload.hardCardioSessions ? ["hard cardio despite limited recovery"] : [])],
    quality: (u) => [{ check: "recovery considerations name the resistance frequency for the coach to confirm", pass: u.recovery.considerations.some((x) => /doesn't adjust it for sleep/.test(x)) }],
  },
  {
    id: "U03",
    title: "Strength-focused: proposed lifting, conditioning cardio away from lower-body days, nutrition for training",
    category: "strength",
    input: inp(person({ goal: "get_stronger", success: "Squat 180 kg and not get gassed on stairs" })),
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["PROPOSED"], cardio: ["PROPOSED", "NO_ADDITIONAL"], nutrition: ["PROPOSED"] },
    hard: (u) => u.week.filter((d) => d.cardio && (d.cardio.type === "intervals" || d.cardio.intensity === "vigorous") && d.resistance?.lowerBody).map((d) => `${d.day}: hard cardio on a lower-body lifting day`),
  },
  {
    id: "U04",
    title: "Body recomposition with an approved program (the Fitness Reasoner can't plan recomposition yet)",
    category: "recomposition",
    input: inp(person({ goal: "body_recomposition" })),
    approved: approvedUL,
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["APPROVED_EXISTING"], nutrition: ["PROPOSED"] },
  },
  {
    id: "U05",
    title: "Hybrid: strength primary with an aerobic aim — cardio and lifting coordinated",
    category: "hybrid",
    input: inp(person({ goal: "get_stronger", success: "Deadlift 220 kg and comfortably run for an hour" })),
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["PROPOSED"], cardio: ["PROPOSED"], nutrition: ["PROPOSED"] },
  },
  {
    id: "U06",
    title: "Coach doesn't prescribe cardio: no cardio is forced",
    category: "coach_scope",
    input: inp(person({ goal: "build_muscle" }), fullCoach({ t_cardio_roles: ["none"] })),
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["PROPOSED"], cardio: ["NOT_COACHED"], nutrition: ["PROPOSED"] },
    hard: (u) => (u.workload.cardioMinutes.total ? ["cardio minutes for a coach who doesn't prescribe cardio"] : []),
  },
  {
    id: "U07A",
    title: "Nutrition methodology: coach doesn't coach nutrition",
    category: "nutrition_methods",
    input: inp(person({ goal: "build_muscle" }), fullCoach({ nutrition_scope: "none" })),
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { nutrition: ["NOT_COACHED"], resistance: ["PROPOSED"] },
  },
  {
    id: "U07B",
    title: "Nutrition methodology: habit-based coach (no calorie or protein targets)",
    category: "nutrition_methods",
    input: inp(person({ goal: "health_consistency" }), fullCoach({ n_approach: ["habit_based"], n_calorie_method: "no_calorie_targets", n_protein_basis: "no_target", n_protein_amount: undefined })),
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { nutrition: ["PROPOSED"] },
    hard: (u) => (u.uncertainties.some((x) => /isn't added to it/.test(x)) ? ["energy-exclusion note without an energy target"] : []),
  },
  {
    id: "U07C",
    title: "Nutrition methodology: higher calories on training days, with cardio-only days → which days count is a coach decision",
    category: "nutrition_methods",
    input: inp(person({ goal: "lose_fat", lb: 215 }), fullCoach({ n_training_rest: "higher_on_training_days" })),
    approved: approvedUL,
    expected: ["NEEDS_COACH_DECISION", "READY_FOR_REVIEW"],
    domains: { nutrition: ["PROPOSED"] },
    hard: (u) => (u.week.some((d) => d.cardio && !d.resistance) && !u.decisions.some((d) => d.about === "nutrition_training_days") ? ["cardio-only days without the nutrition training-day decision"] : []),
  },
  {
    id: "U08",
    title: "Conflicting schedule: the approved program trains Saturday (unavailable) and Monday runs past the 60-min cap",
    category: "schedule_conflict",
    input: inp(person({ goal: "build_muscle", days: ["mon", "tue", "wed", "thu", "fri"], len: "60" })),
    approved: { versionId: "pv-conflict", content: programContent([{ day: "Monday", exercises: LOWER, minutes: 70 }, { day: "Wednesday", exercises: UPPER, minutes: 55 }, { day: "Saturday", exercises: LOWER, minutes: 60 }], 8) },
    expected: ["NEEDS_COACH_DECISION"],
    domains: { resistance: ["APPROVED_EXISTING"], cardio: ["PROPOSED", "NO_ADDITIONAL"] },
    hard: (u) => [...(u.decisions.filter((d) => d.source === "cardio" && /resistance_/.test(d.about)).length >= 2 ? [] : ["schedule conflicts not prepared as coach decisions"]), ...(u.crossDomain.findings.some((f) => f.code === "approved_on_unavailable_day") ? [] : ["approved lifting on an unavailable day not flagged"])],
  },
  {
    id: "U09A",
    title: "Missing information: no available days → program NEEDS_INPUT before any model call",
    category: "missing_info",
    input: inp(person({ goal: "build_muscle", days: [] })),
    expected: ["NEEDS_INPUT"],
    maxCalls: 0,
  },
  {
    id: "U09B",
    title: "Missing information: no bodyweight → nutrition asks before ANY model call; the program is incomplete, nothing invented",
    category: "missing_info",
    input: inp(person({ goal: "build_muscle", more: { about_you: { age: 34, sex: "male", heightFeet: 5, heightInchesRemainder: 10, weightLb: undefined, weightDirection: "stable" } } })),
    expected: ["INCOMPLETE"],
    domains: { nutrition: ["NEEDS_INPUT"], resistance: ["HELD"], cardio: ["HELD"] },
    maxCalls: 0,
  },
  {
    id: "U10A",
    title: "Safety: chest pain / dizziness on the screen → whole program ESCALATE before any model call",
    category: "safety",
    input: inp(person({ goal: "lose_fat", more: { health_finish: { hasInjuryHistory: false, safetyScreen: ["chest_dizziness"] } } })),
    expected: ["ESCALATE"],
    maxCalls: 0,
  },
  {
    id: "U10B",
    title: "Safety: minor with a fat-loss goal → ESCALATE before any model call",
    category: "safety",
    input: inp(person({ goal: "lose_fat", more: { about_you: { age: 16, sex: "female", heightFeet: 5, heightInchesRemainder: 5, weightLb: 150, weightDirection: "stable" } } })),
    expected: ["ESCALATE"],
    maxCalls: 0,
  },
  {
    id: "U11",
    title: "Coach programs resistance only (no cardio, no nutrition): one domain, nothing forced",
    category: "coach_scope",
    input: inp(person({ goal: "get_stronger" }), coachMethod({ t_cardio_roles: ["none"], nutrition_scope: "none" })),
    expected: ["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"],
    domains: { resistance: ["PROPOSED"], cardio: ["NOT_COACHED"], nutrition: ["NOT_COACHED"] },
    hard: (u) => (u.provenance.modelCalls > 2 ? ["more model calls than the resistance domain needs"] : []),
  },
];

export { CARDIO_METHOD };
