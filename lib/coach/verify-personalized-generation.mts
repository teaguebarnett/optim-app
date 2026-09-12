// Phase 6B — Personalize Training Generation from Coach and Client Context.
//
// Proves the real wiring this phase adds — app/actions/production-programs.ts's
// createPublishAndAssignProgramAction now sources its ClientProgrammingProfile
// from real onboarding (extractClientProgrammingProfile) and its
// CoachOperatingModel from the real approved Coach Playbook
// (getOrBootstrapApprovedPlaybook) instead of Phase 5's placeholder
// defaults — by exercising the SAME real functions in the SAME order that
// action calls, never a parallel test-only profile-building path (spec
// section 24/25's own explicit requirement). The action itself can't be
// imported directly here (it needs next/headers) — see
// lib/coach/verify-universal-program-generation.mts's own doc for the same,
// already-established trade-off; this file's "mirrors the real pipeline"
// check (section C) reproduces its exact call sequence.
//
// Maps onto spec section 32's test list (A-V); DB-level tenant-isolation
// items (P, Q, R) and coach-review-lifecycle item (U) are proven by
// scripts/e2e-personalized-generation.mts against a real local Supabase
// stack instead — RLS-governed, not re-implementable as pure logic. Item V
// (Phase 6A client execution remains green) is proven by re-running
// lib/workout/verify-universal-client-execution.mts unchanged.
//
// Run with: npm run verify:personalized-generation

import assert from "node:assert/strict";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { extractClientProgrammingProfile } from "./programming-profile.ts";
import { generateProgramDirectionSummaries } from "./program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "./universal-program-generation.ts";
import { equipmentTagForExerciseName } from "./activation-generation.ts";
import { validateUniversalTrainingProgramContent } from "../production/validation.ts";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM_ID, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { ClientProgrammingProfile } from "./programming-profile.ts";
import type { OnboardingProgress } from "./types";
import type { UniversalTrainingProgramContent, TrainingItemInstance } from "../training/types.ts";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures — real OnboardingProgress-shaped answers (the exact shape
// getOnboardingProgressForClient returns from a real client_onboarding_progress
// row), and real CoachOperatingModel overrides on top of the same
// createDefaultCoachOperatingModel every real bootstrapped Playbook uses.
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";

function onboarding(overrides: Partial<OnboardingProgress["answers"]> = {}): OnboardingProgress {
  return {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    currentStepIndex: 6,
    completedAtIso: NOW_ISO,
    updatedAtIso: NOW_ISO,
    answers: {
      about_you: { age: 34, heightFeet: 5, heightInchesRemainder: 8, weightLb: 165, sex: "female" },
      what_you_want: { primaryGoal: "build_muscle" },
      your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["morning"] },
      starting_point: { trainingExperience: "comfortable_common", recentConsistency: "fairly_consistent", weeklyFrequency: 3 },
      fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8" },
      ...overrides,
    },
  };
}

function extractProfile(prog: OnboardingProgress): ClientProgrammingProfile {
  const result = extractClientProgrammingProfile(prog, null);
  assert.ok("profile" in result, "test setup sanity: onboarding fixture must extract cleanly");
  return (result as { profile: ClientProgrammingProfile }).profile;
}

function com(overrides: Partial<CoachOperatingModel["programArchitecture"]> = {}, practiceOverrides: Partial<CoachOperatingModel["practice"]> = {}): CoachOperatingModel {
  const model = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: NOW_ISO, businessName: "OPTIM Test Studio" });
  return { ...model, programArchitecture: { ...model.programArchitecture, ...overrides }, practice: { ...model.practice, ...practiceOverrides } };
}

function generate(profile: ClientProgrammingProfile, comModel: CoachOperatingModel, durationWeeks = 4, coachId = COACH_PROFILE_TEAGUE.id, clientId = CLIENT_PROFILE_DEMO.id) {
  const directions = generateProgramDirectionSummaries({ profile, com: comModel, durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  return buildUniversalProgramForDirection(direction, { clientId, workspaceId: WORKSPACE_OPTIM_ID, coachId, profile, com: comModel, durationWeeks, nowIso: NOW_ISO });
}

function allItems(content: UniversalTrainingProgramContent): TrainingItemInstance[] {
  return content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items))));
}

function trainingDayOfWeeks(content: UniversalTrainingProgramContent): string[] {
  return content.weeks[0].days.filter((d) => d.type === "training").map((d) => d.dayOfWeek);
}

// ---------------------------------------------------------------------------
// A. Real client onboarding data reaches ClientProgrammingProfile
// C. Production action's real pipeline (mirrors createPublishAndAssignProgramAction)
// ---------------------------------------------------------------------------

