import { MEAL_OPTIONS, NUTRITION_TARGETS, PUSH_WORKOUT } from "./mock-data.ts";
import { buildWorkoutSummary } from "./workout-analysis.ts";
import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID, resolveAssignedCoachId } from "./tenancy/seed.ts";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "./tenancy/types";
import { setTrainingStatus, setTrainingTime } from "./planning/training-plan.ts";
import type { DailyTrainingPlan } from "./planning/types";
import { buildDefaultProgramEnrollmentFor, buildDemoDefaultProgramEnrollment } from "./scheduling/enrollment.ts";
import { resolveClientLocalDateIso } from "./shared/local-date.ts";
import type { CheckInScheduleConfig, ProgramEnrollment } from "./scheduling/types";
import {
  advanceAfterExerciseResolved,
  buildInitialFlowState,
  deferCurrentExercise,
  firstUnresolvedWorkingSetNumber,
  isExerciseResolved,
} from "./workout/session-flow.ts";
import { resolveExerciseWarmupConfig, resolveSessionWarmupConfig } from "./workout/warmup.ts";
import { classifyPainSeverity } from "./workout/pain-policy.ts";
import { findDuplicateReviewRequest, severityForKind } from "./coach/review-support.ts";
import type {
  CardioLog,
  ChatMessage,
  ClientAssignedProgram,
  ExerciseLog,
  LoggedSet,
  MacroValues,
  MealEstimateConfidence,
  MealEstimateItem,
  MealPeriod,
  MealSelection,
  MorningWeightLog,
  NutritionTargets,
  PainInterruption,
  PainReport,
  PainSymptomQuality,
  ReviewRequest,
  ReviewRequestKind,
  RpeValue,
  SkipReason,
  WarmupOutcome,
  WorkoutSession,
  WorkoutSessionEvent,
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
  version: 12;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  /** This client's assigned coach, resolved ONCE when this state is first
   * created and carried forward from then on — never re-derived via
   * lib/tenancy/seed.ts's resolveAssignedCoachId, which only knows the
   * compile-time seed roster and throws for a coach-created client (see
   * lib/coach/repository.ts's module doc). Every reducer case that stamps
   * assignedCoachId onto a new ChatMessage/ReviewRequest reads this field
   * directly instead. */
  primaryCoachId: CoachProfileId;
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
  /** The coach's optional check-in assignment for this client — null means
   * no coach has assigned an active check-in, and the Progress page must
   * render no check-in card at all (see lib/progress/build-dashboard.ts).
   * This is the minimal client-side state boundary for the future
   * coach-controlled check-in system: a coach-facing assignment UI doesn't
   * exist yet, so this only ever stays null for the demo client until
   * that's built — never auto-populated with a default weekly schedule the
   * way it used to be. */
  checkInSchedule: CheckInScheduleConfig | null;
  /** Phase 5.0B — this client's own coach-controlled daily targets. OPTIM
   * never derives or silently adjusts these; they only ever change through
   * an explicit coach action (see lib/coach/setup.ts's applyCoachSetup).
   * Defaults to the same NUTRITION_TARGETS every client has always used
   * (lib/mock-data.ts) so the seeded demo client's behavior is unchanged —
   * a newly coach-activated client gets their own real values written here
   * instead by the coach setup flow. */
  nutritionTargets: NutritionTargets;
  /** Phase 5.2 — this client's own independent training-protocol copy,
   * created directly by the coach or assigned from one of their saved
   * templates (see lib/coach/training.ts). Null/undefined means no coach
   * has assigned one yet — resolveWorkoutAvailabilityForDay (lib/mock-data.ts)
   * falls back to the global demo catalog exactly as it always has, so the
   * seeded demo client is completely unaffected by this field's addition. */
  assignedProgram?: ClientAssignedProgram;
}

/** Not-started per-exercise warm-up outcomes for every exercise in a
 * workout — the shared starting point for both a fresh session and the
 * v5->v6 migration's honest reconstruction. */
function initialExerciseWarmups(): Record<string, WarmupOutcome> {
  const warmups: Record<string, WarmupOutcome> = {};
  for (const exercise of PUSH_WORKOUT.exercises) {
    warmups[exercise.id] = { status: "not-started" };
  }
  return warmups;
}

export function createInitialWorkoutSession(
  workspaceId: WorkspaceId = DEMO_WORKSPACE_ID,
  clientId: ClientProfileId = DEMO_CLIENT_ID
): WorkoutSession {
  const exerciseLogs: WorkoutSession["exerciseLogs"] = {};
  for (const exercise of PUSH_WORKOUT.exercises) {
    exerciseLogs[exercise.id] = {
      exerciseId: exercise.id,
      status: "not-started",
      loggedSets: [],
    };
  }
  return {
    workspaceId,
    clientId,
    workoutId: PUSH_WORKOUT.id,
    status: "not-started",
    exerciseLogs,
    painReports: [],
    phase: "session-warmup",
    currentExerciseId: null,
    exerciseQueue: [],
    actualExerciseOrder: [],
    deferredExerciseIds: [],
    lastResolvedExerciseId: null,
    currentSetNumber: null,
    sessionWarmup: { status: "not-started" },
    exerciseWarmups: initialExerciseWarmups(),
    events: [],
    activePainInterruption: null,
  };
}

