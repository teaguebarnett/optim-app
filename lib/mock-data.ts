import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "./tenancy/seed.ts";
import type { ClientProfileId } from "./tenancy/types";
import type {
  CardioOption,
  CardioPrescription,
  CardioTarget,
  DailyPlan,
  Exercise,
  MealOption,
  MealPeriod,
  NutritionTargets,
  PrescribedSet,
  ScriptedChatTopic,
  Workout,
  DayOfWeek,
} from "./types";

const ALL_DAYS_OF_WEEK: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Client and coach identity now live in lib/tenancy/seed.ts (ClientProfile,
// CoachProfile) as part of the OPTIM demo workspace — every screen resolves
// them dynamically through useActiveContext() rather than importing a
// CLIENT/COACH constant from here. This file stays focused on program/
// nutrition/progress catalog content.

export const NUTRITION_TARGETS: NutritionTargets = {
  calories: 3000,
  proteinG: 200,
  carbsG: 360,
  fatG: 85,
};

export const CARDIO_TARGET: CardioTarget = {
  activity: "StairMaster",
  durationMin: 20,
  heartRateRangeLow: 128,
  heartRateRangeHigh: 148,
};

const STAIRMASTER_OPTION: CardioOption = {
  id: "cardio-stairmaster",
  type: "StairMaster",
  displayName: "StairMaster",
  isDefault: true,
  intendedUse: "Your standard steady-state cardio session.",
  targetDurationMin: CARDIO_TARGET.durationMin,
  heartRateRangeLow: CARDIO_TARGET.heartRateRangeLow,
  heartRateRangeHigh: CARDIO_TARGET.heartRateRangeHigh,
  protocol: `${CARDIO_TARGET.durationMin} minutes at a steady pace, keeping your heart rate between ${CARDIO_TARGET.heartRateRangeLow} and ${CARDIO_TARGET.heartRateRangeHigh} bpm.`,
};

const HIIT_OPTION: CardioOption = {
  id: "cardio-hiit",
  type: "HIIT",
  displayName: "HIIT workout",
  isDefault: false,
  intendedUse: "Approved time-saving alternative when you're short on time.",
  targetDurationMin: 12,
  heartRateRangeLow: CARDIO_TARGET.heartRateRangeLow,
  heartRateRangeHigh: CARDIO_TARGET.heartRateRangeHigh,
  protocol: `12 minutes total: alternate 30 seconds of hard effort with 60 seconds of easy recovery, keeping your hard efforts in the ${CARDIO_TARGET.heartRateRangeLow}-${CARDIO_TARGET.heartRateRangeHigh} bpm range.`,
};

/** Per-client approved cardio options and assigned days — coach-controlled
 * and configurable so a client with only one approved option never sees a
 * picker, while a client whose coach has approved an alternative (e.g. a
 * time-saving HIIT substitution) does, and so each client's actual assigned
 * cardio days drive Progress/History rather than an app-wide assumption
 * that cardio is prescribed every day for everyone. Keyed by ClientProfileId
 * rather than hardcoded to any one client's name, so this stays correct for
 * future clients/workspaces. The current demo client is prescribed cardio
 * every day; any client not present here falls back to the single default
 * option with no assigned days at all — see cardioPrescriptionForClient()
 * and isCardioAssignedForDay() below. */
export const CARDIO_PRESCRIPTIONS_BY_CLIENT: Record<ClientProfileId, CardioPrescription> = {
  [CLIENT_PROFILE_DEMO.id]: { options: [STAIRMASTER_OPTION, HIIT_OPTION], assignedDays: ALL_DAYS_OF_WEEK },
};

/** No options-picker assumption and no assigned days — a future client the
 * coach hasn't configured a cardio program for yet must never silently
 * inherit the demo client's every-day schedule. */
const DEFAULT_CARDIO_PRESCRIPTION: CardioPrescription = { options: [STAIRMASTER_OPTION], assignedDays: [] };

export function cardioPrescriptionForClient(clientId: ClientProfileId): CardioPrescription {
  return CARDIO_PRESCRIPTIONS_BY_CLIENT[clientId] ?? DEFAULT_CARDIO_PRESCRIPTION;
}

/** The one shared "does this client's coach-assigned program actually
 * prescribe cardio on this day of week" check — read by both the live
 * Today experience and every Progress/History derivation (see
 * lib/history/build-daily-record.ts, lib/history/demo-fixture.ts) so they
 * can never disagree about which days count. */
export function isCardioAssignedForDay(clientId: ClientProfileId, dayOfWeek: DayOfWeek): boolean {
  return cardioPrescriptionForClient(clientId).assignedDays.includes(dayOfWeek);
}

export const TODAY_WORKOUT_ID = "push-day-w8";

export const DAILY_PLAN: DailyPlan = {
  dayOfWeek: "Monday",
  dateIso: "2026-07-27",
  programWeek: 8,
  programTotalWeeks: 16,
  workoutId: TODAY_WORKOUT_ID,
  cardioTarget: CARDIO_TARGET,
};

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

function makeSetPrescriptions(
  warmup: number,
  working: number,
  repsLow: number,
  repsHigh: number,
  targetRpe: Exercise["targetRpe"],
  /** Coach-prescribed working weight for this exercise today — the client
   * sees this instead of typing one in. Defaults to the most recent
   * previousPerformance entry when omitted at the call site. */
  workingWeightLb?: number
): PrescribedSet[] {
  const sets: PrescribedSet[] = [];
  // Warm-up weight is only ever displayed as guidance text (never logged or
  // required), so a simple fraction of the working weight is a reasonable
  // suggestion rather than a precise prescription.
  const warmupWeightLb = workingWeightLb !== undefined ? Math.round((workingWeightLb * 0.55) / 5) * 5 : undefined;
  const warmupReps = Math.round((10 + 12) / 2);
  const workingReps = Math.round((repsLow + repsHigh) / 2);
  for (let i = 1; i <= warmup; i++) {
    sets.push({
      setNumber: i,
      isWarmup: true,
      targetRepsLow: 10,
      targetRepsHigh: 12,
      targetRpe: 6,
      prescribedWeightLb: warmupWeightLb,
      prescribedReps: warmupReps,
    });
  }
  for (let i = 1; i <= working; i++) {
    sets.push({
      setNumber: warmup + i,
      isWarmup: false,
      targetRepsLow: repsLow,
      targetRepsHigh: repsHigh,
      targetRpe,
      prescribedWeightLb: workingWeightLb,
      prescribedReps: workingReps,
    });
  }
  return sets;
}

export const MEAL_OPTIONS: Record<MealPeriod, MealOption[]> = {
  breakfast: [
    {
      id: "bf-1",
      period: "breakfast",
      name: "Protein cereal, Fairlife milk, and banana",
      description: "A fast, high-protein start that travels well if you're out the door early.",
      mainIngredients: ["Protein cereal", "Fairlife milk", "Banana"],
      macros: { calories: 640, proteinG: 46, carbsG: 90, fatG: 10 },
    },
    {
      id: "bf-2",
      period: "breakfast",
      name: "Eggs, toast, Greek yogurt, and fruit",
      description: "A balanced classic with a mix of quick and slow-digesting protein.",
      mainIngredients: ["Whole eggs", "Sourdough toast", "Greek yogurt", "Mixed fruit"],
      macros: { calories: 610, proteinG: 42, carbsG: 68, fatG: 18 },
    },
    {
      id: "bf-3",
      period: "breakfast",
      name: "Protein oatmeal with berries and peanut butter",
      description: "Slow-digesting carbs and healthy fat to hold you until your workout.",
      mainIngredients: ["Oats", "Protein powder", "Berries", "Peanut butter"],
      macros: { calories: 655, proteinG: 44, carbsG: 78, fatG: 20 },
    },
  ],
  postWorkout: [
    {
      id: "pw-1",
      period: "postWorkout",
      name: "Chicken, rice, and vegetables",
      description: "The reliable go-to — easy to prep ahead and easy on the stomach post-training.",
      mainIngredients: ["Chicken breast", "White rice", "Mixed vegetables"],
      macros: { calories: 620, proteinG: 52, carbsG: 70, fatG: 12 },
    },
    {
      id: "pw-2",
      period: "postWorkout",
      name: "Lean beef rice bowl",
      description: "A heartier option with extra iron if you're feeling depleted after pressing.",
      mainIngredients: ["Lean ground beef", "White rice", "Peppers and onions"],
      macros: { calories: 680, proteinG: 48, carbsG: 72, fatG: 20 },
    },
    {
      id: "pw-3",
      period: "postWorkout",
      name: "Turkey pasta and fruit",
      description: "Lighter and quick to make when you want to eat and get on with your day.",
      mainIngredients: ["Ground turkey", "Pasta", "Marinara", "Fruit"],
      macros: { calories: 600, proteinG: 44, carbsG: 76, fatG: 10 },
    },
  ],
  lunch: [
    {
      id: "l-1",
      period: "lunch",
      name: "Chicken sandwich with potatoes",
      description: "A satisfying midday plate that's simple to pack or order out.",
      mainIngredients: ["Grilled chicken breast", "Whole grain bun", "Roasted potatoes"],
      macros: { calories: 720, proteinG: 50, carbsG: 82, fatG: 18 },
    },
    {
      id: "l-2",
      period: "lunch",
      name: "Burger bowl",
      description: "All the flavor of a burger without the bun — rice or greens underneath.",
      mainIngredients: ["Lean ground beef", "Rice or greens", "Cheese", "Pickles"],
      macros: { calories: 700, proteinG: 46, carbsG: 60, fatG: 26 },
    },
    {
      id: "l-3",
      period: "lunch",
      name: "Turkey and rice bowl",
      description: "Lean and easy to scale up or down depending on how hungry you are.",
      mainIngredients: ["Ground turkey", "White rice", "Black beans", "Salsa"],
      macros: { calories: 690, proteinG: 48, carbsG: 78, fatG: 16 },
    },
  ],
  dinner: [
    {
      id: "d-1",
      period: "dinner",
      name: "Steak, potatoes, and vegetables",
      description: "A satisfying finish to the day with a good mix of protein and carbs.",
      mainIngredients: ["Sirloin steak", "Roasted potatoes", "Green beans"],
      macros: { calories: 780, proteinG: 52, carbsG: 62, fatG: 30 },
    },
    {
      id: "d-2",
      period: "dinner",
      name: "Chicken pasta",
      description: "Comfort food that still lines up with your targets.",
      mainIngredients: ["Chicken breast", "Pasta", "Light cream sauce", "Spinach"],
      macros: { calories: 750, proteinG: 50, carbsG: 84, fatG: 20 },
    },
    {
      id: "d-3",
      period: "dinner",
      name: "Salmon, rice, and vegetables",
      description: "A lighter option with beneficial fats if you're eating later in the evening.",
      mainIngredients: ["Salmon fillet", "Jasmine rice", "Roasted broccoli"],
      macros: { calories: 730, proteinG: 46, carbsG: 66, fatG: 26 },
    },
  ],
  snack: [
    {
      id: "s-1",
      period: "snack",
      name: "Greek yogurt, fruit, and cereal",
      description: "A little crunch and sweetness without straying far from target.",
      mainIngredients: ["Greek yogurt", "Mixed berries", "Cereal"],
      macros: { calories: 320, proteinG: 24, carbsG: 44, fatG: 6 },
    },
    {
      id: "s-2",
      period: "snack",
      name: "Protein shake and banana",
      description: "The fastest option when you're short on time between meals.",
      mainIngredients: ["Whey protein", "Milk", "Banana"],
      macros: { calories: 310, proteinG: 32, carbsG: 34, fatG: 6 },
    },
    {
      id: "s-3",
      period: "snack",
      name: "Cottage cheese and berries",
      description: "Slow-digesting protein that works well later in the evening too.",
      mainIngredients: ["Cottage cheese", "Berries", "Honey"],
      macros: { calories: 290, proteinG: 26, carbsG: 30, fatG: 8 },
    },
  ],
};

export const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: "Breakfast",
  postWorkout: "Post-workout meal",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

// ---------------------------------------------------------------------------
// Monday push workout
// ---------------------------------------------------------------------------

const PUSH_EXERCISES: Exercise[] = [
  {
    id: "incline-db-press",
    order: 1,
    name: "Incline Dumbbell Press",
    warmupSets: 2,
    workingSets: 3,
    targetRepsLow: 6,
    targetRepsHigh: 10,
    targetRpe: 8,
    restSeconds: 150,
    tempo: "3-0-1",
    cue: "Keep your shoulder blades stable and lower the dumbbells under control.",
    previousPerformance: [
      { weightLb: 85, reps: 9, rpe: 8 },
      { weightLb: 85, reps: 8, rpe: 9 },
      { weightLb: 85, reps: 7, rpe: 9 },
    ],
    prescribedSets: makeSetPrescriptions(2, 3, 6, 10, 8, 85),
  },
  {
    id: "machine-chest-press",
    order: 2,
    name: "Machine Chest Press",
    warmupSets: 1,
    workingSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 12,
    targetRpe: 8,
    restSeconds: 120,
    tempo: "2-0-1",
    cue: "Drive through a full range of motion without shrugging your shoulders up.",
    previousPerformance: [
      { weightLb: 160, reps: 11, rpe: 8 },
      { weightLb: 160, reps: 10, rpe: 8 },
      { weightLb: 160, reps: 9, rpe: 9 },
    ],
    prescribedSets: makeSetPrescriptions(1, 3, 8, 12, 8, 160),
  },
  {
    id: "cable-fly",
    order: 3,
    name: "Cable Fly",
    warmupSets: 1,
    workingSets: 3,
    targetRepsLow: 10,
    targetRepsHigh: 15,
    targetRpe: 8,
    restSeconds: 90,
    tempo: "2-1-1",
    cue: "Focus on squeezing the chest at the midline rather than moving heavy weight.",
    previousPerformance: [
      { weightLb: 30, reps: 13, rpe: 8 },
      { weightLb: 30, reps: 12, rpe: 8 },
      { weightLb: 30, reps: 11, rpe: 9 },
    ],
    prescribedSets: makeSetPrescriptions(1, 3, 10, 15, 8, 30),
  },
  {
    id: "cable-lateral-raise",
    order: 4,
    name: "Cable Lateral Raise",
    warmupSets: 1,
    workingSets: 3,
    targetRepsLow: 12,
    targetRepsHigh: 15,
    targetRpe: 8,
    restSeconds: 75,
    tempo: "2-0-1",
    cue: "Lead with your elbow and stop at shoulder height — don't shrug to finish reps.",
    previousPerformance: [
      { weightLb: 15, reps: 14, rpe: 8 },
      { weightLb: 15, reps: 13, rpe: 8 },
      { weightLb: 15, reps: 12, rpe: 9 },
    ],
    prescribedSets: makeSetPrescriptions(1, 3, 12, 15, 8, 15),
  },
  {
    id: "rope-pressdown",
    order: 5,
    name: "Rope Pressdown",
    warmupSets: 1,
    workingSets: 3,
    targetRepsLow: 10,
    targetRepsHigh: 15,
    targetRpe: 9,
    restSeconds: 75,
    tempo: "2-0-1",
    cue: "Keep your elbows pinned to your sides through the full set.",
    previousPerformance: [
      { weightLb: 50, reps: 14, rpe: 8 },
      { weightLb: 50, reps: 13, rpe: 9 },
      { weightLb: 50, reps: 12, rpe: 9 },
    ],
    prescribedSets: makeSetPrescriptions(1, 3, 10, 15, 9, 50),
  },
];

export const PUSH_WORKOUT: Workout = {
  id: TODAY_WORKOUT_ID,
  workspaceId: WORKSPACE_OPTIM_ID,
  name: "Push Workout",
  dayOfWeek: "Monday",
  focus: "Chest, shoulders, and triceps",
  estimatedDurationMin: 65,
  warmupOverview: "5 minutes light cardio, band pull-aparts, and two warm-up sets on your first press.",
  coachNote:
    "Control every eccentric and keep the final working sets inside the target RPE range. Do not force a repetition once technique begins to break down.",
  exercises: PUSH_EXERCISES,
};

export const WORKOUTS_BY_ID: Record<string, Workout> = {
  [TODAY_WORKOUT_ID]: PUSH_WORKOUT,
};

// ---------------------------------------------------------------------------
// Training week overview (Monday is the only fully interactive day)
// ---------------------------------------------------------------------------

export interface TrainingWeekDay {
  dayOfWeek: DayOfWeek;
  label: string;
  type: "training" | "rest";
  workoutName?: string;
  focus?: string;
  status: "completed" | "today" | "upcoming" | "rest";
}

export const TRAINING_WEEK: TrainingWeekDay[] = [
  { dayOfWeek: "Monday", label: "Mon", type: "training", workoutName: "Push Workout", focus: "Chest, shoulders, triceps", status: "today" },
  { dayOfWeek: "Tuesday", label: "Tue", type: "training", workoutName: "Pull Workout", focus: "Back and biceps", status: "upcoming" },
  { dayOfWeek: "Wednesday", label: "Wed", type: "rest", status: "rest" },
  { dayOfWeek: "Thursday", label: "Thu", type: "training", workoutName: "Leg Workout", focus: "Quads, hamstrings, glutes", status: "upcoming" },
  { dayOfWeek: "Friday", label: "Fri", type: "training", workoutName: "Upper Workout", focus: "Full upper body", status: "upcoming" },
  { dayOfWeek: "Saturday", label: "Sat", type: "training", workoutName: "Lower Workout", focus: "Posterior chain", status: "upcoming" },
  { dayOfWeek: "Sunday", label: "Sun", type: "rest", status: "rest" },
];

/** The real schedule entry for a given local day of week, or undefined for
 * a day the training-week template doesn't cover at all ("no session
 * scheduled" — TRAINING_WEEK currently covers all seven days as either
 * "training" or "rest", so this is undefined only for a future/alternate
 * template). Accepts an injectable template only so tests can exercise the
 * "no entry at all" path directly; every real caller uses the default. */
export function trainingWeekEntryForDay(
  dayOfWeek: DayOfWeek,
  trainingWeek: TrainingWeekDay[] = TRAINING_WEEK
): TrainingWeekDay | undefined {
  return trainingWeek.find((d) => d.dayOfWeek === dayOfWeek);
}

/** The real, fully-authored catalog Workout (with loggable exercises) that
 * matches a given day of week, if one exists. WORKOUTS_BY_ID currently only
 * has real content for the day(s) it's been authored for (today, just
 * Monday's Push Workout) — a day whose TRAINING_WEEK entry names a workout
 * (e.g. Friday's "Upper Workout") but has no matching entry here is
 * label-only and must never be presented as if real session detail exists.
 * Accepts an injectable catalog only for tests; every real caller uses the
 * default. */
export function catalogWorkoutForDay(
  dayOfWeek: DayOfWeek,
  catalog: Record<string, Workout> = WORKOUTS_BY_ID
): Workout | undefined {
  return Object.values(catalog).find((w) => w.dayOfWeek === dayOfWeek);
}

export const TRAINING_WEEKLY_NOTE =
  "Push the incline press progression again this week if RPE allows — everything else stays exactly the same as last week.";

export const LAST_WEEK_SUMMARY = {
  weekLabel: "Week 7",
  completionPercent: 100,
  note: "Every session logged, all working sets within target RPE. Strong week.",
};

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const SCRIPTED_CHAT_TOPICS: ScriptedChatTopic[] = [
  {
    id: "meal-substitution",
    prompt: "Can I use turkey instead of chicken?",
    responseSender: "assistant",
    response:
      "Yes. Use a similar cooked portion and keep the meal's protein and total calories close to the original. Your daily targets remain unchanged.",
  },
  {
    id: "exercise-technique",
    prompt: "What does RPE 8 mean?",
    responseSender: "assistant",
    response:
      "RPE 8 means finishing the set with approximately two strong repetitions left before failure. The final repetitions should be challenging, but your technique should remain controlled.",
  },
  {
    id: "missed-workout",
    prompt: "I'm going to miss today's workout.",
    responseSender: "assistant",
    response:
      "Thanks for letting me know. I've noted it on today's plan and flagged it for Teague. If you can, let me know when you'd like to make it up — otherwise Teague will factor it into this week's programming.",
  },
  {
    id: "shoulder-discomfort",
    prompt: "My shoulder hurt during incline press.",
    responseSender: "assistant",
    response:
      "I've logged this and prepared it for Teague's review. Your program has not been permanently changed. Teague will review the details before any adjustment is finalized.",
  },
  {
    id: "restaurant-meal",
    prompt: "I'm eating at a restaurant tonight — what should I do?",
    responseSender: "assistant",
    response:
      "Pick a protein-forward entree if you can — grilled meat, fish, or poultry with a starch and vegetable side works well. Log it as \"I ate something else\" with your best estimate afterward and don't stress about being exact.",
  },
  {
    id: "schedule-change",
    prompt: "My schedule changed today — can I train later?",
    responseSender: "assistant",
    response:
      "Of course. Use \"My schedule changed\" on today's workout window and choose the option that fits — I'll update today's plan and Teague will see the change.",
  },
];

// Built from the active workspace's assistant/coach names rather than a
// hardcoded constant, so a differently-branded workspace gets its own copy.
export function chatAssistantDescription(assistantDisplayName: string, coachDisplayName: string): string {
  return `The ${assistantDisplayName} helps answer routine questions and organizes anything that needs ${coachDisplayName}'s review.`;
}
