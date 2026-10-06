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
import type { ApparatusId, BodyPosition, EquipmentId, ExerciseRole, JointActionId, Level, MovementPatternId, MuscleId, ProgressionMode, TrunkSupport } from "../taxonomy.ts";
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
  /** V2 (all optional; derived when absent — see v2Defaults). */
  role?: ExerciseRole;
  emphasis?: MuscleId[];
  trunk?: TrunkSupport;
  path?: ExerciseEntry["path"];
  setup?: Array<[label: string, changes: string]>;
  specificity?: Array<[exerciseId: string, level: Level]>;
}

const evidence: Evidence = { status: "internal_curation", sources: [{ sourceId: SOURCES.internalTaxonomy.id }], reviewedByQualifiedExpert: false };
const legacyEvidence: Evidence = { status: "internal_curation", sources: [{ sourceId: SOURCES.internalLibrary.id }, { sourceId: SOURCES.internalTaxonomy.id }], reviewedByQualifiedExpert: false };

function ex(id: string, spec: Spec): ExerciseEntry {
  const s: Spec = { ...spec, ...(V2_METADATA[id] ?? {}) };
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
    loadedDemands: loadedDemands(s),
    trunkSupport: trunkSupport(s),
    role: s.role ?? defaultRole(s),
    emphasis: s.emphasis ?? s.primary,
    ...(s.path ? { path: s.path } : {}),
    setupVariations: (s.setup ?? []).map(([label, changes]) => ({ label, changes })),
    specificity: (s.specificity ?? []).map(([exerciseId, level]) => ({ exerciseId, level })),
  };
}

const TRUNK_PATTERNS = new Set<MovementPatternId>(["anti_extension", "anti_rotation", "anti_lateral_flexion", "trunk_flexion", "trunk_rotation"]);
/** V2 — the usual training role, from metadata (overridable per exercise). */
function defaultRole(s: Spec): ExerciseRole {
  if (s.patterns.includes("carry")) return "carry";
  if (s.patterns.some((p) => p === "jump" || p === "ballistic")) return "power";
  if (TRUNK_PATTERNS.has(s.patterns[0])) return "trunk";
  if (s.mechanics === "isolation") return "isolation";
  return s.ordering === "early" && s.suits[0] === H ? "main_lift" : "compound_accessory";
}

/** Gate 4.0C-3C / V2 — explicit when curated (s.trunk); otherwise: external = chest pad (prone machine); partial =
 * seated machine (back pad) or lying on a bench; else none. A thigh/knee pad that only anchors the pelvis is
 * "thigh_anchored" and must be curated explicitly — it is never treated as trunk support. */
function trunkSupport(s: Spec): ExerciseEntry["trunkSupport"] {
  if (s.trunk) return s.trunk;
  if (s.positions.includes("prone") && s.equipment === "machine") return "external";
  if ((s.equipment === "machine" && s.positions.includes("seated")) || (s.positions.includes("supine") && (s.apparatus ?? []).includes("bench"))) return "partial";
  return "none";
}

/**
 * Gate 4.0C-3B — load-sensitive bracing (internal curation, pending
 * qualified review). Taking a compound lift with meaningful loading
 * potential heavy or close to failure requires at least moderate trunk
 * bracing, even when its typical submaximal demand is low — unless the
 * trunk is externally supported by a chest pad (prone). Isolation work and
 * low-loading compounds keep their base level. A general rule over
 * metadata, never a per-exercise exception.
 */
function loadedDemands(s: Spec): ExerciseEntry["loadedDemands"] {
  const bracing = s.demands[2];
  // V2: "unless the trunk is carried by a chest pad" — prone, or a curated chest-supported (external) setup.
  const rises = s.mechanics === "compound" && (s.loading === M || s.loading === H) && !s.positions.includes("prone") && trunkSupport(s) !== "external" && (bracing === N || bracing === L);
  return rises ? { bracing: M } : {};
}

const LOAD: ProgressionMode[] = ["load", "reps", "sets", "tempo"];
const ACCESSORY: ProgressionMode[] = ["load", "reps", "sets", "tempo", "range_of_motion"];

/**
 * V2 — curated additions for exercises that existed in V1 (ids and V1 fields unchanged). Internal curation using
 * conventional exercise anatomy, pending qualified review; no compatibility is claimed here — fit is always
 * computed from metadata against a client's confirmed restrictions (exercise-eligibility.ts).
 */
