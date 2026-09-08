// Phase 5.4A — the activation lifecycle: pre-generation state resolution,
// idempotent generation (including the real bug fix that made "blocked"
// retryable), regeneration history, the one real approval write path, and
// the independent health/safety gate on auto-activation.

import assert from "node:assert/strict";
import {
  ACTIVATION_GENERATOR_VERSION,
  approveActivation,
  canAutoActivateWithoutApproval,
  computeIdempotencyKey,
  determinePreGenerationState,
  findExistingGeneration,
  generateActivation,
  healthReviewPermitsActivation,
  latestGenerationForClient,
  selectActivationOptions,
  type ActivationGenerationRecord,
} from "./activation-lifecycle.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { defaultCoachAiAuthoritySettings, type CoachAiAuthoritySettings } from "./ai-authority.ts";
import { createInitialPlatformState } from "./platform-store.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";
import type { OnboardingProgress } from "./types";
import type { ClientProfile, ClientProfileId } from "../tenancy/types";

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

const CLIENT_ID = "client-lifecycle-test" as ClientProfileId;

function com() {
  return createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM Test Studio" });
}

function completedOnboarding(): OnboardingProgress {
  return {
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    currentStepIndex: 5,
    completedAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    answers: {
      about_you: { age: 30, heightFeet: 5, heightInchesRemainder: 10, weightLb: 180, sex: "male" },
      what_you_want: { primaryGoal: "build_muscle", secondaryGoals: [] },
      your_week: { availableDays: ["mon", "tue", "wed"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] },
      starting_point: { trainingExperience: "learning_fundamentals" },
      fuel_recovery: { hasDietaryRestrictions: "no", nutritionApproach: "no_structure" },
    },
  } as unknown as OnboardingProgress;
}

console.log("\n1. Honest pre-generation state resolution\n");

check("No active Coach Operating Model -> awaiting_coach_calibration, before anything else is even checked", () => {
  assert.equal(determinePreGenerationState({ onboarding: null, activeCoachOperatingModel: null, healthReviewResolved: "no_review_needed" }), "awaiting_coach_calibration");
});

check("A calibrated coach but an incomplete client onboarding -> awaiting_client_onboarding", () => {
  assert.equal(determinePreGenerationState({ onboarding: null, activeCoachOperatingModel: com(), healthReviewResolved: "no_review_needed" }), "awaiting_client_onboarding");
});

check("An unresolved health review blocks generation even with everything else ready", () => {
  assert.equal(determinePreGenerationState({ onboarding: completedOnboarding(), activeCoachOperatingModel: com(), healthReviewResolved: false }), "blocked");
});

check("Every prerequisite met -> ready_to_generate", () => {
  assert.equal(determinePreGenerationState({ onboarding: completedOnboarding(), activeCoachOperatingModel: com(), healthReviewResolved: "no_review_needed" }), "ready_to_generate");
  assert.equal(determinePreGenerationState({ onboarding: completedOnboarding(), activeCoachOperatingModel: com(), healthReviewResolved: true }), "ready_to_generate");
});

console.log("\n2. Real idempotency\n");

check("The same client/onboarding/COM-version/generator-version always produces the same idempotency key", () => {
  const keyA = computeIdempotencyKey({ clientId: CLIENT_ID, onboardingCompletedAtIso: "2026-01-01T00:00:00.000Z", coachModelVersion: 1 });
  const keyB = computeIdempotencyKey({ clientId: CLIENT_ID, onboardingCompletedAtIso: "2026-01-01T00:00:00.000Z", coachModelVersion: 1 });
  assert.equal(keyA, keyB);
  assert.ok(keyA.includes(ACTIVATION_GENERATOR_VERSION));
});

