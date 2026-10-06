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

import { createHash } from "node:crypto";
import { effectiveConstraints, type Constraint, type ConstraintSet } from "./constraints.ts";
import { JOINT_ACTIONS, LIMB_REGIONS, levelRank, type JointActionId, type LimbRegion } from "./knowledge/taxonomy.ts";
import { LOADED_DEMAND_CONDITION, type DemandCompatibility, type ExerciseEntry, type ExerciseFilter, type FitnessKnowledgeRegistry } from "./knowledge/types.ts";

export interface EligibilityViolation {
  constraintId: string;
  enforcement: Constraint["enforcement"];
  basis: "metadata" | "name_search";
  reason: string;
}

/** Gate 4.0C-3B/3C — a demand restriction the exercise meets at its base level
 * but would breach when performed heavy or close to failure
 * (ExerciseEntry.loadedDemands). Staying submaximal is necessary, not proof:
 * `certainty` says whether knowledge can rely on the stated conditions
 * ("conditional") or can't establish compatibility ("uncertain" → coach review). */
export interface LoadCondition {
  certainty: "conditional" | "uncertain";
  /** Execution/loading conditions, in coach language (necessary, not sufficient when uncertain). */
  conditions: string[];
  constraintId: string;
  enforcement: Constraint["enforcement"];
  demand: string;
  /** The restricted level (restriction: below this). */
  limit: string;
  loadedLevel: string;
  /** Prescriptions must allow at least this many reps and keep at least this many reps in reserve. */
  minReps: number;
  minRir: number;
  /** Gate 4.0C-5 — "uncertain" before a coach clearance made it conditional (kept for the basis and the record). */
  originalCertainty?: "uncertain";
}

/** Plain description of the restriction behind a load condition (demand limits and limb restrictions). */
export function describeLoadCondition(lc: LoadCondition): string {
  if (lc.demand.startsWith("limb:")) {
    const region = lc.demand.slice(5) as LimbRegion;
    return `the ${lc.limit === "both" ? "both" : lc.limit} ${LIMB_REGIONS[region]?.label ?? region} restriction`;
  }
  return `nothing needing ${lc.demand.replace(/_/g, " ")} at ${lc.limit} or above`;
}

/** The overall compatibility of an exercise with a constraint set (Gate 4.0C-3C). */
export function demandCompatibility(e: ExerciseEligibility): DemandCompatibility {
  if (!e.eligible) return "incompatible";
  const hard = e.loadConditions.filter((c) => c.enforcement === "hard");
  if (hard.some((c) => c.certainty === "uncertain")) return "uncertain";
  return hard.length || e.sideOnly ? "conditional" : "compatible";
}

/**
 * Laterality — how an exercise involves a limb region, from metadata only: "dynamic" when one of its joint actions
 * is at that region (and in the restricted actions, when listed); "hold" when the arm only holds/grips a meaningful
 * load (grip demand ≥ moderate or hanging) and the restriction covers elbow flexion or the whole region; null when
 * the region isn't involved. Lower-limb stance loading isn't modelled beyond split stances.
 */
export function limbInvolvement(exercise: ExerciseEntry, region: LimbRegion, actions?: JointActionId[]): "dynamic" | "hold" | null {
  const joints = new Set<string>(LIMB_REGIONS[region].joints);
  if (exercise.jointActions.some((a) => joints.has(JOINT_ACTIONS[a].joint) && (!actions?.length || actions.includes(a)))) return "dynamic";
  const upper = joints.has("elbow") || joints.has("wrist") || joints.has("shoulder");
  const holds = levelRank(exercise.demands.grip) >= levelRank("moderate") || exercise.positions.includes("hanging");
  if (upper && holds && (!actions?.length || actions.includes("elbow_flexion"))) return "hold";
  return null;
}

export interface ExerciseEligibility {
  eligible: boolean;
  /** Hard violations make an exercise ineligible; soft ones are reported. */
  violations: EligibilityViolation[];
  /** Restrictions satisfied only while the exercise stays submaximal. */
  loadConditions: LoadCondition[];
  /** Gate 4.0C-5 — set when an uncertain fit was made conditional by the coach's exercise clearance
   * (exercise_cleared, matching basis): the conditions the coach accepted. */
  clearedBy?: { constraintId: string; conditions: string[] };
  /** Laterality — a unilateral exercise that fits only when performed with the UNAFFECTED side. */
  sideOnly?: { side: "left" | "right"; constraintId: string; reason: string };
}

