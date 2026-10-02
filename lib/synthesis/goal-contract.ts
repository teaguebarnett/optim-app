// Gate 4.0C-1 — GoalContract: the outcome a plan is trying to produce.
//
// Derived from the client's own goal answers (client_reported) until a coach
// confirms it. Each goal class carries only the fields that make sense for
// it: a weight-change goal has a baseline, target, timeline and rate;
// recomposition has an emphasis, never a target weight; an event goal has an
// event and date. Anything the client didn't give stays missing — nothing
// is invented (a timeline or rate is never chosen here).

import { isKnown, known, missing, type Fact, type FactBasis, type FactSource } from "./facts.ts";
import type { ClientState } from "./client-state.ts";

export type GoalClass =
  | "strength"
  | "hypertrophy"
  | "fat_loss"
  | "weight_gain"
  | "maintenance"
  | "recomposition"
  | "endurance"
  | "event_performance"
  | "sport_performance"
  | "general_fitness"
  | "other";

export interface WeightChangeTimeline {
  targetDateIso: string | null;
  flexibility: "fixed" | "flexible";
}

export type GoalSpec =
  | {
      class: "fat_loss" | "weight_gain";
      direction: "decrease" | "increase";
      baselineWeightLb: Fact<number>;
      targetWeightLb: Fact<number>;
      timeline: Fact<WeightChangeTimeline>;
      /** Desired or coach-allowed rate, % of bodyweight per week. */
      ratePercentPerWeek: Fact<number>;
    }
  | { class: "maintenance"; baselineWeightLb: Fact<number>; acceptableBandPercent: Fact<number> }
  | { class: "recomposition"; emphasis: Fact<"muscle_first" | "fat_loss_first" | "balanced"> }
  | { class: "hypertrophy"; priorityMuscles: Fact<string[]> }
  | { class: "strength"; priorityLifts: Fact<string[]>; baselines: Fact<Record<string, number>> }
  | { class: "endurance" | "event_performance"; event: Fact<string>; eventDateIso: Fact<string>; currentBaseline: Fact<string> }
  | { class: "sport_performance"; sport: Fact<string>; seasonPhase: Fact<string> }
  | { class: "general_fitness" }
  | { class: "other"; description: Fact<string> };

export type GoalEntry = GoalSpec & { basis: FactBasis; source: FactSource };

export interface GoalContract {
  clientProfileId: string;
  /** Null when the client hasn't stated a primary goal. */
  primary: GoalEntry | null;
  secondary: GoalEntry[];
  successDefinition: Fact<string>;
  /** "client_reported" until a coach confirms the contract. */
  confirmation: "client_reported" | "coach_confirmed";
}

/** The intake's goal options → goal classes. */
const INTAKE_GOAL_CLASS: Record<string, GoalClass> = {
  build_muscle: "hypertrophy",
  get_stronger: "strength",
  lose_fat: "fat_loss",
  body_recomposition: "recomposition",
  athletic_performance: "sport_performance",
  health_consistency: "general_fitness",
  something_else: "other",
};

function specFor(goalClass: GoalClass, state: ClientState, intakeValue: string): GoalSpec {
  switch (goalClass) {
    case "fat_loss":
    case "weight_gain":
      return {
        class: goalClass,
        direction: goalClass === "fat_loss" ? "decrease" : "increase",
        baselineWeightLb: state.body.weightLb,
        targetWeightLb: state.goals.targetWeightLb,
        timeline: missing("goal.timeline", "The intake doesn't ask for a timeline yet."),
        ratePercentPerWeek: missing("goal.ratePercentPerWeek", "No desired rate given; never chosen automatically."),
      };
    case "maintenance":
      return { class: "maintenance", baselineWeightLb: state.body.weightLb, acceptableBandPercent: missing("goal.acceptableBandPercent") };
    case "recomposition":
      return { class: "recomposition", emphasis: missing("goal.recompositionEmphasis") };
    case "hypertrophy":
      return { class: "hypertrophy", priorityMuscles: missing("goal.priorityMuscles") };
    case "strength":
      return { class: "strength", priorityLifts: missing("goal.priorityLifts"), baselines: missing("goal.strengthBaselines") };
    case "endurance":
    case "event_performance":
      return { class: goalClass, event: missing("goal.event"), eventDateIso: missing("goal.eventDate"), currentBaseline: missing("goal.enduranceBaseline") };
    case "sport_performance":
      return { class: "sport_performance", sport: missing("goal.sport"), seasonPhase: missing("goal.seasonPhase") };
    case "general_fitness":
      return { class: "general_fitness" };
    case "other":
      return {
        class: "other",
        description: intakeValue === "something_else" && isKnown(state.goals.primaryOther) ? state.goals.primaryOther : missing("goal.description"),
      };
  }
}

function entry(intakeValue: string, state: ClientState, sourceRef: string): GoalEntry | null {
  const goalClass = INTAKE_GOAL_CLASS[intakeValue];
  if (!goalClass) return null;
  return { ...specFor(goalClass, state, intakeValue), basis: "client_reported", source: { kind: "onboarding", ref: sourceRef } };
}

export function deriveGoalContract(state: ClientState): GoalContract {
  const primary = isKnown(state.goals.primary) ? entry(state.goals.primary.value, state, state.goals.primary.source.ref) : null;
  const secondary = isKnown(state.goals.secondary)
    ? state.goals.secondary.value.map((v) => entry(v, state, state.goals.secondary.status === "known" ? state.goals.secondary.source.ref : "onboarding.what_you_want.secondaryGoals")).filter((g): g is GoalEntry => !!g && g.class !== primary?.class)
    : [];
  return { clientProfileId: state.clientProfileId, primary, secondary, successDefinition: state.goals.successDefinition, confirmation: "client_reported" };
}

/** A coach-confirmed fact for a goal field (e.g. a timeline the coach and
 * client agreed). Returns a new contract — never mutates. */
export function withCoachConfirmedGoal(contract: GoalContract, primary: GoalSpec): GoalContract {
  return { ...contract, primary: { ...primary, basis: "coach_confirmed", source: { kind: "coach_brain", ref: "goal_contract.coach_confirmation" } }, confirmation: "coach_confirmed" };
}

export const coachFact = <T>(value: T, ref: string): Fact<T> => known(value, "coach_confirmed", { kind: "coach_brain", ref });
