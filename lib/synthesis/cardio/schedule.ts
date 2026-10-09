// Cardio Reasoner V1 — the resistance week cardio must fit around, read deterministically from program content (the
// universal training grammar), and the schedule contradictions OPTIM can detect without a model.

import { isKnown } from "../facts.ts";
import type { ClientState } from "../client-state.ts";
import type { DayOfWeek } from "../../types.ts";
import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";

export interface ResistanceDay {
  day: DayOfWeek;
  /** Squat, hinge, single-leg, knee/hip-dominant work — interference matters for lower-body days. */
  lowerBody: boolean;
  minutes: number;
}
export interface ResistanceWeek {
  source: "approved_program" | "proposed_program";
  days: ResistanceDay[];
}

const LOWER = new Set(["squat", "hinge", "single_leg", "hip_thrust", "knee_flexion", "knee_extension", "calf_raise", "hip_extension_isolation", "jump"]);

/** Week 1 of a program: each training day, whether it loads the lower body meaningfully, and its estimated length. */
export function resistanceWeekFromContent(content: UniversalTrainingProgramContent, knowledge: FitnessKnowledgeRegistry, source: ResistanceWeek["source"]): ResistanceWeek {
  const byName = new Map(knowledge.exercises().map((e) => [e.name.toLowerCase(), e]));
  const w = content.weeks[0];
  const days: ResistanceDay[] = [];
  for (const d of w?.days ?? []) {
    const sessions = d.sessions ?? [];
    if (!sessions.length) continue;
    const items = sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
    const lowerCount = items.filter((i) => byName.get(i.name.toLowerCase())?.patterns.some((p) => LOWER.has(p))).length;
    days.push({ day: d.dayOfWeek as DayOfWeek, lowerBody: lowerCount >= 2 || (items.length > 0 && lowerCount / items.length >= 0.4), minutes: sessions.reduce((t, s) => t + (s.estimatedDurationMin ?? 60), 0) });
  }
  return { source, days };
}

/** Contradictions between the client's stated schedule and the resistance program cardio must fit around. */
export function scheduleConflicts(c: ClientState, week: ResistanceWeek | null): string[] {
  if (!week) return [];
  const out: string[] = [];
  const available = isKnown(c.schedule.availableDays) ? new Set(c.schedule.availableDays.value) : null;
  const outside = available ? week.days.filter((d) => !available.has(d.day)).map((d) => d.day) : [];
  if (outside.length) out.push(`The ${week.source === "approved_program" ? "approved" : "proposed"} resistance program trains on ${outside.join(", ")}, which the client didn't list as available.`);
  const len = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value : null;
  const long = len && !len.openEnded ? week.days.filter((d) => d.minutes > len.minutes) : [];
  if (long.length) out.push(`Resistance sessions on ${long.map((d) => d.day).join(", ")} already run past the client's ${len!.minutes}-min cap — there's no room to add cardio to them.`);
  return out;
}
