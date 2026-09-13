// Phase 9D — pure-logic proof of the shadow client-state analyzer: a
// deterministic, evidence-backed, read-only interpretation layer over
// Phase 8A client observations. Live Supabase/RLS/isolation/authorization
// behavior is proven live — see scripts/e2e-client-state-analysis.mts.
//
// Run with: npm run verify:client-state

import assert from "node:assert/strict";
import { analyzeAdherence } from "./adherence.ts";
import { analyzeResistancePerformance, analyzeContinuousPerformance } from "./performance.ts";
import { analyzePrescriptionCompletion } from "./prescription-completion.ts";
import { analyzeRecovery } from "./recovery.ts";
import { analyzeClientState } from "./analyze-client-state.ts";
import { scheduledTrainingDatesInWindow } from "./schedule.ts";
import { addDaysToLocalDate } from "../shared/local-date.ts";
import type { RawObservation } from "./evidence.ts";
import type { ProgramEnrollment } from "../scheduling/types";
import type { UniversalTrainingProgramContent } from "../training/types.ts";

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
const NOW_ISO = "2026-03-15T00:00:00.000Z"; // a Sunday
let obsCounter = 0;
function nextId(): string {
  obsCounter += 1;
  return `obs-${obsCounter}`;
}

function sessionObs(dateIso: string, status: "completed" | "ended-early" | "skipped"): RawObservation {
  return { id: nextId(), category: "training_performance", metricKey: "session_status", sourceType: "workout_execution", value: { valueType: "categorical", valueText: status }, unit: null, sourceRef: `daily_records:${CLIENT_ID}:${dateIso}`, trainingItemInstanceId: null, observedAtIso: `${dateIso}T18:00:00.000Z` };
}
function skipReasonObs(dateIso: string, reason: string): RawObservation {
  return { id: nextId(), category: "adherence", metricKey: "skip_reason", sourceType: "workout_execution", value: { valueType: "categorical", valueText: reason }, unit: null, sourceRef: `daily_records:${CLIENT_ID}:${dateIso}`, trainingItemInstanceId: null, observedAtIso: `${dateIso}T18:00:00.000Z` };
}
function skippedDay(dateIso: string, reason: string): RawObservation[] {
  return [sessionObs(dateIso, "skipped"), skipReasonObs(dateIso, reason)];
}
function loadObs(dateIso: string, itemId: string, value: number): RawObservation {
  return { id: nextId(), category: "training_performance", metricKey: "performed_load", sourceType: "workout_execution", value: { valueType: "numeric", valueNumeric: value }, unit: "lb", sourceRef: `daily_records:${CLIENT_ID}:${dateIso}:item:${itemId}`, trainingItemInstanceId: itemId, observedAtIso: `${dateIso}T18:00:00.000Z` };
}
function rpeObs(dateIso: string, itemId: string, value: number): RawObservation {
  return { id: nextId(), category: "training_performance", metricKey: "rpe", sourceType: "workout_execution", value: { valueType: "numeric", valueNumeric: value }, unit: "rpe", sourceRef: `daily_records:${CLIENT_ID}:${dateIso}:item:${itemId}`, trainingItemInstanceId: itemId, observedAtIso: `${dateIso}T18:00:00.000Z` };
}
function continuousDurationObs(dateIso: string, itemId: string, seconds: number): RawObservation {
  return { id: nextId(), category: "training_performance", metricKey: "continuous_duration", sourceType: "workout_execution", value: { valueType: "numeric", valueNumeric: seconds }, unit: "seconds", sourceRef: `daily_records:${CLIENT_ID}:${dateIso}:item:${itemId}`, trainingItemInstanceId: itemId, observedAtIso: `${dateIso}T18:00:00.000Z` };
}
function performedAsPrescribedObs(dateIso: string, itemId: string, value: boolean): RawObservation {
  return { id: nextId(), category: "training_performance", metricKey: "performed_as_prescribed", sourceType: "workout_execution", value: { valueType: "boolean", valueBoolean: value }, unit: null, sourceRef: `daily_records:${CLIENT_ID}:${dateIso}:item:${itemId}`, trainingItemInstanceId: itemId, observedAtIso: `${dateIso}T18:00:00.000Z` };
}
function exerciseStatusObs(dateIso: string, itemId: string, status: "completed" | "skipped"): RawObservation {
  return { id: nextId(), category: "training_performance", metricKey: "exercise_status", sourceType: "workout_execution", value: { valueType: "categorical", valueText: status }, unit: null, sourceRef: `daily_records:${CLIENT_ID}:${dateIso}:item:${itemId}`, trainingItemInstanceId: itemId, observedAtIso: `${dateIso}T18:00:00.000Z` };
}

