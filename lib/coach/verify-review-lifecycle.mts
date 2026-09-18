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
import { buildAttentionQueue, buildReviewQueueItems, attentionBucketForItem } from "./attention-queue.ts";
import {
  findDuplicateReviewRequest,
  moveReviewToWaiting,
  requiresClientNotificationBeforeResolution,
  requiresResolutionNote,
  reopenReviewRequest,
  resolveReviewRequest,
  severityForKind,
  startReviewRequest,
} from "./review-lifecycle.ts";
import type { ReviewRequest } from "../types";
import type { AttentionQueueItem } from "./types.ts";
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

check("routine, self-contained kinds are normal severity and never require a note", () => {
  for (const kind of ["rpe-anomaly", "workout-skipped", "schedule-change", "technique-flag"] as const) {
    assert.equal(severityForKind(kind), "normal");
    assert.equal(requiresResolutionNote(kind), false);
  }
});

// Phase 5.4B — a proposed program/exercise change and every synthesized
// pattern/boundary kind are real decisions affecting the client, so they
// carry the same rigor as pain-report: high severity, and a note is
// required before they can resolve (see lib/coach/review-support.ts).
check("significant decision kinds are high severity and require a note", () => {
  for (const kind of ["program-change-request", "performance-pattern", "adherence-pattern", "recovery-deterioration", "ai-authority-boundary"] as const) {
    assert.equal(severityForKind(kind), "high");
    assert.equal(requiresResolutionNote(kind), true);
  }
});

check("milestone is normal severity and never requires a note — its own prepared-message flow, not a risk decision", () => {
  assert.equal(severityForKind("milestone"), "normal");
  assert.equal(requiresResolutionNote("milestone"), false);
});

