// Phase 5.1 — height is captured as two separate wheels (feet, inches
// 0–11) rather than one "total inches" wheel nobody can mentally convert
// (see the Phase 5.1 brief's explicit "never ask the client to understand
// or select '67 inches'" requirement). Every existing consumer (nutrition
// calculations, the coach's onboarding summary) still wants a single total
// figure, so this file is the one place that derives it — new answers
// compute it from the two structured values; a pre-Phase-5.1 record that
// only ever stored a single total-inches number under the OLD "heightInches"
// key is read as a legacy fallback, never migrated in place (no stored-data
// rewrite, no risk of corrupting it — see this function's "legacy_total"
// result).
//
// Deliberately NOT reusing the key name "heightInches" for the new 0–11
// remainder value: an old record's `heightInches` already means "total
// inches" (48–84) under the pre-Phase-5.1 schema (lib/coach/
// onboarding-steps.ts's previous single-wheel field) — reusing that name
// for a 0–11 remainder would make an old record's real total-inches value
// silently misread as a nonsensical "67 inches remaining". New answers use
// `heightFeet` and `heightInchesRemainder` instead, which cannot collide
// with anything a pre-Phase-5.1 client ever stored.

import type { OnboardingStepAnswers } from "./types";

export interface ResolvedHeight {
  totalInches: number | null;
  feet: number | null;
  inchesRemainder: number | null;
  /** "structured" = answered through the new feet/inches wheels.
   * "legacy_total" = derived from an old single total-inches answer.
   * "none" = never answered either way. */
  source: "structured" | "legacy_total" | "none";
}

const LEGACY_TOTAL_INCHES_KEY = "heightInches";

export function resolveHeight(basicsAnswers: OnboardingStepAnswers | undefined): ResolvedHeight {
  const feet = basicsAnswers?.heightFeet;
  const inches = basicsAnswers?.heightInchesRemainder;
  if (typeof feet === "number" && typeof inches === "number") {
    return { totalInches: feet * 12 + inches, feet, inchesRemainder: inches, source: "structured" };
  }

  const legacyTotal = basicsAnswers?.[LEGACY_TOTAL_INCHES_KEY];
  if (typeof legacyTotal === "number") {
    return {
      totalInches: legacyTotal,
      feet: Math.floor(legacyTotal / 12),
      inchesRemainder: legacyTotal % 12,
      source: "legacy_total",
    };
  }

  return { totalInches: null, feet: null, inchesRemainder: null, source: "none" };
}

export function formatHeight(resolved: ResolvedHeight): string {
  if (resolved.feet === null || resolved.inchesRemainder === null) return "Not collected";
  return `${resolved.feet}'${resolved.inchesRemainder}"`;
}
