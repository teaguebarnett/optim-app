// Gate 3A — Bounded substitution rules.
//
// Formalizes meal substitutions as validated, bounded decisions rather than
// arbitrary suggestions. The live chat classifier (see
// lib/chat/assistant.ts and lib/mock-data.ts's SCRIPTED_CHAT_TOPICS
// "meal-substitution" entry) already answers a substitution question with a
// real, product-endorsed reply today — that existing behavior is
// deliberately left untouched by this gate (no rendered chat surface
// changes here). What was missing is a real CONTRACT behind that kind of
// answer: something that can distinguish a specific, bounded, validated
// swap from an arbitrary one, and that can say "unresolved" instead of
// guessing. This file is that contract, plus the one existing "turkey
// instead of chicken" swap re-expressed as its first real, validated entry
// — not a new product behavior, a formalization of one that already ships.
//
// Authority (whether a bounded rule may be answered automatically, drafted
// for coach approval, or escalated) is resolved entirely through the
// existing lib/coach/ai-authority.ts contract — this file adds no second
// permission model. A rule that isn't validated, or whose confidence is
// too low, is never eligible for "auto_execute" regardless of authority
// level, mirroring exactly how resolveAiActionDisposition already refuses
// to let ANY authority level auto-execute a pain/injury or out-of-bounds
// action (see that function's own doc).

import { resolveAiAction } from "../coach/ai-authority.ts";
import type { AiActionDisposition, CoachAiAuthoritySettings } from "../coach/ai-authority.ts";
import type { ClientProfileId } from "../tenancy/types";
import type { MacroValues, MealEstimateConfidence, MealIntent, MealPeriod } from "../types";

/** Who stands behind this rule's boundary/constraint. "coach" — the
 * client's own assigned coach explicitly authored or approved it (the
 * highest-trust source). "optim_bounded" — OPTIM proposed it from a
 * generic, food-science-level equivalence (e.g. "similar lean protein,
 * similar portion") that no coach has specifically reviewed for this
 * client. Never inferred from the mere existence of a rule — every
 * BoundedSubstitutionRule below states its authority explicitly. */
export type SubstitutionAuthority = "coach" | "optim_bounded";

/** Where this specific rule stands in its own validation lifecycle.
 * "validated" — safe to answer confidently, subject to the authority/
 * permission check below. "unvalidated" — a candidate rule that exists (has
 * a from/to and a stated constraint) but hasn't cleared validation; must
 * never be promoted to a confident recommendation. "insufficient_confidence"
 * — validated in shape but the underlying macro/constraint match is too
 * loose to answer confidently on its own. */
export type SubstitutionValidationStatus = "validated" | "unvalidated" | "insufficient_confidence";

/**
 * One bounded substitution decision: NOT free-form text, a concrete,
 * inspectable record of what may be swapped, under what constraint, why,
 * and by whose authority. Every field the Gate 3A brief asks for is
 * present as its own typed field — never folded into one opaque
 * explanation string, so a caller can check "is this actually validated"
 * without parsing prose.
 */
export interface BoundedSubstitutionRule {
  id: string;
  /** The meal period this applies to, when the swap is period-specific
   * (most are: a post-workout protein swap isn't the same claim as a
   * breakfast one). Null means the constraint holds regardless of period. */
  period: MealPeriod | null;
  /** What may be substituted — the original food/ingredient this rule
   * covers, in the client-facing terms a real question would use. */
  fromLabel: string;
  /** The permitted alternative. */
  toLabel: string;
  /** The permitted boundary/constraint under which the swap is acceptable
   * — e.g. "same cooked portion size; keep protein and total calories
   * within roughly 10% of the original." Never open-ended. */
  constraint: string;
  /** Why the substitution is acceptable under that constraint. */
  rationale: string;
  /** How well the constraint's macro/portion match actually holds for a
   * typical case — reuses the exact same confidence scale photo estimates
   * already use (lib/types.ts's MealEstimateConfidence), never a second,
   * competing confidence vocabulary. */
  confidence: MealEstimateConfidence;
  authority: SubstitutionAuthority;
  validation: SubstitutionValidationStatus;
}

/**
 * The formalized, real substitution guidance this product already gives —
 * re-expressed as one validated, bounded rule instead of only living as
 * SCRIPTED_CHAT_TOPICS' free-text reply (see this file's own module doc).
 * Coach-authored rules for a specific client's real AssignedNutritionPlan
 * are a later gate's concern (this array is the seam a future coach-facing
 * authoring surface would populate; nothing here invents that surface).
 */
