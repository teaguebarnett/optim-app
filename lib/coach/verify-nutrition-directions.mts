// Phase 5.5A — verifies the AI-first nutrition workflow (spec Part 8): a
// complete prescription built from the coach's own real nutritionPhilosophy
// answers (not just calories/macros), real food-source reuse, honest
// conversational revision, and correct recomputed macros.

import assert from "node:assert/strict";
import { generateThreeNutritionStrategies } from "./activation-generation.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import {
  buildCompleteNutritionPrescription,
  foodSourceRecommendationsFor,
  interpretNutritionRevisionInstruction,
  applyNutritionRevision,
} from "./nutrition-directions.ts";
import { createInitialState } from "../state.ts";
import { migrateStoredState } from "../tenancy/migrate.ts";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { ClientProgrammingProfile } from "./programming-profile.ts";
import type { MealRecommendation } from "./types";
import type { ClientProfileId } from "../tenancy/types";

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

function baseProfile(overrides: Partial<ClientProgrammingProfile> = {}): ClientProgrammingProfile {
  return {
    age: 30,
    heightTotalInches: 70,
    weightLb: 180,
    sex: "male",
    primaryGoal: "build_muscle",
    secondaryGoals: [],
    availableDays: ["Monday", "Wednesday", "Friday"],
    maxSessionLengthMinutes: 60,
    trainingEnvironment: ["commercial_gym"],
    trainingExperience: "comfortable_common",
    hasDietaryRestrictions: false,
    nutritionApproach: "tracking",
    recentConsistency: "fairly_consistent",
    recentWeeklyFrequency: 3,
    trainingNotes: null,
    schedulePredictability: "mostly_predictable",
    preferredTrainingTimes: ["evening"],
    scheduleContext: null,
    dailyActivityLevel: "lightly_active",
    dailyActivityLevelIsAssumed: false,
    typicalSleep: "7_8",
    consistencyObstacles: [],
    coachSupportStyle: [],
    cardioPreference: "neutral_on_cardio",
    cardioPreferenceIsAssumed: false,
    hasCurrentInjury: false,
    injuryBodyAreas: [],
    injuryRestrictions: null,
    requiresHealthReview: false,
    healthReviewResolved: "no_review_needed",
    ...overrides,
  };
}

function baseCom(overrides: Partial<CoachOperatingModel["nutritionPhilosophy"]> = {}): CoachOperatingModel {
  const model = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM Test Studio" });
  return { ...model, nutritionPhilosophy: { ...model.nutritionPhilosophy, ...overrides } };
}

console.log("\n1. buildCompleteNutritionPrescription — real fields from real coach philosophy answers\n");

check("meal count reflects the coach's real mealFrequencyPreference, not a hardcoded number", () => {
  const profile = baseProfile();
  const strategies5 = generateThreeNutritionStrategies({ snapshot: profile, com: baseCom({ mealFrequencyPreference: "5_plus_meals" }), nowIso: "2026-01-01T00:00:00.000Z" });
  const strategies3 = generateThreeNutritionStrategies({ snapshot: profile, com: baseCom({ mealFrequencyPreference: "2_3_meals" }), nowIso: "2026-01-01T00:00:00.000Z" });
  const p5 = buildCompleteNutritionPrescription(strategies5[0], profile, baseCom({ mealFrequencyPreference: "5_plus_meals" }));
  const p3 = buildCompleteNutritionPrescription(strategies3[0], profile, baseCom({ mealFrequencyPreference: "2_3_meals" }));
  assert.equal(p5.mealsPerDay, 5);
  assert.equal(p3.mealsPerDay, 3);
});

