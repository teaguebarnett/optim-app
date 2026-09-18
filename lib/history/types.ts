// Phase 4.1 history domain record types — DailyRecord, Correction, and a
// minimal WeeklyReview shape.
//
// These are raw-fact records only: a DailyRecord stores what actually
// happened (a deep snapshot of what was prescribed plus what was logged) and
// never a pre-computed "status" or "adherence" value. Every classification
// (day status, training/nutrition/cardio adherence, weight trend, ...) is
// computed on demand by the pure functions in this directory's other
// derive-*.ts files, from a DailyRecord plus any Corrections that apply to
// it — never persisted redundantly. This is what keeps a later Correction
// able to change the effective view of a day without rewriting history.

import type { RecordAttribution, RecordSource, EvidenceRef, Authorship } from "./shared-types";
import type { ProgramPhase, ProgramEnrollmentId } from "../scheduling/types";
import type {
  CardioOption,
  DayOfWeek,
  MacroValues,
  MealIntent,
  MealPeriod,
  MealSelectionSource,
  NutritionTargets,
  PainReport,
  PhotoMealEstimateSnapshot,
  RpeValue,
  SkipReason,
  Workout,
} from "../types";
import type { ExecutionRecord } from "../training/types";

// ---------------------------------------------------------------------------
// Training day
// ---------------------------------------------------------------------------

/** What kind of day this was, independent of what actually happened — see
 * Phase 4 Required Derivation Correction #1: a rest day's *type* is a
 * separate axis from its lifecycle / overall status. */
export type TrainingDayType = "scheduled_workout" | "scheduled_rest" | "no_session_scheduled";

export interface LoggedSetSnapshot {
  setNumber: number;
  isWarmup: boolean;
  weightLb: number | null;
  reps: number | null;
  rpe: RpeValue | null;
  status: "completed" | "skipped";
  skipReason?: SkipReason;
  note?: string;
  completedAtIso?: string;
}

export interface ExerciseLogSnapshot {
  exerciseId: string;
  status: "not-started" | "in-progress" | "completed" | "skipped";
  loggedSets: LoggedSetSnapshot[];
  skipReason?: SkipReason;
  skipNote?: string;
}

/**
 * A full, self-contained snapshot of a training day. When trainingDayType is
 * "scheduled_workout", prescribedWorkoutSnapshot is a deep copy of the
 * Workout actually assigned that day — never a live workoutId reference —
 * so this record's meaning can never silently change if the live program
 * catalog is edited later (Phase 4.1 §1 snapshot-integrity requirement).
 */
export interface TrainingDaySnapshot {
  trainingDayType: TrainingDayType;
  /** Deep-copied prescription actually assigned this day. Null on a
   * scheduled_rest / no_session_scheduled day. */
  prescribedWorkoutSnapshot: Workout | null;
  sessionStatus: "not-started" | "in-progress" | "completed" | "ended-early" | "skipped" | null;
  exerciseLogs: Record<string, ExerciseLogSnapshot>;
  startedAtIso?: string;
  completedAtIso?: string;
  skipReason?: SkipReason;
  skipNote?: string;
  painReports: PainReport[];
  /** Raw counts a training-adherence derivation reduces to a ratio —
   * captured here rather than recomputed later from exerciseLogs, so the
   * snapshot alone documents the outcome even if derivation logic changes. */
  workingSetsCompleted: number;
  workingSetsPrescribed: number;
  /** Phase 8A — the continuous-family counterpart of exerciseLogs, mirrored
   * directly from AppState.workoutSession.continuousExecutions (see that
   * field's own doc in lib/types.ts). Previously computed live but silently
   * dropped before reaching archival/persistence — a pre-existing gap this
   * phase closes narrowly (carrying already-computed data through, not new
   * capture) so a real completed continuous item (duration/distance/etc.)
   * has somewhere durable to live, which lib/signals/project-training-day.ts
   * depends on. Optional so every already-persisted record predating this
   * field still loads unchanged; treat a missing value the same as {}. */
  continuousExecutions?: Record<string, ExecutionRecord>;
}

