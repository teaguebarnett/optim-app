// Gate 4.0C-2 — exercise selection, downstream of the architecture. The
// candidate pool is decided by metadata alone (equipment, known apparatus,
// structured hard constraints, the coach's avoided exercises, prescription
// modes the coach's method can express). Within it, a deterministic score
// with named factors ranks candidates for one slot; ties go to the id.

import { levelRank, type Level, type MovementPatternId, type MuscleId } from "../../knowledge/taxonomy.ts";
import type { ExerciseEntry } from "../../knowledge/types.ts";
import type { Quality } from "./architecture.ts";

export interface Slot {
  role: "main" | "accessory";
  target: MuscleId;
  sessionPurpose: string;
  sessionTargets: MuscleId[];
  leadPatterns: MovementPatternId[];
  quality: Quality;
}

export interface SelectionContext {
  experience: "beginner" | "intermediate" | "advanced" | null;
  /** exercise id → session purposes it's already used in this week. */
  usedThisWeek: Map<string, string[]>;
  /** Exercises already in this session. */
  inSession: ExerciseEntry[];
  /** main pattern → times already used for a main lift this week. */
  mainPatternUses: Map<string, number>;
}

export interface Ranked {
  exercise: ExerciseEntry;
  score: number;
  factors: Array<{ factor: string; points: number }>;
  repeatedReason?: string;
}

const rank = (l: Level) => levelRank(l);

export function rankCandidates(pool: ExerciseEntry[], slot: Slot, ctx: SelectionContext): Ranked[] {
  const out: Ranked[] = [];
  for (const e of pool) {
    if (!e.primaryMuscles.includes(slot.target)) continue;
    if (ctx.inSession.some((s) => s.id === e.id)) continue;
    const factors: Ranked["factors"] = [];
    const add = (factor: string, points: number) => points !== 0 && factors.push({ factor, points });
    add(`trains ${slot.target} as a primary muscle`, 4);
    const otherTargets = e.primaryMuscles.filter((m) => m !== slot.target && slot.sessionTargets.includes(m)).length;
    add(`also trains ${otherTargets} other session target(s)`, Math.min(otherTargets, slot.role === "main" ? 2 : 1));
    if (slot.role === "main") {
      add("compound", e.mechanics === "compound" ? 3 : 0);
      add("session lead pattern", e.patterns.some((p) => slot.leadPatterns.includes(p)) ? 2 : 0);
      add("suited to early-session placement", e.ordering === "early" ? 1 : 0);
      add("high loading potential", e.loadingPotential === "high" ? 1 : 0);
      const uses = ctx.mainPatternUses.get(e.patterns[0]) ?? 0;
      add(`${e.patterns[0]} already used for ${uses} main lift(s) this week (rotate patterns)`, -1.5 * uses);
    } else {
      add("isolation fits an accessory slot", e.mechanics === "isolation" ? 1 : 0);
      add(`systemic fatigue ${e.demands.systemic_fatigue}`, -rank(e.demands.systemic_fatigue) * 0.5);
    }
    const q = slot.quality === "general" ? null : slot.quality;
    if (q) add(`${q} suitability ${e.suitability[q]}`, rank(e.suitability[q]) * 1.5);
    if (ctx.experience === "beginner") add(`skill demand ${e.demands.skill} for a beginner`, e.demands.skill === "high" ? -3 : e.demands.skill === "moderate" ? -1 : 0);
    if (ctx.inSession.some((s) => s.patterns[0] === e.patterns[0] && s.equipment === e.equipment)) add("same main pattern and equipment as an exercise already in this session", -2);

    let repeatedReason: string | undefined;
    const usedIn = ctx.usedThisWeek.get(e.id);
    if (usedIn) {
      // Practising a main lift twice a week is a planning reason; a third time isn't.
      const intentional = slot.role === "main" && slot.quality === "strength" && usedIn.includes(slot.sessionPurpose) && usedIn.length < 2;
      if (intentional) repeatedReason = `main lift practised in two ${slot.sessionPurpose} sessions this week: strength emphasis repeats the lift (knowledge: specificity)`;
      else add(`already used this week (${usedIn.join(", ")})`, -5);
    }
    out.push({ exercise: e, score: factors.reduce((s, f) => s + f.points, 0), factors, repeatedReason });
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.id.localeCompare(b.exercise.id));
}
