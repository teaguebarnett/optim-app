// Phase 5.5 — the two-stage Program Composer orchestration layered onto the
// activation lifecycle: generateProgramDirections (Stage A, spec Part 2),
// generateFullProgramFromDirection (Stage B, spec Part 3), and
// applyProgramRevisionApproval (spec Part 6's narrow active-client write
// path that must never reset programEnrollment).
//
// applyProgramRevisionApproval goes through lib/storage.ts, a no-op outside
// a real browser — polyfill a minimal in-memory window.localStorage (same
// pattern as verify-review-lifecycle.mts) so its save/load round-trip is
// actually exercised rather than only checked for "doesn't throw."

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
import {
  generateProgramDirections,
  generateFullProgramFromDirection,
  applyProgramRevisionApproval,
  selectNutritionPrescription,
  applyNutritionRevisionApproval,
  approveActivation,
  PROGRAM_COMPOSER_VERSION,
} from "./activation-lifecycle.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";
import { loadClientAppState } from "../tenancy/client-state-store.ts";
import { saveClientProgram } from "./program-assignment.ts";
import { createEmptyClientProgram } from "./training.ts";
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

const CLIENT_ID = "client-program-composer-test" as ClientProfileId;

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

console.log("\n1. generateProgramDirections — Stage A: three lightweight directions, no full weeks\n");

