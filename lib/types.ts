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
  | "workout-window"
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

export type ScheduleChangeChoice =
  | "earlier-than-planned"
  | "later-than-planned"
  | "cannot-train-today"
  | "not-sure-yet";

export interface WorkoutWindowState {
  status: "pending" | "activated" | "rescheduled" | "declined";
  windowStartIso?: string;
  windowEndIso?: string;
  chosenTimeLabel?: string;
  scheduleChangeChoice?: ScheduleChangeChoice;
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

export interface CardioLog {
  status: "not-started" | "in-progress" | "completed" | "skipped";
  durationMin: number;
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
// Progress
// ---------------------------------------------------------------------------

export interface ProgressMetric {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
  helpText?: string;
}

export interface WeightPoint {
  dateIso: string;
  weightLb: number;
}

export interface WeeklyCompletionPoint {
  weekLabel: string;
  completionPercent: number;
}

export interface AdherencePoint {
  weekLabel: string;
  adherencePercent: number;
}

export interface StrengthPoint {
  dateIso: string;
  topSetWeightLb: number;
}

export interface Milestone {
  id: string;
  dateIso: string;
  title: string;
  detail: string;
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
