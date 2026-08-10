import type {
  AdherencePoint,
  CardioTarget,
  Client,
  Coach,
  DailyPlan,
  Exercise,
  MealOption,
  MealPeriod,
  Milestone,
  NutritionTargets,
  PrescribedSet,
  ScriptedChatTopic,
  StrengthPoint,
  WeeklyCompletionPoint,
  WeightPoint,
  Workout,
  DayOfWeek,
} from "./types";

// Single source of truth for the demo client's identity. Every screen reads
// this dynamically — never hardcode a client name elsewhere.
export const CLIENT: Client = {
  id: "client",
  name: "Client",
  goal: "Build muscle and improve training consistency",
  programWeek: 8,
  programTotalWeeks: 16,
  avatarInitials: "C",
  previousWeightLb: 191.4,
};

export const COACH: Coach = {
  id: "teague",
  name: "Teague",
  title: "Your Coach",
  avatarInitials: "TB",
};

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
  targetRpe: Exercise["targetRpe"]
): PrescribedSet[] {
  const sets: PrescribedSet[] = [];
  for (let i = 1; i <= warmup; i++) {
    sets.push({
      setNumber: i,
      isWarmup: true,
      targetRepsLow: 10,
      targetRepsHigh: 12,
      targetRpe: 6,
    });
  }
  for (let i = 1; i <= working; i++) {
    sets.push({
      setNumber: warmup + i,
      isWarmup: false,
      targetRepsLow: repsLow,
      targetRepsHigh: repsHigh,
      targetRpe,
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
    prescribedSets: makeSetPrescriptions(2, 3, 6, 10, 8),
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
    prescribedSets: makeSetPrescriptions(1, 3, 8, 12, 8),
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
    prescribedSets: makeSetPrescriptions(1, 3, 10, 15, 8),
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
    prescribedSets: makeSetPrescriptions(1, 3, 12, 15, 8),
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
    prescribedSets: makeSetPrescriptions(1, 3, 10, 15, 9),
  },
];

export const PUSH_WORKOUT: Workout = {
  id: TODAY_WORKOUT_ID,
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

export const TRAINING_WEEKLY_NOTE =
  "Push the incline press progression again this week if RPE allows — everything else stays exactly the same as last week.";

export const LAST_WEEK_SUMMARY = {
  weekLabel: "Week 7",
  completionPercent: 100,
  note: "Every session logged, all working sets within target RPE. Strong week.",
};

// ---------------------------------------------------------------------------
// Progress screen mock history
// ---------------------------------------------------------------------------

export const WEIGHT_HISTORY: WeightPoint[] = [
  { dateIso: "2026-06-29", weightLb: 193.8 },
  { dateIso: "2026-07-06", weightLb: 193.1 },
  { dateIso: "2026-07-13", weightLb: 192.2 },
  { dateIso: "2026-07-20", weightLb: 191.4 },
];

export const WEEKLY_COMPLETION_HISTORY: WeeklyCompletionPoint[] = [
  { weekLabel: "W5", completionPercent: 88 },
  { weekLabel: "W6", completionPercent: 94 },
  { weekLabel: "W7", completionPercent: 100 },
  { weekLabel: "W8", completionPercent: 0 },
];

export const NUTRITION_ADHERENCE_HISTORY: AdherencePoint[] = [
  { weekLabel: "W5", adherencePercent: 82 },
  { weekLabel: "W6", adherencePercent: 90 },
  { weekLabel: "W7", adherencePercent: 95 },
  { weekLabel: "W8", adherencePercent: 0 },
];

export const STRENGTH_HISTORY: StrengthPoint[] = [
  { dateIso: "2026-06-29", topSetWeightLb: 75 },
  { dateIso: "2026-07-06", topSetWeightLb: 80 },
  { dateIso: "2026-07-13", topSetWeightLb: 80 },
  { dateIso: "2026-07-20", topSetWeightLb: 85 },
];

export const MILESTONES: Milestone[] = [
  {
    id: "m-1",
    dateIso: "2026-07-20",
    title: "New incline press top set",
    detail: "85 lb dumbbells for 9 reps at RPE 8 — a 5 lb jump from three weeks ago.",
  },
  {
    id: "m-2",
    dateIso: "2026-07-13",
    title: "7-week consistency streak",
    detail: "Every programmed session logged for seven consecutive weeks.",
  },
  {
    id: "m-3",
    dateIso: "2026-07-01",
    title: "Down 2.4 lb since Week 5",
    detail: "Steady downward trend while working sets kept climbing — a good sign of body recomposition.",
  },
];

export const PROGRESS_COACH_NOTE =
  "Your pressing numbers are trending in the right direction and consistency has been excellent. Let's keep the same approach through Week 9 before we talk about the next progression.";

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

export const CHAT_ASSISTANT_DESCRIPTION =
  "The OPTIM Assistant helps answer routine questions and organizes anything that needs Teague's review.";
