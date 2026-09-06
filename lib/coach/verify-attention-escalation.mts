// Phase 5.4B — verifies repeated-pattern escalation: adherence patterns,
// performance patterns, the combined recovery-deterioration synthesis, and
// milestone streak detection. Pure functions, no storage dependency — see
// lib/coach/attention-escalation.ts.

import assert from "node:assert/strict";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { detectMilestoneEscalation, detectPatternEscalations } from "./attention-escalation.ts";
import type { ReviewRequest, ReviewRequestKind } from "../types";

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

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `review-${idCounter}`;
}

function makeReview(kind: ReviewRequestKind, createdAtIso: string, overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: nextId(),
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    kind,
    severity: "normal",
    createdAtIso,
    updatedAtIso: createdAtIso,
    summary: `${kind} event`,
    status: "needs_review",
    resolved: false,
    ...overrides,
  };
}

function baseCtx(reviewRequests: ReviewRequest[], nowIso: string) {
  return {
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests,
    nowIso,
    nextId,
  };
}

console.log("\n1. Adherence and performance patterns\n");

check("fewer than 3 skips in the trailing window never escalates", () => {
  const reviews = [makeReview("workout-skipped", "2026-01-01T00:00:00.000Z"), makeReview("workout-skipped", "2026-01-03T00:00:00.000Z")];
  const created = detectPatternEscalations(baseCtx(reviews, "2026-01-05T00:00:00.000Z"));
  assert.equal(created.length, 0);
});

check("3+ skips in the trailing 14 days synthesizes exactly one adherence-pattern item", () => {
  const reviews = [
    makeReview("workout-skipped", "2026-01-01T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-04T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-07T00:00:00.000Z"),
  ];
  const created = detectPatternEscalations(baseCtx(reviews, "2026-01-07T12:00:00.000Z"));
  assert.equal(created.length, 1);
  assert.equal(created[0].kind, "adherence-pattern");
  assert.equal(created[0].status, "needs_review");
  assert.ok(created[0].escalationReason);
  assert.ok(created[0].recommendedNextAction);
  assert.equal(created[0].clientNotificationRequired, true);
});

check("a skip older than the 14-day window never counts toward the pattern", () => {
  const reviews = [
    makeReview("workout-skipped", "2025-12-01T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-04T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-07T00:00:00.000Z"),
  ];
  const created = detectPatternEscalations(baseCtx(reviews, "2026-01-07T12:00:00.000Z"));
  assert.equal(created.length, 0);
});

check("3+ rpe-anomaly events synthesizes exactly one performance-pattern item", () => {
  const reviews = [
    makeReview("rpe-anomaly", "2026-01-01T00:00:00.000Z"),
    makeReview("rpe-anomaly", "2026-01-04T00:00:00.000Z"),
    makeReview("rpe-anomaly", "2026-01-07T00:00:00.000Z"),
  ];
  const created = detectPatternEscalations(baseCtx(reviews, "2026-01-07T12:00:00.000Z"));
  assert.equal(created.length, 1);
  assert.equal(created[0].kind, "performance-pattern");
});

check("re-running the same detection for the same week never creates a duplicate (idempotent)", () => {
  const reviews = [
    makeReview("workout-skipped", "2026-01-01T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-04T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-07T00:00:00.000Z"),
  ];
  const firstRun = detectPatternEscalations(baseCtx(reviews, "2026-01-07T12:00:00.000Z"));
  const allReviews = [...reviews, ...firstRun];
  const secondRun = detectPatternEscalations(baseCtx(allReviews, "2026-01-07T18:00:00.000Z"));
  assert.equal(secondRun.length, 0);
});

console.log("\n2. Combined recovery-deterioration synthesis\n");

check("adherence AND performance patterns together synthesize one combined item, not two separate ones", () => {
  const reviews = [
    makeReview("workout-skipped", "2026-01-01T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-02T00:00:00.000Z"),
    makeReview("workout-skipped", "2026-01-03T00:00:00.000Z"),
    makeReview("rpe-anomaly", "2026-01-04T00:00:00.000Z"),
    makeReview("rpe-anomaly", "2026-01-05T00:00:00.000Z"),
    makeReview("rpe-anomaly", "2026-01-06T00:00:00.000Z"),
  ];
  const created = detectPatternEscalations(baseCtx(reviews, "2026-01-07T00:00:00.000Z"));
  assert.equal(created.length, 1);
  assert.equal(created[0].kind, "recovery-deterioration");
});

console.log("\n3. Milestone streak detection\n");

check("a streak below the threshold never fires", () => {
  const result = detectMilestoneEscalation(baseCtx([], "2026-01-07T00:00:00.000Z"), { consecutiveCleanWorkouts: 4 });
  assert.equal(result, null);
});

check("crossing the threshold fires exactly one real, ready-to-send milestone item", () => {
  const result = detectMilestoneEscalation(baseCtx([], "2026-01-07T00:00:00.000Z"), { consecutiveCleanWorkouts: 5 });
  assert.ok(result);
  assert.equal(result!.kind, "milestone");
  assert.ok(result!.preparedClientMessage && result!.preparedClientMessage.length > 0);
  assert.equal(result!.clientNotificationRequired, false);
});

check("the same streak length never fires twice (idempotent)", () => {
  const first = detectMilestoneEscalation(baseCtx([], "2026-01-07T00:00:00.000Z"), { consecutiveCleanWorkouts: 5 })!;
  const second = detectMilestoneEscalation(baseCtx([first], "2026-01-07T06:00:00.000Z"), { consecutiveCleanWorkouts: 5 });
  assert.equal(second, null);
});

check("a later streak length (a fresh multiple of the threshold) fires again", () => {
  const first = detectMilestoneEscalation(baseCtx([], "2026-01-07T00:00:00.000Z"), { consecutiveCleanWorkouts: 5 })!;
  const second = detectMilestoneEscalation(baseCtx([first], "2026-01-12T00:00:00.000Z"), { consecutiveCleanWorkouts: 10 });
  assert.ok(second);
  assert.notEqual(second!.sourceEventId, first.sourceEventId);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