check("ai-authority-boundary requires a note but not a separate client message — a held briefing's own publish step already is the notification", () => {
  assert.equal(requiresResolutionNote("ai-authority-boundary"), true);
  assert.equal(requiresClientNotificationBeforeResolution("ai-authority-boundary"), false);
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
  const result = resolveReviewRequest({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-resolve-no-change",
    resolutionAction: "reviewed_no_change",
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    resolvedByCoachName: "Teague Barnett",
    clientMessage: "Nothing to change — keep training as planned.",
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
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
    resolvedByCoachName: "Teague Barnett",
    clientMessage: "You're cleared to resume overhead pressing.",
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  const review = loadClientAppState(LIFECYCLE_CLIENT_ID)!.reviewRequests.find((r) => r.id === "r-resolve-note")!;
  assert.equal(review.resolutionNote, "Client says it's fully healed; cleared to resume overhead pressing.");
});

console.log("\n3b. Resolution notification gate, waiting lifecycle, and resolution receipts (Phase 5.4B)\n");

check("resolving a significant kind without a client message is blocked and changes nothing", () => {
  seedClientWithReview(makeReview({ id: "r-blocked", status: "needs_review", kind: "pain-report" }));
  const result = resolveReviewRequest({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-blocked",
    resolutionAction: "resolved",
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    resolvedByCoachName: "Teague Barnett",
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "notification_required");
  const review = loadClientAppState(LIFECYCLE_CLIENT_ID)!.reviewRequests.find((r) => r.id === "r-blocked")!;
  assert.equal(review.status, "needs_review");
});

check("resolving a significant kind with a client message relays a real, provenance-tagged chat message and a resolution receipt", () => {
  seedClientWithReview(makeReview({ id: "r-with-message", status: "needs_review", kind: "pain-report" }));
  const before = loadClientAppState(LIFECYCLE_CLIENT_ID)!.chatMessages.length;
  const result = resolveReviewRequest({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-with-message",
    resolutionAction: "resolved",
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    resolvedByCoachName: "Teague Barnett",
    clientMessage: "Keep incline pressing paused today.",
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  const state = loadClientAppState(LIFECYCLE_CLIENT_ID)!;
  const review = state.reviewRequests.find((r) => r.id === "r-with-message")!;
  assert.equal(review.status, "resolved");
  assert.ok(review.resolutionReceipt);
  assert.equal(review.resolutionReceipt!.approvedByCoachName, "Teague Barnett");
  assert.equal(review.resolutionReceipt!.clientCommunicated, "Keep incline pressing paused today.");
  assert.equal(state.chatMessages.length, before + 1);
  const relayed = state.chatMessages[state.chatMessages.length - 1];
  assert.equal(relayed.sender, "assistant");
  assert.equal(relayed.relayedCoachDecision?.coachDisplayName, "Teague Barnett");
  assert.equal(relayed.text, "Teague reviewed this and wants you to know: Keep incline pressing paused today.");
});

console.log("\n3c. Gate 2C — the client-requested kind (explicit 'Talk to Teague')\n");

check("client-requested is normal severity but still requires a resolution note and client notification", () => {
  assert.equal(severityForKind("client-requested"), "normal");
  assert.equal(requiresResolutionNote("client-requested"), true);
  assert.equal(requiresClientNotificationBeforeResolution("client-requested"), true);
});

check("resolving a client-requested review without a reply is blocked, exactly like any other significant kind", () => {
  seedClientWithReview(makeReview({ id: "r-talk-blocked", status: "needs_review", kind: "client-requested", severity: "normal", summary: "Asked to talk directly." }));
  const result = resolveReviewRequest({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-talk-blocked",
    resolutionAction: "resolved",
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    resolvedByCoachName: "Teague Barnett",
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "notification_required");
});

check("resolving a client-requested review with a reply relays it to the client and closes the temporary thread", () => {
  seedClientWithReview(makeReview({ id: "r-talk-resolved", status: "needs_review", kind: "client-requested", severity: "normal", summary: "Asked to talk directly." }));
  const result = resolveReviewRequest({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-talk-resolved",
    resolutionAction: "resolved",
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    resolvedByCoachName: "Teague Barnett",
    clientMessage: "Let's push tomorrow's session to 6pm — I'll adjust your plan.",
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  const state = loadClientAppState(LIFECYCLE_CLIENT_ID)!;
  const review = state.reviewRequests.find((r) => r.id === "r-talk-resolved")!;
  // The client-side screen derives its "still talking with Teague" state
  // from exactly this: reviewRequests.find(kind === "client-requested" &&
  // !resolved). Once resolved is true, that lookup finds nothing and the
  // screen reverts to the default OPTIM conversation on its own — no
  // separate "close the thread" step exists or is needed.
  assert.equal(review.resolved, true);
  const relayed = state.chatMessages[state.chatMessages.length - 1];
  assert.equal(relayed.sender, "assistant", "the relay is attributed to OPTIM communicating Teague's reply, never faked as Teague speaking directly");
  assert.equal(relayed.relayedCoachDecision?.coachDisplayName, "Teague Barnett");
  assert.match(relayed.text, /Teague reviewed this and wants you to know/);
});

check("moveReviewToWaiting records what's being waited on and never resolves the review", () => {
  seedClientWithReview(makeReview({ id: "r-waiting", status: "needs_review", kind: "pain-report" }));
  const ok = moveReviewToWaiting({
    clientId: LIFECYCLE_CLIENT_ID,
    reviewId: "r-waiting",
    waitingOn: "Client's reply about tomorrow's session",
    resurfaceAtIso: "2026-01-05T00:00:00.000Z",
    actorLabel: "Teague Barnett",
    nowIso: "2026-01-04T00:00:00.000Z",
  });
  assert.equal(ok, true);
  const review = loadClientAppState(LIFECYCLE_CLIENT_ID)!.reviewRequests.find((r) => r.id === "r-waiting")!;
  assert.equal(review.status, "waiting");
  assert.equal(review.waitingOn, "Client's reply about tomorrow's session");
  assert.equal(review.resolved, false);
  assert.equal(review.history?.some((h) => h.action.includes("Moved to waiting")), true);
});

check("a waiting item only re-enters 'needs_attention' once its own resurface time has arrived", () => {
  const item = { kind: "pain-report", status: "waiting", resurfaceAtIso: "2026-01-05T00:00:00.000Z" } as unknown as AttentionQueueItem;
  assert.equal(attentionBucketForItem(item, "2026-01-04T00:00:00.000Z"), "waiting");
  assert.equal(attentionBucketForItem(item, "2026-01-05T00:00:00.000Z"), "needs_attention");
  assert.equal(attentionBucketForItem(item, "2026-01-06T00:00:00.000Z"), "needs_attention");
});

check("a milestone item never mixes into the needs_attention bucket, and never requires client notification", () => {
  assert.equal(requiresClientNotificationBeforeResolution("milestone"), false);
  const item = { kind: "milestone", status: "needs_review" } as unknown as AttentionQueueItem;
  assert.equal(attentionBucketForItem(item, "2026-01-04T00:00:00.000Z"), "worth_personal_touch");
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

console.log("\n5. Phase 5.6A.3 — 'plan_approval' attention items (the honest signal a generated plan is real and waiting on the coach)\n");

check("A generation record sitting at 'ready_for_review' synthesizes a real, high-priority plan_approval item — never silently absent from the queue", () => {
  const record = {
    id: "gen-1",
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    state: "ready_for_review",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-02T00:00:00.000Z",
  } as unknown as ActivationGenerationRecord;

  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [],
    clients: [CLIENT_PROFILE_DEMO],
    activationGenerations: [record],
    intendedStartDateIsoByClientId: new Map([[CLIENT_PROFILE_DEMO.id, "2026-01-15"]]),
  });
  const item = queue.find((i) => i.kind === "plan_approval");
  assert.ok(item, "a ready_for_review generation must produce a real plan_approval attention item");
  assert.equal(item?.clientId, CLIENT_PROFILE_DEMO.id);
  assert.ok(item!.summary.includes("January 15"), "the summary must name the coach's own real chosen start date, never a generic placeholder");
  // Ranks ahead of every ordinary review-kind priority (only health_review outranks it) — see ATTENTION_PRIORITY.
  assert.equal(queue[0].kind, "plan_approval");
});

check("A generation record sitting at 'activated' (already approved) never produces a plan_approval item — nothing left to decide", () => {
  const record = {
    id: "gen-2",
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    state: "activated",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-02T00:00:00.000Z",
  } as unknown as ActivationGenerationRecord;

  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [],
    clients: [CLIENT_PROFILE_DEMO],
    activationGenerations: [record],
  });
  assert.equal(
    queue.some((i) => i.kind === "plan_approval"),
    false
  );
});

check("A generation record from a different workspace is never synthesized into this workspace's queue (isolation)", () => {
  const record = {
    id: "gen-3",
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: "workspace-someone-else",
    state: "ready_for_review",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-02T00:00:00.000Z",
  } as unknown as ActivationGenerationRecord;

  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [],
    clients: [CLIENT_PROFILE_DEMO],
    activationGenerations: [record],
  });
  assert.equal(
    queue.some((i) => i.kind === "plan_approval"),
    false
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
