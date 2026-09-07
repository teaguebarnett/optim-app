// Phase 5.2 — Correction pass: the focused, six-chapter onboarding rebuild.
//
// Exercises the live intake's pure logic directly: height feet/inches
// derivation and legacy-total-inches fallback, the field framework's
// adaptive visibility/clearing/answered-ness for the NEW chapters, the
// simplified pre-participation health-review trigger, activation
// blocking/resolution once a health review exists, platform-store
// migration and per-client isolation, and that the six chapters really do
// stay short (no chapter over five required decisions). No UI rendering
// involved, matching every sibling verify:*.mts. Run with:
// npm run verify:onboarding-intake

import assert from "node:assert/strict";

import { contextualResponseFor } from "./contextual-response.ts";
import { resolveHeight, formatHeight } from "./height.ts";
import { computeHealthReviewRequired, computeLegacyHealthReviewRequired, describeInjuryBodyAreas } from "./health-review.ts";
import {
  ONBOARDING_STEPS,
  MIN_ONBOARDING_AGE,
  applyStepFieldUpdate,
  clampOnboardingAge,
  findVisibleMomentIndex,
  isFieldAnswered,
  isMultiSelectOptionDisabled,
  momentHasVisibleField,
  momentIndexForField,
  momentsForStep,
  optionsForField,
  sanitizeOnboardingAnswers,
  toggleMultiSelectValue,
  visibleFieldsForStep,
  onboardingStepIndex,
} from "./onboarding-steps.ts";
import { formatDaySelection, formatFieldValue, NOT_PROVIDED } from "./onboarding-format.ts";
import { checkActivationReadiness } from "./activation.ts";
import { createInitialPlatformState, migratePlatformState, platformReducer, type PlatformState } from "./platform-store.ts";
import { getHealthReview, getOnboardingProgress } from "./repository.ts";
import { WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import type { ClientProfile } from "../tenancy/types";
import type { OnboardingStepAnswers } from "./types";

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

function makeClient(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: "client-intake-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    name: "Riley Chen",
    email: "riley@example.com",
    goal: "",
    programWeek: 0,
    programTotalWeeks: 12,
    avatarInitials: "RC",
    previousWeightLb: 0,
    primaryCoachId: "coach-teague",
    ...overrides,
  };
}

function step(id: string) {
  const found = ONBOARDING_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`No step "${id}"`);
  return found;
}

// ---------------------------------------------------------------------------

console.log("\n1. Height — feet/inches and legacy total-inches fallback\n");

check("Structured feet+inches answers resolve to the correct total", () => {
  const resolved = resolveHeight({ heightFeet: 5, heightInchesRemainder: 9 });
  assert.equal(resolved.totalInches, 69);
  assert.equal(resolved.source, "structured");
  assert.equal(formatHeight(resolved), "5'9\"");
});

check("A pre-Phase-5.1 record's single total-inches answer is derived into feet/inches without any stored migration", () => {
  const resolved = resolveHeight({ heightInches: 70 });
  assert.equal(resolved.feet, 5);
  assert.equal(resolved.inchesRemainder, 10);
  assert.equal(resolved.source, "legacy_total");
});

check("No height answer at all resolves to 'Not collected', not a crash or a fabricated value", () => {
  assert.equal(formatHeight(resolveHeight(undefined)), "Not collected");
});

// ---------------------------------------------------------------------------

console.log("\n2. Six focused chapters — shape and size\n");

check("The live flow has exactly six chapters plus Review — never nine, never a chapter-per-question", () => {
  const chapterIds = ONBOARDING_STEPS.filter((s) => s.id !== "review").map((s) => s.id);
  assert.deepEqual(chapterIds, ["about_you", "what_you_want", "your_week", "starting_point", "fuel_recovery", "health_finish"]);
});

check("No chapter's baseline (no-conditionals-visible) required-field count exceeds five — 'no giant scrolling form'", () => {
  for (const s of ONBOARDING_STEPS) {
    if (s.id === "review") continue;
    const baseline = visibleFieldsForStep(s, {});
    const requiredCount = baseline.filter((f) => f.required).length;
    assert.ok(requiredCount <= 5, `chapter "${s.id}" has ${requiredCount} required fields visible at baseline`);
  }
});

check("The client's name is never asked again in the live flow — it already came from the invitation", () => {
  for (const s of ONBOARDING_STEPS) {
    assert.ok(!s.fields.some((f) => f.key === "fullName"), `chapter "${s.id}" must not ask for fullName again`);
  }
});

check("At most one required open-text (textarea) response exists across the entire live flow", () => {
  const requiredTextareas = ONBOARDING_STEPS.flatMap((s) => s.fields).filter((f) => f.type === "textarea" && f.required);
  assert.equal(requiredTextareas.length, 1);
  assert.equal(requiredTextareas[0]!.key, "successDefinition");
});

