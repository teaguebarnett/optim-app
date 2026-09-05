// Phase 5.2 — verifies the review resolution lifecycle: idempotent
// creation, explicit status transitions, resolution notes, and the
// Reviews-page-facing buildReviewQueueItems/buildAttentionQueue split.
//
// lib/coach/review-lifecycle.ts's mutating functions (startReviewRequest/
// resolveReviewRequest/reopenReviewRequest) go through lib/storage.ts,
// which is a no-op outside a real browser (see lib/storage.ts's
// isStorageAvailable) — this script polyfills a minimal in-memory
// `window.localStorage` so those functions get real, meaningful
// save/load round-trip coverage instead of only testing their pure shape.

class FakeWindow extends EventTarget {
  localStorage = (() => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
  })();
}
(globalThis as unknown as { window: unknown }).window = new FakeWindow();

import assert from "node:assert/strict";
import { createInitialState } from "../state.ts";
import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, COACH_PROFILE_ALEX, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { buildAttentionQueue, buildReviewQueueItems } from "./attention-queue.ts";
import {
  findDuplicateReviewRequest,
  requiresResolutionNote,
  reopenReviewRequest,
  resolveReviewRequest,
  severityForKind,
  startReviewRequest,
} from "./review-lifecycle.ts";
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

function makeReview(overrides: Partial<ReviewRequest>): ReviewRequest {
  return {
    id: "review-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    kind: "pain-report",
    severity: "high",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    summary: "Pain reported",
    status: "needs_review",
    resolved: false,
    ...overrides,
  };
}

console.log("\n1. Severity and resolution-note requirement\n");

check("pain-report is high severity and requires a resolution note", () => {
  assert.equal(severityForKind("pain-report"), "high");
  assert.equal(requiresResolutionNote("pain-report"), true);
});

check("every other review kind is normal severity and never requires a note", () => {
  for (const kind of ["rpe-anomaly", "workout-skipped", "schedule-change", "technique-flag", "program-change-request"] as const) {
    assert.equal(severityForKind(kind), "normal");
    assert.equal(requiresResolutionNote(kind), false);
  }
});

console.log("\n2. Idempotent creation — findDuplicateReviewRequest\n");

check("a candidate with no sourceEventId is never treated as a duplicate", () => {
  const existing = [makeReview({ sourceEventId: "pain-1" })];
  const match = findDuplicateReviewRequest(existing, {
    workspaceId: WORKSPACE_OPTIM_ID,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    clientId: CLIENT_PROFILE_DEMO.id,
    kind: "pain-report",
  });
  assert.equal(match, undefined);
});

check("an exact coach/client/kind/sourceEventId match is found regardless of array order", () => {
  const target = makeReview({ id: "review-target", sourceEventId: "workout-push-day-w8-2026-01-01", kind: "rpe-anomaly" });
  const existing = [makeReview({ id: "unrelated", sourceEventId: "something-else" }), target];
  const match = findDuplicateReviewRequest(existing, {
    workspaceId: WORKSPACE_OPTIM_ID,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    clientId: CLIENT_PROFILE_DEMO.id,
    kind: "rpe-anomaly",
    sourceEventId: "workout-push-day-w8-2026-01-01",
  });
  assert.equal(match?.id, "review-target");
});

check("a different coach, client, kind, or workspace never matches, even with the same sourceEventId", () => {
  const existing = [makeReview({ sourceEventId: "shared-event" })];
  const base = {
    workspaceId: WORKSPACE_OPTIM_ID,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    clientId: CLIENT_PROFILE_DEMO.id,
    kind: "pain-report" as const,
    sourceEventId: "shared-event",
  };
  assert.equal(findDuplicateReviewRequest(existing, { ...base, assignedCoachId: COACH_PROFILE_ALEX.id }), undefined);
  assert.equal(findDuplicateReviewRequest(existing, { ...base, clientId: "client-someone-else" }), undefined);
  assert.equal(findDuplicateReviewRequest(existing, { ...base, kind: "rpe-anomaly" }), undefined);
  assert.equal(findDuplicateReviewRequest(existing, { ...base, workspaceId: "workspace-other" }), undefined);
});

console.log("\n3. Status transitions persist through real save/load\n");

const LIFECYCLE_CLIENT_ID = "client-review-lifecycle-test";

