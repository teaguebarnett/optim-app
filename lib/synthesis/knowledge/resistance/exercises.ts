// Gate 4.0C-1B — resistance exercise knowledge.
//
// Every exercise in lib/coach/exercise-library.ts appears here under the
// stable id Gate 4.0C-1 gave it (`exercise.<slug of its name>`), written
// out literally so a rename can never move an id. A small number of
// knowledge-only exercises fill pattern gaps (hip abduction/adduction,
// arm and calf variety, jumps); the legacy generator doesn't see them.
//
// All ratings (muscles, demands, suitability, ordering) are OPTIM internal
// curation using conventional exercise anatomy — labelled as such and
// pending qualified review. They are never derived from the name.

import type { Evidence, ExerciseEntry } from "../types.ts";
import type { ApparatusId, BodyPosition, EquipmentId, JointActionId, Level, MovementPatternId, MuscleId, ProgressionMode } from "../taxonomy.ts";
import { SOURCES } from "../sources.ts";

const N: Level = "none";
const L: Level = "low";
const M: Level = "moderate";
const H: Level = "high";

interface Spec {
  name: string;
  legacy?: true;
  aliases?: string[];
  patterns: MovementPatternId[];
  primary: MuscleId[];
  secondary?: MuscleId[];
  actions: JointActionId[];
  equipment: EquipmentId;
  apparatus?: ApparatusId[];
  positions: BodyPosition[];
  laterality?: ExerciseEntry["laterality"];
  mechanics: ExerciseEntry["mechanics"];
  contraction?: ExerciseEntry["contraction"];
  prescription?: ExerciseEntry["prescription"];
  /** skill, stability, bracing, spinal_loading, impact, grip, systemic_fatigue */
  demands: [Level, Level, Level, Level, Level, Level, Level];
  loading: Level;
  /** strength, hypertrophy, power */
  suits: [Level, Level, Level];
  progression: ProgressionMode[];
  ordering: ExerciseEntry["ordering"];
  harder?: string[];
}

const evidence: Evidence = { status: "internal_curation", sources: [{ sourceId: SOURCES.internalTaxonomy.id }], reviewedByQualifiedExpert: false };
const legacyEvidence: Evidence = { status: "internal_curation", sources: [{ sourceId: SOURCES.internalLibrary.id }, { sourceId: SOURCES.internalTaxonomy.id }], reviewedByQualifiedExpert: false };

function ex(id: string, s: Spec): ExerciseEntry {
  const [skill, stability, bracing, spinal_loading, impact, grip, systemic_fatigue] = s.demands;
  const [strength, hypertrophy, power] = s.suits;
  return {
    id,
    kind: "exercise",
    domain: "exercise",
    version: 1,
    scope: "coaching",
    evidence: s.legacy ? legacyEvidence : evidence,
    name: s.name,
    aliases: s.aliases ?? [],
    ...(s.legacy ? { legacyName: s.name } : {}),
    patterns: s.patterns,
    primaryMuscles: s.primary,
    secondaryMuscles: s.secondary ?? [],
    jointActions: s.actions,
    equipment: s.equipment,
    apparatus: s.apparatus ?? [],
    positions: s.positions,
    laterality: s.laterality ?? "bilateral",
    mechanics: s.mechanics,
    contraction: s.contraction ?? "dynamic",
    prescription: s.prescription ?? ["reps"],
    demands: { skill, stability, bracing, spinal_loading, impact, grip, systemic_fatigue },
    loadingPotential: s.loading,
    suitability: { strength, hypertrophy, power },
    progressionModes: s.progression,
    ordering: s.ordering,
    harderVariants: s.harder ?? [],
  };
}

const LOAD: ProgressionMode[] = ["load", "reps", "sets", "tempo"];
const ACCESSORY: ProgressionMode[] = ["load", "reps", "sets", "tempo", "range_of_motion"];