/** Every Mon/Wed/Fri in [sinceDaysAgo, 0] days before NOW_ISO. */
function recentTrainingDates(sinceDaysAgo: number): string[] {
  const dates: string[] = [];
  const today = NOW_ISO.slice(0, 10);
  for (let i = sinceDaysAgo; i >= 0; i--) {
    const d = addDaysToLocalDate(today, -i);
    const dow = new Date(`${d}T12:00:00.000Z`).getUTCDay();
    if (dow === 1 || dow === 3 || dow === 5) dates.push(d); // Mon/Wed/Fri
  }
  return dates;
}

console.log("\n1. Adherence — zero/insufficient evidence and stable baseline (A, B)\n");

check("A: zero scheduled sessions produces insufficient_evidence, never a fabricated finding", () => {
  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: [], observations: [], activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "insufficient_evidence");
  assert.equal(finding.strength, "insufficient");
});

check("B: one missed session among many completed does not become a chronic trend (isolated_disruption, not recurring)", () => {
  const dates = recentTrainingDates(13); // ~6 sessions in the 14-day window
  const observations: RawObservation[] = [];
  for (const d of dates.slice(0, -1)) observations.push(sessionObs(d, "completed"));
  observations.push(...skippedDay(dates[dates.length - 1], "forgot"));
  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: dates, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.notEqual(finding.findingType, "recurring_unexplained_skips");
  assert.ok(finding.findingType === "isolated_disruption" || finding.findingType === "stable_adherence");
});

console.log("\n2. Sick-week acceptance test (C, D, G) — spec section 38\n");

check("C/G: an illness-related isolated disruption is classified conservatively, never as a chronic adherence problem or a motivation judgment", () => {
  // Strong baseline for 6 weeks (100% completion), then week 4-equivalent
  // (the most recent week) has 2 illness skips out of 3 scheduled.
  const baselineDates = recentTrainingDates(55).slice(0, -6); // everything before the recent 2 weeks
  const recentDates = recentTrainingDates(13); // last 14 days
  const observations: RawObservation[] = [];
  for (const d of baselineDates) observations.push(sessionObs(d, "completed"));
  for (const d of recentDates.slice(0, -2)) observations.push(sessionObs(d, "completed"));
  for (const d of recentDates.slice(-2)) observations.push(...skippedDay(d, "feeling-sick"));

  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: [...baselineDates, ...recentDates], observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "illness_related_disruption");
  assert.equal(finding.reasonClassification, "illness");
  assert.notEqual(finding.strength, "strong", "a single-window illness disruption must never be reported as strong evidence of a chronic pattern");
  assert.ok(!/lazy|motivation|unmotivated/i.test(finding.summary), "G: must never contain a motivation/personality judgment");
});

check("D: return to normal completion resolves the temporary finding on the very next analysis (spec section 25 — no persisted 'problem' state)", () => {
  // Same illness cluster, but it's now further in the past (outside the
  // 14-day recent window) and the client has returned to full completion
  // since.
  const allDates = recentTrainingDates(27);
  const illnessDates = allDates.slice(0, 2); // ~2 weeks ago
  const laterDates = allDates.slice(2);
  const observations: RawObservation[] = [];
  for (const d of illnessDates) observations.push(...skippedDay(d, "feeling-sick"));
  for (const d of laterDates) observations.push(sessionObs(d, "completed"));

  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: allDates, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "stable_adherence", "the illness cluster has aged out of the recent window — current evidence is fully normal");
});

