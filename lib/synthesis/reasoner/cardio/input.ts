// Cardio Reasoner V1.1 — the compact canonical input and the Allowed sets the validator checks against. Same
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
import type { CardioCapacity, ResistanceWeek, ScheduleConflict } from "../../cardio/schedule.ts";
import { CARDIO_MEASURES, type CardioPlan } from "./contract.ts";

export const CARDIO_REASONER_VERSION = "cardio-reasoner-v1.2.0";
export const CARDIO_TOPICS_RETRIEVED = ["dose", "intensity", "interval_training", "concurrent_training", "progression", "weight_management", "screening"];
export const MODALITY_ROW_LEGEND = "id|name|types (S steady, I intervals)|impact|lower-body interference (N/L/M/H)|skill|equipment state (available / assumed: standard commercial-gym machine / unknown: coach confirms)|fit (- fits the confirmed restrictions; U uncertain — not offered)";

/** Absent a coach rule: weekly cardio-minute increase cap (internal pacing default — the 10% rule itself didn't
 * prevent injuries in the verified trial; concept.cardio.progression). */
export const DEFAULT_MAX_WEEKLY_INCREASE_PCT = 20;
/** Absent a coach rule: hard (vigorous/interval) sessions per week for non-endurance clients (internal heuristic). */
export const DEFAULT_MAX_HARD_SESSIONS = 2;
/** % of age-predicted HRmax per intensity — internal curation (the verified abstracts give no zone percentages). */
/** The cardio modalities that ARE each endurance sport (triathlon = all three). */
export const DISCIPLINE_MODALITIES: Record<string, string[]> = { running: ["cardio.running"], cycling: ["cardio.cycling_outdoor", "cardio.cycling_stationary"], swimming: ["cardio.swimming"], rowing: ["cardio.rowing"], triathlon: ["cardio.swimming", "cardio.cycling_outdoor", "cardio.cycling_stationary", "cardio.running"] };
export const HR_BANDS: Record<"easy" | "moderate" | "vigorous", [number, number]> = { easy: [55, 70], moderate: [70, 80], vigorous: [80, 92] };

