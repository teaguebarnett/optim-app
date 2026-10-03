// Gate 4.0C-3 — representative coaching scenarios for the evaluation
// harness. Each scenario has an input, HARD assertions (must hold for any
// model) and is scored on reviewable quality criteria. Subjective coaching
// quality is reported for human review, not asserted.

import type { ReasonerResult } from "../reasoner.ts";
import { coachMethod, layer, range, restrict, scenarioInput } from "./fixtures.ts";
import type { SynthesisInput } from "../../synthesis-input.ts";

export interface Scenario {
  id: string;
  title: string;
  input: () => SynthesisInput;
  /** Returns failure messages (empty = pass). */
  hard: (r: ReasonerResult, input: SynthesisInput) => string[];
  /** Whether a model call is expected at all. */
  expectsModel: boolean;
}

const planned = (r: ReasonerResult) => (r.status === "PLANNED" ? r : null);
const exercises = (r: ReasonerResult, input: SynthesisInput) => (planned(r)?.plan.sessions.flatMap((s) => s.exercises.map((e) => input.knowledge.getExercise(e.exerciseId)!)) ?? []);

export const SCENARIOS: Scenario[] = [
  {
    id: "A",
    title: "Hypertrophy, 7 days available — should not automatically train 7 days",
    input: () => scenarioInput({ coach: coachMethod({ t_days: layer(range(3, 6, "days/week")) }) }),
    expectsModel: true,
    hard: (r) => (r.status !== "PLANNED" ? [`expected PLANNED, got ${r.status}`] : r.plan.frequency.daysPerWeek >= 7 ? ["planned 7 days"] : []),
  },
  {
    id: "B",
    title: "Strength client, 3 days available",
    input: () => scenarioInput({ patch: { what_you_want: { primaryGoal: "get_stronger" }, your_week: { availableDays: ["mon", "wed", "fri"] } } }),
    expectsModel: true,
    hard: (r) => (r.status !== "PLANNED" ? [`expected PLANNED, got ${r.status}`] : r.plan.schedule.days.some((d) => !["Monday", "Wednesday", "Friday"].includes(d)) ? ["scheduled outside availability"] : r.plan.goalEmphasis.primary !== "strength" ? ["emphasis isn't strength"] : []),
  },
  {
    id: "C",
    title: "Hypertrophy with hard squat / hinge / bracing restrictions",
    input: () => scenarioInput({ restrictions: restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }, { kind: "avoid_movement_pattern", pattern: "hinge" }, { kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]) }),
    expectsModel: true,
    hard: (r, input) => {
      if (r.status !== "PLANNED") return [`expected PLANNED, got ${r.status}`];
      const bad = exercises(r, input).filter((e) => e.patterns.includes("squat") || e.patterns.includes("hinge") || e.demands.bracing === "high");
      return bad.length ? [`restricted exercises used: ${bad.map((e) => e.name).join(", ")}`] : [];
    },
  },
  {
    id: "D",
    title: "Advanced lifter training 6 days; coach range 4–6",
    input: () => scenarioInput({ coach: coachMethod({ t_days: layer(range(4, 6, "days/week")) }), patch: { starting_point: { trainingExperience: "experienced_consistent", weeklyFrequency: 6, recentConsistency: "very_consistent" } } }),
    expectsModel: true,
    hard: (r) => (r.status !== "PLANNED" ? [`expected PLANNED, got ${r.status}`] : r.plan.frequency.daysPerWeek < 4 || r.plan.frequency.daysPerWeek > 6 ? ["frequency outside 4–6"] : []),
  },
  {
    id: "E",
    title: "Beginner, general resistance support (health & consistency)",
    input: () => scenarioInput({ patch: { what_you_want: { primaryGoal: "health_consistency" }, starting_point: { trainingExperience: "new", weeklyFrequency: 1, recentConsistency: "inconsistent" } } }),
    expectsModel: true,
    hard: (r) => (r.status !== "PLANNED" ? [`expected PLANNED, got ${r.status}`] : r.plan.domain !== "general_fitness" ? ["not routed to general fitness"] : r.plan.goalEmphasis.primary !== "general" ? ["treated as strength/hypertrophy"] : []),
  },
  {
    id: "F",
    title: "Availability below the coach's minimum",
    input: () => scenarioInput({ coach: coachMethod({ t_days: layer(range(4, 6, "days/week")) }), patch: { your_week: { availableDays: ["mon", "thu"] } } }),
    expectsModel: false,
    hard: (r) => (r.status !== "NEEDS_INPUT" ? [`expected NEEDS_INPUT, got ${r.status}`] : !r.missing.some((m) => m.fact === "frequency.coach_minimum_vs_availability" && m.providedBy === "coach") ? ["missing the coach decision"] : []),
  },
  {
    id: "G",
    title: "Unknown equipment / training environment",
    input: () => scenarioInput({ patch: { your_week: { trainingEnvironment: undefined } } }),
    expectsModel: false,
    hard: (r) => (r.status !== "NEEDS_INPUT" ? [`expected NEEDS_INPUT, got ${r.status}`] : !r.missing.some((m) => /trainingEnvironment/.test(m.fact)) ? ["didn't ask for the environment"] : []),
  },
  {
    id: "H",
    title: "Missing decision-critical data (training experience)",
    input: () => scenarioInput({ patch: { starting_point: { trainingExperience: undefined } } }),
    expectsModel: false,
    hard: (r) => (r.status !== "NEEDS_INPUT" ? [`expected NEEDS_INPUT, got ${r.status}`] : !r.missing.some((m) => /trainingExperience/.test(m.fact)) ? ["didn't ask for experience"] : []),
  },
  {
    id: "I",
    title: "Repeated exercise contraindications (coach-excluded exercises)",
    input: () =>
      scenarioInput({
        restrictions: restrict(["exercise.barbell_bench_press", "exercise.overhead_press", "exercise.barbell_row", "exercise.pull_up", "exercise.barbell_back_squat", "exercise.conventional_deadlift", "exercise.leg_press"].map((exerciseId) => ({ kind: "avoid_exercise" as const, exerciseId }))),
      }),
    expectsModel: true,
    hard: (r, input) => {
      if (r.status !== "PLANNED") return [`expected PLANNED, got ${r.status}`];
      const banned = new Set(["exercise.barbell_bench_press", "exercise.overhead_press", "exercise.barbell_row", "exercise.pull_up", "exercise.barbell_back_squat", "exercise.conventional_deadlift", "exercise.leg_press"]);
      const used = exercises(r, input).filter((e) => banned.has(e.id));
      return used.length ? [`excluded exercises used: ${used.map((e) => e.name).join(", ")}`] : [];
    },
  },
  {
    id: "J",
    title: "Marathon goal — must route to endurance, never resistance",
    input: () => scenarioInput({ patch: { what_you_want: { primaryGoal: "something_else", primaryGoalOther: "Run my first marathon in April" } } }),
    expectsModel: false,
    hard: (r) => (r.status !== "DOMAIN_NOT_YET_SUPPORTED" ? [`expected DOMAIN_NOT_YET_SUPPORTED, got ${r.status}`] : r.routing.primary !== "endurance" ? [`routed to ${r.routing.primary}`] : []),
  },
];

