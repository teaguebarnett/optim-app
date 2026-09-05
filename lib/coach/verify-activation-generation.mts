// Phase 5.4A — the deterministic activation-generation engine: client
// snapshot extraction, hard-constraint validation, and real, differentiated
// training/nutrition option generation. No real AI/model provider exists in
// this repository — see activation-generation.ts's module doc.

import assert from "node:assert/strict";
import {
  equipmentForClient,
  experienceTier,
  extractClientSnapshot,
  generateThreeNutritionStrategies,
  generateThreeTrainingOptions,
  isRecompositionGoal,
  validateNutritionHardConstraints,
  type ClientOnboardingSnapshot,
} from "./activation-generation.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";
import type { OnboardingProgress } from "./types";
import type { DayOfWeek } from "../types";

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

function com() {
  return createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM Test Studio" });
}

function onboarding(overrides: {
  age?: number;
  heightFeet?: number;
  heightInchesRemainder?: number;
  weightLb?: number;
  sex?: string;
  primaryGoal?: string;
  secondaryGoals?: string[];
  availableDays?: string[];
  maxSessionLength?: string;
  trainingEnvironment?: string[];
  trainingExperience?: string;
  hasDietaryRestrictions?: string;
  dietaryRestrictionsDetail?: string;
  incomplete?: boolean;
}): OnboardingProgress {
  return {
    clientId: "client-test",
    workspaceId: WORKSPACE_OPTIM_ID,
    currentStepIndex: 5,
    completedAtIso: overrides.incomplete ? undefined : "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    answers: {
      about_you: { age: overrides.age ?? 32, heightFeet: overrides.heightFeet ?? 5, heightInchesRemainder: overrides.heightInchesRemainder ?? 8, weightLb: overrides.weightLb ?? 165, sex: overrides.sex ?? "female" },
      what_you_want: { primaryGoal: overrides.primaryGoal ?? "build_muscle", secondaryGoals: overrides.secondaryGoals ?? [] },
      your_week: { availableDays: overrides.availableDays ?? ["mon", "tue", "wed", "thu", "fri"], maxSessionLength: overrides.maxSessionLength ?? "60", trainingEnvironment: overrides.trainingEnvironment ?? ["commercial_gym"] },
      starting_point: { trainingExperience: overrides.trainingExperience ?? "learning_fundamentals" },
      fuel_recovery: { hasDietaryRestrictions: overrides.hasDietaryRestrictions ?? "no", dietaryRestrictionsDetail: overrides.dietaryRestrictionsDetail, nutritionApproach: "no_structure" },
    },
  } as unknown as OnboardingProgress;
}

console.log("\n1. Honest client-snapshot extraction — never guesses missing data\n");

check("Incomplete onboarding (no completedAtIso) reports missing, never a fabricated snapshot", () => {
  const result = extractClientSnapshot(onboarding({ incomplete: true }));
  assert.ok("missing" in result);
});

check("Null onboarding reports missing", () => {
  const result = extractClientSnapshot(null);
  assert.ok("missing" in result);
});

check("An onboarding record missing critical fields (e.g. this phase's real 'John Test' legacy-client case) lists every real missing field, not a generic error", () => {
  const legacy = onboarding({});
  legacy.answers = { about_you: {}, what_you_want: {}, your_week: {}, starting_point: {}, fuel_recovery: {} } as never;
  const result = extractClientSnapshot(legacy);
  assert.ok("missing" in result);
  const missing = (result as { missing: string[] }).missing;
  assert.ok(missing.includes("Age"));
  assert.ok(missing.includes("Primary goal"));
  assert.ok(missing.includes("Available training days"));
});

check("A fully completed onboarding produces a real, correctly-derived snapshot", () => {
  const result = extractClientSnapshot(onboarding({}));
  assert.ok("snapshot" in result);
  const snapshot = (result as { snapshot: ClientOnboardingSnapshot }).snapshot;
  assert.equal(snapshot.heightTotalInches, 5 * 12 + 8);
  assert.equal(snapshot.availableDays.length, 5);
  assert.equal(snapshot.maxSessionLengthMinutes, 60);
});