// ---------------------------------------------------------------------------
// Nutrition day
// ---------------------------------------------------------------------------

export interface MealSelectionSnapshot {
  period: MealPeriod;
  source: MealSelectionSource;
  optionId?: string;
  manualName?: string;
  /** Present whenever the actual macro content of this meal/replacement is
   * known. Absent (never guessed) when a manual replacement was logged
   * without nutrition detail — downstream calorie/protein derivations must
   * treat that as insufficient data, not zero. See Phase 4.1 §9. */
  macros?: MacroValues;
  isEstimate?: boolean;
  completedAtIso?: string;
  skipReason?: SkipReason;
  skipNote?: string;
  /** Mirrors MealSelection.photoEstimate — present only when source ===
   * "photo-estimate". */
  photoEstimate?: PhotoMealEstimateSnapshot;
  /** Gate 3A — mirrors MealSelection.mealIntent (see that field's own doc
   * in lib/types.ts): the planned meal's preserved rationale, snapshotted
   * at archival time exactly like every other field here. Absent for the
   * same sources mealIntent is always absent for on the live selection. */
  mealIntent?: MealIntent;
}

export interface NutritionDaySnapshot {
  meals: Partial<Record<MealPeriod, MealSelectionSnapshot>>;
  /** Which meal periods were actually part of that day's plan — mirrors
   * findEarliestIncompleteMealBefore's periodsInPlan concept, snapshotted so
   * a later change to which periods a plan includes can't retroactively
   * change what an old day required. */
  periodsInPlan: MealPeriod[];
  /** The nutrition targets actually in effect that day — snapshotted rather
   * than always reading the live NUTRITION_TARGETS constant, so a future
   * per-client/per-phase target change can't rewrite the meaning of past
   * days. */
  targetsSnapshot: NutritionTargets;
}

// ---------------------------------------------------------------------------
// Cardio day
// ---------------------------------------------------------------------------

/** Whether the client's coach-assigned program actually prescribes cardio
 * this day — a separate axis from what was logged, mirroring how
 * TrainingDayType separates a day's *type* from its lifecycle/outcome. Set
 * once at snapshot time from lib/mock-data.ts's isCardioAssignedForDay, so
 * a later change to a client's assigned schedule can never retroactively
 * rewrite what a past day required — same snapshot-integrity reasoning as
 * prescribedWorkoutSnapshot below. */
export type CardioDayType = "scheduled" | "not_scheduled";

/** Every DailyRecord written going forward always carries a real
 * cardioDayType, but a record archived before this field existed has none
 * at all in storage — this resolves that gap the same honest way the rest
 * of this app treats a sparse/legacy record (see e.g. HistoricalTrainingModel's
 * hasWorkoutDetail/hasAnySetDetail): a day with no recorded assignment at
 * all keeps behaving as "scheduled", the one universal assumption every
 * record written before per-day cardio assignment existed was already
 * built on, rather than being silently reclassified as "not_scheduled". */
export function resolvedCardioDayType(cardio: CardioDaySnapshot): CardioDayType {
  return cardio.cardioDayType ?? "scheduled";
}

