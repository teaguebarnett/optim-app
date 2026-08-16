// Builds a DailyRecord-shaped snapshot from live AppState. Pure — takes no
// action other than reading its inputs — and reusable both by archival (see
// lib/history/rollover.ts) and, in a later phase, by any live "today" view
// that wants to run the same derivation functions against the still-open
// day without persisting anything.
//
// Snapshot integrity: prescribedWorkoutSnapshot and selectedOptionSnapshot
// are deep copies of the catalog content actually in effect right now — not
// live workoutId/optionId references — so this record's meaning can never
// change if lib/mock-data.ts's catalog is edited later. See Phase 4.1 §1.

import { MEAL_ORDER } from "../calculations.ts";
import { NUTRITION_TARGETS, WORKOUTS_BY_ID, cardioPrescriptionForClient } from "../mock-data.ts";
import { ALL_CLIENT_PROFILES } from "../tenancy/seed.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import { deriveProgramPhase, deriveProgramWeek } from "../scheduling/enrollment.ts";
import { authorshipClient } from "./shared-types.ts";
import { buildDailyRecordId } from "./types.ts";
import type { RecordSource } from "./shared-types";
import type { ProgramEnrollment } from "../scheduling/types";
import type { AppState } from "../state";
import type { MealPeriod, Workout } from "../types";
import type {
  CardioDaySnapshot,
  DailyRecord,
  ExerciseLogSnapshot,
  MealSelectionSnapshot,
  NutritionDaySnapshot,
  TrainingDaySnapshot,
  TrainingDayType,
  WeightSnapshot,
} from "./types";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function countWorkingSetsPrescribed(workout: Workout | null): number {
  if (!workout) return 0;
  return workout.exercises.reduce((sum, exercise) => sum + exercise.prescribedSets.filter((s) => !s.isWarmup).length, 0);
}

function countWorkingSetsCompleted(state: AppState): number {
  return Object.values(state.workoutSession.exerciseLogs).reduce(
    (sum, log) => sum + log.loggedSets.filter((s) => !s.isWarmup && s.status === "completed").length,
    0
  );
}

export function buildDailyRecordFromLiveState(state: AppState, enrollment: ProgramEnrollment, source: RecordSource): DailyRecord {
  const dateIso = state.dateIso;
  const client = ALL_CLIENT_PROFILES.find((c) => c.id === state.clientId);
  const coachId = client?.primaryCoachId ?? "";

  // The live app assigns PUSH_WORKOUT as the default day's training unless
  // the client explicitly marked today a rest day — see the Phase 4.1 report
  // for why (no other day currently has a real, loggable workout; see
  // lib/mock-data.ts's TRAINING_WEEK, which is label-only beyond Monday).
  const trainingDayType: TrainingDayType = state.dailyTrainingPlan?.status === "rest_day" ? "scheduled_rest" : "scheduled_workout";
  const prescribedWorkout = trainingDayType === "scheduled_workout" ? WORKOUTS_BY_ID[state.workoutSession.workoutId] ?? null : null;

  const training: TrainingDaySnapshot = {
    trainingDayType,
    prescribedWorkoutSnapshot: prescribedWorkout ? deepClone(prescribedWorkout) : null,
    sessionStatus: trainingDayType === "scheduled_workout" ? state.workoutSession.status : null,
    exerciseLogs: deepClone(state.workoutSession.exerciseLogs) as unknown as Record<string, ExerciseLogSnapshot>,
    startedAtIso: state.workoutSession.startedAtIso,
    completedAtIso: state.workoutSession.completedAtIso,
    skipReason: state.workoutSession.skipReason,
    skipNote: state.workoutSession.skipNote,
    painReports: deepClone(state.workoutSession.painReports),
    workingSetsCompleted: trainingDayType === "scheduled_workout" ? countWorkingSetsCompleted(state) : 0,
    workingSetsPrescribed: countWorkingSetsPrescribed(prescribedWorkout),
  };

  // Every day currently shows the same five meal periods — see
  // lib/calculations.ts's MEAL_ORDER, the single canonical ordering the rest
  // of the app already treats as "today's plan." Snapshotted here rather
  // than re-read live later, per Phase 4.1 §1.
  const periodsInPlan: MealPeriod[] = [...MEAL_ORDER];
  const meals: Partial<Record<MealPeriod, MealSelectionSnapshot>> = {};
  for (const period of periodsInPlan) {
    const selection = state.meals[period];
    if (selection) meals[period] = deepClone(selection);
  }
  const nutrition: NutritionDaySnapshot = {
    meals,
    periodsInPlan,
    targetsSnapshot: deepClone(NUTRITION_TARGETS),
  };

  const cardioOption =
    cardioPrescriptionForClient(state.clientId).options.find((o) => o.id === state.cardio.selectedOptionId) ?? null;
  const cardio: CardioDaySnapshot = {
    status: state.cardio.status,
    durationMin: state.cardio.durationMin,
    selectedOptionSnapshot: cardioOption ? deepClone(cardioOption) : null,
    note: state.cardio.note,
    skipReason: state.cardio.skipReason,
    completedAtIso: state.cardio.completedAtIso,
  };

  const weight: WeightSnapshot = deepClone(state.morningWeight);

  return {
    id: buildDailyRecordId({
      workspaceId: state.workspaceId,
      clientId: state.clientId,
      enrollmentId: enrollment.id,
      dateIso,
      source,
    }),
    schemaVersion: 1,
    workspaceId: state.workspaceId,
    clientId: state.clientId,
    coachId,
    source,
    authorship: authorshipClient(state.clientId),
    createdAtIso: new Date().toISOString(),
    enrollmentId: enrollment.id,
    dateIso,
    dayOfWeek: localDateDayOfWeek(dateIso),
    programWeek: deriveProgramWeek(enrollment, dateIso),
    programPhase: deriveProgramPhase(enrollment, dateIso),
    training,
    nutrition,
    cardio,
    weight,
  };
}
