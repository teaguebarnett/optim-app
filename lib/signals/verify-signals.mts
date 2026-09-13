// Phase 8A — Longitudinal Client Intelligence: client observation
// foundation. Pure-logic proof for the framework-independent domain
// model — validation, the two projectors, deterministic idempotent
// source-ref construction, and the structural wearable-extensibility
// proof. The real Supabase-mode persistence/RLS/idempotent-write path is
// proven live instead — see scripts/e2e-client-observations.mts —
// matching this repo's established "pure logic here, e2e there" split.
//
// Run with: npm run verify:signals

import assert from "node:assert/strict";
import {
  validateClientObservationInput,
  buildDailyRecordObservationRef,
  buildDailyRecordItemObservationRef,
  buildEscalationObservationRef,
  InvalidObservationError,
  type ClientObservationInput,
} from "./types.ts";
import { projectTrainingDayObservations } from "./project-training-day.ts";
import { projectAcutePainObservations, projectBaselineInjuryObservations } from "./project-pain-report.ts";
import type { TrainingDaySnapshot } from "../history/types";

let passed = 0;
let failed = 0;
function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

const CLIENT_ID = "client-1";
const WORKSPACE_ID = "workspace-1";
const NOW_ISO = "2026-09-14T12:00:00.000Z";

function baseTraining(overrides: Partial<TrainingDaySnapshot> = {}): TrainingDaySnapshot {
  return {
    trainingDayType: "scheduled_workout",
    prescribedWorkoutSnapshot: null,
    sessionStatus: null,
    exerciseLogs: {},
    painReports: [],
    workingSetsCompleted: 0,
    workingSetsPrescribed: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A. Observation validation
// ---------------------------------------------------------------------------

console.log("\nA. Observation validation\n");

function validObservation(overrides: Partial<ClientObservationInput> = {}): ClientObservationInput {
  return {
    clientProfileId: CLIENT_ID,
    workspaceId: WORKSPACE_ID,
    category: "training_performance",
    metricKey: "rpe",
    sourceType: "workout_execution",
    value: { valueType: "numeric", valueNumeric: 8 },
    unit: "rpe",
    sourceRef: "daily_records:client-1:2026-09-14:item:bench",
    observedAtIso: NOW_ISO,
    ...overrides,
  };
}

check("a well-formed observation passes validation unchanged", () => {
  const input = validObservation();
  assert.deepEqual(validateClientObservationInput(input), input);
});

check("S: an unrecognized metric_key fails validation", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ metricKey: "johns_weird_sleep_metric" })), InvalidObservationError);
});

check("S: a metric_key/value_type mismatch fails validation (registry says numeric, given boolean)", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ metricKey: "rpe", value: { valueType: "boolean", valueBoolean: true } })), InvalidObservationError);
});

check("S: a metric_key/category mismatch fails validation", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ category: "recovery" })), InvalidObservationError);
});

check("S: a unit outside the metric's allowed set fails validation", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ unit: "kg" })), InvalidObservationError);
});

check("S: a unitless metric given a unit fails validation", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ metricKey: "session_status", category: "training_performance", value: { valueType: "categorical", valueText: "completed" }, unit: "lb" })), InvalidObservationError);
});

check("S: a non-finite numeric value fails validation", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ value: { valueType: "numeric", valueNumeric: Number.NaN } })), InvalidObservationError);
});

check("S: an empty categorical/text value fails validation", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ metricKey: "pain_reported", category: "pain_safety", value: { valueType: "text", valueText: "  " }, unit: null })), InvalidObservationError);
});

check("S: an invalid observedAtIso fails validation", () => {
  assert.throws(() => validateClientObservationInput(validObservation({ observedAtIso: "not-a-date" })), InvalidObservationError);
});

// ---------------------------------------------------------------------------
// B/C/D/E. Numeric, boolean, categorical, unit-aware observations
// ---------------------------------------------------------------------------

console.log("\nB/C/D/E. Numeric, boolean, categorical, and unit-aware observations\n");

