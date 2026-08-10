import { MEAL_OPTIONS, PUSH_WORKOUT } from "./mock-data";
import { buildWorkoutSummary, canCompleteExercise } from "./workout-analysis";
import type {
  CardioLog,
  ChatMessage,
  ExerciseLog,
  MacroValues,
  MealPeriod,
  MealSelection,
  MorningWeightLog,
  PainReport,
  ReviewRequest,
  RpeValue,
  ScheduleChangeChoice,
  SkipReason,
  WorkoutSession,
  WorkoutSummary,
  WorkoutWindowState,
} from "./types";

export interface AppState {
  version: 1;
  dateIso: string;
  morningWeight: MorningWeightLog;
  meals: Partial<Record<MealPeriod, MealSelection>>;
  cardio: CardioLog;
  workoutWindow: WorkoutWindowState;
  workoutSession: WorkoutSession;
  chatMessages: ChatMessage[];
  reviewRequests: ReviewRequest[];
}

export function createInitialWorkoutSession(): WorkoutSession {
  const exerciseLogs: WorkoutSession["exerciseLogs"] = {};
  for (const exercise of PUSH_WORKOUT.exercises) {
    exerciseLogs[exercise.id] = {
      exerciseId: exercise.id,
      status: "not-started",
      loggedSets: [],
    };
  }
  return {
    workoutId: PUSH_WORKOUT.id,
    status: "not-started",
    currentExerciseIndex: 0,
    exerciseLogs,
    painReports: [],
  };
}