console.log("\nA/C. Real onboarding reaches ClientProgrammingProfile, and the real pipeline order\n");

check("A: a real client's onboarding answers (availableDays, environment, goal) extract into the real profile the generator consumes", () => {
  const profile = extractProfile(onboarding());
  assert.deepEqual(profile.availableDays, ["Monday", "Wednesday", "Friday"]);
  assert.deepEqual(profile.trainingEnvironment, ["commercial_gym"]);
  assert.equal(profile.primaryGoal, "build_muscle");
  assert.equal(profile.maxSessionLengthMinutes, 60);
});

check("C: the exact real pipeline (extractClientProgrammingProfile -> generateProgramDirectionSummaries -> buildUniversalProgramForDirection) produces a valid schemaVersion-2 program from real onboarding + a real playbook operating model", () => {
  const profile = extractProfile(onboarding());
  const comModel = com();
  const { content, constraints } = generate(profile, comModel);
  assert.equal(content.schemaVersion, 2);
  assert.ok(constraints.passed, JSON.stringify(constraints.checks.filter((c) => !c.passed)));
  validateUniversalTrainingProgramContent(content); // T: still validates
});

// ---------------------------------------------------------------------------
// D. No real data -> conservative fallback still works
// S. legacy coach/client lacking newer profile fields still generates safely
// ---------------------------------------------------------------------------

console.log("\nD/S. Fallback behavior for missing/legacy data\n");

check("D: a client with no onboarding at all (null) falls back to the honest placeholder profile and generation still succeeds", () => {
  const profile = buildPlaceholderProgrammingProfile(["Monday", "Wednesday", "Friday"]);
  const { content, constraints } = generate(profile, com());
  assert.equal(content.schemaVersion, 2);
  assert.ok(constraints.passed);
});

check("D: extractClientProgrammingProfile itself reports 'missing' (not a crash) for a client who never completed onboarding — the real signal the action's fallback branches on", () => {
  const result = extractClientProgrammingProfile(null, null);
  assert.ok("missing" in result);
});

check("S: a coach operating model built before this phase's cardioPhilosophy gate existed (any real prior value) still generates safely", () => {
  const legacyStyleCom = com({ cardioPhilosophy: "optional_low_intensity_supplemental" });
  const profile = extractProfile(onboarding());
  const { content } = generate(profile, legacyStyleCom);
  assert.equal(content.schemaVersion, 2);
});

// ---------------------------------------------------------------------------
// E. 3-day client does not receive 5-day structure
// F. equipment-limited client does not receive unavailable equipment
// ---------------------------------------------------------------------------

console.log("\nE/F. Schedule- and equipment-aware generation\n");

check("E: a real client who reported only 3 available days never receives more than 3 training days, regardless of the coach's own higher frequency ceiling", () => {
  const profile = extractProfile(onboarding({ your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] } }));
  const highFrequencyCom = com({ typicalFrequencyDaysMax: 6 });
  const { content } = generate(profile, highFrequencyCom);
  const days = trainingDayOfWeeks(content);
  assert.ok(days.length <= 3, `expected at most 3 training days, got ${days.length}`);
  for (const d of days) assert.ok(["Monday", "Wednesday", "Friday"].includes(d), `${d} was never a real available day`);
});

check("F: a client with only dumbbells/bodyweight/bands never receives a barbell- or machine-equipment exercise", () => {
  const profile = extractProfile(onboarding({ your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["limited_equipment"] } }));
  const { content, constraints } = generate(profile, com());
  const equipmentCheck = constraints.checks.find((c) => c.id === "equipment_all_weeks")!;
  assert.ok(equipmentCheck.passed, "the generator's own hard-constraint check must confirm equipment compliance");
  for (const item of allItems(content).filter((i) => i.category === "resistance")) {
    const tag = equipmentTagForExerciseName(item.name);
    assert.ok(tag === undefined || tag === "bodyweight" || tag === "bands" || tag === "dumbbell", `"${item.name}" requires equipment (${tag}) outside limited_equipment`);
  }
});

// ---------------------------------------------------------------------------
// G. client limitation influences selection safely
// ---------------------------------------------------------------------------

console.log("\nG. Limitation-aware generation\n");

check("G: a client's real reported knee injury area keeps knee-conflicting exercises out of the generated program", () => {
  const profile = extractProfile(onboarding({ health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["knee"], injuryRestrictions: "No deep knee flexion under load." } }));
  const { content } = generate(profile, com());
  const names = allItems(content).map((i) => i.name.toLowerCase());
  for (const conflicting of ["squat", "lunge", "leg press", "leg extension"]) {
    assert.ok(!names.some((n) => n.includes(conflicting)), `"${conflicting}" should have been avoided for a reported knee limitation`);
  }
});