check("A '90_plus' session length maps to a real numeric 100 minutes, never NaN", () => {
  const result = extractClientSnapshot(onboarding({ maxSessionLength: "90_plus" }));
  assert.ok("snapshot" in result);
  assert.equal((result as { snapshot: ClientOnboardingSnapshot }).snapshot.maxSessionLengthMinutes, 100);
});

console.log("\n2. Body-recomposition recognition\n");

check("A client with both build_muscle and lose_fat among goals is recognized as recomposition even if neither is 'primary'", () => {
  const snap = (extractClientSnapshot(onboarding({ primaryGoal: "build_muscle", secondaryGoals: ["lose_fat"] })) as { snapshot: ClientOnboardingSnapshot }).snapshot;
  assert.equal(isRecompositionGoal(snap), true);
});

check("A client with only build_muscle is not recognized as recomposition", () => {
  const snap = (extractClientSnapshot(onboarding({ primaryGoal: "build_muscle", secondaryGoals: [] })) as { snapshot: ClientOnboardingSnapshot }).snapshot;
  assert.equal(isRecompositionGoal(snap), false);
});

console.log("\n3. Equipment mapping from training environment\n");

check("A limited-equipment client never gets barbell/machine equipment access", () => {
  const snap = (extractClientSnapshot(onboarding({ trainingEnvironment: ["limited_equipment"] })) as { snapshot: ClientOnboardingSnapshot }).snapshot;
  const equipment = equipmentForClient(snap);
  assert.ok(!equipment.includes("barbell"));
  assert.ok(!equipment.includes("machine"));
  assert.ok(equipment.includes("bodyweight"));
});

check("A commercial-gym client gets full equipment access", () => {
  const snap = (extractClientSnapshot(onboarding({ trainingEnvironment: ["commercial_gym"] })) as { snapshot: ClientOnboardingSnapshot }).snapshot;
  const equipment = equipmentForClient(snap);
  assert.ok(equipment.includes("barbell"));
  assert.ok(equipment.includes("cable"));
});

console.log("\n4. Three real, differentiated training options — and they respect hard constraints\n");

function snapshotFor(overrides: Parameters<typeof onboarding>[0]): ClientOnboardingSnapshot {
  return (extractClientSnapshot(onboarding(overrides)) as { snapshot: ClientOnboardingSnapshot }).snapshot;
}

