// Phase 6.0D-A — Unified Production Coach Operations Surface.
//
// Pure logic tests for lib/coach/attention-item.ts — the shared AttentionItem
// mapping functions both the Demo and Supabase coach-operations adapters
// (lib/production/coach-operations.ts) produce their results with. No DB,
// no network, no browser, no Next.js request context needed — this file is
// deliberately framework-independent (see its own module doc for why it was
// split out of lib/production/coach-operations.ts, which cannot be imported
// this way: its Supabase adapter needs a real Next.js request via
// lib/supabase/server.ts's next/headers usage). The repository factory
// itself (getCoachOperationsRepository, both classes' actual getAttentionInbox
// behavior against a live session) is exercised by scripts/e2e-coach-operations.mts
// and live browser verification instead — exactly the same split
// lib/production/repository.ts's own FoundationRepository has always had
// (no dedicated unit test for it either; it's proven live).
//
// Run with: npm run verify:coach-operations

import assert from "node:assert/strict";
import {
  attentionItemFromEscalation,
  attentionItemFromDemoQueueItem,
  type AttentionItem,
  type EscalationLike,
} from "../coach/attention-item.ts";
import type { AttentionQueueItem } from "../coach/types.ts";

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

function makeEscalation(overrides: Partial<EscalationLike> = {}): EscalationLike {
  return {
    id: "esc-1",
    clientProfileId: "client-1",
    clientDisplayName: "Client A",
    sourceMessageBody: "my knee has a sharp pain when I squat",
    reasonCategory: "pain_or_safety",
    status: "pending",
    proposedResponse: "Stop that movement for now.",
    createdAtIso: "2026-09-11T12:00:00.000Z",
    priority: 0,
    healthReviewStatus: null,
    documentedLimitations: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
console.log("\n1. attentionItemFromEscalation — Supabase escalations map onto the shared shape\n");

check("maps every field faithfully, never fabricating anything", () => {
  const item = attentionItemFromEscalation(makeEscalation());
  assert.equal(item.id, "esc-1");
  assert.equal(item.clientId, "client-1");
  assert.equal(item.clientDisplayName, "Client A");
  assert.equal(item.sourceMessageBody, "my knee has a sharp pain when I squat");
  assert.equal(item.proposedResponse, "Stop that movement for now.");
  assert.equal(item.priority, 0);
  assert.equal(item.createdAtIso, "2026-09-11T12:00:00.000Z");
  assert.equal(item.escalationReason, "pain_or_safety");
  assert.equal(item.escalationStatus, "pending");
});

check("kindLabel is a real human-readable label, never the raw enum value", () => {
  const item = attentionItemFromEscalation(makeEscalation({ reasonCategory: "explicit_request" }));
  assert.equal(item.kindLabel, "Client asked for you");
  assert.notEqual(item.kindLabel, "explicit_request");
});

check("status mapping: pending/proposed -> open", () => {
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "pending" })).status, "open");
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "proposed" })).status, "open");
});
check("status mapping: approved -> awaiting_coach", () => {
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "approved" })).status, "awaiting_coach");
});
check("status mapping: coach_responded -> coach_responded", () => {
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "coach_responded" })).status, "coach_responded");
});
check("status mapping: resolved -> resolved", () => {
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "resolved" })).status, "resolved");
});

check("hasOpenCoachThread is true only while the temporary thread is genuinely open (approved/coach_responded)", () => {
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "pending" })).hasOpenCoachThread, false);
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "proposed" })).hasOpenCoachThread, false);
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "approved" })).hasOpenCoachThread, true);
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "coach_responded" })).hasOpenCoachThread, true);
  assert.equal(attentionItemFromEscalation(makeEscalation({ status: "resolved" })).hasOpenCoachThread, false);
});

check("a null sourceMessageBody falls back to the reason label as the summary, never a blank card, when there is also no proposedResponse", () => {
  const item = attentionItemFromEscalation(makeEscalation({ sourceMessageBody: null, proposedResponse: null, reasonCategory: "plan_change" }));
  assert.equal(item.summary, "Plan change");
  assert.equal(item.sourceMessageBody, null);
});