console.log("\n3. Real trend acceptance test (E, F) — spec section 39\n");

check("E: repeated unexplained skips across recent AND baseline windows form a stronger adherence finding", () => {
  const baselineDates = recentTrainingDates(55).slice(0, -6);
  const recentDates = recentTrainingDates(13);
  const observations: RawObservation[] = [];
  // Baseline also shows real misses (not a clean prior baseline).
  for (const [i, d] of baselineDates.entries()) observations.push(...(i % 3 === 0 ? skippedDay(d, "forgot") : [sessionObs(d, "completed")]));
  for (const [i, d] of recentDates.entries()) observations.push(...(i % 2 === 0 ? skippedDay(d, "other") : [sessionObs(d, "completed")]));

  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: [...baselineDates, ...recentDates], observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "recurring_unexplained_skips");
});

check("F: repeated schedule-conflict skips across both windows form a recurring_schedule_conflict finding, never inferred as low motivation", () => {
  const baselineDates = recentTrainingDates(55).slice(0, -6);
  const recentDates = recentTrainingDates(13);
  const observations: RawObservation[] = [];
  for (const [i, d] of baselineDates.entries()) observations.push(...(i % 3 === 0 ? skippedDay(d, "schedule-conflict") : [sessionObs(d, "completed")]));
  for (const d of recentDates.slice(0, 2)) observations.push(...skippedDay(d, "out-of-time"));
  for (const d of recentDates.slice(2)) observations.push(sessionObs(d, "completed"));

  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: [...baselineDates, ...recentDates], observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "recurring_schedule_conflict");
  assert.equal(finding.reasonClassification, "schedule_conflict");
});

console.log("\n4. Partial completion distinct from skip (H)\n");

check("H: an 'ended-early' session counts as attempted, not as an adherence miss identical to a skip", () => {
  const dates = recentTrainingDates(13);
  const observations = dates.map((d, i) => sessionObs(d, i === 0 ? "ended-early" : "completed"));
  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: dates, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "stable_adherence", "ended-early must not be counted the same as skipped");
});

console.log("\n5. Resistance performance comparability and direction (I, J, K, L, M, N)\n");