export function createInitialState(): AppState {
  return {
    version: 1,
    dateIso: new Date().toISOString().slice(0, 10),
    morningWeight: { weightLb: null, skipped: false },
    meals: {},
    cardio: { status: "not-started", durationMin: 0 },
    workoutWindow: { status: "pending" },
    workoutSession: createInitialWorkoutSession(),
    chatMessages: [],
    reviewRequests: [],
  };
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export type Action =
  | { type: "HYDRATE"; payload: AppState }
  | { type: "SET_MORNING_WEIGHT"; weightLb: number }
  | { type: "SKIP_MORNING_WEIGHT" }
  | { type: "SELECT_MEAL_OPTION"; period: MealPeriod; optionId: string }
  | {
      type: "SET_MANUAL_MEAL";
      period: MealPeriod;
      manualName: string;
      macros: MacroValues;
    }
  | { type: "SKIP_MEAL"; period: MealPeriod; reason: SkipReason; note?: string }
  | { type: "PLAN_MEAL_LATER"; period: MealPeriod }
  | { type: "UNDO_MEAL_SELECTION"; period: MealPeriod }
  | { type: "START_CARDIO" }
  | { type: "COMPLETE_CARDIO"; durationMin: number; note?: string }
  | { type: "SKIP_CARDIO"; reason: SkipReason; note?: string }
  | { type: "ACTIVATE_WORKOUT_WINDOW"; startIso: string; endIso: string }
  | { type: "CHOOSE_WORKOUT_TIME"; label: string }
  | { type: "SET_SCHEDULE_CHANGE"; choice: ScheduleChangeChoice }
  | { type: "START_WORKOUT" }
  | {
      type: "LOG_SET";
      exerciseId: string;
      setNumber: number;
      isWarmup: boolean;
      weightLb: number | null;
      reps: number | null;
      rpe: RpeValue | null;
      note?: string;
    }
  | { type: "REMOVE_LOGGED_SET"; exerciseId: string; setId: string }
  | {
      type: "SKIP_SET";
      exerciseId: string;
      setNumber: number;
      isWarmup: boolean;
      reason: SkipReason;
      note?: string;
    }
  | { type: "COMPLETE_EXERCISE"; exerciseId: string }
  | { type: "SKIP_EXERCISE"; exerciseId: string; reason: SkipReason; note?: string }
  | {
      type: "REPORT_PAIN";
      exerciseId?: string;
      location: string;
      ratingZeroToTen: number;
      onset: string;
      causedByMovement: string;
      continuedAfterSet: boolean;
      affectsOutsideGym: boolean;
      note?: string;
    }
  | { type: "SET_CURRENT_EXERCISE_INDEX"; index: number }
  | { type: "COMPLETE_WORKOUT"; summary: WorkoutSummary }
  | { type: "SKIP_WORKOUT"; reason: SkipReason; note?: string }
  | { type: "ADD_CHAT_MESSAGE"; message: ChatMessage }
  | { type: "RESET_TODAY" }
  | { type: "LOAD_PRESET"; preset: "completed-day" | "awaiting-review" };

function withMealMacros(
  meals: AppState["meals"],
  period: MealPeriod,
  selection: MealSelection
): AppState["meals"] {
  return { ...meals, [period]: selection };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return action.payload;

    case "SET_MORNING_WEIGHT":
      return {
        ...state,
        morningWeight: {
          weightLb: action.weightLb,
          loggedAtIso: new Date().toISOString(),
          skipped: false,
        },
      };

    case "SKIP_MORNING_WEIGHT":
      return {
        ...state,
        morningWeight: { weightLb: null, skipped: true },
      };

    case "SELECT_MEAL_OPTION": {
      const option = MEAL_OPTIONS[action.period].find((o) => o.id === action.optionId);
      if (!option) return state;
      const selection: MealSelection = {
        period: action.period,
        source: "option",
        optionId: option.id,
        macros: option.macros,
        completedAtIso: new Date().toISOString(),
      };
      return { ...state, meals: withMealMacros(state.meals, action.period, selection) };
    }

    case "SET_MANUAL_MEAL": {
      const selection: MealSelection = {
        period: action.period,
        source: "manual",
        manualName: action.manualName,
        macros: action.macros,
        isEstimate: true,
        completedAtIso: new Date().toISOString(),
      };
      return { ...state, meals: withMealMacros(state.meals, action.period, selection) };
    }

    case "SKIP_MEAL": {
      const selection: MealSelection = {
        period: action.period,
        source: "skipped",
        skipReason: action.reason,
        skipNote: action.note,
        completedAtIso: new Date().toISOString(),
      };
      return { ...state, meals: withMealMacros(state.meals, action.period, selection) };
    }

    case "PLAN_MEAL_LATER": {
      const selection: MealSelection = {
        period: action.period,
        source: "planned-later",
      };
      return { ...state, meals: withMealMacros(state.meals, action.period, selection) };
    }

    case "UNDO_MEAL_SELECTION": {
      const meals = { ...state.meals };
      delete meals[action.period];
      return { ...state, meals };
    }

    case "START_CARDIO":
      return { ...state, cardio: { ...state.cardio, status: "in-progress" } };

    case "COMPLETE_CARDIO":
      return {
        ...state,
        cardio: {
          status: "completed",
          durationMin: action.durationMin,
          note: action.note,
          completedAtIso: new Date().toISOString(),
        },
      };

    case "SKIP_CARDIO":
      return {
        ...state,
        cardio: {
          status: "skipped",
          durationMin: 0,
          skipReason: action.reason,
          note: action.note,
        },
      };

    case "ACTIVATE_WORKOUT_WINDOW":
      return {
        ...state,
        workoutWindow: {
          status: "activated",
          windowStartIso: action.startIso,
          windowEndIso: action.endIso,
        },
      };

    case "CHOOSE_WORKOUT_TIME":
      return {
        ...state,
        workoutWindow: {
          ...state.workoutWindow,
          status: "rescheduled",
          chosenTimeLabel: action.label,
        },
      };

    case "SET_SCHEDULE_CHANGE":
      return {
        ...state,
        workoutWindow: {
          ...state.workoutWindow,
          status: action.choice === "cannot-train-today" ? "declined" : "rescheduled",
          scheduleChangeChoice: action.choice,
        },
      };

    case "START_WORKOUT":
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          status: "in-progress",
          startedAtIso: state.workoutSession.startedAtIso ?? new Date().toISOString(),
        },
      };

    case "LOG_SET": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const existingIndex = log.loggedSets.findIndex(
        (s) => s.setNumber === action.setNumber && s.isWarmup === action.isWarmup
      );
      const newSet = {
        id: existingIndex >= 0 ? log.loggedSets[existingIndex].id : nextId("set"),
        exerciseId: action.exerciseId,
        setNumber: action.setNumber,
        isWarmup: action.isWarmup,
        weightLb: action.weightLb,
        reps: action.reps,
        rpe: action.rpe,
        note: action.note,
        completedAtIso: new Date().toISOString(),
        status: "completed" as const,
      };
      const loggedSets =
        existingIndex >= 0
          ? log.loggedSets.map((s, i) => (i === existingIndex ? newSet : s))
          : [...log.loggedSets, newSet];
      const updatedLog: ExerciseLog = {
        ...log,
        status: "in-progress",
        loggedSets,
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
        },
      };
    }

    case "REMOVE_LOGGED_SET": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const updatedLog: ExerciseLog = {
        ...log,
        loggedSets: log.loggedSets.filter((s) => s.id !== action.setId),
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
        },
      };
    }

    case "SKIP_SET": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const skippedSet = {
        id: nextId("set"),
        exerciseId: action.exerciseId,
        setNumber: action.setNumber,
        isWarmup: action.isWarmup,
        weightLb: null,
        reps: null,
        rpe: null,
        status: "skipped" as const,
        skipReason: action.reason,
        note: action.note,
      };
      const updatedLog: ExerciseLog = {
        ...log,
        status: "in-progress",
        loggedSets: [...log.loggedSets, skippedSet],
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
        },
      };
    }

    case "COMPLETE_EXERCISE": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const exercise = PUSH_WORKOUT.exercises.find((e) => e.id === action.exerciseId);
      // Defensive backstop: an exercise can only become "completed" when the
      // underlying logged data actually supports it — never just because a
      // button was pressed. The UI gates this too, but the reducer is the
      // real source of truth.
      if (!exercise || !canCompleteExercise(exercise, log)) return state;
      const updatedLog: ExerciseLog = { ...log, status: "completed" };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
        },
      };
    }

    case "SKIP_EXERCISE": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const updatedLog: ExerciseLog = {
        ...log,
        status: "skipped",
        skipReason: action.reason,
        skipNote: action.note,
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
        },
      };
    }

    case "REPORT_PAIN": {
      const report: PainReport = {
        id: nextId("pain"),
        createdAtIso: new Date().toISOString(),
        exerciseId: action.exerciseId,
        location: action.location,
        ratingZeroToTen: action.ratingZeroToTen,
        onset: action.onset,
        causedByMovement: action.causedByMovement,
        continuedAfterSet: action.continuedAfterSet,
        affectsOutsideGym: action.affectsOutsideGym,
        note: action.note,
      };
      const reviewRequest: ReviewRequest = {
        id: nextId("review"),
        kind: "pain-report",
        createdAtIso: report.createdAtIso,
        summary: `Pain reported: ${action.location} during today's workout.`,
        resolved: false,
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          painReports: [...state.workoutSession.painReports, report],
        },
        reviewRequests: [...state.reviewRequests, reviewRequest],
      };
    }

    case "SET_CURRENT_EXERCISE_INDEX":
      return {
        ...state,
        workoutSession: { ...state.workoutSession, currentExerciseIndex: action.index },
      };

    case "COMPLETE_WORKOUT": {
      // Defensive backstop matching COMPLETE_EXERCISE: a workout can never
      // be submitted as completed with zero logged working sets, even if
      // something dispatches this action outside the normal gated UI flow.
      if (action.summary.workingSetsCompleted === 0) return state;
      const reviewRequests = [...state.reviewRequests];
      if (action.summary.needsReview) {
        // Describe the actual reason for the flag rather than a generic
        // claim — never say "RPE values" unless that's really why.
        const hasSkippedWork = action.summary.exercisesSkipped > 0 || action.summary.skippedSetsCount > 0;
        reviewRequests.push({
          id: nextId("review"),
          kind: hasSkippedWork ? "workout-skipped" : "rpe-anomaly",
          createdAtIso: new Date().toISOString(),
          summary: hasSkippedWork
            ? "Today's push workout was submitted with skipped work."
            : "Today's push workout has RPE values worth a second look.",
          resolved: false,
        });
      }
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          status: "completed",
          completedAtIso: new Date().toISOString(),
          summary: action.summary,
        },
        reviewRequests,
      };
    }

    case "SKIP_WORKOUT": {
      const reviewRequest: ReviewRequest = {
        id: nextId("review"),
        kind: "workout-skipped",
        createdAtIso: new Date().toISOString(),
        summary: "Today's push workout was skipped.",
        resolved: false,
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          status: "skipped",
          skipReason: action.reason,
          skipNote: action.note,
        },
        reviewRequests: [...state.reviewRequests, reviewRequest],
      };
    }

    case "ADD_CHAT_MESSAGE":
      return { ...state, chatMessages: [...state.chatMessages, action.message] };

    case "RESET_TODAY":
      return createInitialState();

    case "LOAD_PRESET":
      return action.preset === "completed-day" ? buildCompletedDayPreset() : buildAwaitingReviewPreset();

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Presets for testable states (prototype settings menu)
// ---------------------------------------------------------------------------

