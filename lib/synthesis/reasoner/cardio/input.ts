// Cardio Reasoner V1 — the compact canonical input and the Allowed sets the validator checks against. Same
// conventions as the resistance and nutrition inputs: coach rules are [Brain key, label, value] tuples, client facts
// keyed by source ref, evidence from the shared claim retrieval (conceptClaims). All bounds are computed by OPTIM.

import { isKnown, type Fact } from "../../facts.ts";
import type { SynthesisInput } from "../../synthesis-input.ts";
import type { DayOfWeek } from "../../../types.ts";
import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";
import { conceptClaims, type EvidenceClaim } from "../retrieval.ts";
import type { CardioMethod, CardioRole } from "../../cardio/method.ts";
import type { CardioPurpose } from "../../cardio/routing.ts";
import type { CardioSafety } from "../../cardio/safety.ts";
import type { ModalityOption } from "../../cardio/eligibility.ts";
import type { ResistanceWeek } from "../../cardio/schedule.ts";
import { CARDIO_MEASURES, type CardioPlan } from "./contract.ts";

export const CARDIO_REASONER_VERSION = "cardio-reasoner-v1.0.0";
export const CARDIO_TOPICS_RETRIEVED = ["dose", "intensity", "interval_training", "concurrent_training", "progression", "weight_management", "screening"];
export const MODALITY_ROW_LEGEND = "id|name|types (S steady, I intervals)|impact|lower-body interference (N/L/M/H)|skill|equipment state (available / assumed: standard commercial-gym machine / unknown: coach confirms)|fit (- fits the confirmed restrictions; U uncertain — not offered)";

/** Absent a coach rule: weekly cardio-minute increase cap (internal pacing default — the 10% rule itself didn't
 * prevent injuries in the verified trial; concept.cardio.progression). */
export const DEFAULT_MAX_WEEKLY_INCREASE_PCT = 20;
/** Absent a coach rule: hard (vigorous/interval) sessions per week for non-endurance clients (internal heuristic). */
export const DEFAULT_MAX_HARD_SESSIONS = 2;
/** % of age-predicted HRmax per intensity — internal curation (the verified abstracts give no zone percentages). */
export const HR_BANDS: Record<"easy" | "moderate" | "vigorous", [number, number]> = { easy: [55, 70], moderate: [70, 80], vigorous: [80, 92] };

export interface CardioReasoningInput {
  v: { reasoner: string; prompt: string; knowledge: string };
  purpose: CardioPurpose;
  hybrid: boolean;
  goal: { primary: string | null; secondary: string[]; success: string | null };
  coach: { method: string; kind: "general" | "endurance"; rules: Array<[string, string, unknown]>; allowedRoles: string[]; intensityMethods: string[] };
  client: { facts: Record<string, unknown>; missing: string[] };
  resistance: ResistanceWeek | null;
  bounds: {
    availableDays: DayOfWeek[];
    sessionCapMinutes: number | null;
    /** Weekly minutes per plan role (the coach's), when stated. */
    minutesByRole: Record<string, [number, number]>;
    maxHardSessions: number;
    easyStartWeeks: number;
    /** Short sleep or sleep/stress named as an obstacle → no hard sessions (OPTIM heuristic — recovery is the limiter). */
    recoveryLimited: boolean;
    maxWeeklyIncreasePct: number;
    measures: string[];
  };
  zones: { hrMaxEstimate: number; basis: string; bands: Record<string, [number, number]> } | null;
  modalitiesLegend: string;
  modalities: string[];
  safety: { noVigorous: boolean; noHeartRate: boolean; minor: boolean; warnings: string[] };
  conflicts: string[];
  evidence: Array<{ ref: string; claim: string; source: string; params?: EvidenceClaim["parameters"] }>;
}

export interface CardioAllowed {
  coachRuleKeys: Set<string>;
  clientFactRefs: Set<string>;
  knowledgeRefs: Set<string>;
  constraintIds: Set<string>;
  /** Offered modalities (fit "-"), by id. */
  modalities: Map<string, ModalityOption>;
  roles: Set<string>;
  intensityMethods: Set<string>;
}

