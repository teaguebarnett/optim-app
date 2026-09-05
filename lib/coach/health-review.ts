// The one pure function that decides whether a submitted intake needs a
// coach's health review before activation. Deliberately NOT a diagnosis
// and NOT a clearance decision: it only ever asks "did the client's own
// answer say yes to something the coach should look at before finalizing
// training." Every reason string traces to one specific submitted answer,
// never an inference.
//
// Phase 5.2 — reads the live six-chapter intake's "health_finish" shape
// (a single injury capture + one multi-select safety screen, rather than
// Phase 5.1's eight separate safety booleans). A pre-Phase-5.2 record's
// "health"/"health_readiness" bag is handled by
// computeLegacyHealthReviewRequired below, called only for a record still
// in that older shape — see lib/coach/platform-store.ts's
// COMPLETE_ONBOARDING.

import type { OnboardingStepAnswers } from "./types";

export interface HealthReviewTrigger {
  required: boolean;
  reasons: string[];
}

const SAFETY_SCREEN_LABELS: Record<string, string> = {
  cardiovascular: "Flagged a known cardiovascular condition or concerning symptoms.",
  chest_dizziness: "Flagged unexplained chest pain, dizziness, or fainting.",
  blood_pressure: "Flagged blood-pressure concerns.",
  joint_muscular: "Flagged a bone, joint, or muscular problem activity may worsen.",
  medication_condition: "Flagged medication or a medical condition that may affect exercise.",
  advised_limit: "Flagged being advised to limit or avoid exercise.",
};

const INJURY_AREA_LABELS: Record<string, string> = {
  shoulder: "shoulder",
  upper_back: "upper back",
  lower_back: "lower back",
  hip: "hip",
  knee: "knee",
  ankle_foot: "ankle/foot",
  wrist_elbow: "wrist/elbow",
  neck: "neck",
  other: "other",
};

/** A short, human "shoulder, knee" summary of where it hurts — reads the
 * live "injuryBodyAreas" multi-select (Phase 5.3A), substituting the
 * client's own free-text detail for "other", and falls back to a
 * pre-5.3A record's single "injuryBodyArea" string so an
 * already-completed client's real answer is never dropped. */
export function describeInjuryBodyAreas(healthAnswers: OnboardingStepAnswers): string {
  const areas = Array.isArray(healthAnswers.injuryBodyAreas) ? (healthAnswers.injuryBodyAreas as string[]) : [];
  if (areas.length > 0) {
    return areas
      .map((a) => (a === "other" && typeof healthAnswers.injuryBodyAreaOther === "string" && healthAnswers.injuryBodyAreaOther ? healthAnswers.injuryBodyAreaOther : (INJURY_AREA_LABELS[a] ?? a)))
      .join(", ");
  }
  if (typeof healthAnswers.injuryBodyArea === "string" && healthAnswers.injuryBodyArea) return healthAnswers.injuryBodyArea;
  return "";
}

export function computeHealthReviewRequired(healthAnswers: OnboardingStepAnswers | undefined): HealthReviewTrigger {
  if (!healthAnswers) return { required: false, reasons: [] };

  const reasons: string[] = [];

  if (healthAnswers.hasInjuryHistory === true) {
    const area = describeInjuryBodyAreas(healthAnswers);
    reasons.push(`Reported a current pain, injury, or physical limitation${area ? ` (${area})` : ""}.`);
  }

  const safetyScreen = Array.isArray(healthAnswers.safetyScreen) ? (healthAnswers.safetyScreen as string[]) : [];
  for (const value of safetyScreen) {
    if (value === "none") continue;
    const reason = SAFETY_SCREEN_LABELS[value];
    if (reason) reasons.push(reason);
  }

  return { required: reasons.length > 0, reasons };
}

/** Phase 5.1's eight-separate-booleans shape — used only when a record
 * still carries that era's "health" (or the original "health_readiness")
 * bag instead of the live "health_finish" one. */
const LEGACY_SAFETY_SCREEN_REASONS: Record<string, string> = {
  safetyHeartCondition: "Reported a heart or cardiovascular condition that needs exercise guidance.",
  safetyChestDiscomfortActivity: "Reported chest discomfort during physical activity.",
  safetyChestDiscomfortRest: "Reported chest discomfort at rest.",
  safetyDizzinessFainting: "Reported dizziness, fainting, or loss of consciousness.",
  safetyBoneJointIssue: "Reported a bone, joint, or soft-tissue issue activity may worsen.",
  safetyHeartMedication: "Reported taking medication prescribed for a heart or blood-pressure condition.",
  safetyProfessionalRestriction: "Reported professional instructions limiting exercise.",
  safetyOtherConcern: "Flagged another reason to seek professional guidance before increasing activity.",
};

export function computeLegacyHealthReviewRequired(healthAnswers: OnboardingStepAnswers | undefined): HealthReviewTrigger {
  if (!healthAnswers) return { required: false, reasons: [] };
  const reasons: string[] = [];
  if (healthAnswers.hasInjuryHistory === true) reasons.push("Reported a current pain, injury, or recurring physical issue.");
  if (healthAnswers.hasDiagnosedCondition === true) reasons.push("Reported a diagnosed medical condition relevant to exercise, recovery, or nutrition.");
  if (healthAnswers.takesRelevantMedication === true) reasons.push("Reported taking medication that may affect training, heart rate, or recovery.");
  if (healthAnswers.hasSignificantSurgeryHistory === true) reasons.push("Reported a significant surgery history.");
  if (healthAnswers.hasExerciseRestriction === true) reasons.push("Reported a professional exercise restriction.");
  for (const [key, reason] of Object.entries(LEGACY_SAFETY_SCREEN_REASONS)) {
    if (healthAnswers[key] === true) reasons.push(reason);
  }
  return { required: reasons.length > 0, reasons };
}
