// Validation for coach-entered nutrition targets on the live client
// workspace's "Create, publish & assign" form (components/coach/
// live-nutrition-assignment-form.tsx) and, as a server-side backstop, for
// app/actions/production-programs.ts's createPublishAndAssignNutritionAction.
//
// That form used to pre-fill 2200 kcal / 160g / 220g / 70g as hardcoded
// defaultValues (and the submit handler fell back to the same numbers), so a
// client with no nutrition assigned looked like it had targets, and a blank
// field submitted as Number("") = 0. Every value here must be explicitly
// entered: an empty field is reported as missing, never defaulted. Pure — no
// React, no Supabase — tested by lib/coach/verify-nutrition-targets-input.mts.

import type { NutritionTargets } from "../types.ts";

export const NUTRITION_TARGET_FIELDS = [
  { key: "calories", label: "Calories", min: 500, max: 10000 },
  { key: "proteinG", label: "Protein", min: 0, max: 1000 },
  { key: "carbsG", label: "Carbs", min: 0, max: 1000 },
  { key: "fatG", label: "Fat", min: 0, max: 1000 },
] as const satisfies ReadonlyArray<{ key: keyof NutritionTargets; label: string; min: number; max: number }>;

export type NutritionTargetsParseResult = { ok: true; targets: NutritionTargets } | { ok: false; message: string };

function checkValue(label: string, value: number, min: number, max: number): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return `${label} must be a whole number.`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/** Parses raw form values (strings, or null when a field is absent). A
 * blank/whitespace field is missing — never coerced to 0 or a default. */
export function parseNutritionTargetsInput(raw: Record<keyof NutritionTargets, unknown>): NutritionTargetsParseResult {
  const missing: string[] = [];
  const errors: string[] = [];
  const targets: Partial<NutritionTargets> = {};

  for (const field of NUTRITION_TARGET_FIELDS) {
    const value = raw[field.key];
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") {
      missing.push(field.label);
      continue;
    }
    const num = Number(text);
    const error = checkValue(field.label, num, field.min, field.max);
    if (error) errors.push(error);
    else targets[field.key] = num;
  }

  if (missing.length > 0) {
    return { ok: false, message: `Enter ${missing.join(", ")} before assigning — nothing was saved.` };
  }
  if (errors.length > 0) return { ok: false, message: errors.join(" ") };
  return { ok: true, targets: targets as NutritionTargets };
}

/** Server-side backstop for already-numeric input: same rules, so no caller
 * can persist a missing/NaN/out-of-range target by bypassing the form. */
export function validateNutritionTargets(input: Record<keyof NutritionTargets, unknown>): NutritionTargetsParseResult {
  const errors: string[] = [];
  for (const field of NUTRITION_TARGET_FIELDS) {
    const value = input[field.key];
    if (typeof value !== "number") {
      errors.push(`${field.label} is missing.`);
      continue;
    }
    const error = checkValue(field.label, value, field.min, field.max);
    if (error) errors.push(error);
  }
  if (errors.length > 0) return { ok: false, message: errors.join(" ") };
  return {
    ok: true,
    targets: { calories: input.calories as number, proteinG: input.proteinG as number, carbsG: input.carbsG as number, fatG: input.fatG as number },
  };
}

/** True when two target sets are identical — used to refuse publishing a
 * nutrition version that duplicates the one already assigned. */
export function nutritionTargetsEqual(a: NutritionTargets, b: NutritionTargets): boolean {
  return a.calories === b.calories && a.proteinG === b.proteinG && a.carbsG === b.carbsG && a.fatG === b.fatG;
}