check("I: comparable resistance improvement is detected from a real load increase across comparable exposures", () => {
  const dates = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02", "2026-03-09"];
  const observations = dates.map((d, i) => loadObs(d, "item-Monday-1-barbell-bench-press", 135 + i * 5));
  const finding = analyzeResistancePerformance({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "performance_improving");
  assert.notEqual(finding.strength, "insufficient");
});

check("J: comparable resistance decline is detected from a real load decrease across comparable exposures", () => {
  const dates = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02", "2026-03-09"];
  const observations = dates.map((d, i) => loadObs(d, "item-Monday-1-barbell-bench-press", 155 - i * 5));
  const finding = analyzeResistancePerformance({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "performance_declining");
});

check("K: incomparable exercises (different names) never get falsely pooled/compared together", () => {
  const observations = [
    loadObs("2026-01-05", "item-Monday-1-barbell-bench-press", 135),
    loadObs("2026-01-19", "item-Wednesday-1-incline-dumbbell-press", 50),
    loadObs("2026-02-02", "item-Friday-1-barbell-back-squat", 225),
  ];
  const finding = analyzeResistancePerformance({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "insufficient_evidence", "K: three different exercises must never be pooled into one false trend");
});

check("L: planned progression (rising RPE alongside rising load) is NOT flagged as decline — the RPE adjustment only fires when load itself is stable", () => {
  const dates = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02", "2026-03-09"];
  const itemId = "item-Monday-1-barbell-bench-press";
  const observations = [...dates.map((d, i) => loadObs(d, itemId, 135 + i * 10)), ...dates.map((d, i) => rpeObs(d, itemId, 6 + Math.min(i, 3)))];
  const finding = analyzeResistancePerformance({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "performance_improving", "rising RPE alongside intentionally rising load must not override a real load improvement into decline");
});

check("M: repeated RPE increase under COMPARABLE (stable-load) work is recognized as a factual performance signal", () => {
  const dates = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02", "2026-03-09"];
  const itemId = "item-Monday-1-barbell-bench-press";
  const observations = [...dates.map((d) => loadObs(d, itemId, 135)), ...dates.map((d, i) => rpeObs(d, itemId, 6 + Math.min(i, 3)))];
  const finding = analyzeResistancePerformance({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "performance_declining");
  assert.match(finding.summary, /RPE/);
});

check("N: one single high-RPE/load reading never becomes a trend (insufficient exposures)", () => {
  const observations = [loadObs("2026-03-09", "item-Monday-1-barbell-bench-press", 95)];
  const finding = analyzeResistancePerformance({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "insufficient_evidence");
});

console.log("\n6. Continuous performance (O) and prescribed-vs-actual divergence (P)\n");

check("O: continuous performance direction is computed only over comparable continuous exposures", () => {
  const dates = ["2026-02-01", "2026-02-08", "2026-02-15", "2026-02-22", "2026-03-01"];
  const observations = dates.map((d, i) => continuousDurationObs(d, `cardio-Tuesday-${1700000000 + i}`, 1200 + i * 60));
  const finding = analyzeContinuousPerformance({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "performance_improving");
});

check("P: prescribed-vs-actual divergence is preserved via the real performed_as_prescribed signal, driving a repeated_under_completion finding", () => {
  const dates = ["2026-02-01", "2026-02-08", "2026-02-15", "2026-02-22"];
  const observations = dates.map((d, i) => performedAsPrescribedObs(d, `cardio-Tuesday-${1700000000 + i}`, false));
  const finding = analyzePrescriptionCompletion({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "repeated_under_completion");
  assert.equal(finding.supportingEvidenceRefs.length, 4);
});

check("resistance repeated skip of the SAME comparable exercise also produces repeated_under_completion", () => {
  const dates = ["2026-02-01", "2026-02-08", "2026-02-15", "2026-02-22"];
  const itemId = "item-Monday-1-barbell-bench-press";
  const observations = dates.map((d) => exerciseStatusObs(d, itemId, "skipped"));
  const finding = analyzePrescriptionCompletion({ clientProfileId: CLIENT_ID, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "repeated_under_completion");
});

console.log("\n7. Contradicting evidence, safety-restriction context, and no demographic inference (T, R, V)\n");

check("T: contradicting evidence (completed sessions) is captured alongside a disruption finding, never hidden", () => {
  const dates = recentTrainingDates(13);
  const observations: RawObservation[] = [];
  for (const d of dates.slice(0, -1)) observations.push(sessionObs(d, "completed"));
  observations.push(...skippedDay(dates[dates.length - 1], "feeling-sick"));
  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: dates, observations, activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.ok(finding.contradictingEvidenceRefs.length > 0);
});

check("R: an active safety restriction is carried as read-only context on every finding, never interpreted/overridden", () => {
  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: [], observations: [], activeSafetyRestriction: true, nowIso: NOW_ISO });
  assert.equal(finding.activeSafetyRestriction, true);
});

check("V: no field or code path in this module ever reads/references age, sex, or body-size data — grep-verifiable by construction (this test asserts the finding output contains no such language)", () => {
  const finding = analyzeAdherence({ clientProfileId: CLIENT_ID, scheduledTrainingDates: recentTrainingDates(13), observations: recentTrainingDates(13).map((d) => sessionObs(d, "completed")), activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.ok(!/\b(male|female|age|weight|height|bmi)\b/i.test(finding.summary));
});

console.log("\n8. Recovery domain honesty (W, X)\n");

check("W: missing recovery data yields insufficient_evidence, never a fabricated recovery score", () => {
  const finding = analyzeRecovery({ clientProfileId: CLIENT_ID, observations: [], activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "insufficient_evidence");
  assert.ok(!/score|\d+%/.test(finding.summary));
});

check("X: a future sleep_duration observation is structurally usable (recognized/counted) without any schema/type change to ClientStateFinding", () => {
  const withSleep: RawObservation = { id: "obs-sleep-1", category: "recovery", metricKey: "sleep_duration", sourceType: "apple_health", value: { valueType: "numeric", valueNumeric: 7.5 }, unit: "hours", sourceRef: null, trainingItemInstanceId: null, observedAtIso: NOW_ISO };
  const finding = analyzeRecovery({ clientProfileId: CLIENT_ID, observations: [withSleep], activeSafetyRestriction: false, nowIso: NOW_ISO });
  assert.equal(finding.findingType, "insufficient_evidence", "recovery INTERPRETATION logic is still not implemented — this is honest, not a regression");
  assert.match(finding.summary, /not yet implemented/);
});

console.log("\n9. Determinism and orchestration (AB)\n");

check("AB: the exact same evidence bundle produces byte-identical findings on repeated analysis", () => {
  const dates = recentTrainingDates(13);
  const bundle = { clientProfileId: CLIENT_ID, observations: dates.map((d) => sessionObs(d, "completed")), scheduledTrainingDates: dates, activeSafetyRestriction: false, nowIso: NOW_ISO };
  const a = analyzeClientState(bundle);
  const b = analyzeClientState(bundle);
  assert.deepEqual(a, b);
});

check("analyzeClientState returns exactly one finding per implemented domain, every one evidence-backed or honestly insufficient", () => {
  const result = analyzeClientState({ clientProfileId: CLIENT_ID, observations: [], scheduledTrainingDates: [], activeSafetyRestriction: false, nowIso: NOW_ISO });
  const domains = result.findings.map((f) => f.domain).sort();
  assert.deepEqual(domains, ["adherence", "continuous_performance", "prescription_completion", "recovery", "training_performance"]);
  assert.ok(result.findings.every((f) => f.findingType === "insufficient_evidence"));
});

console.log("\n10. Schedule derivation (U — distinct time windows behave correctly)\n");

check("U: scheduledTrainingDatesInWindow only returns real training days within the client's active program range, respecting per-week day patterns", () => {
  const enrollment: ProgramEnrollment = { id: "e1", schemaVersion: 1, workspaceId: "w1", clientId: CLIENT_ID, programId: "p1", startDateIso: "2026-03-02", durationWeeks: 4, timeZone: "UTC", weekStartsOn: "monday", createdAtIso: NOW_ISO, updatedAtIso: NOW_ISO };
  const program: UniversalTrainingProgramContent = {
    schemaVersion: 2,
    id: "prog-1",
    workspaceId: "w1",
    clientId: CLIENT_ID,
    coachId: "coach-1",
    name: "Test",
    durationWeeks: 4,
    status: "assigned",
    createdAtIso: NOW_ISO,
    updatedAtIso: NOW_ISO,
    weeks: [1, 2, 3, 4].map((weekNumber) => ({
      weekNumber,
      days: (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const).map((dayOfWeek) => ({ dayOfWeek, type: (dayOfWeek === "Monday" || dayOfWeek === "Wednesday" || dayOfWeek === "Friday" ? "training" : "rest") as "training" | "rest" })),
    })),
  };
  const dates = scheduledTrainingDatesInWindow(enrollment, program, "2026-03-01", "2026-03-15");
  // 2026-03-01 is a Sunday (before program start, pre_program phase) — excluded.
  assert.ok(!dates.includes("2026-03-01"));
  assert.deepEqual(dates, ["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09", "2026-03-11", "2026-03-13"]);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