export interface CreateInitialStateOptions {
  /** Overrides the identity a fresh state is stamped with — used to give a
   * coach-created client their OWN independent state (see
   * lib/tenancy/client-state-store.ts) rather than the demo client's.
   * Defaults preserve every existing call site's exact prior behavior. */
  workspaceId?: WorkspaceId;
  clientId?: ClientProfileId;
  /** This client's assigned coach — required for any clientId outside the
   * compile-time seed roster (resolveAssignedCoachId throws for those; see
   * AppState.primaryCoachId's own doc). Every caller creating state for a
   * coach-created client (lib/tenancy/client-state-store.ts,
   * lib/coach/setup.ts) already has the real ClientProfile in hand and
   * passes its primaryCoachId here. */
  primaryCoachId?: CoachProfileId;
}

export function createInitialState(options: CreateInitialStateOptions = {}): AppState {
  const workspaceId = options.workspaceId ?? DEMO_WORKSPACE_ID;
  const clientId = options.clientId ?? DEMO_CLIENT_ID;
  const primaryCoachId = options.primaryCoachId ?? resolveAssignedCoachId(clientId);
  // Phase 4.1 corrective — dateIso and programEnrollment are derived from
  // the exact same instant, through the same client-local IANA-timezone
  // resolver (lib/shared/local-date.ts), so they can never diverge into two
  // different "today"s — see the module doc on maintaining one
  // authoritative effective-date source.
  const now = new Date();
  const programEnrollment =
    clientId === DEMO_CLIENT_ID
      ? buildDemoDefaultProgramEnrollment(now)
      : buildDefaultProgramEnrollmentFor(workspaceId, clientId, now);
  return {
    version: 12,
    workspaceId,
    clientId,
    primaryCoachId,
    dateIso: resolveClientLocalDateIso(now, programEnrollment.timeZone),
    morningWeight: { weightLb: null, skipped: false },
    meals: {},
    cardio: { status: "not-started", durationMin: 0 },
    dailyTrainingPlan: null,
    workoutSession: createInitialWorkoutSession(workspaceId, clientId),
    chatMessages: [],
    reviewRequests: [],
    programEnrollment,
    // No check-in is ever auto-assigned — see the field's doc on AppState.
    checkInSchedule: null,
    nutritionTargets: NUTRITION_TARGETS,
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
  /** Confirmed result of OPTIM's meal-photo estimator (see
   * lib/nutrition/vision-estimator.ts) — dispatched only once the client has
   * reviewed and explicitly confirmed the estimate, never from the raw
   * analysis result itself. `macros` is the client-confirmed total (the sum
   * of `items` at confirmation time), captured directly rather than
   * recomputed later so an item-editing bug elsewhere can never silently
   * change what was actually confirmed. */
  | {
      type: "LOG_PHOTO_MEAL";
      period: MealPeriod;
      items: MealEstimateItem[];
      macros: MacroValues;
      confidence: MealEstimateConfidence;
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
      /** True (the default, low-friction path) when the client confirmed
       * this matched the prescription; false only when "Performed
       * differently" was explicitly selected. Omitted (undefined) for a
       * client-added extra set with no prescription to compare against. */
      performedAsPrescribed?: boolean;
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
  | { type: "SKIP_EXERCISE"; exerciseId: string; reason: SkipReason; note?: string }
  /** "Do later" — Phase 4.4B-2 §I. Only ever valid for the current exercise;
   * moves it to the back of the queue rather than resolving it. */
  | { type: "DEFER_EXERCISE"; exerciseId: string }
  | {
      type: "REPORT_PAIN";
      exerciseId?: string;
      location: string;
      ratingZeroToTen: number;
      onset: string;
      causedByMovement: string;
      continuedAfterSet: boolean;
      affectsOutsideGym: boolean;
      symptomQuality: PainSymptomQuality;
      note?: string;
    }
  /** Phase 4.4B-2.1 — mild/resume-eligible path only: the client has
   * explicitly confirmed the discomfort fully resolved. Does not itself
   * resume anything — "Continue this exercise" only becomes available
   * after this, and RESUME_AFTER_PAIN is the action that actually leaves
   * the pain-review phase. */
  | { type: "CONFIRM_PAIN_RESOLVED" }
  /** Leaves the pain-review phase back into the same set that triggered
   * the interruption — only valid once the active interruption is
   * resume-eligible AND confirmedResolved is true (the reducer enforces
   * this; the UI only ever offers the action once both are true). */
  | { type: "RESUME_AFTER_PAIN" }
  /** Phase 4.4B-2.2 — "This exercise feels unaffected," dispatched from the
   * exercise-pain-check gate for an exercise OTHER than the one an active
   * pain report was made on. Only valid for the current exercise, and never
   * for the interruption's own exerciseId (that exercise has its own
   * stricter block/resume-eligible path — see lib/workout/pain-policy.ts).
   * Records both the confirmation (scoped to this exact painReportId) and a
   * telemetry event so a coach can see it happened — never claims the
   * exercise is safe, just that the client made the call. */
  | { type: "CONFIRM_EXERCISE_UNAFFECTED"; exerciseId: string }
  /** A client-specific technique concern, distinct from a routine
   * educational question OPTIM answers itself — see components/workout/live/
   * need-help-sheet.tsx. */
  | { type: "FLAG_TECHNIQUE_QUESTION"; exerciseName: string; context?: string }
  | { type: "CONFIRM_SESSION_WARMUP" }
  | { type: "SKIP_SESSION_WARMUP"; reason: SkipReason; note?: string }
  /** exercise-intro -> exercise-warmup (when configured) or set-ready. */
  | { type: "BEGIN_EXERCISE" }
  /** Confirms one more configured warm-up step (or the whole thing, for a
   * single-confirmation instruction) for the current exercise. */
  | { type: "ADVANCE_EXERCISE_WARMUP" }
  | { type: "SKIP_EXERCISE_WARMUP"; reason: SkipReason; note?: string }
  /** set-ready -> set-logging. */
  | { type: "BEGIN_SET_LOGGING" }
  /** set-feedback -> next set-ready, or exercise-transition/session-summary
   * once the current exercise is resolved — decided from canonical state. */
  | { type: "CONTINUE_TO_NEXT_SET" }
  /** exercise-transition -> exercise-intro for the new current exercise. */
  | { type: "ENTER_EXERCISE_INTRO" }
  | { type: "WORKOUT_ROUTE_ENTERED" }
  | { type: "WORKOUT_ROUTE_LEFT" }
  | { type: "COMPLETE_WORKOUT"; summary: WorkoutSummary }
  | { type: "SKIP_WORKOUT"; reason: SkipReason; note?: string }
  | { type: "ADD_CHAT_MESSAGE"; message: Omit<ChatMessage, "workspaceId" | "clientId" | "assignedCoachId"> }
  /** A Chat-originated escalation (pain/injury, an exercise substitution, or
   * a broader program-change request) that must go to the assigned coach —
   * OPTIM itself never approves or invents these. `sourceMessageId` links
   * back to the client's own ChatMessage (and any attachments on it) so a
   * future coach workspace never has to duplicate that content onto the
   * request itself. See lib/chat/assistant.ts for what routes here. */
  | { type: "CREATE_CHAT_REVIEW_REQUEST"; kind: ReviewRequestKind; summary: string; sourceMessageId?: string }
  | { type: "RESET_TODAY" }
  | { type: "LOAD_PRESET"; preset: "completed-day" | "awaiting-review" };

function withMealMacros(
  meals: AppState["meals"],
  period: MealPeriod,
  selection: MealSelection
): AppState["meals"] {
  return { ...meals, [period]: selection };
}

/** Resolves a working-set outcome into the exercise's log, auto-completing
 * the exercise the moment it's genuinely resolved — the one place LOG_SET
 * and SKIP_SET share this rule so they can never disagree. */
function withResolvedLogStatus(exerciseId: string, updatedLog: ExerciseLog): ExerciseLog {
  const exercise = PUSH_WORKOUT.exercises.find((e) => e.id === exerciseId);
  const resolved = exercise ? isExerciseResolved(exercise, updatedLog) : false;
  return { ...updatedLog, status: resolved ? "completed" : "in-progress" };
}

/** Phase 4.4B-2.1/4.4B-2.2 — the "normal flow" workout actions that must be
 * suppressed while a pain safety concern requires resolution: either the
 * pain-review screen itself is active, or the current exercise is a
 * different one from an active, unresolved report and hasn't yet been
 * explicitly confirmed unaffected (see currentExerciseRequiresPainCheck).
 * Without this guard, a component could still dispatch e.g.
 * CONTINUE_TO_NEXT_SET or LOG_SET directly and silently bypass either gate —
 * the UI prevents this by rendering PainReviewPanel/ExercisePainCheckPanel
 * instead of the normal panels, but the reducer is the source of truth and
 * must enforce it independently of any particular screen. ENTER_EXERCISE_INTRO
 * is deliberately NOT in this set — it's the one action that must still run
 * while a concern is active, since its own logic is what routes to
 * pain-review/exercise-pain-check/exercise-intro correctly (see its case
 * below); blocking it outright would leave the client stuck on the
 * exercise-transition screen with no way to ever reach the gate. Actions not
 * in this set (meals, cardio, chat, other unrelated state) are completely
 * unaffected. */
const PAIN_BLOCKED_ACTIONS = new Set<Action["type"]>([
  "LOG_SET",
  "SKIP_SET",
  "BEGIN_SET_LOGGING",
  "CONTINUE_TO_NEXT_SET",
  "BEGIN_EXERCISE",
  "ADVANCE_EXERCISE_WARMUP",
  "SKIP_EXERCISE_WARMUP",
  "CONFIRM_SESSION_WARMUP",
  "SKIP_SESSION_WARMUP",
]);

/** True once there's an active pain report AND the current exercise is a
 * DIFFERENT one that hasn't yet been explicitly confirmed unaffected for
 * THIS exact report. False for the report's own originating exercise (that
 * one is governed by phase "pain-review" and severity instead — see
 * lib/workout/pain-policy.ts) and false once confirmed. */
function currentExerciseRequiresPainCheck(session: WorkoutSession): boolean {
  const interruption = session.activePainInterruption;
  if (!interruption) return false;
  const exerciseId = session.currentExerciseId;
  if (!exerciseId || exerciseId === interruption.exerciseId) return false;
  return !(interruption.confirmedUnaffectedExerciseIds ?? []).includes(exerciseId);
}

export function reducer(state: AppState, action: Action): AppState {
  const painGateActive = state.workoutSession.phase === "pain-review" || currentExerciseRequiresPainCheck(state.workoutSession);
  if (painGateActive && PAIN_BLOCKED_ACTIONS.has(action.type)) {
    return state;
  }
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

    // A single MealSelection object per period (never an array/log list) is
    // what makes "confirming or editing updates totals exactly once" and
    // "editing replaces rather than adds a second contribution" automatic
    // here and for SELECT_MEAL_OPTION/SET_MANUAL_MEAL above — dispatching
    // this again for the same period always overwrites the prior entry via
    // withMealMacros, never appends.
    case "LOG_PHOTO_MEAL": {
      const itemNames = action.items.map((i) => i.name.trim()).filter(Boolean);
      const selection: MealSelection = {
        period: action.period,
        source: "photo-estimate",
        manualName: itemNames.length > 0 ? itemNames.join(", ") : undefined,
        macros: action.macros,
        isEstimate: true,
        completedAtIso: new Date().toISOString(),
        photoEstimate: { items: action.items, confidence: action.confidence },
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

    // Phase 4.4B-2 — a genuinely fresh start (status was "not-started")
    // initializes the whole guided-flow shape (queue, phase, warm-up
    // outcomes, the "started" event). Re-dispatching on an already
    // in-progress session (shouldn't happen through the normal "Continue
    // session" path, which only routes without redispatching) is a no-op
    // beyond the idempotent status write, so it can never clobber real
    // progress.
    case "START_WORKOUT": {
      if (state.workoutSession.status !== "not-started") {
        return { ...state, workoutSession: { ...state.workoutSession, status: "in-progress" } };
      }
      const nowIso = new Date().toISOString();
      const initialFlow = buildInitialFlowState(PUSH_WORKOUT);
      const sessionWarmupConfig = resolveSessionWarmupConfig(PUSH_WORKOUT);
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          status: "in-progress",
          startedAtIso: nowIso,
          currentExerciseId: initialFlow.currentExerciseId,
          exerciseQueue: initialFlow.exerciseQueue,
          actualExerciseOrder: initialFlow.actualExerciseOrder,
          deferredExerciseIds: [],
          lastResolvedExerciseId: null,
          currentSetNumber: null,
          restStartedAtIso: undefined,
          phase: sessionWarmupConfig.mode === "confirmation" ? "session-warmup" : "exercise-intro",
          sessionWarmup: { status: "not-started" },
          exerciseWarmups: initialExerciseWarmups(),
          events: [...state.workoutSession.events, { type: "started", atIso: nowIso } satisfies WorkoutSessionEvent],
        },
      };
    }

    case "LOG_SET": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const existingIndex = log.loggedSets.findIndex(
        (s) => s.setNumber === action.setNumber && s.isWarmup === action.isWarmup
      );
      const nowIso = new Date().toISOString();
      // Phase 4.4B-2.1 correction — no longer computed/stored as
      // `actualRestSeconds` (that name claimed a physiological-rest
      // measurement the interaction can't honestly produce — see the
      // deprecation note on LoggedSet.actualRestSeconds). The same raw
      // interval is still captured, honestly named as a log/event interval
      // for diagnostics only, never presented as rest.
      const restStartedAtIso = state.workoutSession.restStartedAtIso;
      const logIntervalSeconds =
        !action.isWarmup && restStartedAtIso
          ? Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(restStartedAtIso).getTime()) / 1000))
          : undefined;
      const newSet: LoggedSet = {
        id: existingIndex >= 0 ? log.loggedSets[existingIndex].id : nextId("set"),
        exerciseId: action.exerciseId,
        setNumber: action.setNumber,
        isWarmup: action.isWarmup,
        weightLb: action.weightLb,
        reps: action.reps,
        rpe: action.rpe,
        note: action.note,
        completedAtIso: nowIso,
        status: "completed",
        performedAsPrescribed: action.isWarmup ? undefined : action.performedAsPrescribed,
        logIntervalSeconds,
      };
      const loggedSets =
        existingIndex >= 0
          ? log.loggedSets.map((s, i) => (i === existingIndex ? newSet : s))
          : [...log.loggedSets, newSet];
      const updatedLog = withResolvedLogStatus(action.exerciseId, { ...log, loggedSets });
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
          restStartedAtIso: action.isWarmup ? state.workoutSession.restStartedAtIso : nowIso,
          phase: action.isWarmup ? state.workoutSession.phase : "set-feedback",
        },
      };
    }

    case "REMOVE_LOGGED_SET": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const loggedSets = log.loggedSets.filter((s) => s.id !== action.setId);
      const updatedLog =
        log.status === "skipped" ? { ...log, loggedSets } : withResolvedLogStatus(action.exerciseId, { ...log, loggedSets });
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
      const nowIso = new Date().toISOString();
      const skippedSet: LoggedSet = {
        id: nextId("set"),
        exerciseId: action.exerciseId,
        setNumber: action.setNumber,
        isWarmup: action.isWarmup,
        weightLb: null,
        reps: null,
        rpe: null,
        status: "skipped",
        skipReason: action.reason,
        note: action.note,
      };
      const updatedLog = withResolvedLogStatus(action.exerciseId, {
        ...log,
        loggedSets: [...log.loggedSets, skippedSet],
      });
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
          restStartedAtIso: action.isWarmup ? state.workoutSession.restStartedAtIso : nowIso,
          phase: action.isWarmup ? state.workoutSession.phase : "set-feedback",
        },
      };
    }

    case "SKIP_EXERCISE": {
      const log = state.workoutSession.exerciseLogs[action.exerciseId];
      if (!log) return state;
      const updatedLog: ExerciseLog = { ...log, status: "skipped", skipReason: action.reason, skipNote: action.note };
      // Phase 4.4B-2.2 correction — skipping the exercise resolves THAT
      // exercise, but never quietly resolves the pain report itself: the
      // discomfort that caused the report is still real and still
      // unaddressed. activePainInterruption is deliberately left untouched
      // here (previously cleared whenever it matched this exercise) so it
      // keeps gating every subsequent exercise via
      // currentExerciseRequiresPainCheck/the exercise-pain-check phase,
      // until it's genuinely resolved (RESUME_AFTER_PAIN) or the session
      // ends (COMPLETE_WORKOUT/SKIP_WORKOUT).
      const sessionWithLog: WorkoutSession = {
        ...state.workoutSession,
        exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
      };
      if (state.workoutSession.currentExerciseId !== action.exerciseId) {
        return { ...state, workoutSession: sessionWithLog };
      }
      const advance = advanceAfterExerciseResolved(sessionWithLog);
      return { ...state, workoutSession: { ...sessionWithLog, ...advance } };
    }

    case "DEFER_EXERCISE": {
      if (state.workoutSession.currentExerciseId !== action.exerciseId) return state;
      const advance = deferCurrentExercise(state.workoutSession);
      // Phase 4.4B-2.2 correction — "Continue with unaffected exercises"
      // moves this exercise to later, but must never be read as "the pain
      // condition is resolved" or "every remaining exercise is unaffected."
      // activePainInterruption is left untouched (see the matching note on
      // SKIP_EXERCISE above) so it keeps gating whatever comes next.
      return { ...state, workoutSession: { ...state.workoutSession, ...advance } };
    }

    // Phase 4.4B-2.1 — pain/injury feedback is an always-escalate category:
    // every submitted report interrupts blind progression. classifyPainSeverity
    // is the one deterministic policy function deciding whether the same
    // exercise can ever become resume-eligible (and even then, only after an
    // explicit "fully resolved" confirmation — see CONFIRM_PAIN_RESOLVED/
    // RESUME_AFTER_PAIN below) or must block another set outright. This never
    // diagnoses, never independently adjusts programming — it only decides
    // which safe next actions the pain-review surface offers.
    case "REPORT_PAIN": {
      const nowIso = new Date().toISOString();
      const exerciseId = action.exerciseId ?? state.workoutSession.currentExerciseId ?? undefined;
      const report: PainReport = {
        id: nextId("pain"),
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        createdAtIso: nowIso,
        exerciseId,
        location: action.location,
        ratingZeroToTen: action.ratingZeroToTen,
        onset: action.onset,
        causedByMovement: action.causedByMovement,
        continuedAfterSet: action.continuedAfterSet,
        affectsOutsideGym: action.affectsOutsideGym,
        symptomQuality: action.symptomQuality,
        note: action.note,
        requiresCoachReview: true,
      };
      const painReviewCandidate = {
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        assignedCoachId: state.primaryCoachId,
        kind: "pain-report" as const,
        sourceEventId: report.id,
      };
      const existingPainReview = findDuplicateReviewRequest(state.reviewRequests, painReviewCandidate);
      const reviewRequest: ReviewRequest | null = existingPainReview
        ? null
        : {
            id: nextId("review"),
            ...painReviewCandidate,
            severity: severityForKind("pain-report"),
            createdAtIso: report.createdAtIso,
            updatedAtIso: report.createdAtIso,
            summary: `Pain reported: ${action.location} during today's workout.`,
            status: "needs_review",
            resolved: false,
          };

      const interruption: PainInterruption | undefined = exerciseId
        ? {
            painReportId: report.id,
            exerciseId,
            setNumber: state.workoutSession.currentSetNumber,
            severity: classifyPainSeverity({
              ratingZeroToTen: action.ratingZeroToTen,
              continuedAfterSet: action.continuedAfterSet,
              affectsOutsideGym: action.affectsOutsideGym,
              symptomQuality: action.symptomQuality,
            }),
            confirmedResolved: false,
            // A brand-new report always starts with an empty confirmation
            // list, even if a PRIOR report had exercises confirmed
            // unaffected — a new report is new information, and any earlier
            // assumption must not carry over (Phase 4.4B-2.2).
            confirmedUnaffectedExerciseIds: [],
          }
        : undefined;

      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          painReports: [...state.workoutSession.painReports, report],
          // No exerciseId at all (shouldn't happen through the real live
          // flow, which always knows the current exercise) — record the
          // report and flag it for review, but there's nothing to
          // interrupt, so phase is left untouched rather than entering a
          // safety state with no subject.
          ...(interruption ? { phase: "pain-review" as const, activePainInterruption: interruption } : {}),
        },
        reviewRequests: reviewRequest ? [...state.reviewRequests, reviewRequest] : state.reviewRequests,
      };
    }

    case "CONFIRM_PAIN_RESOLVED": {
      const interruption = state.workoutSession.activePainInterruption;
      if (!interruption || interruption.severity !== "resume-eligible") return state;
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          activePainInterruption: { ...interruption, confirmedResolved: true },
        },
      };
    }

    case "RESUME_AFTER_PAIN": {
      const interruption = state.workoutSession.activePainInterruption;
      if (!interruption || interruption.severity !== "resume-eligible" || !interruption.confirmedResolved) return state;
      if (state.workoutSession.currentExerciseId !== interruption.exerciseId) return state;
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          activePainInterruption: null,
          currentSetNumber: interruption.setNumber,
          phase: "set-ready",
        },
      };
    }

    case "FLAG_TECHNIQUE_QUESTION": {
      const nowIso = new Date().toISOString();
      const reviewRequest: ReviewRequest = {
        id: nextId("review"),
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        assignedCoachId: state.primaryCoachId,
        kind: "technique-flag",
        severity: severityForKind("technique-flag"),
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        summary: action.context
          ? `Technique question on ${action.exerciseName}: ${action.context}`
          : `Technique question flagged for ${action.exerciseName}.`,
        status: "needs_review",
        resolved: false,
      };
      return { ...state, reviewRequests: [...state.reviewRequests, reviewRequest] };
    }

    case "CONFIRM_SESSION_WARMUP": {
      const nowIso = new Date().toISOString();
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          sessionWarmup: { status: "completed", completedAtIso: nowIso },
          phase: "exercise-intro",
        },
      };
    }

    case "SKIP_SESSION_WARMUP": {
      const nowIso = new Date().toISOString();
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          sessionWarmup: { status: "skipped", skipReason: action.reason, skipNote: action.note, completedAtIso: nowIso },
          phase: "exercise-intro",
        },
      };
    }

    case "BEGIN_EXERCISE": {
      const exerciseId = state.workoutSession.currentExerciseId;
      const exercise = exerciseId ? PUSH_WORKOUT.exercises.find((e) => e.id === exerciseId) : undefined;
      if (!exerciseId || !exercise) return state;
      const config = resolveExerciseWarmupConfig(exercise);
      const outcome = state.workoutSession.exerciseWarmups[exerciseId];
      if (config.mode !== "none" && outcome?.status === "not-started") {
        return { ...state, workoutSession: { ...state.workoutSession, phase: "exercise-warmup" } };
      }
      const firstSet = firstUnresolvedWorkingSetNumber(exercise, state.workoutSession.exerciseLogs[exerciseId]);
      return { ...state, workoutSession: { ...state.workoutSession, phase: "set-ready", currentSetNumber: firstSet } };
    }

    case "ADVANCE_EXERCISE_WARMUP": {
      const exerciseId = state.workoutSession.currentExerciseId;
      const exercise = exerciseId ? PUSH_WORKOUT.exercises.find((e) => e.id === exerciseId) : undefined;
      if (!exerciseId || !exercise) return state;
      const config = resolveExerciseWarmupConfig(exercise);
      const current: WarmupOutcome = state.workoutSession.exerciseWarmups[exerciseId] ?? { status: "not-started" };
      const stepsCompleted = (current.stepsCompleted ?? 0) + 1;
      const totalSteps = config.mode === "stepped" ? config.steps.length : 1;
      const nowIso = new Date().toISOString();
      if (stepsCompleted >= totalSteps) {
        const firstSet = firstUnresolvedWorkingSetNumber(exercise, state.workoutSession.exerciseLogs[exerciseId]);
        return {
          ...state,
          workoutSession: {
            ...state.workoutSession,
            exerciseWarmups: {
              ...state.workoutSession.exerciseWarmups,
              [exerciseId]: { status: "completed", completedAtIso: nowIso, stepsCompleted },
            },
            phase: "set-ready",
            currentSetNumber: firstSet,
          },
        };
      }
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseWarmups: { ...state.workoutSession.exerciseWarmups, [exerciseId]: { ...current, stepsCompleted } },
        },
      };
    }

    case "SKIP_EXERCISE_WARMUP": {
      const exerciseId = state.workoutSession.currentExerciseId;
      const exercise = exerciseId ? PUSH_WORKOUT.exercises.find((e) => e.id === exerciseId) : undefined;
      if (!exerciseId) return state;
      const nowIso = new Date().toISOString();
      const firstSet = exercise
        ? firstUnresolvedWorkingSetNumber(exercise, state.workoutSession.exerciseLogs[exerciseId])
        : null;
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseWarmups: {
            ...state.workoutSession.exerciseWarmups,
            [exerciseId]: { status: "skipped", skipReason: action.reason, skipNote: action.note, completedAtIso: nowIso },
          },
          phase: "set-ready",
          currentSetNumber: firstSet,
        },
      };
    }

    case "BEGIN_SET_LOGGING":
      return { ...state, workoutSession: { ...state.workoutSession, phase: "set-logging" } };

    case "CONTINUE_TO_NEXT_SET": {
      const exerciseId = state.workoutSession.currentExerciseId;
      const exercise = exerciseId ? PUSH_WORKOUT.exercises.find((e) => e.id === exerciseId) : undefined;
      const log = exerciseId ? state.workoutSession.exerciseLogs[exerciseId] : undefined;
      if (!exerciseId || !exercise || !log) return state;
      if (isExerciseResolved(exercise, log)) {
        const advance = advanceAfterExerciseResolved(state.workoutSession);
        return { ...state, workoutSession: { ...state.workoutSession, ...advance } };
      }
      const nextSetNumber = firstUnresolvedWorkingSetNumber(exercise, log);
      return { ...state, workoutSession: { ...state.workoutSession, currentSetNumber: nextSetNumber, phase: "set-ready" } };
    }

    // Phase 4.4B-2.2 — the one place that decides which of the three
    // possible next phases a new current exercise actually needs. Never
    // blocked by PAIN_BLOCKED_ACTIONS (see that set's doc comment) — this
    // case's own logic IS the safety routing:
    //  - the exercise a report was made on re-enters "pain-review" (its
    //    stricter block/resume-eligible path — see lib/workout/pain-policy.ts)
    //  - a different, not-yet-confirmed exercise while a report is still
    //    active goes to "exercise-pain-check" instead of straight to intro
    //  - otherwise, the normal "exercise-intro" everyone already knows
    case "ENTER_EXERCISE_INTRO": {
      const exerciseId = state.workoutSession.currentExerciseId;
      const interruption = state.workoutSession.activePainInterruption;
      if (interruption && exerciseId === interruption.exerciseId) {
        return { ...state, workoutSession: { ...state.workoutSession, phase: "pain-review" } };
      }
      if (interruption && exerciseId && !(interruption.confirmedUnaffectedExerciseIds ?? []).includes(exerciseId)) {
        return { ...state, workoutSession: { ...state.workoutSession, phase: "exercise-pain-check" } };
      }
      return { ...state, workoutSession: { ...state.workoutSession, phase: "exercise-intro" } };
    }

    // Phase 4.4B-2.2 — "This exercise feels unaffected," the one way past
    // the exercise-pain-check gate for an exercise other than the report's
    // own. Never available for the report's originating exercise (that one
    // can only be resolved through pain-review's own severity-gated paths).
    // Records the confirmation (scoped to this exact painReportId, so a
    // later, different report starts the list over) and a telemetry event
    // on the same append-only session event log everything else already
    // uses, so a coach reviewing the session can see this happened.
    case "CONFIRM_EXERCISE_UNAFFECTED": {
      const interruption = state.workoutSession.activePainInterruption;
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!interruption || !exerciseId || exerciseId !== action.exerciseId || exerciseId === interruption.exerciseId) {
        return state;
      }
      const already = interruption.confirmedUnaffectedExerciseIds ?? [];
      if (already.includes(exerciseId)) {
        return { ...state, workoutSession: { ...state.workoutSession, phase: "exercise-intro" } };
      }
      const nowIso = new Date().toISOString();
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          activePainInterruption: { ...interruption, confirmedUnaffectedExerciseIds: [...already, exerciseId] },
          phase: "exercise-intro",
          events: [
            ...state.workoutSession.events,
            { type: "exercise-continued-despite-pain", atIso: nowIso, exerciseId, painReportId: interruption.painReportId },
          ],
        },
      };
    }

    case "WORKOUT_ROUTE_ENTERED": {
      if (state.workoutSession.status !== "in-progress") return state;
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          events: [...state.workoutSession.events, { type: "route-entered", atIso: new Date().toISOString() }],
        },
      };
    }

    case "WORKOUT_ROUTE_LEFT": {
      if (state.workoutSession.status !== "in-progress") return state;
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          events: [...state.workoutSession.events, { type: "route-left", atIso: new Date().toISOString() }],
        },
      };
    }

    case "COMPLETE_WORKOUT": {
      // Defensive backstop: a workout can never be submitted as completed
      // with zero logged working sets, even if something dispatches this
      // action outside the normal gated UI flow.
      if (action.summary.workingSetsCompleted === 0) return state;
      const reviewRequests = [...state.reviewRequests];
      const completeWorkoutNowIso = new Date().toISOString();
      if (action.summary.needsReview) {
        // Describe the actual reason for the flag rather than a generic
        // claim — never say "RPE values" unless that's really why.
        const hasSkippedWork = action.summary.exercisesSkipped > 0 || action.summary.skippedSetsCount > 0;
        const kind: "workout-skipped" | "rpe-anomaly" = hasSkippedWork ? "workout-skipped" : "rpe-anomaly";
        const candidate = {
          workspaceId: state.workspaceId,
          clientId: state.clientId,
          assignedCoachId: state.primaryCoachId,
          kind,
          sourceEventId: `${state.workoutSession.workoutId}-${completeWorkoutNowIso.slice(0, 10)}`,
        };
        if (!findDuplicateReviewRequest(reviewRequests, candidate)) {
          reviewRequests.push({
            id: nextId("review"),
            ...candidate,
            severity: severityForKind(kind),
            createdAtIso: completeWorkoutNowIso,
            updatedAtIso: completeWorkoutNowIso,
            summary: hasSkippedWork
              ? "Today's push workout was submitted with skipped work."
              : "Today's push workout has RPE values worth a second look.",
            status: "needs_review",
            resolved: false,
          });
        }
      }
      const nowIso = completeWorkoutNowIso;
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          status: "completed",
          completedAtIso: nowIso,
          summary: action.summary,
          events: [...state.workoutSession.events, { type: "completed", atIso: nowIso }],
          // The session is over — an open safety interruption no longer
          // applies to anything actionable.
          activePainInterruption: null,
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
      const skipCandidate = {
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        assignedCoachId: state.primaryCoachId,
        kind: "workout-skipped" as const,
        sourceEventId: `${state.workoutSession.workoutId}-${nowIso.slice(0, 10)}`,
      };
      const existingSkipReview = findDuplicateReviewRequest(state.reviewRequests, skipCandidate);
      const reviewRequest: ReviewRequest | null = existingSkipReview
        ? null
        : {
            id: nextId("review"),
            ...skipCandidate,
            severity: severityForKind("workout-skipped"),
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
            summary: endedEarly
              ? "Today's push workout ended early after partial completion."
              : "Today's push workout was skipped.",
            status: "needs_review",
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
          events: [...state.workoutSession.events, { type: "completed", atIso: nowIso }],
          activePainInterruption: null,
        },
        reviewRequests: reviewRequest ? [...state.reviewRequests, reviewRequest] : state.reviewRequests,
      };
    }

    case "ADD_CHAT_MESSAGE": {
      // Stamp tenant attribution centrally rather than trusting each dispatch
      // site to set it — every message is attributed to the active
      // workspace/client/assigned-coach no matter where ADD_CHAT_MESSAGE is
      // dispatched from. assignedCoachId always comes from the real
      // client->coach assignment (see resolveAssignedCoachId) — never a
      // hardcoded coach.
      const message: ChatMessage = {
        ...action.message,
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        assignedCoachId: state.primaryCoachId,
      };
      return { ...state, chatMessages: [...state.chatMessages, message] };
    }

    case "CREATE_CHAT_REVIEW_REQUEST": {
      const chatReviewCandidate = {
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        assignedCoachId: state.primaryCoachId,
        kind: action.kind,
        sourceEventId: action.sourceMessageId,
      };
      if (findDuplicateReviewRequest(state.reviewRequests, chatReviewCandidate)) return state;
      const chatReviewNowIso = new Date().toISOString();
      const reviewRequest: ReviewRequest = {
        id: nextId("review"),
        ...chatReviewCandidate,
        sourceMessageId: action.sourceMessageId,
        severity: severityForKind(action.kind),
        createdAtIso: chatReviewNowIso,
        updatedAtIso: chatReviewNowIso,
        summary: action.summary,
        status: "needs_review",
        resolved: false,
      };
      return { ...state, reviewRequests: [...state.reviewRequests, reviewRequest] };
    }

    case "RESET_TODAY":
      // Preserves whichever client (and their real assigned coach) this
      // state already belongs to — a coach-created client's own "Reset
      // today" must never silently reassign their daily state to the
      // seeded demo client's identity, or throw trying to re-derive a
      // coach id lib/tenancy/seed.ts's resolver can't resolve for them.
      return createInitialState({ workspaceId: state.workspaceId, clientId: state.clientId, primaryCoachId: state.primaryCoachId });

    case "LOAD_PRESET":
      return action.preset === "completed-day"
        ? buildCompletedDayPreset(state.workspaceId, state.clientId, state.primaryCoachId)
        : buildAwaitingReviewPreset(state.workspaceId, state.clientId, state.primaryCoachId);

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Presets for testable states (prototype settings menu)
// ---------------------------------------------------------------------------

