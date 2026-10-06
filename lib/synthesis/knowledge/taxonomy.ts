// Gate 4.0C-1B — the resistance-training taxonomy: typed, stable ids for
// what resistance programming actually reasons about. Programming-level
// groups, not a medical anatomy atlas.
//
// Each list is the single place an id exists; everything else imports the
// type. Adding an id here is how the vocabulary grows.

import type { EquipmentTag } from "../../coach/exercise-library.ts";

export const MUSCLES = {
  chest: { name: "Chest", region: "upper" },
  front_delts: { name: "Front (anterior) deltoids", region: "upper" },
  side_delts: { name: "Side (lateral) deltoids", region: "upper" },
  rear_delts: { name: "Rear (posterior) deltoids", region: "upper" },
  biceps: { name: "Biceps", region: "upper" },
  triceps: { name: "Triceps", region: "upper" },
  forearms: { name: "Forearms / grip", region: "upper" },
  lats: { name: "Lats", region: "upper" },
  upper_traps: { name: "Upper traps", region: "upper" },
  mid_back: { name: "Mid back (rhomboids, mid/lower traps — scapular retractors)", region: "upper" },
  spinal_erectors: { name: "Spinal erectors", region: "trunk" },
  abdominals: { name: "Abdominals", region: "trunk" },
  obliques: { name: "Obliques", region: "trunk" },
  hip_flexors: { name: "Hip flexors", region: "lower" },
  glutes: { name: "Glutes", region: "lower" },
  quadriceps: { name: "Quadriceps", region: "lower" },
  hamstrings: { name: "Hamstrings", region: "lower" },
  adductors: { name: "Adductors", region: "lower" },
  abductors: { name: "Hip abductors (glute med/min, TFL)", region: "lower" },
  calves: { name: "Calves", region: "lower" },
} as const satisfies Record<string, { name: string; region: "upper" | "lower" | "trunk" }>;
export type MuscleId = keyof typeof MUSCLES;

export const JOINT_ACTIONS = {
  shoulder_flexion: { joint: "shoulder" },
  shoulder_extension: { joint: "shoulder" },
  shoulder_abduction: { joint: "shoulder" },
  shoulder_adduction: { joint: "shoulder" },
  shoulder_horizontal_adduction: { joint: "shoulder" },
  shoulder_horizontal_abduction: { joint: "shoulder" },
  shoulder_external_rotation: { joint: "shoulder" },
  scapular_retraction: { joint: "scapula" },
  scapular_elevation: { joint: "scapula" },
  elbow_flexion: { joint: "elbow" },
  elbow_extension: { joint: "elbow" },
  hip_extension: { joint: "hip" },
  hip_flexion: { joint: "hip" },
  hip_abduction: { joint: "hip" },
  hip_adduction: { joint: "hip" },
  knee_extension: { joint: "knee" },
  knee_flexion: { joint: "knee" },
  ankle_plantarflexion: { joint: "ankle" },
  spinal_flexion: { joint: "spine" },
  spinal_rotation: { joint: "spine" },
  spinal_extension: { joint: "spine" },
} as const satisfies Record<string, { joint: string }>;
export type JointActionId = keyof typeof JOINT_ACTIONS;

