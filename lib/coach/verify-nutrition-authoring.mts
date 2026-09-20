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
import { applyCoachApprovedSubstitution, saveCoachMealPlanEntry } from "./nutrition-authoring.ts";
import { buildReviewQueueItems, resolutionOutcomeVerb } from "./attention-queue.ts";
import { resolveReviewRequest, requiresResolutionNote, requiresClientNotificationBeforeResolution } from "./review-lifecycle.ts";
// Gate 4C fix — imported straight from the real component so this test
// exercises the actual guard the UI consults, not a reimplemented copy of it.
import { canApproveNutritionSubstitution } from "../../components/coach/nutrition-review-detail-sheet.tsx";
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

const NUTRITION_CONTEXT = { period: "postWorkout" as const, ruleId: "sub-chicken-turkey" };

check("a real approval (handleApprove's own whatChanged prefix) reads as Approved", () => {
  const verb = resolutionOutcomeVerb({
    resolutionAction: "resolved",
    nutritionContext: NUTRITION_CONTEXT,
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
    nutritionContext: NUTRITION_CONTEXT,
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
    nutritionContext: NUTRITION_CONTEXT,
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

check("a resolved nutrition review with no resolution receipt at all defaults to Corrected, never Approved", () => {
  const verb = resolutionOutcomeVerb({ resolutionAction: "resolved", nutritionContext: NUTRITION_CONTEXT, resolutionReceipt: undefined });
  assert.equal(verb, "Corrected");
});

check("Gate 4C — a resolved item with no nutritionContext reads as Resolved, never Approved or Corrected", () => {
  const verb = resolutionOutcomeVerb({
    resolutionAction: "resolved",
    nutritionContext: undefined,
    resolutionReceipt: {
      decision: "Resolved",
      approvedByCoachId: COACH_PROFILE_TEAGUE.id,
      approvedByCoachName: "Teague",
      whatChanged: "Approved: this prefix must not leak Approved onto a generic (non-nutrition) kind.",
      clientCommunicated: "Logged your pain report and adjusted next week's volume.",
      responseRequired: false,
    },
  });
  assert.equal(verb, "Resolved", "a generic kind has no real proposal to approve or decline — must never borrow nutrition's Approved/Corrected wording");
});

check("Gate 4C — a resolved item with no nutritionContext and no resolution receipt still reads as Resolved", () => {
  const verb = resolutionOutcomeVerb({ resolutionAction: "resolved", nutritionContext: undefined, resolutionReceipt: undefined });
  assert.equal(verb, "Resolved");
});

check("Gate 4C — 'reviewed, no change needed' still reads as Reviewed even with no nutritionContext", () => {
  const verb = resolutionOutcomeVerb({ resolutionAction: "reviewed_no_change", nutritionContext: undefined, resolutionReceipt: undefined });
  assert.equal(verb, "Reviewed");
});

console.log("\n5. Approve ordering guard (Gate 4C fix) — validate before apply, never apply then discover it can't resolve\n");

const GUARD_REVIEW_ID = "review-approval-guard-test";
const GUARD_PERIOD = "postWorkout" as const;
const GUARD_ORIGINAL_MACROS = { calories: 600, proteinG: 50, carbsG: 60, fatG: 10 };
const GUARD_ORIGINAL_MANUAL_NAME = "chicken breast, 6oz";

function seedApprovalGuardReview(): void {
  seedAuthoringClient();
  const state = loadClientAppState(AUTHORING_CLIENT_ID)!;
  const review: ReviewRequest = {
    id: GUARD_REVIEW_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: AUTHORING_CLIENT_ID,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    kind: "program-change-request",
    severity: "high",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    summary: "Client asked to swap chicken breast for turkey breast post-workout.",
    status: "needs_review",
    resolved: false,
    nutritionContext: { period: GUARD_PERIOD, ruleId: "sub-chicken-turkey" },
  };
  saveClientAppState(AUTHORING_CLIENT_ID, {
    ...state,
    meals: {
      ...state.meals,
      [GUARD_PERIOD]: {
        period: GUARD_PERIOD,
        source: "manual",
        manualName: GUARD_ORIGINAL_MANUAL_NAME,
        macros: GUARD_ORIGINAL_MACROS,
        isEstimate: true,
        completedAtIso: "2026-01-01T00:00:00.000Z",
      },
    },
    reviewRequests: [...state.reviewRequests, review],
  });
}

/** Mirrors the exact fixed handleApprove sequence in
 * components/coach/nutrition-review-detail-sheet.tsx: consult the same
 * canApproveNutritionSubstitution guard the button's disabled state also
 * uses BEFORE applying the substitution, then resolve. Never the other
 * order — this is the invariant the Gate 4C fix restores. */
function attemptApprove(note: string, clientMessage: string): { guardBlocked: boolean; substitutionApplied: boolean; resolved: boolean } {
  const noteBlocksResolution = requiresResolutionNote("program-change-request") && note.trim().length === 0;
  const messageBlocksResolution = requiresClientNotificationBeforeResolution("program-change-request") && clientMessage.trim().length === 0;
  if (!canApproveNutritionSubstitution(noteBlocksResolution, messageBlocksResolution)) {
    return { guardBlocked: true, substitutionApplied: false, resolved: false };
  }
  const applied = applyCoachApprovedSubstitution({
    clientId: AUTHORING_CLIENT_ID,
    period: GUARD_PERIOD,
    ruleId: "sub-chicken-turkey",
    originalMacros: GUARD_ORIGINAL_MACROS,
  });
  if (!applied.ok) return { guardBlocked: false, substitutionApplied: false, resolved: false };
  const result = resolveReviewRequest({
    clientId: AUTHORING_CLIENT_ID,
    reviewId: GUARD_REVIEW_ID,
    resolutionAction: "resolved",
    resolutionNote: note.trim() || undefined,
    resolvedByCoachId: COACH_PROFILE_TEAGUE.id,
    resolvedByCoachName: "Teague",
    clientMessage: clientMessage.trim() || undefined,
    whatChanged: "Approved: turkey breast instead of chicken breast, logged for post-workout.",
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  return { guardBlocked: false, substitutionApplied: true, resolved: result.ok };
}

check("A. note required + note empty: Approve cannot legitimately execute — no substitution applied, review stays unresolved, no receipt", () => {
  seedApprovalGuardReview();
  const outcome = attemptApprove("", "A real message to relay to the client.");
  assert.equal(outcome.guardBlocked, true, "the guard must block before any mutation runs");
  assert.equal(outcome.substitutionApplied, false);

  const state = loadClientAppState(AUTHORING_CLIENT_ID)!;
  assert.equal(state.meals[GUARD_PERIOD]?.manualName, GUARD_ORIGINAL_MANUAL_NAME, "the original evidence must be untouched — no substitution was applied");

  const review = state.reviewRequests.find((r) => r.id === GUARD_REVIEW_ID)!;
  assert.equal(review.status, "needs_review", "the review must remain unresolved when the note precondition was never met");
  assert.equal(review.resolutionReceipt, undefined, "no receipt should exist for a review that never actually resolved");
});

check("B. note required + valid note: Approve applies the substitution exactly once, resolves the review, and records an attributable receipt", () => {
  seedApprovalGuardReview();
  const outcome = attemptApprove("Approved — macros line up closely enough.", "Go ahead and swap in turkey breast.");
  assert.equal(outcome.guardBlocked, false);
  assert.equal(outcome.substitutionApplied, true);
  assert.equal(outcome.resolved, true);

  const state = loadClientAppState(AUTHORING_CLIENT_ID)!;
  assert.match(state.meals[GUARD_PERIOD]?.manualName ?? "", /turkey breast/, "the substitution must have actually applied exactly once");

  const review = state.reviewRequests.find((r) => r.id === GUARD_REVIEW_ID)!;
  assert.equal(review.status, "resolved");
  assert.equal(review.resolutionReceipt?.approvedByCoachName, "Teague", "the receipt must be attributable to the real acting coach");
  assert.match(review.resolutionReceipt?.whatChanged ?? "", /Approved:/);
});

check("C. a kind that never required a note in the first place is never blocked by one — the guard is not a global note requirement", () => {
  assert.equal(requiresResolutionNote("technique-flag"), false, "sanity check: this kind never required a note");
  const noteBlocksResolution = requiresResolutionNote("technique-flag") && "".trim().length === 0;
  const messageBlocksResolution = requiresClientNotificationBeforeResolution("technique-flag") && "".trim().length === 0;
  assert.equal(canApproveNutritionSubstitution(noteBlocksResolution, messageBlocksResolution), true, "approval must proceed normally when the note was never required for this kind");
});

check("D. messageBlocksResolution still blocks exactly as before, even with a valid note present", () => {
  seedApprovalGuardReview();
  const outcome = attemptApprove("Approved — macros line up closely enough.", "");
  assert.equal(outcome.guardBlocked, true, "an unmet client-notification requirement must still block Approve");
  assert.equal(outcome.substitutionApplied, false);

  const state = loadClientAppState(AUTHORING_CLIENT_ID)!;
  assert.equal(state.meals[GUARD_PERIOD]?.manualName, GUARD_ORIGINAL_MANUAL_NAME, "no substitution should have applied");
  const review = state.reviewRequests.find((r) => r.id === GUARD_REVIEW_ID)!;
  assert.equal(review.status, "needs_review");
});

check("E. failed validation causes zero material mutation, regardless of which precondition was unmet", () => {
  seedApprovalGuardReview();
  attemptApprove("", "");
  const state = loadClientAppState(AUTHORING_CLIENT_ID)!;
  assert.equal(state.meals[GUARD_PERIOD]?.manualName, GUARD_ORIGINAL_MANUAL_NAME, "neither missing precondition may ever let the substitution through");
  const review = state.reviewRequests.find((r) => r.id === GUARD_REVIEW_ID)!;
  assert.equal(review.status, "needs_review");
  assert.equal(review.resolutionReceipt, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