function buildCompletedDayPreset(
  workspaceId: WorkspaceId = DEMO_WORKSPACE_ID,
  clientId: ClientProfileId = DEMO_CLIENT_ID,
  primaryCoachId?: CoachProfileId
): AppState {
  const base = createInitialState({ workspaceId, clientId, primaryCoachId });
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
      performedAsPrescribed: set.isWarmup ? undefined : true,
    }));
    exerciseLogs[exercise.id] = { exerciseId: exercise.id, status: "completed", loggedSets };
  }

  const startedAtIso = new Date(Date.now() - 64 * 60_000).toISOString();
  const exerciseIds = PUSH_WORKOUT.exercises.map((e) => e.id);
  const completedExerciseWarmups: WorkoutSession["exerciseWarmups"] = {};
  for (const id of exerciseIds) {
    completedExerciseWarmups[id] = { status: "completed", completedAtIso: startedAtIso };
  }

  const sessionBeforeSummary: WorkoutSession = {
    workspaceId: base.workspaceId,
    clientId: base.clientId,
    workoutId: PUSH_WORKOUT.id,
    status: "in-progress",
    startedAtIso,
    exerciseLogs,
    painReports: [],
    phase: "session-summary",
    currentExerciseId: exerciseIds[exerciseIds.length - 1] ?? null,
    exerciseQueue: [],
    actualExerciseOrder: exerciseIds,
    deferredExerciseIds: [],
    lastResolvedExerciseId: null,
    currentSetNumber: null,
    sessionWarmup: { status: "completed", completedAtIso: startedAtIso },
    exerciseWarmups: completedExerciseWarmups,
    events: [
      { type: "started", atIso: startedAtIso },
      { type: "completed", atIso: now },
    ],
    activePainInterruption: null,
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

function buildAwaitingReviewPreset(
  workspaceId: WorkspaceId = DEMO_WORKSPACE_ID,
  clientId: ClientProfileId = DEMO_CLIENT_ID,
  primaryCoachId?: CoachProfileId
): AppState {
  const base = buildCompletedDayPreset(workspaceId, clientId, primaryCoachId);
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
      assignedCoachId: base.primaryCoachId,
      kind: "pain-report",
      severity: severityForKind("pain-report"),
      createdAtIso: now,
      updatedAtIso: now,
      summary: "Pain reported: right shoulder during Incline Dumbbell Press.",
      status: "needs_review",
      resolved: false,
    },
    {
      id: nextId("review"),
      workspaceId: base.workspaceId,
      clientId: base.clientId,
      assignedCoachId: base.primaryCoachId,
      kind: "rpe-anomaly",
      severity: severityForKind("rpe-anomaly"),
      createdAtIso: now,
      updatedAtIso: now,
      summary: "Today's push workout has RPE values worth a second look.",
      status: "needs_review",
      resolved: false,
    },
  ];

  return base;
}
