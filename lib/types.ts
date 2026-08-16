// Core domain types for the OPTIM client prototype.
// Business rules live in lib/calculations.ts and lib/workout-analysis.ts,
// not in these type definitions.
//
// Client/coach identity now lives in lib/tenancy/types.ts (ClientProfile,
// CoachProfile) so every workspace can have its own — this file only
// re-imports the tenant-attribution types it needs to stamp onto records.

import type { ClientProfileId, WorkspaceId } from "./tenancy/types";

export type ClientId = ClientProfileId;

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export type MealPeriod =
  | "breakfast"
  | "postWorkout"
  | "lunch"
  | "dinner"
  | "snack";

export interface MacroValues {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealOption {
  id: string;
  period: MealPeriod;
  name: string;
  description: string;
  mainIngredients: string[];
  macros: MacroValues;
}

export type MealSelectionSource = "option" | "manual" | "skipped" | "planned-later";

export interface MealSelection {
  period: MealPeriod;
  source: MealSelectionSource;
  optionId?: string;
  manualName?: string;
  macros?: MacroValues;
  isEstimate?: boolean;
  completedAtIso?: string;
  skipReason?: SkipReason;
  skipNote?: string;
}

export interface NutritionTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export type RpeValue = 6 | 7 | 8 | 9 | 10;

export interface PrescribedSet {
  setNumber: number;
  isWarmup: boolean;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  /** The coach's prescribed load for this set, when set. Working sets use
   * this to show a read-only "prescribed weight" instead of asking the
   * client to type one in — see components/workout/set-row.tsx. Warm-up
   * sets may also carry a (lighter) suggested weight purely for the
   * non-interactive guidance text; it's never required or logged. */
  prescribedWeightLb?: number;
  /** A single representative target rep count (derived from targetRepsLow/
   * High) so a working set can display and auto-log one crisp number
   * instead of asking the client to pick from a range — see
   * components/workout/set-row.tsx. */
  prescribedReps: number;
}

export interface PreviousPerformanceEntry {
  weightLb: number;
  reps: number;
  rpe: RpeValue;
}

export interface Exercise {
  id: string;
  order: number;
  name: string;
  warmupSets: number;
  workingSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  restSeconds: number;
  tempo: string;
  cue: string;
  previousPerformance: PreviousPerformanceEntry[];
  prescribedSets: PrescribedSet[];
}

export interface Workout {
  id: string;
  /** The workspace whose program library this workout belongs to — program
   * content is workspace-specific even though today's prototype only has
   * one workspace's catalog. */
  workspaceId: WorkspaceId;
  name: string;
  dayOfWeek: DayOfWeek;
  focus: string;
  estimatedDurationMin: number;
  warmupOverview: string;
  coachNote: string;
  exercises: Exercise[];
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export interface LoggedSet {
  id: string;
  exerciseId: string;
  setNumber: number;
  isWarmup: boolean;
  weightLb: number | null;
  reps: number | null;
  rpe: RpeValue | null;
  note?: string;
  completedAtIso?: string;
  status: "completed" | "skipped";
  skipReason?: SkipReason;
}

export interface ExerciseLog {
  exerciseId: string;
  status: "not-started" | "in-progress" | "completed" | "skipped";
  loggedSets: LoggedSet[];
  skipReason?: SkipReason;
  skipNote?: string;
}

export type SkipReason =
  | "out-of-time"
  | "pain-or-discomfort"
  | "equipment-unavailable"
  | "feeling-sick"
  | "excessive-fatigue"
  | "schedule-conflict"
  | "forgot"
  | "other";

export interface PainReport {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  createdAtIso: string;
  exerciseId?: string;
  location: string;
  ratingZeroToTen: number;
  onset: string;
  causedByMovement: string;
  continuedAfterSet: boolean;
  affectsOutsideGym: boolean;
  note?: string;
}

export type WorkoutSessionStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  /** The client ended the session before reaching "Complete workout," but
   * had already logged at least one valid working set. Distinct from
   * "skipped" (zero working sets ever completed) — a partial session must
   * never be described as skipped. See lib/state.ts's SKIP_WORKOUT case. */
  | "ended-early"
  | "skipped";

export interface WorkoutSession {
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  workoutId: string;
  status: WorkoutSessionStatus;
  startedAtIso?: string;
  completedAtIso?: string;
  currentExerciseIndex: number;
  exerciseLogs: Record<string, ExerciseLog>;
  painReports: PainReport[];
  skipReason?: SkipReason;
  skipNote?: string;
  summary?: WorkoutSummary;
}

export interface WorkoutSummary {
  exercisesCompleted: number;
  exercisesSkipped: number;
  workingSetsCompleted: number;
  skippedSetsCount: number;
  missingRpeCount: number;
  averageRpe: number | null;
  painReportCount: number;
  durationMin: number;
  headline: string;
  detail: string;
  needsReview: boolean;
  /** True only when every prescribed working set has a valid logged RPE —
   * no skips anywhere in the session. Drives "Completed" vs "Submitted with
   * skipped work" in the UI. */
  fullyCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Daily plan / timeline
// ---------------------------------------------------------------------------

export type DailyTaskId =
  | "morning-weight"
  | "breakfast"
  | "workout"
  | "post-workout-meal"
  | "lunch"
  | "cardio"
  | "dinner"
  | "snack"
  | "daily-completion";

export type DailyTaskState =
  | "locked"
  | "upcoming"
  | "recommended-now"
  | "in-progress"
  | "completed"
  | "partially-completed"
  | "skipped"
  | "missed"
  | "needs-attention"
  | "awaiting-review";

export interface DailyTask {
  id: DailyTaskId;
  label: string;
  state: DailyTaskState;
}

export interface DailyPlan {
  dayOfWeek: DayOfWeek;
  dateIso: string;
  programWeek: number;
  programTotalWeeks: number;
  workoutId: string;
  cardioTarget: CardioTarget;
}

export interface CardioTarget {
  activity: string;
  durationMin: number;
  heartRateRangeLow: number;
  heartRateRangeHigh: number;
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

/**
 * One coach-approved cardio option. A CardioPrescription can list several —
 * e.g. a default steady-state option plus an approved time-saving
 * alternative — but the coach still controls exactly which options exist;
 * the client only ever picks among what's already approved, never an
 * arbitrary substitution.
 */
export interface CardioOption {
  id: string;
  type: string;
  displayName: string;
  isDefault: boolean;
  /** Short client-facing description of when this option makes sense, e.g.
   * "Approved time-saving alternative when you're short on time." */
  intendedUse: string;
  targetDurationMin: number;
  heartRateRangeLow?: number;
  heartRateRangeHigh?: number;
  /** Coach-authored protocol/instructions. Only ever real, coach-approved
   * content — never invented. */
  protocol: string;
}

/** A client's approved cardio plan for a given prescribed session. Coach-
 * controlled and configurable per client — see lib/mock-data.ts's
 * CARDIO_PRESCRIPTIONS_BY_CLIENT. Most clients will have exactly one option;
 * only a plan with more than one should ever show a picker. */
export interface CardioPrescription {
  options: CardioOption[];
}

export interface CardioLog {
  /** "partial" — the client stopped before completing the target duration
   * but had already logged some real time (durationMin > 0) when they
   * skipped. Distinct from "skipped" (zero minutes logged) the same way a
   * workout can be "ended-early" rather than "skipped" — see
   * WorkoutSessionStatus and Phase 4.1's cardio-partial correction. */
  status: "not-started" | "in-progress" | "completed" | "partial" | "skipped";
  durationMin: number;
  /** Which approved CardioOption this log reflects — null/undefined until
   * the client starts or completes cardio using a specific option. Switching
   * options never rewrites a previously completed log; it only changes what
   * a *new* session is tracked against. */
  selectedOptionId?: string;
  note?: string;
  skipReason?: SkipReason;
  completedAtIso?: string;
}

export interface MorningWeightLog {
  weightLb: number | null;
  loggedAtIso?: string;
  skipped: boolean;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatSender = "client" | "assistant" | "coach" | "system";

export interface ChatMessage {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  /** Set only for sender === "coach", so a coach-authored message keeps its
   * author's identity even in a workspace with multiple coaches later. The
   * assistant is never attributed to a coach — see sender === "assistant". */
  authorCoachId?: string;
  sender: ChatSender;
  text: string;
  createdAtIso: string;
  isScripted?: boolean;
}

export interface ScriptedChatTopic {
  id: string;
  prompt: string;
  responseSender: Extract<ChatSender, "assistant" | "coach">;
  response: string;
}

// ---------------------------------------------------------------------------
// Review requests (things awaiting Teague's attention)
// ---------------------------------------------------------------------------

export type ReviewRequestKind =
  | "pain-report"
  | "rpe-anomaly"
  | "workout-skipped"
  | "schedule-change";

export interface ReviewRequest {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  kind: ReviewRequestKind;
  createdAtIso: string;
  summary: string;
  resolved: boolean;
}