check("A different Coach Operating Model version produces a different idempotency key", () => {
  const keyV1 = computeIdempotencyKey({ clientId: CLIENT_ID, onboardingCompletedAtIso: "2026-01-01T00:00:00.000Z", coachModelVersion: 1 });
  const keyV2 = computeIdempotencyKey({ clientId: CLIENT_ID, onboardingCompletedAtIso: "2026-01-01T00:00:00.000Z", coachModelVersion: 2 });
  assert.notEqual(keyV1, keyV2);
});

check("A regeneration instruction produces a distinct key from the same request with no instruction", () => {
  const plain = computeIdempotencyKey({ clientId: CLIENT_ID, onboardingCompletedAtIso: "2026-01-01T00:00:00.000Z", coachModelVersion: 1 });
  const withInstruction = computeIdempotencyKey({ clientId: CLIENT_ID, onboardingCompletedAtIso: "2026-01-01T00:00:00.000Z", coachModelVersion: 1, regenerationInstruction: "Make it 4 days instead" });
  assert.notEqual(plain, withInstruction);
});

check("findExistingGeneration resolves the record with a matching key and null otherwise", () => {
  const record = { id: "r1", idempotencyKey: "key-a" } as ActivationGenerationRecord;
  assert.equal(findExistingGeneration([record], "key-a"), record);
  assert.equal(findExistingGeneration([record], "key-b"), null);
});

console.log("\n3. generateActivation orchestration — real, idempotent, and honestly retryable when blocked/failed\n");

check("Generating with no active Coach Operating Model returns a real 'awaiting_coach_calibration' record, never a fabricated success", () => {
  const result = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: null,
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.record.state, "awaiting_coach_calibration");
  assert.equal(result.reused, false);
});

check("Generating with incomplete client onboarding data (missing fields) returns 'blocked' with the real missing field list, never a guessed program", () => {
  const incomplete = { ...completedOnboarding(), answers: { about_you: {}, what_you_want: {}, your_week: {}, starting_point: {}, fuel_recovery: {} } } as unknown as OnboardingProgress;
  const result = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: incomplete,
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.record.state, "blocked");
  assert.ok(result.record.blockedReasons && result.record.blockedReasons.length > 0);
});

check("A successful generation produces a 'ready_for_review' record with 3 training options and a real idempotency key", () => {
  const result = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.record.state, "ready_for_review");
  assert.equal(result.record.trainingOptions.length, 3);
  assert.equal(result.reused, false);
});

check("Retrying the exact same request reuses the existing record instead of generating a duplicate (real idempotency)", () => {
  const first = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const second = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [first.record],
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  assert.equal(second.reused, true);
  assert.equal(second.record.id, first.record.id);
});

check("REGRESSION: a 'blocked' record (every option failed hard constraints) is retried fresh, never returned as a false cached success (the real bug fix)", () => {
  // A coach whose exercisesAvoided list is broad enough to filter out every
  // real exercise in the library is a real, honest way to reach 'blocked'
  // (every generated day ends up with zero usable exercises) without
  // fabricating a broken snapshot.
  const model = com();
  model.programArchitecture.exercisesAvoided = ["a", "e", "i", "o", "u"];
  const onboarding = { ...completedOnboarding(), answers: { ...completedOnboarding().answers, your_week: { availableDays: ["mon"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] } } } as unknown as OnboardingProgress;

  const blockedResult = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding,
    activeCoachOperatingModel: model,
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(blockedResult.record.state, "blocked");

  // Coach fixes their exercisesAvoided list, then retries — must NOT reuse the stale blocked record.
  const fixedModel = { ...model, programArchitecture: { ...model.programArchitecture, exercisesAvoided: [] } };
  const retryResult = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding,
    activeCoachOperatingModel: fixedModel,
    healthReviewResolved: "no_review_needed",
    existingRecords: [blockedResult.record],
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  assert.equal(retryResult.reused, false, "a blocked record must always be retried fresh, never treated as a valid cached result");
});

console.log("\n4. Regeneration preserves history — a new record, never an in-place overwrite\n");