const V2_METADATA: Record<string, Partial<Spec>> = {
  // Pulling: what each pull actually emphasises, and what supports the trunk.
  "exercise.lat_pulldown": { trunk: "thigh_anchored", emphasis: ["lats"], path: { grip: "pronated", plane: "vertical", elbows: "flared" }, setup: [["Close neutral grip", "longer range, more lat emphasis"], ["Wide pronated grip", "more upper-back and teres involvement"], ["Thigh pad snug", "anchors the pelvis only — the trunk still stabilizes itself"]] },
  "exercise.assisted_pull_up": { trunk: "thigh_anchored", emphasis: ["lats"], path: { plane: "vertical" } },
  "exercise.pull_up": { emphasis: ["lats"], path: { grip: "pronated", plane: "vertical" } },
  "exercise.chin_up": { emphasis: ["lats", "biceps"], path: { grip: "supinated", plane: "vertical", elbows: "tucked" } },
  "exercise.band_assisted_pull_up": { emphasis: ["lats"], path: { plane: "vertical" } },
  "exercise.chest_supported_row": { emphasis: ["mid_back", "lats"], path: { plane: "horizontal" }, setup: [["Elbows tucked, pull toward the hip", "shifts emphasis to the lats"], ["Elbows flared, pull toward the chest", "upper back and rear delts"]] },
  "exercise.seated_cable_row": { emphasis: ["lats", "mid_back"], path: { grip: "neutral", plane: "low_row", elbows: "tucked" }, setup: [["Torso kept still", "less low-back and trunk demand than rocking"]] },
  "exercise.dumbbell_row": { emphasis: ["lats"], path: { plane: "low_row", elbows: "tucked" }, setup: [["Knee and hand on the bench", "partly supports the torso — the trunk still stabilizes the load"]] },
  "exercise.barbell_row": { emphasis: ["mid_back", "lats"], path: { grip: "pronated", plane: "horizontal" } },
  "exercise.inverted_row": { emphasis: ["mid_back"], path: { plane: "horizontal" } },
  "exercise.face_pull": { emphasis: ["rear_delts"], path: { grip: "rope", elbows: "flared" } },
  "exercise.reverse_dumbbell_fly": { emphasis: ["rear_delts"] },
  // Pressing: strength transfer to the main lifts.
  "exercise.dumbbell_bench_press": { specificity: [["exercise.barbell_bench_press", M]] },
  "exercise.incline_dumbbell_press": { emphasis: ["chest", "front_delts"], path: { plane: "incline" }, specificity: [["exercise.barbell_bench_press", L]] },
  "exercise.machine_chest_press": { specificity: [["exercise.barbell_bench_press", L]] },
  "exercise.push_up": { specificity: [["exercise.barbell_bench_press", L]] },
  "exercise.dumbbell_shoulder_press": { specificity: [["exercise.overhead_press", M]] },
  "exercise.machine_shoulder_press": { specificity: [["exercise.overhead_press", L]] },
  // Lower body: transfer and emphasis.
  "exercise.front_squat": { specificity: [["exercise.barbell_back_squat", M]] },
  "exercise.hack_squat": { specificity: [["exercise.barbell_back_squat", L]] },
  "exercise.leg_press": { specificity: [["exercise.barbell_back_squat", L]] },
  "exercise.goblet_squat": { specificity: [["exercise.barbell_back_squat", L]] },
  "exercise.romanian_deadlift": { specificity: [["exercise.conventional_deadlift", M]] },
  "exercise.trap_bar_deadlift": { specificity: [["exercise.conventional_deadlift", M]] },
  "exercise.hip_thrust": { emphasis: ["glutes"] },
};

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

  // ===========================================================================
  // Fitness Knowledge V2 additions. Each is a distinct exercise only where it materially changes the stimulus,
  // equipment, setup, trunk support / stability, constraint fit or use case (not a grip/name variant).
  // ===========================================================================

  // --- V2: supported and lat-focused pulling ---------------------------------
  ex("exercise.incline_dumbbell_row", { name: "Incline Chest-Supported Dumbbell Row", aliases: ["Incline Bench Dumbbell Row", "Chest-Supported Dumbbell Row"], patterns: ["horizontal_pull"], primary: ["mid_back", "lats"], secondary: ["rear_delts", "biceps"], actions: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], equipment: "dumbbell", apparatus: ["bench"], positions: ["prone"], mechanics: "compound", demands: [L, L, L, N, N, M, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", trunk: "external", emphasis: ["mid_back", "lats"], path: { plane: "horizontal" }, setup: [["Elbows tucked, row toward the hips", "lat emphasis"], ["Elbows flared", "upper back and rear delts"], ["One arm at a time", "unilateral, longer range"]] }),
  ex("exercise.machine_low_row", { name: "Chest-Supported Machine Low Row", aliases: ["Iso-Lateral Low Row"], patterns: ["horizontal_pull"], primary: ["lats", "mid_back"], secondary: ["biceps", "rear_delts"], actions: ["shoulder_extension", "elbow_flexion", "scapular_retraction"], equipment: "machine", positions: ["seated"], mechanics: "compound", demands: [L, L, L, N, N, M, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible", trunk: "external", emphasis: ["lats"], path: { grip: "neutral", plane: "low_row", elbows: "tucked" }, setup: [["Chest kept on the pad", "the pad carries the trunk"], ["One arm at a time", "unilateral, independent sides"]] }),
  ex("exercise.machine_high_row", { name: "Chest-Supported Machine High Row", aliases: ["Iso-Lateral High Row"], patterns: ["vertical_pull", "horizontal_pull"], primary: ["lats", "mid_back"], secondary: ["rear_delts", "biceps"], actions: ["shoulder_extension", "shoulder_adduction", "elbow_flexion"], equipment: "machine", positions: ["seated", "overhead"], mechanics: "compound", demands: [L, L, L, N, N, M, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible", trunk: "external", emphasis: ["lats", "mid_back"], path: { plane: "high_row" }, setup: [["Chest kept on the pad", "the pad carries the trunk"], ["Pull down and back toward the hips", "more lat emphasis"]] }),
  ex("exercise.machine_pulldown", { name: "Machine Pulldown", aliases: ["Plate-Loaded Pulldown", "Iso-Lateral Pulldown"], patterns: ["vertical_pull"], primary: ["lats"], secondary: ["biceps", "mid_back"], actions: ["shoulder_adduction", "shoulder_extension", "elbow_flexion"], equipment: "machine", positions: ["seated", "overhead"], mechanics: "compound", demands: [L, L, L, N, N, M, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible", trunk: "thigh_anchored", emphasis: ["lats"], path: { plane: "vertical" }, setup: [["Thigh pad snug", "anchors the pelvis only — the trunk still stabilizes itself"], ["One arm at a time", "unilateral, converging path"]] }),
  ex("exercise.single_arm_cable_pulldown", { name: "Single-Arm Cable Pulldown", aliases: ["Half-Kneeling Single-Arm Pulldown"], patterns: ["vertical_pull"], primary: ["lats"], secondary: ["biceps", "mid_back"], actions: ["shoulder_adduction", "shoulder_extension", "elbow_flexion"], equipment: "cable", positions: ["kneeling", "overhead"], laterality: "unilateral", mechanics: "compound", demands: [L, M, L, N, N, L, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", emphasis: ["lats"], path: { grip: "single_handle", plane: "vertical", elbows: "tucked" }, setup: [["Half-kneeling", "trunk stabilizes against rotation — no external support"], ["Seated at a pulldown station", "thigh pad anchors the pelvis"]] }),
  ex("exercise.straight_arm_cable_pulldown", { name: "Straight-Arm Cable Pulldown", aliases: ["Straight-Arm Lat Pulldown", "Cable Pullover"], patterns: ["shoulder_extension"], primary: ["lats"], secondary: ["triceps", "rear_delts"], actions: ["shoulder_extension"], equipment: "cable", positions: ["standing", "overhead"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late", emphasis: ["lats"], path: { plane: "straight_arm", elbows: "straight" }, setup: [["Rope or straight bar", "rope allows a longer finish at the hips"], ["Slight hip hinge, ribs down", "keeps the work in the lats"]] }),
  ex("exercise.machine_pullover", { name: "Machine Pullover", patterns: ["shoulder_extension"], primary: ["lats"], secondary: ["chest", "triceps"], actions: ["shoulder_extension"], equipment: "machine", positions: ["seated", "overhead"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", emphasis: ["lats"], path: { plane: "straight_arm" }, setup: [["Seat belt fastened, back on the pad", "back pad supports the trunk"]] }),
  ex("exercise.dumbbell_pullover", { name: "Dumbbell Pullover", patterns: ["shoulder_extension"], primary: ["lats", "chest"], secondary: ["triceps"], actions: ["shoulder_extension"], equipment: "dumbbell", apparatus: ["bench"], positions: ["supine", "overhead"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, M, N], progression: ACCESSORY, ordering: "late", emphasis: ["lats", "chest"], path: { plane: "straight_arm" }, setup: [["Ribs kept down through the stretch", "keeps the trunk out of the movement"]] }),
  ex("exercise.single_arm_seated_cable_row", { name: "Single-Arm Seated Cable Row", aliases: ["One-Arm Cable Row"], patterns: ["horizontal_pull"], primary: ["lats", "mid_back"], secondary: ["biceps", "rear_delts"], actions: ["shoulder_extension", "elbow_flexion", "scapular_retraction"], equipment: "cable", positions: ["seated"], laterality: "unilateral", mechanics: "compound", demands: [L, M, L, L, N, L, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", emphasis: ["lats"], path: { grip: "single_handle", plane: "low_row", elbows: "tucked" } }),
  ex("exercise.wide_grip_seated_cable_row", { name: "Wide-Grip Seated Cable Row", patterns: ["horizontal_pull"], primary: ["mid_back", "rear_delts"], secondary: ["lats", "biceps"], actions: ["shoulder_horizontal_abduction", "scapular_retraction", "elbow_flexion"], equipment: "cable", positions: ["seated"], mechanics: "compound", demands: [L, L, L, L, N, M, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", emphasis: ["mid_back", "rear_delts"], path: { grip: "pronated", plane: "horizontal", elbows: "flared" } }),
  ex("exercise.band_seated_row", { name: "Band Seated Row", patterns: ["horizontal_pull"], primary: ["mid_back", "lats"], secondary: ["biceps", "rear_delts"], actions: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], equipment: "bands", positions: ["seated"], mechanics: "compound", demands: [L, L, L, N, N, L, L], loading: L, suits: [N, M, N], progression: ["load", "reps", "tempo"], ordering: "flexible", emphasis: ["mid_back", "lats"], path: { plane: "horizontal" } }),
  ex("exercise.band_lat_pulldown", { name: "Band Lat Pulldown", aliases: ["Kneeling Band Pulldown"], patterns: ["vertical_pull"], primary: ["lats"], secondary: ["biceps", "mid_back"], actions: ["shoulder_adduction", "shoulder_extension", "elbow_flexion"], equipment: "bands", positions: ["kneeling", "overhead"], mechanics: "compound", demands: [L, L, L, N, N, L, L], loading: L, suits: [N, M, N], progression: ["load", "reps", "tempo"], ordering: "flexible", emphasis: ["lats"], path: { plane: "vertical" }, setup: [["Band anchored high", "needs a secure high anchor point"]] }),
  ex("exercise.reverse_pec_deck", { name: "Reverse Pec Deck", aliases: ["Rear Delt Machine Fly"], patterns: ["shoulder_isolation"], primary: ["rear_delts"], secondary: ["mid_back"], actions: ["shoulder_horizontal_abduction", "scapular_retraction"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late", trunk: "external", emphasis: ["rear_delts"], path: { elbows: "flared" } }),
  ex("exercise.dumbbell_shrug", { name: "Dumbbell Shrug", aliases: ["Shrug"], patterns: ["shrug"], primary: ["upper_traps"], secondary: ["forearms"], actions: ["scapular_elevation"], equipment: "dumbbell", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, M, N, H, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),

  // --- V2: supported pressing and pressing accessories ------------------------
  ex("exercise.incline_machine_press", { name: "Incline Machine Press", patterns: ["horizontal_push"], primary: ["chest", "front_delts"], secondary: ["triceps"], actions: ["shoulder_horizontal_adduction", "shoulder_flexion", "elbow_extension"], equipment: "machine", positions: ["seated"], mechanics: "compound", demands: [L, L, L, N, N, L, L], loading: M, suits: [M, H, N], progression: ACCESSORY, ordering: "flexible", emphasis: ["chest", "front_delts"], path: { plane: "incline" }, specificity: [["exercise.barbell_bench_press", L]] }),
  ex("exercise.pec_deck", { name: "Pec Deck", aliases: ["Machine Chest Fly", "Machine Fly"], patterns: ["shoulder_isolation"], primary: ["chest"], secondary: ["front_delts"], actions: ["shoulder_horizontal_adduction"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.dumbbell_fly", { name: "Dumbbell Fly", aliases: ["Dumbbell Chest Fly"], patterns: ["shoulder_isolation"], primary: ["chest"], secondary: ["front_delts"], actions: ["shoulder_horizontal_adduction"], equipment: "dumbbell", apparatus: ["bench"], positions: ["supine"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.smith_machine_bench_press", { name: "Smith Machine Bench Press", patterns: ["horizontal_push"], primary: ["chest", "triceps", "front_delts"], actions: ["shoulder_horizontal_adduction", "elbow_extension"], equipment: "machine", apparatus: ["bench"], positions: ["supine"], mechanics: "compound", demands: [L, L, L, L, N, L, M], loading: H, suits: [M, H, N], progression: LOAD, ordering: "flexible", specificity: [["exercise.barbell_bench_press", M]], setup: [["Fixed bar path", "less stabilization than a free barbell"]] }),
  ex("exercise.close_grip_bench_press", { name: "Close-Grip Bench Press", patterns: ["horizontal_push"], primary: ["triceps", "chest", "front_delts"], actions: ["elbow_extension", "shoulder_horizontal_adduction"], equipment: "barbell", apparatus: ["bench", "squat_rack"], positions: ["supine"], mechanics: "compound", demands: [M, M, M, L, N, L, M], loading: H, suits: [H, H, N], progression: LOAD, ordering: "flexible", role: "compound_accessory", emphasis: ["triceps", "chest"], path: { elbows: "tucked" }, specificity: [["exercise.barbell_bench_press", H]] }),
  ex("exercise.dumbbell_floor_press", { name: "Dumbbell Floor Press", patterns: ["horizontal_push"], primary: ["chest", "triceps"], secondary: ["front_delts"], actions: ["shoulder_horizontal_adduction", "elbow_extension"], equipment: "dumbbell", positions: ["supine"], mechanics: "compound", demands: [L, M, L, N, N, M, L], loading: M, suits: [M, M, N], progression: ACCESSORY, ordering: "flexible", emphasis: ["triceps", "chest"], specificity: [["exercise.barbell_bench_press", L]], setup: [["Upper arms stop on the floor", "shorter range, no bench needed"]] }),
  ex("exercise.parallel_bar_dip", { name: "Parallel Bar Dip", aliases: ["Dip", "Chest Dip"], patterns: ["vertical_push", "horizontal_push"], primary: ["chest", "triceps"], secondary: ["front_delts"], actions: ["shoulder_extension", "elbow_extension"], equipment: "bodyweight", apparatus: ["dip_station"], positions: ["hanging"], mechanics: "compound", demands: [M, M, M, N, N, M, M], loading: M, suits: [M, H, N], progression: ["reps", "load", "tempo"], ordering: "flexible", emphasis: ["chest", "triceps"] }),
  ex("exercise.machine_dip", { name: "Seated Dip Machine", aliases: ["Machine Dip"], patterns: ["vertical_push"], primary: ["triceps", "chest"], secondary: ["front_delts"], actions: ["elbow_extension", "shoulder_extension"], equipment: "machine", positions: ["seated"], mechanics: "compound", demands: [L, L, L, N, N, L, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", emphasis: ["triceps"] }),
  ex("exercise.landmine_press", { name: "Half-Kneeling Landmine Press", aliases: ["Landmine Press"], patterns: ["vertical_push"], primary: ["front_delts", "chest"], secondary: ["triceps", "obliques"], actions: ["shoulder_flexion", "elbow_extension"], equipment: "barbell", positions: ["kneeling"], laterality: "unilateral", mechanics: "compound", demands: [M, M, M, L, N, L, L], loading: M, suits: [M, M, N], progression: ACCESSORY, ordering: "flexible", path: { plane: "incline" }, setup: [["Angled pressing path", "the arm finishes in front of the head rather than overhead"]] }),
  ex("exercise.machine_lateral_raise", { name: "Machine Lateral Raise", patterns: ["shoulder_isolation"], primary: ["side_delts"], actions: ["shoulder_abduction"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, N, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),

  // --- V2: lower-body machine and isolation options --------------------------
  ex("exercise.belt_squat", { name: "Belt Squat", patterns: ["squat"], primary: ["quadriceps", "glutes"], secondary: ["adductors"], actions: ["knee_extension", "hip_extension"], equipment: "machine", positions: ["standing"], mechanics: "compound", demands: [L, L, L, L, N, N, M], loading: H, suits: [M, H, N], progression: LOAD, ordering: "flexible", setup: [["Load hangs from the hips", "little spinal loading compared with a barbell squat"]], specificity: [["exercise.barbell_back_squat", L]] }),
  ex("exercise.hip_thrust_machine", { name: "Hip Thrust Machine", aliases: ["Machine Glute Bridge"], patterns: ["hip_thrust"], primary: ["glutes"], secondary: ["hamstrings"], actions: ["hip_extension"], equipment: "machine", positions: ["seated", "supine"], mechanics: "compound", demands: [L, L, L, N, N, N, L], loading: H, suits: [L, H, N], progression: ACCESSORY, ordering: "flexible", trunk: "partial", emphasis: ["glutes"] }),
  ex("exercise.glute_kickback_machine", { name: "Glute Kickback Machine", aliases: ["Machine Glute Kickback"], patterns: ["hip_extension_isolation"], primary: ["glutes"], secondary: ["hamstrings"], actions: ["hip_extension"], equipment: "machine", positions: ["standing", "prone"], laterality: "unilateral", mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: M, suits: [L, H, N], progression: ACCESSORY, ordering: "late", trunk: "partial", emphasis: ["glutes"], setup: [["Torso on the chest/forearm pad", "pad supports the trunk"]] }),
  ex("exercise.cable_glute_kickback", { name: "Cable Glute Kickback", aliases: ["Glute Kickback"], patterns: ["hip_extension_isolation"], primary: ["glutes"], secondary: ["hamstrings"], actions: ["hip_extension"], equipment: "cable", apparatus: ["ankle_anchor"], positions: ["standing"], laterality: "unilateral", mechanics: "isolation", demands: [L, M, L, N, N, L, L], loading: L, suits: [N, M, N], progression: ACCESSORY, ordering: "late", emphasis: ["glutes"] }),

  // --- V2: arm accessories ---------------------------------------------------
  ex("exercise.machine_preacher_curl", { name: "Machine Preacher Curl", aliases: ["Preacher Curl"], patterns: ["elbow_flexion"], primary: ["biceps"], actions: ["elbow_flexion"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late", setup: [["Upper arm on the pad", "removes body English"]] }),
  ex("exercise.incline_dumbbell_curl", { name: "Incline Dumbbell Curl", patterns: ["elbow_flexion"], primary: ["biceps"], actions: ["elbow_flexion"], equipment: "dumbbell", apparatus: ["bench"], positions: ["supine"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late", setup: [["Arms hang behind the torso", "biceps trained at long length"]] }),
  ex("exercise.barbell_curl", { name: "Barbell Curl", aliases: ["EZ-Bar Curl"], patterns: ["elbow_flexion"], primary: ["biceps"], secondary: ["forearms"], actions: ["elbow_flexion"], equipment: "barbell", positions: ["standing"], mechanics: "isolation", demands: [L, L, L, L, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.dumbbell_overhead_triceps_extension", { name: "Dumbbell Overhead Triceps Extension", aliases: ["Seated Dumbbell Overhead Extension"], patterns: ["elbow_extension"], primary: ["triceps"], actions: ["elbow_extension"], equipment: "dumbbell", positions: ["seated", "overhead"], mechanics: "isolation", demands: [L, L, L, L, N, L, L], loading: L, suits: [L, H, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.bench_dip", { name: "Bench Dip", patterns: ["elbow_extension"], primary: ["triceps"], secondary: ["chest", "front_delts"], actions: ["elbow_extension", "shoulder_extension"], equipment: "bodyweight", apparatus: ["bench"], positions: ["seated"], mechanics: "isolation", demands: [L, L, L, N, N, L, L], loading: L, suits: [N, M, N], progression: ["reps", "load", "leverage"], ordering: "late" }),

  // --- V2: trunk -------------------------------------------------------------
  ex("exercise.machine_crunch", { name: "Machine Crunch", aliases: ["Ab Crunch Machine"], patterns: ["trunk_flexion"], primary: ["abdominals"], actions: ["spinal_flexion"], equipment: "machine", positions: ["seated"], mechanics: "isolation", demands: [L, L, L, L, N, L, L], loading: M, suits: [L, M, N], progression: ACCESSORY, ordering: "late" }),
  ex("exercise.ab_wheel_rollout", { name: "Ab Wheel Rollout", aliases: ["Rollout"], patterns: ["anti_extension"], primary: ["abdominals"], secondary: ["lats", "obliques"], actions: ["shoulder_flexion"], equipment: "bodyweight", positions: ["kneeling"], mechanics: "isolation", demands: [M, M, H, L, N, L, M], loading: L, suits: [L, M, N], progression: ["range_of_motion", "leverage", "reps"], ordering: "late" }),
];
