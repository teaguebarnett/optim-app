// Phase 5.4B completion pass — verifies the stored/refreshed OPTIM Coach
// Brief: activation-brief sentence generation, operating-brief change
// detection, and the "no meaningful change -> no regeneration" persistence
// gate. Pure functions, no storage dependency.

import assert from "node:assert/strict";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { buildActivationBriefSentences } from "./activation-brief.ts";
import { resolveActivationBrief, resolveOperatingBrief } from "./coach-brief-record.ts";
import type { ActivationReadiness, OnboardingProgress } from "./types";

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

function readyReadiness(overrides: Partial<ActivationReadiness> = {}): ActivationReadiness {
  return { ready: true, requirements: [{ id: "onboarding_complete", label: "Onboarding complete", met: true }], ...overrides };
}

function blockedReadiness(): ActivationReadiness {
  return {
    ready: false,
    requirements: [
      { id: "onboarding_complete", label: "Onboarding complete", met: true },
      { id: "week1_program_assigned", label: "Training protocol", met: false, reason: "No training protocol has been assigned yet.", actionLabel: "Assign the training protocol" },
    ],
  };
}

const COMPLETED_ONBOARDING: OnboardingProgress = {
  clientId: CLIENT_PROFILE_DEMO.id,
  workspaceId: WORKSPACE_OPTIM_ID,
  currentStepIndex: 6,
  completedAtIso: "2026-01-01T00:00:00.000Z",
  updatedAtIso: "2026-01-01T00:00:00.000Z",
  answers: {
    what_you_want: { primaryGoal: "body_recomposition" },
    your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60_90_min", trainingEnvironment: "home_gym" },
    health_finish: { hasInjuryHistory: false },
  },
};

console.log("\n1. Activation brief sentences\n");

check("never exceeds three sentences and never fabricates onboarding data", () => {
  const sentences = buildActivationBriefSentences({
    clientFirstName: "Charles",
    onboarding: COMPLETED_ONBOARDING,
    intendedProgram: null,
    programEnrollment: null,
    readiness: blockedReadiness(),
  });
  assert.ok(sentences.length <= 3);
  assert.ok(sentences[0].includes("Charles"));
});

check("a client who hasn't completed onboarding gets an honest, non-fabricated fallback", () => {
  const sentences = buildActivationBriefSentences({
    clientFirstName: "Jordan",
    onboarding: null,
    intendedProgram: null,
    programEnrollment: null,
    readiness: blockedReadiness(),
  });
  assert.equal(sentences.length, 1);
  assert.ok(sentences[0].includes("hasn't completed onboarding"));
});

check("a real health flag names the real reported area, never a generic warning", () => {
  const onboardingWithInjury: OnboardingProgress = {
    ...COMPLETED_ONBOARDING,
    answers: { ...COMPLETED_ONBOARDING.answers, health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["wrist_elbow"] } },
  };
  const sentences = buildActivationBriefSentences({
    clientFirstName: "Charles",
    onboarding: onboardingWithInjury,
    intendedProgram: null,
    programEnrollment: null,
    readiness: blockedReadiness(),
  });
  assert.ok(sentences[2].toLowerCase().includes("wrist/elbow"));
});

console.log("\n2. resolveActivationBrief persistence gate\n");

