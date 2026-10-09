// Cardio Reasoner V1 — the resistance week cardio must fit around, read deterministically from program content (the
// universal training grammar), and the schedule contradictions OPTIM can detect without a model.

import { isKnown } from "../facts.ts";
import type { ClientState } from "../client-state.ts";
import type { DayOfWeek } from "../../types.ts";
import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";

export interface ResistanceDay {
  day: DayOfWeek;
  focus: "lower" | "upper" | "full_body";
  /** Meaningful lower-body loading (a major lower-body lift, or ≥ 2 lower-body exercises) — interference matters. */
  lowerBody: boolean;
  /** The lower-body exercises found (transparency for the coach and the model). */
  lowerExercises: string[];
  minutes: number;
}
export interface ResistanceWeek {
  source: "approved_program" | "proposed_program";
  days: ResistanceDay[];
}

const LOWER = new Set(["squat", "hinge", "single_leg", "hip_thrust", "knee_flexion", "knee_extension", "calf_raise", "hip_extension_isolation", "jump"]);
/** Lower-body patterns that load the legs heavily on their own. */
const MAJOR_LOWER = new Set(["squat", "hinge", "single_leg", "jump"]);

/** Week 1 of a program: each training day, whether it loads the lower body meaningfully, and its estimated length. */
export function resistanceWeekFromContent(content: UniversalTrainingProgramContent, knowledge: FitnessKnowledgeRegistry, source: ResistanceWeek["source"]): ResistanceWeek {
  const byName = new Map(knowledge.exercises().map((e) => [e.name.toLowerCase(), e]));
  const w = content.weeks[0];
  const days: ResistanceDay[] = [];
  for (const d of w?.days ?? []) {
    const sessions = d.sessions ?? [];
    if (!sessions.length) continue;
    const items = sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
    const patterns = items.map((i) => byName.get(i.name.toLowerCase())?.patterns ?? []);
    const lowerItems = items.filter((_, k) => patterns[k].some((p) => LOWER.has(p)));
    const major = patterns.some((ps) => ps.some((p) => MAJOR_LOWER.has(p)));
    const share = items.length ? lowerItems.length / items.length : 0;
    const focus: ResistanceDay["focus"] = lowerItems.length === 0 ? "upper" : share >= 0.6 ? "lower" : "full_body";
    days.push({ day: d.dayOfWeek as DayOfWeek, focus, lowerBody: major || lowerItems.length >= 2, lowerExercises: lowerItems.map((i) => i.name), minutes: sessions.reduce((t, s) => t + (s.estimatedDurationMin ?? 60), 0) });
  }
  return { source, days };
}

export interface ScheduleConflict {
  id: "resistance_on_unavailable_day" | "resistance_over_session_cap";
  text: string;
  days: DayOfWeek[];
}

/** Contradictions between the client's stated schedule and the resistance program cardio must fit around. OPTIM never
 * resolves these by changing the approved program — each becomes a prepared coach decision. */
export function scheduleConflicts(c: ClientState, week: ResistanceWeek | null): ScheduleConflict[] {
  if (!week) return [];
  const out: ScheduleConflict[] = [];
  const available = isKnown(c.schedule.availableDays) ? new Set(c.schedule.availableDays.value) : null;
  const outside = available ? week.days.filter((d) => !available.has(d.day)).map((d) => d.day) : [];
  if (outside.length) out.push({ id: "resistance_on_unavailable_day", days: outside, text: `The ${week.source === "approved_program" ? "approved" : "proposed"} resistance program trains on ${outside.join(", ")}, which the client didn't list as available.` });
  const len = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value : null;
  const long = len && !len.openEnded ? week.days.filter((d) => d.minutes > len.minutes) : [];
  if (long.length) out.push({ id: "resistance_over_session_cap", days: long.map((d) => d.day), text: `Resistance sessions on ${long.map((d) => d.day).join(", ")} already run past the client's ${len!.minutes}-min cap — there's no room to add cardio to them.` });
  return out;
}

/** What each available day can hold, given the approved lifting (never changed) and the client's session cap. */
export interface DayCapacity {
  day: DayOfWeek;
  resistanceMinutes: number;
  lowerBody: boolean;
  /** Cardio minutes that fit after lifting in the same visit (resistance days only; 0 when the visit is full). */
  sameVisitMax: number | null;
  /** Cardio minutes in a visit of its own (a non-lifting day, or a second visit ≥ 3 h from lifting). */
  ownVisitMax: number | null;
}
export interface CardioCapacity {
  /** null when the client's sessions are open-ended (no cap to check against). */
  sessionCapMinutes: number | null;
  days: DayCapacity[];
  /** Most cardio minutes the week can hold with one cardio session per available day; null when uncapped. */
  weeklyMaxMinutes: number | null;
}

export function cardioCapacity(c: ClientState, week: ResistanceWeek | null): CardioCapacity {
  const len = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value : null;
  const cap = len && !len.openEnded ? len.minutes : null;
  const res = new Map((week?.days ?? []).map((d) => [d.day, d]));
  const avail = isKnown(c.schedule.availableDays) ? c.schedule.availableDays.value : [];
  const days = avail.map((day): DayCapacity => {
    const r = res.get(day);
    return { day, resistanceMinutes: r?.minutes ?? 0, lowerBody: !!r?.lowerBody, sameVisitMax: r ? (cap === null ? null : Math.max(0, cap - r.minutes)) : null, ownVisitMax: cap };
  });
  return { sessionCapMinutes: cap, days, weeklyMaxMinutes: cap === null ? null : days.reduce((t, d) => t + Math.max(d.ownVisitMax ?? 0, d.sameVisitMax ?? 0), 0) };
}
