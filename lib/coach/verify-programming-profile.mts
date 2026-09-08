// Phase 5.5 — verifies the normalized Client Programming Profile: real
// extraction from onboarding answers, honest assumption-flagging, and the
// four-state intake-completeness resolver.

import assert from "node:assert/strict";
import { WORKSPACE_OPTIM_ID, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { extractClientProgrammingProfile, resolveProgrammingProfileReadiness } from "./programming-profile.ts";
import type { HealthReviewRecord, OnboardingProgress } from "./types";

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

function completedOnboarding(overrides: Partial<OnboardingProgress["answers"]> = {}): OnboardingProgress {
  return {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    currentStepIndex: 6,
    completedAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    answers: {
      about_you: { age: 30, heightFeet: 5, heightInchesRemainder: 10, weightLb: 180, sex: "male" },
      what_you_want: { primaryGoal: "build_muscle" },
      your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["morning"] },
      starting_point: { trainingExperience: "comfortable_common", recentConsistency: "fairly_consistent", weeklyFrequency: 3, trainingNotes: "Loves squats, hates burpees." },
      fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8" },
      ...overrides,
    },
  };
}

console.log("\n1. extractClientProgrammingProfile — real extraction, honest assumptions\n");

check("a fully-answered onboarding produces a complete profile with no assumptions flagged", () => {
  const onboarding = completedOnboarding({
    your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["morning"], dailyActivityLevel: "very_active" },
    fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "enjoys_cardio" },
  });
  const result = extractClientProgrammingProfile(onboarding, null);
  assert.ok("profile" in result);
  if ("profile" in result) {
    assert.equal(result.profile.dailyActivityLevel, "very_active");
    assert.equal(result.profile.dailyActivityLevelIsAssumed, false);
    assert.equal(result.profile.cardioPreference, "enjoys_cardio");
    assert.equal(result.profile.cardioPreferenceIsAssumed, false);
    assert.equal(result.profile.trainingNotes, "Loves squats, hates burpees.");
    assert.equal(result.profile.recentWeeklyFrequency, 3);
  }
});

check("an optional field left blank is honestly flagged as assumed, never silently guessed as answered", () => {
  const result = extractClientProgrammingProfile(completedOnboarding(), null);
  assert.ok("profile" in result);
  if ("profile" in result) {
    assert.equal(result.profile.dailyActivityLevelIsAssumed, true);
    assert.equal(result.profile.cardioPreferenceIsAssumed, true);
  }
});

check("real injury/restriction facts pass through verbatim, never paraphrased or dropped", () => {
  const onboarding = completedOnboarding({ health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["knee"], injuryRestrictions: "No deep knee flexion under load." } });
  const result = extractClientProgrammingProfile(onboarding, null);
  assert.ok("profile" in result);
  if ("profile" in result) {
    assert.equal(result.profile.hasCurrentInjury, true);
    assert.deepEqual(result.profile.injuryBodyAreas, ["knee"]);
    assert.equal(result.profile.injuryRestrictions, "No deep knee flexion under load.");
  }
});

check("missing critical fields (inherited from extractClientSnapshot) still block extraction", () => {
  const onboarding = completedOnboarding({ what_you_want: {} });
  const result = extractClientProgrammingProfile(onboarding, null);
  assert.ok("missing" in result);
  if ("missing" in result) assert.ok(result.missing.includes("Primary goal"));
});

console.log("\n2. resolveProgrammingProfileReadiness — four honest states\n");

check("blocked when critical data is missing — surfaces one concrete question, not a checklist dump", () => {
  const result = extractClientProgrammingProfile(completedOnboarding({ your_week: {} }), null);
  const readiness = resolveProgrammingProfileReadiness(result);
  assert.equal(readiness.status, "blocked");
  assert.ok(readiness.blockingQuestion);
});

