// Phase 5.5A — verifies resolveTrainingPlanStatus: the clear, honest
// training-plan status the unified OPTIM Plan and client workspace show
// (spec Part 2's "recommendations ready / coach approval needed / blocked
// by health review / approved" requirement), with health review always
// winning as the one safety override.

import assert from "node:assert/strict";
import { resolveTrainingPlanStatus, resolveClientJourneyStage, CLIENT_JOURNEY_STAGE_LABELS, type ClientJourneyStage } from "./plan-status.ts";
import type { ActivationGenerationRecord } from "./activation-lifecycle.ts";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

function record(state: ActivationGenerationRecord["state"]): ActivationGenerationRecord {
  return {
    id: "r1",
    clientId: "c1" as never,
    workspaceId: "w1" as never,
    coachId: "co1" as never,
    coachModelVersion: 1,
    generatorVersion: "test",
    idempotencyKey: "k",
    state,
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    trainingOptions: [],
    nutritionOptions: [],
  };
}

check("no generation record at all -> not_started", () => {
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: null, healthReviewResolved: "no_review_needed" }).status, "not_started");
});

check("directions_ready -> recommendations_ready", () => {
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("directions_ready"), healthReviewResolved: "no_review_needed" }).status, "recommendations_ready");
});

check("ready_for_review -> coach_approval_needed (a concrete plan exists, awaiting the coach's own approval)", () => {
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("ready_for_review"), healthReviewResolved: "no_review_needed" }).status, "coach_approval_needed");
});

check("revision_prepared -> coach_approval_needed", () => {
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("revision_prepared"), healthReviewResolved: "no_review_needed" }).status, "coach_approval_needed");
});

check("activated -> approved", () => {
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("activated"), healthReviewResolved: "no_review_needed" }).status, "approved");
});

check("an unresolved health review overrides every other state, even 'activated' — the one absolute safety gate", () => {
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("activated"), healthReviewResolved: false }).status, "blocked_by_health_review");
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("ready_for_review"), healthReviewResolved: false }).status, "blocked_by_health_review");
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: null, healthReviewResolved: false }).status, "blocked_by_health_review");
});

check("every status carries a real, non-empty label", () => {
  const states: ActivationGenerationRecord["state"][] = ["directions_ready", "ready_for_review", "revision_prepared", "activated", "blocked", "generation_failed"];
  for (const s of states) {
    const result = resolveTrainingPlanStatus({ latestGeneration: record(s), healthReviewResolved: "no_review_needed" });
    assert.ok(result.label.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Phase 5.6A additions
// ---------------------------------------------------------------------------

check("a failed generation attempt is a real, distinct status — never silently collapses back to 'not_started'", () => {
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("generation_failed"), healthReviewResolved: "no_review_needed" }).status, "generation_failed");
  assert.equal(resolveTrainingPlanStatus({ latestGeneration: record("blocked"), healthReviewResolved: "no_review_needed" }).status, "generation_failed");
});

check("resolveClientJourneyStage: onboarding incomplete always wins, even over an unresolved health review or a ready plan", () => {
  assert.equal(resolveClientJourneyStage({ onboardingCompleted: false, latestGeneration: null, healthReviewResolved: "no_review_needed" }), "awaiting_onboarding");
  assert.equal(resolveClientJourneyStage({ onboardingCompleted: false, latestGeneration: record("ready_for_review"), healthReviewResolved: false }), "awaiting_onboarding");
});

check("resolveClientJourneyStage: once onboarding is complete, it defers to resolveTrainingPlanStatus exactly", () => {
  assert.equal(resolveClientJourneyStage({ onboardingCompleted: true, latestGeneration: null, healthReviewResolved: false }), "blocked_by_health_review");
  assert.equal(resolveClientJourneyStage({ onboardingCompleted: true, latestGeneration: null, healthReviewResolved: "no_review_needed" }), "not_started");
  assert.equal(resolveClientJourneyStage({ onboardingCompleted: true, latestGeneration: record("ready_for_review"), healthReviewResolved: "no_review_needed" }), "coach_approval_needed");
  assert.equal(resolveClientJourneyStage({ onboardingCompleted: true, latestGeneration: record("generation_failed"), healthReviewResolved: "no_review_needed" }), "generation_failed");
});

// ---------------------------------------------------------------------------
// Phase 5.6A.1 additions
// ---------------------------------------------------------------------------

check("CLIENT_JOURNEY_STAGE_LABELS: every stage carries a real, non-empty, honest label", () => {
  const stages: ClientJourneyStage[] = ["awaiting_onboarding", "blocked_by_health_review", "not_started", "recommendations_ready", "coach_approval_needed", "generation_failed", "approved"];
  for (const s of stages) {
    assert.ok(CLIENT_JOURNEY_STAGE_LABELS[s].length > 0);
  }
});

check("CLIENT_JOURNEY_STAGE_LABELS: the ready-for-approval stage never uses alarming 'Blocking' language — the spec's ready/blocking contradiction bug", () => {
  assert.equal(CLIENT_JOURNEY_STAGE_LABELS.coach_approval_needed, "Awaiting your approval");
  assert.ok(!/blocking/i.test(CLIENT_JOURNEY_STAGE_LABELS.coach_approval_needed));
});

check("CLIENT_JOURNEY_STAGE_LABELS: no more vague 'Coach setup' wording for a not-yet-active client", () => {
  for (const label of Object.values(CLIENT_JOURNEY_STAGE_LABELS)) {
    assert.notEqual(label, "Coach setup");
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