check("The old ambiguous 'roughly how many pounds over 6-8 weeks' follow-up no longer exists", () => {
  for (const s of ONBOARDING_STEPS) {
    assert.ok(!s.fields.some((f) => f.key === "weightChangeAmount"));
  }
});

check("The old unexplained 'stressLevel: 1-5' field still does not exist anywhere in the live chapters", () => {
  for (const s of ONBOARDING_STEPS) {
    assert.ok(!s.fields.some((f) => f.key === "stressLevel"));
  }
});

// ---------------------------------------------------------------------------

console.log("\n3. Conditional fields — target weight, dietary restrictions, injury detail\n");

check("Target weight is only visible for a body-composition goal (build muscle or lose fat)", () => {
  const goalsStep = step("what_you_want");
  const field = goalsStep.fields.find((f) => f.key === "targetWeight")!;
  assert.equal(field.visibleIf!({ primaryGoal: "build_muscle" }), true);
  assert.equal(field.visibleIf!({ primaryGoal: "lose_fat" }), true);
  assert.equal(field.visibleIf!({ primaryGoal: "get_stronger" }), false);
  assert.equal(field.visibleIf!({ primaryGoal: "health_consistency" }), false);
});

check("Dietary restriction detail only appears, and is only required, once the client says 'Yes'", () => {
  const fuelStep = step("fuel_recovery");
  const field = fuelStep.fields.find((f) => f.key === "dietaryRestrictionsDetail")!;
  assert.equal(field.visibleIf!({ hasDietaryRestrictions: "none" }), false);
  assert.equal(field.visibleIf!({ hasDietaryRestrictions: "yes" }), true);
});

check("Switching dietary restrictions from 'yes' back to 'none' clears the previously-entered detail", () => {
  const fuelStep = step("fuel_recovery");
  let answers: OnboardingStepAnswers = applyStepFieldUpdate(fuelStep, {}, "hasDietaryRestrictions", "yes");
  answers = applyStepFieldUpdate(fuelStep, answers, "dietaryRestrictionsDetail", "Peanuts");
  assert.equal(answers.dietaryRestrictionsDetail, "Peanuts");
  answers = applyStepFieldUpdate(fuelStep, answers, "hasDietaryRestrictions", "none");
  assert.equal(answers.dietaryRestrictionsDetail, undefined);
});

check("The injury-detail fields (now including a multi-select body-area picker) require a positive hasInjuryHistory", () => {
  const healthStep = step("health_finish");
  for (const key of ["injuryBodyAreas", "injuryAggravatingFactors", "injuryRestrictions", "injuryWorkingWithProfessional"]) {
    const field = healthStep.fields.find((f) => f.key === key)!;
    assert.equal(field.visibleIf!({ hasInjuryHistory: false }), false);
    assert.equal(field.visibleIf!({ hasInjuryHistory: true }), true);
  }
});

check("injuryBodyAreaOther only appears once 'Other' is one of the selected body areas", () => {
  const healthStep = step("health_finish");
  const field = healthStep.fields.find((f) => f.key === "injuryBodyAreaOther")!;
  assert.equal(field.visibleIf!({ hasInjuryHistory: true, injuryBodyAreas: ["knee"] }), false);
  assert.equal(field.visibleIf!({ hasInjuryHistory: true, injuryBodyAreas: ["knee", "other"] }), true);
  assert.equal(field.visibleIf!({ hasInjuryHistory: false, injuryBodyAreas: ["other"] }), false);
});

check("Multiple affected body areas can be selected at once for a reported injury", () => {
  const healthStep = step("health_finish");
  const field = healthStep.fields.find((f) => f.key === "injuryBodyAreas")!;
  assert.equal(field.type, "multi_select");
  const afterKnee = toggleMultiSelectValue(field, [], "knee");
  const afterShoulder = toggleMultiSelectValue(field, afterKnee, "shoulder");
  assert.deepEqual(afterShoulder, ["knee", "shoulder"]);
});

check("Answering 'No' to current pain/injury clears every previously entered injury-detail field, including the new multi-select areas and 'other' detail", () => {
  const healthStep = step("health_finish");
  let answers: OnboardingStepAnswers = applyStepFieldUpdate(healthStep, {}, "hasInjuryHistory", true);
  answers = applyStepFieldUpdate(healthStep, answers, "injuryBodyAreas", ["shoulder", "other"]);
  answers = applyStepFieldUpdate(healthStep, answers, "injuryBodyAreaOther", "Left wrist, post-surgery");
  assert.deepEqual(answers.injuryBodyAreas, ["shoulder", "other"]);
  assert.equal(answers.injuryBodyAreaOther, "Left wrist, post-surgery");
  answers = applyStepFieldUpdate(healthStep, answers, "hasInjuryHistory", false);
  assert.equal(answers.injuryBodyAreas, undefined);
  assert.equal(answers.injuryBodyAreaOther, undefined);
});

