import { MEAL_OPTIONS, NUTRITION_TARGETS, PUSH_WORKOUT } from "./mock-data.ts";
import { buildWorkoutSummary } from "./workout-analysis.ts";
import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID, resolveAssignedCoachId } from "./tenancy/seed.ts";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "./tenancy/types";
import { setTrainingStatus, setTrainingTime } from "./planning/training-plan.ts";
import type { TrainingDaySnapshot, NutritionDaySnapshot } from "./history/types";
import type { DailyTrainingPlan } from "./planning/types";
import { buildDefaultProgramEnrollmentFor, buildDemoDefaultProgramEnrollment } from "./scheduling/enrollment.ts";
import { resolveClientLocalDateIso } from "./shared/local-date.ts";
import type { CheckInScheduleConfig, ProgramEnrollment } from "./scheduling/types";
import {
  advanceAfterExerciseResolved,
  buildInitialFlowState,
  deferCurrentExercise,
  findBlockById,
  findTrainingItemById,
  firstUnresolvedWorkingSetNumber,
  isCircuitBlock,
  isEmomBlock,
  isExerciseResolved,
} from "./workout/session-flow.ts";
import { resolveSessionWarmupConfigFromSession, resolveTrainingItemWarmupConfig } from "./workout/warmup.ts";
import { resolveScheduledWorkoutForStart } from "./workout/resolve-scheduled-workout.ts";
import { resolveScheduledSessionForStart } from "./workout/resolve-scheduled-session.ts";
import { classifyPainSeverity } from "./workout/pain-policy.ts";
import { legacyWorkoutToSession } from "./training/legacy-adapter.ts";
import { classifyContinuousCompletion, continuousPerformedAsPrescribed, type ContinuousActual } from "./workout/continuous.ts";
import { classifyIntervalActivityCompletion, intervalPerformedAsPrescribed, nextIntervalProgress } from "./workout/interval.ts";
import { circuitItemPerformedAsPrescribed, classifyCircuitItemCompletion, isTimedCircuit, isUnboundedRounds, nextCircuitPosition, totalCircuitRounds } from "./workout/circuit.ts";
import { classifyPowerItemCompletion, powerItemPerformedAsPrescribed, totalPowerSets } from "./workout/power.ts";
import { classifyMobilityItemCompletion, mobilityItemPerformedAsPrescribed, nextMobilityPosition, requiresBothSides, totalMobilityExposures } from "./workout/mobility.ts";
import {
  classifyEmomItemCompletion,
  currentEmomWindow,
  emomCadenceSeconds,
  emomItemForWindow,
  emomItemPerformedAsPrescribed,
  totalEmomWindows,
  totalWindowsAssignedToItem,
  windowsToAutoSkip,
} from "./workout/emom.ts";
import { MIXED_SESSION_DEMO } from "./training/demo-fixtures.ts";
import type { CircuitRoundActual, EmomWindowActual, ExecutionRecord, IntervalRoundActual, MobilitySetActual, PowerSetActual, Prescription, Session, UniversalTrainingProgramContent } from "./training/types";
import { findDuplicateReviewRequest, severityForKind } from "./coach/review-support.ts";
import { detectMilestoneEscalation, detectPatternEscalations } from "./coach/attention-escalation.ts";
import type { CoachMealPlanEntry } from "./coach/types.ts";
import type {
  AssignedNutritionPlan,
  CardioLog,
  ChatMessage,
  ClientAssignedProgram,
  CircuitExecutionProgress,
  EmomExecutionProgress,
  ExerciseLog,
  IntervalExecutionProgress,
  LoggedSet,
  MacroValues,
  MealEstimateConfidence,
  MealEstimateItem,
  MealIntent,
  MealPeriod,
  MealSelection,
  MobilityExecutionProgress,
  MorningWeightLog,
  NutritionTargets,
  PainInterruption,
  PainReport,
  PainSymptomQuality,
  PowerExecutionProgress,
  ReviewRequest,
  ReviewRequestKind,
  RpeValue,
  SkipReason,
  WarmupOutcome,
  Workout,
  WorkoutSession,
  WorkoutSessionEvent,
  WorkoutSessionPhase,
  WorkoutSummary,
} from "./types";

// The demo app only ever runs as this one client, in this one workspace —
// see lib/tenancy/seed.ts and lib/tenancy/context.ts for how a future
// multi-workspace app would resolve these per-session instead of as
// constants. Every new record the reducer creates is stamped with these so
// components never have to remember to attribute a record correctly.
const DEMO_WORKSPACE_ID: WorkspaceId = WORKSPACE_OPTIM_ID;
const DEMO_CLIENT_ID: ClientProfileId = CLIENT_PROFILE_DEMO.id;

/** Phase 5.4B — client-local-date tracking for the once-per-day entrance
 * sequence (spec §8). `lastSeenLocalDateIso` is deliberately a plain daily
 * field (not preserved config) — lib/history/rollover.ts's forward rollover
 * already resets every daily field to a fresh createInitialState() while
 * explicitly preserving only programEnrollment/nutritionTargets/
 * checkInSchedule, so a new calendar day naturally starts with this null
 * again with zero extra rollover code. */
export interface DailyEntranceState {
  lastSeenLocalDateIso: string | null;
}

export interface AppState {
  version: 15;
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
  /** Phase 6A — this Supabase-mode client's real active assignment, ALWAYS
   * in the universal grammar regardless of its origin schema (a
   * schemaVersion-1 legacy program is forward-converted; schemaVersion 2
   * passes through natively) — see lib/production/programs.ts's
   * getClientProgramContext. This is the canonical source START_WORKOUT
   * (below) resolves live sessions from for a real Supabase client; it
   * takes priority over the legacy assignedProgram/resolveScheduledWorkoutForStart
   * path whenever present, so a program containing continuous or mixed
   * content — which assignedProgram above can never represent — still
   * executes correctly. Always undefined in demo mode. */
  assignedUniversalProgram?: UniversalTrainingProgramContent;
  /** Phase 5.5A — this client's real, complete, coach-approved nutrition
   * prescription (see lib/coach/nutrition-directions.ts). Kept in sync
   * with `nutritionTargets` above (same numbers, richer detail) — never
   * the source of truth on its own, so every existing nutrition screen
   * that only ever reads `nutritionTargets` keeps working unmodified.
   * Undefined for a client with no OPTIM-generated plan yet. */
  assignedNutritionPlan?: AssignedNutritionPlan;
  /** Gate 3C — this client's coach-authored per-meal-period overlay on top
   * of the shared MEAL_OPTIONS catalog and BOUNDED_SUBSTITUTION_RULES (see
   * lib/coach/types.ts's CoachMealPlanEntry for the full contract). Written
   * directly by a coach through lib/coach/nutrition-authoring.ts, never
   * through this reducer — exactly the same "written from outside this
   * client's own reducer" pattern lib/coach/review-lifecycle.ts already
   * uses. A period absent here has no coach override yet; every reader
   * falls back to Gate 3B's original behavior. */
  coachMealPlan: Partial<Record<MealPeriod, CoachMealPlanEntry>>;
  /** Phase 5.4B — see DailyEntranceState's doc. */
  dailyEntrance: DailyEntranceState;
  /** Phase 5.4B — consecutive COMPLETE_WORKOUT dispatches with no skipped
   * work and no RPE anomaly (summary.needsReview === false), reset to 0 by
   * any SKIP_WORKOUT or needs-review completion. Purely a real, derived
   * counter — never inferred after the fact — used only to detect a genuine
   * "worth a personal touch" streak (see lib/coach/attention-escalation.ts's
   * detectMilestoneEscalation). */
  consecutiveCleanWorkouts: number;
}

/** Not-started per-item warm-up outcomes for every training item in a real,
 * resolved universal session — shared by START_WORKOUT (below) and any other
 * path that seeds a live session directly (Phase 4's demo mixed-session
 * preset). Phase 4 — reads the universal Session rather than the legacy
 * Workout, so this works correctly even when the session has no legacy
 * counterpart at all (a continuous-only session); for a pure-resistance
 * session this enumerates the exact same item ids as before. */
function initialExerciseWarmups(trainingSession: Session): Record<string, WarmupOutcome> {
  const warmups: Record<string, WarmupOutcome> = {};
  for (const item of trainingSession.blocks.flatMap((b) => b.items)) {
    warmups[item.id] = { status: "not-started" };
  }
  return warmups;
}

/** Phase 4/11A/11B — where the entering-a-new-current-item transition
 * should land: "exercise-intro" for resistance (unchanged), "interval-ready"
 * or "interval-active" for interval, "circuit-ready" or "circuit-active"
 * for a circuit block (see below), or the plain continuous-work
 * counterpart for any other family. There is no warm-up-set/working-set
 * concept for a non-resistance item, so it skips straight to its own ready
 * phase. Shared by every reducer case that hands off to a new current item,
 * so they can never disagree about which family gets which phase.
 *
 * Phase 11A — an interval item with EXISTING intervalProgress (the client
 * deferred it mid-activity and has now returned to it) resumes directly
 * into "interval-active" at whatever round/phase it left off, rather than
 * re-showing "interval-ready" and implying nothing has started yet — see
 * WorkoutSession.intervalProgress's own doc for why this state survives a
 * defer untouched.
 *
 * Phase 11B — checked FIRST, before the item lookup: a circuit block
 * occupies its own flat-queue slot keyed by BLOCK id, not any item's id
 * (see lib/workout/session-flow.ts's buildInitialFlowState), so
 * findTrainingItemById would never find it. Same resume-in-place
 * discipline as interval: existing circuitProgress resumes directly into
 * "circuit-active" at whatever round/item it left off; its own
 * round-rest phase resumes as "circuit-active" too (never re-shown as a
 * bare "circuit-ready", and never re-derived as "round-rest" here — the
 * live panel itself reads circuitProgress.phase to decide between the
 * item view and the round-rest view once "circuit-active" is entered). */
function entryPhaseForCurrentItem(session: WorkoutSession): WorkoutSessionPhase {
  const circuitBlock = findBlockById(session.resolvedSession, session.currentExerciseId);
  if (circuitBlock && isCircuitBlock(circuitBlock)) {
    return session.circuitProgress?.[circuitBlock.id] ? "circuit-active" : "circuit-ready";
  }
  // Phase 11D — same resume-in-place discipline as circuit, checked
  // immediately alongside it (an EMOM block also occupies its own
  // flat-queue slot keyed by BLOCK id).
  if (circuitBlock && isEmomBlock(circuitBlock)) {
    return session.emomProgress?.[circuitBlock.id] ? "emom-active" : "emom-ready";
  }
  const item = findTrainingItemById(session.resolvedSession, session.currentExerciseId);
  if (!item) return "exercise-intro";
  if (item.prescription.family === "interval") {
    return session.intervalProgress?.[item.id] ? "interval-active" : "interval-ready";
  }
  // Phase 11C — power/mobility each get their own ready/active pair, same
  // as interval, so they must be checked before the generic
  // "!== resistance" fallback below would otherwise silently misroute them
  // into the one-shot continuous flow.
  if (item.prescription.family === "power") {
    return session.powerProgress?.[item.id] ? "power-active" : "power-ready";
  }
  if (item.prescription.family === "mobility") {
    return session.mobilityProgress?.[item.id] ? "mobility-active" : "mobility-ready";
  }
  return item.prescription.family !== "resistance" ? "continuous-ready" : "exercise-intro";
}