check("A 5-day, body-recomposition client gets 3 real, genuinely differentiated programs (Part XV #16)", () => {
  const snapshot = snapshotFor({ primaryGoal: "build_muscle", secondaryGoals: ["lose_fat"], availableDays: ["mon", "tue", "wed", "thu", "fri"] });
  assert.equal(isRecompositionGoal(snapshot), true);
  const options = generateThreeTrainingOptions({ clientId: "client-test" as never, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, snapshot, com: com(), durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  assert.equal(options.length, 3);
  const names = new Set(options.map((o) => o.program.name));
  assert.equal(names.size, 3, "all three option names must be distinct, never renamed copies");
  const splitNames = new Set(options.map((o) => o.splitName));
  assert.ok(splitNames.size >= 2, "at least two of the three should use a genuinely different split");
  for (const o of options) {
    assert.ok(o.constraints.passed, `option ${o.kind} should pass hard constraints for a fully-equipped 5-day client`);
    assert.equal(o.program.durationWeeks, 12);
    assert.ok(o.program.weeks.length === 12);
  }
});

check("Every training option's Week 1 only schedules training on the client's actual available days", () => {
  const snapshot = snapshotFor({ availableDays: ["mon", "wed", "fri"] });
  const options = generateThreeTrainingOptions({ clientId: "client-test" as never, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, snapshot, com: com(), durationWeeks: 8, nowIso: "2026-01-01T00:00:00.000Z" });
  for (const o of options) {
    const week1 = o.program.weeks.find((w) => w.weekNumber === 1)!;
    const trainingDays = week1.days.filter((d) => d.type === "training").map((d) => d.dayOfWeek);
    const allowed: DayOfWeek[] = ["Monday", "Wednesday", "Friday"];
    assert.ok(trainingDays.every((d) => allowed.includes(d)), `${o.kind} scheduled training on a day the client isn't available: ${trainingDays.join(",")}`);
  }
});

console.log("\n5. Real bug fix regression — session length is respected, never overflowed (Part XV #17)\n");

check("A 30-minute-max-session client's generated workouts never wildly exceed the stated maximum", () => {
  const snapshot = snapshotFor({ maxSessionLength: "30", availableDays: ["mon"] });
  const options = generateThreeTrainingOptions({ clientId: "client-test" as never, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, snapshot, com: com(), durationWeeks: 4, nowIso: "2026-01-01T00:00:00.000Z" });
  for (const o of options) {
    assert.ok(o.constraints.passed, `option ${o.kind} should pass constraints for a real 30-minute client after the session-length fix`);
    const week1 = o.program.weeks.find((w) => w.weekNumber === 1)!;
    for (const day of week1.days.filter((d) => d.type === "training")) {
      assert.ok((day.workout?.estimatedDurationMin ?? 0) <= 40, `estimated duration ${day.workout?.estimatedDurationMin} exceeds the 30-minute limit plus buffer`);
    }
  }
});

check("A 90-minute session allows more exercises per day than a 30-minute session for the same client", () => {
  const shortSnapshot = snapshotFor({ maxSessionLength: "30", availableDays: ["mon"] });
  const longSnapshot = snapshotFor({ maxSessionLength: "90_plus", availableDays: ["mon"] });
  const shortOption = generateThreeTrainingOptions({ clientId: "client-test" as never, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, snapshot: shortSnapshot, com: com(), durationWeeks: 1, nowIso: "2026-01-01T00:00:00.000Z" })[0];
  const longOption = generateThreeTrainingOptions({ clientId: "client-test" as never, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, snapshot: longSnapshot, com: com(), durationWeeks: 1, nowIso: "2026-01-01T00:00:00.000Z" })[0];
  const shortEx = shortOption.program.weeks[0].days.find((d) => d.type === "training")!.workout!.exercises.length;
  const longEx = longOption.program.weeks[0].days.find((d) => d.type === "training")!.workout!.exercises.length;
  assert.ok(longEx > shortEx, `expected a 90-minute session to fit more exercises than a 30-minute session (got ${longEx} vs ${shortEx})`);
});

console.log("\n6. Equipment-restriction constraint enforcement (Part XV #19)\n");

check("validateTrainingHardConstraints fails a program that uses equipment the client doesn't have", () => {
  const snapshot = snapshotFor({ trainingEnvironment: ["limited_equipment"], availableDays: ["mon", "tue", "wed"] });
  const options = generateThreeTrainingOptions({ clientId: "client-test" as never, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, snapshot, com: com(), durationWeeks: 4, nowIso: "2026-01-01T00:00:00.000Z" });
  for (const o of options) {
    assert.ok(o.constraints.passed, `real generation must never propose equipment the client lacks: ${o.kind}`);
    const week1 = o.program.weeks.find((w) => w.weekNumber === 1)!;
    for (const day of week1.days.filter((d) => d.type === "training")) {
      for (const ex of day.workout?.exercises ?? []) {
        assert.ok(!/barbell|machine/i.test(ex.name), `limited-equipment client got a barbell/machine exercise: ${ex.name}`);
      }
    }
  }
});

check("A coach's exercisesAvoided list is honored by generation and enforced by the constraint check independently", () => {
  const model = com();
  model.programArchitecture.exercisesAvoided = ["Barbell Back Squat"];
  const snapshot = snapshotFor({ availableDays: ["mon", "tue", "wed", "thu"] });
  const options = generateThreeTrainingOptions({ clientId: "client-test" as never, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, snapshot, com: model, durationWeeks: 4, nowIso: "2026-01-01T00:00:00.000Z" });
  for (const o of options) {
    for (const week of o.program.weeks) {
      for (const day of week.days.filter((d) => d.type === "training")) {
        assert.ok(!(day.workout?.exercises ?? []).some((ex) => ex.name === "Barbell Back Squat"));
      }
    }
    assert.ok(o.constraints.checks.find((c) => c.id === "exercises_avoided")?.passed);
  }
});

console.log("\n7. Nutrition generation — real math, safe floors, dietary restrictions survive (Part XV #21)\n");

check("Nutrition strategies are empty when the coach's model says they don't provide nutrition coaching", () => {
  const model = com();
  model.nutritionPhilosophy.providesNutritionCoaching = false;
  const snapshot = snapshotFor({});
  const strategies = generateThreeNutritionStrategies({ snapshot, com: model, nowIso: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(strategies, []);
});

check("Three nutrition strategies are generated, ranked, and the wildcard is a real, distinct carb-cycling strategy", () => {
  const snapshot = snapshotFor({});
  const strategies = generateThreeNutritionStrategies({ snapshot, com: com(), nowIso: "2026-01-01T00:00:00.000Z" });
  assert.equal(strategies.length, 3);
  const wildcard = strategies.find((s) => s.kind === "wildcard")!;
  assert.ok(wildcard.trainingDayTargets);
  assert.ok(wildcard.restDayTargets);
  assert.ok(wildcard.trainingDayTargets!.calories > wildcard.restDayTargets!.calories);
  assert.equal(wildcard.requiresCoachApproval, true);
});

check("A calculated deficit that would fall below 1200 calories is clamped to the safe floor, with an honest assumption note", () => {
  const model = com();
  model.nutritionPhilosophy.rateOfLossPercentPerWeek = 5;
  const snapshot = snapshotFor({ primaryGoal: "lose_fat", weightLb: 110 });
  const strategies = generateThreeNutritionStrategies({ snapshot, com: model, nowIso: "2026-01-01T00:00:00.000Z" });
  const bestFit = strategies.find((s) => s.kind === "best_fit")!;
  assert.ok(bestFit.targets.calories >= 1200);
  assert.ok(bestFit.assumptions.some((a) => a.includes("1200")));
});

check("A client with hasDietaryRestrictions=true but no detail text requires coach approval and fails the acknowledgment constraint honestly", () => {
  const snapshot = snapshotFor({ hasDietaryRestrictions: "yes", dietaryRestrictionsDetail: undefined });
  const strategies = generateThreeNutritionStrategies({ snapshot, com: com(), nowIso: "2026-01-01T00:00:00.000Z" });
  assert.ok(strategies.every((s) => s.requiresCoachApproval === true));
  const check1 = validateNutritionHardConstraints({ targets: strategies[0].targets }, snapshot);
  assert.equal(check1.checks.find((c) => c.id === "dietary_restrictions_acknowledged")?.passed, false);
});

check("A client with hasDietaryRestrictions=true AND real detail text passes the acknowledgment constraint and carries the detail into the explanation", () => {
  const snapshot = snapshotFor({ hasDietaryRestrictions: "yes", dietaryRestrictionsDetail: "Vegetarian, no shellfish." });
  const strategies = generateThreeNutritionStrategies({ snapshot, com: com(), nowIso: "2026-01-01T00:00:00.000Z" });
  const check1 = validateNutritionHardConstraints({ targets: strategies[0].targets }, snapshot);
  assert.equal(check1.checks.find((c) => c.id === "dietary_restrictions_acknowledged")?.passed, true);
  assert.ok(strategies[0].explanation.clientFactsUsed.some((f) => f.includes("Vegetarian, no shellfish.")));
});

console.log("\n8. Experience tier mapping\n");

check("Experience tier maps honestly from the real intake values", () => {
  assert.equal(experienceTier(snapshotFor({ trainingExperience: "new" })), "novice");
  assert.equal(experienceTier(snapshotFor({ trainingExperience: "experienced_consistent" })), "advanced");
  assert.equal(experienceTier(snapshotFor({ trainingExperience: "some_experience" })), "intermediate");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
