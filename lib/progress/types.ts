// Phase 4.2 — Progress dashboard view-model types.
//
// Presentation components (app/progress/page.tsx and components/progress/*)
// consume ONLY these already-derived models — they never read storage, call
// a Phase 4.1 derivation function, or do date/timezone math themselves. See
// lib/progress/build-dashboard.ts, the one place that assembles a
// ProgressDashboardModel from live/archived history.

import type { AuthorKind } from "../history/shared-types";
import type { CheckInStatus, ProgramPhase } from "../scheduling/types";
import type { DomainOutcome, OverallAdherenceStatus } from "../history/derive-day-status";
import type { DayOfWeek, MacroValues, MealIntent, MealPeriod, RpeValue, SkipReason } from "../types";

export type ProgressSource = "live" | "fixture";

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface ProgressHeaderModel {
  programWeek: number | null;
  programTotalWeeks: number;
  programPhase: ProgramPhase;
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

/** Only priority kinds that already have a real Phase 4.2 destination.
 * checkin_overdue/checkin_due/correction_needed are real, derived statuses
 * (see CheckInCardModel) but are deliberately never surfaced here — Phase
 * 4.3/4.4 build their destinations. See lib/progress/aggregate-priority.ts. */
export type ActionablePriorityKind = "unread_coach_feedback" | "approved_adjustment_review";

export interface PriorityCardModel {
  eligible: boolean;
  kind: ActionablePriorityKind | null;
  detail: string | null;
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export interface WeightRawPointModel {
  dateIso: string;
  weightLb: number;
  isCorrected: boolean;
}

export interface WeightTrendPointModel {
  dateIso: string;
  trailingAverageLb: number | null;
}

export type WeightRangeKey = "fourWeeks" | "fullProgram";

export interface WeightRangeModel {
  key: WeightRangeKey;
  label: "4 Weeks" | "Full Program";
  rawPoints: WeightRawPointModel[];
  trendPoints: WeightTrendPointModel[];
  status: "ok" | "insufficient_data" | "empty";
}

export interface WeightCardModel {
  latestWeightLb: number | null;
  latestDateIso: string | null;
  changeSinceProgramStartLb: number | null;
  changeStatus: "ok" | "insufficient_data";
  ranges: Record<WeightRangeKey, WeightRangeModel>;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export type TrainingDayOutcome = DomainOutcome | "future" | "no_record";

export interface TrainingDaySummaryModel {
  dateIso: string;
  dayOfWeek: DayOfWeek;
  label: string;
  trainingDayType: "scheduled_workout" | "scheduled_rest" | "no_session_scheduled";
  outcome: TrainingDayOutcome;
  resolvedWithContext: boolean;
  isToday: boolean;
}

export interface TrainingCardModel {
  scheduledWorkoutDays: number;
  evaluableWorkoutDays: number;
  fullyCompletedCount: number;
  partialOrEndedEarlyCount: number;
  skippedCount: number;
  adherenceRatio: number | null;
  status: "ok" | "insufficient_data" | "not_applicable";
  days: TrainingDaySummaryModel[];
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export type TargetMetResult = "met" | "not_met" | "insufficient_data";

export interface NutritionDaySummaryModel {
  dateIso: string;
  dayOfWeek: DayOfWeek;
  mealPlanOutcome: DomainOutcome | "future" | "no_record";
  calorieResult: TargetMetResult | "future" | "no_record";
  proteinResult: TargetMetResult | "future" | "no_record";
}

export interface NutritionCardModel {
  mealPlanAdherenceRatio: number | null;
  mealPlanStatus: "ok" | "insufficient_data";
  calorieDaysMet: number;
  calorieDaysEvaluable: number;
  proteinDaysMet: number;
  proteinDaysEvaluable: number;
  days: NutritionDaySummaryModel[];
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

export interface CardioDaySummaryModel {
  dateIso: string;
  dayOfWeek: DayOfWeek;
  outcome: DomainOutcome | "future" | "no_record";
  durationMin: number;
  targetDurationMin: number;
  usedApprovedAlternative: boolean;
  isToday: boolean;
}

export interface CardioCardModel {
  completedDurationMin: number;
  targetDurationMin: number;
  adherenceRatio: number | null;
  status: "ok" | "insufficient_data" | "not_applicable";
  days: CardioDaySummaryModel[];
}

// ---------------------------------------------------------------------------
// Weekly check-in
// ---------------------------------------------------------------------------

export interface CheckInCardModel {
  /** Coach-authored display name for this check-in (see
   * CheckInScheduleConfig.label) — never hardcoded to "Weekly check-in" in
   * a presentation component, since a future coach could assign a
   * differently-cadenced check-in. */
  title: string;
  status: CheckInStatus;
  weekStartDateIso: string;
  openTimeLocal: string;
  dueWindowHours: number;
  reviewSummary: {
    status: string;
    submittedAtIso?: string;
    reviewedAtIso?: string;
    clientNote?: string;
    coachNote?: string;
    coachNoteAuthorKind?: AuthorKind;
  } | null;
}

// ---------------------------------------------------------------------------
// Coach guidance
// ---------------------------------------------------------------------------

export interface CoachGuidanceMessageModel {
  text: string;
  authorName: string;
  createdAtIso: string;
}

export interface CoachGuidanceCorrectionModel {
  dateIso: string;
  fieldPath: string;
  reason: string | null;
  authorName: string;
  authorKind: AuthorKind;
}

export interface CoachGuidanceCardModel {
  hasNewGuidance: boolean;
  latestMessage: CoachGuidanceMessageModel | null;
  recentCorrections: CoachGuidanceCorrectionModel[];
}

// ---------------------------------------------------------------------------
// Dashboard root
// ---------------------------------------------------------------------------

export interface ProgressDashboardModel {
  source: ProgressSource;
  effectiveDateIso: string;
  header: ProgressHeaderModel;
  priority: PriorityCardModel;
  weight: WeightCardModel;
  training: TrainingCardModel;
  nutrition: NutritionCardModel;
  cardio: CardioCardModel;
  /** Null when no coach has assigned an active check-in for this client —
   * the page renders no check-in card at all in that case. See
   * lib/state.ts's AppState.checkInSchedule and build-dashboard.ts. */
  checkIn: CheckInCardModel | null;
  coachGuidance: CoachGuidanceCardModel;
}

// ---------------------------------------------------------------------------
// Phase 4.3 — Historical Day Review
//
// A single day's full, read-only detail — richer than the weekly summary
// rows above (TrainingDaySummaryModel etc.), which only ever need an
// outcome badge. Every value here traces back to one archived DailyRecord
// (with corrections applied) — see lib/progress/build-historical-day.ts,
// the one place this is assembled. A field is `null`/omitted rather than
// guessed whenever the underlying record never captured it — never
// borrowed from today's live state.
// ---------------------------------------------------------------------------

/** Picker entries only ever cover strictly-past dates (see
 * buildHistoryDayPickerEntries), so "in_progress" — deriveOverallAdherenceStatus's
 * open-day-only outcome — can never occur here either. */
export type HistoryDayPickerStatus = Exclude<OverallAdherenceStatus, "in_progress"> | "no_record";

/** One selectable entry in the Progress "History" picker — see
 * components/progress/history-day-picker.tsx. Always a genuinely past date
 * (never today, never a future date); see buildHistoryDayPickerEntries. */
export interface HistoryDayPickerEntryModel {
  dateIso: string;
  dayOfWeek: DayOfWeek;
  shortLabel: string;
  status: HistoryDayPickerStatus;
}

/** The result of resolving a requested date into a review. "future" and
 * "today" are both explicitly ineligible — see the module doc on
 * lib/progress/build-historical-day.ts for why today itself (still a live,
 * unarchived day) is never treated as a historical review, only genuinely
 * past dates. "invalid_date" covers a malformed URL param defensively. */
export type HistoricalDayLookupResult =
  | { status: "ok"; review: HistoricalDayReviewModel }
  | { status: "future" }
  | { status: "today" }
  | { status: "invalid_date" };

export interface HistoricalDaySummaryModel {
  dateIso: string;
  dayOfWeek: DayOfWeek;
  programWeek: number | null;
  programPhase: ProgramPhase;
  /** Whether ANY archived record exists for this date at all — false for a
   * genuinely past date this system simply never captured (before the
   * client's history began, or a sparse/legacy gap). When false, every
   * other section below reports its own honest "not recorded" state rather
   * than a fabricated one. */
  hasRecord: boolean;
  /** A Historical Day Review is always a closed/archived day — deriveOverallAdherenceStatus
   * is always called with lifecycle "closed" here, so "in_progress" (its
   * open-day-only outcome) can never actually occur; excluded from the
   * type so OutcomeBadge doesn't need to handle an impossible case. */
  overallStatus: Exclude<OverallAdherenceStatus, "in_progress"> | "no_record";
}

// --- Training -----------------------------------------------------------

export interface HistoricalSetModel {
  setNumber: number;
  isWarmup: boolean;
  weightLb: number | null;
  reps: number | null;
  rpe: RpeValue | null;
  status: "completed" | "skipped";
  skipReason: SkipReason | null;
  note: string | null;
}

export interface HistoricalExerciseModel {
  exerciseId: string;
  name: string;
  order: number;
  status: "not-started" | "in-progress" | "completed" | "skipped";
  skipReason: SkipReason | null;
  skipNote: string | null;
  sets: HistoricalSetModel[];
  /** True only when at least one set was actually logged for this
   * exercise — distinguishes a genuinely empty exercise (never touched)
   * from an older/sparse record that only kept the aggregate
   * workingSetsCompleted count and never the per-set breakdown (see
   * lib/history/demo-fixture.ts). The UI must show "set-level detail not
   * recorded" in the latter case, never a blank list that reads as zero
   * sets done. */
  hasSetDetail: boolean;
}

export interface HistoricalPainReportModel {
  exerciseName: string | null;
  location: string;
  ratingZeroToTen: number;
  onset: string;
  note: string | null;
}

export interface HistoricalTrainingModel {
  trainingDayType: "scheduled_workout" | "scheduled_rest" | "no_session_scheduled";
  sessionStatus: "not-started" | "in-progress" | "completed" | "ended-early" | "skipped" | null;
  outcome: DomainOutcome | "no_record";
  resolvedWithContext: boolean;
  skipReason: SkipReason | null;
  skipNote: string | null;
  /** Client-local "HH:MM"-formatted labels — never raw ISO instants, so no
   * presentation component ever does its own timezone math. */
  startedTimeLabel: string | null;
  completedTimeLabel: string | null;
  workoutName: string | null;
  focus: string | null;
  workingSetsCompleted: number;
  workingSetsPrescribed: number;
  /** True only when `prescribedWorkoutSnapshot` was actually captured — an
   * older/sparse scheduled_workout record could in principle lack it; the
   * UI falls back to the raw completed/prescribed counts alone rather than
   * a fabricated exercise list. */
  hasWorkoutDetail: boolean;
  /** True when at least one exercise on this day has any logged set at
   * all. False for a record that only ever kept the aggregate
   * workingSetsCompleted count (see lib/history/demo-fixture.ts) — the UI
   * shows one clear day-level "set-by-set detail not recorded" note
   * instead of repeating it per exercise. */
  hasAnySetDetail: boolean;
  exercises: HistoricalExerciseModel[];
  painReports: HistoricalPainReportModel[];
}

// --- Nutrition ------------------------------------------------------------

export type HistoricalMealStatus = "completed" | "replaced" | "skipped" | "planned_later" | "not_logged";

export interface HistoricalMealModel {
  period: MealPeriod;
  label: string;
  status: HistoricalMealStatus;
  /** The catalog option name for a `status: "completed"` meal, or the
   * client-entered name for a `status: "replaced"` one. Null otherwise. */
  itemName: string | null;
  isEstimate: boolean;
  /** Actual logged time, when captured. There is no stored "planned time"
   * on an archived day — meal-timing recommendations are a live-only
   * projection (see lib/planning/meal-schedule.ts) never snapshotted onto
   * a DailyRecord, so a past day never claims a planned time it didn't
   * really record. */
  actualTimeLabel: string | null;
  skipReason: SkipReason | null;
  skipNote: string | null;
  macros: MacroValues | null;
  /** Gate 3D — mirrors MealSelectionSnapshot.mealIntent (see that field's
   * own doc): the planned meal's preserved rationale, or — for a
   * `status: "replaced"` meal — the accepted substitution's own preserved
   * constraint/rationale, read straight from this exact archived day's own
   * snapshot. Never re-derived from today's live MEAL_OPTIONS catalog or
   * BOUNDED_SUBSTITUTION_RULES, so a past day's "why" can never drift if
   * either changes later. Null whenever the underlying selection never had
   * one (a plain manual entry, a photo estimate, a skip) — never
   * fabricated. */
  mealIntent: MealIntent | null;
}

export interface HistoricalNutritionModel {
  mealPlanOutcome: DomainOutcome | "no_record";
  meals: HistoricalMealModel[];
  /** Null when at least one counted meal's macros aren't known — see
   * lib/history/derive-nutrition.ts's sumKnownActualMacros; never a
   * partial/misleading sum. */
  totals: MacroValues | null;
  targets: MacroValues;
  calorieResult: TargetMetResult;
  proteinResult: TargetMetResult;
}

// --- Cardio & weight --------------------------------------------------------

export interface HistoricalCardioModel {
  status: "not-started" | "in-progress" | "completed" | "partial" | "skipped";
  outcome: DomainOutcome | "no_record";
  durationMin: number;
  targetDurationMin: number | null;
  optionName: string | null;
  usedApprovedAlternative: boolean;
  skipReason: SkipReason | null;
  /** Client-local "HH:MM" label — never a raw ISO instant. */
  completedTimeLabel: string | null;
}

export interface HistoricalWeightModel {
  weightLb: number | null;
  /** Client-local "HH:MM" label — never a raw ISO instant. */
  loggedTimeLabel: string | null;
  skipped: boolean;
  isCorrected: boolean;
}

export interface HistoricalDayReviewModel {
  source: ProgressSource;
  summary: HistoricalDaySummaryModel;
  training: HistoricalTrainingModel;
  nutrition: HistoricalNutritionModel;
  cardio: HistoricalCardioModel;
  weight: HistoricalWeightModel;
}
