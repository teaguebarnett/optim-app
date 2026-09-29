// Phase 4.3 — Historical Day Review derivation.
//
// The one place a single archived day (with corrections applied) is turned
// into a full, read-only HistoricalDayReviewModel. Reuses every Phase 4.1
// derivation function directly (deriveOverallAdherenceStatus,
// deriveTrainingAdherence, deriveMealPlanAdherence, deriveCardioAdherence,
// deriveCalorieTargetMet, deriveProteinTargetMet, sumKnownActualMacros) —
// never a competing adherence formula. Reuses lib/progress/
// collect-week-records.ts's collectSingleDayRecord for the exact same
// future/today/archived-with-corrections resolution every other Progress
// selector already uses, so a historical day can never diverge from how
// Today/Training/Progress themselves would describe that same date.
//
// "Today" is deliberately never eligible here — see HistoricalDayLookupResult
// — because it is still a live, unarchived day; reviewing it as "historical"
// would either show a stale snapshot or require re-deriving live state
// through this read-only path, and the spec is explicit that only completed/
// past dates open a Historical Day Review.

import { compareLocalDates, localDateDayOfWeek, addDaysToLocalDate, resolveClientLocalTime24 } from "../shared/local-date.ts";
import { deriveProgramPhase, deriveProgramWeek } from "../scheduling/enrollment.ts";
import { collectDateRangeRecords, collectSingleDayRecord } from "./collect-week-records.ts";
import type { CollectRecordsInput } from "./collect-week-records";
import { deriveOverallAdherenceStatus } from "../history/derive-day-status.ts";
import type { OverallAdherenceStatus } from "../history/derive-day-status";
import { deriveTrainingAdherence } from "../history/derive-training-adherence.ts";
import { deriveMealPlanAdherence, deriveCalorieTargetMet, deriveProteinTargetMet, sumKnownActualMacros } from "../history/derive-nutrition.ts";
import { deriveCardioAdherence } from "../history/derive-cardio.ts";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS } from "../mock-data.ts";
import type { HistoryScope, HistoryStore } from "../history/store";
import type { DailyRecord, ExerciseLogSnapshot } from "../history/types";
import type { ProgramEnrollment } from "../scheduling/types";
import type { AppState } from "../state";
import type {
  HistoricalCardioModel,
  HistoricalDayLookupResult,
  HistoricalDayReviewModel,
  HistoricalExerciseModel,
  HistoricalMealModel,
  HistoricalMealStatus,
  HistoricalNutritionModel,
  HistoricalPainReportModel,
  HistoricalSetModel,
  HistoricalTrainingModel,
  HistoricalWeightModel,
  HistoryDayPickerEntryModel,
  ProgressSource,
} from "./types";

