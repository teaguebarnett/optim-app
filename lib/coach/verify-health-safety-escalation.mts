// Phase 7A — Persist Client Health Reviews and Coach Escalation.
//
// Pure-logic proof for the parts of this phase that don't require a real
// Supabase session: the pain-summary builder (lib/coach/pain-safety-summary.ts)
// and the reducer-level guarantees (lib/state.ts's SET_PAIN_ESCALATION_STATUS,
// and REPORT_PAIN's own safety gate remaining independent of any network
// result). The real Supabase-mode persistence, dedup, RLS, and coach-review
// wiring (create_health_safety_escalation, resolveHealthReviewRecordForClient,
// the onboarding-completion trigger) is proven live instead — see
// scripts/e2e-health-safety-escalation.mts — matching this repo's
// established "pure logic here, e2e there" split for server-only code
// (see lib/coach/pain-safety-summary.ts's own doc).
//
// Run with: npm run verify:health-safety-escalation

import assert from "node:assert/strict";
import { buildPainSummary } from "./pain-safety-summary.ts";
import { createInitialState, reducer } from "../state.ts";
import { attentionItemFromEscalation } from "./attention-item.ts";
import { MIXED_SESSION_DEMO } from "../training/demo-fixtures.ts";
import { buildStartedWorkoutSession } from "../state.ts";
import type { AppState } from "../state.ts";

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

// ---------------------------------------------------------------------------
// buildPainSummary — concise, factual, non-diagnostic
// ---------------------------------------------------------------------------

console.log("\n1. buildPainSummary — concise, factual, non-diagnostic\n");

check("a severe report includes the real location/rating and states the exercise was paused, never a diagnosis", () => {
  const summary = buildPainSummary({
    location: "left shoulder",
    ratingZeroToTen: 7,
    onset: "during-set",
    causedByMovement: "pressing",
    continuedAfterSet: true,
    affectsOutsideGym: false,
    symptomQuality: "sharp-pinching",
    itemName: "Bench Press",
  });
  assert.match(summary, /left shoulder, 7\/10/);
  assert.match(summary, /during Bench Press/);
  assert.match(summary, /paused this exercise/);
  assert.doesNotMatch(summary, /torn|tear|rotator cuff|diagnos/i, "must never contain a diagnostic term this function has no basis to assert");
});

check("a mild, resume-eligible report states the resume-offer, not the pause, matching lib/workout/pain-policy.ts's own classification", () => {
  const summary = buildPainSummary({
    location: "right knee",
    ratingZeroToTen: 2,
    onset: "during-set",
    causedByMovement: "squatting",
    continuedAfterSet: false,
    affectsOutsideGym: false,
    symptomQuality: "normal-fatigue",
  });
  assert.match(summary, /offered the client the option to resume/);
  assert.doesNotMatch(summary, /paused this exercise/);
});

check("a client note is included verbatim when present, omitted entirely when absent", () => {
  const withNote = buildPainSummary({ location: "hip", ratingZeroToTen: 5, onset: "warm-up", causedByMovement: "lunging", continuedAfterSet: true, affectsOutsideGym: false, symptomQuality: "aching", note: "Felt it on the way down." });
  assert.match(withNote, /Client note: Felt it on the way down\./);
  const withoutNote = buildPainSummary({ location: "hip", ratingZeroToTen: 5, onset: "warm-up", causedByMovement: "lunging", continuedAfterSet: true, affectsOutsideGym: false, symptomQuality: "aching" });
  assert.doesNotMatch(withoutNote, /Client note/);
});

check("item name is omitted honestly when the caller has none — never a fabricated exercise name", () => {
  const summary = buildPainSummary({ location: "ankle", ratingZeroToTen: 4, onset: "onboarding", causedByMovement: "unknown", continuedAfterSet: false, affectsOutsideGym: false, symptomQuality: "other" });
  assert.doesNotMatch(summary, / during /);
});

// ---------------------------------------------------------------------------
// SET_PAIN_ESCALATION_STATUS — updates only the matching report, preserves
// everything else about it (spec section 11 / test N)
// ---------------------------------------------------------------------------

console.log("\n2. SET_PAIN_ESCALATION_STATUS reducer behavior\n");

