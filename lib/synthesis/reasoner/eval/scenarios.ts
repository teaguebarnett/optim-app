// Gate 4.0C-3 / 3A — resistance evaluation set (25 scenarios).
//
// Each scenario has HARD assertions (must hold for any model, after the
// validator) and soft REVIEW flags (coaching expectations a human checks;
// a miss is classified into the failure taxonomy, never auto-scored as
// "excellent"). Subjective quality goes to the review pack.

import type { ReasonerResult } from "../reasoner.ts";
import type { SynthesisInput } from "../../synthesis-input.ts";
import type { FailureCategory } from "./taxonomy.ts";
import { coachMethod, layer, range, restrict, scenarioInput } from "./fixtures.ts";
import { apparatusGaps, resolveEquipmentAccess } from "../../planners/resistance/equipment-access.ts";

export interface Scenario {
  id: string;
  title: string;
  input: () => SynthesisInput;
  expectedStatus: "PLANNED" | "NEEDS_INPUT" | "DOMAIN_NOT_YET_SUPPORTED" | "PLANNED_OR_NEEDS_INPUT";
  hard: (r: ReasonerResult, input: SynthesisInput) => string[];
  review?: (r: ReasonerResult, input: SynthesisInput) => Array<{ ok: boolean; flag: string; category: FailureCategory }>;
  /** Whether the model is expected to be called at all. */
  expectsModel: boolean;
}

type Planned = Extract<ReasonerResult, { status: "PLANNED" }>;
const planned = (r: ReasonerResult): Planned | null => (r.status === "PLANNED" ? r : null);
const exs = (r: ReasonerResult, input: SynthesisInput) => planned(r)?.plan.sessions.flatMap((s) => s.exercises.map((e) => input.knowledge.getExercise(e.exerciseId)!)) ?? [];
const statusIs = (r: ReasonerResult, s: Scenario["expectedStatus"]) => (s === "PLANNED_OR_NEEDS_INPUT" ? (r.status === "PLANNED" || r.status === "NEEDS_INPUT" ? [] : [`expected PLANNED or NEEDS_INPUT, got ${r.status}`]) : r.status === s ? [] : [`expected ${s}, got ${r.status}`]);
const days = (keys: string[]) => ({ your_week: { availableDays: keys } });
const exp = (e: string, freq: number, consistency = "very_consistent") => ({ starting_point: { trainingExperience: e, weeklyFrequency: freq, recentConsistency: consistency } });
const goal = (primary: string, secondary: string[] = []) => ({ what_you_want: { primaryGoal: primary, secondaryGoals: secondary } });

function planScenario(id: string, title: string, input: () => SynthesisInput, extraHard?: (p: Planned, input: SynthesisInput) => string[], review?: Scenario["review"]): Scenario {
  return {
    id,
    title,
    input,
    expectedStatus: "PLANNED",
    expectsModel: true,
    hard: (r, inp) => {
      const s = statusIs(r, "PLANNED");
      if (s.length) return s;
      return extraHard ? extraHard(r as Planned, inp) : [];
    },
    review,
  };
}
const needsInput = (id: string, title: string, input: () => SynthesisInput, factRe: RegExp): Scenario => ({
  id,
  title,
  input,
  expectedStatus: "NEEDS_INPUT",
  expectsModel: false,
  hard: (r) => (r.status !== "NEEDS_INPUT" ? [`expected NEEDS_INPUT, got ${r.status}`] : !r.missing.some((m) => factRe.test(m.fact)) ? [`didn't ask for ${factRe}`] : []),
});
const flag = (ok: boolean, text: string, category: FailureCategory) => ({ ok, flag: text, category });
const mentions = (p: Planned, re: RegExp) => re.test(JSON.stringify([p.plan.assumptions, p.plan.unresolved, p.plan.conflicts, p.plan.decisions, p.plan.frequency, p.plan.goalEmphasis]));