function seedClientWithReview(review: ReviewRequest) {
  const state = createInitialState({ clientId: LIFECYCLE_CLIENT_ID, workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  saveClientAppState(LIFECYCLE_CLIENT_ID, { ...state, reviewRequests: [review] });
}

check("startReviewRequest moves needs_review -> in_progress and persists it", () => {
  seedClientWithReview(makeReview({ id: "r-start", status: "needs_review" }));
  const ok = startReviewRequest(LIFECYCLE_CLIENT_ID, "r-start", "2026-01-02T00:00:00.000Z");
  assert.equal(ok, true);
  const reloaded = loadClientAppState(LIFECYCLE_CLIENT_ID);
  const review = reloaded!.reviewRequests.find((r) => r.id === "r-start")!;
  assert.equal(review.status, "in_progress");
  assert.equal(review.updatedAtIso, "2026-01-02T00:00:00.000Z");
  assert.equal(review.resolved, false);
});

check("startReviewRequest is a no-op once already past needs_review — never moves a resolved review backward", () => {
  seedClientWithReview(makeReview({ id: "r-already-resolved", status: "resolved", resolved: true, resolutionAction: "resolved" }));
  const ok = startReviewRequest(LIFECYCLE_CLIENT_ID, "r-already-resolved", "2026-01-02T00:00:00.000Z");
  assert.equal(ok, true);
  const reloaded = loadClientAppState(LIFECYCLE_CLIENT_ID);
  const review = reloaded!.reviewRequests.find((r) => r.id === "r-already-resolved")!;
  assert.equal(review.status, "resolved");
});

check("resolveReviewRequest with 'reviewed_no_change' sets status/resolved/outcome/coach/timestamp together", () => {
  seedClientWithReview(makeReview({ id: "r-resolve-no-change", status: "in_progress" }));
  const ok = resolveReviewRequest({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-resolve-no-change",
    resolutionAction: "reviewed_no_change",
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(ok, true);
  const review = loadClientAppState(LIFECYCLE_CLIENT_ID)!.reviewRequests.find((r) => r.id === "r-resolve-no-change")!;
  assert.equal(review.status, "resolved");
  assert.equal(review.resolved, true);
  assert.equal(review.resolutionAction, "reviewed_no_change");
  assert.equal(review.resolvedByCoachId, COACH_PROFILE_TEAGUE.id);
  assert.equal(review.resolvedAtIso, "2026-01-03T00:00:00.000Z");
});

check("resolveReviewRequest carries a resolution note through to storage", () => {
  seedClientWithReview(makeReview({ id: "r-resolve-note", status: "needs_review" }));
  resolveReviewRequest({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-resolve-note",
    resolutionAction: "resolved",
    resolutionNote: "Client says it's fully healed; cleared to resume overhead pressing.",
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  const review = loadClientAppState(LIFECYCLE_CLIENT_ID)!.reviewRequests.find((r) => r.id === "r-resolve-note")!;
  assert.equal(review.resolutionNote, "Client says it's fully healed; cleared to resume overhead pressing.");
});

check("reopenReviewRequest moves resolved -> needs_review and clears every resolution field", () => {
  seedClientWithReview(
    makeReview({
      id: "r-reopen",
      status: "resolved",
      resolved: true,
      resolutionAction: "resolved",
      resolutionNote: "old note",
      resolvedAtIso: "2026-01-03T00:00:00.000Z",
      resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    })
  );
  const ok = reopenReviewRequest(LIFECYCLE_CLIENT_ID, "r-reopen", "2026-01-04T00:00:00.000Z");
  assert.equal(ok, true);
  const review = loadClientAppState(LIFECYCLE_CLIENT_ID)!.reviewRequests.find((r) => r.id === "r-reopen")!;
  assert.equal(review.status, "needs_review");
  assert.equal(review.resolved, false);
  assert.equal(review.resolutionAction, undefined);
  assert.equal(review.resolutionNote, undefined);
  assert.equal(review.resolvedAtIso, undefined);
  assert.equal(review.resolvedByCoachId, undefined);
});

check("mutating a review id that doesn't exist for that client returns false and touches nothing", () => {
  seedClientWithReview(makeReview({ id: "r-real" }));
  const ok = startReviewRequest(LIFECYCLE_CLIENT_ID, "r-does-not-exist", "2026-01-02T00:00:00.000Z");
  assert.equal(ok, false);
  const reviews = loadClientAppState(LIFECYCLE_CLIENT_ID)!.reviewRequests;
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].status, "needs_review");
});

check("mutating a review for a client with no persisted AppState at all returns false without throwing", () => {
  const ok = startReviewRequest("client-never-had-appstate", "review-x", "2026-01-02T00:00:00.000Z");
  assert.equal(ok, false);
});

console.log("\n4. buildReviewQueueItems (all statuses) vs buildAttentionQueue (unresolved-only)\n");

check("buildReviewQueueItems returns every status; buildAttentionQueue excludes resolved", () => {
  const reviewRequests = [
    makeReview({ id: "needs-review-1", status: "needs_review" }),
    makeReview({ id: "in-progress-1", status: "in_progress" }),
    makeReview({ id: "resolved-1", status: "resolved", resolved: true }),
  ];
  const full = buildReviewQueueItems({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests,
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(full.length, 3);

  const active = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests,
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(active.length, 2);
  assert.equal(
    active.every((item) => item.status !== "resolved"),
    true
  );
});

check("each queue item carries its severity, status, and resolution fields through", () => {
  const reviewRequests = [
    makeReview({
      id: "resolved-with-note",
      status: "resolved",
      resolved: true,
      resolutionAction: "reviewed_no_change",
      resolutionNote: "Discussed on call, no action needed.",
      resolvedAtIso: "2026-01-05T00:00:00.000Z",
      resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    }),
  ];
  const [item] = buildReviewQueueItems({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests,
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(item.severity, "high");
  assert.equal(item.status, "resolved");
  assert.equal(item.resolutionAction, "reviewed_no_change");
  assert.equal(item.resolutionNote, "Discussed on call, no action needed.");
  assert.equal(item.resolvedAtIso, "2026-01-05T00:00:00.000Z");
  assert.equal(item.resolvedByCoachId, COACH_PROFILE_TEAGUE.id);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
