// Meal-timing profiles.
//
// This estimates a broad, evidence-informed category — not a measurement of
// anyone's actual digestion. The estimate is derived from a meal option's
// existing nutrition fields (calories, fat, protein, carbs) using
// conservative, published-range heuristics (larger and higher-fat meals are
// generally recommended further from training; smaller, lower-fat meals
// tolerate a shorter window). When a selection has no usable macro data
// (e.g. a manual "something else" entry with only an estimate, or nothing
// selected yet), this falls back to the "standard" profile rather than
// inventing nutrition data that doesn't exist — see isFallback.

import type { MacroValues, MealOption } from "../types";
import type { MealTimingCategory, MealTimingProfile } from "./types";

const LIGHT_PROFILE: Omit<MealTimingProfile, "isFallback"> = {
  category: "light",
  label: "Light",
  preTrainingLeadMinLow: 30,
  preTrainingLeadMinHigh: 75,
};

const STANDARD_PROFILE: Omit<MealTimingProfile, "isFallback"> = {
  category: "standard",
  label: "Standard",
  preTrainingLeadMinLow: 75,
  preTrainingLeadMinHigh: 120,
};

const LARGER_PROFILE: Omit<MealTimingProfile, "isFallback"> = {
  category: "larger",
  label: "Larger",
  preTrainingLeadMinLow: 120,
  preTrainingLeadMinHigh: 180,
};

/** Conservative default used whenever there isn't enough data to estimate
 * from — deliberately the widest, safest window rather than a guess. */
export function fallbackMealTimingProfile(): MealTimingProfile {
  return { ...STANDARD_PROFILE, isFallback: true };
}

function categoryFromMacros(macros: MacroValues): MealTimingCategory {
  const { calories, fatG, proteinG, carbsG } = macros;
  // Higher fat and larger total calories slow gastric emptying — a real,
  // well-established (if individually variable) effect, so both push the
  // estimate toward a longer recommended lead time. This is a coarse
  // heuristic, not a metabolic calculation.
  if (calories <= 400 && fatG <= 12) return "light";
  if (calories >= 700 || fatG >= 25 || proteinG + carbsG >= 140) return "larger";
  return "standard";
}

/** Derives a timing profile for a specific meal option using its existing
 * macro fields. Portion size is approximated via total calories since the
 * app's meal data doesn't carry a separate weight/volume field. */
export function mealTimingProfileForOption(option: MealOption | null | undefined): MealTimingProfile {
  if (!option) return fallbackMealTimingProfile();
  const category = categoryFromMacros(option.macros);
  const base = category === "light" ? LIGHT_PROFILE : category === "larger" ? LARGER_PROFILE : STANDARD_PROFILE;
  return { ...base, isFallback: false };
}

/** Derives a timing profile from a manual/estimated macro entry (e.g. "I ate
 * something else"). Only used when macros were actually provided — an
 * estimate-flagged manual entry still has real numbers behind it, just
 * client-entered rather than picked from the plan's catalog. */
export function mealTimingProfileForMacros(macros: MacroValues | null | undefined): MealTimingProfile {
  if (!macros) return fallbackMealTimingProfile();
  const category = categoryFromMacros(macros);
  const base = category === "light" ? LIGHT_PROFILE : category === "larger" ? LARGER_PROFILE : STANDARD_PROFILE;
  return { ...base, isFallback: false };
}

/**
 * Given when a meal was actually logged and its timing profile, returns a
 * broad comfortable training window. Used only when the client's training
 * time is unknown ("Not sure yet") — presented as a recommendation, never a
 * countdown or deadline. See lib/planning/planner.ts.
 */
export function comfortableTrainingWindow(
  mealLoggedAtIso: string,
  profile: MealTimingProfile
): { startIso: string; endIso: string } {
  const loggedMs = new Date(mealLoggedAtIso).getTime();
  return {
    startIso: new Date(loggedMs + profile.preTrainingLeadMinLow * 60_000).toISOString(),
    endIso: new Date(loggedMs + profile.preTrainingLeadMinHigh * 60_000).toISOString(),
  };
}