check("B: a numeric observation (rpe) carries a real number and its unit", () => {
  const obs = validObservation();
  assert.equal(obs.value.valueType, "numeric");
  assert.equal((obs.value as { valueNumeric: number }).valueNumeric, 8);
  assert.equal(obs.unit, "rpe");
});

check("C: a boolean observation (performed_as_prescribed) carries a real boolean, not a stringified one", () => {
  const obs = validObservation({ metricKey: "performed_as_prescribed", value: { valueType: "boolean", valueBoolean: false }, unit: null });
  validateClientObservationInput(obs);
  assert.equal((obs.value as { valueBoolean: boolean }).valueBoolean, false);
});

check("D: a categorical observation (session_status) carries a controlled string value", () => {
  const obs = validObservation({ metricKey: "session_status", value: { valueType: "categorical", valueText: "completed" }, unit: null });
  validateClientObservationInput(obs);
  assert.equal((obs.value as { valueText: string }).valueText, "completed");
});

check("E: a unit-aware observation (performed_load) is rejected without its real unit and accepted with it", () => {
  const withoutUnit = validObservation({ metricKey: "performed_load", value: { valueType: "numeric", valueNumeric: 225 }, unit: null });
  assert.throws(() => validateClientObservationInput(withoutUnit), InvalidObservationError);
  const withUnit = { ...withoutUnit, unit: "lb" };
  assert.equal(validateClientObservationInput(withUnit).unit, "lb");
});

// ---------------------------------------------------------------------------
// F/G. Provenance retained; observed_at distinct from recorded_at
// ---------------------------------------------------------------------------

console.log("\nF/G. Provenance retained; observed time distinct from recorded time\n");

check("F: sourceType/sourceRef survive validation unchanged — provenance is never dropped", () => {
  const obs = validObservation({ sourceType: "onboarding", sourceRef: "escalation:esc-1:area:knee" });
  const result = validateClientObservationInput(obs);
  assert.equal(result.sourceType, "onboarding");
  assert.equal(result.sourceRef, "escalation:esc-1:area:knee");
});

check("G: observedAtIso (this domain model's only time field) is deliberately distinct from recordedAt, which lib/production/signals.ts stamps at write time, not here", () => {
  // A client reports last night's sleep this morning: observedAtIso would
  // reflect the night in question, not "now" — this pure layer only
  // carries whatever observedAtIso the caller supplies; it never invents
  // or overwrites it with the current time itself.
  const lastNight = "2026-09-13T23:00:00.000Z";
  const obs = validObservation({ observedAtIso: lastNight });
  assert.equal(validateClientObservationInput(obs).observedAtIso, lastNight);
  assert.notEqual(lastNight, NOW_ISO, "test sanity: these must actually differ");
});

// ---------------------------------------------------------------------------
// H. Same metric from two sources can coexist (no forced reconciliation)
// ---------------------------------------------------------------------------

console.log("\nH. Conflicting/disagreeing observations from two sources coexist\n");

check("H: a manual sleep_duration and a future WHOOP sleep_duration for the same night are two distinct, independently addressable observations, never one overwriting the other", () => {
  const manual = validateClientObservationInput(
    validObservation({ metricKey: "sleep_duration", category: "recovery", value: { valueType: "numeric", valueNumeric: 8 }, unit: "hours", sourceType: "client_manual", sourceRef: "check_in:2026-09-13" })
  );
  const whoop = validateClientObservationInput(
    validObservation({ metricKey: "sleep_duration", category: "recovery", value: { valueType: "numeric", valueNumeric: 6.7 }, unit: "hours", sourceType: "whoop", sourceRef: "whoop:sleep:2026-09-13" })
  );
  // The real DB idempotency key is (clientProfileId, sourceType, sourceRef,
  // metricKey) — these two differ on sourceType (and sourceRef), so they
  // can never collide even though metricKey/observed period match.
  assert.notEqual(manual.sourceType, whoop.sourceType);
  assert.notEqual(manual.value, whoop.value);
});

// ---------------------------------------------------------------------------
// I. Idempotent source projection
// ---------------------------------------------------------------------------

console.log("\nI. Idempotent source-ref construction\n");