function buildCompletedDayPreset(): AppState {
  const base = createInitialState();
  const now = new Date().toISOString();

  base.morningWeight = { weightLb: 190.8, loggedAtIso: now, skipped: false };

  (["breakfast", "postWorkout", "lunch", "dinner", "snack"] as MealPeriod[]).forEach((period) => {
    const option = MEAL_OPTIONS[period][0];
    base.meals[period] = {
      period,
      source: "option",
      optionId: option.id,
      macros: option.macros,
      completedAtIso: now,
    };
  });

  base.cardio = { status: "completed", durationMin: 20, completedAtIso: now };

  base.workoutWindow = {
    status: "activated",
    windowStartIso: now,
    windowEndIso: now,
  };

  const exerciseLogs: WorkoutSession["exerciseLogs"] = {};
  for (const exercise of PUSH_WORKOUT.exercises) {
    const loggedSets = exercise.prescribedSets.map((set) => ({
      id: nextId("set"),
      exerciseId: exercise.id,
      setNumber: set.setNumber,
      isWarmup: set.isWarmup,
      weightLb: exercise.previousPerformance[0]?.weightLb ?? 50,
      reps: set.targetRepsLow + 1,
      rpe: set.targetRpe,
      completedAtIso: now,
      status: "completed" as const,
    }));
    exerciseLogs[exercise.id] = { exerciseId: exercise.id, status: "completed", loggedSets };
  }

  const startedAtIso = new Date(Date.now() - 64 * 60_000).toISOString();

  const sessionBeforeSummary: WorkoutSession = {
    workoutId: PUSH_WORKOUT.id,
    status: "in-progress",
    startedAtIso,
    currentExerciseIndex: PUSH_WORKOUT.exercises.length - 1,
    exerciseLogs,
    painReports: [],
  };

  // Generate the summary from the actual logged data rather than hand-writing
  // feedback text, so even the demo presets never fabricate a claim.
  const summary = buildWorkoutSummary(sessionBeforeSummary, startedAtIso, now);

  base.workoutSession = {
    ...sessionBeforeSummary,
    status: "completed",
    completedAtIso: now,
    summary,
  };

  return base;
}

