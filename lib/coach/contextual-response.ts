// Phase 5.3A — a short, deterministic, honest response shown right after a
// handful of especially meaningful answers. Never a live AI reasoning
// simulation (no service produces these — they're plain string templates)
// and never shown for every field, only the ones the spec calls out by
// name: available days, body recomposition, and reporting pain/injury.
// Pure and stateless so it's trivially unit-testable without rendering
// anything — see verify-onboarding-intake.mts.

import type { OnboardingAnswerValue } from "./types";

export function contextualResponseFor(stepId: string, fieldKey: string, value: OnboardingAnswerValue, coachName: string): string | null {
  if (stepId === "what_you_want" && fieldKey === "primaryGoal" && value === "body_recomposition") {
    return `Body recomposition means building muscle and losing fat at once — ${coachName} will balance your training and nutrition together instead of chasing just one number.`;
  }

  if (stepId === "your_week" && fieldKey === "availableDays" && Array.isArray(value)) {
    const days = value.length;
    if (days === 0) return null;
    return `${days} day${days === 1 ? "" : "s"} a week is enough for ${coachName} to build a real ${days}-day split around your life.`;
  }

  if (stepId === "health_finish" && fieldKey === "hasInjuryHistory" && value === true) {
    return `Good to know. ${coachName} will review this before finalizing your program so you can train safely around it.`;
  }

  return null;
}
