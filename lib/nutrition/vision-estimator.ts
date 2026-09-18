// ---------------------------------------------------------------------------
// Meal photo vision-estimation boundary.
//
// `MealVisionEstimator` is the one typed seam a real production integration
// connects through. To wire up a real backend:
//   1. Implement MealVisionEstimator against the real endpoint — upload the
//      image, map its response into MealAnalysisResult (status/confidence/
//      items, each item with a name, quantityLabel, and MacroValues).
//   2. Point `activeMealVisionEstimator` at that implementation instead of
//      `localDemoMealVisionEstimator` below (env-gated if the real endpoint
//      isn't always available).
// No other file in the nutrition feature needs to change — every caller
// (see components/nutrition/photo/photo-meal-flow.tsx) only ever imports
// `activeMealVisionEstimator`, never a concrete implementation directly.
//
// `localDemoMealVisionEstimator` below is a deterministic, offline stand-in
// — never a real analysis, never described to the client as one (every
// surface that shows its result labels it "OPTIM estimate" and asks the
// client to review it — see photo-meal-flow.tsx). It never sends the image
// anywhere and never logs its bytes/name.
// ---------------------------------------------------------------------------

import { nextId } from "../state.ts";
import { resolveAiAction } from "../coach/ai-authority.ts";
import type { AiActionDisposition, CoachAiAuthoritySettings } from "../coach/ai-authority.ts";
import type { ClientProfileId } from "../tenancy/types";
import type { MacroValues, MealEstimateConfidence, MealEstimateItem, MealSelection } from "../types";

export type MealAnalysisStatus = "ok" | "low-confidence" | "unrecognized";

export interface MealAnalysisResult {
  status: MealAnalysisStatus;
  confidence: MealEstimateConfidence;
  items: MealEstimateItem[];
  /** Client-facing context for a low-confidence or unrecognized result —
   * never present for a plain "ok" result. */
  note?: string;
}

export interface MealVisionEstimator {
  estimate(image: File): Promise<MealAnalysisResult>;
}

function macro(calories: number, proteinG: number, carbsG: number, fatG: number): MacroValues {
  return { calories, proteinG, carbsG, fatG };
}

interface DemoTemplateItem {
  name: string;
  quantityLabel: string;
  macros: MacroValues;
}

const DEMO_CATALOG: DemoTemplateItem[][] = [
  [
    { name: "Grilled chicken breast", quantityLabel: "6 oz", macros: macro(280, 52, 0, 6) },
    { name: "White rice", quantityLabel: "1 cup", macros: macro(205, 4, 45, 0) },
    { name: "Steamed broccoli", quantityLabel: "1 cup", macros: macro(55, 4, 11, 1) },
  ],
  [
    { name: "Scrambled eggs", quantityLabel: "3 eggs", macros: macro(234, 19, 2, 16) },
    { name: "Sourdough toast", quantityLabel: "2 slices", macros: macro(180, 7, 33, 2) },
    { name: "Avocado", quantityLabel: "1/2", macros: macro(120, 1, 6, 11) },
  ],
  [
    { name: "Salmon fillet", quantityLabel: "6 oz", macros: macro(310, 40, 0, 16) },
    { name: "Roasted potatoes", quantityLabel: "1 cup", macros: macro(160, 3, 30, 4) },
  ],
  [
    { name: "Greek yogurt", quantityLabel: "1 cup", macros: macro(150, 20, 9, 4) },
    { name: "Mixed berries", quantityLabel: "1/2 cup", macros: macro(40, 0, 10, 0) },
    { name: "Granola", quantityLabel: "1/4 cup", macros: macro(120, 3, 18, 4) },
  ],
];

/** A simple deterministic hash so the SAME photo always produces the SAME
 * demo outcome (useful for QA), while different real photos (different real
 * file size/lastModified) still exercise every outcome branch below. Not a
 * cryptographic hash, and never used as one. */