function buildAwaitingReviewPreset(): AppState {
  const base = buildCompletedDayPreset();
  const now = new Date().toISOString();

  const inclineLog = base.workoutSession.exerciseLogs["incline-db-press"];
  if (inclineLog) {
    inclineLog.loggedSets = inclineLog.loggedSets.map((s, i) =>
      i === inclineLog.loggedSets.length - 1 ? { ...s, rpe: 10 } : s
    );
  }

  base.workoutSession.painReports = [
    {
      id: nextId("pain"),
      createdAtIso: now,
      exerciseId: "incline-db-press",
      location: "Right shoulder",
      ratingZeroToTen: 4,
      onset: "During the final working set",
      causedByMovement: "Incline Dumbbell Press",
      continuedAfterSet: false,
      affectsOutsideGym: false,
      note: "Felt tight, not sharp. Eased off after the set.",
    },
  ];

  // Regenerate from the modified logged data (RPE 10 + pain report) instead
  // of hand-writing text, so this preset never fabricates a claim either.
  base.workoutSession.summary = buildWorkoutSummary(
    base.workoutSession,
    base.workoutSession.startedAtIso!,
    base.workoutSession.completedAtIso!
  );

  base.reviewRequests = [
    {
      id: nextId("review"),
      kind: "pain-report",
      createdAtIso: now,
      summary: "Pain reported: right shoulder during Incline Dumbbell Press.",
      resolved: false,
    },
    {
      id: nextId("review"),
      kind: "rpe-anomaly",
      createdAtIso: now,
      summary: "Today's push workout has RPE values worth a second look.",
      resolved: false,
    },
  ];

  return base;
}
