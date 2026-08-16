import { MEAL_OPTIONS, PUSH_WORKOUT } from "./mock-data.ts";
import { buildWorkoutSummary, canCompleteExercise } from "./workout-analysis.ts";
import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "./tenancy/seed.ts";
import type { ClientProfileId, WorkspaceId } from "./tenancy/types";
import { setTrainingStatus, setTrainingTime } from "./planning/training-plan.ts";
import type { DailyTrainingPlan } from "./planning/types";
import { buildDemoDefaultProgramEnrollment } from "./scheduling/enrollment.ts";
import { resolveClientLocalDateIso } from "./shared/local-date.ts";
import type { ProgramEnrollment } from "./scheduling/types";
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
  SkipReason,
  WorkoutSession,
  WorkoutSummary,
} from "./types";

// The demo app only ever runs as this one client, in this one workspace —
// see lib/tenancy/seed.ts and lib/tenancy/context.ts for how a future
// multi-workspace app would resolve these per-session instead of as
// constants. Every new record the reducer creates is stamped with these so
// components never have to remember to attribute a record correctly.
const DEMO_WORKSPACE_ID: WorkspaceId = WORKSPACE_OPTIM_ID;
const DEMO_CLIENT_ID: ClientProfileId = CLIENT_PROFILE_DEMO.id;

export interface AppState {
  version: 5;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  dateIso: string;
  morningWeight: MorningWeightLog;
  meals: Partial<Record<MealPeriod, MealSelection>>;
  cardio: CardioLog;
  /** The client's own training-time decision for today — null means no
   * decision has been made yet. Replaces Phase 1/2's countdown-driven
   * workoutWindow entirely; see lib/planning/training-plan.ts. */
  dailyTrainingPlan: DailyTrainingPlan | null;
  workoutSession: WorkoutSession;
  chatMessages: ChatMessage[];
  reviewRequests: ReviewRequest[];
  /** Phase 4.1 — the client's real program enrollment, replacing
   * ClientProfile.programWeek as a hand-set display value with a derivable
   * one. See lib/scheduling/enrollment.ts. A small, singular, current-config
   * record — unlike the growing history log in lib/history/, it belongs
   * directly in AppState the same way dailyTrainingPlan already does. */
  programEnrollment: ProgramEnrollment;
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
    workspaceId: DEMO_WORKSPACE_ID,
    clientId: DEMO_CLIENT_ID,
    workoutId: PUSH_WORKOUT.id,
    status: "not-started",
    currentExerciseIndex: 0,
    exerciseLogs,
    painReports: [],
  };
}