check("first resolution always produces a new record", () => {
  const result = resolveActivationBrief(null, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    clientFirstName: "Charles",
    onboarding: COMPLETED_ONBOARDING,
    intendedProgram: null,
    programEnrollment: null,
    readiness: blockedReadiness(),
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  assert.equal(result.changed, true);
  assert.equal(result.record.kind, "activation");
  assert.equal(result.record.actionRequired, true);
});

check("resolving again with identical real inputs makes no change (no fabricated regeneration)", () => {
  const first = resolveActivationBrief(null, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    clientFirstName: "Charles",
    onboarding: COMPLETED_ONBOARDING,
    intendedProgram: null,
    programEnrollment: null,
    readiness: blockedReadiness(),
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  const second = resolveActivationBrief(first.record, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    clientFirstName: "Charles",
    onboarding: COMPLETED_ONBOARDING,
    intendedProgram: null,
    programEnrollment: null,
    readiness: blockedReadiness(),
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(second.changed, false);
  assert.equal(second.record, first.record);
  assert.equal(second.record.updatedAtIso, "2026-01-02T00:00:00.000Z");
});

check("resolving the blocker (readiness becomes ready) produces a real, changed record", () => {
  const first = resolveActivationBrief(null, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    clientFirstName: "Charles",
    onboarding: COMPLETED_ONBOARDING,
    intendedProgram: null,
    programEnrollment: null,
    readiness: blockedReadiness(),
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  const second = resolveActivationBrief(first.record, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    clientFirstName: "Charles",
    onboarding: COMPLETED_ONBOARDING,
    intendedProgram: null,
    programEnrollment: null,
    readiness: readyReadiness(),
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  assert.equal(second.changed, true);
  assert.equal(second.record.actionRequired, false);
  assert.ok(second.record.sentences[2].includes("ready to activate"));
});

console.log("\n3. resolveOperatingBrief change detection (active clients)\n");

function baseOperatingInput(overrides: Partial<Parameters<typeof resolveOperatingBrief>[1]> = {}) {
  return {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    clientFirstName: "Charles",
    lifecycle: "active" as const,
    programWeekLabel: "Week 8 of 12",
    isPreProgramStart: false,
    startDateFullLabel: null,
    unresolvedReviews: [],
    latestResolvedReview: null,
    latestClientChatMessageAtIso: null,
    latestWorkoutCompletedAtIso: null,
    latestWorkoutNeedsReview: false,
    nowIso: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

check("an on-track client with nothing open never claims action is required", () => {
  const result = resolveOperatingBrief(null, baseOperatingInput());
  assert.equal(result.record.actionRequired, false);
  assert.ok(result.record.sentences[0].includes("on track"));
  assert.equal(result.record.sentences[2], "No action required right now.");
});

check("REGRESSION: a scheduled client (approved program, real start date still in the future) is never described as 'on track' — the exact bug this phase repairs", () => {
  const result = resolveOperatingBrief(
    null,
    baseOperatingInput({
      programWeekLabel: "Starts Sep 14 · 12-week program",
      isPreProgramStart: true,
      startDateFullLabel: "Monday, September 14",
      clientFirstName: "E2E",
    })
  );
  assert.equal(result.record.sentences[0], "E2E's program begins Monday, September 14. No adherence data is expected yet.");
  assert.ok(!result.record.sentences[0].toLowerCase().includes("on track"));
  assert.equal(result.record.actionRequired, false);
});

check("crossing the real start date (isPreProgramStart flips false) always regenerates, even with everything else unchanged", () => {
  const first = resolveOperatingBrief(null, baseOperatingInput({ isPreProgramStart: true, startDateFullLabel: "Monday, September 14" }));
  const second = resolveOperatingBrief(first.record, baseOperatingInput({ isPreProgramStart: false, nowIso: "2026-01-06T00:00:00.000Z" }));
  assert.equal(second.changed, true);
  assert.ok(second.record.sentences[0].includes("on track"));
});

check("a new unresolved review is detected as the meaningful change and requires action", () => {
  const first = resolveOperatingBrief(null, baseOperatingInput());
  const second = resolveOperatingBrief(
    first.record,
    baseOperatingInput({
      unresolvedReviews: [{ id: "r1", kind: "pain-report", summary: "Pain reported: shoulder." }],
      nowIso: "2026-01-06T00:00:00.000Z",
    })
  );
  assert.equal(second.changed, true);
  assert.equal(second.record.actionRequired, true);
  assert.equal(second.record.linkedReviewRequestId, "r1");
  assert.ok(second.record.sentences[1].toLowerCase().includes("pain report"));
});

check("identical real inputs never regenerate — repeated calls are a true no-op", () => {
  const first = resolveOperatingBrief(null, baseOperatingInput());
  const second = resolveOperatingBrief(first.record, baseOperatingInput({ nowIso: "2026-01-06T00:00:00.000Z" }));
  assert.equal(second.changed, false);
  assert.equal(second.record, first.record);
});

check("a resolved review is detected as the meaningful change once the flag clears", () => {
  const first = resolveOperatingBrief(
    null,
    baseOperatingInput({ unresolvedReviews: [{ id: "r1", kind: "pain-report", summary: "Pain reported: shoulder." }] })
  );
  const second = resolveOperatingBrief(
    first.record,
    baseOperatingInput({ unresolvedReviews: [], latestResolvedReview: { id: "r1", kind: "pain-report", resolvedAtIso: "2026-01-06T00:00:00.000Z" }, nowIso: "2026-01-06T00:00:00.000Z" })
  );
  assert.equal(second.changed, true);
  assert.equal(second.record.actionRequired, false);
  assert.ok(second.record.sentences[1].toLowerCase().includes("resolved"));
});

check("a new client chat message is detected as a meaningful change when nothing else changed", () => {
  const first = resolveOperatingBrief(null, baseOperatingInput());
  const second = resolveOperatingBrief(first.record, baseOperatingInput({ latestClientChatMessageAtIso: "2026-01-06T00:00:00.000Z", nowIso: "2026-01-06T00:00:00.000Z" }));
  assert.equal(second.changed, true);
  assert.ok(second.record.sentences[1].toLowerCase().includes("message"));
});

check("opening the page repeatedly with no new events never erases or overwrites the last real checkpoint", () => {
  const first = resolveOperatingBrief(
    null,
    baseOperatingInput({ unresolvedReviews: [{ id: "r1", kind: "pain-report", summary: "Pain reported: shoulder." }] })
  );
  for (let i = 0; i < 5; i++) {
    const again = resolveOperatingBrief(
      first.record,
      baseOperatingInput({ unresolvedReviews: [{ id: "r1", kind: "pain-report", summary: "Pain reported: shoulder." }], nowIso: `2026-01-0${6 + i}T00:00:00.000Z` })
    );
    assert.equal(again.changed, false);
    assert.equal(again.record, first.record);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
