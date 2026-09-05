// Phase 5.4A — a real, curated exercise library for the deterministic
// activation-generation engine (see activation-generation.ts) to compose
// programs from. Not exhaustive, but genuinely varied across every
// movement pattern and equipment category a coach can select in Chapter 2
// of coach onboarding (see coach-onboarding-questions.ts's
// program_movement_priorities/program_equipment options) — real exercise
// names a coach would recognize, never placeholder text.
//
// Every entry can be filtered by equipment (so a home-gym/limited-equipment
// client never gets a barbell exercise) and by movement pattern (so a
// generated program can be built to the coach's own
// movementPatternPriorities). `substituteGroup` lets the generator swap one
// exercise for another of the same pattern/group when equipment is
// unavailable — exactly the real mechanism
// lib/types.ts's Exercise.approvedSubstituteExerciseId models for a single
// coach-authored program, generalized here to picking among a real set at
// generation time rather than a single coach-picked id.

export type MovementPattern = "squat" | "hinge" | "push_horizontal" | "push_vertical" | "pull_horizontal" | "pull_vertical" | "lunge" | "core" | "isolation" | "carry";

export type EquipmentTag = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "bands" | "kettlebell";

export interface LibraryExercise {
  name: string;
  pattern: MovementPattern;
  equipment: EquipmentTag;
  /** Exercises sharing a substituteGroup are interchangeable for equipment
   * or preference reasons without changing the program's intent. */
  substituteGroup: string;
  /** True for a genuinely compound, fatigue-heavy lift — used to decide
   * exercise order (compound_first philosophy) and warm-up ramp length. */
  isCompound: boolean;
  /** A short, real coaching cue — never empty, since
   * lib/coach/training.ts's isExerciseUsable-adjacent client experience
   * expects a real cue string on every catalog exercise (see
   * lib/mock-data.ts's own hand-authored exercises for the convention this
   * follows). */
  cue: string;
}

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  // Squat pattern
  { name: "Barbell Back Squat", pattern: "squat", equipment: "barbell", substituteGroup: "squat_primary", isCompound: true, cue: "Brace before you break at the hips and knees together." },
  { name: "Front Squat", pattern: "squat", equipment: "barbell", substituteGroup: "squat_primary", isCompound: true, cue: "Elbows high, keep the bar resting on your shoulders." },
  { name: "Goblet Squat", pattern: "squat", equipment: "dumbbell", substituteGroup: "squat_primary", isCompound: true, cue: "Hold the weight close to your chest through the whole rep." },
  { name: "Leg Press", pattern: "squat", equipment: "machine", substituteGroup: "squat_primary", isCompound: true, cue: "Full range without your lower back rounding off the pad." },
  { name: "Bodyweight Squat", pattern: "squat", equipment: "bodyweight", substituteGroup: "squat_primary", isCompound: true, cue: "Sit back and down, chest tall." },
  { name: "Bulgarian Split Squat", pattern: "lunge", equipment: "dumbbell", substituteGroup: "lunge_primary", isCompound: true, cue: "Front shin stays close to vertical." },
  { name: "Walking Lunge", pattern: "lunge", equipment: "dumbbell", substituteGroup: "lunge_primary", isCompound: true, cue: "Step out far enough that the front knee tracks over the ankle." },
  { name: "Reverse Lunge", pattern: "lunge", equipment: "bodyweight", substituteGroup: "lunge_primary", isCompound: true, cue: "Control the step back, don't let the knee slam down." },

  // Hinge pattern
  { name: "Conventional Deadlift", pattern: "hinge", equipment: "barbell", substituteGroup: "hinge_primary", isCompound: true, cue: "Push the floor away, keep the bar close to your shins." },
  { name: "Romanian Deadlift", pattern: "hinge", equipment: "barbell", substituteGroup: "hinge_hip", isCompound: true, cue: "Push the hips back, feel a stretch in the hamstrings." },
  { name: "Dumbbell Romanian Deadlift", pattern: "hinge", equipment: "dumbbell", substituteGroup: "hinge_hip", isCompound: true, cue: "Soft knees, hinge from the hips, not the low back." },
  { name: "Hip Thrust", pattern: "hinge", equipment: "barbell", substituteGroup: "hinge_hip", isCompound: true, cue: "Drive through the heels and squeeze the glutes at the top." },
  { name: "Kettlebell Swing", pattern: "hinge", equipment: "kettlebell", substituteGroup: "hinge_hip", isCompound: true, cue: "Snap the hips forward — this is a hip hinge, not a squat." },
  { name: "Back Extension", pattern: "hinge", equipment: "bodyweight", substituteGroup: "hinge_hip", isCompound: false, cue: "Control the descent, don't hyperextend at the top." },

  // Horizontal push
  { name: "Barbell Bench Press", pattern: "push_horizontal", equipment: "barbell", substituteGroup: "push_h_primary", isCompound: true, cue: "Shoulder blades pinched, bar path stays consistent." },
  { name: "Dumbbell Bench Press", pattern: "push_horizontal", equipment: "dumbbell", substituteGroup: "push_h_primary", isCompound: true, cue: "Control the dumbbells down evenly on both sides." },
  { name: "Push-Up", pattern: "push_horizontal", equipment: "bodyweight", substituteGroup: "push_h_primary", isCompound: true, cue: "Keep a straight line from shoulders to ankles." },
  { name: "Machine Chest Press", pattern: "push_horizontal", equipment: "machine", substituteGroup: "push_h_primary", isCompound: true, cue: "Press through a full range without shrugging the shoulders." },
  { name: "Cable Chest Fly", pattern: "push_horizontal", equipment: "cable", substituteGroup: "push_h_isolation", isCompound: false, cue: "Slight bend in the elbows, squeeze at the midline." },

  // Vertical push
  { name: "Overhead Press", pattern: "push_vertical", equipment: "barbell", substituteGroup: "push_v_primary", isCompound: true, cue: "Brace hard, press in a straight line over the head." },
  { name: "Dumbbell Shoulder Press", pattern: "push_vertical", equipment: "dumbbell", substituteGroup: "push_v_primary", isCompound: true, cue: "Press up and slightly in, without arching the low back." },
  { name: "Machine Shoulder Press", pattern: "push_vertical", equipment: "machine", substituteGroup: "push_v_primary", isCompound: true, cue: "Keep the movement smooth and controlled." },
  { name: "Pike Push-Up", pattern: "push_vertical", equipment: "bodyweight", substituteGroup: "push_v_primary", isCompound: true, cue: "Hips high, lower the head toward the floor." },
  { name: "Lateral Raise", pattern: "push_vertical", equipment: "dumbbell", substituteGroup: "push_v_isolation", isCompound: false, cue: "Lead with the elbows, stop around shoulder height." },

  // Horizontal pull
  { name: "Barbell Row", pattern: "pull_horizontal", equipment: "barbell", substituteGroup: "pull_h_primary", isCompound: true, cue: "Pull to the lower ribs, keep the torso angle steady." },
  { name: "Dumbbell Row", pattern: "pull_horizontal", equipment: "dumbbell", substituteGroup: "pull_h_primary", isCompound: true, cue: "Drive the elbow back, avoid rotating the torso." },
  { name: "Seated Cable Row", pattern: "pull_horizontal", equipment: "cable", substituteGroup: "pull_h_primary", isCompound: true, cue: "Chest up, pull to the torso without leaning back excessively." },
  { name: "Chest-Supported Row", pattern: "pull_horizontal", equipment: "machine", substituteGroup: "pull_h_primary", isCompound: true, cue: "Let the chest pad take the load off the low back." },
  { name: "Inverted Row", pattern: "pull_horizontal", equipment: "bodyweight", substituteGroup: "pull_h_primary", isCompound: true, cue: "Keep the body rigid, pull the chest to the bar." },

  // Vertical pull
  { name: "Pull-Up", pattern: "pull_vertical", equipment: "bodyweight", substituteGroup: "pull_v_primary", isCompound: true, cue: "Full hang at the bottom, chin over the bar at the top." },
  { name: "Lat Pulldown", pattern: "pull_vertical", equipment: "cable", substituteGroup: "pull_v_primary", isCompound: true, cue: "Pull with the lats, not just the arms." },
  { name: "Assisted Pull-Up", pattern: "pull_vertical", equipment: "machine", substituteGroup: "pull_v_primary", isCompound: true, cue: "Use just enough assistance to complete full reps." },
  { name: "Band-Assisted Pull-Up", pattern: "pull_vertical", equipment: "bands", substituteGroup: "pull_v_primary", isCompound: true, cue: "Control the descent instead of dropping." },

  // Isolation / accessory
  { name: "Dumbbell Bicep Curl", pattern: "isolation", equipment: "dumbbell", substituteGroup: "isolation_biceps", isCompound: false, cue: "Keep the elbows pinned, no swinging." },
  { name: "Cable Triceps Pushdown", pattern: "isolation", equipment: "cable", substituteGroup: "isolation_triceps", isCompound: false, cue: "Elbows stay tucked at your sides." },
  { name: "Leg Curl", pattern: "isolation", equipment: "machine", substituteGroup: "isolation_hamstrings", isCompound: false, cue: "Control the negative, don't let the weight stack slam." },
  { name: "Leg Extension", pattern: "isolation", equipment: "machine", substituteGroup: "isolation_quads", isCompound: false, cue: "Pause briefly at the top of each rep." },
  { name: "Calf Raise", pattern: "isolation", equipment: "machine", substituteGroup: "isolation_calves", isCompound: false, cue: "Full stretch at the bottom, pause at the top." },
  { name: "Face Pull", pattern: "isolation", equipment: "cable", substituteGroup: "isolation_rear_delt", isCompound: false, cue: "Pull to the face, rotate the shoulders back at the end." },
  { name: "Band Pull-Apart", pattern: "isolation", equipment: "bands", substituteGroup: "isolation_rear_delt", isCompound: false, cue: "Squeeze the shoulder blades together at the end range." },

  // Core
  { name: "Plank", pattern: "core", equipment: "bodyweight", substituteGroup: "core_anti_extension", isCompound: false, cue: "Squeeze the glutes, don't let the hips sag." },
  { name: "Hanging Knee Raise", pattern: "core", equipment: "bodyweight", substituteGroup: "core_flexion", isCompound: false, cue: "Control the swing, lead with the knees." },
  { name: "Cable Pallof Press", pattern: "core", equipment: "cable", substituteGroup: "core_anti_rotation", isCompound: false, cue: "Resist the pull — don't let the torso rotate." },
  { name: "Dead Bug", pattern: "core", equipment: "bodyweight", substituteGroup: "core_anti_extension", isCompound: false, cue: "Keep the low back flat against the floor." },

  // Carry
  { name: "Farmer's Carry", pattern: "carry", equipment: "dumbbell", substituteGroup: "carry_loaded", isCompound: true, cue: "Tall posture, tight grip, controlled steps." },
  { name: "Kettlebell Suitcase Carry", pattern: "carry", equipment: "kettlebell", substituteGroup: "carry_loaded", isCompound: true, cue: "Resist leaning toward the loaded side." },
];

export function exercisesForPattern(pattern: MovementPattern): LibraryExercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.pattern === pattern);
}

/** Every exercise usable given a client's real equipment access — bodyweight
 * is always usable regardless of environment. */
export function exercisesForEquipment(available: EquipmentTag[]): LibraryExercise[] {
  const set = new Set<EquipmentTag>([...available, "bodyweight"]);
  return EXERCISE_LIBRARY.filter((e) => set.has(e.equipment));
}

/** The real substitution mechanism: another exercise sharing this one's
 * substituteGroup, restricted to available equipment, excluding itself. */
export function findSubstitute(exercise: LibraryExercise, available: EquipmentTag[]): LibraryExercise | null {
  const set = new Set<EquipmentTag>([...available, "bodyweight"]);
  return EXERCISE_LIBRARY.find((e) => e.substituteGroup === exercise.substituteGroup && e.name !== exercise.name && set.has(e.equipment)) ?? null;
}