/** The one place a real live session's initial canonical state is actually
 * built, whether it came from resolving this client's real assigned program
 * (START_WORKOUT) or from a hand-authored universal Session fixture with no
 * legacy Workout counterpart at all (Phase 4's LOAD_PRESET "mixed-session" —
 * see lib/training/demo-fixtures.ts). Both callers converge here so there is
 * exactly one place that can ever disagree about how a session starts.
 * `resolvedWorkout` is null for a session with no legacy representation
 * (continuous-only or mixed content is never producible as a legacy Workout —
 * see lib/training/legacy-adapter.ts). */
export function buildStartedWorkoutSession(params: {
  existingSession: WorkoutSession;
  workoutId: string;
  resolvedWorkout: Workout | null;
  trainingSession: Session;
  nowIso: string;
}): WorkoutSession {
  const exerciseLogs: WorkoutSession["exerciseLogs"] = {};
  for (const item of params.trainingSession.blocks.flatMap((b) => b.items)) {
    exerciseLogs[item.id] = { exerciseId: item.id, status: "not-started", loggedSets: [] };
  }

  const initialFlow = buildInitialFlowState(params.trainingSession);
  const sessionWarmupConfig = resolveSessionWarmupConfigFromSession(params.trainingSession);
  // The very first current item might be continuous/interval/circuit, with
  // no warm-up-set/working-set concept to route into — entryPhaseForCurrentItem
  // can't be reused verbatim here since no WorkoutSession object exists yet
  // at this exact point in construction, so the same rule is inlined. A
  // brand-new session can never already have intervalProgress/circuitProgress
  // for its own first item/block, so this is always "interval-ready" or
  // "circuit-ready", never the "-active" resume state (unlike
  // entryPhaseForCurrentItem's own general case).
  const initialCircuitBlock = findBlockById(params.trainingSession, initialFlow.currentExerciseId);
  const initialItem = findTrainingItemById(params.trainingSession, initialFlow.currentExerciseId);
  const initialEntryPhase: WorkoutSessionPhase =
    initialCircuitBlock && isCircuitBlock(initialCircuitBlock)
      ? "circuit-ready"
      : initialCircuitBlock && isEmomBlock(initialCircuitBlock)
        ? "emom-ready"
        : initialItem?.prescription.family === "interval"
          ? "interval-ready"
          : initialItem?.prescription.family === "power"
            ? "power-ready"
            : initialItem?.prescription.family === "mobility"
              ? "mobility-ready"
              : initialItem && initialItem.prescription.family !== "resistance"
                ? "continuous-ready"
                : "exercise-intro";

  return {
    ...params.existingSession,
    workoutId: params.workoutId,
    // Snapshotted once, here — see WorkoutSession.resolvedWorkout's doc for
    // why every later lookup in this session reads this exact object rather
    // than re-resolving against the client's (possibly since-revised)
    // assignedProgram. resolvedSession is the same resolution's universal
    // counterpart, which the live engine's own logic actually navigates
    // against.
    resolvedWorkout: params.resolvedWorkout,
    resolvedSession: params.trainingSession,
    status: "in-progress",
    startedAtIso: params.nowIso,
    exerciseLogs,
    continuousExecutions: {},
    intervalProgress: {},
    circuitProgress: {},
    powerProgress: {},
    mobilityProgress: {},
    emomProgress: {},
    currentExerciseId: initialFlow.currentExerciseId,
    exerciseQueue: initialFlow.exerciseQueue,
    actualExerciseOrder: initialFlow.actualExerciseOrder,
    deferredExerciseIds: [],
    lastResolvedExerciseId: null,
    currentSetNumber: null,
    restStartedAtIso: undefined,
    phase: sessionWarmupConfig.mode === "confirmation" ? "session-warmup" : initialEntryPhase,
    sessionWarmup: { status: "not-started" },
    exerciseWarmups: initialExerciseWarmups(params.trainingSession),
    events: [...params.existingSession.events, { type: "started", atIso: params.nowIso } satisfies WorkoutSessionEvent],
  };
}

/** A not-started-anything empty shell — genuinely no workout has been
 * resolved or started yet, so there is nothing real to enumerate
 * exerciseLogs/exerciseWarmups against. START_WORKOUT (below) is the one
 * place that resolves this client's actual scheduled workout and populates
 * every workout-shaped field from it — never this constructor, and never a
 * hardcoded catalog entry. */