function startedMixedState(): AppState {
  const base = createInitialState();
  return {
    ...base,
    workoutSession: buildStartedWorkoutSession({
      existingSession: base.workoutSession,
      workoutId: MIXED_SESSION_DEMO.id,
      resolvedWorkout: null,
      trainingSession: MIXED_SESSION_DEMO,
      nowIso: "2026-01-01T00:00:00.000Z",
    }),
  };
}

function reportPain(state: AppState, exerciseId: string) {
  return reducer(state, {
    type: "REPORT_PAIN",
    exerciseId,
    location: "left shoulder",
    ratingZeroToTen: 7,
    onset: "during-set",
    causedByMovement: "pressing",
    continuedAfterSet: true,
    affectsOutsideGym: false,
    symptomQuality: "sharp-pinching",
  });
}

check("confirming escalation success sets escalationConfirmed: true on exactly the matching report, without altering any other field", () => {
  const state = startedMixedState();
  const firstItemId = state.workoutSession.currentExerciseId!;
  const withReport = reportPain(state, firstItemId);
  const reportId = withReport.workoutSession.painReports[0].id;
  const before = { ...withReport.workoutSession.painReports[0] };

  const confirmed = reducer(withReport, { type: "SET_PAIN_ESCALATION_STATUS", painReportId: reportId, escalationCreated: true });
  const after = confirmed.workoutSession.painReports[0];
  assert.equal(after.escalationConfirmed, true);
  assert.deepEqual({ ...after, escalationConfirmed: undefined }, { ...before, escalationConfirmed: undefined }, "no other field of the original report may change");
});

check("confirming escalation failure sets escalationConfirmed: false — never silently re-labeled as success", () => {
  const state = startedMixedState();
  const firstItemId = state.workoutSession.currentExerciseId!;
  const withReport = reportPain(state, firstItemId);
  const reportId = withReport.workoutSession.painReports[0].id;
  const failed = reducer(withReport, { type: "SET_PAIN_ESCALATION_STATUS", painReportId: reportId, escalationCreated: false });
  assert.equal(failed.workoutSession.painReports[0].escalationConfirmed, false);
});

check("an unknown painReportId is a safe no-op — never crashes, never mutates an unrelated report", () => {
  const state = startedMixedState();
  const firstItemId = state.workoutSession.currentExerciseId!;
  const withReport = reportPain(state, firstItemId);
  const result = reducer(withReport, { type: "SET_PAIN_ESCALATION_STATUS", painReportId: "does-not-exist", escalationCreated: true });
  assert.deepEqual(result, withReport);
});

check("the client-side safety gate (phase: pain-review, activePainInterruption) is set the instant REPORT_PAIN is dispatched, independent of and before any SET_PAIN_ESCALATION_STATUS ever arrives — the gate never waits on a network result", () => {
  const state = startedMixedState();
  const firstItemId = state.workoutSession.currentExerciseId!;
  const withReport = reportPain(state, firstItemId);
  assert.equal(withReport.workoutSession.phase, "pain-review");
  assert.ok(withReport.workoutSession.activePainInterruption);
  assert.equal(withReport.workoutSession.painReports[0].escalationConfirmed, undefined, "escalation status genuinely hasn't arrived yet, and the gate doesn't need it to");
});

// ---------------------------------------------------------------------------
// attentionItemFromEscalation — a non-chat-originated escalation shows real
// content, never a blank/generic card (see lib/production/verify-coach-operations.mts
// for the full suite this extends)
// ---------------------------------------------------------------------------

console.log("\n3. Coach-facing summary for a non-chat pain_or_safety escalation\n");

check("a pain_or_safety escalation with no source chat message shows its real recorded summary, never the bare 'Pain / safety' label", () => {
  const item = attentionItemFromEscalation({
    id: "esc-health-1",
    clientProfileId: "client-1",
    clientDisplayName: "Client A",
    sourceMessageBody: null,
    reasonCategory: "pain_or_safety",
    status: "pending",
    proposedResponse: "Pain reported: left shoulder, 7/10, during Bench Press. OPTIM paused this exercise for the client.",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    priority: 0,
  });
  assert.equal(item.summary, "Pain reported: left shoulder, 7/10, during Bench Press. OPTIM paused this exercise for the client.");
  assert.equal(item.kindLabel, "Pain / safety");
  assert.equal(item.status, "open");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