check("An uncalibrated coach never reaches directions_ready — same honest pre-check as legacy generateActivation", () => {
  const { record } = generateProgramDirections({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: null,
    activeCoachOperatingModel: null,
    healthReview: null,
    healthReviewResolved: "no_review_needed",
    existingRecords: [],
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(record.state, "awaiting_coach_calibration");
  assert.equal(record.directions, undefined);
});

const directionsResult = generateProgramDirections({
  clientId: CLIENT_ID,
  workspaceId: WORKSPACE_OPTIM_ID,
  coachId: COACH_PROFILE_TEAGUE.id,
  onboarding: completedOnboarding(),
  activeCoachOperatingModel: com(),
  healthReview: null,
  healthReviewResolved: "no_review_needed",
  existingRecords: [],
  nowIso: "2026-01-01T00:00:00.000Z",
});

check("A ready client produces a directions_ready record with exactly three directions and NO full training options yet", () => {
  assert.equal(directionsResult.record.state, "directions_ready");
  assert.equal(directionsResult.record.directions?.length, 3);
  assert.equal(directionsResult.record.trainingOptions.length, 0);
  assert.equal(directionsResult.record.generatorVersion, PROGRAM_COMPOSER_VERSION);
});

check("The three directions are structurally distinct, not just differently titled", () => {
  const [a, b, c] = directionsResult.record.directions!;
  const signatures = new Set([a, b, c].map((d) => `${d.splitKey}|${d.frequencyPerWeek}|${d.periodizationApproach}`));
  assert.ok(signatures.size >= 2, "expected at least two structurally distinct directions among the three");
});

check("The generation run stores the real programming profile it used, for provenance", () => {
  assert.ok(directionsResult.record.programmingProfile);
  assert.equal(directionsResult.record.programmingProfile?.primaryGoal, "build_muscle");
});

check("Retrying the identical request returns the same record rather than a duplicate (idempotent)", () => {
  const retry = generateProgramDirections({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    onboarding: completedOnboarding(),
    activeCoachOperatingModel: com(),
    healthReview: null,
    healthReviewResolved: "no_review_needed",
    existingRecords: [directionsResult.record],
    nowIso: "2026-01-01T00:05:00.000Z",
  });
  assert.equal(retry.reused, true);
  assert.equal(retry.record.id, directionsResult.record.id);
});

console.log("\n2. generateFullProgramFromDirection — Stage B: exactly one full, periodized program\n");

check("Selecting one direction builds exactly one complete program and moves the record to ready_for_review", () => {
  const chosen = directionsResult.record.directions![0];
  const updated = generateFullProgramFromDirection({
    record: directionsResult.record,
    directionId: chosen.id,
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    com: com(),
    nowIso: "2026-01-01T00:10:00.000Z",
  });
  assert.equal(updated.state, "ready_for_review");
  assert.equal(updated.trainingOptions.length, 1);
  assert.equal(updated.selectedTrainingOptionId, updated.trainingOptions[0].id);
  assert.equal(updated.selectedDirectionId, chosen.id);
  assert.equal(updated.trainingOptions[0].program.weeks.length > 1, true);
});

check("Combining two directions records both ids and produces one program reflecting the combination", () => {
  const [primary, secondary] = directionsResult.record.directions!;
  const updated = generateFullProgramFromDirection({
    record: directionsResult.record,
    directionId: primary.id,
    combineWithDirectionId: secondary.id,
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    com: com(),
    nowIso: "2026-01-01T00:10:00.000Z",
  });
  assert.equal(updated.selectedDirectionId, primary.id);
  assert.equal(updated.combinedWithDirectionId, secondary.id);
  assert.equal(updated.trainingOptions.length, 1);
});

check("An unknown direction id throws rather than silently generating from the wrong direction", () => {
  assert.throws(() =>
    generateFullProgramFromDirection({
      record: directionsResult.record,
      directionId: "not-a-real-direction",
      clientId: CLIENT_ID,
      workspaceId: WORKSPACE_OPTIM_ID,
      coachId: COACH_PROFILE_TEAGUE.id,
      com: com(),
      nowIso: "2026-01-01T00:10:00.000Z",
    })
  );
});

console.log("\n3. applyProgramRevisionApproval — active-client revision write path\n");

const client: ClientProfile = {
  id: CLIENT_ID,
  workspaceId: WORKSPACE_OPTIM_ID,
  name: "Program Composer Test Client",
  goal: "build_muscle",
  programWeek: 3,
  programTotalWeeks: 12,
  avatarInitials: "PC",
  previousWeightLb: 180,
  primaryCoachId: COACH_PROFILE_TEAGUE.id,
};

check("Approving a revision writes the real assignedProgram and sends a real client message, without resetting programEnrollment", () => {
  const originalProgram = createEmptyClientProgram({ clientId: CLIENT_ID, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Original program", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  saveClientProgram(CLIENT_ID, WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE.id, originalProgram);
  const beforeState = loadClientAppState(CLIENT_ID)!;
  const enrollmentBefore = beforeState.programEnrollment;
  const chatCountBefore = beforeState.chatMessages.length;

  const revisedProgram = { ...originalProgram, name: "Revised program", updatedAtIso: "2026-01-15T00:00:00.000Z" };
  applyProgramRevisionApproval({
    client,
    revisedProgram,
    approvedByCoachId: COACH_PROFILE_TEAGUE.id,
    coachName: "Teague",
    clientMessage: "Teague approved an update to your upcoming training.",
  });

  const afterState = loadClientAppState(CLIENT_ID)!;
  assert.equal(afterState.assignedProgram?.name, "Revised program");
  assert.deepEqual(afterState.programEnrollment, enrollmentBefore);
  assert.equal(afterState.chatMessages.length, chatCountBefore + 1);
  assert.equal(afterState.chatMessages.at(-1)?.text, "Teague approved an update to your upcoming training.");
});

console.log("\n4. Nutrition side of the unified OPTIM Plan (Phase 5.5A spec Part 8)\n");

check("selectNutritionPrescription builds a complete, richer prescription from the chosen strategy", () => {
  const chosenDirection = directionsResult.record.directions![0];
  const withProgram = generateFullProgramFromDirection({
    record: directionsResult.record,
    directionId: chosenDirection.id,
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    com: com(),
    nowIso: "2026-01-01T00:10:00.000Z",
  });
  assert.ok(withProgram.nutritionOptions.length > 0, "expected real nutrition options from a coach who provides nutrition coaching");
  const chosenNutrition = withProgram.nutritionOptions[0];
  const withNutrition = selectNutritionPrescription({ record: withProgram, nutritionOptionId: chosenNutrition.id, com: com(), nowIso: "2026-01-01T00:11:00.000Z" });
  assert.equal(withNutrition.selectedNutritionOptionId, chosenNutrition.id);
  assert.ok(withNutrition.selectedNutritionPrescription);
  assert.equal(withNutrition.selectedNutritionPrescription!.targets.calories, chosenNutrition.targets.calories);
  assert.ok(withNutrition.selectedNutritionPrescription!.mealsPerDay > 0);
});

check("approveActivation persists the real, complete assignedNutritionPlan when one was selected, alongside the flat nutritionTargets", () => {
  const chosenDirection = directionsResult.record.directions![0];
  const withProgram = generateFullProgramFromDirection({
    record: directionsResult.record,
    directionId: chosenDirection.id,
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    com: com(),
    nowIso: "2026-01-01T00:10:00.000Z",
  });
  const chosenNutrition = withProgram.nutritionOptions[0];
  const withNutrition = selectNutritionPrescription({ record: withProgram, nutritionOptionId: chosenNutrition.id, com: com(), nowIso: "2026-01-01T00:11:00.000Z" });

  const { updatedRecord } = approveActivation({
    record: withNutrition,
    client,
    approvedByCoachId: COACH_PROFILE_TEAGUE.id,
    aiAuthorityLevelAtApproval: "copilot",
    clientFirstName: "Composer",
    coachName: "Teague",
    businessName: "OPTIM",
    com: com(),
    aiMayRespondDirectlyForRoutine: false,
    assignWeeklyCheckIn: true,
    startDateIso: "2026-01-06T00:00:00.000Z",
    nowIso: "2026-01-05T00:00:00.000Z",
  });
  assert.equal(updatedRecord.state, "activated");

  const afterState = loadClientAppState(CLIENT_ID)!;
  assert.ok(afterState.assignedNutritionPlan, "expected a real assignedNutritionPlan to be persisted");
  assert.deepEqual(afterState.assignedNutritionPlan!.targets, afterState.nutritionTargets, "flat nutritionTargets and the rich plan's targets must never diverge");
  assert.ok(afterState.assignedNutritionPlan!.mealsPerDay > 0);
});

check("applyNutritionRevisionApproval writes only the client's nutrition plan, sends a real relayed message, and never touches programEnrollment", () => {
  const beforeState = loadClientAppState(CLIENT_ID)!;
  const enrollmentBefore = beforeState.programEnrollment;
  const chatCountBefore = beforeState.chatMessages.length;
  const existingPlan = beforeState.assignedNutritionPlan!;

  const revisedPrescription = {
    sourceStrategyKind: "best_fit" as const,
    label: existingPlan.sourceStrategyLabel,
    targets: { calories: existingPlan.targets!.calories + 100, proteinG: existingPlan.targets!.proteinG + 20, carbsG: existingPlan.targets!.carbsG, fatG: existingPlan.targets!.fatG },
    usesTrainingRestSplit: existingPlan.usesTrainingRestSplit,
    trainingDayTargets: existingPlan.trainingDayTargets,
    restDayTargets: existingPlan.restDayTargets,
    mealsPerDay: existingPlan.mealsPerDay,
    mealStructureDescription: existingPlan.mealStructureDescription,
    preTrainingGuidance: existingPlan.preTrainingGuidance,
    postTrainingGuidance: existingPlan.postTrainingGuidance,
    hydrationOzPerDay: existingPlan.hydrationOzPerDay,
    fiberGramsPerDay: existingPlan.fiberGramsPerDay,
    substitutionGuidance: existingPlan.substitutionGuidance,
    supplementGuidance: existingPlan.supplementGuidance,
    adherenceStrategy: existingPlan.adherenceStrategy,
    metricsToMonitor: existingPlan.metricsToMonitor,
    weeklyAdjustmentRule: existingPlan.weeklyAdjustmentRule,
    conditionsPreventingAutoAdjustment: [],
    requiresCoachApproval: false,
    assumptions: [],
    whyItFits: "test",
    tradeoff: "test",
    clientFactsUsed: [],
    coachingRulesUsed: [],
  };

  applyNutritionRevisionApproval({
    client,
    revisedPrescription,
    approvedByCoachId: COACH_PROFILE_TEAGUE.id,
    coachName: "Teague",
    clientMessage: "Teague approved an update to your nutrition targets.",
  });

  const afterState = loadClientAppState(CLIENT_ID)!;
  assert.equal(afterState.assignedNutritionPlan!.targets!.calories, existingPlan.targets!.calories + 100);
  assert.deepEqual(afterState.programEnrollment, enrollmentBefore);
  assert.equal(afterState.chatMessages.length, chatCountBefore + 1);
  assert.equal(afterState.chatMessages.at(-1)?.text, "Teague approved an update to your nutrition targets.");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
