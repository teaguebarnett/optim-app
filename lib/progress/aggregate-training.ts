// Weekly training aggregation — pure, built strictly on top of Phase 4.1's
// per-day deriveTrainingAdherence. Aggregates raw working-set numerators and
// denominators across evaluable days rather than averaging each day's own
// ratio (a day with 3/3 sets and a day with 0/12 sets must not average to a
// misleadingly "50%" week).

import { deriveTrainingAdherence } from "../history/derive-training-adherence.ts";
import { catalogWorkoutForDay, trainingWeekEntryForDay } from "../mock-data.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import type { DayRecordSlot } from "./collect-week-records";
import type { TrainingCardModel, TrainingDayOutcome, TrainingDaySummaryModel } from "./types";
import type { TrainingDayType } from "../history/types";

function scheduleTrainingDayType(dayOfWeek: ReturnType<typeof localDateDayOfWeek>): TrainingDayType {
  const entry = trainingWeekEntryForDay(dayOfWeek);
  if (!entry) return "no_session_scheduled";
  return entry.type === "training" ? "scheduled_workout" : "scheduled_rest";
}

function scheduleWorkoutLabel(dayOfWeek: ReturnType<typeof localDateDayOfWeek>): string {
  const catalogWorkout = catalogWorkoutForDay(dayOfWeek);
  if (catalogWorkout) return catalogWorkout.name;
  const entry = trainingWeekEntryForDay(dayOfWeek);
  return entry?.workoutName ?? "Workout";
}

export function aggregateTraining(slots: DayRecordSlot[]): TrainingCardModel {
  const days: TrainingDaySummaryModel[] = [];
  let scheduledWorkoutDays = 0;
  let evaluableWorkoutDays = 0;
  let fullyCompletedCount = 0;
  let partialOrEndedEarlyCount = 0;
  let skippedCount = 0;
  let completedSets = 0;
  let prescribedSets = 0;

  for (const slot of slots) {
    const dayOfWeek = localDateDayOfWeek(slot.dateIso);

    if (!slot.record) {
      // No archived/projected record — classify purely from the schedule
      // template, never fabricating an outcome for a day with no evidence.
      const trainingDayType = scheduleTrainingDayType(dayOfWeek);
      if (trainingDayType === "scheduled_workout") scheduledWorkoutDays += 1;
      const label = trainingDayType === "scheduled_workout" ? scheduleWorkoutLabel(dayOfWeek) : trainingDayType === "scheduled_rest" ? "Rest day" : "No session scheduled";
      const outcome: TrainingDayOutcome = slot.isFuture ? "future" : "no_record";
      days.push({ dateIso: slot.dateIso, dayOfWeek, label, trainingDayType, outcome, resolvedWithContext: false, isToday: slot.isToday });
      continue;
    }

    const trainingDayType = slot.record.training.trainingDayType;
    const label =
      trainingDayType === "scheduled_workout"
        ? slot.record.training.prescribedWorkoutSnapshot?.name ?? scheduleWorkoutLabel(dayOfWeek)
        : trainingDayType === "scheduled_rest"
          ? "Rest day"
          : "No session scheduled";

    if (trainingDayType === "scheduled_workout") scheduledWorkoutDays += 1;

    let outcome: TrainingDayOutcome;
    let resolvedWithContext = false;

    if (trainingDayType !== "scheduled_workout") {
      outcome = "not_applicable";
    } else if (slot.isFuture) {
      outcome = "future";
    } else {
      const result = deriveTrainingAdherence(slot.record);
      outcome = result.outcome;
      resolvedWithContext = result.resolvedWithContext;
      if (result.outcome !== "not_applicable") {
        evaluableWorkoutDays += 1;
        if (result.outcome === "complete") fullyCompletedCount += 1;
        else if (result.outcome === "partial") partialOrEndedEarlyCount += 1;
        else if (result.outcome === "missed") skippedCount += 1;
        completedSets += slot.record.training.workingSetsCompleted;
        prescribedSets += slot.record.training.workingSetsPrescribed;
      }
    }

    days.push({ dateIso: slot.dateIso, dayOfWeek, label, trainingDayType, outcome, resolvedWithContext, isToday: slot.isToday });
  }

  const adherenceRatio = prescribedSets > 0 ? Math.min(1, completedSets / prescribedSets) : null;
  const status: TrainingCardModel["status"] =
    scheduledWorkoutDays === 0 ? "not_applicable" : evaluableWorkoutDays === 0 ? "insufficient_data" : "ok";

  return {
    scheduledWorkoutDays,
    evaluableWorkoutDays,
    fullyCompletedCount,
    partialOrEndedEarlyCount,
    skippedCount,
    adherenceRatio,
    status,
    days,
  };
}
