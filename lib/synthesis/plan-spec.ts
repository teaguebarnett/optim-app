// Gate 4.0C-1 — PlanSpecification: the planner's OUTPUT contract, before
// it becomes a proposal. Every decision carries its rationale, the
// deterministic rule that made it and the inputs it used; the whole spec
// carries provenance. Domain sections are optional — a resistance planner
// fills training sections, a nutrition planner fills nutrition.
//
// validatePlanSpecification is the gate between a planner and a proposal:
// a spec that skips a hard constraint, schedules a day the client isn't
// available, or leaves the frequency bounds is rejected — not repaired.

import type { DayOfWeek } from "../types.ts";
import type { GoalClass } from "./goal-contract.ts";
import type { KnowledgeRef } from "./knowledge/types.ts";
import type { InputProvider } from "./readiness.ts";
import { hardConstraints, type ConstraintConfirmation } from "./constraints.ts";
import { isKnown } from "./facts.ts";
import type { SynthesisInput } from "./synthesis-input.ts";

export type PlanDomain = "resistance" | "endurance" | "conditioning" | "nutrition" | "general_fitness";

export interface ProvenanceRecord {
  knowledge: { version: string; entries: KnowledgeRef[] };
  coachBrain: { versionId: string; version: number } | null;
  /** Fact refs from ClientState the plan used. */
  clientInputs: string[];
  /** Goal fields the plan used. */
  goalInputs: string[];
  constraints: Array<{ id: string; confirmation: ConstraintConfirmation }>;
  /** Deterministic rule ids applied, in order. */
  rules: string[];
  planner: { id: string; version: string };
  generatedAtIso: string;
  /** Model involvement: null for deterministic planners; for the Fitness
   * Reasoner, exactly which model, prompt and reasoner version produced it. */
  model: null | { provider: string; modelId: string; promptVersion: string; reasonerVersion: string; attempts: number };
}

export type DecisionBasis = "coach_method" | "knowledge" | "client_input" | "planner_rule" | "coach_override";

export interface Decided<T> {
  value: T;
  rationale: string;
  rule: string;
  basis: DecisionBasis;
  /** Fact refs / knowledge ids / coach-method keys this decision read. */
  inputs: string[];
}

export interface NumberRange {
  min: number;
  max: number;
}

export interface SessionPurpose {
  day: DayOfWeek;
  /** e.g. "lower_strength", "upper_hypertrophy", "zone_2", "intervals". */
  purpose: string;
  domain: PlanDomain;
}

/** A non-blocking concern surfaced to the coach (never hidden). */
export interface QualityFinding {
  code: string;
  severity: "warning" | "info";
  message: string;
}

export interface ResistanceExercisePlan {
  exerciseId: string;
  role: "main" | "accessory";
  /** The session target this exercise was selected to cover. */
  target: string;
  selection: { score: number; factors: Array<{ factor: string; points: number }>; alternatives: string[]; repeatedReason?: string };
}

export interface ResistanceSessionPlan {
  day: DayOfWeek;
  purpose: string;
  targets: string[];
  exercises: ResistanceExercisePlan[];
  estimatedMinutes: number;
}

export interface ExercisePrescription {
  sets: number;
  reps: NumberRange;
  effort: { metric: "rpe" | "rir" | "plain"; target: number | string; rirRange: NumberRange | null };
  restMinutes: NumberRange | null;
}

export interface ResistanceWeekPlan {
  week: number;
  kind: "build" | "deload";
  /** Why this week's targets differ from (or match) the previous week. */
  note: string;
  /** One entry per session, one prescription per exercise (same order as sessions). */
  sessions: ExercisePrescription[][];
}

export interface ResistanceDetail {
  emphasis: { primary: "strength" | "hypertrophy" | "general"; secondary: "strength" | "hypertrophy" | null };
  sessions: ResistanceSessionPlan[];
  weeks: ResistanceWeekPlan[];
  /** Direct (primary-muscle) and indirect (secondary) weekly sets per muscle, from week 1. */
  weeklyMuscleSets: Record<string, { direct: number; indirect: number }>;
  progressionRules: Array<{ role: "main" | "accessory"; methods: string[]; rule: string }>;
}