check("I: projecting the exact same TrainingDaySnapshot twice produces byte-identical observation sets (deterministic, safe to reprocess)", () => {
  const training = baseTraining({
    sessionStatus: "completed",
    completedAtIso: NOW_ISO,
    exerciseLogs: {
      "item-bench": {
        exerciseId: "item-bench",
        status: "completed",
        loggedSets: [
          { setNumber: 1, isWarmup: false, weightLb: 185, reps: 8, rpe: 8, status: "completed", completedAtIso: NOW_ISO },
          { setNumber: 2, isWarmup: false, weightLb: 225, reps: 5, rpe: 9, status: "completed", completedAtIso: NOW_ISO },
        ],
      },
    },
  });
  const first = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  const second = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  assert.deepEqual(first, second);
  assert.ok(first.every((o) => o.sourceRef), "every observation must carry a real, non-null sourceRef to be idempotently upsertable");
});

check("I: the same logical source event always resolves to the same source_ref regardless of call order/count", () => {
  const refA = buildDailyRecordItemObservationRef({ clientProfileId: CLIENT_ID, dateIso: "2026-09-14", trainingItemInstanceId: "item-bench" });
  const refB = buildDailyRecordItemObservationRef({ clientProfileId: CLIENT_ID, dateIso: "2026-09-14", trainingItemInstanceId: "item-bench" });
  assert.equal(refA, refB);
});

// ---------------------------------------------------------------------------
// J. Resistance execution produces intended observation(s)
// ---------------------------------------------------------------------------

console.log("\nJ. Resistance execution projection\n");

check("J: a completed resistance exercise produces exercise_status, rpe (averaged over working sets), and performed_load (top completed working set)", () => {
  const training = baseTraining({
    sessionStatus: "completed",
    completedAtIso: NOW_ISO,
    exerciseLogs: {
      "item-bench": {
        exerciseId: "item-bench",
        status: "completed",
        loggedSets: [
          { setNumber: 1, isWarmup: true, weightLb: 135, reps: 10, rpe: null, status: "completed" },
          { setNumber: 2, isWarmup: false, weightLb: 185, reps: 8, rpe: 7, status: "completed" },
          { setNumber: 3, isWarmup: false, weightLb: 225, reps: 5, rpe: 9, status: "completed" },
        ],
      },
    },
  });
  const observations = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  const rpe = observations.find((o) => o.metricKey === "rpe" && o.trainingItemInstanceId === "item-bench");
  const load = observations.find((o) => o.metricKey === "performed_load" && o.trainingItemInstanceId === "item-bench");
  const status = observations.find((o) => o.metricKey === "exercise_status" && o.trainingItemInstanceId === "item-bench");
  assert.ok(rpe && rpe.value.valueType === "numeric" && rpe.value.valueNumeric === 8, "average of 7 and 9 (warmup excluded) is 8");
  assert.ok(load && load.value.valueType === "numeric" && load.value.valueNumeric === 225, "the heaviest completed working set, never the warmup");
  assert.ok(status && status.value.valueType === "categorical" && status.value.valueText === "completed");
  for (const o of observations) validateClientObservationInput(o);
});

check("J: a not-started/in-progress exercise produces nothing — never noise for work that hasn't happened", () => {
  const training = baseTraining({
    exerciseLogs: { "item-squat": { exerciseId: "item-squat", status: "in-progress", loggedSets: [] } },
  });
  const observations = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  assert.equal(observations.length, 0);
});

// ---------------------------------------------------------------------------
// K. Continuous execution produces intended observation(s)
// ---------------------------------------------------------------------------

console.log("\nK. Continuous execution projection\n");