// ---------------------------------------------------------------------------
// H. client preference influences choice when appropriate
// I. preference does not override a hard constraint
// ---------------------------------------------------------------------------

console.log("\nH/I. Preference is evidence, not an absolute override\n");

check("H: a real client who enjoys cardio, with real schedule surplus beyond the coach's resistance frequency, gets continuous days their preference-neutral counterpart does not", () => {
  const enjoysCardio = extractProfile(onboarding({ your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] }, fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "enjoys_cardio" } }));
  const avoidsCardio = extractProfile(onboarding({ your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] }, fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "avoids_cardio" } }));
  const comModel = com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 });
  const withCardio = generate(enjoysCardio, comModel).content;
  const withoutCardio = generate(avoidsCardio, comModel).content;
  assert.ok(allItems(withCardio).some((i) => i.category === "continuous"), "enjoys_cardio client with real surplus should get continuous work");
  assert.ok(!allItems(withoutCardio).some((i) => i.category === "continuous"), "avoids_cardio client must never get continuous work regardless of surplus");
});

check("I: a coach whose real stored methodology is 'rarely_used' cardio suppresses continuous work even for a client who enjoys cardio with real surplus days — coach authority outranks client preference here", () => {
  const enjoysCardio = extractProfile(onboarding({ your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] }, fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "enjoys_cardio" } }));
  const noCardioCom = com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3, cardioPhilosophy: "rarely_used" });
  const { content } = generate(enjoysCardio, noCardioCom);
  assert.ok(!allItems(content).some((i) => i.category === "continuous"), "coach's explicit 'rarely_used' methodology must override the client's own cardio preference");
});

check("I: a client's schedule (a hard constraint) is never overridden by preference — no surplus days means no continuous work no matter how much the client enjoys cardio", () => {
  const noSurplus = extractProfile(onboarding({ your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] }, fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "enjoys_cardio" } }));
  const { content } = generate(noSurplus, com({ typicalFrequencyDaysMax: 4 })); // ceiling >= available days -> zero surplus
  assert.ok(!allItems(content).some((i) => i.category === "continuous"));
});

// ---------------------------------------------------------------------------
// J. two coaches + same client differ
// K. same coach + two clients with different resources differ
// ---------------------------------------------------------------------------

console.log("\nJ/K. Coach- and client-specific differentiation (spec sections 17/18)\n");

check("J: the SAME real client under two different real coach operating models receives materially different programming parameters (RPE and split)", () => {
  const profile = extractProfile(onboarding({ your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] } }));
  const coachRpeDriven = com({ proximityToFailure: "0_1_reps_in_reserve", preferredSplits: ["body_part_split"] });
  const coachFixedProgression = com({ proximityToFailure: "2_4_reps_in_reserve", preferredSplits: ["full_body"] });
  const a = generate(profile, coachRpeDriven).content;
  const b = generate(profile, coachFixedProgression).content;
  const rpeA = allItems(a).find((i) => i.category === "resistance")!.prescription.rpe;
  const rpeB = allItems(b).find((i) => i.category === "resistance")!.prescription.rpe;
  assert.notEqual(rpeA, rpeB, "the same client must receive genuinely different target RPE under two different coach methodologies");
  assert.notEqual(a.name, b.name, "the chosen split/direction must genuinely differ between the two coach methodologies");
});

check("K: the SAME real coach with two different real clients (full gym, 4 days vs. dumbbells-only, 2 days) produces genuinely different programs", () => {
  const clientFullGym = extractProfile(onboarding({ your_week: { availableDays: ["mon", "tue", "wed", "thu"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] } }));
  const clientLimited = extractProfile(onboarding({ your_week: { availableDays: ["tue", "thu"], maxSessionLength: "45", trainingEnvironment: ["limited_equipment"] } }));
  const comModel = com();
  const a = generate(clientFullGym, comModel).content;
  const b = generate(clientLimited, comModel).content;
  assert.notEqual(trainingDayOfWeeks(a).length, trainingDayOfWeeks(b).length, "different real available-day counts must produce different real training-day counts");
  const bNames = allItems(b).map((i) => i.name);
  for (const name of bNames) {
    const tag = equipmentTagForExerciseName(name);
    assert.ok(tag === undefined || tag === "bodyweight" || tag === "bands" || tag === "dumbbell", `limited-equipment client received "${name}" (${tag})`);
  }
});

// ---------------------------------------------------------------------------
// L. no sex-based programming shortcut
// M. no coach-niche assumption invents client facts
// ---------------------------------------------------------------------------

console.log("\nL/M. Anti-stereotyping review\n");