function pseudoRandomUnit(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const ANALYSIS_DELAY_MS = 1100;

// Outcome thresholds for the demo estimator only — a real backend has no
// notion of these at all.
const ERROR_THRESHOLD = 0.03;
const UNRECOGNIZED_THRESHOLD = 0.1;
const LOW_CONFIDENCE_THRESHOLD = 0.32;
const HIGH_CONFIDENCE_THRESHOLD = 0.6;

export const localDemoMealVisionEstimator: MealVisionEstimator = {
  async estimate(image: File): Promise<MealAnalysisResult> {
    await new Promise((resolve) => setTimeout(resolve, ANALYSIS_DELAY_MS));

    const seed = image.size + image.lastModified;
    const roll = pseudoRandomUnit(seed);

    if (roll < ERROR_THRESHOLD) {
      // Simulates a genuine analysis failure (e.g. a network/service error)
      // distinct from a legible-but-unidentifiable photo below.
      throw new Error("Analysis service did not respond.");
    }

    if (roll < UNRECOGNIZED_THRESHOLD) {
      return {
        status: "unrecognized",
        confidence: "low",
        items: [],
        note: "Couldn't confidently identify the food in this photo. Try a clearer, well-lit photo, or enter this meal manually.",
      };
    }

    const catalogIndex = Math.floor(pseudoRandomUnit(seed + 1) * DEMO_CATALOG.length) % DEMO_CATALOG.length;
    const items: MealEstimateItem[] = DEMO_CATALOG[catalogIndex].map((item) => ({
      id: nextId("estimate-item"),
      name: item.name,
      quantityLabel: item.quantityLabel,
      macros: item.macros,
    }));

    if (roll < LOW_CONFIDENCE_THRESHOLD) {
      return {
        status: "low-confidence",
        confidence: "low",
        items,
        note: "This estimate has lower confidence — check quantities and items before confirming.",
      };
    }

    return {
      status: "ok",
      confidence: roll < HIGH_CONFIDENCE_THRESHOLD ? "medium" : "high",
      items,
    };
  },
};

/** The estimator every nutrition-feature caller uses. Swap this single
 * export for a real backend-backed implementation to go live — see the
 * module doc above. */
export const activeMealVisionEstimator: MealVisionEstimator = localDemoMealVisionEstimator;

// ---------------------------------------------------------------------------
// Gate 3A — photo estimates remain uncertain evidence.
//
// A confirmed photo-estimate MealSelection is real evidence the client
// reviewed and approved (see LOG_PHOTO_MEAL in lib/state.ts) — but it is
// still an estimate, never promoted to the same certainty as a coach-
// approved catalog pick or the client's own precise manual entry. These two
// helpers make that distinction load-bearing rather than merely a naming
// convention: one for "is this specific logged meal still marked
// uncertain," one for "what may happen automatically with evidence at this
// confidence level" — reusing lib/coach/ai-authority.ts's existing
// resolveAiAction exactly as lib/nutrition/substitution.ts's
// resolveSubstitutionDisposition does, never a second permission model.
// ---------------------------------------------------------------------------

/** True for any meal selection that is not a confirmed-exact record — a
 * photo estimate (regardless of confidence) or a client's own manual
 * estimate (MealSelection.isEstimate). A coach-approved catalog option is
 * the one source this returns false for: its macros are the plan's own
 * known values, not an estimate of anything. */
export function isUncertainMealSelection(selection: MealSelection | undefined): boolean {
  if (!selection) return false;
  return selection.source === "photo-estimate" || selection.isEstimate === true;
}

/**
 * What may happen automatically with a photo estimate at this confidence —
 * same two-step shape as resolveSubstitutionDisposition: a hard confidence
 * gate first (low confidence, or a status that never reaches a real
 * estimate at all, always escalates — no authority level can override
 * that), then the existing authority table for anything confident enough
 * to be eligible. `status` "unrecognized" (no usable evidence — see
 * MealAnalysisResult) always escalates regardless of the confidence field,
 * since there is no real estimate behind it to act on.
 */
export function resolvePhotoEstimateDisposition(
  status: MealAnalysisStatus,
  confidence: MealEstimateConfidence,
  settings: CoachAiAuthoritySettings,
  clientId: ClientProfileId | null
): AiActionDisposition {
  if (status === "unrecognized" || confidence === "low") return "escalate";
  return resolveAiAction(settings, clientId, "nutrition_change", "routine", "nutrition_adjustment");
}
