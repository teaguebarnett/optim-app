// Coach intake corrections + unseen-question answers — pure checks on the real iCloud client's production answers
// (goal "get stronger", a target-weight wheel default of 80 lb saved for a question the client never saw).
//   node --experimental-strip-types lib/coach/verify-intake-corrections.mts

import assert from "node:assert/strict";
import { effectiveIntakeAnswers, parseIntakeCorrections, type IntakeCorrection } from "./intake-corrections.ts";
import { ONBOARDING_STEPS } from "./onboarding-steps.ts";
import { deriveClientState } from "../synthesis/client-state.ts";
import { buildSynthesisInput } from "../synthesis/synthesis-input.ts";
import { nutritionSafety } from "../synthesis/nutrition/safety.ts";
import { FOUNDATION_KNOWLEDGE } from "../synthesis/knowledge/registry.ts";
import type { OnboardingProgress } from "./types.ts";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}\n        ${(err as Error).message}`);
    failed++;
  }
}

const NOW = "2026-10-13T00:00:00.000Z";
// The production iCloud client's answers (identity-free).
const PROD = {
  about_you: { age: 20, sex: "male", weightLb: 195, heightFeet: 5, weightDirection: "stable", heightInchesRemainder: 8 },
  what_you_want: { targetLift: "exercise.barbell_bench_press", primaryGoal: "get_stronger", targetWeight: 80, secondaryGoals: ["build_muscle"], targetLiftReps: 1, targetLiftValue: 405, successDefinition: "Benching 405" },
  your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], maxSessionLength: "90", trainingEnvironment: ["private_gym"] },
  starting_point: { weeklyFrequency: 6, recentConsistency: "very_consistent", trainingExperience: "comfortable_common" },
  fuel_recovery: { typicalSleep: "7_8", hasDietaryRestrictions: "none" },
  health_finish: { safetyScreen: ["none"], hasInjuryHistory: false },
} as unknown as OnboardingProgress["answers"];
const safetyFor = (answers: OnboardingProgress["answers"]) => {
  const onboarding = { clientId: "c", workspaceId: "w", currentStepIndex: 6, answers, completedAtIso: NOW, updatedAtIso: NOW } as OnboardingProgress;
  const input = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: null, client: deriveClientState({ clientProfileId: "c", workspaceId: "w", onboarding, healthReview: null }) });
  return nutritionSafety(input.client, input.goal).escalations.map((e) => e.code);
};
const correction = (value: number | null, original: unknown = 80): IntakeCorrection => ({ step: "what_you_want", field: "targetWeight", value, cleared: value === null, original, reason: "x", correctedBy: "coach", correctedAtIso: NOW });

console.log("\nIntake corrections and unseen-question answers\n");

check("root cause: the raw saved answers (80 lb for a question never shown) trigger the underweight-goal escalation", () => {
  assert.ok(safetyFor(PROD).includes("underweight_goal_weight"));
});

check("an answer to a question the client never saw is dropped: 'get stronger' never shows target weight → no escalation", () => {
  const eff = effectiveIntakeAnswers(PROD);
  assert.equal((eff.what_you_want as Record<string, unknown>).targetWeight, undefined);
  assert.deepEqual(safetyFor(eff), []);
  assert.equal((PROD.what_you_want as Record<string, unknown>).targetWeight, 80, "the client's own answers are never changed");
});

check("a visible target weight (muscle-gain goal) is kept as the client gave it", () => {
  const a = structuredClone(PROD) as Record<string, Record<string, unknown>>;
  a.what_you_want.primaryGoal = "build_muscle";
  a.what_you_want.secondaryGoals = [];
  a.what_you_want.targetWeight = 205;
  assert.equal((effectiveIntakeAnswers(a as never).what_you_want as Record<string, unknown>).targetWeight, 205);
});

check("the coach's correction replaces the client's value; clearing removes it — and an extreme value on a visible question is cleared by the coach, not ignored", () => {
  const a = structuredClone(PROD) as Record<string, Record<string, unknown>>;
  a.what_you_want.primaryGoal = "build_muscle";
  a.what_you_want.secondaryGoals = [];
  assert.ok(safetyFor(a as never).includes("underweight_goal_weight"), "a visible 80 lb answer still escalates until the coach acts");
  const corrected = effectiveIntakeAnswers(a as never, { "what_you_want.targetWeight": correction(185) });
  assert.equal((corrected.what_you_want as Record<string, unknown>).targetWeight, 185);
  assert.deepEqual(safetyFor(corrected), []);
  const cleared = effectiveIntakeAnswers(a as never, { "what_you_want.targetWeight": correction(null) });
  assert.equal((cleared.what_you_want as Record<string, unknown>).targetWeight, undefined);
  assert.deepEqual(safetyFor(cleared), []);
});

check("health answers and other steps pass through unchanged; malformed correction records are ignored", () => {
  const a = structuredClone(PROD) as Record<string, Record<string, unknown>>;
  a.health_finish = { safetyScreen: ["none"], hasInjuryHistory: true, injuryBodyAreas: ["other"], injuryBodyAreaOther: "Core/abs", injuryRestrictions: "No bracing." };
  const eff = effectiveIntakeAnswers(a as never, parseIntakeCorrections({ junk: { step: "x" }, "what_you_want.targetWeight": correction(null) }));
  assert.deepEqual(eff.health_finish, a.health_finish);
  assert.deepEqual(eff.your_week, a.your_week);
  assert.deepEqual(Object.keys(parseIntakeCorrections({ junk: { step: "x" } })), []);
});

check("the onboarding definition: target weight records nothing unless the client sets it", () => {
  const f = ONBOARDING_STEPS.find((s) => s.id === "what_you_want")!.fields.find((x) => x.key === "targetWeight")!;
  assert.equal(f.recordsDisplayedDefault, false);
  assert.equal(f.required, false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