export interface PlanSpecification {
  clientProfileId: string;
  domain: PlanDomain;
  goalClass: GoalClass;
  frequency: Decided<number>;
  /** The days scheduled — a subset of availability, sorted by the week. */
  schedule: Decided<DayOfWeek[]>;
  weeklyStructure: Decided<{ name: string; sessions: SessionPurpose[] }>;
  durationWeeks?: Decided<number>;
  targets?: Decided<Array<{ metric: string; value?: number; unit?: string; byDateIso?: string }>>;
  volume?: Decided<{ unit: "sets_per_muscle_per_week" | "sets_per_session" | "minutes_per_week" | "distance_per_week"; byTarget: Record<string, NumberRange> }>;
  intensity?: Decided<{ method: "rir" | "rpe" | "percent_1rm" | "heart_rate_zone" | "pace" | "plain_language"; range: NumberRange | null; note?: string }>;
  progression?: Decided<{ model: string; rule: string }>;
  recovery?: Decided<{ deloadEveryWeeks: number | null; approach: string }>;
  conditioning?: Decided<{ sessionsPerWeek: number; modalities: string[] }>;
  nutrition?: Decided<{ energyDirection: "deficit" | "maintenance" | "surplus"; proteinGramsPerKg?: NumberRange }>;
  monitoring?: Decided<{ metrics: string[]; cadence: string }>;
  resistance?: Decided<ResistanceDetail>;
  quality?: QualityFinding[];
  /** Every effective hard constraint must appear here, with how it shaped the plan. */
  constraintsApplied: Array<{ constraintId: string; how: string }>;
  /** Anything the planner assumed rather than knew — stated, never hidden. */
  assumptions: Array<{ statement: string; basis: DecisionBasis }>;
  /** Open items the coach should see (non-blocking). */
  unresolved: Array<{ fact: string; why: string; providedBy: InputProvider }>;
  provenance: ProvenanceRecord;
}

export type PlanValidation = { ok: true } | { ok: false; errors: string[] };

export function validatePlanSpecification(spec: PlanSpecification, input: SynthesisInput): PlanValidation {
  const errors: string[] = [];
  if (spec.clientProfileId !== input.client.clientProfileId) errors.push("Spec belongs to a different client.");

  const applied = new Set(spec.constraintsApplied.map((c) => c.constraintId));
  for (const c of hardConstraints(input.constraints)) {
    if (!applied.has(c.id)) errors.push(`Hard constraint not accounted for: ${c.id}`);
  }

  const available = isKnown(input.client.schedule.availableDays) ? new Set(input.client.schedule.availableDays.value) : null;
  if (!available) errors.push("Schedule decided without known availability.");
  else for (const d of spec.schedule.value) if (!available.has(d)) errors.push(`Scheduled ${d}, which the client isn't available.`);
  if (new Set(spec.schedule.value).size !== spec.schedule.value.length) errors.push("Schedule repeats a day.");
  if (spec.schedule.value.length !== spec.frequency.value) errors.push("Schedule length doesn't match frequency.");

  const { min, max } = input.bounds.frequency;
  if (min === null || max === null) errors.push("Frequency decided without bounds.");
  else if (spec.frequency.value < min || spec.frequency.value > max) errors.push(`Frequency ${spec.frequency.value} is outside ${min}–${max}.`);

  const p = spec.provenance;
  if (p.knowledge.version !== input.knowledge.version) errors.push("Provenance knowledge version doesn't match the input.");
  if ((p.coachBrain?.versionId ?? null) !== (input.coach?.versionId ?? null)) errors.push("Provenance Coach Brain version doesn't match the input.");
  if (p.model !== null && !(p.model.modelId && p.model.promptVersion && p.model.reasonerVersion)) errors.push("Model involvement must record the model, prompt and reasoner versions.");
  if (p.rules.length === 0) errors.push("Provenance names no deterministic rule.");

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
