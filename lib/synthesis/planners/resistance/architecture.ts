// Gate 4.0C-2 — program architecture, decided before any exercise:
// goal emphasis → frequency → split → schedule. Each step is a pure,
// scored choice among the options the coach's method and the client's
// facts allow, and returns its factors so provenance can cite them.

import type { DayOfWeek } from "../../../types.ts";
import { DAY_ORDER } from "../../client-state.ts";
import type { GoalContract } from "../../goal-contract.ts";
import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";
import type { SplitId } from "./method.ts";
import { MAJOR_TARGETS, splitSessions, type SessionPurpose } from "./templates.ts";

export type Quality = "strength" | "hypertrophy" | "general";

export interface Emphasis {
  primary: Quality;
  secondary: "strength" | "hypertrophy" | null;
  rationale: string;
}

/** How the client's goal shapes resistance training. Only strength and
 * hypertrophy carry resistance-specific emphasis; every other goal gets
 * general resistance support (its own domain planner handles the rest). */
export function interpretGoal(goal: GoalContract): Emphasis | null {
  if (!goal.primary || goal.primary.class === "other") return null;
  const q = (c: string): "strength" | "hypertrophy" | null => (c === "strength" ? "strength" : c === "hypertrophy" ? "hypertrophy" : null);
  const primary = q(goal.primary.class) ?? "general";
  const secondary = primary === "general" ? null : (goal.secondary.map((g) => q(g.class)).find((x) => x && x !== primary) ?? null);
  const rationale =
    primary === "general"
      ? `Primary goal "${goal.primary.class}" isn't a strength or hypertrophy goal, so resistance training is planned as general support.`
      : `Primary goal ${primary}${secondary ? ` with ${secondary} as a secondary goal` : ""}.`;
  return { primary, secondary, rationale };
}

// ---------------------------------------------------------------------------
// Frequency
// ---------------------------------------------------------------------------

export interface FrequencyChoice {
  candidates: Array<{ days: number; score: number; factors: Array<{ factor: string; points: number }> }>;
  statusBand: { min: number; max: number; status: string } | null;
}

/**
 * Score each day count inside the resolved bounds (availability ceiling ∩
 * coach range). Availability is never the target. Factors:
 *  - inside the general frequency band for the client's training status
 *    (ACSM position stand, via Fitness Knowledge) +2
 *  - distance from how often the client actually trains now −1 per day
 *  - more than one day above current habit for a client who isn't training
 *    consistently −3
 *  - the coach's preferred day count +2
 * Ties go to fewer days (more recovery). Returned best-first.
 */
