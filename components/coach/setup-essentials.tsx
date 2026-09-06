import { ONBOARDING_STEPS, type OnboardingStepDef } from "@/lib/coach/onboarding-steps";
import { formatFieldValue, NOT_PROVIDED } from "@/lib/coach/onboarding-format";
import type { ClientIntendedProgram, OnboardingProgress, OnboardingStepAnswers } from "@/lib/coach/types";
import type { ProgramEnrollment } from "@/lib/scheduling/types";

function fieldValue(steps: OnboardingStepDef[], answers: OnboardingStepAnswers | undefined, stepId: string, key: string): string {
  const field = steps.find((s) => s.id === stepId)?.fields.find((f) => f.key === key);
  if (!field) return NOT_PROVIDED;
  return formatFieldValue(field, answers?.[key]);
}

/**
 * "Setup essentials" (spec §4.4) — a compact label/value summary, not the
 * decorative glance-fact tile grid components/coach/coach-brief.tsx already
 * has (that grid stays exactly where it is, just gated behind "View full
 * intake" now — see full-intake-disclosure.tsx). Six facts, plain text
 * rows, no cards-within-cards.
 */
export function SetupEssentials({
  onboarding,
  intendedProgram,
  programEnrollment,
}: {
  onboarding: OnboardingProgress | null;
  intendedProgram: ClientIntendedProgram | null;
  programEnrollment: ProgramEnrollment | null;
}) {
  const goals = onboarding?.answers.what_you_want;
  const week = onboarding?.answers.your_week;
  const start = onboarding?.answers.starting_point;
  const fuel = onboarding?.answers.fuel_recovery;

  const availableDays = Array.isArray(week?.availableDays) ? (week!.availableDays as string[]) : [];
  const startDateIso = programEnrollment?.startDateIso ?? intendedProgram?.intendedStartDateIso;

  const rows: { label: string; value: string }[] = [
    { label: "Goal", value: goals ? fieldValue(ONBOARDING_STEPS, goals, "what_you_want", "primaryGoal") : NOT_PROVIDED },
    {
      label: "Availability",
      value: availableDays.length > 0 ? `${availableDays.length} days/week, ${fieldValue(ONBOARDING_STEPS, week, "your_week", "maxSessionLength").toLowerCase()}` : NOT_PROVIDED,
    },
    { label: "Environment", value: week ? fieldValue(ONBOARDING_STEPS, week, "your_week", "trainingEnvironment") : NOT_PROVIDED },
    { label: "Experience", value: start ? fieldValue(ONBOARDING_STEPS, start, "starting_point", "trainingExperience") : NOT_PROVIDED },
    { label: "Nutrition approach", value: fuel ? fieldValue(ONBOARDING_STEPS, fuel, "fuel_recovery", "nutritionApproach") : NOT_PROVIDED },
    {
      label: "Start date",
      value: startDateIso ? new Date(`${startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : NOT_PROVIDED,
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
          <dt className="shrink-0 text-neutral">{row.label}</dt>
          <dd className="truncate text-right text-off-white">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