export const MOVEMENT_PATTERNS = {
  horizontal_push: { name: "Horizontal push", category: "upper_push" },
  vertical_push: { name: "Vertical push", category: "upper_push" },
  horizontal_pull: { name: "Horizontal pull", category: "upper_pull" },
  vertical_pull: { name: "Vertical pull", category: "upper_pull" },
  squat: { name: "Squat / knee-dominant (bilateral)", category: "lower" },
  hinge: { name: "Hinge / hip-dominant", category: "lower" },
  hip_thrust: { name: "Hip thrust / bridge (hip extension without a hinge)", category: "lower" },
  single_leg: { name: "Loaded single-leg (lunge, split squat, step-up)", category: "lower" },
  knee_flexion: { name: "Knee flexion", category: "lower_isolation" },
  knee_extension: { name: "Knee extension", category: "lower_isolation" },
  hip_abduction: { name: "Hip abduction", category: "lower_isolation" },
  hip_adduction: { name: "Hip adduction", category: "lower_isolation" },
  calf_raise: { name: "Calf raise / plantarflexion", category: "lower_isolation" },
  elbow_flexion: { name: "Elbow flexion", category: "arm_isolation" },
  elbow_extension: { name: "Elbow extension", category: "arm_isolation" },
  shoulder_isolation: { name: "Shoulder isolation (raises, flys, rear-delt work)", category: "upper_isolation" },
  /** V2 — straight-arm / pullover work: lat-focused shoulder extension without elbow flexion. */
  shoulder_extension: { name: "Shoulder extension (straight-arm pulldowns, pullovers)", category: "upper_isolation" },
  /** V2 — single-joint hip extension (kickbacks): glute work without a squat, hinge or bridge. */
  hip_extension_isolation: { name: "Hip extension isolation (kickbacks)", category: "lower_isolation" },
  /** V2 — scapular elevation (shrugs). */
  shrug: { name: "Shrug / scapular elevation", category: "upper_isolation" },
  carry: { name: "Loaded carry", category: "full_body" },
  trunk_flexion: { name: "Trunk flexion", category: "trunk" },
  trunk_rotation: { name: "Trunk rotation", category: "trunk" },
  anti_extension: { name: "Anti-extension", category: "trunk" },
  anti_rotation: { name: "Anti-rotation", category: "trunk" },
  anti_lateral_flexion: { name: "Anti-lateral flexion", category: "trunk" },
  jump: { name: "Jump / plyometric", category: "power" },
  ballistic: { name: "Ballistic (e.g. swings)", category: "power" },
} as const satisfies Record<string, { name: string; category: string }>;
export type MovementPatternId = keyof typeof MOVEMENT_PATTERNS;

/** The implement — the same tags OPTIM's exercise library and client
 * equipment derivation already use. */
export const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "bands", "kettlebell"] as const satisfies readonly EquipmentTag[];
export type EquipmentId = (typeof EQUIPMENT)[number];

/** Fixed apparatus an exercise also needs (a pull-up needs a bar even
 * though it's "bodyweight"). Not derivable from today's intake. */
export const APPARATUS = ["bench", "squat_rack", "pull_up_bar", "box", "back_extension_bench", "trap_bar", "ankle_anchor", "dip_station"] as const;
export type ApparatusId = (typeof APPARATUS)[number];

export const BODY_POSITIONS = ["standing", "seated", "supine", "prone", "side_lying", "kneeling", "split_stance", "single_leg_stance", "hanging", "hip_hinged", "overhead"] as const;
export type BodyPosition = (typeof BODY_POSITIONS)[number];

export const LEVELS = ["none", "low", "moderate", "high"] as const;
export type Level = (typeof LEVELS)[number];
export const levelRank = (l: Level): number => LEVELS.indexOf(l);

/** What an exercise asks of the trainee, rated per exercise. */
export const DEMANDS = ["skill", "stability", "bracing", "spinal_loading", "impact", "grip", "systemic_fatigue"] as const;
export type Demand = (typeof DEMANDS)[number];

export const PROGRESSION_MODES = ["load", "reps", "sets", "tempo", "range_of_motion", "leverage", "reduced_assistance", "duration", "distance"] as const;
export type ProgressionMode = (typeof PROGRESSION_MODES)[number];

export const TRAINING_QUALITIES = ["strength", "hypertrophy", "power"] as const;
export type TrainingQuality = (typeof TRAINING_QUALITIES)[number];

/** V2 — how much the setup supports the trunk (decides how far execution conditions can be trusted to keep a
 * load-sensitive demand low): a chest pad / prone bench carries it (external); a back pad or bench supports it
 * (partial); a thigh/knee pad only anchors the pelvis — the trunk still stabilizes itself (thigh_anchored); none. */
export const TRUNK_SUPPORT = ["external", "partial", "thigh_anchored", "none"] as const;
export type TrunkSupport = (typeof TRUNK_SUPPORT)[number];

/** V2 — the training role an exercise usually plays in a program (a planning hint, not a rule). */
export const EXERCISE_ROLES = ["main_lift", "compound_accessory", "isolation", "trunk", "carry", "power"] as const;
export type ExerciseRole = (typeof EXERCISE_ROLES)[number];

/** V2 — grip / arm path, only where it materially changes the stimulus or the fit. */
export const GRIPS = ["neutral", "pronated", "supinated", "mixed", "rope", "single_handle"] as const;
export const PULL_PATHS = ["horizontal", "low_row", "high_row", "vertical", "straight_arm", "incline", "decline", "overhead"] as const;
export const ELBOW_PATHS = ["tucked", "flared", "straight"] as const;
