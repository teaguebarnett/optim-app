// Gate 4.0C-2A — the restrictions a coach can confirm, in coach language,
// each mapped to canonical structured ConstraintTags over the Fitness
// Knowledge taxonomy (patterns, demands, positions, equipment, exercise
// ids). This is the ONLY vocabulary an interpretation may use: anything the
// model proposes outside it is rejected. Coaching restrictions, never
// medical rules — nothing here is keyed to a diagnosis.

import type { ConstraintTag } from "../constraints.ts";
import { EQUIPMENT, type BodyPosition, type Demand, type EquipmentId, type Level, type MovementPatternId } from "../knowledge/taxonomy.ts";
import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";

export type RestrictionGroup = "movements" | "demands" | "positions" | "equipment" | "exercises";

export interface RestrictionOption {
  id: string;
  group: RestrictionGroup;
  label: string;
  /** One line a coach reads to check it's what they meant. */
  help: string;
  tags: ConstraintTag[];
}

const pattern = (id: string, label: string, help: string, patterns: MovementPatternId[]): RestrictionOption => ({
  id,
  group: "movements",
  label,
  help,
  tags: patterns.map((p) => ({ kind: "avoid_movement_pattern", pattern: p })),
});
const demand = (id: string, label: string, help: string, d: Demand, atOrAbove: Level): RestrictionOption => ({ id, group: "demands", label, help, tags: [{ kind: "avoid_demand", demand: d, atOrAbove }] });
const position = (id: string, label: string, help: string, p: BodyPosition): RestrictionOption => ({ id, group: "positions", label, help, tags: [{ kind: "avoid_position", position: p }] });

const EQUIPMENT_LABEL: Record<EquipmentId, string> = { barbell: "barbells", dumbbell: "dumbbells", machine: "machines", cable: "cables", bodyweight: "bodyweight-only exercises", bands: "bands", kettlebell: "kettlebells" };

export const RESTRICTION_OPTIONS: RestrictionOption[] = [
  pattern("avoid_squat", "Avoid squat-pattern exercises", "Squats, leg press, hack squat — any bilateral knee-dominant pattern.", ["squat"]),
  pattern("avoid_hinge", "Avoid hinge / deadlift-pattern exercises", "Deadlifts, RDLs, swings, back extensions.", ["hinge"]),
  pattern("avoid_single_leg", "Avoid loaded single-leg exercises", "Lunges, split squats, step-ups.", ["single_leg"]),
  pattern("avoid_hip_thrust", "Avoid hip thrusts and bridges", "Hip thrusts, glute bridges.", ["hip_thrust"]),
  pattern("avoid_lower_compounds", "Avoid all lower-body compound lifts", "Squat, hinge, single-leg and hip-thrust patterns together.", ["squat", "hinge", "single_leg", "hip_thrust"]),
  pattern("avoid_direct_trunk", "Avoid direct ab / trunk exercises", "Crunches, planks, Pallof presses, woodchops, side planks.", ["trunk_flexion", "trunk_rotation", "anti_extension", "anti_rotation", "anti_lateral_flexion"]),
  pattern("avoid_trunk_flexion", "Avoid crunch-type ab exercises", "Crunches and knee/leg raises only.", ["trunk_flexion"]),
  pattern("avoid_horizontal_push", "Avoid horizontal pressing", "Bench press, push-ups, chest press.", ["horizontal_push"]),
  pattern("avoid_vertical_push", "Avoid overhead pressing", "Overhead and shoulder presses.", ["vertical_push"]),
  pattern("avoid_horizontal_pull", "Avoid rows", "Barbell, dumbbell, cable and machine rows.", ["horizontal_pull"]),
  pattern("avoid_vertical_pull", "Avoid pull-ups and pulldowns", "Pull-ups, chin-ups, lat pulldowns.", ["vertical_pull"]),
  pattern("avoid_knee_extension", "Avoid leg extensions", "Knee-extension isolation.", ["knee_extension"]),
  pattern("avoid_knee_flexion", "Avoid leg curls", "Knee-flexion isolation, including Nordic curls.", ["knee_flexion"]),
  pattern("avoid_calf_raise", "Avoid calf raises", "All calf-raise variations.", ["calf_raise"]),
  pattern("avoid_shoulder_isolation", "Avoid shoulder isolation", "Raises, flys, face pulls.", ["shoulder_isolation"]),
  pattern("avoid_elbow_flexion", "Avoid curls", "Biceps curls of any kind.", ["elbow_flexion"]),
  pattern("avoid_elbow_extension", "Avoid triceps isolation", "Pushdowns, extensions, skull crushers.", ["elbow_extension"]),
  pattern("avoid_carries", "Avoid loaded carries", "Farmer's and suitcase carries.", ["carry"]),
  pattern("avoid_jumps", "Avoid jumping / plyometrics", "Box jumps and other jumps.", ["jump"]),
  pattern("avoid_ballistic", "Avoid ballistic lifts", "Kettlebell swings and similar.", ["ballistic"]),

  demand("avoid_bracing_high", "Avoid exercises that need hard bracing", "Heavy squats, deadlifts, overhead presses, carries.", "bracing", "high"),
  demand("avoid_bracing_moderate", "Avoid exercises that need moderate or hard bracing", "Stricter: also excludes moderate-bracing lifts (e.g. goblet squats, dumbbell RDLs, pull-ups).", "bracing", "moderate"),
  demand("avoid_spinal_loading_high", "Avoid heavy spinal loading", "Barbell squats, deadlifts, bent-over rows.", "spinal_loading", "high"),
  demand("avoid_spinal_loading_moderate", "Avoid moderate or heavy spinal loading", "Stricter: also excludes moderate spinal loading.", "spinal_loading", "moderate"),
  demand("avoid_impact_high", "Avoid high-impact exercises", "Jumps and other high-impact work.", "impact", "high"),
  demand("avoid_impact_any", "Avoid any impact", "Excludes everything with low impact or more (e.g. walking lunges, carries).", "impact", "low"),
  demand("avoid_grip_high", "Avoid grip-intensive exercises", "Deadlifts, pull-ups, carries, hanging work.", "grip", "high"),
  demand("avoid_balance_high", "Avoid balance-demanding exercises", "Split squats, lunges, single-leg work.", "stability", "high"),

  position("avoid_overhead", "Avoid arms-overhead positions", "Overhead pressing, pulldowns, hanging work.", "overhead"),
  position("avoid_hanging", "Avoid hanging", "Pull-ups, hanging knee raises.", "hanging"),
  position("avoid_supine", "Avoid lying on the back", "Bench pressing, hip thrusts, dead bugs.", "supine"),
  position("avoid_prone", "Avoid lying face down", "Push-ups, planks, chest-supported rows.", "prone"),
  position("avoid_kneeling", "Avoid kneeling", "Kneeling cable work, Nordic curls.", "kneeling"),

  ...EQUIPMENT.map((e): RestrictionOption => ({ id: `avoid_equipment_${e}`, group: "equipment", label: `Avoid ${EQUIPMENT_LABEL[e]}`, help: `No exercises using ${EQUIPMENT_LABEL[e]}.`, tags: [{ kind: "avoid_equipment", equipment: e }] })),
];