export interface BuildHistoricalDayReviewInput {
  store: HistoryStore;
  scope: HistoryScope;
  source: ProgressSource;
  effectiveDateIso: string;
  enrollment: ProgramEnrollment;
  liveState: AppState | null;
  requestedDateIso: string;
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function formatTimeLabel(isoInstant: string | undefined, timeZone: string): string | null {
  if (!isoInstant) return null;
  return resolveClientLocalTime24(new Date(isoInstant), timeZone);
}

/** deriveOverallAdherenceStatus called with lifecycle "closed" can never
 * actually return "in_progress" — every caller in this file only ever
 * looks at strictly-past dates — but that guarantee lives in the
 * function's logic, not its return type, so it's asserted explicitly here
 * rather than silently widened away by a cast. */
function closedDayOverallStatus(record: DailyRecord): Exclude<OverallAdherenceStatus, "in_progress"> {
  const status = deriveOverallAdherenceStatus(record, "closed");
  if (status === "in_progress") {
    throw new Error("Historical Day Review: a closed-lifecycle day must never resolve to in_progress");
  }
  return status;
}

function buildTrainingSection(record: DailyRecord | null, timeZone: string): HistoricalTrainingModel {
  if (!record) {
    return {
      trainingDayType: "no_session_scheduled",
      sessionStatus: null,
      outcome: "no_record",
      resolvedWithContext: false,
      skipReason: null,
      skipNote: null,
      startedTimeLabel: null,
      completedTimeLabel: null,
      workoutName: null,
      focus: null,
      workingSetsCompleted: 0,
      workingSetsPrescribed: 0,
      hasWorkoutDetail: false,
      hasAnySetDetail: false,
      exercises: [],
      painReports: [],
    };
  }

  const training = record.training;
  const adherence = deriveTrainingAdherence(record);
  const snapshot = training.prescribedWorkoutSnapshot;
  const hasAnySetDetail = Object.values(training.exerciseLogs).some((log) => log.loggedSets.length > 0);

  const exercises: HistoricalExerciseModel[] = snapshot
    ? [...snapshot.exercises]
        .sort((a, b) => a.order - b.order)
        .map((exercise) => {
          const log: ExerciseLogSnapshot | undefined = training.exerciseLogs[exercise.id];
          const sets: HistoricalSetModel[] = (log?.loggedSets ?? [])
            .slice()
            .sort((a, b) => a.setNumber - b.setNumber)
            .map((set) => ({
              setNumber: set.setNumber,
              isWarmup: set.isWarmup,
              weightLb: set.weightLb,
              reps: set.reps,
              rpe: set.rpe,
              status: set.status,
              skipReason: set.skipReason ?? null,
              note: set.note ?? null,
            }));
          return {
            exerciseId: exercise.id,
            name: exercise.name,
            order: exercise.order,
            status: log?.status ?? "not-started",
            skipReason: log?.skipReason ?? null,
            skipNote: log?.skipNote ?? null,
            sets,
            hasSetDetail: sets.length > 0,
          };
        })
    : [];

  const painReports: HistoricalPainReportModel[] = training.painReports.map((report) => ({
    exerciseName: snapshot?.exercises.find((e) => e.id === report.exerciseId)?.name ?? null,
    location: report.location,
    ratingZeroToTen: report.ratingZeroToTen,
    onset: report.onset,
    note: report.note ?? null,
  }));

  return {
    trainingDayType: training.trainingDayType,
    sessionStatus: training.sessionStatus,
    outcome: adherence.outcome,
    resolvedWithContext: adherence.resolvedWithContext,
    skipReason: training.skipReason ?? null,
    skipNote: training.skipNote ?? null,
    startedTimeLabel: formatTimeLabel(training.startedAtIso, timeZone),
    completedTimeLabel: formatTimeLabel(training.completedAtIso, timeZone),
    workoutName: snapshot?.name ?? null,
    focus: snapshot?.focus ?? null,
    workingSetsCompleted: training.workingSetsCompleted,
    workingSetsPrescribed: training.workingSetsPrescribed,
    hasWorkoutDetail: snapshot !== null,
    hasAnySetDetail,
    exercises,
    painReports,
  };
}

function mealStatus(source: string | undefined): HistoricalMealStatus {
  if (source === "option") return "completed";
  // A photo estimate is a client-confirmed replacement for the catalog
  // option, the same way a manual entry is — see MealSelectionSource's doc
  // in lib/types.ts.
  if (source === "manual" || source === "photo-estimate") return "replaced";
  if (source === "skipped") return "skipped";
  if (source === "planned-later") return "planned_later";
  return "not_logged";
}

function buildNutritionSection(record: DailyRecord | null, timeZone: string): HistoricalNutritionModel {
  if (!record) {
    return {
      mealPlanOutcome: "no_record",
      meals: [],
      totals: null,
      targets: null,
      calorieResult: "insufficient_data",
      proteinResult: "insufficient_data",
    };
  }

  const { meals, periodsInPlan, targetsSnapshot } = record.nutrition;
  const mealPlan = deriveMealPlanAdherence(record);
  const { totals, allKnown } = sumKnownActualMacros(record);

  const mealModels: HistoricalMealModel[] = periodsInPlan.map((period) => {
    const selection = meals[period];
    return {
      period,
      label: MEAL_PERIOD_LABELS[period],
      status: mealStatus(selection?.source),
      itemName:
        selection?.source === "manual" || selection?.source === "photo-estimate"
          ? selection.manualName ?? null
          : selection?.source === "option"
            ? MEAL_OPTIONS[period]?.find((o) => o.id === selection.optionId)?.name ?? null
            : null,
      isEstimate: !!selection?.isEstimate,
      actualTimeLabel: formatTimeLabel(selection?.completedAtIso, timeZone),
      skipReason: selection?.skipReason ?? null,
      skipNote: selection?.skipNote ?? null,
      macros: selection?.macros ?? null,
      // Gate 3D — read straight from this exact archived selection's own
      // snapshot, never recomputed from the live catalog/rule registry.
      mealIntent: selection?.mealIntent ?? null,
    };
  });

  return {
    mealPlanOutcome: mealPlan.outcome,
    meals: mealModels,
    totals: allKnown ? totals : null,
    targets: targetsSnapshot,
    calorieResult: deriveCalorieTargetMet(record),
    proteinResult: deriveProteinTargetMet(record),
  };
}

function buildCardioSection(record: DailyRecord | null, timeZone: string): HistoricalCardioModel {
  if (!record) {
    return {
      status: "not-started",
      outcome: "no_record",
      durationMin: 0,
      targetDurationMin: null,
      optionName: null,
      usedApprovedAlternative: false,
      skipReason: null,
      completedTimeLabel: null,
    };
  }
  const cardio = record.cardio;
  const adherence = deriveCardioAdherence(record);
  return {
    status: cardio.status,
    outcome: adherence.outcome,
    durationMin: cardio.durationMin,
    targetDurationMin: cardio.selectedOptionSnapshot?.targetDurationMin ?? null,
    optionName: cardio.selectedOptionSnapshot?.displayName ?? null,
    usedApprovedAlternative: !!cardio.selectedOptionSnapshot && !cardio.selectedOptionSnapshot.isDefault,
    skipReason: cardio.skipReason ?? null,
    completedTimeLabel: formatTimeLabel(cardio.completedAtIso, timeZone),
  };
}

function buildWeightSection(record: DailyRecord | null, isCorrected: boolean, timeZone: string): HistoricalWeightModel {
  if (!record) {
    return { weightLb: null, loggedTimeLabel: null, skipped: false, isCorrected: false };
  }
  return {
    weightLb: record.weight.weightLb,
    loggedTimeLabel: formatTimeLabel(record.weight.loggedAtIso, timeZone),
    skipped: record.weight.skipped,
    isCorrected,
  };
}

/**
 * Resolves one requested date into a full HistoricalDayReviewModel, or an
 * explicit ineligibility reason. Never throws on a sparse/legacy record —
 * every section above degrades to an honest "not recorded" shape instead.
 */
export function buildHistoricalDayReview(input: BuildHistoricalDayReviewInput): HistoricalDayLookupResult {
  if (!DATE_FORMAT.test(input.requestedDateIso)) {
    return { status: "invalid_date" };
  }

  const comparison = compareLocalDates(input.requestedDateIso, input.effectiveDateIso);
  if (comparison > 0) return { status: "future" };
  if (comparison === 0) return { status: "today" };

  const collectInput: CollectRecordsInput = {
    store: input.store,
    scope: input.scope,
    source: input.source,
    effectiveDateIso: input.effectiveDateIso,
    enrollment: input.enrollment,
    liveState: input.liveState,
  };

  const slot = collectSingleDayRecord(collectInput, input.requestedDateIso);
  const record = slot.record;
  const timeZone = input.enrollment.timeZone;

  const dayOfWeek = localDateDayOfWeek(input.requestedDateIso);
  const programWeek = deriveProgramWeek(input.enrollment, input.requestedDateIso);
  const programPhase = deriveProgramPhase(input.enrollment, input.requestedDateIso);
  const overallStatus = record ? closedDayOverallStatus(record) : "no_record";
  const isWeightCorrected = slot.correctedFieldPaths.includes("weight.weightLb");

  const review: HistoricalDayReviewModel = {
    source: input.source,
    summary: {
      dateIso: input.requestedDateIso,
      dayOfWeek,
      programWeek,
      programPhase,
      hasRecord: record !== null,
      overallStatus,
    },
    training: buildTrainingSection(record, timeZone),
    nutrition: buildNutritionSection(record, timeZone),
    cardio: buildCardioSection(record, timeZone),
    weight: buildWeightSection(record, isWeightCorrected, timeZone),
  };

  return { status: "ok", review };
}

/**
 * Recent selectable past days for the Progress "History" entry point — see
 * components/progress/history-day-picker.tsx. Always strictly before
 * `effectiveDateIso` (today is never included; see buildHistoricalDayReview's
 * module doc) and never before the enrollment's own start date, so a picker
 * for a client early in an 8-week program never offers dates before their
 * program began.
 *
 * Chronological order, oldest first — this is a timeline, and the timeline
 * reads left-to-right like every other date sequence in this app (e.g.
 * TrainingCardModel.days). The picker component is responsible for scrolling
 * to the most recent (rightmost) entry on initial render; this function
 * never reorders for that — see HistoryDayPicker's initial-scroll effect.
 */
export function buildHistoryDayPickerEntries(
  input: Omit<BuildHistoricalDayReviewInput, "requestedDateIso">,
  windowDays: number = 14
): HistoryDayPickerEntryModel[] {
  const yesterday = addDaysToLocalDate(input.effectiveDateIso, -1);
  if (compareLocalDates(yesterday, input.enrollment.startDateIso) < 0) return [];

  const earliestByWindow = addDaysToLocalDate(input.effectiveDateIso, -windowDays);
  const rangeStart =
    compareLocalDates(earliestByWindow, input.enrollment.startDateIso) > 0 ? earliestByWindow : input.enrollment.startDateIso;

  const collectInput: CollectRecordsInput = {
    store: input.store,
    scope: input.scope,
    source: input.source,
    effectiveDateIso: input.effectiveDateIso,
    enrollment: input.enrollment,
    liveState: input.liveState,
  };

  const slots = collectDateRangeRecords(collectInput, rangeStart, yesterday);

  return slots.map((slot) => ({
    dateIso: slot.dateIso,
    dayOfWeek: localDateDayOfWeek(slot.dateIso),
    shortLabel: new Date(`${slot.dateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    status: slot.record ? closedDayOverallStatus(slot.record) : ("no_record" as const),
  }));
}
