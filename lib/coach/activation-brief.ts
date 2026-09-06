// Phase 5.4B completion pass — the pre-activation "Activation Brief" (spec
// §4.2/§6): a deterministic, at-most-three-sentence summary built directly
// from the client's real onboarding answers and real activation-readiness
// state — never a dump of every intake answer (that's what "View full
// intake," gating the existing CoachBrief, is for). Reuses the exact same
// onboarding field defs/formatters CoachBrief already uses so the two
// surfaces can never describe the same answer two different ways.

import { ONBOARDING_STEPS, type OnboardingStepDef } from "./onboarding-steps.ts";
import { formatFieldValue, NOT_PROVIDED } from "./onboarding-format.ts";
import { describeInjuryBodyAreas } from "./health-review.ts";
import type { ActivationReadiness, ClientIntendedProgram, OnboardingProgress, OnboardingStepAnswers, OnboardingStepId } from "./types";
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

  const goal = fieldValue(ONBOARDING_STEPS, goals, "what_you_want", "primaryGoal");
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