export function createInitialWorkoutSession(
  workspaceId: WorkspaceId = DEMO_WORKSPACE_ID,
  clientId: ClientProfileId = DEMO_CLIENT_ID
): WorkoutSession {
  return {
    workspaceId,
    clientId,
    workoutId: "",
    resolvedWorkout: null,
    resolvedSession: null,
    status: "not-started",
    exerciseLogs: {},
    continuousExecutions: {},
    intervalProgress: {},
    circuitProgress: {},
    powerProgress: {},
    mobilityProgress: {},
    emomProgress: {},
    painReports: [],
    phase: "session-warmup",
    currentExerciseId: null,
    exerciseQueue: [],
    actualExerciseOrder: [],
    deferredExerciseIds: [],
    lastResolvedExerciseId: null,
    currentSetNumber: null,
    sessionWarmup: { status: "not-started" },
    exerciseWarmups: {},
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
    version: 15,
    workspaceId,
    clientId,
    primaryCoachId,
    dateIso: resolveClientLocalDateIso(now, programEnrollment.timeZone),
    dailyEntrance: { lastSeenLocalDateIso: null },
    consecutiveCleanWorkouts: 0,
    morningWeight: { weightLb: null, skipped: false },
    meals: {},
    coachMealPlan: {},
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

// Phase 3 — the universal counterpart of PUSH_WORKOUT (the one real,
// hand-authored demo catalog workout), computed once at module load rather
// than per-preset-invocation. Safe to compute eagerly: PUSH_WORKOUT is real,
// fully-usable, internally-consistent content, so legacyWorkoutToSession
// can never throw for it (proven in lib/training/verify-legacy-adapter.mts).
// Used only by the "Load completed-day/awaiting-review example" dev presets
// below, which construct a WorkoutSession directly against PUSH_WORKOUT
// rather than going through START_WORKOUT's own conversion.
const PUSH_SESSION = legacyWorkoutToSession(PUSH_WORKOUT);

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
  | { type: "HYDRATE_SUPABASE_ACTIVITY"; training: TrainingDaySnapshot; nutrition: NutritionDaySnapshot }
  | { type: "SET_MORNING_WEIGHT"; weightLb: number }
  | { type: "SKIP_MORNING_WEIGHT" }
  | { type: "SELECT_MEAL_OPTION"; period: MealPeriod; optionId: string }
  | {
      type: "SET_MANUAL_MEAL";
      period: MealPeriod;
      manualName: string;
      macros: MacroValues;
      /** Gate 3B — set only when this manual entry is really an accepted
       * bounded substitution (see lib/nutrition/substitution.ts's
       * describeSubstitutionLog), carrying the rule's own constraint/
       * rationale through exactly the way SELECT_MEAL_OPTION already
       * snapshots an option's own description below. Omitted for a true
       * free-text manual entry, which has no MealIntent to preserve. */
      mealIntent?: MealIntent;
      /** Correction pass — which of `macros`' fields the client never
       * actually entered a value for (see MealSelection.unknownMacroFields'
       * own doc in lib/types.ts). `macros` itself still always carries a
       * real number in every field for these — 0 remains the correct
       * numeric contribution to totals — this is purely what tells a
       * reader "don't render this specific number as if it were measured." */
      unknownMacroFields?: (keyof MacroValues)[];
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
  /** Phase 7A — Supabase mode only: dispatched once
   * app/actions/production-safety.ts's async result for this exact report
   * comes back, so the client-facing "flagged for your coach" claim (see
   * components/workout/live/pain-review-panel.tsx) can turn honest if the
   * write actually failed. Never dispatched in demo mode. A no-op if the
   * report id no longer exists (shouldn't happen — reports are
   * append-only). */
  | { type: "SET_PAIN_ESCALATION_STATUS"; painReportId: string; escalationCreated: boolean }
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
  /** exercise-transition -> exercise-intro (or "continuous-ready" for a
   * non-resistance current item) for the new current exercise. */
  | { type: "ENTER_EXERCISE_INTRO" }
  /** Phase 4 — continuous-ready -> continuous-logging for the current item. */
  | { type: "BEGIN_CONTINUOUS_LOGGING" }
  /** Phase 4 — the one-shot continuous-work completion: records what was
   * actually done (only the primitives the prescription specifies —
   * lib/workout/continuous.ts's continuousCaptureFields) against the
   * prescription, exactly like LOG_SET does for a resistance working set,
   * then resolves the item and advances (there is no per-set concept to
   * iterate for continuous work, so this always resolves the whole item in
   * one dispatch). `deviationReason` reuses the existing SkipReason
   * taxonomy for the minimum useful "why different" question, exactly as
   * section 11 of the Phase 4 spec asks — a genuinely pain-relevant
   * deviation goes through REPORT_PAIN instead (unchanged, family-agnostic
   * safety path), never a SkipReason value alone. */
  | {
      type: "LOG_CONTINUOUS_EXECUTION";
      exerciseId: string;
      actual: Partial<Prescription>;
      note?: string;
      deviationReason?: SkipReason;
    }
  /** Phase 11A — interval-ready -> interval-active: starts round 1's work
   * phase, anchored to a real timestamp (see IntervalExecutionProgress). */
  | { type: "BEGIN_INTERVAL_EXECUTION"; exerciseId: string }
  /** Phase 11A — the one explicit action that ends the CURRENT phase (work
   * or recovery) of the current round, whether via a natural timer
   * completion, an early "I'm done" tap, or a manual distance-interval
   * confirmation. Never auto-dispatched by a ticking timer (spec section
   * 7) — always a real client action, so `actualSeconds`/`actualDistanceValue`
   * reflect what genuinely happened, never an assumption. Advances to the
   * next phase/round (or leaves canonical state alone to let the caller
   * transition to "interval-logging" once nextIntervalProgress reports
   * "complete" — see the reducer case). `skipped` marks just this one round
   * skipped while continuing the activity (spec section 15's "skip one
   * interval" — distinct from skipping the whole activity via the existing
   * SKIP_EXERCISE). */
  | {
      type: "ADVANCE_INTERVAL_PHASE";
      exerciseId: string;
      actualSeconds?: number;
      actualDistanceValue?: number;
      skipped?: boolean;
    }
  /** Phase 11A — the one-shot final capture (optional RPE only, mirroring
   * LOG_CONTINUOUS_EXECUTION's own minimal-burden discipline) that actually
   * resolves the interval item: builds the real ExecutionRecord from
   * whatever roundActuals accumulated in intervalProgress (honestly
   * "completed" only once every prescribed round is present — see
   * lib/workout/interval.ts's classifyIntervalActivityCompletion), clears
   * intervalProgress, and advances. Dispatchable either once every round
   * naturally finished, or early (an explicit "Finish now" — the honest
   * partial-completion path, spec acceptance test B) with fewer rounds
   * than prescribed already in roundActuals. */
  | { type: "FINALIZE_INTERVAL_EXECUTION"; exerciseId: string; rpe?: RpeValue; note?: string }
  /** Phase 11B — circuit-ready -> circuit-active: opens round 1, item 0
   * of a real circuit Block (see lib/workout/session-flow.ts's
   * isCircuitBlock). `blockId` addresses the block directly — a circuit
   * has no single "exerciseId" of its own, matching how it occupies one
   * flat-queue slot keyed by block id, not any item's id. */
  | { type: "BEGIN_CIRCUIT_EXECUTION"; blockId: string }
  /** Phase 11B — the one explicit action that resolves the CURRENT circuit
   * sub-state (an item-round exposure, or round-rest) and advances to
   * whatever comes next — item -> next item / round-rest / auto-finalize
   * on the very last exposure, or round-rest -> the next round's first
   * item. Never auto-dispatched by a ticking timer (same discipline as
   * ADVANCE_INTERVAL_PHASE) — always a real client action. `actual`/
   * `skipped`/`skipReason` are only meaningful while resolving an ITEM
   * (ignored, harmlessly, while resolving round-rest, which has no
   * exposure of its own to record — see the reducer case). Finalizing the
   * circuit (writing each item's real ExecutionRecord and advancing the
   * session) happens automatically, inline, the moment the very last
   * exposure of the very last round is recorded — a circuit needs no
   * separate one-shot "logging" step the way interval's optional
   * whole-activity RPE does, since each resistance/continuous exposure
   * already captured its own actual as it happened. */
  | {
      type: "ADVANCE_CIRCUIT_PHASE";
      blockId: string;
      actual?: Partial<Prescription>;
      skipped?: boolean;
      skipReason?: SkipReason;
    }
  /** Phase 11C — power-ready -> power-active: opens set 1 of a real power
   * item. */
  | { type: "BEGIN_POWER_EXECUTION"; exerciseId: string }
  /** Phase 11C — the one explicit action that resolves the CURRENT set and
   * advances to the next one, or auto-finalizes inline the moment the last
   * set resolves (same "no separate logging step" discipline as
   * ADVANCE_CIRCUIT_PHASE — each set already captures its own real actual
   * as it happens). `actual` carries whichever primitive the item's own
   * prescription specifies (reps, contacts, or distance — never converted
   * between them, spec section 6). */
  | {
      type: "ADVANCE_POWER_SET";
      exerciseId: string;
      actual?: Partial<Prescription>;
      skipped?: boolean;
      skipReason?: SkipReason;
    }
  /** Phase 11C — mobility-ready -> mobility-active: opens set 1 (and, for
   * a dual-side item, the "left" side) of a real mobility item. */
  | { type: "BEGIN_MOBILITY_EXECUTION"; exerciseId: string }
  /** Phase 11C — the one explicit action that resolves the CURRENT
   * set/side and advances via nextMobilityPosition (left -> right -> next
   * set, or straight to the next set for a single-resolution item), or
   * auto-finalizes inline once the last required exposure resolves. */
  | {
      type: "ADVANCE_MOBILITY_PHASE";
      exerciseId: string;
      actual?: Partial<Prescription>;
      skipped?: boolean;
      skipReason?: SkipReason;
    }
  /** Phase 11D — the client's own explicit "time's up" tap for a genuine
   * time-driven circuit (AMRAP or a real time-capped circuit — see
   * Block.terminationMode's own doc). Snapshots whatever was honestly
   * accomplished and finalizes; see the reducer case's own extensive doc
   * for exactly how this differs from ADVANCE_CIRCUIT_PHASE's own
   * "complete" branch and from SKIP_EXERCISE's circuit interrupt. */
  | { type: "EXPIRE_TIMED_CIRCUIT"; blockId: string }
  /** Phase 11D — emom-ready -> emom-active: opens a real EMOM block (see
   * lib/workout/session-flow.ts's isEmomBlock). `blockId` addresses the
   * block directly, mirroring BEGIN_CIRCUIT_EXECUTION exactly — an EMOM
   * has no single "exerciseId" of its own either. */
  | { type: "BEGIN_EMOM_EXECUTION"; blockId: string }
  /** Phase 11D — the one explicit action that resolves whatever the REAL,
   * elapsed-time-derived CURRENT window's assigned work is (see
   * lib/workout/emom.ts's currentEmomWindow) and records it. Auto-
   * finalizes inline once the very last window is recorded — same "no
   * separate logging step" discipline as every other family's own
   * advance action. Any window that already fell behind real time before
   * this tap (the client was too slow) is auto-marked "skipped" first,
   * honestly, never fabricated as completed — see the reducer case's own
   * doc. */
  | {
      type: "ADVANCE_EMOM_WINDOW";
      blockId: string;
      actual?: Partial<Prescription>;
      skipped?: boolean;
      skipReason?: SkipReason;
    }
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
  | {
      type: "CREATE_CHAT_REVIEW_REQUEST";
      kind: ReviewRequestKind;
      summary: string;
      sourceMessageId?: string;
      /** Gate 2C — lets a caller (see components/chat/demo-chat-screen.tsx's
       * handleTalkToCoach) know this review's real id up front, so it can
       * stamp a companion ChatMessage with the same id (ChatMessage.
       * reviewRequestId) before the review even exists in state — needed to
       * derive that message's displayed text live from this exact review's
       * resolved status later. Omitted by every other caller, which keeps
       * generating its id here exactly as before. */
      id?: string;
      /** Gate 3C — see ReviewRequest.nutritionContext's own doc. Omitted by
       * every non-nutrition caller. */
      nutritionContext?: { period: MealPeriod; ruleId?: string };
    }
  /** Phase 5.4B — dispatched once the client-side daily entrance sequence
   * (spec §8) finishes for today, so a second same-day open skips straight
   * to Today. See DailyEntranceState's doc for why this needs no rollover
   * handling of its own. */
  | { type: "MARK_DAILY_ENTRANCE_SEEN" }
  | { type: "RESET_TODAY" }
  /** Phase 4 — "mixed-session" seeds a live, in-progress session directly
   * from a hand-authored universal Session (lib/training/demo-fixtures.ts's
   * MIXED_SESSION_DEMO: a resistance block followed by a continuous block)
   * rather than resolving this client's real assigned program — the
   * smallest safe, repository-supported path to prove a mixed-modality live
   * session end to end (spec section 18) without a generation engine or a
   * new coach-authoring surface, neither of which is in this phase's scope. */
  | { type: "LOAD_PRESET"; preset: "completed-day" | "awaiting-review" | "mixed-session" };

function withMealMacros(
  meals: AppState["meals"],
  period: MealPeriod,
  selection: MealSelection
): AppState["meals"] {
  return { ...meals, [period]: selection };
}

/** Resolves a working-set outcome into the exercise's log, auto-completing
 * the exercise the moment it's genuinely resolved — the one place LOG_SET
 * and SKIP_SET share this rule so they can never disagree. Reads the real
 * prescription from the session's own resolvedSession snapshot (Phase 3 —
 * see WorkoutSession.resolvedSession) — never the global demo catalog — so
 * this is correct for whichever real workout this session was actually
 * started against. */
function withResolvedLogStatus(exerciseId: string, updatedLog: ExerciseLog, trainingSession: Session | null | undefined): ExerciseLog {
  const item = findTrainingItemById(trainingSession, exerciseId);
  const resolved = item ? isExerciseResolved(item, updatedLog) : false;
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
  // Phase 4 — continuous work's own progression actions, blocked on exactly
  // the same terms as their resistance counterparts above: the same safety
  // architecture, never a cardio-specific carve-out (Phase 4 spec section 12).
  "BEGIN_CONTINUOUS_LOGGING",
  "LOG_CONTINUOUS_EXECUTION",
  // Phase 11A — interval's own progression actions, same reasoning. Never
  // a parallel safety system (spec section 14) — SKIP_EXERCISE is
  // deliberately NOT in this set (unchanged from before this phase), since
  // it's the one action that resolves a "block-exercise" severity report
  // from the pain-review screen itself, for every family alike.
  "BEGIN_INTERVAL_EXECUTION",
  "ADVANCE_INTERVAL_PHASE",
  "FINALIZE_INTERVAL_EXECUTION",
  // Phase 11B — circuit's own progression actions, same reasoning.
  "BEGIN_CIRCUIT_EXECUTION",
  "ADVANCE_CIRCUIT_PHASE",
  // Phase 11C — power/mobility's own progression actions, same reasoning.
  "BEGIN_POWER_EXECUTION",
  "ADVANCE_POWER_SET",
  "BEGIN_MOBILITY_EXECUTION",
  "ADVANCE_MOBILITY_PHASE",
  // Phase 11D — timed-circuit expiry and EMOM's own progression actions,
  // same reasoning.
  "EXPIRE_TIMED_CIRCUIT",
  "BEGIN_EMOM_EXECUTION",
  "ADVANCE_EMOM_WINDOW",
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

    // Phase 6.0B — Supabase mode only. Overlays a persisted daily_records
    // { training, nutrition } snapshot (see lib/production/programs.ts's
    // getDailyActivity, and lib/history/build-daily-record.ts, which
    // produces this exact same TrainingDaySnapshot/NutritionDaySnapshot
    // shape) onto an already-HYDRATEd state — dispatched right after HYDRATE
    // (and, when the session was already started, after START_WORKOUT has
    // already run to properly seed exerciseQueue/phase from the client's
    // real resolved workout — see hooks/use-prototype-state.tsx's Supabase
    // bootstrap). Never invented independently of a real persisted record:
    // this restores what actually happened, using the exact same
    // exerciseId-keyed shape live exerciseLogs already use, so a refreshed
    // browser shows the same completed/skipped sets, RPE, and skip reasons
    // the client actually logged rather than resetting to "not started."
    case "HYDRATE_SUPABASE_ACTIVITY": {
      const exerciseLogs: WorkoutSession["exerciseLogs"] = { ...state.workoutSession.exerciseLogs };
      for (const [exerciseId, snapshot] of Object.entries(action.training.exerciseLogs)) {
        exerciseLogs[exerciseId] = {
          exerciseId,
          status: snapshot.status,
          skipReason: snapshot.skipReason,
          skipNote: snapshot.skipNote,
          loggedSets: snapshot.loggedSets.map((s) => ({
            id: nextId("set"),
            exerciseId,
            setNumber: s.setNumber,
            isWarmup: s.isWarmup,
            weightLb: s.weightLb,
            reps: s.reps,
            rpe: s.rpe,
            note: s.note,
            completedAtIso: s.completedAtIso,
            status: s.status,
            skipReason: s.skipReason,
          })),
        };
      }
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          status: action.training.sessionStatus ?? state.workoutSession.status,
          startedAtIso: action.training.startedAtIso ?? state.workoutSession.startedAtIso,
          completedAtIso: action.training.completedAtIso ?? state.workoutSession.completedAtIso,
          skipReason: action.training.skipReason ?? state.workoutSession.skipReason,
          skipNote: action.training.skipNote ?? state.workoutSession.skipNote,
          painReports: action.training.painReports.length > 0 ? action.training.painReports : state.workoutSession.painReports,
          exerciseLogs,
        },
        meals: { ...state.meals, ...action.nutrition.meals },
      };
    }

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
        // Gate 3A — snapshot the option's MealIntent onto the log the same
        // way photoEstimate is already snapshotted below, so it survives
        // independently of the MEAL_OPTIONS catalog. Gate 3C — a coach's
        // own edited Meal Intent for this client's this period (see
        // AppState.coachMealPlan) takes precedence over the catalog's own
        // description when present, so what gets snapshotted here is
        // exactly what the coach authored, never silently the stock text.
        mealIntent: state.coachMealPlan[action.period]?.mealIntentOverride ?? option.description,
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
        // Gate 3B — present only for an accepted bounded substitution; see
        // this action's own doc above.
        mealIntent: action.mealIntent,
        // Correction pass — present only for a partial free-text manual
        // entry; see this action's own doc above.
        unknownMacroFields: action.unknownMacroFields,
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
      // Gate 3A — a photo estimate with no real, named items is missing
      // evidence, not a legitimate zero-calorie meal; refusing it here
      // (the same "invalid input, state unchanged" pattern SELECT_MEAL_OPTION
      // uses above for an unknown optionId) is the contract-level guarantee
      // that "absence of usable evidence remains unknown" — the existing UI
      // flow (components/nutrition/photo/photo-meal-flow.tsx's canConfirm)
      // already never dispatches this with empty items, but the reducer is
      // the real boundary, not a UI convention.
      const itemNames = action.items.map((i) => i.name.trim()).filter(Boolean);
      if (itemNames.length === 0) return state;
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
      // Phase 6A — a real Supabase client's universal-grammar assignment
      // (see AppState.assignedUniversalProgram's own doc) takes priority
      // whenever present: resolved and executed DIRECTLY as a universal
      // Session, never round-tripped through a legacy Workout first. This
      // is the only path that can ever start a continuous or mixed session
      // for a real client — resolveScheduledWorkoutForStart below has no
      // way to represent one.
      if (state.assignedUniversalProgram) {
        const resolvedSession = resolveScheduledSessionForStart({
          dateIso: state.dateIso,
          programEnrollment: state.programEnrollment,
          assignedProgram: state.assignedUniversalProgram,
          clientDeclaredRest: state.dailyTrainingPlan?.status === "rest_day",
        });
        if (!resolvedSession.session) return state;
        const trainingSession = resolvedSession.session;
        return {
          ...state,
          workoutSession: buildStartedWorkoutSession({
            existingSession: state.workoutSession,
            workoutId: trainingSession.id,
            // No legacy Workout snapshot exists for a real universal-origin
            // session — see buildStartedWorkoutSession's own doc on why
            // this is a legitimate, already-supported value, not a gap.
            resolvedWorkout: null,
            trainingSession,
            nowIso: new Date().toISOString(),
          }),
        };
      }

      // The one moment a real session is actually resolved against this
      // client's real approved program — see
      // lib/workout/resolve-scheduled-workout.ts. A day with nothing honest
      // to start (pre-Day-1, a rest day, or a genuine assignment gap) is a
      // no-op: the UI already refuses to offer "Begin workout" in every one
      // of those cases (see components/training/session-surface.tsx and the
      // pre-program gates on Today/Training), so this is a defensive
      // backstop, never the primary gate.
      const resolved = resolveScheduledWorkoutForStart({
        dateIso: state.dateIso,
        programEnrollment: state.programEnrollment,
        assignedProgram: state.assignedProgram,
        clientDeclaredRest: state.dailyTrainingPlan?.status === "rest_day",
      });
      if (!resolved.workout) return state;
      const workout = resolved.workout;

      // Phase 3 — the one clear compatibility boundary: converted exactly
      // once, here, through lib/training/legacy-adapter.ts. Every later
      // reducer case reads THIS resolvedSession snapshot, never
      // re-converting resolvedWorkout item-by-item. A workout this adapter
      // can't represent (an authoring stub, internally inconsistent
      // generated content) is treated exactly like "no workout resolved"
      // above — a defensive backstop; the UI never knowingly offers "Begin
      // workout" for content that could fail this (see
      // lib/training/legacy-adapter.ts's own doc for exactly what it
      // requires).
      let trainingSession: Session;
      try {
        trainingSession = legacyWorkoutToSession(workout);
      } catch {
        return state;
      }

      return {
        ...state,
        workoutSession: buildStartedWorkoutSession({
          existingSession: state.workoutSession,
          workoutId: workout.id,
          resolvedWorkout: workout,
          trainingSession,
          nowIso: new Date().toISOString(),
        }),
      };
    }

    case "LOG_SET": {
      // Phase 4 — a resistance-only action: a continuous item has no
      // per-set concept, and must only ever be resolved through
      // LOG_CONTINUOUS_EXECUTION, never accumulate stray LoggedSet entries
      // that a naive "is this item resolved" check could misread later.
      const loggedSetItem = findTrainingItemById(state.workoutSession.resolvedSession, action.exerciseId);
      if (loggedSetItem && loggedSetItem.prescription.family !== "resistance") return state;
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
      const updatedLog = withResolvedLogStatus(action.exerciseId, { ...log, loggedSets }, state.workoutSession.resolvedSession);
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
        log.status === "skipped"
          ? { ...log, loggedSets }
          : withResolvedLogStatus(action.exerciseId, { ...log, loggedSets }, state.workoutSession.resolvedSession);
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
        },
      };
    }

    case "SKIP_SET": {
      // Phase 4 — same resistance-only guard as LOG_SET above.
      const skippedSetItem = findTrainingItemById(state.workoutSession.resolvedSession, action.exerciseId);
      if (skippedSetItem && skippedSetItem.prescription.family !== "resistance") return state;
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
      const updatedLog = withResolvedLogStatus(
        action.exerciseId,
        { ...log, loggedSets: [...log.loggedSets, skippedSet] },
        state.workoutSession.resolvedSession
      );
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
      // Phase 11B — a whole-circuit skip (spec section 15: "reuse the
      // existing structured skip model... should not require skipping
      // every child item manually"). action.exerciseId is the BLOCK id
      // here (a circuit has no exerciseLogs entry of its own — its ITEMS
      // do), so this must be handled as its own branch before the
      // generic single-item logic below, which looks up exerciseLogs by
      // the given id directly. Preserves whatever was already genuinely
      // completed per item (spec section 16's "never lose completed
      // circuit work"), exactly mirroring the interval whole-activity-skip
      // snapshot below, generalized across every item in the block.
      const skippedCircuitBlock = findBlockById(state.workoutSession.resolvedSession, action.exerciseId);
      if (skippedCircuitBlock && isCircuitBlock(skippedCircuitBlock)) {
        const inProgressCircuit = state.workoutSession.circuitProgress?.[action.exerciseId];
        const totalRounds = totalCircuitRounds(skippedCircuitBlock);
        const nowIso = new Date().toISOString();
        let exerciseLogs = state.workoutSession.exerciseLogs;
        let continuousExecutions = state.workoutSession.continuousExecutions;
        for (const item of skippedCircuitBlock.items) {
          const itemExposures = inProgressCircuit?.exposuresByItemId[item.id] ?? [];
          const existingLog = exerciseLogs[item.id];
          if (existingLog) exerciseLogs = { ...exerciseLogs, [item.id]: { ...existingLog, status: "skipped", skipReason: action.reason, skipNote: action.note } };
          if (itemExposures.length > 0) {
            const exposuresPerRound = requiresBothSides(item.prescription) ? 2 : 1;
            const execution: ExecutionRecord = {
              id: nextId("execution"),
              trainingItemInstanceId: item.id,
              status: classifyCircuitItemCompletion(totalRounds, itemExposures, exposuresPerRound),
              performedAsPrescribed: circuitItemPerformedAsPrescribed(totalRounds, itemExposures, exposuresPerRound),
              completedAtIso: nowIso,
              skipReason: action.reason,
              note: action.note,
              circuitRoundActuals: itemExposures,
            };
            continuousExecutions = { ...continuousExecutions, [item.id]: execution };
          }
        }
        const remainingCircuitProgress = Object.fromEntries(Object.entries(state.workoutSession.circuitProgress ?? {}).filter(([id]) => id !== action.exerciseId));
        const sessionWithLog: WorkoutSession = { ...state.workoutSession, exerciseLogs, continuousExecutions, circuitProgress: remainingCircuitProgress };
        if (state.workoutSession.currentExerciseId !== action.exerciseId) {
          return { ...state, workoutSession: sessionWithLog };
        }
        const advance = advanceAfterExerciseResolved(sessionWithLog);
        return { ...state, workoutSession: { ...sessionWithLog, ...advance } };
      }

      // Phase 11D — a whole-EMOM skip, same reasoning/pattern as the
      // circuit branch immediately above, scoped to windows instead of
      // rounds. action.exerciseId is the BLOCK id here too.
      const skippedEmomBlock = findBlockById(state.workoutSession.resolvedSession, action.exerciseId);
      if (skippedEmomBlock && isEmomBlock(skippedEmomBlock)) {
        const inProgressEmom = state.workoutSession.emomProgress?.[action.exerciseId];
        const nowIso = new Date().toISOString();
        let exerciseLogs = state.workoutSession.exerciseLogs;
        let continuousExecutions = state.workoutSession.continuousExecutions;
        const distinctItemIds = new Set(skippedEmomBlock.items.map((i) => i.id));
        for (const itemId of distinctItemIds) {
          const itemExposures = inProgressEmom?.exposuresByItemId[itemId] ?? [];
          const totalAssigned = totalWindowsAssignedToItem(skippedEmomBlock, itemId);
          const existingLog = exerciseLogs[itemId];
          if (existingLog) exerciseLogs = { ...exerciseLogs, [itemId]: { ...existingLog, status: "skipped", skipReason: action.reason, skipNote: action.note } };
          if (itemExposures.length > 0) {
            const execution: ExecutionRecord = {
              id: nextId("execution"),
              trainingItemInstanceId: itemId,
              status: classifyEmomItemCompletion(totalAssigned, itemExposures),
              performedAsPrescribed: emomItemPerformedAsPrescribed(totalAssigned, itemExposures),
              completedAtIso: nowIso,
              skipReason: action.reason,
              note: action.note,
              emomWindowActuals: itemExposures,
            };
            continuousExecutions = { ...continuousExecutions, [itemId]: execution };
          }
        }
        const remainingEmomProgress = Object.fromEntries(Object.entries(state.workoutSession.emomProgress ?? {}).filter(([id]) => id !== action.exerciseId));
        const sessionWithLog: WorkoutSession = { ...state.workoutSession, exerciseLogs, continuousExecutions, emomProgress: remainingEmomProgress };
        if (state.workoutSession.currentExerciseId !== action.exerciseId) {
          return { ...state, workoutSession: sessionWithLog };
        }
        const advance = advanceAfterExerciseResolved(sessionWithLog);
        return { ...state, workoutSession: { ...sessionWithLog, ...advance } };
      }

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
      //
      // Phase 11A — if this item is an interval activity with real rounds
      // already in progress (intervalProgress), skipping it whole must
      // still preserve whatever was genuinely completed (spec section 14's
      // "preserve completed rounds"), never silently discard it. This is
      // the one place intervalProgress ever gets snapshotted into a real
      // ExecutionRecord as a partial (or, if truly zero rounds were ever
      // reached, no execution record at all — a genuine skip, matching the
      // existing pre-Phase-11A behavior exactly).
      const inProgressInterval = state.workoutSession.intervalProgress?.[action.exerciseId];
      let continuousExecutions = state.workoutSession.continuousExecutions;
      let intervalProgress = state.workoutSession.intervalProgress;
      if (inProgressInterval && inProgressInterval.roundActuals.length > 0) {
        const item = findTrainingItemById(state.workoutSession.resolvedSession, action.exerciseId);
        if (item && item.prescription.family === "interval") {
          const nowIso = new Date().toISOString();
          const execution: ExecutionRecord = {
            id: nextId("execution"),
            trainingItemInstanceId: action.exerciseId,
            status: classifyIntervalActivityCompletion(item.prescription, inProgressInterval.roundActuals),
            performedAsPrescribed: intervalPerformedAsPrescribed(item.prescription, inProgressInterval.roundActuals),
            completedAtIso: nowIso,
            skipReason: action.reason,
            note: action.note,
            roundActuals: inProgressInterval.roundActuals,
          };
          continuousExecutions = { ...continuousExecutions, [action.exerciseId]: execution };
        }
      }
      if (inProgressInterval) {
        intervalProgress = Object.fromEntries(Object.entries(intervalProgress ?? {}).filter(([id]) => id !== action.exerciseId));
      }
      // Phase 11C — same snapshot-on-skip discipline as interval above,
      // generalized to power's per-set actuals.
      const inProgressPower = state.workoutSession.powerProgress?.[action.exerciseId];
      let powerProgress = state.workoutSession.powerProgress;
      if (inProgressPower && inProgressPower.setActuals.length > 0) {
        const item = findTrainingItemById(state.workoutSession.resolvedSession, action.exerciseId);
        if (item && item.prescription.family === "power") {
          const totalSets = totalPowerSets(item.prescription);
          const nowIso = new Date().toISOString();
          const execution: ExecutionRecord = {
            id: nextId("execution"),
            trainingItemInstanceId: action.exerciseId,
            status: classifyPowerItemCompletion(totalSets, inProgressPower.setActuals),
            performedAsPrescribed: powerItemPerformedAsPrescribed(totalSets, inProgressPower.setActuals),
            completedAtIso: nowIso,
            skipReason: action.reason,
            note: action.note,
            powerSetActuals: inProgressPower.setActuals,
          };
          continuousExecutions = { ...continuousExecutions, [action.exerciseId]: execution };
        }
      }
      if (inProgressPower) {
        powerProgress = Object.fromEntries(Object.entries(powerProgress ?? {}).filter(([id]) => id !== action.exerciseId));
      }
      // Phase 11C — same snapshot-on-skip discipline, generalized to
      // mobility's per-set(-side) actuals.
      const inProgressMobility = state.workoutSession.mobilityProgress?.[action.exerciseId];
      let mobilityProgress = state.workoutSession.mobilityProgress;
      if (inProgressMobility && inProgressMobility.setActuals.length > 0) {
        const item = findTrainingItemById(state.workoutSession.resolvedSession, action.exerciseId);
        if (item && item.prescription.family === "mobility") {
          const totalExpected = totalMobilityExposures(item.prescription);
          const nowIso = new Date().toISOString();
          const execution: ExecutionRecord = {
            id: nextId("execution"),
            trainingItemInstanceId: action.exerciseId,
            status: classifyMobilityItemCompletion(totalExpected, inProgressMobility.setActuals),
            performedAsPrescribed: mobilityItemPerformedAsPrescribed(totalExpected, inProgressMobility.setActuals),
            completedAtIso: nowIso,
            skipReason: action.reason,
            note: action.note,
            mobilitySetActuals: inProgressMobility.setActuals,
          };
          continuousExecutions = { ...continuousExecutions, [action.exerciseId]: execution };
        }
      }
      if (inProgressMobility) {
        mobilityProgress = Object.fromEntries(Object.entries(mobilityProgress ?? {}).filter(([id]) => id !== action.exerciseId));
      }
      const sessionWithLog: WorkoutSession = {
        ...state.workoutSession,
        exerciseLogs: { ...state.workoutSession.exerciseLogs, [action.exerciseId]: updatedLog },
        continuousExecutions,
        intervalProgress,
        powerProgress,
        mobilityProgress,
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

    case "SET_PAIN_ESCALATION_STATUS": {
      const index = state.workoutSession.painReports.findIndex((r) => r.id === action.painReportId);
      if (index === -1) return state;
      const painReports = state.workoutSession.painReports.map((r, i) => (i === index ? { ...r, escalationConfirmed: action.escalationCreated } : r));
      return { ...state, workoutSession: { ...state.workoutSession, painReports } };
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
      // Phase 11B fix — a circuit's own currentExerciseId is its BLOCK id
      // (see lib/workout/session-flow.ts's buildInitialFlowState), never
      // any one item's id, but REPORT_PAIN during a circuit always records
      // the interruption against the real circuit ITEM the client was
      // actually on (so PainReviewPanel shows the true exercise name) —
      // these two ids can never be literally equal for a circuit. Without
      // this check, a mild/resume-eligible pain report during a circuit
      // item would leave the client permanently stuck on pain-review, with
      // RESUME_AFTER_PAIN silently no-op'ing forever. A match is also
      // valid when the interruption's own item genuinely belongs to the
      // currently-active circuit block.
      const currentCircuitBlock = findBlockById(state.workoutSession.resolvedSession, state.workoutSession.currentExerciseId);
      const interruptionBelongsToCurrentCircuit = !!currentCircuitBlock && isCircuitBlock(currentCircuitBlock) && currentCircuitBlock.items.some((i) => i.id === interruption.exerciseId);
      // Phase 11D — the exact same class of bug/fix as circuit's own
      // Phase 11B fix immediately above, for the exact same reason: an
      // EMOM's currentExerciseId is its BLOCK id, but REPORT_PAIN during
      // an EMOM window always records the interruption against the real
      // assigned item's id.
      const interruptionBelongsToCurrentEmom = !!currentCircuitBlock && isEmomBlock(currentCircuitBlock) && currentCircuitBlock.items.some((i) => i.id === interruption.exerciseId);
      if (state.workoutSession.currentExerciseId !== interruption.exerciseId && !interruptionBelongsToCurrentCircuit && !interruptionBelongsToCurrentEmom) return state;
      // Phase 11A fix — this reducer previously hardcoded "set-ready"
      // unconditionally, a latent gap this phase's own audit uncovered:
      // resuming a resume-eligible (mild) pain report on a non-resistance
      // item landed on a phase requiring currentSetNumber, which is never
      // set for a continuous/interval item — a blank screen. Routed
      // through entryPhaseForCurrentItem instead, which already knows to
      // resume an interval item directly into "interval-active" at
      // whatever round/phase it left off (intervalProgress was never
      // touched by REPORT_PAIN — see that field's own doc), or "ready" for
      // a family with nothing to resume mid-activity. Strictly a
      // generalization for resistance: entryPhaseForCurrentItem already
      // returns "exercise-intro" there, so this restores currentSetNumber
      // and forces "set-ready" specifically to preserve the exact
      // resistance behavior byte-for-byte.
      const clearedSession: WorkoutSession = { ...state.workoutSession, activePainInterruption: null };
      const resumedItem = findTrainingItemById(clearedSession.resolvedSession, clearedSession.currentExerciseId);
      const isResistance = resumedItem?.prescription.family === "resistance";
      return {
        ...state,
        workoutSession: {
          ...clearedSession,
          currentSetNumber: isResistance ? interruption.setNumber : clearedSession.currentSetNumber,
          phase: isResistance ? "set-ready" : entryPhaseForCurrentItem(clearedSession),
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
          phase: entryPhaseForCurrentItem(state.workoutSession),
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
          phase: entryPhaseForCurrentItem(state.workoutSession),
        },
      };
    }

    case "BEGIN_EXERCISE": {
      const exerciseId = state.workoutSession.currentExerciseId;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!exerciseId || !item) return state;
      const config = resolveTrainingItemWarmupConfig(item);
      const outcome = state.workoutSession.exerciseWarmups[exerciseId];
      if (config.mode !== "none" && outcome?.status === "not-started") {
        return { ...state, workoutSession: { ...state.workoutSession, phase: "exercise-warmup" } };
      }
      const firstSet = firstUnresolvedWorkingSetNumber(item, state.workoutSession.exerciseLogs[exerciseId]);
      return { ...state, workoutSession: { ...state.workoutSession, phase: "set-ready", currentSetNumber: firstSet } };
    }

    case "ADVANCE_EXERCISE_WARMUP": {
      const exerciseId = state.workoutSession.currentExerciseId;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!exerciseId || !item) return state;
      const config = resolveTrainingItemWarmupConfig(item);
      const current: WarmupOutcome = state.workoutSession.exerciseWarmups[exerciseId] ?? { status: "not-started" };
      const stepsCompleted = (current.stepsCompleted ?? 0) + 1;
      const totalSteps = config.mode === "stepped" ? config.steps.length : 1;
      const nowIso = new Date().toISOString();
      if (stepsCompleted >= totalSteps) {
        const firstSet = firstUnresolvedWorkingSetNumber(item, state.workoutSession.exerciseLogs[exerciseId]);
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
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!exerciseId) return state;
      const nowIso = new Date().toISOString();
      const firstSet = item ? firstUnresolvedWorkingSetNumber(item, state.workoutSession.exerciseLogs[exerciseId]) : null;
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
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      const log = exerciseId ? state.workoutSession.exerciseLogs[exerciseId] : undefined;
      if (!exerciseId || !item || !log) return state;
      if (isExerciseResolved(item, log)) {
        const advance = advanceAfterExerciseResolved(state.workoutSession);
        return { ...state, workoutSession: { ...state.workoutSession, ...advance } };
      }
      const nextSetNumber = firstUnresolvedWorkingSetNumber(item, log);
      return { ...state, workoutSession: { ...state.workoutSession, currentSetNumber: nextSetNumber, phase: "set-ready" } };
    }

    case "BEGIN_CONTINUOUS_LOGGING": {
      if (state.workoutSession.phase !== "continuous-ready") return state;
      return { ...state, workoutSession: { ...state.workoutSession, phase: "continuous-logging" } };
    }

    // Phase 4 — the continuous-work counterpart of LOG_SET: one dispatch
    // records the full prescribed-vs-actual comparison and resolves the
    // item (there is no per-set concept to iterate). Completion status is
    // DERIVED from actual-vs-prescribed via lib/workout/continuous.ts's
    // classifier, never supplied by the client-side caller as a raw
    // boolean/enum — this is the same "the system decides, the client
    // reports reality" discipline LOG_SET's own performedAsPrescribed
    // check enforces via withResolvedLogStatus, applied to a family with no
    // per-set granularity to check instead.
    case "LOG_CONTINUOUS_EXECUTION": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId) return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      // Phase 11A — interval has its own dedicated actions below; excluded
      // here defensively so a stray dispatch against an interval item can
      // never create a one-shot execution record with no round-level data,
      // mirroring this whole reducer's established "safe no-op for the
      // wrong family" convention (see e.g. LOG_SET against a continuous id).
      // Phase 11C — power/mobility get the same exclusion, same reasoning.
      if (!item || item.prescription.family === "resistance" || item.prescription.family === "interval" || item.prescription.family === "power" || item.prescription.family === "mobility") return state;
      const log = state.workoutSession.exerciseLogs[exerciseId];
      if (!log) return state;

      const continuousActual: ContinuousActual = {
        durationSeconds: action.actual.duration?.seconds,
        distanceValue: action.actual.distance?.value,
        heartRateAvg: action.actual.heartRate?.low,
        rpe: action.actual.rpe,
      };
      const status = classifyContinuousCompletion(item.prescription, continuousActual);
      const performedAsPrescribed = continuousPerformedAsPrescribed(item.prescription, continuousActual);
      const nowIso = new Date().toISOString();
      const execution: ExecutionRecord = {
        id: nextId("execution"),
        trainingItemInstanceId: exerciseId,
        status,
        performedAsPrescribed,
        actual: action.actual,
        completedAtIso: nowIso,
        note: action.note,
        // deviationReason is deliberately folded into `note` rather than a
        // dedicated field on ExecutionRecord (which has no such field) —
        // see this action's own doc for why a genuinely safety-relevant
        // deviation goes through REPORT_PAIN instead, never here.
        skipReason: !performedAsPrescribed ? action.deviationReason : undefined,
      };

      const sessionWithExecution: WorkoutSession = {
        ...state.workoutSession,
        exerciseLogs: { ...state.workoutSession.exerciseLogs, [exerciseId]: { ...log, status: "completed" } },
        continuousExecutions: { ...state.workoutSession.continuousExecutions, [exerciseId]: execution },
      };
      const advance = advanceAfterExerciseResolved(sessionWithExecution);
      return { ...state, workoutSession: { ...sessionWithExecution, ...advance } };
    }

    // Phase 11A — interval-ready -> interval-active: opens round 1's work
    // phase with a real timestamp anchor. A no-op if intervalProgress
    // already exists for this item (defensive — the ready panel is never
    // shown once progress exists, per entryPhaseForCurrentItem, so this
    // should be unreachable in practice, but re-anchoring an in-progress
    // round would silently discard real elapsed time).
    case "BEGIN_INTERVAL_EXECUTION": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId || state.workoutSession.phase !== "interval-ready") return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!item || item.prescription.family !== "interval") return state;
      if (state.workoutSession.intervalProgress?.[exerciseId]) return state;
      const nowIso = new Date().toISOString();
      const progress: IntervalExecutionProgress = { round: 1, phase: "work", phaseStartedAtIso: nowIso, roundActuals: [] };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          phase: "interval-active",
          intervalProgress: { ...state.workoutSession.intervalProgress, [exerciseId]: progress },
        },
      };
    }

    // Phase 11A — the interval work/recovery state machine's single real
    // transition point (spec test matrix I/J/K). Never reachable from a
    // ticking timer itself (see lib/workout/interval.ts's own module doc) —
    // always a real, explicit client action, so `actualSeconds`/
    // `actualDistanceValue` reflect genuine elapsed time/distance, never an
    // assumed full completion.
    case "ADVANCE_INTERVAL_PHASE": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId || state.workoutSession.phase !== "interval-active") return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!item || item.prescription.family !== "interval") return state;
      const progress = state.workoutSession.intervalProgress?.[exerciseId];
      if (!progress) return state;

      // Only the WORK phase of a round produces a round actual (spec
      // section 13's minimal-logging-burden discipline — recovery is
      // guidance-only, never separately logged; see IntervalRoundActual's
      // own doc). Finishing recovery just advances round/phase in place.
      const roundActuals =
        progress.phase === "work"
          ? [
              ...progress.roundActuals,
              {
                roundNumber: progress.round,
                status: action.skipped ? ("skipped" as const) : ("completed" as const),
                actualWorkSeconds: action.actualSeconds,
                actualWorkDistanceValue: action.actualDistanceValue,
                completedAtIso: new Date().toISOString(),
              } satisfies IntervalRoundActual,
            ]
          : progress.roundActuals;

      const next = nextIntervalProgress(item.prescription, { round: progress.round, phase: progress.phase });
      if (next === "complete") {
        return {
          ...state,
          workoutSession: {
            ...state.workoutSession,
            phase: "interval-logging",
            intervalProgress: { ...state.workoutSession.intervalProgress, [exerciseId]: { ...progress, roundActuals } },
          },
        };
      }
      const nowIso = new Date().toISOString();
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          intervalProgress: {
            ...state.workoutSession.intervalProgress,
            [exerciseId]: { round: next.round, phase: next.phase, phaseStartedAtIso: nowIso, roundActuals },
          },
        },
      };
    }

    // Phase 11A — the continuous-work counterpart's exact one-shot
    // resolve-and-advance discipline, applied to whatever roundActuals
    // intervalProgress accumulated. Reachable either once every round
    // naturally finished (session.phase already "interval-logging") or
    // early via an explicit "Finish now" from "interval-active" — either
    // way, completion is DERIVED from the real roundActuals array, never
    // supplied by the caller (same "the system decides" discipline as
    // LOG_CONTINUOUS_EXECUTION).
    case "FINALIZE_INTERVAL_EXECUTION": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId) return state;
      if (state.workoutSession.phase !== "interval-active" && state.workoutSession.phase !== "interval-logging") return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!item || item.prescription.family !== "interval") return state;
      const progress = state.workoutSession.intervalProgress?.[exerciseId];
      if (!progress) return state;
      const log = state.workoutSession.exerciseLogs[exerciseId];
      if (!log) return state;

      const roundActuals = progress.roundActuals;
      const status = classifyIntervalActivityCompletion(item.prescription, roundActuals);
      const performedAsPrescribed = intervalPerformedAsPrescribed(item.prescription, roundActuals);
      const nowIso = new Date().toISOString();
      const execution: ExecutionRecord = {
        id: nextId("execution"),
        trainingItemInstanceId: exerciseId,
        status,
        performedAsPrescribed,
        actual: action.rpe !== undefined ? { rpe: action.rpe } : undefined,
        completedAtIso: nowIso,
        note: action.note,
        roundActuals,
      };

      const remainingProgress = Object.fromEntries(Object.entries(state.workoutSession.intervalProgress ?? {}).filter(([id]) => id !== exerciseId));
      const sessionWithExecution: WorkoutSession = {
        ...state.workoutSession,
        exerciseLogs: { ...state.workoutSession.exerciseLogs, [exerciseId]: { ...log, status: "completed" } },
        continuousExecutions: { ...state.workoutSession.continuousExecutions, [exerciseId]: execution },
        intervalProgress: remainingProgress,
      };
      const advance = advanceAfterExerciseResolved(sessionWithExecution);
      return { ...state, workoutSession: { ...sessionWithExecution, ...advance } };
    }

    // Phase 11B — circuit-ready -> circuit-active: opens round 1, item 0.
    // A no-op if circuitProgress already exists for this block (defensive
    // — the ready panel is never shown once progress exists, per
    // entryPhaseForCurrentItem, mirroring BEGIN_INTERVAL_EXECUTION's own
    // guard).
    case "BEGIN_CIRCUIT_EXECUTION": {
      const blockId = state.workoutSession.currentExerciseId;
      if (!blockId || blockId !== action.blockId || state.workoutSession.phase !== "circuit-ready") return state;
      const block = findBlockById(state.workoutSession.resolvedSession, blockId);
      if (!block || !isCircuitBlock(block)) return state;
      if (state.workoutSession.circuitProgress?.[blockId]) return state;
      const firstItem = block.items[0];
      const progress: CircuitExecutionProgress = {
        round: 1,
        itemIndex: 0,
        phase: "item",
        exposuresByItemId: {},
        blockStartedAtIso: new Date().toISOString(),
        currentSide: firstItem && requiresBothSides(firstItem.prescription) ? "left" : null,
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          phase: "circuit-active",
          circuitProgress: { ...state.workoutSession.circuitProgress, [blockId]: progress },
        },
      };
    }

    // Phase 11B — the circuit state machine's single real transition point
    // (spec test matrix J/K/L/M/N), unifying "an item-round exposure just
    // resolved" and "round-rest just finished" into one action — mirrors
    // ADVANCE_INTERVAL_PHASE's own unification. Finalizes and advances the
    // session inline the moment the very last exposure of the very last
    // round is recorded — see this case's own tail.
    case "ADVANCE_CIRCUIT_PHASE": {
      const blockId = state.workoutSession.currentExerciseId;
      if (!blockId || blockId !== action.blockId || state.workoutSession.phase !== "circuit-active") return state;
      const block = findBlockById(state.workoutSession.resolvedSession, blockId);
      if (!block || !isCircuitBlock(block)) return state;
      const progress = state.workoutSession.circuitProgress?.[blockId];
      if (!progress) return state;

      // Round-rest resolving has no exposure of its own to record — it
      // just hands off to the next round's first item.
      let exposuresByItemId = progress.exposuresByItemId;
      if (progress.phase === "item") {
        const currentItem = block.items[progress.itemIndex];
        if (!currentItem) return state;
        // Phase 12B — the side THIS exposure resolves: progress.currentSide
        // while a bilateral/alternating item still owes a side (left, then
        // right); otherwise the item's own fixed side when it has one
        // (left-only/right-only); otherwise absent — exact same fallback
        // ADVANCE_MOBILITY_PHASE already uses for MobilitySetActual.side.
        const resolvedSide = progress.currentSide ?? (currentItem.prescription.side === "left" || currentItem.prescription.side === "right" ? currentItem.prescription.side : undefined);
        const existing = exposuresByItemId[currentItem.id] ?? [];
        const exposure: CircuitRoundActual = {
          roundNumber: progress.round,
          side: resolvedSide,
          status: action.skipped ? "skipped" : "completed",
          actual: action.actual,
          skipReason: action.skipped ? action.skipReason : undefined,
          completedAtIso: new Date().toISOString(),
        };
        exposuresByItemId = { ...exposuresByItemId, [currentItem.id]: [...existing, exposure] };

        // Phase 12B — a bilateral/alternating item's LEFT side just
        // resolved (completed or skipped — same "still advances to the
        // next side either way" discipline as ADVANCE_MOBILITY_PHASE):
        // stay on this exact item/round and flip to RIGHT instead of
        // calling nextCircuitPosition, so the round cannot advance until
        // both sides are genuinely resolved (spec test matrix I).
        if (requiresBothSides(currentItem.prescription) && progress.currentSide === "left") {
          const heldProgress: CircuitExecutionProgress = { ...progress, currentSide: "right", exposuresByItemId };
          return {
            ...state,
            workoutSession: { ...state.workoutSession, circuitProgress: { ...state.workoutSession.circuitProgress, [blockId]: heldProgress } },
          };
        }
      }

      const next = nextCircuitPosition(block, { round: progress.round, itemIndex: progress.itemIndex, phase: progress.phase });

      if (next === "complete") {
        // Finalize inline — fan the accumulated exposures out into one
        // real ExecutionRecord per item (spec section 9's preferred
        // representation: one TrainingItemInstance -> its own repeated
        // exposures, never a fabricated collapse into a single value, and
        // never a mutation of the item's own prescription).
        const totalRounds = totalCircuitRounds(block);
        const nowIso = new Date().toISOString();
        let exerciseLogs = state.workoutSession.exerciseLogs;
        let continuousExecutions = state.workoutSession.continuousExecutions;
        for (const item of block.items) {
          const itemExposures = exposuresByItemId[item.id] ?? [];
          const exposuresPerRound = requiresBothSides(item.prescription) ? 2 : 1;
          const execution: ExecutionRecord = {
            id: nextId("execution"),
            trainingItemInstanceId: item.id,
            status: classifyCircuitItemCompletion(totalRounds, itemExposures, exposuresPerRound),
            performedAsPrescribed: circuitItemPerformedAsPrescribed(totalRounds, itemExposures, exposuresPerRound),
            completedAtIso: nowIso,
            circuitRoundActuals: itemExposures,
          };
          continuousExecutions = { ...continuousExecutions, [item.id]: execution };
          const existingLog = exerciseLogs[item.id];
          if (existingLog) exerciseLogs = { ...exerciseLogs, [item.id]: { ...existingLog, status: "completed" } };
        }
        const remainingCircuitProgress = Object.fromEntries(Object.entries(state.workoutSession.circuitProgress ?? {}).filter(([id]) => id !== blockId));
        const sessionWithExecution: WorkoutSession = {
          ...state.workoutSession,
          exerciseLogs,
          continuousExecutions,
          circuitProgress: remainingCircuitProgress,
        };
        const advance = advanceAfterExerciseResolved(sessionWithExecution);
        return { ...state, workoutSession: { ...sessionWithExecution, ...advance } };
      }

      const nowIso = new Date().toISOString();
      // Phase 12B — a fresh item/round never inherits the previous item's
      // side state; recompute from scratch for whichever item is current
      // now (only meaningful once phase is back to "item").
      const upcomingItem = next.phase === "item" ? block.items[next.itemIndex] : undefined;
      const nextProgress: CircuitExecutionProgress = {
        round: next.round,
        itemIndex: next.itemIndex,
        phase: next.phase,
        restStartedAtIso: next.phase === "round-rest" ? nowIso : undefined,
        exposuresByItemId,
        blockStartedAtIso: progress.blockStartedAtIso,
        currentSide: upcomingItem && requiresBothSides(upcomingItem.prescription) ? "left" : null,
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          circuitProgress: { ...state.workoutSession.circuitProgress, [blockId]: nextProgress },
        },
      };
    }

    // Phase 11D — the ONE way a genuine time-driven circuit (AMRAP or a
    // real time-capped circuit — Block.terminationMode "time_cap"/
    // "rounds_or_time_cap") ends BEFORE its round target is (or could be)
    // naturally reached: the client's own explicit "time's up" tap (spec
    // section 21: "stop new work from being recorded... preserve current
    // partial exposure honestly... finalize block state deterministically"
    // — never a silent auto-completion). Snapshots exactly what was
    // actually accomplished, honestly, then finalizes and advances —
    // mirrors ADVANCE_CIRCUIT_PHASE's own "complete" branch almost
    // exactly, with two deliberate differences: (1) the in-progress item
    // the client was mid-way through when time ran out gets NO exposure
    // recorded for itself (they didn't finish it), and (2) the honest
    // classification denominator is "rounds actually reached" for a pure
    // AMRAP (no real prescribed target exists to compare against — see
    // Block.terminationMode's own doc) but stays the block's own real
    // `rounds` target for a rounds_or_time_cap circuit (matching the
    // EXACT same denominator SKIP_EXERCISE's own mid-round circuit
    // interrupt already uses for a fixed-round circuit, Phase 11B).
    case "EXPIRE_TIMED_CIRCUIT": {
      const blockId = state.workoutSession.currentExerciseId;
      if (!blockId || blockId !== action.blockId || state.workoutSession.phase !== "circuit-active") return state;
      const block = findBlockById(state.workoutSession.resolvedSession, blockId);
      if (!block || !isCircuitBlock(block) || !isTimedCircuit(block)) return state;
      const progress = state.workoutSession.circuitProgress?.[blockId];
      if (!progress) return state;

      const effectiveTotalRounds = isUnboundedRounds(block) ? progress.round : totalCircuitRounds(block);
      const nowIso = new Date().toISOString();
      let exerciseLogs = state.workoutSession.exerciseLogs;
      let continuousExecutions = state.workoutSession.continuousExecutions;
      for (const item of block.items) {
        const itemExposures = progress.exposuresByItemId[item.id] ?? [];
        if (itemExposures.length === 0) {
          // Genuinely never reached, even once — honestly "skipped", never
          // a fabricated partial (mirrors classifyCircuitItemCompletion's
          // own zero-exposure boundary, applied here at the exerciseLogs
          // layer too — see this action's own doc for why this differs
          // from SKIP_EXERCISE's blanket "skipped" status).
          const existingLog = exerciseLogs[item.id];
          if (existingLog) exerciseLogs = { ...exerciseLogs, [item.id]: { ...existingLog, status: "skipped" } };
          continue;
        }
        const execution: ExecutionRecord = {
          id: nextId("execution"),
          trainingItemInstanceId: item.id,
          status: classifyCircuitItemCompletion(effectiveTotalRounds, itemExposures),
          performedAsPrescribed: circuitItemPerformedAsPrescribed(effectiveTotalRounds, itemExposures),
          completedAtIso: nowIso,
          circuitRoundActuals: itemExposures,
        };
        continuousExecutions = { ...continuousExecutions, [item.id]: execution };
        // A real, honest completion of a time-bounded format — the client
        // worked the whole time; this is not a "skip" (spec section 21's
        // own "finalize block state deterministically" framing never
        // calls a legitimate time-cap ending a skip).
        const existingLog = exerciseLogs[item.id];
        if (existingLog) exerciseLogs = { ...exerciseLogs, [item.id]: { ...existingLog, status: "completed" } };
      }
      const remainingCircuitProgress = Object.fromEntries(Object.entries(state.workoutSession.circuitProgress ?? {}).filter(([id]) => id !== blockId));
      const sessionWithExecution: WorkoutSession = {
        ...state.workoutSession,
        exerciseLogs,
        continuousExecutions,
        circuitProgress: remainingCircuitProgress,
      };
      const advance = advanceAfterExerciseResolved(sessionWithExecution);
      return { ...state, workoutSession: { ...sessionWithExecution, ...advance } };
    }

    // Phase 11D — emom-ready -> emom-active: anchors the whole EMOM's
    // cadence to a real start timestamp. A no-op if emomProgress already
    // exists (defensive, mirrors BEGIN_CIRCUIT_EXECUTION's own guard).
    case "BEGIN_EMOM_EXECUTION": {
      const blockId = state.workoutSession.currentExerciseId;
      if (!blockId || blockId !== action.blockId || state.workoutSession.phase !== "emom-ready") return state;
      const block = findBlockById(state.workoutSession.resolvedSession, blockId);
      if (!block || !isEmomBlock(block)) return state;
      if (state.workoutSession.emomProgress?.[blockId]) return state;
      const progress: EmomExecutionProgress = { startedAtIso: new Date().toISOString(), exposuresByItemId: {} };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          phase: "emom-active",
          emomProgress: { ...state.workoutSession.emomProgress, [blockId]: progress },
        },
      };
    }

    // Phase 11D — EMOM's single real transition point. First "catches up"
    // — honestly auto-skips any window whose real cadence boundary already
    // passed with nothing recorded (spec section 22: never fabricate a
    // completion for a window the client fell behind on) — then records
    // the client's own tap against whatever window is REALLY current after
    // that catch-up, exactly mirroring ADVANCE_CIRCUIT_PHASE's own "no
    // separate logging step" discipline: auto-finalizes inline the moment
    // the very last window is recorded.
    case "ADVANCE_EMOM_WINDOW": {
      const blockId = state.workoutSession.currentExerciseId;
      if (!blockId || blockId !== action.blockId || state.workoutSession.phase !== "emom-active") return state;
      const block = findBlockById(state.workoutSession.resolvedSession, blockId);
      if (!block || !isEmomBlock(block)) return state;
      const progress = state.workoutSession.emomProgress?.[blockId];
      if (!progress) return state;

      const cadenceSeconds = emomCadenceSeconds(block);
      const totalWindows = totalEmomWindows(block);
      const nowIso = new Date().toISOString();

      const allExposures = Object.values(progress.exposuresByItemId).flat();
      const resolvedWindows = new Set(allExposures.map((e) => e.window));
      let nextUnresolvedWindow = 1;
      while (resolvedWindows.has(nextUnresolvedWindow) && nextUnresolvedWindow <= totalWindows) nextUnresolvedWindow += 1;
      if (nextUnresolvedWindow > totalWindows) return state; // already fully resolved — safe no-op.

      const clockCurrentWindow = currentEmomWindow(cadenceSeconds, totalWindows, progress.startedAtIso, nowIso);
      const autoSkipWindows = windowsToAutoSkip(nextUnresolvedWindow, clockCurrentWindow);

      let exposuresByItemId = progress.exposuresByItemId;
      for (const w of autoSkipWindows) {
        const autoSkippedItem = emomItemForWindow(block, w);
        const existing = exposuresByItemId[autoSkippedItem.id] ?? [];
        const autoExposure: EmomWindowActual = { window: w, status: "skipped", completedAtIso: nowIso };
        exposuresByItemId = { ...exposuresByItemId, [autoSkippedItem.id]: [...existing, autoExposure] };
      }

      // The client's own tap always applies to whatever window is REALLY
      // current now, after the honest catch-up above.
      const activeItem = emomItemForWindow(block, clockCurrentWindow);
      const existingForActive = exposuresByItemId[activeItem.id] ?? [];
      const exposure: EmomWindowActual = {
        window: clockCurrentWindow,
        status: action.skipped ? "skipped" : "completed",
        actual: action.actual,
        skipReason: action.skipped ? action.skipReason : undefined,
        completedAtIso: nowIso,
      };
      exposuresByItemId = { ...exposuresByItemId, [activeItem.id]: [...existingForActive, exposure] };

      if (clockCurrentWindow >= totalWindows) {
        // Finalize inline — fan the accumulated exposures out into one
        // real ExecutionRecord per DISTINCT assigned item (an alternating
        // EMOM's own item may be assigned several windows — see
        // lib/workout/emom.ts's totalWindowsAssignedToItem for the honest
        // per-item denominator).
        let exerciseLogs = state.workoutSession.exerciseLogs;
        let continuousExecutions = state.workoutSession.continuousExecutions;
        const distinctItemIds = new Set(block.items.map((i) => i.id));
        for (const itemId of distinctItemIds) {
          const itemExposures = exposuresByItemId[itemId] ?? [];
          const totalAssigned = totalWindowsAssignedToItem(block, itemId);
          const execution: ExecutionRecord = {
            id: nextId("execution"),
            trainingItemInstanceId: itemId,
            status: classifyEmomItemCompletion(totalAssigned, itemExposures),
            performedAsPrescribed: emomItemPerformedAsPrescribed(totalAssigned, itemExposures),
            completedAtIso: nowIso,
            emomWindowActuals: itemExposures,
          };
          continuousExecutions = { ...continuousExecutions, [itemId]: execution };
          const existingLog = exerciseLogs[itemId];
          if (existingLog) exerciseLogs = { ...exerciseLogs, [itemId]: { ...existingLog, status: "completed" } };
        }
        const remainingEmomProgress = Object.fromEntries(Object.entries(state.workoutSession.emomProgress ?? {}).filter(([id]) => id !== blockId));
        const sessionWithExecution: WorkoutSession = {
          ...state.workoutSession,
          exerciseLogs,
          continuousExecutions,
          emomProgress: remainingEmomProgress,
        };
        const advance = advanceAfterExerciseResolved(sessionWithExecution);
        return { ...state, workoutSession: { ...sessionWithExecution, ...advance } };
      }

      const nextProgress: EmomExecutionProgress = { startedAtIso: progress.startedAtIso, exposuresByItemId };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          emomProgress: { ...state.workoutSession.emomProgress, [blockId]: nextProgress },
        },
      };
    }

    case "BEGIN_POWER_EXECUTION": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId || state.workoutSession.phase !== "power-ready") return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!item || item.prescription.family !== "power") return state;
      if (state.workoutSession.powerProgress?.[exerciseId]) return state;
      const progress: PowerExecutionProgress = { currentSet: 1, setActuals: [] };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          phase: "power-active",
          powerProgress: { ...state.workoutSession.powerProgress, [exerciseId]: progress },
        },
      };
    }

    // Phase 11C — power's single real transition point, mirroring
    // ADVANCE_CIRCUIT_PHASE's own "no separate logging step" discipline:
    // finalizes inline the moment the last set resolves.
    case "ADVANCE_POWER_SET": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId || state.workoutSession.phase !== "power-active") return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!item || item.prescription.family !== "power") return state;
      const progress = state.workoutSession.powerProgress?.[exerciseId];
      if (!progress) return state;

      const setActual: PowerSetActual = {
        setNumber: progress.currentSet,
        status: action.skipped ? "skipped" : "completed",
        actual: action.actual,
        skipReason: action.skipped ? action.skipReason : undefined,
        completedAtIso: new Date().toISOString(),
      };
      const setActuals = [...progress.setActuals, setActual];
      const totalSets = totalPowerSets(item.prescription);

      if (progress.currentSet >= totalSets) {
        const nowIso = new Date().toISOString();
        const execution: ExecutionRecord = {
          id: nextId("execution"),
          trainingItemInstanceId: exerciseId,
          status: classifyPowerItemCompletion(totalSets, setActuals),
          performedAsPrescribed: powerItemPerformedAsPrescribed(totalSets, setActuals),
          completedAtIso: nowIso,
          powerSetActuals: setActuals,
        };
        const remainingPowerProgress = Object.fromEntries(Object.entries(state.workoutSession.powerProgress ?? {}).filter(([id]) => id !== exerciseId));
        const log = state.workoutSession.exerciseLogs[exerciseId];
        const sessionWithExecution: WorkoutSession = {
          ...state.workoutSession,
          exerciseLogs: log ? { ...state.workoutSession.exerciseLogs, [exerciseId]: { ...log, status: "completed" } } : state.workoutSession.exerciseLogs,
          continuousExecutions: { ...state.workoutSession.continuousExecutions, [exerciseId]: execution },
          powerProgress: remainingPowerProgress,
        };
        const advance = advanceAfterExerciseResolved(sessionWithExecution);
        return { ...state, workoutSession: { ...sessionWithExecution, ...advance } };
      }

      const nextProgress: PowerExecutionProgress = { currentSet: progress.currentSet + 1, setActuals };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          powerProgress: { ...state.workoutSession.powerProgress, [exerciseId]: nextProgress },
        },
      };
    }

    case "BEGIN_MOBILITY_EXECUTION": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId || state.workoutSession.phase !== "mobility-ready") return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!item || item.prescription.family !== "mobility") return state;
      if (state.workoutSession.mobilityProgress?.[exerciseId]) return state;
      const nowIso = new Date().toISOString();
      const progress: MobilityExecutionProgress = {
        currentSet: 1,
        currentSide: requiresBothSides(item.prescription) ? "left" : null,
        holdStartedAtIso: item.prescription.duration ? nowIso : undefined,
        setActuals: [],
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          phase: "mobility-active",
          mobilityProgress: { ...state.workoutSession.mobilityProgress, [exerciseId]: progress },
        },
      };
    }

    // Phase 11C — mobility's single real transition point, mirroring
    // ADVANCE_CIRCUIT_PHASE/ADVANCE_POWER_SET's "no separate logging step"
    // discipline: finalizes inline once the last required set/side
    // resolves.
    case "ADVANCE_MOBILITY_PHASE": {
      const exerciseId = state.workoutSession.currentExerciseId;
      if (!exerciseId || exerciseId !== action.exerciseId || state.workoutSession.phase !== "mobility-active") return state;
      const item = findTrainingItemById(state.workoutSession.resolvedSession, exerciseId);
      if (!item || item.prescription.family !== "mobility") return state;
      const progress = state.workoutSession.mobilityProgress?.[exerciseId];
      if (!progress) return state;

      const setActual: MobilitySetActual = {
        setNumber: progress.currentSet,
        side: progress.currentSide ?? (item.prescription.side === "left" || item.prescription.side === "right" ? item.prescription.side : undefined),
        status: action.skipped ? "skipped" : "completed",
        actual: action.actual,
        skipReason: action.skipped ? action.skipReason : undefined,
        completedAtIso: new Date().toISOString(),
      };
      const setActuals = [...progress.setActuals, setActual];
      const totalExpected = totalMobilityExposures(item.prescription);

      const next = nextMobilityPosition(item.prescription, { set: progress.currentSet, side: progress.currentSide });
      if (next === "complete") {
        const nowIso = new Date().toISOString();
        const execution: ExecutionRecord = {
          id: nextId("execution"),
          trainingItemInstanceId: exerciseId,
          status: classifyMobilityItemCompletion(totalExpected, setActuals),
          performedAsPrescribed: mobilityItemPerformedAsPrescribed(totalExpected, setActuals),
          completedAtIso: nowIso,
          mobilitySetActuals: setActuals,
        };
        const remainingMobilityProgress = Object.fromEntries(Object.entries(state.workoutSession.mobilityProgress ?? {}).filter(([id]) => id !== exerciseId));
        const log = state.workoutSession.exerciseLogs[exerciseId];
        const sessionWithExecution: WorkoutSession = {
          ...state.workoutSession,
          exerciseLogs: log ? { ...state.workoutSession.exerciseLogs, [exerciseId]: { ...log, status: "completed" } } : state.workoutSession.exerciseLogs,
          continuousExecutions: { ...state.workoutSession.continuousExecutions, [exerciseId]: execution },
          mobilityProgress: remainingMobilityProgress,
        };
        const advance = advanceAfterExerciseResolved(sessionWithExecution);
        return { ...state, workoutSession: { ...sessionWithExecution, ...advance } };
      }

      const nowIso = new Date().toISOString();
      const nextProgress: MobilityExecutionProgress = {
        currentSet: next.set,
        currentSide: next.side,
        holdStartedAtIso: item.prescription.duration ? nowIso : undefined,
        setActuals,
      };
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          mobilityProgress: { ...state.workoutSession.mobilityProgress, [exerciseId]: nextProgress },
        },
      };
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
      return { ...state, workoutSession: { ...state.workoutSession, phase: entryPhaseForCurrentItem(state.workoutSession) } };
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
        return { ...state, workoutSession: { ...state.workoutSession, phase: entryPhaseForCurrentItem(state.workoutSession) } };
      }
      const nowIso = new Date().toISOString();
      return {
        ...state,
        workoutSession: {
          ...state.workoutSession,
          activePainInterruption: { ...interruption, confirmedUnaffectedExerciseIds: [...already, exerciseId] },
          phase: entryPhaseForCurrentItem(state.workoutSession),
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
      // with genuinely nothing logged, even if something dispatches this
      // action outside the normal gated UI flow. Phase 4 — workingSetsCompleted
      // alone would incorrectly block a real, fully-completed PURE continuous
      // session (a Zone 2 bike ride has no "working sets" at all by
      // definition) — exercisesCompleted already counts a real logged
      // continuous execution (see lib/workout-analysis.ts's buildWorkoutSummary),
      // so checking both together is honest for either family alone or mixed.
      if (action.summary.workingSetsCompleted === 0 && action.summary.exercisesCompleted === 0) return state;
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
              ? "Today's workout was submitted with skipped work."
              : "Today's workout has RPE values worth a second look.",
            status: "needs_review",
            resolved: false,
          });
        }
      }

      // Phase 5.4B — repeated-pattern escalation runs on the review list as
      // it stands AFTER this event's own routine review (if any) was pushed
      // above, so a pattern-crossing event is itself counted. Never mutates
      // or removes any individual review — only ever adds a distinct,
      // higher-visibility one on top.
      const patternContext = {
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        assignedCoachId: state.primaryCoachId,
        reviewRequests,
        nowIso: completeWorkoutNowIso,
        nextId: () => nextId("review"),
      };
      reviewRequests.push(...detectPatternEscalations(patternContext));

      const consecutiveCleanWorkouts = action.summary.needsReview ? 0 : state.consecutiveCleanWorkouts + 1;
      if (!action.summary.needsReview) {
        const milestone = detectMilestoneEscalation(patternContext, { consecutiveCleanWorkouts });
        if (milestone) reviewRequests.push(milestone);
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
        consecutiveCleanWorkouts,
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
      // Phase 4 — the same "trained, just not to completion" principle
      // applies to a client who logged real continuous work (any
      // ExecutionRecord at all, completed or partial) before ending —
      // workingSetsCompleted alone would misclassify that as a flat
      // "skipped" session, exactly the distinction this module's own doc
      // above says must never happen.
      const anyContinuousExecutionLogged = Object.keys(state.workoutSession.continuousExecutions ?? {}).length > 0;
      const endedEarly = workingSetsCompleted > 0 || anyContinuousExecutionLogged;
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
              ? "Today's workout ended early after partial completion."
              : "Today's workout was skipped.",
            status: "needs_review",
            resolved: false,
          };
      const summary = endedEarly
        ? buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, state.workoutSession.startedAtIso ?? nowIso, nowIso)
        : undefined;
      const reviewRequestsAfterSkip = reviewRequest ? [...state.reviewRequests, reviewRequest] : state.reviewRequests;
      const patternEscalations = detectPatternEscalations({
        workspaceId: state.workspaceId,
        clientId: state.clientId,
        assignedCoachId: state.primaryCoachId,
        reviewRequests: reviewRequestsAfterSkip,
        nowIso,
        nextId: () => nextId("review"),
      });
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
        reviewRequests: [...reviewRequestsAfterSkip, ...patternEscalations],
        consecutiveCleanWorkouts: 0,
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
        id: action.id ?? nextId("review"),
        ...chatReviewCandidate,
        sourceMessageId: action.sourceMessageId,
        severity: severityForKind(action.kind),
        createdAtIso: chatReviewNowIso,
        updatedAtIso: chatReviewNowIso,
        summary: action.summary,
        status: "needs_review",
        resolved: false,
        nutritionContext: action.nutritionContext,
      };
      return { ...state, reviewRequests: [...state.reviewRequests, reviewRequest] };
    }

    case "MARK_DAILY_ENTRANCE_SEEN":
      if (state.dailyEntrance.lastSeenLocalDateIso === state.dateIso) return state;
      return { ...state, dailyEntrance: { lastSeenLocalDateIso: state.dateIso } };

    case "RESET_TODAY":
      // Preserves whichever client (and their real assigned coach) this
      // state already belongs to — a coach-created client's own "Reset
      // today" must never silently reassign their daily state to the
      // seeded demo client's identity, or throw trying to re-derive a
      // coach id lib/tenancy/seed.ts's resolver can't resolve for them.
      return createInitialState({ workspaceId: state.workspaceId, clientId: state.clientId, primaryCoachId: state.primaryCoachId });

    case "LOAD_PRESET":
      if (action.preset === "completed-day") return buildCompletedDayPreset(state.workspaceId, state.clientId, state.primaryCoachId);
      if (action.preset === "awaiting-review") return buildAwaitingReviewPreset(state.workspaceId, state.clientId, state.primaryCoachId);
      return buildMixedSessionPreset(state);

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Presets for testable states (prototype settings menu)
// ---------------------------------------------------------------------------

