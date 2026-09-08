// Phase 5.4B completion pass — verifies the active-client header's compact
// status derivation (On Track / Monitoring / Needs Attention), purely from
// real attention-queue items for that one client.

import assert from "node:assert/strict";
import { resolveClientStatusLabel } from "./client-status.ts";
import type { AttentionQueueItem } from "./types";

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

function item(overrides: Partial<AttentionQueueItem>): AttentionQueueItem {
  return {
    reviewRequestId: "r1",
    workspaceId: "workspace-optim",
    clientId: "client-a",
    clientName: "Client A",
    assignedCoachId: "coach-teague",
    kind: "pain-report",
    summary: "x",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    priority: 0,
    severity: "high",
    notificationTier: "action_required",
    status: "needs_review",
    ...overrides,
  };
}

console.log("\n1. resolveClientStatusLabel\n");

check("no items at all is on_track", () => {
  assert.equal(resolveClientStatusLabel("client-a", []), "on_track");
});

check("a needs_review item for this client is needs_attention", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ status: "needs_review" })]), "needs_attention");
});

check("an in_progress item is still needs_attention", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ status: "in_progress" })]), "needs_attention");
});

check("only a waiting item (nothing needing a fresh decision) is monitoring", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ status: "waiting" })]), "monitoring");
});

check("a resolved item never counts toward either monitoring or needs_attention", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ status: "resolved" })]), "on_track");
});

check("a milestone item never counts toward needs_attention or monitoring, even if unresolved", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ kind: "milestone", status: "needs_review" })]), "on_track");
});

check("items for a different client are never counted", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ clientId: "client-b", status: "needs_review" })]), "on_track");
});

check("needs_attention takes priority over monitoring when both are present", () => {
  const items = [item({ reviewRequestId: "r1", status: "waiting" }), item({ reviewRequestId: "r2", status: "needs_review" })];
  assert.equal(resolveClientStatusLabel("client-a", items), "needs_attention");
});

console.log("\n2. Phase 5.6A.4 — isPreProgramStart overrides the 'on_track' default to 'scheduled'\n");

check("REGRESSION: a client whose approved program hasn't reached its start date yet is 'scheduled', never 'on_track' — a program can't be on track before it starts", () => {
  assert.equal(resolveClientStatusLabel("client-a", [], true), "scheduled");
});

check("omitting isPreProgramStart preserves the old default — every pre-existing call site keeps working unchanged", () => {
  assert.equal(resolveClientStatusLabel("client-a", []), "on_track");
});

check("a genuinely open decision still outranks 'scheduled' — a real decision is real regardless of whether the program has started", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ status: "needs_review" })], true), "needs_attention");
});

check("a waiting item still outranks 'scheduled' the same way it outranks 'on_track'", () => {
  assert.equal(resolveClientStatusLabel("client-a", [item({ status: "waiting" })], true), "monitoring");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