check("Deselecting 'Other' (while keeping another area selected) clears only the now-irrelevant 'other' detail", () => {
  const healthStep = step("health_finish");
  let answers: OnboardingStepAnswers = applyStepFieldUpdate(healthStep, {}, "hasInjuryHistory", true);
  answers = applyStepFieldUpdate(healthStep, answers, "injuryBodyAreas", ["knee", "other"]);
  answers = applyStepFieldUpdate(healthStep, answers, "injuryBodyAreaOther", "Old ankle sprain");
  answers = applyStepFieldUpdate(healthStep, answers, "injuryBodyAreas", ["knee"]);
  assert.equal(answers.injuryBodyAreaOther, undefined);
  assert.deepEqual(answers.injuryBodyAreas, ["knee"]);
});

check("The injury body-area field requires at least one selection only while hasInjuryHistory is true", () => {
  const healthStep = step("health_finish");
  const bodyAreasField = healthStep.fields.find((f) => f.key === "injuryBodyAreas")!;
  assert.equal(isFieldAnswered(bodyAreasField, { hasInjuryHistory: true, injuryBodyAreas: [] }), false);
  assert.equal(isFieldAnswered(bodyAreasField, { hasInjuryHistory: true, injuryBodyAreas: ["knee"] }), true);
});

check("describeInjuryBodyAreas summarizes multiple areas by their real labels and substitutes free text for 'other'", () => {
  assert.equal(describeInjuryBodyAreas({ injuryBodyAreas: ["knee", "lower_back"] }), "knee, lower back");
  assert.equal(describeInjuryBodyAreas({ injuryBodyAreas: ["other"], injuryBodyAreaOther: "Tennis elbow" }), "Tennis elbow");
  assert.equal(describeInjuryBodyAreas({ injuryBodyArea: "Right shoulder" }), "Right shoulder");
  assert.equal(describeInjuryBodyAreas({}), "");
});

// ---------------------------------------------------------------------------

console.log("\n4. Day selection and formatting\n");

check("Day selection is stored as an array and formats in Mon-Sun order regardless of click order", () => {
  assert.equal(formatDaySelection(["fri", "mon", "wed"]), "Mon, Wed, Fri (3/week)");
});

check("availableDays only counts as answered once at least one day is selected", () => {
  const weekStep = step("your_week");
  const field = weekStep.fields.find((f) => f.key === "availableDays")!;
  assert.equal(isFieldAnswered(field, { availableDays: [] }), false);
  assert.equal(isFieldAnswered(field, { availableDays: ["tue"] }), true);
});

// ---------------------------------------------------------------------------

console.log("\n5. Save/resume across every chapter\n");

check("currentStepIndex and every visible answer round-trip through a JSON save/reload at every one of the six chapters", () => {
  const client = makeClient({ id: "client-resume-1" });
  let state: PlatformState = createInitialPlatformState();
  state = platformReducer(state, {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-02-01",
    intendedDurationWeeks: 8,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });

  for (let i = 0; i < ONBOARDING_STEPS.length - 1; i++) {
    const s = ONBOARDING_STEPS[i]!;
    state = platformReducer(state, {
      type: "SAVE_ONBOARDING_STEP",
      clientId: client.id,
      workspaceId: WORKSPACE_OPTIM_ID,
      stepId: s.id,
      answers: { marker: `answered-${s.id}` },
      nextStepIndex: i + 1,
      nowIso: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
    });
    state = migratePlatformState(JSON.parse(JSON.stringify(state)))!;
    const progress = getOnboardingProgress(state, client.id)!;
    assert.equal(progress.currentStepIndex, i + 1, `resume position wrong after chapter "${s.id}"`);
    assert.equal(progress.answers[s.id]!.marker, `answered-${s.id}`, `answer for "${s.id}" lost across reload`);
  }
});

// ---------------------------------------------------------------------------

console.log("\n6. Pre-participation health-screening flags (live shape)\n");

check("No positive answers means no health review is required", () => {
  const trigger = computeHealthReviewRequired({ hasInjuryHistory: false, safetyScreen: ["none"] });
  assert.equal(trigger.required, false);
  assert.deepEqual(trigger.reasons, []);
});

