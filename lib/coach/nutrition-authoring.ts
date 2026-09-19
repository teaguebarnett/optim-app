// Gate 3C — coach nutrition authoring and review.
//
// Every mutation here writes directly into the target client's own AppState
// (see lib/tenancy/client-state-store.ts) rather than through the per-client
// reducer in lib/state.ts — a coach must be able to author or correct any of
// their clients' nutrition regardless of which client this browser currently
// "acts as," exactly the same reasoning lib/coach/review-lifecycle.ts already
// follows for resolving reviews, and lib/coach/setup.ts follows for
// program/nutrition setup.
//
// This never invents a second substitution contract or a second Meal Intent
// field: it only ever writes CoachMealPlanEntry (lib/coach/types.ts), which
// every client-side reader (components/meals/meal-selection-sheet.tsx,
// lib/state.ts's SELECT_MEAL_OPTION) already knows how to layer on top of
// the existing MEAL_OPTIONS catalog and BOUNDED_SUBSTITUTION_RULES — the
// exact seam lib/nutrition/substitution.ts's own module doc named as
// "a future coach-facing authoring surface."

import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import { BOUNDED_SUBSTITUTION_RULES, describeSubstitutionLog } from "../nutrition/substitution.ts";
import type { AttentionQueueItem, CoachMealPlanEntry } from "./types.ts";
import type { MacroValues, MealPeriod, MealSelection } from "../types";
import type { ClientProfileId, CoachProfileId } from "../tenancy/types";

export interface SaveCoachMealPlanEntryInput {
  clientId: ClientProfileId;
  period: MealPeriod;
  /** Trimmed to "" clears the override back to the catalog's own
   * description — never stored as an empty string standing in for "no
   * override," which would render as a blank Meal Intent. */
  mealIntentOverride: string;
  /** Omit (undefined) to mean "every ingredient-applicable rule stays
   * eligible" (Gate 3B's original behavior) — pass a real array, even an
   * empty one, only once the coach has deliberately curated this list. */
  eligibleSubstitutionRuleIds: string[] | undefined;
  coachId: CoachProfileId;
  coachName: string;
  nowIso: string;
}

export type SaveCoachMealPlanEntryResult = { ok: true } | { ok: false; reason: "not_found" };

/** Writes (or clears) one meal period's coach-authored overlay. Never
 * touches any other period's entry, and never fabricates a value for a
 * field the coach left blank. */
export function saveCoachMealPlanEntry(input: SaveCoachMealPlanEntryInput): SaveCoachMealPlanEntryResult {
  const appState = loadClientAppState(input.clientId);
  if (!appState) return { ok: false, reason: "not_found" };

  const trimmedIntent = input.mealIntentOverride.trim();
  const entry: CoachMealPlanEntry = {
    mealIntentOverride: trimmedIntent || undefined,
    eligibleSubstitutionRuleIds: input.eligibleSubstitutionRuleIds,
    updatedAtIso: input.nowIso,
    updatedByCoachId: input.coachId,
    updatedByCoachName: input.coachName,
  };

  saveClientAppState(input.clientId, {
    ...appState,
    coachMealPlan: { ...appState.coachMealPlan, [input.period]: entry },
  });
  return { ok: true };
}

export interface ApplyCoachApprovedSubstitutionInput {
  clientId: ClientProfileId;
  period: MealPeriod;
  ruleId: string;
  /** The real, known macros of the meal actually being replaced — the
   * caller resolves this from the client's own current evidence (see
   * components/coach/nutrition-review-detail-sheet.tsx) exactly the way
   * the client's own applySubstitution does; never invented here. */
  originalMacros: MacroValues;
}

export type ApplyCoachApprovedSubstitutionResult = { ok: true } | { ok: false; reason: "not_found" | "rule_not_found" };

/** The coach-side counterpart to the client's own applySubstitution
 * (components/meals/meal-selection-sheet.tsx) — logs the exact same
 * bounded, validated swap through the exact same describeSubstitutionLog
 * contract, so an approval a coach makes on a client's behalf produces a
 * record indistinguishable in shape from one the client logged themselves
 * (same "manual" source, same preserved mealIntent, same original macros —
 * never a fabricated number for the substituted food). "Who actually
 * approved this" lives on the review's own resolution receipt (see
 * lib/coach/review-lifecycle.ts's resolveReviewRequest), not duplicated
 * onto the meal record itself — a single review resolution is the one
 * place "who acted" is recorded, never a second, competing attribution
 * field on the meal. A single MealSelection object per period (see
 * lib/state.ts's own doc on this) means this overwrites whatever was
 * previously logged for the period exactly once, never appending. */
export function applyCoachApprovedSubstitution(input: ApplyCoachApprovedSubstitutionInput): ApplyCoachApprovedSubstitutionResult {
  const appState = loadClientAppState(input.clientId);
  if (!appState) return { ok: false, reason: "not_found" };
  const rule = BOUNDED_SUBSTITUTION_RULES.find((r) => r.id === input.ruleId);
  if (!rule) return { ok: false, reason: "rule_not_found" };

  const { manualName, macros, mealIntent } = describeSubstitutionLog(rule, input.originalMacros);
  const selection: MealSelection = {
    period: input.period,
    source: "manual",
    manualName,
    macros,
    isEstimate: true,
    completedAtIso: new Date().toISOString(),
    mealIntent,
  };

  saveClientAppState(input.clientId, {
    ...appState,
    meals: { ...appState.meals, [input.period]: selection },
  });
  return { ok: true };
}

/** Gate 3C correction — the exact action a resolved nutrition review
 * actually took, derived from its own existing resolution state rather than
 * a separate tracked flag. "Reviewed" comes straight from resolutionAction;
 * "Approved" is only ever true for the one whatChanged string
 * components/coach/nutrition-review-detail-sheet.tsx's own handleApprove
 * writes (nothing else ever produces that exact prefix) — anything else
 * that resolved (a decline, a redirect, an inapplicable-rule correction) is
 * a correction, and must never be labeled "Approved by {coach}". */
export function resolutionOutcomeVerb(item: Pick<AttentionQueueItem, "resolutionAction" | "resolutionReceipt">): "Approved" | "Corrected" | "Reviewed" {
  if (item.resolutionAction === "reviewed_no_change") return "Reviewed";
  return item.resolutionReceipt?.whatChanged.startsWith("Approved:") ? "Approved" : "Corrected";
}