check("Regenerating with an instruction creates a distinct record referencing the prior one via regeneratedFromRecordId", () => {
  const first = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const regenerated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [first.record],
    regenerationInstruction: "Give this client an extra rest day between sessions.",
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  assert.notEqual(regenerated.record.id, first.record.id);
  assert.equal(regenerated.record.regeneratedFromRecordId, first.record.id);
  assert.equal(regenerated.reused, false);
});

console.log("\n4b. Save for Later — a real, persisted selection with no activation\n");

check("selectActivationOptions persists a real selection while leaving state at 'ready_for_review' — nothing is activated", () => {
  const generated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  }).record;
  const saved = selectActivationOptions(generated, generated.trainingOptions[1].id, generated.nutritionOptions[0]?.id ?? null, "2026-01-02T00:00:00.000Z");
  assert.equal(saved.state, "ready_for_review");
  assert.equal(saved.selectedTrainingOptionId, generated.trainingOptions[1].id);
  assert.equal(saved.approval, undefined);
});

check("A saved-for-later selection survives being looked up again by id (real persisted record, not transient UI state)", () => {
  const generated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  }).record;
  const saved = selectActivationOptions(generated, generated.trainingOptions[2].id, null, "2026-01-02T00:00:00.000Z");
  const rehydrated = latestGenerationForClient([saved], CLIENT_ID);
  assert.equal(rehydrated?.selectedTrainingOptionId, generated.trainingOptions[2].id);
  assert.equal(rehydrated?.state, "ready_for_review");
});

console.log("\n5. Approval — the one real write path, and its guardrails\n");

const client: ClientProfile = {
  id: CLIENT_ID,
  workspaceId: WORKSPACE_OPTIM_ID,
  name: "Lifecycle Test Client",
  goal: "build_muscle",
  programWeek: 1,
  programTotalWeeks: 12,
  avatarInitials: "LT",
  previousWeightLb: 180,
  primaryCoachId: COACH_PROFILE_TEAGUE.id,
};

check("approveActivation throws a clear error when no training option has been selected — never silently activates nothing", () => {
  const generated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  }).record;
  assert.throws(() =>
    approveActivation({
      record: generated,
      client,
      approvedByCoachId: COACH_PROFILE_TEAGUE.id,
      aiAuthorityLevelAtApproval: "copilot",
      clientFirstName: "Lifecycle",
      coachName: "Teague",
      businessName: "OPTIM",
      com: com(),
      aiMayRespondDirectlyForRoutine: false,
      assignWeeklyCheckIn: true,
      startDateIso: "2026-01-06T00:00:00.000Z",
      nowIso: "2026-01-01T00:00:00.000Z",
    })
  );
});

check("A successful approval produces an 'activated' record with a real approval trace (actor, authority level at approval, resulting program id) and a real communication policy", () => {
  const generated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  }).record;
  const selected = selectActivationOptions(generated, generated.trainingOptions[0].id, generated.nutritionOptions[0]?.id ?? null, "2026-01-01T00:00:00.000Z");

  const { updatedRecord, communicationPolicy } = approveActivation({
    record: selected,
    client,
    approvedByCoachId: COACH_PROFILE_TEAGUE.id,
    aiAuthorityLevelAtApproval: "copilot",
    clientFirstName: "Lifecycle",
    coachName: "Teague",
    businessName: "OPTIM",
    com: com(),
    aiMayRespondDirectlyForRoutine: false,
    assignWeeklyCheckIn: true,
    startDateIso: "2026-01-06T00:00:00.000Z",
    nowIso: "2026-01-05T00:00:00.000Z",
  });

  assert.equal(updatedRecord.state, "activated");
  assert.equal(updatedRecord.approval?.approvedByCoachId, COACH_PROFILE_TEAGUE.id);
  assert.equal(updatedRecord.approval?.aiAuthorityLevelAtApproval, "copilot");
  assert.equal(updatedRecord.approval?.resultingProgramId, generated.trainingOptions[0].program.id);
  assert.equal(communicationPolicy.clientId, CLIENT_ID);
  assert.ok(communicationPolicy.scheduledActions.length > 0);
});