/** Phase 4 — seeds a genuinely live, in-progress session (phase resolved by
 * the same buildStartedWorkoutSession every real session starts through)
 * from the hand-authored mixed resistance+continuous fixture, rather than a
 * post-hoc "already summarized" state like the other two presets — this one
 * exists specifically so a client/tester can walk the guided flow through
 * both modalities, proving Session does not equal modality (spec section 13). */
function buildMixedSessionPreset(state: AppState): AppState {
  const nowIso = new Date().toISOString();
  return {
    ...state,
    workoutSession: buildStartedWorkoutSession({
      existingSession: createInitialWorkoutSession(state.workspaceId, state.clientId),
      workoutId: MIXED_SESSION_DEMO.id,
      resolvedWorkout: null,
      trainingSession: MIXED_SESSION_DEMO,
      nowIso,
    }),
  };
}

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
      // Gate 3A — mirrors the SELECT_MEAL_OPTION reducer case's own snapshot
      // exactly (this preset builds AppState directly rather than dispatching
      // through the reducer, so it needs the same line independently).
      mealIntent: option.description,
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
    // Explicit, identified demo content (Prototype settings' "Load
    // completed-day example") — the one legitimate place PUSH_WORKOUT still
    // appears directly, never as a silent real-client fallback.
    resolvedWorkout: PUSH_WORKOUT,
    resolvedSession: PUSH_SESSION,
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
  const summary = buildWorkoutSummary(PUSH_SESSION, sessionBeforeSummary, startedAtIso, now);

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
    PUSH_SESSION,
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
