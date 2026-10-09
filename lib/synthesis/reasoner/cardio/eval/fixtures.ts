// Cardio Reasoner V1 — offline fixtures. Reuses the Fitness Reasoner's fixtures (scenarioInput, coachMethod,
// fakeModel) and adds cardio coach methods, a resistance-program builder (universal training grammar) and a scripted
// cardio model that answers inside OPTIM's rails, so tests can corrupt one field at a time.

import { coachMethod, layer, range } from "../../eval/fixtures.ts";
import type { ConfirmedCoachMethod } from "../../../../coach/coach-brain.ts";
import type { DayOfWeek } from "../../../../types.ts";
import type { UniversalTrainingProgramContent } from "../../../../training/types.ts";
import { FOUNDATION_KNOWLEDGE } from "../../../knowledge/registry.ts";
import { DAY_ORDER } from "../../../client-state.ts";
import { resistanceWeekFromContent, type ResistanceWeek } from "../../../cardio/schedule.ts";
import { cardioModality } from "../../../knowledge/cardio/modalities.ts";
import type { CardioReasoningInput } from "../input.ts";

export { fakeModel, NOW, scenarioInput, restrict } from "../../eval/fixtures.ts";

/** A general training coach who uses cardio for health and conditioning (and fat loss), guided by talk test / RPE. */
export function cardioCoach(over: Record<string, unknown> = {}): ConfirmedCoachMethod {
  return coachMethod({
    practice_goals: ["get_stronger", "build_muscle", "lose_fat", "recomposition", "general_health"],
    t_cardio_roles: ["health", "conditioning", "fat_loss"],
    t_cardio_health_minutes: range(90, 150, "min/week"),
    t_conditioning_minutes: range(60, 120, "min/week"),
    t_cardio_fat_loss_minutes: range(120, 250, "min/week"),
    g_intensity_guide: ["talk_test", "rpe"],
    ...over,
  });
}

/** An endurance coach (time-based volume, polarized distribution, heart rate + RPE). */
export function enduranceCoach(over: Record<string, unknown> = {}): ConfirmedCoachMethod {
  return coachMethod({
    coaching_areas: ["endurance"],
    e_discipline: ["running"],
    e_volume_unit: "hours",
    e_days: range(3, 5, "days/week"),
    e_weekly_volume: range(2, 4, "hours/week"),
    e_quality_sessions: range(1, 2, "sessions/week"),
    e_intensity_mix: "polarized",
    e_intensity_method: ["heart_rate", "rpe"],
    e_weekly_increase: range(5, 10, "% per week"),
    e_down_weeks: "every_n",
    ...over,
  });
}

/** A resistance week in the universal grammar: day → exercise names (catalog names) and minutes. */
export function resistanceProgram(days: Array<{ day: DayOfWeek; exercises: string[]; minutes?: number }>, source: ResistanceWeek["source"] = "approved_program"): ResistanceWeek {
  const content = {
    schemaVersion: 2,
    id: "prog-eval",
    workspaceId: "ws-eval",
    clientId: "client-eval",
    coachId: "coach-eval",
    name: "Eval program",
    durationWeeks: 8,
    weeks: [{ weekNumber: 1, days: DAY_ORDER.map((d) => {
      const spec = days.find((x) => x.day === d);
      return spec ? { dayOfWeek: d, type: "training", sessions: [{ id: `s-${d}`, name: d, focus: "", estimatedDurationMin: spec.minutes ?? 60, blocks: [{ id: `b-${d}`, kind: "straight", order: 1, items: spec.exercises.map((n, i) => ({ id: `i-${d}-${i}`, order: i + 1, name: n, category: "strength", prescription: {} })) }] }] } : { dayOfWeek: d, type: "rest" };
    }) }],
  } as unknown as UniversalTrainingProgramContent;
  return resistanceWeekFromContent(content, FOUNDATION_KNOWLEDGE, source);
}