export const SCENARIOS: Scenario[] = [
  planScenario("01", "Beginner hypertrophy, 3 days available", () => scenarioInput({ patch: { ...days(["mon", "wed", "fri"]), ...exp("new", 1, "inconsistent"), ...goal("build_muscle") } }), (p) => (p.plan.goalEmphasis.primary !== "hypertrophy" ? ["emphasis isn't hypertrophy"] : []), (r, inp) => {
    const p = planned(r)!;
    return [flag(exs(r, inp).every((e) => e.demands.skill !== "high"), "beginner avoids high-skill lifts", "REASONING_FAILURE"), flag(p.plan.frequency.daysPerWeek <= 3, "beginner trains ≤3 days", "REASONING_FAILURE")];
  }),
  planScenario("02", "Intermediate hypertrophy, 4 days available", () => scenarioInput({ patch: { ...days(["mon", "tue", "thu", "fri"]), ...exp("comfortable_common", 4), ...goal("build_muscle") } })),
  planScenario("03", "Advanced hypertrophy, 6 days available, trains 5", () => scenarioInput({ coach: coachMethod({ t_days: layer(range(3, 6, "days/week")) }), patch: { ...days(["mon", "tue", "wed", "thu", "fri", "sat"]), ...exp("experienced_consistent", 5), ...goal("build_muscle") } }), undefined, (r) => [flag(planned(r)!.plan.frequency.daysPerWeek >= 4, "advanced lifter gets ≥4 days", "REASONING_FAILURE")]),
  planScenario("04", "Beginner strength, 3 days", () => scenarioInput({ patch: { ...days(["mon", "wed", "fri"]), ...exp("learning_fundamentals", 2, "fairly_consistent"), ...goal("get_stronger") } }), (p) => (p.plan.goalEmphasis.primary !== "strength" ? ["emphasis isn't strength"] : [])),
  planScenario("05", "Advanced strength, only 3 days", () => scenarioInput({ patch: { ...days(["tue", "thu", "sat"]), ...exp("experienced_consistent", 5), ...goal("get_stronger") } }), (p) => (p.plan.frequency.daysPerWeek > 3 ? ["more days than available"] : []), (r) => [flag(planned(r)!.plan.sessions.every((s) => s.exercises.some((e) => e.role === "main")), "every session has a main lift", "REASONING_FAILURE")]),
  planScenario("06", "Mixed: hypertrophy primary, strength secondary", () => scenarioInput({ patch: { ...goal("build_muscle", ["get_stronger"]) } }), undefined, (r) => [flag(planned(r)!.plan.goalEmphasis.secondary === "strength", "secondary strength recognised", "REASONING_FAILURE")]),
  planScenario("07", "Commercial gym, strength, 4 days", () => scenarioInput({ patch: { ...days(["mon", "tue", "thu", "fri"]), ...goal("get_stronger") } }), undefined, (r, inp) => [flag(exs(r, inp).some((e) => e.equipment === "barbell"), "uses barbell lifts when available for strength", "REASONING_FAILURE")]),
  {
    id: "08",
    title: "Minimal home equipment (bodyweight + bands)",
    input: () => scenarioInput({ patch: { your_week: { trainingEnvironment: ["limited_equipment"] }, ...goal("build_muscle") } }),
    expectedStatus: "PLANNED_OR_NEEDS_INPUT",
    expectsModel: true,
    // Specific apparatus (e.g. a pull-up bar) is unknown here, not absent: it may be planned as an execution dependency
    // the coach confirms — never an unavailable equipment category, never a confirmed-absent apparatus.
    hard: (r, inp) => [...statusIs(r, "PLANNED_OR_NEEDS_INPUT"), ...(exs(r, inp).some((e) => !["bodyweight", "bands"].includes(e.equipment) || apparatusGaps(resolveEquipmentAccess(inp.client), e.apparatus).unavailable.length) ? ["used unavailable equipment/apparatus"] : [])],
    review: (r) => (r.status === "PLANNED" ? [flag(mentions(r, /apparatus|pull.?up bar|equipment|limited/i), "limited equipment acknowledged", "REASONING_FAILURE")] : []),
  },
  planScenario("09", "Dumbbell-only (coach-confirmed no bands/kettlebells)", () => scenarioInput({ patch: { your_week: { trainingEnvironment: ["home_gym"] } }, restrictions: restrict([{ kind: "avoid_equipment", equipment: "bands" }, { kind: "avoid_equipment", equipment: "kettlebell" }]) }), (p, inp) => (exs(p, inp).some((e) => !["dumbbell", "bodyweight"].includes(e.equipment)) ? ["non-dumbbell equipment used"] : [])),
  planScenario("10", "7 days available, current habit 4", () => scenarioInput({ coach: coachMethod({ t_days: layer(range(3, 6, "days/week")) }) }), (p) => (p.plan.frequency.daysPerWeek >= 7 ? ["planned 7 days"] : []), (r) => [flag(planned(r)!.plan.frequency.daysPerWeek <= 5, "doesn't jump far above the current 4-day habit", "REASONING_FAILURE")]),
  planScenario("11", "Current frequency (6) above the coach's range (3–4)", () => scenarioInput({ coach: coachMethod({ t_days: layer(range(3, 4, "days/week")) }), patch: { ...exp("experienced_consistent", 6) } }), (p) => (p.plan.frequency.daysPerWeek > 4 ? ["exceeded the coach's max"] : []), (r) => [flag(mentions(planned(r)!, /6|current|habit|reduc|fewer/i), "explains reducing from current habit", "REASONING_FAILURE")]),
  planScenario("12", "Session-duration limit (45 min)", () => scenarioInput({ patch: { your_week: { maxSessionLength: "45" } } }), undefined, (r) => [flag(!planned(r)!.quality.some((q) => q.code === "session_duration"), "sessions fit 45 min", "REASONING_FAILURE")]),
  planScenario("13", "Coach-specific exercise exclusions", () => scenarioInput({ coach: coachMethod({ t_exercises_avoided: ["Barbell Back Squat", "Conventional Deadlift", "Barbell Bench Press"] }) }), (p, inp) => (exs(p, inp).some((e) => ["exercise.barbell_back_squat", "exercise.conventional_deadlift", "exercise.barbell_bench_press"].includes(e.id)) ? ["coach-avoided exercise used"] : [])),
  planScenario("14", "Squat restriction", () => scenarioInput({ restrictions: restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }]) }), (p, inp) => (exs(p, inp).some((e) => e.patterns.includes("squat")) ? ["squat pattern used"] : [])),
  planScenario("15", "Hinge restriction", () => scenarioInput({ restrictions: restrict([{ kind: "avoid_movement_pattern", pattern: "hinge" }]) }), (p, inp) => (exs(p, inp).some((e) => e.patterns.includes("hinge")) ? ["hinge pattern used"] : [])),
  planScenario("16", "Moderate-or-higher bracing restriction", () => scenarioInput({ restrictions: restrict([{ kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" }]) }), (p, inp) => (exs(p, inp).some((e) => e.demands.bracing === "moderate" || e.demands.bracing === "high") ? ["bracing ≥ moderate used"] : [])),
  planScenario(
    "17",
    "Multiple simultaneous constraints",
    () => scenarioInput({ restrictions: restrict(["squat", "hinge", "single_leg", "trunk_flexion", "anti_extension"].map((pattern) => ({ kind: "avoid_movement_pattern" as const, pattern: pattern as "squat" })).concat([{ kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" } as never, { kind: "avoid_position", position: "overhead" } as never])) }),
    (p, inp) => (exs(p, inp).some((e) => e.patterns.some((x) => ["squat", "hinge", "single_leg", "trunk_flexion", "anti_extension"].includes(x)) || ["moderate", "high"].includes(e.demands.bracing) || e.positions.includes("overhead")) ? ["a restricted exercise was used"] : []),
    (r) => [flag(mentions(planned(r)!, /glute|lower|limited|restrict/i), "honest about what the restrictions remove", "REASONING_FAILURE")]
  ),
  needsInput("18", "Missing training experience", () => scenarioInput({ patch: { starting_point: { trainingExperience: undefined } } }), /trainingExperience/),
  needsInput("19", "Missing equipment / environment", () => scenarioInput({ patch: { your_week: { trainingEnvironment: undefined } } }), /trainingEnvironment/),
  needsInput("20", "Availability below the coach's minimum", () => scenarioInput({ coach: coachMethod({ t_days: layer(range(4, 6, "days/week")) }), patch: days(["mon", "thu"]) }), /coach_minimum_vs_availability/),
  {
    id: "21",
    title: "Conflicting goal information (muscle gain + fat loss, target below current weight)",
    input: () => scenarioInput({ patch: { what_you_want: { primaryGoal: "build_muscle", secondaryGoals: ["lose_fat"], targetWeight: 130 } } }),
    expectedStatus: "PLANNED_OR_NEEDS_INPUT",
    expectsModel: true,
    hard: (r) => [...statusIs(r, "PLANNED_OR_NEEDS_INPUT"), ...(r.status === "PLANNED" && r.plan.domain !== "resistance" ? ["not a resistance plan"] : [])],
    review: (r) => (r.status === "PLANNED" ? [flag(mentions(r, /fat|weight|conflict|recomp|deficit|calor/i), "surfaces the goal tension", "REASONING_FAILURE")] : []),
  },
  planScenario("22", "Highly trained, clear lift priorities (bench + deadlift)", () => scenarioInput({ patch: { ...exp("experienced_consistent", 5), ...goal("get_stronger"), starting_point: { trainingExperience: "experienced_consistent", weeklyFrequency: 5, recentConsistency: "very_consistent", trainingNotes: "Priorities: bench press and deadlift for a powerlifting meet." } } }), undefined, (r, inp) => {
    const ids = exs(r, inp).map((e) => e.id);
    return [flag(ids.includes("exercise.barbell_bench_press") && ids.includes("exercise.conventional_deadlift"), "the stated priority lifts are trained", "REASONING_FAILURE")];
  }),
  planScenario("23", "Client dislikes several exercises (in their notes)", () => scenarioInput({ patch: { starting_point: { trainingExperience: "comfortable_common", weeklyFrequency: 4, recentConsistency: "very_consistent", trainingNotes: "I really dislike lunges and the leg press." } } }), undefined, (r, inp) => [flag(!exs(r, inp).some((e) => ["exercise.walking_lunge", "exercise.reverse_lunge", "exercise.leg_press"].includes(e.id)), "respects stated dislikes (preferences live only in free-text notes)", "CLIENT_DATA_GAP")]),
  planScenario("24", "Short sessions (30 min) with high availability", () => scenarioInput({ coach: coachMethod({ t_session_length: range(30, 60, "min") }), patch: { your_week: { maxSessionLength: "30", availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] } } }), undefined, (r) => [flag(!planned(r)!.quality.some((q) => q.code === "session_duration"), "sessions fit 30 min", "REASONING_FAILURE"), flag(planned(r)!.plan.frequency.daysPerWeek >= 4, "uses more, shorter sessions", "REASONING_FAILURE")]),
  { id: "25", title: "Marathon goal — must route to endurance, never resistance", input: () => scenarioInput({ patch: { what_you_want: { primaryGoal: "something_else", primaryGoalOther: "Run my first marathon in April" } } }), expectedStatus: "DOMAIN_NOT_YET_SUPPORTED", expectsModel: false, hard: (r) => (r.status !== "DOMAIN_NOT_YET_SUPPORTED" ? [`expected DOMAIN_NOT_YET_SUPPORTED, got ${r.status}`] : r.routing.primary !== "endurance" ? [`routed to ${r.routing.primary}`] : []) },
];