check("Phase 7A: a null sourceMessageBody with a real proposedResponse (a pain_or_safety escalation with no originating chat message) shows the real proposedResponse as the summary, never the bare generic label", () => {
  const item = attentionItemFromEscalation(
    makeEscalation({ sourceMessageBody: null, reasonCategory: "pain_or_safety", proposedResponse: "Pain reported: left shoulder, 7/10, during Bench Press." })
  );
  assert.equal(item.summary, "Pain reported: left shoulder, 7/10, during Bench Press.");
});

// ---------------------------------------------------------------------------
console.log("\n2. attentionItemFromDemoQueueItem — demo ReviewRequest items map onto the SAME shared shape\n");

function makeDemoItem(overrides: Partial<AttentionQueueItem> = {}): AttentionQueueItem {
  return {
    reviewRequestId: "review-1",
    workspaceId: "ws-1",
    clientId: "client-demo",
    clientName: "Demo Client",
    assignedCoachId: "coach-1",
    kind: "rpe-anomaly",
    summary: "Today's push workout has RPE values worth a second look.",
    createdAtIso: "2026-07-27T18:00:00.000Z",
    updatedAtIso: "2026-07-27T18:00:00.000Z",
    priority: 2,
    severity: "normal",
    notificationTier: "action_required",
    status: "needs_review",
    ...overrides,
  };
}

check("maps id/client/summary/priority/createdAtIso faithfully", () => {
  const item = attentionItemFromDemoQueueItem(makeDemoItem());
  assert.equal(item.id, "review-1");
  assert.equal(item.clientId, "client-demo");
  assert.equal(item.clientDisplayName, "Demo Client");
  assert.equal(item.summary, "Today's push workout has RPE values worth a second look.");
  assert.equal(item.priority, 2);
  assert.equal(item.createdAtIso, "2026-07-27T18:00:00.000Z");
});

check("kindLabel is a real human-readable label for every AttentionItemKind, never the raw kebab-case value", () => {
  assert.equal(attentionItemFromDemoQueueItem(makeDemoItem({ kind: "rpe-anomaly" })).kindLabel, "RPE anomaly");
  assert.equal(attentionItemFromDemoQueueItem(makeDemoItem({ kind: "health_review" })).kindLabel, "Health review");
  assert.equal(attentionItemFromDemoQueueItem(makeDemoItem({ kind: "plan_approval" })).kindLabel, "Plan approval");
});

check("a demo item never carries hasOpenCoachThread=true — the demo prototype has no temporary-thread concept", () => {
  assert.equal(attentionItemFromDemoQueueItem(makeDemoItem()).hasOpenCoachThread, false);
});

check("a demo item never carries an escalationReason/escalationStatus — those are Supabase-only fields", () => {
  const item = attentionItemFromDemoQueueItem(makeDemoItem());
  assert.equal(item.escalationReason, undefined);
  assert.equal(item.escalationStatus, undefined);
});

check("status maps to 'resolved' only when the underlying ReviewRequestStatus is 'resolved'", () => {
  assert.equal(attentionItemFromDemoQueueItem(makeDemoItem({ status: "resolved" })).status, "resolved");
  assert.equal(attentionItemFromDemoQueueItem(makeDemoItem({ status: "needs_review" })).status, "open");
  assert.equal(attentionItemFromDemoQueueItem(makeDemoItem({ status: "in_progress" })).status, "open");
});

// ---------------------------------------------------------------------------
console.log("\n3. Both shapes are genuinely the same TypeScript interface — cross-source consistency\n");

check("an escalation-sourced item and a demo-sourced item satisfy the exact same AttentionItem type", () => {
  const fromEscalation: AttentionItem = attentionItemFromEscalation(makeEscalation());
  const fromDemo: AttentionItem = attentionItemFromDemoQueueItem(makeDemoItem());
  for (const item of [fromEscalation, fromDemo]) {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.clientId, "string");
    assert.equal(typeof item.clientDisplayName, "string");
    assert.equal(typeof item.kindLabel, "string");
    assert.equal(typeof item.summary, "string");
    assert.equal(typeof item.priority, "number");
    assert.equal(typeof item.createdAtIso, "string");
    assert.equal(typeof item.hasOpenCoachThread, "boolean");
    assert.ok(["open", "awaiting_coach", "coach_responded", "resolved"].includes(item.status));
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
