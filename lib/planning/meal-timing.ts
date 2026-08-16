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
  preTrainingLeadMinLow: 45,
  preTrainingLeadMinHigh: 90,
};

const MEDIUM_PROFILE: Omit<MealTimingProfile, "isFallback"> = {
  category: "medium",
  label: "Medium",
  preTrainingLeadMinLow: 90,
  preTrainingLeadMinHigh: 150,
};

const HEAVY_PROFILE: Omit<MealTimingProfile, "isFallback"> = {
  category: "heavy",
  label: "Heavy",
  preTrainingLeadMinLow: 150,
  preTrainingLeadMinHigh: 210,
};

const PROFILES_BY_CATEGORY: Record<MealTimingCategory, Omit<MealTimingProfile, "isFallback">> = {
  light: LIGHT_PROFILE,
  medium: MEDIUM_PROFILE,
  heavy: HEAVY_PROFILE,
};

/** Conservative default used whenever there isn't enough data to estimate
 * from — deliberately the widest, safest window rather than a guess. */
export function fallbackMealTimingProfile(): MealTimingProfile {
  return { ...MEDIUM_PROFILE, isFallback: true };
}

/** Classifies a meal's digestive load from its existing macro fields. Higher
 * fat and larger total calories slow gastric emptying — a real,
 * well-established (if individually variable) effect, so both push the
 * estimate toward a longer recommended lead time. This is a coarse
 * heuristic, not a metabolic calculation. Exported so lib/planning/
 * meal-schedule.ts can classify every meal in the day using the same rule. */
export function categoryFromMacros(macros: MacroValues): MealTimingCategory {
  const { calories, fatG, proteinG, carbsG } = macros;
  if (calories <= 400 && fatG <= 12) return "light";
  if (calories >= 700 || fatG >= 25 || proteinG + carbsG >= 140) return "heavy";
  return "medium";
}

/** Derives a timing profile for a specific meal option using its existing
 * macro fields. Portion size is approximated via total calories since the
 * app's meal data doesn't carry a separate weight/volume field. */
export function mealTimingProfileForOption(option: MealOption | null | undefined): MealTimingProfile {
  if (!option) return fallbackMealTimingProfile();
  return { ...PROFILES_BY_CATEGORY[categoryFromMacros(option.macros)], isFallback: false };
}

/** Derives a timing profile from a manual/estimated macro entry (e.g. "I ate
 * something else"). Only used when macros were actually provided — an
 * estimate-flagged manual entry still has real numbers behind it, just
 * client-entered rather than picked from the plan's catalog. */
export function mealTimingProfileForMacros(macros: MacroValues | null | undefined): MealTimingProfile {
  if (!macros) return fallbackMealTimingProfile();
  return { ...PROFILES_BY_CATEGORY[categoryFromMacros(macros)], isFallback: false };
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