export interface CardioReasoningInput {
  v: { reasoner: string; prompt: string; knowledge: string };
  purpose: CardioPurpose;
  hybrid: boolean;
  goal: { primary: string | null; secondary: string[]; success: string | null };
  coach: {
    method: string;
    kind: "general" | "endurance";
    rules: Array<[string, string, unknown]>;
    allowedRoles: string[];
    /** What each allowed role means in this coach's method, its source, and its weekly-minute range (null = none set). */
    roles: Array<{ role: string; meaning: string; basis: string; minutes: [number, number] | null }>;
    intensityMethods: string[];
  };
  client: { facts: Record<string, unknown>; missing: string[] };
  resistance: ResistanceWeek | null;
  /** What each available day can hold — lifting minutes are the approved program's and never change. */
  capacity: CardioCapacity;
  /** Endurance coaches: the client's discipline when it's determinable from the coach's method (one sport). */
  endurance: { sports: string[]; discipline: string | null; disciplineModalities: string[]; longSession: { maxMinutes: number } | { maxPercent: number } | null; downEvery: [number, number] | null } | null;
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
  conflicts: ScheduleConflict[];
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

/** The plan roles the coach's method allows for this purpose, what each means, and where it comes from. */
export function allowedRoles(method: CardioMethod, purpose: CardioPurpose): Array<{ role: CardioPlan["role"]; meaning: string; basis: string; minutesKey: string | null }> {
  if (method.kind === "endurance")
    return [
      { role: "aerobic_base", meaning: "Aerobic base development in the coach's endurance method.", basis: "coaching_areas: endurance", minutesKey: "e_weekly_volume" },
      { role: "conditioning", meaning: "Endurance conditioning in the coach's method.", basis: "coaching_areas: endurance", minutesKey: "e_weekly_volume" },
      { role: "recovery", meaning: "Easy recovery sessions inside the coach's endurance week.", basis: "coaching_areas: endurance", minutesKey: "e_weekly_volume" },
    ];
  const r = new Set<CardioRole>(method.roles.value);
  const out: ReturnType<typeof allowedRoles> = [];
  if (r.has("fat_loss") && purpose === "fat_loss_support") out.push({ role: "fat_loss", meaning: "Cardio as part of the coach's fat-loss work.", basis: "t_cardio_roles: fat_loss", minutesKey: "t_cardio_fat_loss_minutes" });
  if (r.has("health")) out.push({ role: "health", meaning: "Cardio for general health.", basis: "t_cardio_roles: health", minutesKey: "t_cardio_health_minutes" });
  if (r.has("conditioning")) {
    out.push({ role: "conditioning", meaning: "Conditioning, which this coach prescribes for everyone.", basis: "t_cardio_roles: conditioning", minutesKey: "t_conditioning_minutes" });
    if (purpose === "aerobic_base") out.push({ role: "aerobic_base", meaning: "Aerobic base work for this client's endurance aim — OPTIM's reading of the coach's conditioning role (same minutes); confirm it with the coach.", basis: "derived from t_cardio_roles: conditioning", minutesKey: "t_conditioning_minutes" });
  }
  if (r.has("optional_low_intensity")) out.push({ role: "optional_low_intensity", meaning: "The coach's optional, low-intensity extra: every session optional and easy — never a required program. The coach set no minute range for it.", basis: "t_cardio_roles: optional_low_intensity", minutesKey: null });
  return out;
}

export function buildCardioInput(params: { input: SynthesisInput; knowledge: FitnessKnowledgeRegistry; method: CardioMethod; purpose: CardioPurpose; hybrid: boolean; resistance: ResistanceWeek | null; capacity: CardioCapacity; options: ModalityOption[]; safety: CardioSafety; conflicts: ScheduleConflict[]; promptVersion: string }): { reasoning: CardioReasoningInput; allowed: CardioAllowed } {
  const { input, method } = params;
  const c = input.client;
  const rules: CardioReasoningInput["coach"]["rules"] = [];
  const rule = (key: string | undefined, labelText: string, value: unknown) => key && value !== undefined && value !== null && rules.push([key, labelText, value]);
  const rng = (r: { min: number; max: number }) => [r.min, r.max];
  const roleDefs = allowedRoles(method, params.purpose);
  const usedMinuteKeys = new Set(roleDefs.map((r) => r.minutesKey).filter(Boolean));
  rule(method.roles.keys[0], method.kind === "endurance" ? "endurance coach" : "cardio roles", method.roles.value);
  // Only the minute ranges of roles that apply here — another role's budget is never offered as this one's.
  for (const [role, v] of Object.entries(method.minutesByRole)) if (usedMinuteKeys.has(v!.keys[0])) rule(v!.keys[0], `${role.replace(/_/g, " ")} minutes/week`, rng(v!.value));
  if (method.intensityMethods) rule(method.intensityMethods.keys[0], "intensity guided by", method.intensityMethods.value);
  if (method.stepsTarget) rule(method.stepsTarget.keys[0], "steps/day", rng(method.stepsTarget.value));
  const e = method.endurance;
  if (e?.days) rule(e.days.keys[0], "endurance days/week", rng(e.days.value));
  if (e?.weeklyHours) rule(e.weeklyHours.keys[0], "weekly hours", rng(e.weeklyHours.value));
  if (e?.hardSessions) rule(e.hardSessions.keys[0], "hard sessions/week", rng(e.hardSessions.value));
  if (e?.intensityMix) rule(e.intensityMix.keys[0], "intensity distribution", e.intensityMix.value);
  if (e?.weeklyIncreasePct) rule(e.weeklyIncreasePct.keys[0], "max weekly increase %", rng(e.weeklyIncreasePct.value));
  if (e?.downWeeks) rule(e.downWeeks.keys[0], "down weeks", e.downWeeks.value);
  if (e?.downEvery) rule(e.downEvery.keys[0], "down week every (weeks)", rng(e.downEvery.value));
  if (e?.longSession) rule(e.longSession.keys[0], "long-session cap", e.longSession.value);
  if (e?.sports) rule(e.sports.keys[0], "endurance sports coached", e.sports.value);

  const factList = [c.body.age, c.body.sex, c.body.weightLb, c.schedule.availableDays, c.schedule.maxSessionLength, c.schedule.preferredTimes, c.schedule.predictability, c.schedule.dailyActivity, c.training.experience, c.training.recentConsistency, c.training.currentSessionsPerWeek, c.training.cardioPreference, c.recovery.sleep, c.recovery.obstacles, c.equipment.environments, c.goals.primary, c.goals.secondary, c.goals.successDefinition] as Array<Fact<unknown>>;
  const facts: Record<string, unknown> = {};
  for (const f of factList) if (isKnown(f)) facts[f.source.ref] = f.value;
  const missing = ([c.schedule.availableDays, c.schedule.maxSessionLength, c.training.experience, c.body.age] as Fact<unknown>[]).filter((f) => !isKnown(f)).map((f) => (f as { ref?: string }).ref ?? "unknown");

  const minutesOf = (key: string | null): [number, number] | null => {
    if (!key) return null;
    if (key === "e_weekly_volume") return e?.weeklyHours ? [Math.round(e.weeklyHours.value.min * 60), Math.round(e.weeklyHours.value.max * 60)] : null;
    const v = Object.values(method.minutesByRole).find((x) => x!.keys[0] === key);
    return v ? (rng(v.value) as [number, number]) : null;
  };
  const minutesByRole: Record<string, [number, number]> = {};
  for (const r of roleDefs) {
    const m = minutesOf(r.minutesKey);
    if (m) minutesByRole[r.role] = m;
  }
  const roles = roleDefs.map((r) => r.role);
  const exp = isKnown(c.training.experience) ? c.training.experience.value : null;
  const recent = isKnown(c.training.recentConsistency) ? c.training.recentConsistency.value : null;
  const beginner = exp === "new" || exp === "learning_fundamentals" || recent === "not_recently";
  const sleep = isKnown(c.recovery.sleep) ? c.recovery.sleep.value : null;
  const obstacles = isKnown(c.recovery.obstacles) ? (c.recovery.obstacles.value as string[]) : [];
  const recoveryLimited = sleep === "under_6" || obstacles.includes("sleep") || obstacles.includes("stress");
  // The coach's only cardio is an optional LOW-INTENSITY extra → no hard sessions (coach authority, not an OPTIM limit).
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
    coach: { method: `v${method.version}`, kind: method.kind, rules, allowedRoles: roles, roles: roleDefs.map((r) => ({ role: r.role, meaning: r.meaning, basis: r.basis, minutes: minutesByRole[r.role] ?? null })), intensityMethods: method.intensityMethods?.value ?? ["talk_test", "rpe"] },
    client: { facts, missing },
    resistance: params.resistance,
    capacity: params.capacity,
    endurance: e
      ? (() => {
          const sports = e.sports?.value ?? [];
          const discipline = sports.length === 1 ? sports[0] : null;
          return { sports, discipline, disciplineModalities: discipline ? (DISCIPLINE_MODALITIES[discipline] ?? []) : [], longSession: e.longSession?.value ?? null, downEvery: e.downEvery ? (rng(e.downEvery.value) as [number, number]) : null };
        })()
      : null,
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
