// Phase 5.4B completion pass — the pre-activation "Activation Brief" (spec
// §4.2/§6): a deterministic, at-most-three-sentence summary built directly
// from the client's real onboarding answers and real activation-readiness
// state — never a dump of every intake answer (that's what "View full
// intake," gating the existing CoachBrief, is for). Reuses the exact same
// onboarding field defs/formatters CoachBrief already uses so the two
// surfaces can never describe the same answer two different ways.

import { ONBOARDING_STEPS, type OnboardingStepDef } from "./onboarding-steps.ts";
import { formatFieldValue, describePrimaryGoal, NOT_PROVIDED } from "./onboarding-format.ts";
import { describeInjuryBodyAreas } from "./health-review.ts";
import type { ActivationReadiness, ClientIntendedProgram, HealthReviewRecord, OnboardingProgress, OnboardingStepAnswers, OnboardingStepId } from "./types";
import type { ProgramEnrollment } from "../scheduling/types";

function stepAnswers(onboarding: OnboardingProgress | null, id: OnboardingStepId): OnboardingStepAnswers | undefined {
  return onboarding?.answers[id];
}

function fieldValue(steps: OnboardingStepDef[], answers: OnboardingStepAnswers | undefined, stepId: string, key: string): string {
  const field = steps.find((s) => s.id === stepId)?.fields.find((f) => f.key === key);
  if (!field) return NOT_PROVIDED;
  return formatFieldValue(field, answers?.[key]);
}

function formatStartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export interface ActivationBriefInput {
  clientFirstName: string;
  onboarding: OnboardingProgress | null;
  intendedProgram: ClientIntendedProgram | null;
  /** The real, already-enrolled program (once coach setup has run at least
   * once) — takes priority over intendedProgram's own start-date/duration
   * intent, since it's the authoritative, current value. */
  programEnrollment: ProgramEnrollment | null;
  readiness: ActivationReadiness;
}

/**
 * Builds the pre-activation Activation Brief as real, structured sentences
 * — never fabricated, never more than three, always traceable to a real
 * onboarding answer or a real readiness requirement. Returns an honest
 * fallback (never an empty brief) when onboarding hasn't happened yet.
 */
export function buildActivationBriefSentences(input: ActivationBriefInput): string[] {
  const { clientFirstName, onboarding, intendedProgram, programEnrollment, readiness } = input;

  if (!onboarding?.completedAtIso) {
    return [`${clientFirstName} hasn't completed onboarding yet — the Activation Brief will populate once their intake is submitted.`];
  }

  const goals = stepAnswers(onboarding, "what_you_want");
  const week = stepAnswers(onboarding, "your_week");
  const health = stepAnswers(onboarding, "health_finish");

  const goal = describePrimaryGoal(ONBOARDING_STEPS, goals);
  const startDateIso = programEnrollment?.startDateIso ?? intendedProgram?.intendedStartDateIso;
  const durationWeeks = programEnrollment?.durationWeeks ?? intendedProgram?.intendedDurationWeeks;

  const sentence1 =
    startDateIso && durationWeeks
      ? `${clientFirstName} is preparing for a ${durationWeeks}-week ${goal !== NOT_PROVIDED ? goal.toLowerCase() : "training"} program beginning ${formatStartDate(startDateIso)}.`
      : `${clientFirstName} is preparing to start${goal !== NOT_PROVIDED ? ` a ${goal.toLowerCase()} program` : ""}, but no start date has been set yet.`;

  const availableDays = Array.isArray(week?.availableDays) ? (week!.availableDays as string[]) : [];
  const sessionLength = fieldValue(ONBOARDING_STEPS, week, "your_week", "maxSessionLength");
  const environment = fieldValue(ONBOARDING_STEPS, week, "your_week", "trainingEnvironment");
  const sentence2 =
    availableDays.length > 0
      ? `They can train ${availableDays.length} days weekly for approximately ${sessionLength.toLowerCase()} using ${environment.toLowerCase()}.`
      : "Their weekly training availability hasn't been recorded yet.";

  const hasInjury = health?.hasInjuryHistory === true;
  const firstUnmet = readiness.requirements.find((r) => !r.met);
  let sentence3: string;
  if (hasInjury && health) {
    const area = describeInjuryBodyAreas(health) || "reported";
    sentence3 = firstUnmet
      ? `Review their ${area} limitation, then ${(firstUnmet.actionLabel ?? firstUnmet.label).toLowerCase()} to complete activation.`
      : `Review their ${area} limitation — every other activation requirement is already met.`;
  } else if (firstUnmet) {
    sentence3 = `${firstUnmet.actionLabel ?? firstUnmet.label} to complete activation.`;
  } else {
    sentence3 = `Every requirement is met — ${clientFirstName} is ready to activate.`;
  }

  return [sentence1, sentence2, sentence3];
}