check("A current pain/injury report alone triggers a review with a traceable reason including the body area", () => {
  const trigger = computeHealthReviewRequired({ hasInjuryHistory: true, injuryBodyArea: "Right shoulder", safetyScreen: ["none"] });
  assert.equal(trigger.required, true);
  assert.match(trigger.reasons[0]!, /Right shoulder/);
});

check("Every safety-screen option other than 'none' independently triggers a review", () => {
  for (const value of ["cardiovascular", "chest_dizziness", "blood_pressure", "joint_muscular", "medication_condition", "advised_limit"]) {
    const trigger = computeHealthReviewRequired({ hasInjuryHistory: false, safetyScreen: [value] });
    assert.equal(trigger.required, true, `${value} should trigger a review`);
  }
});

check("Selecting 'None of these apply' alongside nothing else never triggers a review", () => {
  assert.equal(computeHealthReviewRequired({ hasInjuryHistory: false, safetyScreen: ["none"] }).required, false);
});

check("A missing health answers bag (client hasn't reached that chapter) never triggers a review", () => {
  assert.equal(computeHealthReviewRequired(undefined).required, false);
});

check("The legacy (Phase 5.1 eight-boolean) trigger function still works for an older record's shape", () => {
  assert.equal(computeLegacyHealthReviewRequired({ safetyDizzinessFainting: true }).required, true);
});

// ---------------------------------------------------------------------------

console.log("\n7. Health review creation, coach resolution, and activation blocking\n");

function completeOnboardingThroughHealth(state: PlatformState, clientId: string, healthAnswers: OnboardingStepAnswers, nowIso: string): PlatformState {
  let next = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "health_finish",
    answers: healthAnswers,
    nextStepIndex: onboardingStepIndex("review"),
    nowIso,
  });
  next = platformReducer(next, { type: "COMPLETE_ONBOARDING", clientId, workspaceId: WORKSPACE_OPTIM_ID, nowIso });
  return next;
}