export function createInitialState(): AppState {
  // Phase 4.1 corrective — dateIso and programEnrollment are derived from
  // the exact same instant, through the same client-local IANA-timezone
  // resolver (lib/shared/local-date.ts), so they can never diverge into two
  // different "today"s — see the module doc on maintaining one
  // authoritative effective-date source.
  const now = new Date();
  const programEnrollment = buildDemoDefaultProgramEnrollment(now);
  return {
    version: 5,
    workspaceId: DEMO_WORKSPACE_ID,
    clientId: DEMO_CLIENT_ID,
    dateIso: resolveClientLocalDateIso(now, programEnrollment.timeZone),
    morningWeight: { weightLb: null, skipped: false },
    meals: {},
    cardio: { status: "not-started", durationMin: 0 },
    dailyTrainingPlan: null,
    workoutSession: createInitialWorkoutSession(),
    chatMessages: [],
    reviewRequests: [],
    programEnrollment,
  };
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

// Phase 3.1.1 §2 — the client can now type an exact cardio duration
// directly (not just +/- 1 min steps), so the reducer itself enforces the
// sensible floor/ceiling rather than trusting the UI alone.
const CARDIO_DURATION_MAX_MIN = 180;
function clampCardioDurationMin(value: number): number {
  return Math.min(CARDIO_DURATION_MAX_MIN, Math.max(0, Math.round(value)));
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
  | { type: "START_CARDIO"; durationMin: number }
  | { type: "COMPLETE_CARDIO"; durationMin: number; note?: string }
  | { type: "SKIP_CARDIO"; reason: SkipReason; note?: string }
  | { type: "SET_CARDIO_DURATION"; durationMin: number }
  | { type: "SELECT_CARDIO_OPTION"; optionId: string }
  | { type: "SET_TRAINING_TIME"; time24: string }
  | { type: "SET_TRAINING_UNSURE" }
  | { type: "SET_TRAINING_REST_DAY" }
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
  | { type: "ADD_CHAT_MESSAGE"; message: Omit<ChatMessage, "workspaceId" | "clientId"> }
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
      return {
        ...state,
        cardio: { ...state.cardio, status: "in-progress", durationMin: clampCardioDurationMin(action.durationMin) },
      };

    case "COMPLETE_CARDIO":
      return {
        ...state,
        cardio: {
          ...state.cardio,
          status: "completed",
          durationMin: clampCardioDurationMin(action.durationMin),
          note: action.note,
          completedAtIso: new Date().toISOString(),
        },
      };

    // A session with any real minutes already logged is "partial," never
    // "skipped" — the client did some cardio, just not to completion. Mirrors
    // SKIP_WORKOUT's ended-early distinction. See Phase 4.1's cardio-partial
    // correction.
    case "SKIP_CARDIO": {
      const hasPartialProgress = state.cardio.durationMin > 0;
      return {
        ...state,
        cardio: {
          ...state.cardio,
          status: hasPartialProgress ? "partial" : "skipped",
          durationMin: hasPartialProgress ? state.cardio.durationMin : 0,
          skipReason: action.reason,
          note: action.note,
        },
      };
    }

    // The +/- controls and the exact-entry field both dispatch this so the
    // actual duration a client has logged so far survives a refresh — never
    // below zero, never above a sane ceiling, and never touching the
    // separate prescribed target duration. See Phase 3.1 §6 and Phase
    // 3.1.1 §2.
    case "SET_CARDIO_DURATION":
      return { ...state, cardio: { ...state.cardio, durationMin: clampCardioDurationMin(action.durationMin) } };

    // Switching the approved option only changes what a *new*/in-progress
    // session is tracked against — COMPLETE_CARDIO above preserves whatever
    // was selected at that moment via its own `...state.cardio` spread, so
    // a later switch never rewrites an already-completed log.
    case "SELECT_CARDIO_OPTION":
      return { ...state, cardio: { ...state.cardio, selectedOptionId: action.optionId } };

    // Phase 4.1 corrective — these three cases used to recompute "today"
    // independently via the machine-local resolveLocalDateIso(new Date()),
    // a second date system that could disagree with state.dateIso (the one
    // authoritative effective date already resolved at hydration/rollover
    // time — see lib/history/rollover.ts). Reusing state.dateIso directly
    // means dailyTrainingPlan is always scoped to the exact same date the
    // rest of the app already agreed on, with no possibility of drift
    // (e.g. a request evaluated right at a local-midnight boundary).
    case "SET_TRAINING_TIME": {
      return {
        ...state,
        dailyTrainingPlan: setTrainingTime(
          state.dailyTrainingPlan,
          state.workspaceId,
          state.clientId,
          state.dateIso,
          action.time24,
          new Date().toISOString()
        ),
      };
    }

    case "SET_TRAINING_UNSURE": {
      return {
        ...state,
        dailyTrainingPlan: setTrainingStatus(
          state.dailyTrainingPlan,
          state.workspaceId,
          state.clientId,
          state.dateIso,
          "unsure",
          new Date().toISOString()
        ),
      };
    }

    case "SET_TRAINING_REST_DAY": {
      return {
        ...state,
        dailyTrainingPlan: setTrainingStatus(
          state.dailyTrainingPlan,
          state.workspaceId,
          state.clientId,
          state.dateIso,
          "rest_day",
          new Date().toISOString()
        ),
      };
    }

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
        workspaceId: state.workspaceId,
        clientId: state.clientId,
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
        workspaceId: state.workspaceId,
        clientId: state.clientId,
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
          workspaceId: state.workspaceId,
          clientId: state.clientId,
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
      // A session with at least one completed working set is "ended early,"
      // never "skipped" — the client did train, just not to completion. See
      // Phase 3.1 §4. Every logged set and its RPE is preserved untouched
      // either way.
      const workingSetsCompleted = Object.values(state.workoutSession.exerciseLogs).reduce(
        (sum, log) => sum + log.loggedSets.filter((s) => !s.isWarmup && s.status === "completed").length,
        0
      );
      const endedEarly = workingSetsCompleted > 0;
      const nowIso = new Date().toISOString();
      const reviewRequest: ReviewRequest = {
        id: nextId("review"),
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        kind: "workout-skipped",
        createdAtIso: nowIso,
        summary: endedEarly
          ? "Today's push workout ended early after partial completion."
          : "Today's push workout was skipped.",
        resolved: false,
      };
      const summary = endedEarly
        ? buildWorkoutSummary(state.workoutSession, state.workoutSession.startedAtIso ?? nowIso, nowIso)
        : undefined;
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          status: endedEarly ? "ended-early" : "skipped",
          completedAtIso: endedEarly ? nowIso : state.workoutSession.completedAtIso,
          skipReason: action.reason,
          skipNote: action.note,
          summary,
        },
        reviewRequests: [...state.reviewRequests, reviewRequest],
      };
    }

    case "ADD_CHAT_MESSAGE": {
      // Stamp tenant attribution centrally rather than trusting each dispatch
      // site to set it — every message is attributed to the active
      // workspace/client no matter where ADD_CHAT_MESSAGE is dispatched from.
      const message: ChatMessage = { ...action.message, workspaceId: state.workspaceId, clientId: state.clientId };
      return { ...state, chatMessages: [...state.chatMessages, message] };
    }

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

  base.dailyTrainingPlan = setTrainingTime(
    null,
    base.workspaceId,
    base.clientId,
    base.dateIso,
    "09:00",
    now
  );

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
    workspaceId: base.workspaceId,
    clientId: base.clientId,
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
      workspaceId: base.workspaceId,
      clientId: base.clientId,
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
      workspaceId: base.workspaceId,
      clientId: base.clientId,
      kind: "pain-report",
      createdAtIso: now,
      summary: "Pain reported: right shoulder during Incline Dumbbell Press.",
      resolved: false,
    },
    {
      id: nextId("review"),
      workspaceId: base.workspaceId,
      clientId: base.clientId,
      kind: "rpe-anomaly",
      createdAtIso: now,
      summary: "Today's push workout has RPE values worth a second look.",
      resolved: false,
    },
  ];

  return base;
}
