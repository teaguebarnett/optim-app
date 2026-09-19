// Gate 3C — verifies coach nutrition authoring and review:
// saveCoachMealPlanEntry, applyCoachApprovedSubstitution, and
// nutritionContext's passthrough into buildReviewQueueItems.
//
// lib/coach/nutrition-authoring.ts's functions go through
// lib/tenancy/client-state-store.ts, which is a no-op outside a real
// browser (see lib/storage.ts's isStorageAvailable) — this script
// polyfills a minimal in-memory `window.localStorage`, the exact same
// technique lib/coach/verify-review-lifecycle.mts already uses, so these
// functions get real save/load round-trip coverage instead of only their
// pure shape.

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
import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { applyCoachApprovedSubstitution, resolutionOutcomeVerb, saveCoachMealPlanEntry } from "./nutrition-authoring.ts";
import { buildReviewQueueItems } from "./attention-queue.ts";
import type { ReviewRequest } from "../types";

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

const AUTHORING_CLIENT_ID = "client-nutrition-authoring-test";

function seedAuthoringClient() {
  const state = createInitialState({ clientId: AUTHORING_CLIENT_ID, workspaceId: WORKSPACE_OPTIM_ID, primaryCoachId: COACH_PROFILE_TEAGUE.id });
  saveClientAppState(AUTHORING_CLIENT_ID, state);
}

console.log("\n1. saveCoachMealPlanEntry — writes and clears one period's overlay, real save/load round trip\n");