check("training/rest split honors the coach's trainingDayVsRestDayStrategy — off when 'identical_every_day'", () => {
  const profile = baseProfile();
  const com = baseCom({ trainingDayVsRestDayStrategy: "identical_every_day" });
  const strategies = generateThreeNutritionStrategies({ snapshot: profile, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const wildcard = strategies.find((s) => s.kind === "wildcard")!;
  const prescription = buildCompleteNutritionPrescription(wildcard, profile, com);
  assert.equal(prescription.usesTrainingRestSplit, false);
});

check("substitution guidance is honest — no restriction reported means no substitutions required, a real detail produces real substitution text", () => {
  const com = baseCom();
  const clean = baseProfile({ hasDietaryRestrictions: false });
  const withRestriction = baseProfile({ hasDietaryRestrictions: true, dietaryRestrictionsDetail: "Lactose intolerant" });
  const strategiesClean = generateThreeNutritionStrategies({ snapshot: clean, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const strategiesRestricted = generateThreeNutritionStrategies({ snapshot: withRestriction, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const cleanPrescription = buildCompleteNutritionPrescription(strategiesClean[0], clean, com);
  const restrictedPrescription = buildCompleteNutritionPrescription(strategiesRestricted[0], withRestriction, com);
  assert.match(cleanPrescription.substitutionGuidance, /no dietary restrictions/i);
  assert.match(restrictedPrescription.substitutionGuidance, /lactose intolerant/i);
});

check("pre-training guidance reflects the client's real reported training time", () => {
  const profile = baseProfile({ preferredTrainingTimes: ["early morning"] });
  const com = baseCom();
  const strategies = generateThreeNutritionStrategies({ snapshot: profile, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const prescription = buildCompleteNutritionPrescription(strategies[0], profile, com);
  assert.match(prescription.preTrainingGuidance, /early morning/);
});

check("fiber target is a real, non-zero, calorie-scaled estimate", () => {
  const profile = baseProfile();
  const com = baseCom();
  const strategies = generateThreeNutritionStrategies({ snapshot: profile, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const prescription = buildCompleteNutritionPrescription(strategies[0], profile, com);
  assert.ok(prescription.fiberGramsPerDay > 0);
  assert.equal(prescription.fiberGramsPerDay, Math.round((prescription.targets.calories / 1000) * 14));
});

console.log("\n2. foodSourceRecommendationsFor — reuses the existing library, never a duplicate\n");

check("returns only this coach's own active recommendations explicitly assigned to this client", () => {
  const clientId = "client-nutrition-test" as ClientProfileId;
  const otherClientId = "client-other" as ClientProfileId;
  const recs: MealRecommendation[] = [
    { id: "r1", workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Chicken bowl", category: "lunch", ingredients: "chicken, rice", tags: [], status: "active", assignedClientIds: [clientId], createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    { id: "r2", workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Archived meal", category: "dinner", ingredients: "x", tags: [], status: "archived", assignedClientIds: [clientId], createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
    { id: "r3", workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Someone else's meal", category: "lunch", ingredients: "x", tags: [], status: "active", assignedClientIds: [otherClientId], createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" },
  ];
  const result = foodSourceRecommendationsFor(recs, COACH_PROFILE_TEAGUE.id, clientId);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "r1");
});

console.log("\n3. Conversational nutrition revision — real interpretation, real recomputed macros\n");

check("'increase protein' interprets and recomputes a real higher protein target with recalculated carbs", () => {
  const profile = baseProfile();
  const com = baseCom();
  const strategies = generateThreeNutritionStrategies({ snapshot: profile, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const prescription = buildCompleteNutritionPrescription(strategies[0], profile, com);
  const plan = interpretNutritionRevisionInstruction("Please increase his protein a bit.");
  assert.equal(plan.kind, "adjust_protein");
  const { revisedPrescription, changes } = applyNutritionRevision(prescription, plan, profile.weightLb, com.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight);
  assert.ok(revisedPrescription.targets.proteinG > prescription.targets.proteinG);
  assert.equal(revisedPrescription.targets.calories, prescription.targets.calories, "calories should stay the same for a pure protein adjustment");
  assert.ok(changes.length > 0);
});

check("'reduce calories by a bit' interprets and recomputes a real lower calorie target", () => {
  const profile = baseProfile();
  const com = baseCom();
  const strategies = generateThreeNutritionStrategies({ snapshot: profile, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const prescription = buildCompleteNutritionPrescription(strategies[0], profile, com);
  const plan = interpretNutritionRevisionInstruction("Can we reduce calories slightly?");
  assert.equal(plan.kind, "adjust_calories");
  const { revisedPrescription } = applyNutritionRevision(prescription, plan, profile.weightLb, com.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight);
  assert.ok(revisedPrescription.targets.calories < prescription.targets.calories);
});

check("'switch to 5 meals' interprets meal count directly", () => {
  const plan = interpretNutritionRevisionInstruction("Let's switch to 5 meals a day.");
  assert.equal(plan.kind, "adjust_meal_count");
  assert.equal(plan.mealsPerDay, 5);
});

check("an unrecognized instruction changes nothing — never a fabricated edit", () => {
  const profile = baseProfile();
  const com = baseCom();
  const strategies = generateThreeNutritionStrategies({ snapshot: profile, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const prescription = buildCompleteNutritionPrescription(strategies[0], profile, com);
  const plan = interpretNutritionRevisionInstruction("Make it better somehow.");
  assert.equal(plan.kind, "unrecognized");
  const { revisedPrescription, changes } = applyNutritionRevision(prescription, plan, profile.weightLb, com.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight);
  assert.equal(changes.length, 0);
  assert.deepEqual(revisedPrescription.targets, prescription.targets);
});

check("enabling a training/rest split produces real, different training-day and rest-day targets", () => {
  const profile = baseProfile();
  const com = baseCom({ trainingDayVsRestDayStrategy: "identical_every_day" });
  const strategies = generateThreeNutritionStrategies({ snapshot: profile, com, nowIso: "2026-01-01T00:00:00.000Z" });
  const prescription = buildCompleteNutritionPrescription(strategies[0], profile, com);
  const plan = interpretNutritionRevisionInstruction("Please add a training day vs rest day split.");
  assert.equal(plan.kind, "toggle_training_rest_split");
  const { revisedPrescription } = applyNutritionRevision(prescription, plan, profile.weightLb, com.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight);
  assert.equal(revisedPrescription.usesTrainingRestSplit, true);
  assert.ok(revisedPrescription.trainingDayTargets);
  assert.ok(revisedPrescription.restDayTargets);
  assert.notEqual(revisedPrescription.trainingDayTargets!.calories, revisedPrescription.restDayTargets!.calories);
});

console.log("\n4. AppState v13 -> v14 migration — assignedNutritionPlan is real and additive\n");

check("a fresh v14 state migrates through unchanged, and a pre-v14 stored state gains the new field as undefined, never a fabricated default", () => {
  const fresh = createInitialState();
  assert.equal(fresh.version, 14);
  assert.equal(fresh.assignedNutritionPlan, undefined);

  const preV14 = JSON.parse(JSON.stringify({ ...fresh, version: 13 }));
  delete preV14.assignedNutritionPlan;
  const migrated = migrateStoredState(preV14);
  assert.ok(migrated);
  assert.equal(migrated!.version, 14);
  assert.equal(migrated!.assignedNutritionPlan, undefined);
  // The one field this migration step actually cares about — the client's
  // real, already-approved flat nutritionTargets — survives untouched.
  assert.deepEqual(migrated!.nutritionTargets, fresh.nutritionTargets);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