export const RESISTANCE_EXERCISES: ExerciseEntry[] = [
  // --- Squat / knee-dominant -------------------------------------------------
  ex("exercise.barbell_back_squat", { name: "Barbell Back Squat", legacy: true, aliases: ["Back Squat"], patterns: ["squat"], primary: ["quadriceps", "glutes"], secondary: ["adductors", "spinal_erectors", "abdominals"], actions: ["knee_extension", "hip_extension"], equipment: "barbell", apparatus: ["squat_rack"], positions: ["standing"], mechanics: "compound", demands: [M, M, H, H, N, L, H], loading: H, suits: [H, H, L], progression: LOAD, ordering: "early" }),
  ex("exercise.front_squat", { name: "Front Squat", legacy: true, patterns: ["squat"], primary: ["quadriceps"], secondary: ["glutes", "abdominals", "spinal_erectors", "mid_back"], actions: ["knee_extension", "hip_extension"], equipment: "barbell", apparatus: ["squat_rack"], positions: ["standing"], mechanics: "compound", demands: [H, M, H, H, N, L, H], loading: H, suits: [H, H, L], progression: LOAD, ordering: "early" }),
  ex("exercise.goblet_squat", { name: "Goblet Squat", legacy: true, patterns: ["squat"], primary: ["quadriceps", "glutes"], secondary: ["adductors", "abdominals"], actions: ["knee_extension", "hip_extension"], equipment: "dumbbell", positions: ["standing"], mechanics: "compound", demands: [L, L, M, L, N, L, M], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "flexible", harder: ["exercise.barbell_back_squat", "exercise.front_squat"] }),
  ex("exercise.leg_press", { name: "Leg Press", legacy: true, patterns: ["squat"], primary: ["quadriceps", "glutes"], secondary: ["adductors"], actions: ["knee_extension", "hip_extension"], equipment: "machine", positions: ["seated"], mechanics: "compound", demands: [L, L, L, L, N, N, M], loading: H, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.bodyweight_squat", { name: "Bodyweight Squat", legacy: true, aliases: ["Air Squat"], patterns: ["squat"], primary: ["quadriceps", "glutes"], actions: ["knee_extension", "hip_extension"], equipment: "bodyweight", positions: ["standing"], mechanics: "compound", demands: [L, L, L, N, N, N, L], loading: L, suits: [L, L, N], progression: ["reps", "tempo", "range_of_motion"], ordering: "flexible", harder: ["exercise.goblet_squat"] }),
  ex("exercise.hack_squat", { name: "Hack Squat", patterns: ["squat"], primary: ["quadriceps"], secondary: ["glutes", "adductors"], actions: ["knee_extension", "hip_extension"], equipment: "machine", positions: ["standing"], mechanics: "compound", demands: [L, L, L, M, N, N, M], loading: H, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),

  // --- Loaded single-leg -----------------------------------------------------
  ex("exercise.bulgarian_split_squat", { name: "Bulgarian Split Squat", legacy: true, aliases: ["Rear-Foot-Elevated Split Squat"], patterns: ["single_leg"], primary: ["quadriceps", "glutes"], secondary: ["adductors"], actions: ["knee_extension", "hip_extension"], equipment: "dumbbell", apparatus: ["bench"], positions: ["split_stance"], laterality: "unilateral", mechanics: "compound", demands: [M, H, M, L, N, M, H], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.walking_lunge", { name: "Walking Lunge", legacy: true, patterns: ["single_leg"], primary: ["quadriceps", "glutes"], secondary: ["adductors", "hamstrings"], actions: ["knee_extension", "hip_extension"], equipment: "dumbbell", positions: ["standing", "split_stance"], laterality: "alternating", mechanics: "compound", prescription: ["reps", "distance"], demands: [M, H, M, L, L, M, M], loading: M, suits: [L, M, N], progression: ["load", "reps", "distance"], ordering: "flexible" }),
  ex("exercise.reverse_lunge", { name: "Reverse Lunge", legacy: true, patterns: ["single_leg"], primary: ["quadriceps", "glutes"], actions: ["knee_extension", "hip_extension"], equipment: "bodyweight", positions: ["standing", "split_stance"], laterality: "alternating", mechanics: "compound", demands: [L, M, L, N, N, N, L], loading: L, suits: [L, L, N], progression: ["reps", "tempo"], ordering: "flexible", harder: ["exercise.walking_lunge"] }),
  ex("exercise.dumbbell_split_squat", { name: "Dumbbell Split Squat", patterns: ["single_leg"], primary: ["quadriceps", "glutes"], secondary: ["adductors"], actions: ["knee_extension", "hip_extension"], equipment: "dumbbell", positions: ["split_stance"], laterality: "unilateral", mechanics: "compound", demands: [L, M, L, L, N, M, M], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "flexible", harder: ["exercise.bulgarian_split_squat"] }),
  ex("exercise.dumbbell_step_up", { name: "Dumbbell Step-Up", patterns: ["single_leg"], primary: ["quadriceps", "glutes"], actions: ["knee_extension", "hip_extension"], equipment: "dumbbell", apparatus: ["box"], positions: ["single_leg_stance"], laterality: "unilateral", mechanics: "compound", demands: [L, M, L, L, N, M, M], loading: M, suits: [L, M, N], progression: ["load", "reps", "range_of_motion"], ordering: "flexible" }),

  // --- Hinge / hip-dominant --------------------------------------------------
  ex("exercise.conventional_deadlift", { name: "Conventional Deadlift", legacy: true, aliases: ["Deadlift"], patterns: ["hinge"], primary: ["glutes", "hamstrings", "spinal_erectors"], secondary: ["quadriceps", "lats", "forearms", "upper_traps", "adductors"], actions: ["hip_extension", "knee_extension"], equipment: "barbell", positions: ["standing", "hip_hinged"], mechanics: "compound", demands: [H, M, H, H, N, H, H], loading: H, suits: [H, M, L], progression: ["load", "reps", "sets"], ordering: "early" }),
  ex("exercise.trap_bar_deadlift", { name: "Trap Bar Deadlift", aliases: ["Hex Bar Deadlift"], patterns: ["hinge"], primary: ["glutes", "quadriceps", "hamstrings"], secondary: ["spinal_erectors", "forearms", "upper_traps"], actions: ["hip_extension", "knee_extension"], equipment: "barbell", apparatus: ["trap_bar"], positions: ["standing", "hip_hinged"], mechanics: "compound", demands: [M, M, H, H, N, H, H], loading: H, suits: [H, M, M], progression: ["load", "reps", "sets"], ordering: "early" }),
  ex("exercise.romanian_deadlift", { name: "Romanian Deadlift", legacy: true, aliases: ["RDL"], patterns: ["hinge"], primary: ["hamstrings", "glutes"], secondary: ["spinal_erectors", "forearms", "adductors"], actions: ["hip_extension"], equipment: "barbell", positions: ["standing", "hip_hinged"], mechanics: "compound", demands: [M, M, H, H, N, H, M], loading: H, suits: [M, H, N], progression: ACCESSORY, ordering: "early" }),
  ex("exercise.dumbbell_romanian_deadlift", { name: "Dumbbell Romanian Deadlift", legacy: true, aliases: ["DB RDL"], patterns: ["hinge"], primary: ["hamstrings", "glutes"], secondary: ["spinal_erectors", "forearms"], actions: ["hip_extension"], equipment: "dumbbell", positions: ["standing", "hip_hinged"], mechanics: "compound", demands: [M, M, M, M, N, M, M], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", harder: ["exercise.romanian_deadlift"] }),
  ex("exercise.single_leg_romanian_deadlift", { name: "Single-Leg Romanian Deadlift", patterns: ["hinge"], primary: ["hamstrings", "glutes"], secondary: ["abductors", "spinal_erectors"], actions: ["hip_extension"], equipment: "dumbbell", positions: ["single_leg_stance", "hip_hinged"], laterality: "unilateral", mechanics: "compound", demands: [M, H, M, L, N, M, M], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.kettlebell_swing", { name: "Kettlebell Swing", legacy: true, patterns: ["hinge", "ballistic"], primary: ["glutes", "hamstrings"], secondary: ["spinal_erectors", "abdominals", "forearms"], actions: ["hip_extension"], equipment: "kettlebell", positions: ["standing", "hip_hinged"], mechanics: "compound", prescription: ["reps", "time"], demands: [M, M, M, M, N, M, M], loading: M, suits: [L, L, M], progression: ["load", "reps", "duration"], ordering: "early" }),
  ex("exercise.back_extension", { name: "Back Extension", legacy: true, aliases: ["Hyperextension", "45-Degree Back Extension"], patterns: ["hinge"], primary: ["spinal_erectors", "glutes", "hamstrings"], actions: ["hip_extension", "spinal_extension"], equipment: "bodyweight", apparatus: ["back_extension_bench"], positions: ["prone"], mechanics: "isolation", demands: [L, L, M, M, N, N, L], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),

  // --- Hip thrust / bridge ---------------------------------------------------
  ex("exercise.hip_thrust", { name: "Hip Thrust", legacy: true, aliases: ["Barbell Hip Thrust"], patterns: ["hip_thrust"], primary: ["glutes"], secondary: ["hamstrings", "adductors"], actions: ["hip_extension"], equipment: "barbell", apparatus: ["bench"], positions: ["supine"], mechanics: "compound", demands: [M, L, M, L, N, N, M], loading: H, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.glute_bridge", { name: "Glute Bridge", patterns: ["hip_thrust"], primary: ["glutes"], secondary: ["hamstrings"], actions: ["hip_extension"], equipment: "bodyweight", positions: ["supine"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: L, suits: [L, L, N], progression: ["reps", "tempo", "load"], ordering: "flexible", harder: ["exercise.hip_thrust"] }),

  // --- Horizontal push -------------------------------------------------------
  ex("exercise.barbell_bench_press", { name: "Barbell Bench Press", legacy: true, aliases: ["Bench Press", "Flat Bench Press"], patterns: ["horizontal_push"], primary: ["chest", "triceps", "front_delts"], actions: ["shoulder_horizontal_adduction", "elbow_extension"], equipment: "barbell", apparatus: ["bench"], positions: ["supine"], mechanics: "compound", demands: [M, M, M, L, N, L, M], loading: H, suits: [H, H, L], progression: LOAD, ordering: "early" }),
  ex("exercise.dumbbell_bench_press", { name: "Dumbbell Bench Press", legacy: true, patterns: ["horizontal_push"], primary: ["chest", "triceps", "front_delts"], actions: ["shoulder_horizontal_adduction", "elbow_extension"], equipment: "dumbbell", apparatus: ["bench"], positions: ["supine"], mechanics: "compound", demands: [M, M, L, L, N, M, M], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.incline_dumbbell_press", { name: "Incline Dumbbell Press", patterns: ["horizontal_push"], primary: ["chest", "front_delts"], secondary: ["triceps"], actions: ["shoulder_horizontal_adduction", "shoulder_flexion", "elbow_extension"], equipment: "dumbbell", apparatus: ["bench"], positions: ["supine"], mechanics: "compound", demands: [M, M, L, L, N, M, M], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.push_up", { name: "Push-Up", legacy: true, aliases: ["Press-Up"], patterns: ["horizontal_push", "anti_extension"], primary: ["chest", "triceps", "front_delts"], secondary: ["abdominals"], actions: ["shoulder_horizontal_adduction", "elbow_extension"], equipment: "bodyweight", positions: ["prone"], mechanics: "compound", demands: [L, M, M, N, N, L, L], loading: L, suits: [L, M, N], progression: ["reps", "tempo", "leverage", "load"], ordering: "flexible" }),
  ex("exercise.machine_chest_press", { name: "Machine Chest Press", legacy: true, patterns: ["horizontal_push"], primary: ["chest", "triceps", "front_delts"], actions: ["shoulder_horizontal_adduction", "elbow_extension"], equipment: "machine", positions: ["seated"], mechanics: "compound", demands: [L, L, L, N, N, L, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),

  // --- Vertical push ---------------------------------------------------------
  ex("exercise.overhead_press", { name: "Overhead Press", legacy: true, aliases: ["Military Press", "Standing Barbell Press", "OHP"], patterns: ["vertical_push"], primary: ["front_delts", "triceps"], secondary: ["side_delts", "upper_traps", "abdominals"], actions: ["shoulder_flexion", "elbow_extension"], equipment: "barbell", apparatus: ["squat_rack"], positions: ["standing", "overhead"], mechanics: "compound", demands: [M, M, H, M, N, L, M], loading: M, suits: [H, M, L], progression: LOAD, ordering: "early" }),
  ex("exercise.dumbbell_shoulder_press", { name: "Dumbbell Shoulder Press", legacy: true, patterns: ["vertical_push"], primary: ["front_delts", "triceps"], secondary: ["side_delts"], actions: ["shoulder_flexion", "shoulder_abduction", "elbow_extension"], equipment: "dumbbell", apparatus: ["bench"], positions: ["seated", "overhead"], mechanics: "compound", demands: [L, M, M, L, N, L, M], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.machine_shoulder_press", { name: "Machine Shoulder Press", legacy: true, patterns: ["vertical_push"], primary: ["front_delts", "triceps"], secondary: ["side_delts"], actions: ["shoulder_flexion", "elbow_extension"], equipment: "machine", positions: ["seated", "overhead"], mechanics: "compound", demands: [L, L, L, L, N, L, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.pike_push_up", { name: "Pike Push-Up", legacy: true, patterns: ["vertical_push"], primary: ["front_delts", "triceps"], secondary: ["upper_traps"], actions: ["shoulder_flexion", "elbow_extension"], equipment: "bodyweight", positions: ["prone", "overhead"], mechanics: "compound", demands: [M, M, M, L, N, L, L], loading: L, suits: [L, M, N], progression: ["reps", "leverage", "range_of_motion"], ordering: "flexible" }),

  // --- Shoulder isolation ----------------------------------------------------
  ex("exercise.lateral_raise", { name: "Lateral Raise", legacy: true, aliases: ["Dumbbell Lateral Raise", "Side Raise"], patterns: ["shoulder_isolation"], primary: ["side_delts"], secondary: ["upper_traps"], actions: ["shoulder_abduction"], equipment: "dumbbell", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.cable_lateral_raise", { name: "Cable Lateral Raise", patterns: ["shoulder_isolation"], primary: ["side_delts"], actions: ["shoulder_abduction"], equipment: "cable", positions: ["standing"], laterality: "unilateral", mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.cable_chest_fly", { name: "Cable Chest Fly", legacy: true, aliases: ["Cable Fly", "Cable Crossover"], patterns: ["shoulder_isolation"], primary: ["chest"], secondary: ["front_delts"], actions: ["shoulder_horizontal_adduction"], equipment: "cable", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.face_pull", { name: "Face Pull", legacy: true, patterns: ["shoulder_isolation"], primary: ["rear_delts"], secondary: ["mid_back"], actions: ["shoulder_horizontal_abduction", "shoulder_external_rotation", "scapular_retraction"], equipment: "cable", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.band_pull_apart", { name: "Band Pull-Apart", legacy: true, patterns: ["shoulder_isolation"], primary: ["rear_delts"], secondary: ["mid_back"], actions: ["shoulder_horizontal_abduction", "scapular_retraction"], equipment: "bands", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [N, L, N], progression: ["reps", "load", "tempo"], ordering: "late" }),
  ex("exercise.reverse_dumbbell_fly", { name: "Reverse Dumbbell Fly", aliases: ["Rear Delt Fly"], patterns: ["shoulder_isolation"], primary: ["rear_delts"], secondary: ["mid_back"], actions: ["shoulder_horizontal_abduction", "scapular_retraction"], equipment: "dumbbell", positions: ["hip_hinged"], mechanics: "isolation", demands: [L, L, L, L, N, L, L], loading: L, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),

  // --- Horizontal pull -------------------------------------------------------
  ex("exercise.barbell_row", { name: "Barbell Row", legacy: true, aliases: ["Bent-Over Row"], patterns: ["horizontal_pull"], primary: ["lats", "mid_back"], secondary: ["rear_delts", "biceps", "spinal_erectors", "forearms"], actions: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], equipment: "barbell", positions: ["standing", "hip_hinged"], mechanics: "compound", demands: [M, M, H, H, N, M, M], loading: H, suits: [M, H, N], progression: LOAD, ordering: "flexible" }),
  ex("exercise.dumbbell_row", { name: "Dumbbell Row", legacy: true, aliases: ["One-Arm Dumbbell Row"], patterns: ["horizontal_pull"], primary: ["lats", "mid_back"], secondary: ["rear_delts", "biceps", "forearms"], actions: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], equipment: "dumbbell", apparatus: ["bench"], positions: ["hip_hinged"], laterality: "unilateral", mechanics: "compound", demands: [L, L, L, L, N, M, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.seated_cable_row", { name: "Seated Cable Row", legacy: true, patterns: ["horizontal_pull"], primary: ["lats", "mid_back"], secondary: ["rear_delts", "biceps"], actions: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], equipment: "cable", positions: ["seated"], mechanics: "compound", demands: [L, L, L, L, N, M, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.chest_supported_row", { name: "Chest-Supported Row", legacy: true, aliases: ["Machine Row"], patterns: ["horizontal_pull"], primary: ["mid_back", "lats"], secondary: ["rear_delts", "biceps"], actions: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], equipment: "machine", positions: ["prone"], mechanics: "compound", demands: [L, L, L, N, N, M, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.inverted_row", { name: "Inverted Row", legacy: true, patterns: ["horizontal_pull", "anti_extension"], primary: ["mid_back", "lats"], secondary: ["biceps", "rear_delts", "abdominals"], actions: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], equipment: "bodyweight", apparatus: ["squat_rack"], positions: ["supine"], mechanics: "compound", demands: [L, M, M, N, N, M, L], loading: L, suits: [L, M, N], progression: ["reps", "leverage", "tempo"], ordering: "flexible" }),

  // --- Vertical pull ---------------------------------------------------------
  ex("exercise.pull_up", { name: "Pull-Up", legacy: true, aliases: ["Pull Up"], patterns: ["vertical_pull"], primary: ["lats"], secondary: ["biceps", "mid_back", "forearms", "abdominals"], actions: ["shoulder_adduction", "shoulder_extension", "elbow_flexion"], equipment: "bodyweight", apparatus: ["pull_up_bar"], positions: ["hanging", "overhead"], mechanics: "compound", demands: [M, M, M, N, N, H, M], loading: M, suits: [M, H, N], progression: ["reps", "load", "tempo"], ordering: "flexible" }),
  ex("exercise.chin_up", { name: "Chin-Up", patterns: ["vertical_pull"], primary: ["lats", "biceps"], secondary: ["mid_back", "forearms"], actions: ["shoulder_extension", "elbow_flexion"], equipment: "bodyweight", apparatus: ["pull_up_bar"], positions: ["hanging", "overhead"], mechanics: "compound", demands: [M, M, M, N, N, H, M], loading: M, suits: [M, H, N], progression: ["reps", "load", "tempo"], ordering: "flexible" }),
  ex("exercise.lat_pulldown", { name: "Lat Pulldown", legacy: true, aliases: ["Pulldown"], patterns: ["vertical_pull"], primary: ["lats"], secondary: ["biceps", "mid_back"], actions: ["shoulder_adduction", "elbow_flexion"], equipment: "cable", positions: ["seated", "overhead"], mechanics: "compound", demands: [L, L, L, N, N, M, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible" }),
  ex("exercise.assisted_pull_up", { name: "Assisted Pull-Up", legacy: true, aliases: ["Machine-Assisted Pull-Up"], patterns: ["vertical_pull"], primary: ["lats"], secondary: ["biceps", "mid_back"], actions: ["shoulder_adduction", "elbow_flexion"], equipment: "machine", positions: ["kneeling", "overhead"], mechanics: "compound", demands: [L, L, L, N, N, M, L], loading: M, suits: [L, M, N], progression: ["reduced_assistance", "reps"], ordering: "flexible", harder: ["exercise.pull_up"] }),
  ex("exercise.band_assisted_pull_up", { name: "Band-Assisted Pull-Up", legacy: true, patterns: ["vertical_pull"], primary: ["lats"], secondary: ["biceps", "mid_back"], actions: ["shoulder_adduction", "elbow_flexion"], equipment: "bands", apparatus: ["pull_up_bar"], positions: ["hanging", "overhead"], mechanics: "compound", demands: [M, M, M, N, N, H, L], loading: L, suits: [L, M, N], progression: ["reduced_assistance", "reps"], ordering: "flexible", harder: ["exercise.pull_up"] }),

  // --- Arms ------------------------------------------------------------------
  ex("exercise.dumbbell_bicep_curl", { name: "Dumbbell Bicep Curl", legacy: true, aliases: ["Dumbbell Curl", "Biceps Curl"], patterns: ["elbow_flexion"], primary: ["biceps"], secondary: ["forearms"], actions: ["elbow_flexion"], equipment: "dumbbell", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.hammer_curl", { name: "Hammer Curl", patterns: ["elbow_flexion"], primary: ["biceps", "forearms"], actions: ["elbow_flexion"], equipment: "dumbbell", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, M, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.cable_curl", { name: "Cable Curl", patterns: ["elbow_flexion"], primary: ["biceps"], secondary: ["forearms"], actions: ["elbow_flexion"], equipment: "cable", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.cable_triceps_pushdown", { name: "Cable Triceps Pushdown", legacy: true, aliases: ["Triceps Pushdown", "Rope Pushdown"], patterns: ["elbow_extension"], primary: ["triceps"], actions: ["elbow_extension"], equipment: "cable", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.overhead_cable_triceps_extension", { name: "Overhead Cable Triceps Extension", aliases: ["Overhead Triceps Extension"], patterns: ["elbow_extension"], primary: ["triceps"], actions: ["elbow_extension"], equipment: "cable", positions: ["standing", "overhead"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.dumbbell_lying_triceps_extension", { name: "Dumbbell Lying Triceps Extension", aliases: ["Dumbbell Skull Crusher"], patterns: ["elbow_extension"], primary: ["triceps"], actions: ["elbow_extension"], equipment: "dumbbell", apparatus: ["bench"], positions: ["supine"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),

  // --- Lower isolation -------------------------------------------------------
  ex("exercise.leg_curl", { name: "Leg Curl", legacy: true, aliases: ["Hamstring Curl"], patterns: ["knee_flexion"], primary: ["hamstrings"], secondary: ["calves"], actions: ["knee_flexion"], equipment: "machine", positions: ["seated", "prone"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.nordic_hamstring_curl", { name: "Nordic Hamstring Curl", aliases: ["Nordic Curl"], patterns: ["knee_flexion"], primary: ["hamstrings"], actions: ["knee_flexion"], equipment: "bodyweight", apparatus: ["ankle_anchor"], positions: ["kneeling"], mechanics: "isolation", demands: [M, L, M, N, N, N, M], loading: M, suits: [L, M, N], progression: ["range_of_motion", "reduced_assistance", "reps"], ordering: "flexible" }),
  ex("exercise.leg_extension", { name: "Leg Extension", legacy: true, patterns: ["knee_extension"], primary: ["quadriceps"], actions: ["knee_extension"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.hip_abduction_machine", { name: "Hip Abduction Machine", aliases: ["Seated Hip Abduction"], patterns: ["hip_abduction"], primary: ["abductors"], secondary: ["glutes"], actions: ["hip_abduction"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.banded_lateral_walk", { name: "Banded Lateral Walk", aliases: ["Lateral Band Walk"], patterns: ["hip_abduction"], primary: ["abductors"], secondary: ["glutes"], actions: ["hip_abduction"], equipment: "bands", positions: ["standing"], laterality: "alternating", mechanics: "isolation", prescription: ["reps", "distance"], demands: [L, M, L, N, N, N, L], loading: L, suits: [N, L, N], progression: ["load", "reps", "distance"], ordering: "flexible" }),
  ex("exercise.hip_adduction_machine", { name: "Hip Adduction Machine", aliases: ["Seated Hip Adduction"], patterns: ["hip_adduction"], primary: ["adductors"], actions: ["hip_adduction"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.copenhagen_plank", { name: "Copenhagen Plank", patterns: ["hip_adduction", "anti_lateral_flexion"], primary: ["adductors", "obliques"], actions: ["hip_adduction"], equipment: "bodyweight", apparatus: ["bench"], positions: ["side_lying"], mechanics: "isolation", contraction: "isometric", prescription: ["time"], demands: [M, M, M, N, N, N, L], loading: L, suits: [L, L, N], progression: ["duration", "leverage"], ordering: "late" }),
  ex("exercise.calf_raise", { name: "Calf Raise", legacy: true, aliases: ["Standing Calf Raise", "Machine Calf Raise"], patterns: ["calf_raise"], primary: ["calves"], actions: ["ankle_plantarflexion"], equipment: "machine", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, M, N, N, L], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.seated_calf_raise", { name: "Seated Calf Raise", patterns: ["calf_raise"], primary: ["calves"], actions: ["ankle_plantarflexion"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.single_leg_calf_raise", { name: "Single-Leg Calf Raise", patterns: ["calf_raise"], primary: ["calves"], actions: ["ankle_plantarflexion"], equipment: "bodyweight", positions: ["single_leg_stance"], laterality: "unilateral", mechanics: "isolation", demands: [L, M, L, N, N, N, L], loading: L, suits: [L, M, N], progression: ["reps", "load", "range_of_motion", "tempo"], ordering: "late" }),

  // --- Trunk -----------------------------------------------------------------
  ex("exercise.plank", { name: "Plank", legacy: true, aliases: ["Front Plank"], patterns: ["anti_extension"], primary: ["abdominals"], secondary: ["obliques"], actions: [], equipment: "bodyweight", positions: ["prone"], mechanics: "isolation", contraction: "isometric", prescription: ["time"], demands: [L, M, M, N, N, N, L], loading: L, suits: [L, L, N], progression: ["duration", "leverage"], ordering: "late" }),
  ex("exercise.dead_bug", { name: "Dead Bug", legacy: true, patterns: ["anti_extension"], primary: ["abdominals"], secondary: ["hip_flexors"], actions: ["hip_flexion", "shoulder_flexion"], equipment: "bodyweight", positions: ["supine"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: L, suits: [N, L, N], progression: ["reps", "tempo", "leverage"], ordering: "late", harder: ["exercise.plank"] }),
  ex("exercise.hanging_knee_raise", { name: "Hanging Knee Raise", legacy: true, patterns: ["trunk_flexion"], primary: ["abdominals", "hip_flexors"], secondary: ["obliques", "forearms"], actions: ["hip_flexion", "spinal_flexion"], equipment: "bodyweight", apparatus: ["pull_up_bar"], positions: ["hanging", "overhead"], mechanics: "isolation", demands: [M, M, M, N, N, H, L], loading: L, suits: [L, M, N], progression: ["reps", "leverage", "tempo"], ordering: "late" }),
  ex("exercise.cable_crunch", { name: "Cable Crunch", patterns: ["trunk_flexion"], primary: ["abdominals"], actions: ["spinal_flexion"], equipment: "cable", positions: ["kneeling"], mechanics: "isolation", demands: [L, L, L, L, N, L, L], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.cable_pallof_press", { name: "Cable Pallof Press", legacy: true, aliases: ["Pallof Press"], patterns: ["anti_rotation"], primary: ["obliques", "abdominals"], actions: [], equipment: "cable", positions: ["standing"], mechanics: "isolation", contraction: "isometric", prescription: ["reps", "time"], demands: [L, M, M, N, N, L, L], loading: L, suits: [L, L, N], progression: ["load", "duration", "reps"], ordering: "late" }),
  ex("exercise.cable_woodchop", { name: "Cable Woodchop", patterns: ["trunk_rotation"], primary: ["obliques"], secondary: ["abdominals"], actions: ["spinal_rotation"], equipment: "cable", positions: ["standing"], laterality: "unilateral", mechanics: "compound", demands: [L, M, M, L, N, L, L], loading: L, suits: [L, L, L], progression: ["load", "reps", "tempo"], ordering: "late" }),
  ex("exercise.side_plank", { name: "Side Plank", patterns: ["anti_lateral_flexion"], primary: ["obliques"], secondary: ["abdominals", "abductors"], actions: [], equipment: "bodyweight", positions: ["side_lying"], laterality: "unilateral", mechanics: "isolation", contraction: "isometric", prescription: ["time"], demands: [L, M, M, N, N, N, L], loading: L, suits: [L, L, N], progression: ["duration", "leverage"], ordering: "late", harder: ["exercise.copenhagen_plank"] }),

  // --- Carries ---------------------------------------------------------------
  ex("exercise.farmer_s_carry", { name: "Farmer's Carry", legacy: true, aliases: ["Farmer's Walk"], patterns: ["carry"], primary: ["forearms", "upper_traps"], secondary: ["abdominals", "obliques", "glutes", "quadriceps"], actions: ["scapular_elevation"], equipment: "dumbbell", positions: ["standing"], mechanics: "compound", prescription: ["distance", "time"], demands: [L, M, H, M, L, H, M], loading: H, suits: [M, L, N], progression: ["load", "distance", "duration"], ordering: "late" }),
  ex("exercise.kettlebell_suitcase_carry", { name: "Kettlebell Suitcase Carry", legacy: true, aliases: ["Suitcase Carry"], patterns: ["carry", "anti_lateral_flexion"], primary: ["obliques", "forearms"], secondary: ["abdominals", "upper_traps"], actions: ["scapular_elevation"], equipment: "kettlebell", positions: ["standing"], laterality: "unilateral", mechanics: "compound", prescription: ["distance", "time"], demands: [L, M, H, M, L, H, M], loading: M, suits: [L, L, N], progression: ["load", "distance", "duration"], ordering: "late" }),

  // --- Power -----------------------------------------------------------------
  ex("exercise.box_jump", { name: "Box Jump", patterns: ["jump"], primary: ["quadriceps", "glutes"], secondary: ["calves", "hamstrings"], actions: ["knee_extension", "hip_extension", "ankle_plantarflexion"], equipment: "bodyweight", apparatus: ["box"], positions: ["standing"], mechanics: "compound", demands: [M, M, L, L, H, N, M], loading: L, suits: [L, L, H], progression: ["range_of_motion", "reps"], ordering: "early" }),
];