check("ready with no assumptions when everything, including the optional fields, was answered", () => {
  const onboarding = completedOnboarding({
    your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["morning"], dailyActivityLevel: "lightly_active" },
    fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "neutral_on_cardio" },
  });
  const readiness = resolveProgrammingProfileReadiness(extractClientProgrammingProfile(onboarding, null));
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.assumptions.length, 0);
});

check("ready_with_assumptions lists every real assumption made", () => {
  const readiness = resolveProgrammingProfileReadiness(extractClientProgrammingProfile(completedOnboarding(), null));
  assert.equal(readiness.status, "ready_with_assumptions");
  assert.ok(readiness.assumptions.length > 0);
});

check("needs_coach_review wins over ready_with_assumptions when a real health flag is unresolved", () => {
  const onboarding = completedOnboarding({ health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["shoulder"] } });
  const healthReview: HealthReviewRecord = { clientId: CLIENT_PROFILE_DEMO.id, workspaceId: WORKSPACE_OPTIM_ID, status: "review_needed", reasons: ["Reported shoulder limitation."], createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" };
  const readiness = resolveProgrammingProfileReadiness(extractClientProgrammingProfile(onboarding, healthReview));
  assert.equal(readiness.status, "needs_coach_review");
  assert.ok(readiness.reviewReason?.includes("shoulder"));
});

check("a resolved health review never blocks readiness", () => {
  const onboarding = completedOnboarding({
    health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["shoulder"] },
    your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["morning"], dailyActivityLevel: "lightly_active" },
    fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "neutral_on_cardio" },
  });
  const healthReview: HealthReviewRecord = { clientId: CLIENT_PROFILE_DEMO.id, workspaceId: WORKSPACE_OPTIM_ID, status: "reviewed_by_coach", reasons: ["Reported shoulder limitation."], createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" };
  const readiness = resolveProgrammingProfileReadiness(extractClientProgrammingProfile(onboarding, healthReview));
  assert.equal(readiness.status, "ready");
});

// ---------------------------------------------------------------------------
// Phase 5.6A.1 additions
// ---------------------------------------------------------------------------

console.log("\n3. Phase 5.6A.1 — custom goal text and coach-documented limitations\n");

check("a custom 'Something else' goal carries the client's own written text on the profile", () => {
  const onboarding = completedOnboarding({ what_you_want: { primaryGoal: "something_else", primaryGoalOther: "Finish a Spartan Race in June" } });
  const result = extractClientProgrammingProfile(onboarding, null);
  if (!("profile" in result)) throw new Error("expected a profile");
  assert.equal(result.profile.primaryGoal, "something_else");
  assert.equal(result.profile.primaryGoalOther, "Finish a Spartan Race in June");
});

check("a normal (non-custom) goal never carries stray primaryGoalOther text", () => {
  const result = extractClientProgrammingProfile(completedOnboarding(), null);
  if (!("profile" in result)) throw new Error("expected a profile");
  assert.equal(result.profile.primaryGoalOther, null);
});

check("'proceed_with_limitations' resolves health review and folds the coach's documented limitation into injuryRestrictions — reaching the same planning constraints a client-reported restriction does", () => {
  const onboarding = completedOnboarding({ health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["shoulder"], injuryRestrictions: "No pain above shoulder height." } });
  const healthReview: HealthReviewRecord = {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    status: "proceed_with_limitations",
    reasons: ["Reported shoulder limitation."],
    documentedLimitations: "No overhead pressing.",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
  };
  const result = extractClientProgrammingProfile(onboarding, healthReview);
  if (!("profile" in result)) throw new Error("expected a profile");
  assert.equal(result.profile.healthReviewResolved, true);
  assert.ok(result.profile.injuryRestrictions?.includes("No pain above shoulder height."));
  assert.ok(result.profile.injuryRestrictions?.includes("No overhead pressing."));

  const readiness = resolveProgrammingProfileReadiness(result);
  assert.equal(readiness.status, "ready_with_assumptions");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