export function rankFrequencies(params: {
  bounds: { min: number; max: number };
  knowledge: FitnessKnowledgeRegistry;
  experience: "beginner" | "intermediate" | "advanced" | null;
  currentSessionsPerWeek: number | null;
  consistent: boolean | null;
  coachPreferred: number | null;
}): FrequencyChoice {
  const claim = params.knowledge.concept("training_frequency")?.claims.find((c) => c.id === "frequency.acsm_by_status");
  const status = params.experience === "beginner" ? "novice" : params.experience;
  const band = status && claim?.parameters?.[status] ? { min: claim.parameters[status].min!, max: claim.parameters[status].max!, status } : null;
  const candidates: FrequencyChoice["candidates"] = [];
  for (let d = params.bounds.min; d <= params.bounds.max; d++) {
    const factors: Array<{ factor: string; points: number }> = [];
    if (band && d >= band.min && d <= band.max) factors.push({ factor: `within ${band.status} frequency band ${band.min}–${band.max} (knowledge)`, points: 2 });
    if (params.currentSessionsPerWeek !== null && d !== params.currentSessionsPerWeek) factors.push({ factor: `${Math.abs(d - params.currentSessionsPerWeek)} day(s) from current habit of ${params.currentSessionsPerWeek}`, points: -Math.abs(d - params.currentSessionsPerWeek) });
    if (params.consistent === false && params.currentSessionsPerWeek !== null && d > params.currentSessionsPerWeek + 1) factors.push({ factor: "jump above current habit for a client not training consistently", points: -3 });
    if (params.coachPreferred !== null && d === params.coachPreferred) factors.push({ factor: "coach's preferred day count", points: 2 });
    candidates.push({ days: d, score: factors.reduce((s, f) => s + f.points, 0), factors });
  }
  candidates.sort((a, b) => b.score - a.score || a.days - b.days);
  return { candidates, statusBand: band };
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

export interface SplitChoice {
  split: SplitId;
  sessions: SessionPurpose[];
  score: number;
  factors: Array<{ factor: string; points: number }>;
}

/**
 * Among the coach's splits for this day count: keep those that fit the day
 * count and whose every session can be filled with eligible exercises.
 * When hypertrophy is a goal, +1 per major muscle trained at least twice a
 * week (Fitness Knowledge: twice beat once for hypertrophy). Splits whose
 * best schedule still puts overlapping sessions on consecutive days lose
 * half a point per penalty point (recovery; planner rule). Remaining ties
 * follow the order the coach listed the splits.
 */
export function rankSplits(params: {
  coachSplits: SplitId[];
  days: number;
  emphasis: Emphasis;
  trainableTargets: Set<string>;
  sessionFeasible: (purpose: SessionPurpose) => boolean;
  /** Overlap penalty of the best schedule for these sessions (chooseSchedule). */
  schedulePenalty: (sessions: SessionPurpose[]) => number;
}): { ranked: SplitChoice[]; rejected: Array<{ split: SplitId; reason: string }> } {
  const ranked: SplitChoice[] = [];
  const rejected: Array<{ split: SplitId; reason: string }> = [];
  const hypertrophy = params.emphasis.primary === "hypertrophy" || params.emphasis.secondary === "hypertrophy";
  params.coachSplits.forEach((split, index) => {
    const sessions = splitSessions(split, params.days);
    if (!sessions) return rejected.push({ split, reason: `doesn't fit ${params.days} days` });
    const infeasible = sessions.find((s) => !params.sessionFeasible(s));
    if (infeasible) return rejected.push({ split, reason: `${infeasible.label} sessions can't be filled with eligible exercises` });
    const factors: SplitChoice["factors"] = [];
    if (hypertrophy) {
      const twice = MAJOR_TARGETS.filter((m) => params.trainableTargets.has(m) && sessions.filter((s) => s.targets.includes(m)).length >= 2);
      if (twice.length) factors.push({ factor: `${twice.length} major muscles trained ≥2×/week (knowledge: frequency.per_muscle_hypertrophy)`, points: twice.length });
    }
    const penalty = params.schedulePenalty(sessions);
    if (penalty > 0) factors.push({ factor: `best schedule still trains overlapping muscles on consecutive days (penalty ${penalty})`, points: -penalty * 0.5 });
    factors.push({ factor: `coach's split list position ${index + 1}`, points: -index * 0.01 });
    ranked.push({ split, sessions, score: factors.reduce((s, f) => s + f.points, 0), factors });
  });
  ranked.sort((a, b) => b.score - a.score);
  return { ranked, rejected };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/**
 * Place the split's sessions (in order) on `count` of the available days.
 * Penalties: consecutive days that train overlapping muscles (3 each,
 * including Sunday → Monday), and every training day beyond three in a row
 * (1 each). Ties go to the earliest days of the week.
 */
export function chooseSchedule(available: DayOfWeek[], sessions: SessionPurpose[]): { days: DayOfWeek[]; penalty: number; notes: string[] } {
  const n = sessions.length;
  const idx = available.map((d) => DAY_ORDER.indexOf(d)).sort((a, b) => a - b);
  let best: { days: number[]; penalty: number; notes: string[] } | null = null;
  const combos = (start: number, picked: number[]): void => {
    if (picked.length === n) {
      const notes: string[] = [];
      let penalty = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (n === 1) break;
        const gap = j === 0 ? picked[0] + 7 - picked[i] : picked[j] - picked[i];
        if (gap === 1 && sessions[i].targets.some((t) => sessions[j].targets.includes(t))) {
          penalty += 3;
          notes.push(`${DAY_ORDER[picked[i]]} → ${DAY_ORDER[picked[j]]} train overlapping muscles on consecutive days`);
        }
      }
      let run = 1;
      for (let i = 1; i < n; i++) {
        run = picked[i] - picked[i - 1] === 1 ? run + 1 : 1;
        if (run > 3) penalty += 1;
      }
      if (!best || penalty < best.penalty) best = { days: [...picked], penalty, notes };
      return;
    }
    for (let k = start; k < idx.length; k++) combos(k + 1, [...picked, idx[k]]);
  };
  combos(0, []);
  const b = best as { days: number[]; penalty: number; notes: string[] } | null;
  return b ? { days: b.days.map((i) => DAY_ORDER[i]), penalty: b.penalty, notes: b.notes } : { days: [], penalty: Infinity, notes: [] };
}