/** Stable fingerprint of an exercise's eligibility (what blocks it, under which conditions) — EXCLUDING any coach
 * clearance, so a clearance can be checked against the basis it was granted under. */
export function eligibilityBasis(e: ExerciseEligibility): string {
  return createHash("sha256")
    .update(JSON.stringify({ l: e.loadConditions.filter((x) => x.enforcement === "hard").map((x) => `${x.demand}:${x.limit}:${x.originalCertainty ?? x.certainty}`).sort(), v: e.violations.filter((x) => x.enforcement === "hard").map((x) => x.reason).sort() }))
    .digest("hex");
}

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

export function exerciseEligibility(exercise: ExerciseEntry, constraints: ConstraintSet): ExerciseEligibility {
  const violations: EligibilityViolation[] = [];
  const loadConditions: LoadCondition[] = [];
  let sideOnly: ExerciseEligibility["sideOnly"];
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
            if (loaded && levelRank(loaded) >= levelRank(t.atOrAbove)) {
              // Only a pad that carries or backs the trunk lets execution conditions be trusted; a thigh/knee pad
              // merely anchors the pelvis (V2), so that fit stays uncertain — never silently "safe".
              const supported = exercise.trunkSupport === "partial" || exercise.trunkSupport === "external";
              const conditions = [`at least ${LOADED_DEMAND_CONDITION.minReps} reps per set`, `at least ${LOADED_DEMAND_CONDITION.minRir} reps in reserve`, ...(supported ? ["trunk kept against the pad or bench throughout"] : [])];
              loadConditions.push({ certainty: supported ? "conditional" : "uncertain", conditions, constraintId: c.id, enforcement: c.enforcement, demand: t.demand, limit: t.atOrAbove, loadedLevel: loaded, ...LOADED_DEMAND_CONDITION });
            }
          }
          break;
        case "avoid_position":
          if (exercise.positions.includes(t.position)) v("metadata", `position ${t.position}`);
          break;
        case "avoid_limb_loading": {
          const r = limbInvolvement(exercise, t.region, t.actions);
          if (!r) break;
          const where = `${t.side === "both" ? "both" : t.side} ${LIMB_REGIONS[t.region].label}`;
          const what = t.actions?.length ? t.actions.map((a) => a.replace(/_/g, " ")).join("/") : "loading";
          const lowerSplit = LIMB_REGIONS[t.region].joints.some((j) => j === "hip" || j === "knee" || j === "ankle") && exercise.positions.includes("split_stance");
          if (t.side !== "both" && exercise.laterality === "unilateral" && !lowerSplit) {
            // One limb at a time: it fits with the other side only (never a family-wide ban).
            if (!sideOnly) sideOnly = { side: t.side === "left" ? "right" : "left", constraintId: c.id, reason: `${where}: no ${what}` };
          } else if (r === "dynamic") v("metadata", `${where}: ${what} (uses that limb)`);
          else
            loadConditions.push({ certainty: "uncertain", conditions: [`OPTIM can't establish the ${where} isn't loaded ${r === "hold" ? "while holding or gripping the weight" : "by the other leg's stance"}`], constraintId: c.id, enforcement: c.enforcement, demand: `limb:${t.region}`, limit: t.side, loadedLevel: r, ...LOADED_DEMAND_CONDITION });
          break;
        }
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
  const result: ExerciseEligibility = { eligible: !violations.some((x) => x.enforcement === "hard"), violations, loadConditions, ...(sideOnly ? { sideOnly } : {}) };
  // Gate 4.0C-5 — a coach clearance turns THIS exercise's uncertain fit into conditional fit, only under the basis it
  // was granted against (a stricter or different restriction makes it inert) and never for an ineligible exercise.
  if (result.eligible && loadConditions.some((l) => l.certainty === "uncertain" && l.enforcement === "hard")) {
    const basis = eligibilityBasis(result);
    for (const c of effectiveConstraints(constraints))
      for (const t of c.tags)
        if (t.kind === "exercise_cleared" && t.exerciseId === exercise.id && t.basis === basis) {
          result.loadConditions = loadConditions.map((l) => (l.certainty === "uncertain" ? { ...l, certainty: "conditional", originalCertainty: "uncertain", conditions: t.conditions.length ? t.conditions : l.conditions } : l));
          result.clearedBy = { constraintId: c.id, conditions: t.conditions };
          return result;
        }
  }
  return result;
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