// ---------------------------------------------------------------------------
// Phase 5.6A.1 — the OPTIM Client Brief: one coherent synthesis, not a
// second copy of raw intake fields (spec Part 1's "Primary client brief").
// ---------------------------------------------------------------------------

export interface OptimClientBrief {
  primaryOutcome: string;
  secondaryOutcomes: string | null;
  trainingFit: string;
  nutritionReality: string;
  /** Only populated when there's something that materially affects
   * programming (a flagged health-review concern) — never a generic
   * "nothing to report" filler line, per spec's "only information that
   * materially affects programming." */
  readinessAndSafety: string | null;
  startDateLabel: string;
}

/**
 * Synthesizes the client's real onboarding answers into the one coherent
 * brief the post-intake client page leads with — never a second dump of
 * raw fields (that's what the "View full intake" disclosure is for). Every
 * value here traces to a real submitted answer; a custom "Something else"
 * goal shows the client's own written text (see describePrimaryGoal), never
 * the useless option label.
 */
export function buildOptimClientBrief(input: {
  onboarding: OnboardingProgress | null;
  intendedProgram: ClientIntendedProgram | null;
  programEnrollment: ProgramEnrollment | null;
  healthReview: HealthReviewRecord | null;
}): OptimClientBrief | null {
  const { onboarding, intendedProgram, programEnrollment, healthReview } = input;
  if (!onboarding?.completedAtIso) return null;

  const goals = stepAnswers(onboarding, "what_you_want");
  const week = stepAnswers(onboarding, "your_week");
  const start = stepAnswers(onboarding, "starting_point");
  const fuel = stepAnswers(onboarding, "fuel_recovery");
  const health = stepAnswers(onboarding, "health_finish");

  const goal = describePrimaryGoal(ONBOARDING_STEPS, goals);
  const successDefinition = typeof goals?.successDefinition === "string" ? goals.successDefinition.trim() : "";
  const primaryOutcome = successDefinition ? `${goal} — ${successDefinition}` : goal;

  const secondaryGoalsRaw = Array.isArray(goals?.secondaryGoals) ? (goals!.secondaryGoals as string[]) : [];
  const secondaryOutcomes = secondaryGoalsRaw.length > 0 ? fieldValue(ONBOARDING_STEPS, goals, "what_you_want", "secondaryGoals") : null;

  const availableDays = Array.isArray(week?.availableDays) ? (week!.availableDays as string[]) : [];
  const experience = start ? fieldValue(ONBOARDING_STEPS, start, "starting_point", "trainingExperience") : NOT_PROVIDED;
  const sessionLength = week ? fieldValue(ONBOARDING_STEPS, week, "your_week", "maxSessionLength") : NOT_PROVIDED;
  const environment = week ? fieldValue(ONBOARDING_STEPS, week, "your_week", "trainingEnvironment") : NOT_PROVIDED;
  const trainingFit =
    availableDays.length > 0
      ? `${experience} · ${availableDays.length} days/week, up to ${sessionLength.toLowerCase()} · ${environment}`
      : `${experience} · training availability not yet reported`;

  const nutritionApproach = fuel ? fieldValue(ONBOARDING_STEPS, fuel, "fuel_recovery", "nutritionApproach") : NOT_PROVIDED;
  const hasDietaryRestrictions = fuel?.hasDietaryRestrictions === "yes";
  const restrictionDetail = typeof fuel?.dietaryRestrictionsDetail === "string" ? fuel.dietaryRestrictionsDetail.trim() : "";
  const nutritionReality = hasDietaryRestrictions ? `${nutritionApproach} · Restrictions: ${restrictionDetail || "reported, no detail given"}` : `${nutritionApproach} · No restrictions reported`;

  let readinessAndSafety: string | null = null;
  if (healthReview) {
    const area = health ? describeInjuryBodyAreas(health) : "";
    const resolved = healthReview.status !== "review_needed" && healthReview.status !== "discuss_with_client" && healthReview.status !== "professional_guidance_requested";
    const base = area ? `Flagged a ${area} concern during intake.` : healthReview.reasons[0] || "A safety concern was flagged during intake.";
    readinessAndSafety = resolved ? `${base} Resolved by you before this draft was prepared.` : `${base} Awaiting your review before OPTIM can program around it safely.`;
  }

  const startDateIso = programEnrollment?.startDateIso ?? intendedProgram?.intendedStartDateIso;
  const startDateLabel = startDateIso ? formatStartDate(startDateIso) : "Not set";

  return { primaryOutcome, secondaryOutcomes, trainingFit, nutritionReality, readinessAndSafety, startDateLabel };
}