export const LOWER = ["Leg Press", "Romanian Deadlift", "Walking Lunge", "Leg Curl"];
export const UPPER = ["Barbell Bench Press", "Lat Pulldown", "Seated Cable Row", "Overhead Press"];
/** Upper/lower 4-day split: lower Mon & Thu, upper Tue & Fri. */
export const UPPER_LOWER = (minutes = 60) => resistanceProgram([{ day: "Monday", exercises: LOWER, minutes }, { day: "Tuesday", exercises: UPPER, minutes }, { day: "Thursday", exercises: LOWER, minutes }, { day: "Friday", exercises: UPPER, minutes }]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test wire shape: tests corrupt arbitrary fields
export type WireCardio = Record<string, unknown> & { plan: Record<string, any> };

const EFFORT = { easy: [2, 3], moderate: [4, 5], vigorous: [7, 8] } as const;
const TALK = { easy: "full_conversation", moderate: "short_sentences", vigorous: "few_words" } as const;
const ROLE_FOR: Record<string, string[]> = { fat_loss_support: ["fat_loss", "health", "recovery"], health: ["health", "conditioning", "recovery"], aerobic_base: ["aerobic_base", "conditioning", "health", "recovery"], resistance_support: ["conditioning", "health", "recovery"] };

/** A plausible, rail-respecting proposal built from the input (scripted model — rails only, not coaching quality). */
export function scriptedCardio(ri: CardioReasoningInput, tweak?: (p: WireCardio["plan"]) => void): WireCardio {
  const b = ri.bounds;
  const role = ROLE_FOR[ri.purpose].find((r) => ri.coach.allowedRoles.includes(r)) ?? ri.coach.allowedRoles[0];
  const range = b.minutesByRole[role];
  const beginner = b.easyStartWeeks > 0;
  const start = Math.round(((range ? range[0] : 60) * (beginner ? 0.6 : 1)) / 5) * 5;
  const res = new Map((ri.resistance?.days ?? []).map((d) => [d.day, d]));
  const rows = ri.modalities.map((r) => r.split("|"));
  const eqRank = (s: string) => ({ available: 0, assumed: 1, unknown: 2 })[s as "available"] ?? 3;
  const ifRank = (s: string) => "NLMH".indexOf(s);
  const steady = [...rows].sort((x, y) => eqRank(x[6]) - eqRank(y[6]) || ifRank(x[4]) - ifRank(y[4]))[0][0];
  const method = (["talk_test", "heart_rate", "rpe"] as const).find((m) => ri.coach.intensityMethods.includes(m) && (m !== "heart_rate" || ri.zones)) ?? "rpe";
  // Days: non-resistance available days first, then resistance days (as a separate session).
  const free = b.availableDays.filter((d) => !res.has(d));
  const n = start >= 90 ? 3 : 2;
  const days = [...free, ...b.availableDays.filter((d) => res.has(d))].slice(0, n);
  const minutes = Math.max(10, Math.floor(start / days.length / 5) * 5);
  const intensity = role === "recovery" ? "easy" : "moderate";
  const strength = ["hypertrophy", "strength", "recomposition", "weight_gain"].includes(ri.goal.primary ?? "") || ri.hybrid;
  const hardOk = b.maxHardSessions > 0 && !beginner && role !== "recovery" && (role === "conditioning" || role === "aerobic_base");
  const nextDay = (d: DayOfWeek) => DAY_ORDER[(DAY_ORDER.indexOf(d) + 1) % 7];
  const intervalModality = rows.filter((r) => r[2].includes("I")).sort((x, y) => (strength ? ifRank(x[4]) - ifRank(y[4]) : 0) || eqRank(x[6]) - eqRank(y[6]))[0]?.[0];
  const sessions = days.map((day, i) => {
    const hard = hardOk && i === 0 && intervalModality && !(strength && "MH".includes(cardioModality(intervalModality)!.lowerBodyInterference[0].toUpperCase()) && (res.get(day)?.lowerBody || res.get(nextDay(day))?.lowerBody));
    const placement = res.has(day) ? "separate_session" : "separate_day";
    if (hard) return { day, type: "intervals", modality: intervalModality, minutes: Math.max(minutes, 20), intensity: "vigorous", effort: [7, 8], ...(method === "heart_rate" && ri.zones ? { hrPct: ri.zones.bands.vigorous } : {}), intervals: { rounds: 6, workSeconds: 60, recoverySeconds: 90, workEffort: [7, 8], recoveryEffort: [2, 3] }, placement, purpose: "Raise aerobic capacity with short intervals." };
    return { day, type: "steady", modality: steady, minutes, intensity, effort: EFFORT[intensity], ...(method === "talk_test" ? { talk: TALK[intensity] } : {}), ...(method === "heart_rate" && ri.zones ? { hrPct: ri.zones.bands[intensity] } : {}), placement, purpose: "Build aerobic base at a sustainable effort." };
  });
  const total = sessions.reduce((t, s) => t + s.minutes, 0);
  const hard = sessions.filter((s) => s.type === "intervals" || s.intensity === "vigorous").length;
  const cap = Math.min(b.maxWeeklyIncreasePct, 10) / 100;
  const progression: Array<{ week: number; minutes: number; hardSessions: number; change: string }> = [];
  for (let w = 1, m = total; w <= 6; w++) {
    progression.push({ week: w, minutes: m, hardSessions: hard, change: w === 1 ? "Starting week." : "Add a few minutes to each session." });
    m = Math.min(range ? range[1] : m, Math.floor(m * (1 + cap)));
  }
  const steps = ri.coach.rules.find((r) => r[1] === "steps/day")?.[2] as number[] | undefined;
  const fact = Object.keys(ri.client.facts)[0];
  const refs = { coach: ri.coach.rules[0] ? [ri.coach.rules[0][0]] : [], client: fact ? [fact] : [], evidence: ri.evidence[0] ? [ri.evidence[0].ref] : [] };
  const plan: WireCardio["plan"] = {
    warranted: true,
    role,
    objective: { summary: `Scripted ${role.replace(/_/g, " ")} cardio.`, why: "Scripted." },
    intensityMethod: { primary: method, why: "Scripted: the coach's method." },
    sessions,
    ...(steps ? { steps: { target: steps, why: "The coach's step target." } } : {}),
    progression,
    placementWhy: "Scripted: cardio on non-lifting days first.",
    monitoring: { measures: ["session_completion", method === "talk_test" ? "talk_test" : "rpe"], reviewAfterWeeks: 3 },
    adjustments: [{ signal: "Lifting performance drops for two weeks", afterWeeks: 2, what: "minutes", direction: "decrease", change: "Cut cardio minutes by a quarter." }],
    assumptions: ["Scripted assumption."],
    uncertainties: [{ about: "Current aerobic fitness", impact: "Week 1 may be too easy or too hard; the talk test corrects it." }],
    coachQuestions: ri.conflicts.map((c) => ({ question: c, why: "Schedule conflict." })),
    decisions: (["warranted", "role", "intensity", "schedule", "progression", ...(ri.resistance?.days.length ? ["interference"] : [])] as const).map((topic) => ({ topic, decision: `Scripted ${topic}`, because: "Scripted.", ...refs })),
  };
  tweak?.(plan);
  return { status: "PLAN", plan };
}

export { layer };