check("K: a completed continuous item produces exercise_status ('completed'), performed_as_prescribed, and continuous_duration in seconds", () => {
  const training = baseTraining({
    sessionStatus: "completed",
    completedAtIso: NOW_ISO,
    exerciseLogs: { "item-zone2": { exerciseId: "item-zone2", status: "completed", loggedSets: [] } },
    continuousExecutions: {
      "item-zone2": { id: "exec-1", trainingItemInstanceId: "item-zone2", status: "completed", performedAsPrescribed: true, actual: { family: "continuous", duration: { seconds: 1320 } }, completedAtIso: NOW_ISO },
    },
  });
  const observations = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  const duration = observations.find((o) => o.metricKey === "continuous_duration");
  const prescribed = observations.find((o) => o.metricKey === "performed_as_prescribed");
  const status = observations.find((o) => o.metricKey === "exercise_status" && o.trainingItemInstanceId === "item-zone2");
  assert.ok(duration && duration.value.valueType === "numeric" && duration.value.valueNumeric === 1320 && duration.unit === "seconds");
  assert.ok(prescribed && prescribed.value.valueType === "boolean" && prescribed.value.valueBoolean === true);
  assert.ok(status && status.value.valueType === "categorical" && status.value.valueText === "completed", "the continuous ExecutionRecord's own status wins over the coarser ExerciseLogSnapshot one");
  // No resistance-only facts (rpe/performed_load) should ever appear for a
  // continuous item, since it has no working sets.
  assert.ok(!observations.some((o) => (o.metricKey === "rpe" || o.metricKey === "performed_load") && o.trainingItemInstanceId === "item-zone2"));
  for (const o of observations) validateClientObservationInput(o);
});

check("K: a 'partial' continuous item's status is preserved distinctly, never collapsed into 'completed'", () => {
  const training = baseTraining({
    exerciseLogs: { "item-run": { exerciseId: "item-run", status: "completed", loggedSets: [] } },
    continuousExecutions: {
      "item-run": { id: "exec-2", trainingItemInstanceId: "item-run", status: "partial", performedAsPrescribed: false, skipReason: "out-of-time", completedAtIso: NOW_ISO },
    },
  });
  const observations = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  const status = observations.find((o) => o.metricKey === "exercise_status");
  const reason = observations.find((o) => o.metricKey === "exercise_skip_reason");
  assert.ok(status && status.value.valueType === "categorical" && status.value.valueText === "partial");
  assert.ok(reason && reason.value.valueType === "categorical" && reason.value.valueText === "out-of-time");
});

// ---------------------------------------------------------------------------
// L. Skip reason produces adherence observation
// ---------------------------------------------------------------------------

console.log("\nL. Skip / adherence projection\n");

check("L: a whole-session skip produces session_status='skipped' AND a separate skip_reason categorical fact", () => {
  const training = baseTraining({ sessionStatus: "skipped", skipReason: "feeling-sick" });
  const observations = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  const status = observations.find((o) => o.metricKey === "session_status");
  const reason = observations.find((o) => o.metricKey === "skip_reason");
  assert.ok(status && status.category === "training_performance" && status.value.valueType === "categorical" && status.value.valueText === "skipped");
  assert.ok(reason && reason.category === "adherence" && reason.value.valueType === "categorical" && reason.value.valueText === "feeling-sick");
  for (const o of observations) validateClientObservationInput(o);
});

check("L: a skipped session with no reason produces session_status but honestly no fabricated skip_reason", () => {
  const training = baseTraining({ sessionStatus: "skipped" });
  const observations = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  assert.ok(!observations.some((o) => o.metricKey === "skip_reason"));
});

check("L: a per-exercise skip produces exercise_status='skipped' and exercise_skip_reason", () => {
  const training = baseTraining({
    exerciseLogs: { "item-ohp": { exerciseId: "item-ohp", status: "skipped", skipReason: "pain-or-discomfort", loggedSets: [] } },
  });
  const observations = projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  const reason = observations.find((o) => o.metricKey === "exercise_skip_reason");
  assert.ok(reason && reason.value.valueType === "categorical" && reason.value.valueText === "pain-or-discomfort");
});

// ---------------------------------------------------------------------------
// M. Pain event projection references canonical safety event without
// replacing it
// ---------------------------------------------------------------------------

console.log("\nM. Pain/safety projection references the canonical escalation, never replaces it\n");

