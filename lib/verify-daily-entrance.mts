// Phase 5.4B — verifies the client-side daily-entrance tracking
// (AppState.dailyEntrance, MARK_DAILY_ENTRANCE_SEEN) and the
// consecutive-clean-workout streak counter that feeds milestone detection,
// directly against the real reducer — see lib/state.ts.

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
import { createInitialState, reducer } from "./state.ts";
import { resolveRollover } from "./history/rollover.ts";
import { getLiveHistoryStore } from "./history/local-storage-history-store.ts";
import type { WorkoutSummary } from "./types";

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

function cleanSummary(overrides: Partial<WorkoutSummary> = {}): WorkoutSummary {
  return {
    exercisesCompleted: 4,
    exercisesSkipped: 0,
    workingSetsCompleted: 12,
    skippedSetsCount: 0,
    missingRpeCount: 0,
    averageRpe: 7,
    painReportCount: 0,
    durationMin: 45,
    headline: "Completed",
    detail: "Every set logged.",
    needsReview: false,
    fullyCompleted: true,
    ...overrides,
  };
}

console.log("\n1. Daily entrance defaults and MARK_DAILY_ENTRANCE_SEEN\n");

check("a fresh AppState has never seen the entrance sequence", () => {
  const state = createInitialState();
  assert.equal(state.dailyEntrance.lastSeenLocalDateIso, null);
  assert.equal(state.consecutiveCleanWorkouts, 0);
});

check("MARK_DAILY_ENTRANCE_SEEN records today's real local date", () => {
  const state = createInitialState();
  const next = reducer(state, { type: "MARK_DAILY_ENTRANCE_SEEN" });
  assert.equal(next.dailyEntrance.lastSeenLocalDateIso, state.dateIso);
});

check("MARK_DAILY_ENTRANCE_SEEN is idempotent — dispatching it again the same day changes nothing further", () => {
  const state = createInitialState();
  const once = reducer(state, { type: "MARK_DAILY_ENTRANCE_SEEN" });
  const twice = reducer(once, { type: "MARK_DAILY_ENTRANCE_SEEN" });
  assert.equal(twice, once);
});

console.log("\n2. A new calendar day naturally resets the entrance tracker (via rollover)\n");

check("a forward rollover to a new day resets dailyEntrance without any extra rollover code", () => {
  const store = getLiveHistoryStore();
  const state = createInitialState();
  const seen = reducer(state, { type: "MARK_DAILY_ENTRANCE_SEEN" });
  assert.equal(seen.dailyEntrance.lastSeenLocalDateIso, seen.dateIso);

  const tomorrowIso = new Date(new Date(`${seen.dateIso}T00:00:00.000Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const result = resolveRollover(seen, tomorrowIso, store);
  assert.equal(result.nextState.dateIso, tomorrowIso);
  assert.equal(result.nextState.dailyEntrance.lastSeenLocalDateIso, null);
  // Coach-set configuration must still survive the rollover untouched.
  assert.deepEqual(result.nextState.programEnrollment, seen.programEnrollment);
});

console.log("\n3. Consecutive-clean-workout streak counter\n");

check("a clean COMPLETE_WORKOUT (no review needed) increments the streak", () => {
  const state = createInitialState();
  const next = reducer(state, { type: "COMPLETE_WORKOUT", summary: cleanSummary() });
  assert.equal(next.consecutiveCleanWorkouts, 1);
});

check("a COMPLETE_WORKOUT that needs review resets the streak to 0", () => {
  const state = { ...createInitialState(), consecutiveCleanWorkouts: 3 };
  const next = reducer(state, { type: "COMPLETE_WORKOUT", summary: cleanSummary({ needsReview: true, exercisesSkipped: 1 }) });
  assert.equal(next.consecutiveCleanWorkouts, 0);
});

check("SKIP_WORKOUT resets the streak to 0", () => {
  const state = { ...createInitialState(), consecutiveCleanWorkouts: 4 };
  const next = reducer(state, { type: "SKIP_WORKOUT", reason: "schedule-conflict" });
  assert.equal(next.consecutiveCleanWorkouts, 0);
});

check("crossing the milestone threshold via real COMPLETE_WORKOUT dispatches creates one real milestone review", () => {
  let state = createInitialState();
  for (let i = 0; i < 5; i++) {
    state = reducer(state, { type: "COMPLETE_WORKOUT", summary: cleanSummary() });
  }
  assert.equal(state.consecutiveCleanWorkouts, 5);
  const milestones = state.reviewRequests.filter((r) => r.kind === "milestone");
  assert.equal(milestones.length, 1);
  assert.ok(milestones[0].preparedClientMessage);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