const BY_ID = new Map(RESTRICTION_OPTIONS.map((o) => [o.id, o]));

/** An option id: a vocabulary id, or `exercise:<knowledge id>` for a specific exercise. */
export function resolveRestrictionOption(id: string, knowledge: FitnessKnowledgeRegistry): RestrictionOption | null {
  const fixed = BY_ID.get(id);
  if (fixed) return fixed;
  if (id.startsWith("exercise:")) {
    const ex = knowledge.getExercise(id.slice("exercise:".length));
    if (ex) return { id, group: "exercises", label: `Avoid ${ex.name}`, help: "This specific exercise.", tags: [{ kind: "avoid_exercise", exerciseId: ex.id }] };
  }
  return null;
}

/** Every option a coach can add, including one per exercise. */
export function allRestrictionOptions(knowledge: FitnessKnowledgeRegistry): RestrictionOption[] {
  return [...RESTRICTION_OPTIONS, ...knowledge.exercises().map((e) => resolveRestrictionOption(`exercise:${e.id}`, knowledge)!)];
}

/**
 * Gate 4.0C-4 — which DIMENSION an option belongs to. Options in the same
 * dimension are alternative answers to one question (levels of one demand:
 * "hard bracing" vs "moderate or hard bracing") and are mutually exclusive;
 * options in different dimensions are independent facts that can all be true
 * at once (a bracing limit AND a specific exercise AND a movement pattern).
 */
export function dimensionOf(optionId: string, knowledge: FitnessKnowledgeRegistry): { key: string; label: string } {
  const opt = resolveRestrictionOption(optionId, knowledge);
  const tag = opt?.tags[0];
  if (opt && opt.tags.length === 1 && tag?.kind === "avoid_demand") return { key: `demand:${tag.demand}`, label: `${tag.demand.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} limit` };
  return { key: `option:${optionId}`, label: opt?.label ?? optionId };
}

export interface ClarificationDimension {
  key: string;
  label: string;
  options: string[];
  /** More than one option = pick at most one (single select); one option = an independent yes/no fact. */
  exclusive: boolean;
}

/** Groups a clarification's choices into dimensions (single select only within a dimension). */
export function clarificationDimensions(choices: string[], knowledge: FitnessKnowledgeRegistry): ClarificationDimension[] {
  const dims = new Map<string, ClarificationDimension>();
  for (const id of choices) {
    const d = dimensionOf(id, knowledge);
    const cur = dims.get(d.key) ?? { key: d.key, label: d.label, options: [], exclusive: false };
    if (!cur.options.includes(id)) cur.options.push(id);
    cur.exclusive = cur.options.length > 1;
    dims.set(d.key, cur);
  }
  return [...dims.values()];
}

const LEVEL_RANK: Record<string, number> = { none: 0, low: 1, moderate: 2, high: 3 };
/** True when every tag of `a` is implied by `b` (e.g. "hard bracing" is implied by "moderate or hard bracing"). */
export function subsumes(b: ConstraintTag[], a: ConstraintTag[]): boolean {
  return a.every((t) =>
    b.some((u) => {
      if (t.kind === "avoid_demand" && u.kind === "avoid_demand") return t.demand === u.demand && LEVEL_RANK[u.atOrAbove] <= LEVEL_RANK[t.atOrAbove];
      return JSON.stringify(t) === JSON.stringify(u);
    })
  );
}