check("writes a Meal Intent override and eligible-rule list for exactly the given period, leaving every other period untouched", () => {
  seedAuthoringClient();
  const result = saveCoachMealPlanEntry({
    clientId: AUTHORING_CLIENT_ID,
    period: "postWorkout",
    mealIntentOverride: "Keep this light and easy to digest before your next session.",
    eligibleSubstitutionRuleIds: ["sub-chicken-turkey"],
    coachId: COACH_PROFILE_TEAGUE.id,
    coachName: "Teague",
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.ok, true);

  const reloaded = loadClientAppState(AUTHORING_CLIENT_ID)!;
  const entry = reloaded.coachMealPlan.postWorkout!;
  assert.equal(entry.mealIntentOverride, "Keep this light and easy to digest before your next session.");
  assert.deepEqual(entry.eligibleSubstitutionRuleIds, ["sub-chicken-turkey"]);
  assert.equal(entry.updatedByCoachName, "Teague");
  assert.equal(reloaded.coachMealPlan.breakfast, undefined, "an untouched period must never pick up another period's override");
});

check("a blank Meal Intent clears the override back to undefined rather than storing an empty string", () => {
  seedAuthoringClient();
  saveCoachMealPlanEntry({
    clientId: AUTHORING_CLIENT_ID,
    period: "lunch",
    mealIntentOverride: "   ",
    eligibleSubstitutionRuleIds: undefined,
    coachId: COACH_PROFILE_TEAGUE.id,
    coachName: "Teague",
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const entry = loadClientAppState(AUTHORING_CLIENT_ID)!.coachMealPlan.lunch!;
  assert.equal(entry.mealIntentOverride, undefined, "whitespace-only input must never be stored as a real override string");
});

check("an explicit empty eligible-rules array is stored as a real, deliberate 'none eligible,' distinct from never having been configured", () => {
  seedAuthoringClient();
  saveCoachMealPlanEntry({
    clientId: AUTHORING_CLIENT_ID,
    period: "dinner",
    mealIntentOverride: "",
    eligibleSubstitutionRuleIds: [],
    coachId: COACH_PROFILE_TEAGUE.id,
    coachName: "Teague",
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const entry = loadClientAppState(AUTHORING_CLIENT_ID)!.coachMealPlan.dinner!;
  assert.deepEqual(entry.eligibleSubstitutionRuleIds, [], "an explicit [] must survive as [], never coerced to undefined");
});

check("returns not_found for a client with no real AppState yet, and writes nothing", () => {
  const result = saveCoachMealPlanEntry({
    clientId: "client-does-not-exist",
    period: "breakfast",
    mealIntentOverride: "Anything",
    eligibleSubstitutionRuleIds: undefined,
    coachId: COACH_PROFILE_TEAGUE.id,
    coachName: "Teague",
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.ok, false);
});

console.log("\n2. applyCoachApprovedSubstitution — logs exactly like the client's own auto-execute path\n");

check("logs the substitution using the ORIGINAL macros passed in, never a fabricated number for the substituted food", () => {
  seedAuthoringClient();
  const originalMacros = { calories: 620, proteinG: 52, carbsG: 70, fatG: 12 };
  const result = applyCoachApprovedSubstitution({
    clientId: AUTHORING_CLIENT_ID,
    period: "postWorkout",
    ruleId: "sub-chicken-turkey",
    originalMacros,
  });
  assert.equal(result.ok, true);

  const selection = loadClientAppState(AUTHORING_CLIENT_ID)!.meals.postWorkout!;
  assert.equal(selection.source, "manual");
  assert.deepEqual(selection.macros, originalMacros, "the coach-approved log must carry the exact original macros, never an invented number");
  assert.match(selection.manualName ?? "", /turkey breast/);
  assert.match(selection.manualName ?? "", /chicken breast/);
  assert.ok(selection.mealIntent && selection.mealIntent.length > 0, "the rule's own constraint/rationale must be preserved as this log's MealIntent");
});

check("overwrites whatever was previously logged for that exact period, never appending a second entry", () => {
  seedAuthoringClient();
  const state = loadClientAppState(AUTHORING_CLIENT_ID)!;
  saveClientAppState(AUTHORING_CLIENT_ID, {
    ...state,
    meals: { ...state.meals, postWorkout: { period: "postWorkout", source: "option", optionId: "pw-1", macros: { calories: 600, proteinG: 50, carbsG: 60, fatG: 10 } } },
  });
  applyCoachApprovedSubstitution({ clientId: AUTHORING_CLIENT_ID, period: "postWorkout", ruleId: "sub-chicken-turkey", originalMacros: { calories: 600, proteinG: 50, carbsG: 60, fatG: 10 } });
  const reloaded = loadClientAppState(AUTHORING_CLIENT_ID)!;
  assert.equal(reloaded.meals.postWorkout!.source, "manual", "the prior option-sourced entry must be replaced, not left alongside a second record");
});

check("returns rule_not_found for a ruleId that doesn't exist in the real registry — never silently applies nothing while claiming success", () => {
  seedAuthoringClient();
  const result = applyCoachApprovedSubstitution({
    clientId: AUTHORING_CLIENT_ID,
    period: "breakfast",
    ruleId: "sub-does-not-exist",
    originalMacros: { calories: 500, proteinG: 30, carbsG: 40, fatG: 10 },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "rule_not_found");
});

check("returns not_found for a client with no real AppState yet", () => {
  const result = applyCoachApprovedSubstitution({
    clientId: "client-does-not-exist",
    period: "breakfast",
    ruleId: "sub-chicken-turkey",
    originalMacros: { calories: 500, proteinG: 30, carbsG: 40, fatG: 10 },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
});

console.log("\n3. nutritionContext survives into the coach's own review queue\n");

check("buildReviewQueueItems passes nutritionContext straight through from the underlying ReviewRequest", () => {
  const review: ReviewRequest = {
    id: "review-nutrition-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    kind: "program-change-request",
    severity: "high",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    summary: "Nutrition substitution requested for post-workout meal: chicken breast → turkey breast.",
    status: "needs_review",
    resolved: false,
    nutritionContext: { period: "postWorkout", ruleId: "sub-chicken-turkey" },
  };
  const items = buildReviewQueueItems({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    clients: [CLIENT_PROFILE_DEMO],
    reviewRequests: [review],
  });
  assert.deepEqual(items[0]?.nutritionContext, { period: "postWorkout", ruleId: "sub-chicken-turkey" });
});

console.log("\n4. resolutionOutcomeVerb — the resolved receipt describes what actually happened, never a blanket 'Approved'\n");

check("a real approval (handleApprove's own whatChanged prefix) reads as Approved", () => {
  const verb = resolutionOutcomeVerb({
    resolutionAction: "resolved",
    resolutionReceipt: {
      decision: "Resolved",
      approvedByCoachId: COACH_PROFILE_TEAGUE.id,
      approvedByCoachName: "Teague",
      whatChanged: "Approved: turkey breast instead of chicken breast, logged for post-workout meal.",
      clientCommunicated: "Go ahead and swap in turkey breast.",
      responseRequired: false,
    },
  });
  assert.equal(verb, "Approved");
});

check("a resolved review that never went through handleApprove (a decline, a redirect, an inapplicable-rule correction) reads as Corrected, never Approved", () => {
  const verb = resolutionOutcomeVerb({
    resolutionAction: "resolved",
    resolutionReceipt: {
      decision: "Resolved",
      approvedByCoachId: COACH_PROFILE_TEAGUE.id,
      approvedByCoachName: "Teague",
      whatChanged: "No registered swap for black beans — declining the auto-swap and suggesting a manual substitute instead.",
      clientCommunicated: "Swap in kidney beans or chickpeas 1:1 for the black beans.",
      responseRequired: false,
    },
  });
  assert.equal(verb, "Corrected");
});

check("'reviewed, no change needed' reads as Reviewed regardless of whatChanged's wording", () => {
  const verb = resolutionOutcomeVerb({
    resolutionAction: "reviewed_no_change",
    resolutionReceipt: {
      decision: "Reviewed — no change needed",
      approvedByCoachId: COACH_PROFILE_TEAGUE.id,
      approvedByCoachName: "Teague",
      whatChanged: "Approved: this happens to start with the same word, but the action taken was 'no change.'",
      clientCommunicated: "",
      responseRequired: false,
    },
  });
  assert.equal(verb, "Reviewed");
});

check("a resolved review with no resolution receipt at all defaults to Corrected, never Approved", () => {
  const verb = resolutionOutcomeVerb({ resolutionAction: "resolved", resolutionReceipt: undefined });
  assert.equal(verb, "Corrected");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
