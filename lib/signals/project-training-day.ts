// Phase 8A — projects real, already-persisted workout-execution facts out
// of a TrainingDaySnapshot (lib/history/types.ts) into the observation
// model. The snapshot itself (and daily_records, its Supabase home) remains
// the sole canonical execution record — see this phase's completion report,
// "source record vs signal record" — this file only ever produces a
// normalized, lower-cardinality VIEW of it for longitudinal reasoning.
//
// Deliberately skips a "not-started"/"in-progress" item entirely (section
// 28: "focus on facts useful for coaching decisions," never one signal per
// meaningless implementation detail) — only a genuinely completed or
// skipped item produces anything.

import {
  buildDailyRecordItemObservationRef,
  buildDailyRecordObservationRef,
  type ClientObservationInput,
} from "./types.ts";
import type { TrainingDaySnapshot } from "../history/types";

const TERMINAL_SESSION_STATUSES = new Set(["completed", "ended-early", "skipped"]);
const TERMINAL_ITEM_STATUSES = new Set(["completed", "skipped"]);

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface ProjectTrainingDayParams {
  clientProfileId: string;
  workspaceId: string;
  dateIso: string;
  training: TrainingDaySnapshot;
}

export function projectTrainingDayObservations(params: ProjectTrainingDayParams): ClientObservationInput[] {
  const { clientProfileId, workspaceId, dateIso, training } = params;
  const observations: ClientObservationInput[] = [];
  const dayFallbackObservedAt = `${dateIso}T00:00:00.000Z`;
  const dayObservedAtIso = training.completedAtIso ?? training.startedAtIso ?? dayFallbackObservedAt;
  const dayRef = buildDailyRecordObservationRef({ clientProfileId, dateIso });

  if (training.sessionStatus && TERMINAL_SESSION_STATUSES.has(training.sessionStatus)) {
    observations.push({
      clientProfileId,
      workspaceId,
      category: "training_performance",
      metricKey: "session_status",
      sourceType: "workout_execution",
      value: { valueType: "categorical", valueText: training.sessionStatus },
      unit: null,
      sourceRef: dayRef,
      observedAtIso: dayObservedAtIso,
    });
    if (training.sessionStatus === "skipped" && training.skipReason) {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "adherence",
        metricKey: "skip_reason",
        sourceType: "workout_execution",
        value: { valueType: "categorical", valueText: training.skipReason },
        unit: null,
        sourceRef: dayRef,
        observedAtIso: dayObservedAtIso,
      });
    }
  }

  const continuousExecutions = training.continuousExecutions ?? {};

  for (const [itemId, log] of Object.entries(training.exerciseLogs)) {
    // A continuous item's status/skip-reason is emitted from its own,
    // richer ExecutionRecord below instead (it distinguishes "partial"
    // from "completed," which this narrower ExerciseLogSnapshot.status
    // cannot) — this loop only ever speaks for a genuinely resistance item.
    if (continuousExecutions[itemId]) continue;
    if (!TERMINAL_ITEM_STATUSES.has(log.status)) continue;
    const itemRef = buildDailyRecordItemObservationRef({ clientProfileId, dateIso, trainingItemInstanceId: itemId });
    const lastCompletedSet = [...log.loggedSets].reverse().find((s) => s.completedAtIso);
    const itemObservedAtIso = lastCompletedSet?.completedAtIso ?? dayObservedAtIso;

    observations.push({
      clientProfileId,
      workspaceId,
      category: "training_performance",
      metricKey: "exercise_status",
      sourceType: "workout_execution",
      value: { valueType: "categorical", valueText: log.status },
      unit: null,
      sourceRef: itemRef,
      trainingItemInstanceId: itemId,
      observedAtIso: itemObservedAtIso,
    });

    if (log.status === "skipped" && log.skipReason) {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "adherence",
        metricKey: "exercise_skip_reason",
        sourceType: "workout_execution",
        value: { valueType: "categorical", valueText: log.skipReason },
        unit: null,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    const completedWorkingSets = log.loggedSets.filter((s) => !s.isWarmup && s.status === "completed");
    const rpes = completedWorkingSets.map((s) => s.rpe).filter((v): v is Exclude<typeof v, null> => v !== null);
    if (rpes.length > 0) {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "rpe",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: average(rpes) },
        unit: "rpe",
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }
    const loads = completedWorkingSets.map((s) => s.weightLb).filter((v): v is number => typeof v === "number");
    if (loads.length > 0) {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "performed_load",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: Math.max(...loads) },
        unit: "lb",
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }
  }

  for (const [itemId, execution] of Object.entries(continuousExecutions)) {
    const itemRef = buildDailyRecordItemObservationRef({ clientProfileId, dateIso, trainingItemInstanceId: itemId });
    const itemObservedAtIso = execution.completedAtIso ?? dayObservedAtIso;

    observations.push({
      clientProfileId,
      workspaceId,
      category: "training_performance",
      metricKey: "exercise_status",
      sourceType: "workout_execution",
      value: { valueType: "categorical", valueText: execution.status },
      unit: null,
      sourceRef: itemRef,
      trainingItemInstanceId: itemId,
      observedAtIso: itemObservedAtIso,
    });

    observations.push({
      clientProfileId,
      workspaceId,
      category: "training_performance",
      metricKey: "performed_as_prescribed",
      sourceType: "workout_execution",
      value: { valueType: "boolean", valueBoolean: execution.performedAsPrescribed },
      unit: null,
      sourceRef: itemRef,
      trainingItemInstanceId: itemId,
      observedAtIso: itemObservedAtIso,
    });

    if (execution.status !== "completed" && execution.skipReason) {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "adherence",
        metricKey: "exercise_skip_reason",
        sourceType: "workout_execution",
        value: { valueType: "categorical", valueText: execution.skipReason },
        unit: null,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    const durationSeconds = execution.actual?.duration?.seconds;
    if (typeof durationSeconds === "number") {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "continuous_duration",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: durationSeconds },
        unit: "seconds",
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }
  }

  return observations;
}