check("M: an acute pain report projects a text location fact and a numeric rating fact, both sourced to the real escalation id", () => {
  const observations = projectAcutePainObservations({
    clientProfileId: CLIENT_ID,
    workspaceId: WORKSPACE_ID,
    escalationId: "esc-acute-1",
    location: "left shoulder",
    ratingZeroToTen: 7,
    observedAtIso: NOW_ISO,
  });
  const location = observations.find((o) => o.metricKey === "pain_reported");
  const rating = observations.find((o) => o.metricKey === "pain_rating");
  assert.ok(location && location.value.valueType === "text" && location.value.valueText === "left shoulder");
  assert.equal(location?.sourceRef, buildEscalationObservationRef("esc-acute-1"));
  assert.ok(rating && rating.value.valueType === "numeric" && rating.value.valueNumeric === 7 && rating.unit === "rating_0_10");
  for (const o of observations) validateClientObservationInput(o);
});

check("M: an acute pain report with no rating never fabricates one", () => {
  const observations = projectAcutePainObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, escalationId: "esc-acute-2", location: "right knee", ratingZeroToTen: null, observedAtIso: NOW_ISO });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].metricKey, "pain_reported");
});

check("M: a baseline onboarding injury with multiple areas produces one independent fact per area, no rating ever fabricated", () => {
  const observations = projectBaselineInjuryObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, escalationId: "esc-baseline-1", injuryBodyAreas: ["knee", "shoulder"], observedAtIso: NOW_ISO });
  assert.equal(observations.length, 2);
  assert.ok(observations.every((o) => o.metricKey === "pain_reported" && o.sourceType === "onboarding"));
  assert.ok(observations.every((o) => o.category === "pain_safety"));
  assert.notEqual(observations[0].sourceRef, observations[1].sourceRef, "two distinct areas must never collide on the same idempotency key");
  for (const o of observations) validateClientObservationInput(o);
});

// ---------------------------------------------------------------------------
// N. Source record remains canonical
// ---------------------------------------------------------------------------

console.log("\nN. Source record remains canonical — projection never mutates its input\n");

check("N: projecting a TrainingDaySnapshot never mutates the snapshot passed in", () => {
  const training = baseTraining({
    sessionStatus: "completed",
    exerciseLogs: { "item-bench": { exerciseId: "item-bench", status: "completed", loggedSets: [{ setNumber: 1, isWarmup: false, weightLb: 200, reps: 5, rpe: 8, status: "completed" }] } },
  });
  const before = JSON.parse(JSON.stringify(training));
  projectTrainingDayObservations({ clientProfileId: CLIENT_ID, workspaceId: WORKSPACE_ID, dateIso: "2026-09-14", training });
  assert.deepEqual(training, before);
});

// ---------------------------------------------------------------------------
// T. Future wearable-style observation is structurally representable
// ---------------------------------------------------------------------------

console.log("\nT. Future wearable extensibility proof (no integration implemented)\n");

check("T: a hypothetical WHOOP resting_heart_rate observation validates cleanly against the existing registry — no schema change needed", () => {
  const observation = validateClientObservationInput({
    clientProfileId: CLIENT_ID,
    workspaceId: WORKSPACE_ID,
    category: "cardio",
    metricKey: "resting_heart_rate",
    sourceType: "whoop",
    value: { valueType: "numeric", valueNumeric: 58 },
    unit: "bpm",
    sourceRef: "whoop:rhr:2026-09-14",
    observedAtIso: NOW_ISO,
  });
  assert.equal(observation.sourceType, "whoop");
});

check("T: a hypothetical Apple Health sleep_duration observation validates cleanly against the existing registry", () => {
  const observation = validateClientObservationInput({
    clientProfileId: CLIENT_ID,
    workspaceId: WORKSPACE_ID,
    category: "recovery",
    metricKey: "sleep_duration",
    sourceType: "apple_health",
    value: { valueType: "numeric", valueNumeric: 6.7 },
    unit: "hours",
    sourceRef: "apple_health:sleep:2026-09-14",
    observedAtIso: NOW_ISO,
  });
  assert.equal(observation.sourceType, "apple_health");
});

check("T: buildDailyRecordObservationRef and buildEscalationObservationRef never collide across genuinely different sources", () => {
  const a = buildDailyRecordObservationRef({ clientProfileId: CLIENT_ID, dateIso: "2026-09-14" });
  const b = buildEscalationObservationRef("2026-09-14");
  assert.notEqual(a, b);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