/** Which plan roles the coach's method allows for this purpose. */
export function allowedRoles(method: CardioMethod, purpose: CardioPurpose): CardioPlan["role"][] {
  if (method.kind === "endurance") return ["aerobic_base", "conditioning", "recovery"];
  const r = new Set<CardioRole>(method.roles.value);
  const out: CardioPlan["role"][] = [];
  if (r.has("fat_loss") && purpose === "fat_loss_support") out.push("fat_loss");
  if (r.has("health")) out.push("health");
  if (r.has("conditioning")) out.push("conditioning", ...(purpose === "aerobic_base" ? (["aerobic_base"] as const) : []));
  if (r.has("optional_low_intensity")) out.push("recovery");
  return out;
}

export function buildCardioInput(params: { input: SynthesisInput; knowledge: FitnessKnowledgeRegistry; method: CardioMethod; purpose: CardioPurpose; hybrid: boolean; resistance: ResistanceWeek | null; options: ModalityOption[]; safety: CardioSafety; conflicts: string[]; promptVersion: string }): { reasoning: CardioReasoningInput; allowed: CardioAllowed } {
  const { input, method } = params;
  const c = input.client;
  const rules: CardioReasoningInput["coach"]["rules"] = [];
  const rule = (key: string | undefined, labelText: string, value: unknown) => key && value !== undefined && value !== null && rules.push([key, labelText, value]);
  const rng = (r: { min: number; max: number }) => [r.min, r.max];
  rule(method.roles.keys[0], method.kind === "endurance" ? "endurance coach" : "cardio roles", method.roles.value);
  for (const [role, v] of Object.entries(method.minutesByRole)) rule(v!.keys[0], `${role.replace(/_/g, " ")} minutes/week`, rng(v!.value));
  if (method.intensityMethods) rule(method.intensityMethods.keys[0], "intensity guided by", method.intensityMethods.value);
  if (method.stepsTarget) rule(method.stepsTarget.keys[0], "steps/day", rng(method.stepsTarget.value));
  const e = method.endurance;
  if (e?.days) rule(e.days.keys[0], "endurance days/week", rng(e.days.value));
  if (e?.weeklyHours) rule(e.weeklyHours.keys[0], "weekly hours", rng(e.weeklyHours.value));
  if (e?.hardSessions) rule(e.hardSessions.keys[0], "hard sessions/week", rng(e.hardSessions.value));
  if (e?.intensityMix) rule(e.intensityMix.keys[0], "intensity distribution", e.intensityMix.value);
  if (e?.weeklyIncreasePct) rule(e.weeklyIncreasePct.keys[0], "max weekly increase %", rng(e.weeklyIncreasePct.value));
  if (e?.downWeeks) rule(e.downWeeks.keys[0], "down weeks", e.downWeeks.value);

  const factList = [c.body.age, c.body.sex, c.body.weightLb, c.schedule.availableDays, c.schedule.maxSessionLength, c.schedule.preferredTimes, c.schedule.predictability, c.schedule.dailyActivity, c.training.experience, c.training.recentConsistency, c.training.currentSessionsPerWeek, c.training.cardioPreference, c.recovery.sleep, c.recovery.obstacles, c.equipment.environments, c.goals.primary, c.goals.secondary, c.goals.successDefinition] as Array<Fact<unknown>>;
  const facts: Record<string, unknown> = {};
  for (const f of factList) if (isKnown(f)) facts[f.source.ref] = f.value;
  const missing = ([c.schedule.availableDays, c.schedule.maxSessionLength, c.training.experience, c.body.age] as Fact<unknown>[]).filter((f) => !isKnown(f)).map((f) => (f as { ref?: string }).ref ?? "unknown");

  const roles = allowedRoles(method, params.purpose);
  const minutesByRole: Record<string, [number, number]> = {};
  if (method.kind === "endurance" && e?.weeklyHours) for (const r of roles) minutesByRole[r] = [Math.round(e.weeklyHours.value.min * 60), Math.round(e.weeklyHours.value.max * 60)];
  else {
    if (method.minutesByRole.fat_loss) minutesByRole.fat_loss = rng(method.minutesByRole.fat_loss.value) as [number, number];
    if (method.minutesByRole.health) minutesByRole.health = rng(method.minutesByRole.health.value) as [number, number];
    if (method.minutesByRole.conditioning) minutesByRole.conditioning = minutesByRole.aerobic_base = rng(method.minutesByRole.conditioning.value) as [number, number];
  }
  const exp = isKnown(c.training.experience) ? c.training.experience.value : null;
  const recent = isKnown(c.training.recentConsistency) ? c.training.recentConsistency.value : null;
  const beginner = exp === "new" || exp === "learning_fundamentals" || recent === "not_recently";
  const sleep = isKnown(c.recovery.sleep) ? c.recovery.sleep.value : null;
  const obstacles = isKnown(c.recovery.obstacles) ? (c.recovery.obstacles.value as string[]) : [];
  const recoveryLimited = sleep === "under_6" || obstacles.includes("sleep") || obstacles.includes("stress");
  const onlyOptional = method.kind === "general" && method.roles.value.every((r) => r === "optional_low_intensity");
  const maxHard = params.safety.noVigorous || onlyOptional || recoveryLimited ? 0 : method.kind === "endurance" && e?.hardSessions ? e.hardSessions.value.max : DEFAULT_MAX_HARD_SESSIONS;
  const len = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value : null;
  const age = isKnown(c.body.age) ? c.body.age.value : null;
  const hrAllowed = !!method.intensityMethods?.value.includes("heart_rate") && !params.safety.noHeartRate && age !== null;
  const offered = params.options.filter((o) => o.fit.state === "compatible");
  const L = (l: string) => l[0].toUpperCase();
  const goalClass = input.goal.primary?.class ?? null;
  const { claims } = conceptClaims(params.knowledge, CARDIO_TOPICS_RETRIEVED, (claim) => {
    const g = claim.appliesTo?.goalClasses;
    return !g || !goalClass || g.includes(goalClass);
  });

  const reasoning: CardioReasoningInput = {
    v: { reasoner: CARDIO_REASONER_VERSION, prompt: params.promptVersion, knowledge: params.knowledge.version },
    purpose: params.purpose,
    hybrid: params.hybrid,
    goal: { primary: goalClass, secondary: input.goal.secondary.map((s) => s.class), success: isKnown(input.goal.successDefinition) ? input.goal.successDefinition.value : null },
    coach: { method: `v${method.version}`, kind: method.kind, rules, allowedRoles: roles, intensityMethods: method.intensityMethods?.value ?? ["talk_test", "rpe"] },
    client: { facts, missing },
    resistance: params.resistance,
    bounds: {
      availableDays: isKnown(c.schedule.availableDays) ? c.schedule.availableDays.value : [],
      sessionCapMinutes: len && !len.openEnded ? len.minutes : null,
      minutesByRole,
      maxHardSessions: maxHard,
      easyStartWeeks: beginner ? 2 : 0,
      recoveryLimited,
      maxWeeklyIncreasePct: e?.weeklyIncreasePct ? e.weeklyIncreasePct.value.max : DEFAULT_MAX_WEEKLY_INCREASE_PCT,
      measures: [...CARDIO_MEASURES],
    },
    zones: hrAllowed ? { hrMaxEstimate: Math.round(208 - 0.7 * age!), basis: "Age-predicted HRmax = 208 − 0.7 × age (Tanaka 2001) — an estimate; bands are OPTIM curation.", bands: HR_BANDS } : null,
    modalitiesLegend: MODALITY_ROW_LEGEND,
    modalities: offered.map((o) => [o.modality.id, o.modality.name, o.modality.supports.map((s) => (s === "steady" ? "S" : "I")).join(""), o.modality.demands.impact ?? "none", L(o.modality.lowerBodyInterference), o.modality.skill, o.equipment, "-"].join("|")),
    safety: { noVigorous: params.safety.noVigorous, noHeartRate: params.safety.noHeartRate, minor: params.safety.minor, warnings: params.safety.warnings },
    conflicts: params.conflicts,
    evidence: claims.map((x) => ({ ref: x.ref, claim: x.statement, source: x.support, ...(x.parameters ? { params: x.parameters } : {}) })),
  };
  return {
    reasoning,
    allowed: {
      coachRuleKeys: new Set(rules.map((r) => r[0])),
      clientFactRefs: new Set(Object.keys(facts)),
      knowledgeRefs: new Set(claims.map((x) => x.ref)),
      constraintIds: new Set(),
      modalities: new Map(offered.map((o) => [o.modality.id, o])),
      roles: new Set([...roles, "none"]),
      intensityMethods: new Set(method.intensityMethods?.value ?? ["talk_test", "rpe"]),
    },
  };
}
