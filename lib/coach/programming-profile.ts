// Phase 5.5 — the normalized Client Programming Profile (spec Part 1).
//
// The Program Composer consumes ONLY this typed profile — never raw
// onboarding.answers scattered across the app. Built on top of (never
// duplicating) lib/coach/activation-generation.ts's existing
// ClientOnboardingSnapshot/extractClientSnapshot, which already extracts
// every field that was a hard activation requirement before this phase.
// This is a strict superset: everything extractClientSnapshot already
// requires stays required here; everything new is genuinely optional,
// carrying an explicit assumption when it's missing rather than silently
// defaulting to a guessed value the client never gave.

import { extractClientSnapshot, type ClientOnboardingSnapshot } from "./activation-generation.ts";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "./types.ts";
import type { HealthReviewRecord, OnboardingProgress, OnboardingStepAnswers } from "./types";

export type DailyActivityLevel = "mostly_sedentary" | "lightly_active" | "very_active";
export type CardioPreference = "enjoys_cardio" | "neutral_on_cardio" | "avoids_cardio";

export interface ClientProgrammingProfile extends ClientOnboardingSnapshot {
  // -- Training age / consistency (starting_point) -----------------------
  recentConsistency: "not_recently" | "inconsistent" | "fairly_consistent" | "very_consistent" | "unknown";
  recentWeeklyFrequency: number | null;
  /** Free-text real client language — never structured/guessed — covering
   * spec's "exercises the client enjoys" / "dislikes or will not perform" /
   * general training notes. Null means the client left it blank. */
  trainingNotes: string | null;

  // -- Schedule realism (your_week) ---------------------------------------
  schedulePredictability: "mostly_predictable" | "changes_weekly" | "shift_or_travel" | "unknown";
  preferredTrainingTimes: string[];
  scheduleContext: string | null;
  /** Assumed "lightly_active" when the client left this optional question
   * blank — see ClientProgrammingProfile's own assumption reporting via
   * resolveProgrammingProfileReadiness. */
  dailyActivityLevel: DailyActivityLevel;
  dailyActivityLevelIsAssumed: boolean;

  // -- Recovery / cardio (fuel_recovery) -----------------------------------
  typicalSleep: "under_6" | "6_7" | "7_8" | "more_than_8" | "unknown";
  consistencyObstacles: string[];
  coachSupportStyle: string[];
  cardioPreference: CardioPreference;
  cardioPreferenceIsAssumed: boolean;

  // -- Health / movement restrictions (health_finish) ----------------------
  hasCurrentInjury: boolean;
  injuryBodyAreas: string[];
  /** The client's own reported restriction detail, plus (appended, when
   * present) the coach's own documented limitation recorded while
   * resolving a health review with "Proceed with documented limitations" —
   * see HealthReviewRecord.documentedLimitations. Both flow into the same
   * field so a real coach-recorded boundary reaches the same planning
   * constraints as a client-reported one, rather than living only on a
   * separate record nothing downstream reads. */
  injuryRestrictions: string | null;
  requiresHealthReview: boolean;
  healthReviewResolved: boolean | "no_review_needed";

  // -- Goal (what_you_want) -------------------------------------------------
  /** Phase 5.6A.1 — the client's own written answer when primaryGoal is
   * "something_else"; null otherwise (including when they picked "Something
   * else" but left the detail blank). Kept alongside primaryGoal — inherited
   * unchanged from ClientOnboardingSnapshot — rather than replacing it, so
   * every existing goal-matching check in the generation engine keeps
   * comparing against the real enum value. */
  primaryGoalOther: string | null;
}

function readAnswers(onboarding: OnboardingProgress, step: string): OnboardingStepAnswers {
  return (onboarding.answers as Record<string, OnboardingStepAnswers | undefined>)[step] ?? {};
}

export type ExtractProfileResult = { profile: ClientProgrammingProfile } | { missing: string[] };

/**
 * Extends extractClientSnapshot's existing critical-field gate with the
 * richer programming-specific facts — never blocks on any of the NEW
 * fields (they're all optional, with an honestly-flagged assumption when
 * absent), only on whatever extractClientSnapshot already required.
 */