console.log("\n6. Health/safety gate is independent of, and overrides, AI Authority\n");

check("healthReviewPermitsActivation returns 'no_review_needed' when no review exists for the client", () => {
  const platform = createInitialPlatformState();
  assert.equal(healthReviewPermitsActivation(platform, CLIENT_ID), "no_review_needed");
});

check("An unresolved health review blocks activation permission", () => {
  const platform = {
    ...createInitialPlatformState(),
    healthReviews: [{ clientId: CLIENT_ID, workspaceId: WORKSPACE_OPTIM_ID, status: "review_needed" as const, reasons: ["Reported a current pain/injury"], createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" }],
  };
  assert.equal(healthReviewPermitsActivation(platform, CLIENT_ID), false);
});

check("A resolved health review (reviewed_by_coach) permits activation", () => {
  const platform = {
    ...createInitialPlatformState(),
    healthReviews: [{ clientId: CLIENT_ID, workspaceId: WORKSPACE_OPTIM_ID, status: "reviewed_by_coach" as const, reasons: ["Reported a current pain/injury"], createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-02T00:00:00.000Z" }],
  };
  assert.equal(healthReviewPermitsActivation(platform, CLIENT_ID), true);
});

check("Phase 5.6A.1 — 'proceed_with_limitations' is a real, distinct resolved outcome that also permits activation", () => {
  const platform = {
    ...createInitialPlatformState(),
    healthReviews: [
      {
        clientId: CLIENT_ID,
        workspaceId: WORKSPACE_OPTIM_ID,
        status: "proceed_with_limitations" as const,
        reasons: ["Reported a current pain/injury"],
        documentedLimitations: "No overhead pressing.",
        createdAtIso: "2026-01-01T00:00:00.000Z",
        updatedAtIso: "2026-01-02T00:00:00.000Z",
      },
    ],
  };
  assert.equal(healthReviewPermitsActivation(platform, CLIENT_ID), true);
});

function authoritySettings(overrides: Partial<CoachAiAuthoritySettings> = {}): CoachAiAuthoritySettings {
  return { ...defaultCoachAiAuthoritySettings(COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID, "2026-01-01T00:00:00.000Z"), ...overrides };
}

check("canAutoActivateWithoutApproval is false whenever the health review is unresolved, regardless of authority level", () => {
  const generated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  }).record;
  const selected = selectActivationOptions(generated, generated.trainingOptions[0].id, null, "2026-01-01T00:00:00.000Z");
  const settings = authoritySettings({ global: { level: "review_only", domainOverrides: {} } });
  assert.equal(canAutoActivateWithoutApproval({ authoritySettings: settings, clientId: CLIENT_ID, healthReviewResolved: false, record: selected }), false);
});

check("canAutoActivateWithoutApproval is false below the Autonomous (review_only) level even with everything else green", () => {
  const generated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  }).record;
  const selected = selectActivationOptions(generated, generated.trainingOptions[0].id, null, "2026-01-01T00:00:00.000Z");
  const settings = authoritySettings({ global: { level: "ai_led", domainOverrides: {} } });
  assert.equal(canAutoActivateWithoutApproval({ authoritySettings: settings, clientId: CLIENT_ID, healthReviewResolved: "no_review_needed", record: selected }), false);
});

check("canAutoActivateWithoutApproval is true only at the Autonomous level, with a resolved review, a passing selected option, and a 'ready_for_review' record", () => {
  const generated = generateActivation({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  }).record;
  const selected = selectActivationOptions(generated, generated.trainingOptions[0].id, null, "2026-01-01T00:00:00.000Z");
  const settings = authoritySettings({ global: { level: "review_only", domainOverrides: {} } });
  assert.equal(canAutoActivateWithoutApproval({ authoritySettings: settings, clientId: CLIENT_ID, healthReviewResolved: "no_review_needed", record: selected }), true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
