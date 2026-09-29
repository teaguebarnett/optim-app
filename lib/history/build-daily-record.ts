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
import { cardioPrescriptionForClient, isCardioAssignedForDay } from "../mock-data.ts";
import { ALL_CLIENT_PROFILES } from "../tenancy/seed.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import { deriveProgramPhase, deriveProgramWeek } from "../scheduling/enrollment.ts";
import { resolveScheduledWorkoutForStart } from "../workout/resolve-scheduled-workout.ts";
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

  const clientDeclaredRest = state.dailyTrainingPlan?.status === "rest_day";
  const trainingDayType: TrainingDayType = clientDeclaredRest ? "scheduled_rest" : "scheduled_workout";
  // Prefer the session's own resolvedWorkout snapshot (see
  // WorkoutSession.resolvedWorkout) — the real, frozen prescription an
  // actually-started session was built from, immune to a same-day program
  // edit after the fact — falling back to resolving today's real scheduled
  // workout (the exact same START_WORKOUT resolution — see
  // lib/workout/resolve-scheduled-workout.ts — including its own-day-of-week
  // demo fallback) for a day that hasn't been started yet. Never the old
  // global demo-catalog lookup by id, which only ever recognized
  // PUSH_WORKOUT's own id and silently resolved to null for any real
  // client's own assigned program.
  // Phase 6A — a real Supabase client whose real assignment exists only in
  // the universal grammar (assignedUniversalProgram set, but assignedProgram
  // undefined because the content isn't legacy-representable — e.g.
  // continuous or mixed) must NEVER fall through to
  // resolveScheduledWorkoutForStart's own no-assignedProgram branch: that
  // branch's PUSH_WORKOUT fallback is calibrated for the genuinely
  // assignment-less demo client (see that function's own doc), not for a
  // real client whose real program this legacy-only resolver simply can't
  // represent. Legacy (schemaVersion 1) Supabase clients are unaffected —
  // assignedProgram is set for them, so this check is false and the
  // existing resolution below runs exactly as before.
  const universalOnlyRealClient = state.assignedUniversalProgram !== undefined && state.assignedProgram === undefined;
  const prescribedWorkout =
    trainingDayType === "scheduled_workout"
      ? (state.workoutSession.resolvedWorkout ??
        (universalOnlyRealClient
          ? null
          : resolveScheduledWorkoutForStart({
              dateIso,
              programEnrollment: enrollment,
              assignedProgram: state.assignedProgram,
              clientDeclaredRest,
            }).workout))
      : null;

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
    continuousExecutions: state.workoutSession.continuousExecutions ? deepClone(state.workoutSession.continuousExecutions) : undefined,
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
    targetsSnapshot: state.nutritionTargets ? deepClone(state.nutritionTargets) : null,
  };

  const cardioOption =
    cardioPrescriptionForClient(state.clientId).options.find((o) => o.id === state.cardio.selectedOptionId) ?? null;
  const cardio: CardioDaySnapshot = {
    cardioDayType: isCardioAssignedForDay(state.clientId, localDateDayOfWeek(dateIso)) ? "scheduled" : "not_scheduled",
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