check("L: two otherwise-identical clients differing ONLY in reported sex receive byte-identical training generation", () => {
  const female = extractProfile(onboarding({ about_you: { age: 34, heightFeet: 5, heightInchesRemainder: 8, weightLb: 165, sex: "female" } }));
  const male = extractProfile(onboarding({ about_you: { age: 34, heightFeet: 5, heightInchesRemainder: 8, weightLb: 165, sex: "male" } }));
  const comModel = com();
  const a = generate(female, comModel, 4, COACH_PROFILE_TEAGUE.id, "client-sex-a").content;
  const b = generate(male, comModel, 4, COACH_PROFILE_TEAGUE.id, "client-sex-b").content;
  const stripped = (c: UniversalTrainingProgramContent) => JSON.stringify(c.weeks, (k, v) => (k === "id" ? undefined : v));
  assert.equal(stripped(a), stripped(b), "sex must have zero effect on training generation content");
});

check("M: a coach's stated clientele/niche (practice.clientPopulations, commonGoals) has zero effect on generated training content — niche never invents an unreported client fact", () => {
  const profile = extractProfile(onboarding());
  const generalCoach = com({}, { clientPopulations: ["general_population"], commonGoals: ["general_health"] });
  const nicheCoach = com({}, { clientPopulations: ["postpartum_athletes", "powerlifters"], commonGoals: ["strength_sport_performance"], specialties: ["competitive_powerlifting"] });
  const a = generate(profile, generalCoach, 4, COACH_PROFILE_TEAGUE.id, "client-niche-a").content;
  const b = generate(profile, nicheCoach, 4, COACH_PROFILE_TEAGUE.id, "client-niche-b").content;
  const stripped = (c: UniversalTrainingProgramContent) => JSON.stringify(c.weeks, (k, v) => (k === "id" ? undefined : v));
  assert.equal(stripped(a), stripped(b), "coach niche/practice fields must never change training content for an otherwise-identical client");
});

// ---------------------------------------------------------------------------
// N. continuous work can be included when supported by real context
// O. continuous work is not forced when coach methodology/context does not call for it
// ---------------------------------------------------------------------------

console.log("\nN/O. Continuous-work decisions are real-context-driven, not automatic\n");

check("N: continuous work is genuinely includable given real supporting context (surplus days + client preference + coach cardio philosophy)", () => {
  const profile = extractProfile(onboarding({ your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] }, fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "enjoys_cardio" } }));
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3 }));
  assert.ok(allItems(content).some((i) => i.category === "continuous"));
});

check("O: continuous work is never added merely because a goal/demographic pattern might suggest it — a fat-loss goal alone, with no real surplus or preference, adds none", () => {
  const profile = extractProfile(onboarding({ what_you_want: { primaryGoal: "lose_fat" }, your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] } }));
  const { content } = generate(profile, com());
  assert.ok(!allItems(content).some((i) => i.category === "continuous"), "a goal alone must never trigger continuous work absent real schedule surplus/preference");
});

// ---------------------------------------------------------------------------
// P (partial — full cross-tenant proof lives in the live e2e script).
// Ownership/tenant identifiers remain correct through this new wiring.
// ---------------------------------------------------------------------------

console.log("\nP. Ownership/tenant identifiers\n");

check("P: distinct real coachId/clientId/workspaceId pass through the real pipeline untouched", () => {
  const profile = extractProfile(onboarding());
  const { content } = generate(profile, com(), 4, "coach-distinct-999", "client-distinct-888");
  assert.equal(content.coachId, "coach-distinct-999");
  assert.equal(content.clientId, "client-distinct-888");
  assert.equal(content.workspaceId, WORKSPACE_OPTIM_ID);
});

// ---------------------------------------------------------------------------
// Generation rationale (spec section 30) — real, structured, not decorative
// ---------------------------------------------------------------------------

console.log("\nGeneration rationale (explainability)\n");

check("the persisted program carries a real, non-empty rationale built from the actual chosen direction — never a generic 'AI chose this'", () => {
  const profile = extractProfile(onboarding());
  const { content } = generate(profile, com());
  assert.ok(content.generationRationale && content.generationRationale.length > 0);
  assert.ok(!content.generationRationale!.toLowerCase().includes("ai chose"));
  validateUniversalTrainingProgramContent(content);
});

check("the rationale mentions continuous-day placement specifically when continuous days were actually added", () => {
  const profile = extractProfile(onboarding({ your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] }, fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "enjoys_cardio" } }));
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3 }));
  assert.ok(allItems(content).some((i) => i.category === "continuous"), "test setup sanity");
  assert.ok(content.generationRationale!.toLowerCase().includes("continuous"));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
