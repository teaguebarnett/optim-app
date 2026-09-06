// Phase 5.4B completion pass — verifies the three-tier notification
// classification (spec §7): resolveNotificationTier's per-kind rules, and
// that buildReviewQueueItems actually sorts by tier ahead of the existing
// numeric priority.

import assert from "node:assert/strict";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { buildReviewQueueItems, resolveNotificationTier } from "./attention-queue.ts";
import type { ReviewRequest } from "../types";

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

console.log("\n1. resolveNotificationTier per-kind rules\n");

check("a pain report during a live workout is immediate", () => {
  assert.equal(resolveNotificationTier("pain-report", { workoutInProgress: true }), "immediate");
});

check("the same pain report outside an active training window is action_required, never an automatic emergency", () => {
  assert.equal(resolveNotificationTier("pain-report", { workoutInProgress: false }), "action_required");
});

check("program/exercise change requests and repeated patterns are action_required", () => {
  for (const kind of ["program-change-request", "performance-pattern", "adherence-pattern", "recovery-deterioration", "ai-authority-boundary"] as const) {
    assert.equal(resolveNotificationTier(kind, { workoutInProgress: false }), "action_required");
  }
});

check("a pending health review (activation-blocking) is action_required, never immediate", () => {
  assert.equal(resolveNotificationTier("health_review", { workoutInProgress: false }), "action_required");
});

check("milestone is awareness and never reclassifies as urgent regardless of context", () => {
  assert.equal(resolveNotificationTier("milestone", { workoutInProgress: true }), "awareness");
  assert.equal(resolveNotificationTier("milestone", { workoutInProgress: false }), "awareness");
});

console.log("\n2. Sorting — tier ahead of the existing numeric priority\n");

function makeReview(overrides: Partial<ReviewRequest>): ReviewRequest {
  return {
    id: "r",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    kind: "pain-report",
    severity: "high",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    summary: "x",
    status: "needs_review",
    resolved: false,
    ...overrides,
  };
}

check("a live pain report (immediate) sorts ahead of a program-change-request even though it isn't the lowest numeric priority client-side", () => {
  const items = buildReviewQueueItems({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [
      makeReview({ id: "pain-live", kind: "pain-report", createdAtIso: "2026-01-01T00:00:00.000Z" }),
      makeReview({ id: "program-change", kind: "program-change-request", createdAtIso: "2026-01-02T00:00:00.000Z" }),
    ],
    clients: [CLIENT_PROFILE_DEMO],
    workoutInProgressClientIds: new Set([CLIENT_PROFILE_DEMO.id]),
  });
  assert.equal(items[0].reviewRequestId, "pain-live");
  assert.equal(items[0].notificationTier, "immediate");
});

check("without a live workout, the same pain report drops to action_required and sorts by the existing priority table instead", () => {
  const items = buildReviewQueueItems({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [makeReview({ id: "pain-not-live", kind: "pain-report" })],
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(items[0].notificationTier, "action_required");
});

check("a client absent from workoutInProgressClientIds is always treated as not-in-progress, never defaulted to immediate", () => {
  const items = buildReviewQueueItems({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [makeReview({ id: "pain-unknown", kind: "pain-report" })],
    clients: [CLIENT_PROFILE_DEMO],
    workoutInProgressClientIds: new Set(["some-other-client"]),
  });
  assert.equal(items[0].notificationTier, "action_required");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