export interface CardioDaySnapshot {
  cardioDayType: CardioDayType;
  status: "not-started" | "in-progress" | "completed" | "partial" | "skipped";
  durationMin: number;
  /** Deep copy of the CardioOption actually selected/completed against —
   * never a live optionId reference, for the same snapshot-integrity reason
   * as prescribedWorkoutSnapshot above. Null when cardio was never started
   * (including every not_scheduled day). */
  selectedOptionSnapshot: CardioOption | null;
  note?: string;
  skipReason?: SkipReason;
  completedAtIso?: string;
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export interface WeightSnapshot {
  weightLb: number | null;
  loggedAtIso?: string;
  skipped: boolean;
}

// ---------------------------------------------------------------------------
// DailyRecord
// ---------------------------------------------------------------------------

/**
 * One archived day. Raw facts only — see module doc. `id` is deterministic
 * (see buildDailyRecordId) rather than randomly generated, so repeated
 * archival attempts for the same (workspace, client, enrollment, date,
 * source) tuple always target the same record instead of accumulating
 * duplicates — the HistoryStore's idempotent put relies on this.
 */
export interface DailyRecord extends RecordAttribution {
  id: string;
  enrollmentId: ProgramEnrollmentId;
  dateIso: string;
  dayOfWeek: DayOfWeek;
  /** Null when the date fell outside the enrollment's active weeks (see
   * lib/scheduling/enrollment.ts's deriveProgramWeek) — never coerced to a
   * guessed week number. */
  programWeek: number | null;
  programPhase: ProgramPhase;
  training: TrainingDaySnapshot;
  nutrition: NutritionDaySnapshot;
  cardio: CardioDaySnapshot;
  weight: WeightSnapshot;
}

export function buildDailyRecordId(params: {
  workspaceId: string;
  clientId: string;
  enrollmentId: string;
  dateIso: string;
  source: RecordSource;
}): string {
  return `daily:${params.workspaceId}:${params.clientId}:${params.enrollmentId}:${params.dateIso}:${params.source}`;
}

// ---------------------------------------------------------------------------
// Correction
// ---------------------------------------------------------------------------

/**
 * A single field-level correction applied on top of an archived DailyRecord.
 * The original DailyRecord is never mutated — see
 * lib/history/apply-corrections.ts's applyCorrections, which derives the
 * effective/corrected view deterministically from (record, corrections[])
 * without ever rewriting the stored original.
 */
export interface Correction extends RecordAttribution {
  id: string;
  enrollmentId: ProgramEnrollmentId;
  dailyRecordId: string;
  effectiveDateIso: string;
  /** Dot-path into the DailyRecord this correction targets, e.g.
   * "weight.weightLb" or "training.sessionStatus". */
  fieldPath: string;
  previousValue: unknown;
  correctedValue: unknown;
  reason?: string;
  evidenceRefs?: EvidenceRef[];
}

export function buildCorrectionId(params: { dailyRecordId: string; fieldPath: string; createdAtIso: string }): string {
  return `correction:${params.dailyRecordId}:${params.fieldPath}:${params.createdAtIso}`;
}

// ---------------------------------------------------------------------------
// WeeklyReview — minimal shape (Phase 4.4 builds the real submission flow;
// Phase 4.1 only needs a shape deriveCheckInStatus can read from and the
// demo fixture can seed one representative example into).
// ---------------------------------------------------------------------------

export type WeeklyReviewStatus = "in_progress" | "submitted" | "reviewed" | "adjustments_ready" | "completed";

export interface WeeklyReview extends RecordAttribution {
  id: string;
  enrollmentId: ProgramEnrollmentId;
  /** Local date (YYYY-MM-DD) the reviewed week starts on. */
  weekStartDateIso: string;
  programWeek: number | null;
  status: WeeklyReviewStatus;
  submittedAtIso?: string;
  reviewedAtIso?: string;
  clientNote?: string;
  coachNote?: string;
  /** Explicit authorship for coachNote so an assistant-drafted note can
   * never silently read as the coach's own words — see
   * lib/history/shared-types.ts's Authorship doc. */
  coachNoteAuthorship?: Authorship;
  evidenceRefs?: EvidenceRef[];
}

export function buildWeeklyReviewId(params: { workspaceId: string; clientId: string; enrollmentId: string; weekStartDateIso: string }): string {
  return `weekly-review:${params.workspaceId}:${params.clientId}:${params.enrollmentId}:${params.weekStartDateIso}`;
}
