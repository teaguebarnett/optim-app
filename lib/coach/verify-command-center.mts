// Phase 5.3B — /coach Command Center pure view-model helpers.
// The decision queue's own priority/dedup logic is already covered by
// lib/coach/verify-coach.mts and verify-review-lifecycle.mts (it's
// unchanged, reused as-is) — this file covers the two new pure helpers:
// roster-pulse categorization and upcoming-work ordering.

import assert from "node:assert/strict";
import { buildRosterPulse, buildUpcomingWork, categorizeRosterStatus } from "./command-center.ts";
import type { ClientLifecycleStatus } from "./types";

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

console.log("\n1. Roster pulse — every client lands in exactly one honest bucket\n");

check("An active client with no queue item is on track", () => {
  const lifecycle = new Map<string, ClientLifecycleStatus>([["c1", "active"]]);
  const pulse = buildRosterPulse(["c1"], lifecycle, new Set());
  assert.deepEqual(pulse, { onTrack: 1, watch: 0, needsCoach: 0 });
});

check("A client mid-pipeline (not yet active) is 'watch', not 'on track'", () => {
  const lifecycle = new Map<string, ClientLifecycleStatus>([
    ["c1", "onboarding"],
    ["c2", "ready_to_activate"],
  ]);
  const pulse = buildRosterPulse(["c1", "c2"], lifecycle, new Set());
  assert.deepEqual(pulse, { onTrack: 0, watch: 2, needsCoach: 0 });
});

check("A client with an open decision-queue item is 'needs coach' REGARDLESS of lifecycle status — a decision always outranks routine pipeline status", () => {
  const lifecycle = new Map<string, ClientLifecycleStatus>([["c1", "active"]]);
  const pulse = buildRosterPulse(["c1"], lifecycle, new Set(["c1"]));
  assert.deepEqual(pulse, { onTrack: 0, watch: 0, needsCoach: 1 });
});

check("Paused and completed clients are excluded from all three buckets — never miscounted as on-track or watch", () => {
  const lifecycle = new Map<string, ClientLifecycleStatus>([
    ["c1", "paused"],
    ["c2", "completed"],
  ]);
  const pulse = buildRosterPulse(["c1", "c2"], lifecycle, new Set());
  assert.deepEqual(pulse, { onTrack: 0, watch: 0, needsCoach: 0 });
});

check("A client with no lifecycle record at all (the pre-existing seeded-active convention) defaults to on-track", () => {
  const pulse = buildRosterPulse(["c1"], new Map(), new Set());
  assert.deepEqual(pulse, { onTrack: 1, watch: 0, needsCoach: 0 });
});

check("Every client is counted exactly once across the three buckets, never zero and never twice", () => {
  const lifecycle = new Map<string, ClientLifecycleStatus>([
    ["c1", "active"],
    ["c2", "onboarding"],
    ["c3", "active"],
  ]);
  const pulse = buildRosterPulse(["c1", "c2", "c3"], lifecycle, new Set(["c3"]));
  assert.equal(pulse.onTrack + pulse.watch + pulse.needsCoach, 3);
  assert.deepEqual(pulse, { onTrack: 1, watch: 1, needsCoach: 1 });
});

console.log("\n1b. categorizeRosterStatus — the single-client version the Clients-list filter reuses\n");

check("A client with an open decision is 'needs_coach' regardless of lifecycle", () => {
  assert.equal(categorizeRosterStatus(true, "active"), "needs_coach");
  assert.equal(categorizeRosterStatus(true, "onboarding"), "needs_coach");
});

check("An active client with no open decision is 'on_track'", () => {
  assert.equal(categorizeRosterStatus(false, "active"), "on_track");
});

check("A mid-pipeline client with no open decision is 'watch'", () => {
  assert.equal(categorizeRosterStatus(false, "invited"), "watch");
  assert.equal(categorizeRosterStatus(false, "ready_to_activate"), "watch");
});

check("Paused/completed clients categorize as 'other' — neither on_track nor watch", () => {
  assert.equal(categorizeRosterStatus(false, "paused"), "other");
  assert.equal(categorizeRosterStatus(false, "completed"), "other");
});

console.log("\n2. Upcoming work — real pipeline state, never a fabricated calendar\n");

check("Active, paused, and completed clients never appear in upcoming work", () => {
  const lifecycle = new Map<string, ClientLifecycleStatus>([
    ["c1", "active"],
    ["c2", "paused"],
    ["c3", "completed"],
  ]);
  const items = buildUpcomingWork(
    [
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
    ],
    lifecycle
  );
  assert.deepEqual(items, []);
});

check("A ready-to-activate client sorts before earlier-pipeline clients, regardless of input order", () => {
  const lifecycle = new Map<string, ClientLifecycleStatus>([
    ["c1", "invited"],
    ["c2", "ready_to_activate"],
    ["c3", "onboarding"],
  ]);
  const items = buildUpcomingWork(
    [
      { id: "c1", name: "Invited" },
      { id: "c2", name: "ReadyToActivate" },
      { id: "c3", name: "Onboarding" },
    ],
    lifecycle
  );
  assert.equal(items[0].clientId, "c2");
  assert.equal(items[0].readyToActivate, true);
  assert.equal(items.length, 3);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