/** Reviewable quality criteria — reported, not asserted. */
export function qualityReport(r: ReasonerResult, s: Scenario): Record<string, string> {
  const out: Record<string, string> = { status: r.status };
  if (r.status !== "PLANNED") {
    out.missing_data_honesty = r.status === "NEEDS_INPUT" ? `asks: ${r.missing.map((m) => m.fact).join(", ")}` : r.status === "DOMAIN_NOT_YET_SUPPORTED" ? `routed ${r.routing.primary}` : "—";
    return out;
  }
  const p = r.plan;
  const titles = p.sessions.map((x) => x.title);
  const repeats = r.quality.filter((q) => q.code === "exercise_repeated").length;
  out.domain = `${p.domain} (expected per routing)`;
  out.frequency = `${p.frequency.daysPerWeek} days — ${p.frequency.rationale}`;
  out.structure = `${p.architecture.split}: ${p.architecture.rationale}`;
  out.session_purposes = p.sessions.map((x) => `${x.day}: ${x.title} — ${x.purpose}`).join(" | ");
  out.distinct_session_titles = `${new Set(titles).size}/${titles.length}`;
  out.unexplained_repeats = String(repeats);
  out.progression = `${p.progression.model} — ${p.progression.rationale}`;
  out.warnings = r.quality.filter((q) => q.severity === "warning").map((q) => q.message).join(" | ") || "none";
  out.conflicts_reported = p.conflicts.map((c) => c.issue).join(" | ") || "none";
  out.provenance = r.quality.some((q) => q.code === "unattributed_decision") ? "some decisions unattributed" : "all main decisions cite inputs";
  out.attempts = String(r.attempts);
  void s;
  return out;
}
