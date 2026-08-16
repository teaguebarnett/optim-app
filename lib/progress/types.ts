// Phase 4.2 — Progress dashboard view-model types.
//
// Presentation components (app/progress/page.tsx and components/progress/*)
// consume ONLY these already-derived models — they never read storage, call
// a Phase 4.1 derivation function, or do date/timezone math themselves. See
// lib/progress/build-dashboard.ts, the one place that assembles a
// ProgressDashboardModel from live/archived history.

import type { AuthorKind } from "../history/shared-types";
import type { CheckInStatus, ProgramPhase } from "../scheduling/types";
import type { DomainOutcome } from "../history/derive-day-status";
import type { DayOfWeek } from "../types";

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
  checkIn: CheckInCardModel;
  coachGuidance: CoachGuidanceCardModel;
}
