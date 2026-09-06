// Phase 5.4B — verifies the one real trigger for "ai-authority-boundary":
// a held-for-review Daily Briefing creates exactly one real, idempotent
// ReviewRequest in the unified attention queue.

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
import { saveClientAppState, loadClientAppState } from "../tenancy/client-state-store.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";
import { ensureBriefingBoundaryReview } from "./briefing-escalation.ts";
import { generateDailyBriefing } from "./daily-briefing.ts";

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

const CLIENT_ID = "client-briefing-escalation-test";

function seedClient() {
  const state = createInitialState({ clientId: CLIENT_ID, workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  saveClientAppState(CLIENT_ID, state);
}

console.log("\n1. Held-for-review briefings escalate; clean ones don't\n");

check("a held-for-review briefing creates exactly one real ai-authority-boundary review", () => {
  seedClient();
  const briefing = generateDailyBriefing({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    forDateIso: "2026-01-10",
    isTrainingDay: true,
    automation: "auto_publish",
    hasPainFlag: true,
    hasUnapprovedProgramChange: false,
    hasLowConfidenceSignal: false,
    nowIso: "2026-01-10T07:00:00.000Z",
  });
  const created = ensureBriefingBoundaryReview(CLIENT_ID, briefing, "2026-01-10T07:00:00.000Z");
  assert.equal(created, true);
  const state = loadClientAppState(CLIENT_ID)!;
  const boundaryReviews = state.reviewRequests.filter((r) => r.kind === "ai-authority-boundary");
  assert.equal(boundaryReviews.length, 1);
  assert.equal(boundaryReviews[0].sourceEventId, briefing.id);
});

check("calling it again for the same briefing is idempotent — no duplicate", () => {
  seedClient();
  const briefing = generateDailyBriefing({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    forDateIso: "2026-01-10",
    isTrainingDay: true,
    automation: "auto_publish",
    hasPainFlag: true,
    hasUnapprovedProgramChange: false,
    hasLowConfidenceSignal: false,
    nowIso: "2026-01-10T07:00:00.000Z",
  });
  ensureBriefingBoundaryReview(CLIENT_ID, briefing, "2026-01-10T07:00:00.000Z");
  const second = ensureBriefingBoundaryReview(CLIENT_ID, briefing, "2026-01-10T08:00:00.000Z");
  assert.equal(second, false);
  const state = loadClientAppState(CLIENT_ID)!;
  assert.equal(state.reviewRequests.filter((r) => r.kind === "ai-authority-boundary").length, 1);
});

check("a clean (draft/auto_published) briefing never escalates", () => {
  seedClient();
  const briefing = generateDailyBriefing({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    forDateIso: "2026-01-10",
    isTrainingDay: true,
    automation: "auto_publish",
    hasPainFlag: false,
    hasUnapprovedProgramChange: false,
    hasLowConfidenceSignal: false,
    nowIso: "2026-01-10T07:00:00.000Z",
  });
  const created = ensureBriefingBoundaryReview(CLIENT_ID, briefing, "2026-01-10T07:00:00.000Z");
  assert.equal(created, false);
  const state = loadClientAppState(CLIENT_ID)!;
  assert.equal(state.reviewRequests.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
