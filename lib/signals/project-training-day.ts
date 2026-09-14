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

    // Phase 11A — closes two real, pre-existing gaps this phase's own audit
    // found in this loop (never projected for continuous work either, not
    // just interval): a real distance actual, and RPE — both explicitly
    // required raw facts for interval per spec section 24, and a strict,
    // safe improvement for continuous too (only ever emitted when the
    // client actually provided one — never fabricated).
    const distanceValue = execution.actual?.distance?.value;
    if (typeof distanceValue === "number" && execution.actual?.distance?.unit) {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "continuous_distance",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: distanceValue },
        unit: execution.actual.distance!.unit,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    const rpe = execution.actual?.rpe;
    if (typeof rpe === "number") {
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "rpe",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: rpe },
        unit: "rpe",
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    // Phase 11A — interval-only: real completed-round count (spec section
    // 24's "completed rounds" — never a derived "conditioning score").
    // Deliberately NOT "prescribed rounds" here: this function only ever
    // receives TrainingDaySnapshot, which has no reference to the original
    // universal item's own prescription for a non-legacy-representable
    // family like interval (prescribedWorkoutSnapshot is legacy-only and
    // never populated for one) — fabricating a "prescribed" count from the
    // execution record's own roundActuals length would be dishonest
    // whenever the activity was genuinely partial (it would silently
    // read as "fully prescribed = whatever was attempted"). The real
    // prescription is already durably preserved unmutated on the program
    // version itself; this projection stays limited to what it can state
    // honestly from execution data alone.
    if (execution.roundActuals) {
      const completedRounds = execution.roundActuals.filter((r) => r.status === "completed").length;
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "completed_rounds",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: completedRounds },
        unit: null,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    // Phase 11B — circuit-only: the SAME "completed_rounds" metric key as
    // interval above — both express the same real concept (how many
    // round-exposures this specific item completed), and a downstream
    // consumer reading this fact generically shouldn't need to know
    // whether it came from an interval or a circuit. Same honest
    // "never fabricate prescribed rounds" posture as interval's own doc
    // just above.
    if (execution.circuitRoundActuals) {
      const completedRounds = execution.circuitRoundActuals.filter((r) => r.status === "completed").length;
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "completed_rounds",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: completedRounds },
        unit: null,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    // Phase 11C — power-only: the SAME "completed_rounds" metric key as
    // interval/circuit above — a power item's own completed-set count is
    // the same real "how many repetition-exposures this item completed"
    // concept. Same honest "never fabricate a prescribed count, never
    // build advanced analytics — preserve facts first" posture.
    if (execution.powerSetActuals) {
      const completedSets = execution.powerSetActuals.filter((s) => s.status === "completed").length;
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "completed_rounds",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: completedSets },
        unit: null,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    // Phase 11C — mobility-only: the SAME "completed_rounds" metric key,
    // counting completed set/side exposures. Never a fabricated
    // "flexibility score" or "mobility score" (spec section 27).
    if (execution.mobilitySetActuals) {
      const completedExposures = execution.mobilitySetActuals.filter((s) => s.status === "completed").length;
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "completed_rounds",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: completedExposures },
        unit: null,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }

    // Phase 11D — EMOM-only: the SAME "completed_rounds" metric key,
    // counting completed cadence windows. A genuine AMRAP/time-capped
    // circuit needs no new projection code at all here — it is still a
    // real `kind:"circuit"` block, so its items already carry
    // circuitRoundActuals and are already covered by the branch above.
    // No "MetCon score"/"work capacity score" anywhere (spec section 35).
    if (execution.emomWindowActuals) {
      const completedWindows = execution.emomWindowActuals.filter((w) => w.status === "completed").length;
      observations.push({
        clientProfileId,
        workspaceId,
        category: "training_performance",
        metricKey: "completed_rounds",
        sourceType: "workout_execution",
        value: { valueType: "numeric", valueNumeric: completedWindows },
        unit: null,
        sourceRef: itemRef,
        trainingItemInstanceId: itemId,
        observedAtIso: itemObservedAtIso,
      });
    }
  }

  return observations;
}