check("Completing onboarding with a positive health answer creates exactly one HealthReviewRecord with real, traceable reasons", () => {
  const client = makeClient({ id: "client-health-1" });
  let state: PlatformState = createInitialPlatformState();
  state = platformReducer(state, {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-02-01",
    intendedDurationWeeks: 8,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = completeOnboardingThroughHealth(state, client.id, { hasInjuryHistory: true, injuryBodyArea: "Knee", safetyScreen: ["chest_dizziness"] }, "2026-01-02T00:00:00.000Z");

  const review = getHealthReview(state, client.id);
  assert.ok(review);
  assert.equal(review!.status, "review_needed");
  assert.equal(review!.reasons.length, 2);
  assert.equal(state.healthReviews.filter((r) => r.clientId === client.id).length, 1);
});

check("A straightforward healthy client (no positive answers) completes onboarding with no health review at all", () => {
  const client = makeClient({ id: "client-healthy-1" });
  let state: PlatformState = createInitialPlatformState();
  state = platformReducer(state, {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-02-01",
    intendedDurationWeeks: 8,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = completeOnboardingThroughHealth(state, client.id, { hasInjuryHistory: false, safetyScreen: ["none"] }, "2026-01-02T00:00:00.000Z");
  assert.equal(getHealthReview(state, client.id), null);
});

check("Activation is blocked while a health review is 'review_needed', and unblocked once the coach marks it reviewed", () => {
  const readinessBase = {
    clientId: "client-health-1",
    onboarding: { clientId: "client-health-1", workspaceId: WORKSPACE_OPTIM_ID, currentStepIndex: 0, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    programAssignment: null,
    intendedProgram: null,
    assignedCoachId: "coach-teague",
    nutritionConfigured: true,
    assignedProgram: null,
  };
  const blocked = checkActivationReadiness({
    ...readinessBase,
    healthReview: { clientId: "client-health-1", workspaceId: WORKSPACE_OPTIM_ID, status: "review_needed", reasons: ["x"], createdAtIso: "2026-01-02T00:00:00.000Z", updatedAtIso: "2026-01-02T00:00:00.000Z" },
  });
  assert.equal(blocked.requirements.find((r) => r.id === "health_review_resolved")!.met, false);

  const resolved = checkActivationReadiness({
    ...readinessBase,
    healthReview: { clientId: "client-health-1", workspaceId: WORKSPACE_OPTIM_ID, status: "reviewed_by_coach", reasons: ["x"], createdAtIso: "2026-01-02T00:00:00.000Z", updatedAtIso: "2026-01-03T00:00:00.000Z" },
  });
  assert.equal(resolved.requirements.find((r) => r.id === "health_review_resolved")!.met, true);
});

check("A client who never triggered a health review carries no health_review_resolved requirement at all", () => {
  const readiness = checkActivationReadiness({
    clientId: "client-clean",
    onboarding: { clientId: "client-clean", workspaceId: WORKSPACE_OPTIM_ID, currentStepIndex: 0, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    programAssignment: null,
    intendedProgram: null,
    assignedCoachId: "coach-teague",
    nutritionConfigured: true,
    assignedProgram: null,
    healthReview: null,
  });
  assert.equal(readiness.requirements.some((r) => r.id === "health_review_resolved"), false);
});

// ---------------------------------------------------------------------------

console.log("\n8. Sensitive-data isolation across multiple clients\n");

check("Two different clients' health answers and health-review records never cross-contaminate", () => {
  const clientA = makeClient({ id: "client-iso-a" });
  const clientB = makeClient({ id: "client-iso-b" });
  let state: PlatformState = createInitialPlatformState();
  for (const c of [clientA, clientB]) {
    state = platformReducer(state, {
      type: "CREATE_CLIENT",
      workspaceId: WORKSPACE_OPTIM_ID,
      client: c,
      intendedStartDateIso: "2026-02-01",
      intendedDurationWeeks: 8,
      intendedWeeklyCheckIn: false,
      nowIso: "2026-01-01T00:00:00.000Z",
    });
  }
  state = completeOnboardingThroughHealth(state, clientA.id, { hasInjuryHistory: true, safetyScreen: ["none"] }, "2026-01-02T00:00:00.000Z");
  state = completeOnboardingThroughHealth(state, clientB.id, { hasInjuryHistory: false, safetyScreen: ["none"] }, "2026-01-02T00:00:00.000Z");

  assert.ok(getHealthReview(state, clientA.id));
  assert.equal(getHealthReview(state, clientB.id), null);
  assert.equal(getOnboardingProgress(state, clientA.id)!.answers.health_finish!.hasInjuryHistory, true);
  assert.equal(getOnboardingProgress(state, clientB.id)!.answers.health_finish!.hasInjuryHistory, false);

  state = platformReducer(state, { type: "SET_HEALTH_REVIEW_STATUS", clientId: clientA.id, workspaceId: WORKSPACE_OPTIM_ID, status: "reviewed_by_coach", nowIso: "2026-01-03T00:00:00.000Z" });
  assert.equal(getHealthReview(state, clientB.id), null);
  assert.equal(state.healthReviews.length, 1);
});

// ---------------------------------------------------------------------------

console.log("\n9. Phase 5.3A — minimum age 17, enforced independently in three places\n");

check("The age wheel's own min/max never offer anything below 17", () => {
  const ageField = step("about_you").fields.find((f) => f.key === "age")!;
  assert.equal(ageField.min, MIN_ONBOARDING_AGE);
  assert.equal(ageField.min, 17);
});

check("clampOnboardingAge is a real floor/ceiling, not just documentation", () => {
  assert.equal(clampOnboardingAge(13), 17);
  assert.equal(clampOnboardingAge(16), 17);
  assert.equal(clampOnboardingAge(17), 17);
  assert.equal(clampOnboardingAge(25), 25);
  assert.equal(clampOnboardingAge(200), 90);
});

check("sanitizeOnboardingAnswers clamps a direct-state-manipulation attempt at the persistence boundary, independent of the UI", () => {
  const sanitized = sanitizeOnboardingAnswers("about_you", { age: 13, weightLb: 150 });
  assert.equal(sanitized.age, 17);
  assert.equal(sanitized.weightLb, 150);
});

check("SAVE_ONBOARDING_STEP clamps an under-17 age reaching the reducer directly (bypassing the wheel entirely), so a client under the floor can never actually be persisted", () => {
  const client = makeClient({ id: "client-underage-1" });
  let state: PlatformState = createInitialPlatformState();
  state = platformReducer(state, {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-02-01",
    intendedDurationWeeks: 8,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "about_you",
    answers: { age: 13 },
    nextStepIndex: 1,
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  assert.equal(getOnboardingProgress(state, client.id)!.answers.about_you!.age, 17);
});

// ---------------------------------------------------------------------------

console.log("\n10. Body recomposition — a first-class primary goal, plus real secondary-goal multi-select\n");

check("Body recomposition is a real, top-level primary-goal option — never hidden under 'something else'", () => {
  const field = step("what_you_want").fields.find((f) => f.key === "primaryGoal")!;
  const recomp = field.options!.find((o) => o.value === "body_recomposition");
  assert.ok(recomp, "body_recomposition must be a real primaryGoal option");
  assert.equal(recomp!.label, "Body recomposition");
});

check("'Something else' reveals a required clarification field, and only for that value", () => {
  const goalsStep = step("what_you_want");
  const field = goalsStep.fields.find((f) => f.key === "primaryGoalOther")!;
  assert.equal(field.required, true);
  assert.equal(field.visibleIf!({ primaryGoal: "something_else" }), true);
  assert.equal(field.visibleIf!({ primaryGoal: "body_recomposition" }), false);
});

check("Target weight is deliberately NOT implied by body recomposition — only build_muscle/lose_fat show it", () => {
  const field = step("what_you_want").fields.find((f) => f.key === "targetWeight")!;
  assert.equal(field.visibleIf!({ primaryGoal: "body_recomposition" }), false);
});

check("Secondary goals never re-offer whichever goal is already the primary one", () => {
  const goalsStep = step("what_you_want");
  const field = goalsStep.fields.find((f) => f.key === "secondaryGoals")!;
  const optionsWithMuscleAsPrimary = optionsForField(field, { primaryGoal: "build_muscle" });
  assert.ok(!optionsWithMuscleAsPrimary.some((o) => o.value === "build_muscle"));
  assert.ok(optionsWithMuscleAsPrimary.some((o) => o.value === "body_recomposition"));
});

check("Secondary goals cap at two, real multi-select, and 'something else' is never a valid secondary", () => {
  const goalsStep = step("what_you_want");
  const field = goalsStep.fields.find((f) => f.key === "secondaryGoals")!;
  assert.equal(field.maxSelections, 2);
  assert.ok(!field.options!.some((o) => o.value === "something_else"));

  let selected = toggleMultiSelectValue(field, [], "build_muscle");
  selected = toggleMultiSelectValue(field, selected, "get_stronger");
  assert.deepEqual(selected, ["build_muscle", "get_stronger"]);
  assert.equal(isMultiSelectOptionDisabled(field, selected, "lose_fat"), true);
  assert.equal(isMultiSelectOptionDisabled(field, selected, "build_muscle"), false, "an already-selected option is never disabled — it can always be deselected");

  const afterDeselect = toggleMultiSelectValue(field, selected, "build_muscle");
  assert.deepEqual(afterDeselect, ["get_stronger"]);
  assert.equal(isMultiSelectOptionDisabled(field, afterDeselect, "lose_fat"), false, "deselecting below the cap re-opens the remaining options");
});

check("Choosing a primary goal that's currently sitting in secondary goals removes it from there automatically", () => {
  const goalsStep = step("what_you_want");
  let answers: OnboardingStepAnswers = applyStepFieldUpdate(goalsStep, {}, "primaryGoal", "build_muscle");
  answers = applyStepFieldUpdate(goalsStep, answers, "secondaryGoals", ["get_stronger", "lose_fat"]);
  answers = applyStepFieldUpdate(goalsStep, answers, "primaryGoal", "get_stronger");
  assert.deepEqual(answers.secondaryGoals, ["lose_fat"], "get_stronger must be dropped from secondaryGoals the moment it becomes the primary goal");
});

// ---------------------------------------------------------------------------

console.log("\n11. Multi-select correctness generally — days, environments, training windows, obstacles, coaching support\n");

check("Available training days remain a true multi-select with no cap", () => {
  const field = step("your_week").fields.find((f) => f.key === "availableDays")!;
  assert.equal(field.type, "day_selector");
  assert.equal(field.maxSelections, undefined);
});

check("Training environment allows more than one truthful selection (a client with both a home and commercial gym)", () => {
  const field = step("your_week").fields.find((f) => f.key === "trainingEnvironment")!;
  assert.equal(field.type, "multi_select");
  const selected = toggleMultiSelectValue(field, toggleMultiSelectValue(field, [], "home_gym"), "commercial_gym");
  assert.deepEqual(selected, ["home_gym", "commercial_gym"]);
});

check("Preferred training time supports realistic overlap OR a single clear 'varies' state, never both at once", () => {
  const field = step("your_week").fields.find((f) => f.key === "preferredTrainingTime")!;
  assert.equal(field.exclusiveValue, "varies");
  let selected = toggleMultiSelectValue(field, [], "morning");
  selected = toggleMultiSelectValue(field, selected, "evening");
  assert.deepEqual(selected, ["morning", "evening"]);
  selected = toggleMultiSelectValue(field, selected, "varies");
  assert.deepEqual(selected, ["varies"], "choosing 'varies' replaces any specific windows already selected");
  selected = toggleMultiSelectValue(field, selected, "midday");
  assert.deepEqual(selected, ["midday"], "choosing a specific window after 'varies' drops the exclusive value");
});

check("Consistency obstacles and coaching-support preferences are both capped at two, independently of each other", () => {
  const obstaclesField = step("fuel_recovery").fields.find((f) => f.key === "consistencyObstacles")!;
  const supportField = step("fuel_recovery").fields.find((f) => f.key === "coachSupportStyle")!;
  assert.equal(obstaclesField.maxSelections, 2);
  assert.equal(supportField.maxSelections, 2);
  assert.equal(supportField.type, "multi_select", "coaching-support styles can overlap — must be multi-select, not single_select");
});

// ---------------------------------------------------------------------------

console.log("\n12. Adaptive pacing — moments cover every field exactly once, and never inflate top-level progress\n");

check("Every chapter's moments (when defined) partition its fields exactly once each — no field missing, none duplicated", () => {
  for (const s of ONBOARDING_STEPS) {
    if (!s.moments) continue;
    const flattened = s.moments.flat();
    const fieldKeys = s.fields.map((f) => f.key);
    assert.deepEqual([...flattened].sort(), [...fieldKeys].sort(), `chapter "${s.id}" moments don't exactly partition its fields`);
    assert.equal(new Set(flattened).size, flattened.length, `chapter "${s.id}" has a field key listed in more than one moment`);
  }
});

check("A chapter with no explicit moments still resolves to exactly one moment containing every field (e.g. Review)", () => {
  const reviewMoments = momentsForStep(step("review"));
  assert.equal(reviewMoments.length, 1);
  assert.deepEqual(reviewMoments[0], []);
});

// Phase 5.3C — corrects the structural pacing 5.3B left incomplete: one
// real decision per moment/screen, so a chapter with N independent facts
// now genuinely has N moments (raised from the old ≤4 cap this replaces).
// The ceiling here guards against a genuine regression (a moment
// accidentally split per keystroke, say), not against the real, larger
// moment counts this phase's one-decision-per-screen rule intentionally
// produces.
check("No chapter's total moment count exceeds eight — still real single-decision screens, never absurdly over-fragmented", () => {
  for (const s of ONBOARDING_STEPS) {
    if (s.id === "review") continue;
    assert.ok(momentsForStep(s).length <= 8, `chapter "${s.id}" has ${momentsForStep(s).length} moments`);
  }
});

check("Every moment contains at most two field keys — a genuinely single decision, or a parent question with its own immediate conditional follow-up", () => {
  for (const s of ONBOARDING_STEPS) {
    if (s.id === "review") continue;
    for (const moment of momentsForStep(s)) {
      assert.ok(moment.length <= 2, `chapter "${s.id}" has a moment with ${moment.length} fields: ${moment.join(", ")}`);
    }
  }
});

// ---------------------------------------------------------------------------

console.log("\n12b. momentIndexForField — Review's per-row 'Edit' never points at a hardcoded, stale moment index\n");

check("Every real field key resolves to the moment that actually contains it, for every live chapter", () => {
  for (const s of ONBOARDING_STEPS) {
    if (s.id === "review") continue;
    momentsForStep(s).forEach((moment, expectedIndex) => {
      for (const key of moment) {
        assert.equal(momentIndexForField(s, key), expectedIndex, `"${key}" in chapter "${s.id}" resolved to the wrong moment`);
      }
    });
  }
});

check("An unknown field key resolves to moment 0 rather than throwing", () => {
  assert.equal(momentIndexForField(step("your_week"), "not_a_real_field"), 0);
});

check("Specific Review-row jump targets that already shipped stay correct after the Phase 5.3C one-decision-per-screen split", () => {
  assert.equal(momentIndexForField(step("about_you"), "heightFeetInches"), 1);
  assert.equal(momentIndexForField(step("your_week"), "availableDays"), 0);
  assert.equal(momentIndexForField(step("your_week"), "maxSessionLength"), 1);
  assert.equal(momentIndexForField(step("your_week"), "trainingEnvironment"), 4);
  assert.equal(momentIndexForField(step("starting_point"), "trainingExperience"), 0);
});

console.log("\n13. Contextual response — short, deterministic, honest, never a fake AI simulation\n");

check("Body recomposition gets a real, specific contextual response", () => {
  const response = contextualResponseFor("what_you_want", "primaryGoal", "body_recomposition", "Teague");
  assert.ok(response && /muscle/.test(response) && /fat/.test(response) && /Teague/.test(response));
});

check("Choosing an available-day count reflects that exact count back, deterministically", () => {
  assert.match(contextualResponseFor("your_week", "availableDays", ["mon", "wed", "fri"], "Teague")!, /3 days/);
  assert.equal(contextualResponseFor("your_week", "availableDays", [], "Teague"), null, "zero selected days gets no response yet");
});

check("Reporting a current injury gets a reassuring, honest response — never a diagnosis", () => {
  const response = contextualResponseFor("health_finish", "hasInjuryHistory", true, "Teague");
  assert.ok(response && /review/i.test(response));
});

check("Unrelated fields and values never produce a fabricated response", () => {
  assert.equal(contextualResponseFor("about_you", "age", 25, "Teague"), null);
  assert.equal(contextualResponseFor("health_finish", "hasInjuryHistory", false, "Teague"), null);
  assert.equal(contextualResponseFor("what_you_want", "primaryGoal", "build_muscle", "Teague"), null);
});

// ---------------------------------------------------------------------------

console.log("\n14. A pre-Phase-5.2 (Phase 5.1) record still renders as a real, formattable value\n");

check("formatFieldValue still resolves an old single_select option label from a legacy step's own field definition", () => {
  // Legacy field definitions live in LEGACY_V51_STEPS (see coach-brief.tsx),
  // not in the live ONBOARDING_STEPS — this just proves formatFieldValue
  // itself is shape-agnostic, since coach-brief.tsx is the only caller of
  // the legacy lookup and isn't unit-testable without rendering.
  const fakeLegacyField = { key: "primaryGoal", label: "Primary goal", type: "single_select" as const, required: true, options: [{ value: "build_muscle", label: "Build muscle" }] };
  assert.equal(formatFieldValue(fakeLegacyField, "build_muscle"), "Build muscle");
  assert.equal(formatFieldValue(fakeLegacyField, undefined), NOT_PROVIDED);
});

// ---------------------------------------------------------------------------

console.log("\n15. Phase 5.6A — a moment with zero applicable questions is always skipped, never shown blank\n");

check("The wedding/event/deadline question is gone from 'What you want', and never replaced by another event question", () => {
  const goalsStep = step("what_you_want");
  assert.equal(goalsStep.fields.find((f) => f.key === "eventOrDeadline"), undefined);
  assert.ok(!goalsStep.fields.some((f) => /event|deadline|wedding/i.test(f.label)), "no field should reintroduce event/deadline framing");
});

check("health_finish: answering 'no injury' leaves every injury-detail moment with zero visible fields", () => {
  const healthStep = step("health_finish");
  const noInjuryAnswers: OnboardingStepAnswers = { hasInjuryHistory: false };
  for (const moment of momentsForStep(healthStep)) {
    if (moment.includes("hasInjuryHistory") || moment.includes("safetyScreen")) continue;
    assert.equal(momentHasVisibleField(healthStep, moment, noInjuryAnswers), false, `moment [${moment.join(", ")}] should have nothing visible when there's no injury`);
  }
});

check("health_finish: findVisibleMomentIndex skips straight from 'no injury' past every empty injury-detail moment to safetyScreen", () => {
  const healthStep = step("health_finish");
  const moments = momentsForStep(healthStep);
  const hasInjuryIndex = moments.findIndex((m) => m.includes("hasInjuryHistory"));
  const safetyScreenIndex = moments.findIndex((m) => m.includes("safetyScreen"));
  const noInjuryAnswers: OnboardingStepAnswers = { hasInjuryHistory: false };
  assert.equal(findVisibleMomentIndex(healthStep, noInjuryAnswers, hasInjuryIndex + 1, 1), safetyScreenIndex);
  // And the reverse direction, landing back on hasInjuryHistory.
  assert.equal(findVisibleMomentIndex(healthStep, noInjuryAnswers, safetyScreenIndex - 1, -1), hasInjuryIndex);
});

check("health_finish: answering 'has injury' makes every injury-detail moment visible again, one real decision at a time", () => {
  const healthStep = step("health_finish");
  const hasInjuryAnswers: OnboardingStepAnswers = { hasInjuryHistory: true, injuryBodyAreas: ["knee"] };
  const moments = momentsForStep(healthStep);
  const hasInjuryIndex = moments.findIndex((m) => m.includes("hasInjuryHistory"));
  const next = findVisibleMomentIndex(healthStep, hasInjuryAnswers, hasInjuryIndex + 1, 1);
  assert.deepEqual(moments[next], ["injuryBodyAreas", "injuryBodyAreaOther"]);
  assert.equal(momentHasVisibleField(healthStep, ["injuryAggravatingFactors"], hasInjuryAnswers), true);
  assert.equal(momentHasVisibleField(healthStep, ["injuryWorkingWithProfessional"], hasInjuryAnswers), true);
});

check("findVisibleMomentIndex returns -1 (never loops or throws) once it runs off the end of a step in either direction", () => {
  const healthStep = step("health_finish");
  const moments = momentsForStep(healthStep);
  assert.equal(findVisibleMomentIndex(healthStep, { hasInjuryHistory: false }, moments.length, 1), -1);
  assert.equal(findVisibleMomentIndex(healthStep, { hasInjuryHistory: false }, -1, -1), -1);
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
