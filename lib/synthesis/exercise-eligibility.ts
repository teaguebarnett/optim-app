// Gate 4.0C-1B — where a client's ConstraintSet meets Fitness Knowledge.
// Kept outside lib/synthesis/knowledge/ so the knowledge layer never sees a
// client fact.
//
// Structured tags (avoid pattern / demand / position, equipment) are
// decided from exercise METADATA — "Leg Press" is a squat-pattern exercise
// with no "squat" in its name; "Bulgarian Split Squat" is a single-leg
// exercise despite it. The one name-based path is `avoid_exercise_term`:
// OPTIM's literal, unconfirmed reading of the client's own words (Gate
// 4.0C-1). It matches whole words of a name or alias (search, not
// semantics), is reported separately as `name_search`, and is superseded
// once a coach documents the limitation. No free-text interpretation here.

import { effectiveConstraints, type Constraint, type ConstraintSet } from "./constraints.ts";
import { levelRank } from "./knowledge/taxonomy.ts";
import { LOADED_DEMAND_CONDITION, type ExerciseEntry, type ExerciseFilter, type FitnessKnowledgeRegistry } from "./knowledge/types.ts";

export interface EligibilityViolation {
  constraintId: string;
  enforcement: Constraint["enforcement"];
  basis: "metadata" | "name_search";
  reason: string;
}

/** Gate 4.0C-3B — eligible only when kept submaximal: a demand restriction the
 * exercise meets at its base level but would breach when performed heavy or
 * close to failure (ExerciseEntry.loadedDemands). */
export interface LoadCondition {
  constraintId: string;
  enforcement: Constraint["enforcement"];
  demand: string;
  /** The restricted level (restriction: below this). */
  limit: string;
  loadedLevel: string;
  /** Prescriptions must allow at least this many reps and keep at least this many reps in reserve. */
  minReps: number;
  minRir: number;
}

export interface ExerciseEligibility {
  eligible: boolean;
  /** Hard violations make an exercise ineligible; soft ones are reported. */
  violations: EligibilityViolation[];
  /** Restrictions satisfied only while the exercise stays submaximal. */
  loadConditions: LoadCondition[];
}

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

export function exerciseEligibility(exercise: ExerciseEntry, constraints: ConstraintSet): ExerciseEligibility {
  const violations: EligibilityViolation[] = [];
  const loadConditions: LoadCondition[] = [];
  for (const c of effectiveConstraints(constraints)) {
    const v = (basis: EligibilityViolation["basis"], reason: string) => violations.push({ constraintId: c.id, enforcement: c.enforcement, basis, reason });
    for (const t of c.tags) {
      switch (t.kind) {
        case "avoid_movement_pattern":
          if (exercise.patterns.includes(t.pattern)) v("metadata", `movement pattern ${t.pattern}`);
          break;
        case "avoid_demand":
          if (levelRank(exercise.demands[t.demand]) >= levelRank(t.atOrAbove)) v("metadata", `${t.demand} demand is ${exercise.demands[t.demand]} (limit: below ${t.atOrAbove})`);
          else {
            const loaded = exercise.loadedDemands?.[t.demand];
            if (loaded && levelRank(loaded) >= levelRank(t.atOrAbove)) loadConditions.push({ constraintId: c.id, enforcement: c.enforcement, demand: t.demand, limit: t.atOrAbove, loadedLevel: loaded, ...LOADED_DEMAND_CONDITION });
          }
          break;
        case "avoid_position":
          if (exercise.positions.includes(t.position)) v("metadata", `position ${t.position}`);
          break;
        case "avoid_exercise":
          if (exercise.id === t.exerciseId) v("metadata", "excluded by the coach");
          break;
        case "avoid_equipment":
          if (exercise.equipment === t.equipment) v("metadata", `uses ${t.equipment}`);
          break;
        case "equipment_available":
          if (!t.equipment.includes(exercise.equipment)) v("metadata", `needs ${exercise.equipment}`);
          break;
        case "avoid_exercise_term": {
          if (c.interpretedBy) break; // a coach-structured restriction speaks for it
          const term = words(t.term);
          if ([exercise.name, ...exercise.aliases].some((n) => words(n).includes(term))) v("name_search", `matches "${t.term}" from the client's own words (unconfirmed reading)`);
          break;
        }
        default:
          // Scheduling / review / free-text tags aren't exercise properties.
          break;
      }
    }
  }
  return { eligible: !violations.some((x) => x.enforcement === "hard"), violations, loadConditions };
}

export interface ConstraintCompatibility {
  eligible: ExerciseEntry[];
  excluded: Array<{ exercise: ExerciseEntry; violations: EligibilityViolation[] }>;
  /** Effective hard constraints carrying free text no structured tag captures — a coach must interpret them. */
  needsCoachInterpretation: string[];
}

export function compatibleWithConstraints(knowledge: FitnessKnowledgeRegistry, constraints: ConstraintSet, filter?: ExerciseFilter): ConstraintCompatibility {
  const eligible: ExerciseEntry[] = [];
  const excluded: ConstraintCompatibility["excluded"] = [];
  for (const e of knowledge.findExercises(filter)) {
    const r = exerciseEligibility(e, constraints);
    if (r.eligible) eligible.push(e);
    else excluded.push({ exercise: e, violations: r.violations });
  }
  const needsCoachInterpretation = effectiveConstraints(constraints)
    .filter((c) => c.enforcement === "hard" && c.confirmation !== "coach_confirmed" && c.tags.some((t) => t.kind === "free_text"))
    .map((c) => c.id);
  return { eligible, excluded, needsCoachInterpretation };
}