export function extractClientProgrammingProfile(onboarding: OnboardingProgress | null, healthReview: HealthReviewRecord | null): ExtractProfileResult {
  const base = extractClientSnapshot(onboarding);
  if ("missing" in base) return base;
  if (!onboarding) return { missing: ["Onboarding has not been completed yet."] };

  const goals = readAnswers(onboarding, "what_you_want");
  const start = readAnswers(onboarding, "starting_point");
  const week = readAnswers(onboarding, "your_week");
  const fuel = readAnswers(onboarding, "fuel_recovery");
  const health = readAnswers(onboarding, "health_finish");

  const primaryGoalOther = goals.primaryGoal === "something_else" && typeof goals.primaryGoalOther === "string" && goals.primaryGoalOther.trim() ? goals.primaryGoalOther.trim() : null;

  const recentConsistency = typeof start.recentConsistency === "string" ? (start.recentConsistency as ClientProgrammingProfile["recentConsistency"]) : "unknown";
  const recentWeeklyFrequency = typeof start.weeklyFrequency === "number" ? start.weeklyFrequency : null;
  const trainingNotes = typeof start.trainingNotes === "string" && start.trainingNotes.trim() ? start.trainingNotes.trim() : null;

  const schedulePredictability = typeof week.schedulePredictability === "string" ? (week.schedulePredictability as ClientProgrammingProfile["schedulePredictability"]) : "unknown";
  const preferredTrainingTimes = Array.isArray(week.preferredTrainingTime) ? (week.preferredTrainingTime as string[]) : [];
  const scheduleContext = typeof week.scheduleContext === "string" && week.scheduleContext.trim() ? week.scheduleContext.trim() : null;
  const dailyActivityLevelIsAssumed = typeof week.dailyActivityLevel !== "string";
  const dailyActivityLevel: DailyActivityLevel = dailyActivityLevelIsAssumed ? "lightly_active" : (week.dailyActivityLevel as DailyActivityLevel);

  const typicalSleep = typeof fuel.typicalSleep === "string" ? (fuel.typicalSleep as ClientProgrammingProfile["typicalSleep"]) : "unknown";
  const consistencyObstacles = Array.isArray(fuel.consistencyObstacles) ? (fuel.consistencyObstacles as string[]) : [];
  const coachSupportStyle = Array.isArray(fuel.coachSupportStyle) ? (fuel.coachSupportStyle as string[]) : [];
  const cardioPreferenceIsAssumed = typeof fuel.cardioPreference !== "string";
  const cardioPreference: CardioPreference = cardioPreferenceIsAssumed ? "neutral_on_cardio" : (fuel.cardioPreference as CardioPreference);

  const injuryBodyAreas = Array.isArray(health.injuryBodyAreas) ? (health.injuryBodyAreas as string[]) : [];
  const clientReportedRestriction = typeof health.injuryRestrictions === "string" && health.injuryRestrictions.trim() ? health.injuryRestrictions.trim() : null;
  const coachDocumentedLimitation = healthReview?.documentedLimitations?.trim() || null;
  const injuryRestrictions = [clientReportedRestriction, coachDocumentedLimitation].filter((v): v is string => !!v).join(" ") || null;
  // A coach's own documented limitation (from a real "Proceed with
  // limitations" decision) is a genuine current restriction even when the
  // client's original onboarding never flagged an injury — e.g. an injury
  // that happened during training, reported and reviewed after intake. See
  // program-directions.ts's avoidedTermsForProfile, which is gated on this
  // flag before it will act on either injuryBodyAreas or injuryRestrictions.
  const hasCurrentInjury = health.hasInjuryHistory === true || !!coachDocumentedLimitation;

  const profile: ClientProgrammingProfile = {
    ...base.snapshot,
    primaryGoalOther,
    recentConsistency,
    recentWeeklyFrequency,
    trainingNotes,
    schedulePredictability,
    preferredTrainingTimes,
    scheduleContext,
    dailyActivityLevel,
    dailyActivityLevelIsAssumed,
    typicalSleep,
    consistencyObstacles,
    coachSupportStyle,
    cardioPreference,
    cardioPreferenceIsAssumed,
    hasCurrentInjury,
    injuryBodyAreas,
    injuryRestrictions,
    requiresHealthReview: !!healthReview,
    healthReviewResolved: healthReview ? RESOLVED_HEALTH_REVIEW_STATUSES.has(healthReview.status) : "no_review_needed",
  };

  return { profile };
}

// ---------------------------------------------------------------------------
// Intake completeness resolver (spec Part 1's "Intake completeness")
// ---------------------------------------------------------------------------

export type ProgrammingReadinessStatus = "ready" | "ready_with_assumptions" | "blocked" | "needs_coach_review";

export interface ProgrammingReadiness {
  status: ProgrammingReadinessStatus;
  /** Set only when status is "blocked" — the one concrete missing fact
   * (never a generic checklist dump) plus a targeted next action. */
  blockingQuestion?: string;
  missing?: string[];
  /** Set only when status is "ready_with_assumptions" — every real
   * assumption OPTIM made, in plain language. */
  assumptions: string[];
  /** Set only when status is "needs_coach_review". */
  reviewReason?: string;
}

/**
 * Never silently invents missing client facts (spec Part 1's own explicit
 * rule) — classifies the profile into exactly one of four honest states.
 * "needs_coach_review" always wins over "ready_with_assumptions": a real
 * unresolved health/safety concern blocks smooth generation even if every
 * other field is present.
 */
export function resolveProgrammingProfileReadiness(result: ExtractProfileResult): ProgrammingReadiness {
  if ("missing" in result) {
    return {
      status: "blocked",
      blockingQuestion: result.missing[0],
      missing: result.missing,
      assumptions: [],
    };
  }

  const { profile } = result;

  if (profile.hasCurrentInjury && profile.healthReviewResolved === false) {
    return {
      status: "needs_coach_review",
      reviewReason: `${profile.injuryBodyAreas.join(", ") || "A reported limitation"} needs your review before OPTIM generates a program.`,
      assumptions: [],
    };
  }

  const assumptions: string[] = [];
  if (profile.dailyActivityLevelIsAssumed) assumptions.push("Assumed a moderately active daily lifestyle outside training (not answered).");
  if (profile.cardioPreferenceIsAssumed) assumptions.push("Assumed a neutral cardio preference (not answered).");
  if (profile.recentConsistency === "unknown") assumptions.push("Recent training consistency wasn't reported — assumed moderate.");

  return {
    status: assumptions.length > 0 ? "ready_with_assumptions" : "ready",
    assumptions,
  };
}