export const BOUNDED_SUBSTITUTION_RULES: BoundedSubstitutionRule[] = [
  {
    id: "sub-chicken-turkey",
    period: null,
    fromLabel: "chicken breast",
    toLabel: "turkey breast",
    constraint: "Use a similar cooked portion size; keep the meal's protein and total calories close to the original.",
    rationale: "Both are lean, similarly dense poultry proteins with a comparable macro profile per cooked ounce.",
    confidence: "high",
    authority: "optim_bounded",
    validation: "validated",
  },
];

function normalize(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Looks up a real, registered bounded rule for a specific from/to pair —
 * never a fuzzy or partial match, and never reinterprets free-form client
 * text itself (a caller is responsible for having already resolved
 * `fromLabel`/`toLabel` to concrete food terms; this function only ever
 * answers "is THIS exact, already-identified swap a known bounded rule").
 * Returns null — an honest "unresolved," never a fabricated rule — when no
 * match exists. When `period` is given, a period-specific rule for a
 * different period is not considered a match; a period-agnostic rule
 * (period: null) matches any period.
 */
export function findBoundedSubstitution(fromLabel: string, toLabel: string, period?: MealPeriod): BoundedSubstitutionRule | null {
  const from = normalize(fromLabel);
  const to = normalize(toLabel);
  return (
    BOUNDED_SUBSTITUTION_RULES.find(
      (rule) => normalize(rule.fromLabel) === from && normalize(rule.toLabel) === to && (rule.period === null || !period || rule.period === period)
    ) ?? null
  );
}

/** Whether a rule's own validation status is even eligible to be answered
 * (automatically or via draft) at all — an explicit, exhaustive switch
 * (never an `!== "validated"` inline check) so that adding a FOURTH
 * SubstitutionValidationStatus value later fails to compile here instead of
 * silently falling through to whichever branch happens to match. */
export function isValidationEligible(status: SubstitutionValidationStatus): boolean {
  switch (status) {
    case "validated":
      return true;
    case "unvalidated":
      return false;
    case "insufficient_confidence":
      return false;
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled SubstitutionValidationStatus: ${String(_exhaustive)}`);
    }
  }
}

/**
 * The one place "what may happen with this substitution" is decided —
 * mirrors lib/coach/ai-authority.ts's resolveAiAction exactly (same
 * two-step shape: a hard safety/validity gate first, then the existing
 * authority table), because that IS the existing authority contract this
 * gate is required to reuse, not replace.
 *
 * A missing rule (null), an unvalidated (or insufficiently-confident-by-
 * status) rule, or a rule whose own declared confidence is "low" can never
 * resolve to "auto_execute" or even "draft" — they always escalate,
 * regardless of how permissive the coach's AI authority settings are,
 * exactly like resolveAiActionDisposition already refuses to let any
 * authority level auto-execute a pain/injury or out-of-bounds action. Only
 * a validated, sufficiently-confident rule ever reaches the real authority
 * check.
 */
export function resolveSubstitutionDisposition(
  rule: BoundedSubstitutionRule | null,
  settings: CoachAiAuthoritySettings,
  clientId: ClientProfileId | null
): AiActionDisposition {
  if (!rule || !isValidationEligible(rule.validation) || rule.confidence === "low") return "escalate";
  return resolveAiAction(settings, clientId, "nutrition_change", "routine", "nutrition_adjustment");
}

// ---------------------------------------------------------------------------
// Gate 3B — turning an accepted bounded rule into a real, loggable meal.
// ---------------------------------------------------------------------------

/** What logging an accepted bounded substitution actually looks like —
 * reuses the existing "manual" MealSelectionSource (see lib/state.ts's
 * SET_MANUAL_MEAL) rather than adding a sixth MealSelectionSource value:
 * mechanically it IS a client-composed entry with known macros, exactly
 * like a manual entry, and MealSelectionSource is checked directly (never
 * through an exhaustive switch) in a dozen+ existing call sites — adding a
 * new value there is the kind of broad, cross-cutting ripple this gate is
 * told to avoid. What makes an accepted substitution distinct is carried
 * honestly through fields that already exist: `mealIntent` records the
 * rule's own constraint/rationale (see lib/nutrition/view-model.ts's
 * mealProvenanceLabel, which reads a manual entry's mealIntent to label it
 * "Accepted substitution" instead of a bare "Your manual entry"), and
 * `macros` is deliberately the ORIGINAL planned meal's own real macros —
 * never a fabricated number for the substituted food — because the rule's
 * whole constraint is "keep this close to the original," and the original
 * is the only real, known value available. */
export function describeSubstitutionLog(
  rule: BoundedSubstitutionRule,
  originalMacros: MacroValues
): { manualName: string; macros: MacroValues; mealIntent: MealIntent } {
  return {
    manualName: `${rule.toLabel} (substituted for ${rule.fromLabel})`,
    macros: originalMacros,
    mealIntent: `${rule.constraint} ${rule.rationale}`,
  };
}
