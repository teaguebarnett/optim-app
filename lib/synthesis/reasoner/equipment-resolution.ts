// Equipment resolution — IDEAL plan → EQUIPMENT RESOLUTION → EXECUTION EXERCISE.
//
// The Reasoner plans from the ideal pool (buildPool "ideal"): constraints, the coach's exclusions and equipment
// categories apply first; specific apparatus never narrows the plan. Afterwards, deterministically:
//
//   available (baseline or coach-confirmed) — used as planned.
//   unknown   — used as planned; the review shows it as an execution dependency the coach can confirm. Never
//               treated as available.
//   confirmed unavailable — the exercise can't be the execution exercise. It is replaced by the eligible exercise that
//               best preserves its training intent (main pattern, primary muscles, emphasis, mechanics, laterality,
//               role), from the offered pool only — so every constraint and fit rule still holds. With no adequate
//               equivalent it leaves the plan and a BLOCKING coach decision says what work it carried and why.
//
// Pure: no I/O, no model call. Every resolution is recorded on the run (provenance).

import type { DayOfWeek } from "../../types.ts";
import type { ExerciseEntry, FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { APPARATUS_LABEL, MOVEMENT_PATTERNS, MUSCLES, type ApparatusId } from "../knowledge/taxonomy.ts";
import { apparatusGaps, type EquipmentAccess } from "../planners/resistance/equipment-access.ts";
import type { ReasonerPlan } from "./contract.ts";

export interface EquipmentResolution {
  day: DayOfWeek;
  exerciseId: string;
  exerciseName: string;
  /** The coach-confirmed-absent apparatus that made it unexecutable. */
  apparatus: string[];
  /** The training intent it carried (main pattern + primary muscles), coach-facing. */
  serves: string;
  status: "substituted" | "unresolved";
  substituteId: string | null;
  substituteName: string | null;
}

export const apparatusLabel = (a: string) => APPARATUS_LABEL[a as ApparatusId] ?? a.replace(/_/g, " ");
const patternLabel = (p: string) => (MOVEMENT_PATTERNS as Record<string, { name: string } | undefined>)[p]?.name ?? p.replace(/_/g, " ");
const muscleLabel = (m: string) => (MUSCLES as Record<string, { name: string } | undefined>)[m]?.name ?? m.replace(/_/g, " ");
export const servesOf = (e: ExerciseEntry) => `${patternLabel(e.patterns[0]).toLowerCase()} — ${e.primaryMuscles.map((m) => muscleLabel(m).toLowerCase()).join(", ")}`;

/** How well `c` preserves `o`'s training intent; null when it isn't an adequate equivalent. Adequate = the same main
 * movement pattern training a shared primary muscle, or every primary muscle with the same mechanics (an isolation
 * stays an isolation) — never a power exercise standing in for strength/hypertrophy work. */
export function substituteScore(o: ExerciseEntry, c: ExerciseEntry): number | null {
  const samePattern = c.patterns[0] === o.patterns[0];
  const shared = o.primaryMuscles.filter((m) => c.primaryMuscles.includes(m));
  const coversAll = o.primaryMuscles.every((m) => c.primaryMuscles.includes(m));
  if ((c.role === "power") !== (o.role === "power")) return null;
  if (!((samePattern && shared.length > 0) || (coversAll && c.mechanics === o.mechanics))) return null;
  return (
    (samePattern ? 4 : 0) +
    2 * shared.length +
    (c.emphasis[0] && c.emphasis[0] === o.emphasis[0] ? 2 : 0) +
    o.emphasis.filter((m) => c.emphasis.includes(m)).length +
    (c.trunkSupport === o.trunkSupport ? 2 : 0) + // support changes both the stimulus and the constraint fit
    (c.loadingPotential === o.loadingPotential ? 1 : 0) +
    (c.mechanics === o.mechanics ? 1 : 0) +
    (c.laterality === o.laterality ? 1 : 0) +
    (c.role === o.role ? 1 : 0)
  );
}

export function resolvePlanEquipment(params: {
  plan: ReasonerPlan;
  knowledge: FitnessKnowledgeRegistry;
  access: EquipmentAccess | null;
  /** The offered pool (constraint-eligible, not withheld) — the only exercises a substitute may come from. */
  offered: ExerciseEntry[];
  /** Exercises that fit only submaximally (K/U) and side-limited ones (S) — see buildPool. */
  loadConditions: Map<string, unknown>;
  sideOnly: Map<string, string>;
}): { plan: ReasonerPlan; resolutions: EquipmentResolution[] } {
  const { knowledge, access } = params;
  const plan = structuredClone(params.plan);
  const resolutions: EquipmentResolution[] = [];
  const used = new Map<string, number>();
  for (const s of plan.sessions) for (const e of s.exercises) used.set(e.exerciseId, (used.get(e.exerciseId) ?? 0) + 1);
  for (const s of plan.sessions) {
    const kept: typeof s.exercises = [];
    for (const e of s.exercises) {
      const o = knowledge.getExercise(e.exerciseId);
      const absent = o ? apparatusGaps(access, o.apparatus).unavailable : [];
      if (!o || !absent.length) {
        kept.push(e);
        continue;
      }
      const inSession = new Set([...kept, ...s.exercises].map((x) => x.exerciseId));
      // A conditional-fit substitute only into a slot that already met the submaximal minimums (the original was K too):
      // its listed prescription and phases were validated for exactly that.
      const ranked = params.offered
        .filter((c) => c.id !== o.id && !inSession.has(c.id) && !apparatusGaps(access, c.apparatus).unavailable.length && !params.sideOnly.has(c.id) && (!params.loadConditions.has(c.id) || params.loadConditions.has(o.id)))
        .map((c) => ({ c, score: substituteScore(o, c) }))
        .filter((x): x is { c: ExerciseEntry; score: number } => x.score !== null)
        // Prefer known-available equipment, then fresh exercises (not already elsewhere in the week).
        .map((x) => ({ ...x, score: x.score + (apparatusGaps(access, x.c.apparatus).unknown.length ? 0 : 1) - (used.has(x.c.id) ? 1 : 0) }))
        .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
      const best = ranked[0]?.c ?? null;
      const record = { day: s.day, exerciseId: o.id, exerciseName: o.name, apparatus: absent.map(apparatusLabel), serves: servesOf(o) };
      if (best) {
        kept.push({ ...e, exerciseId: best.id, note: `Replaces ${o.name} (no ${absent.map(apparatusLabel).join(" or ").toLowerCase()}) — the closest equivalent for ${servesOf(o)}.`.slice(0, 200) });
        used.set(best.id, (used.get(best.id) ?? 0) + 1);
        resolutions.push({ ...record, status: "substituted", substituteId: best.id, substituteName: best.name });
      } else resolutions.push({ ...record, status: "unresolved", substituteId: null, substituteName: null });
    }
    s.exercises = kept;
  }
  return { plan, resolutions };
}
