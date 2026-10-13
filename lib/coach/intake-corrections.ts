// Coach intake corrections — the client's onboarding answers as planning should read them.
//
// Two rules, applied to a COPY (the client's own answers are never changed):
//   1. An answer to a question the client never saw isn't an answer: fields whose `visibleIf` is false for the
//      client's own answers are dropped (e.g. a target-weight wheel's default saved for a "get stronger" goal, which
//      never shows that question).
//   2. The coach's explicit corrections (migration 038, correct_client_intake_answer) replace the client's value;
//      a cleared correction removes it.
// Pure — shared by the production read path (lib/production/onboarding.ts) and tests.

import { ONBOARDING_STEPS, visibleFieldsForStep } from "./onboarding-steps.ts";
import type { OnboardingAnswerValue, OnboardingProgress, OnboardingStepAnswers } from "./types.ts";

export interface IntakeCorrection {
  step: string;
  field: string;
  /** The corrected value; null when the coach cleared the answer. */
  value: string | number | boolean | null;
  cleared: boolean;
  /** The client's original answer at the time of the correction (null when there was none). */
  original: unknown;
  reason: string;
  correctedBy: string;
  correctedAtIso: string;
  history?: Array<Omit<IntakeCorrection, "history">>;
}

/** Coach-correctable intake fields (the UI offers only these). */
export const CORRECTABLE_INTAKE_FIELDS = [{ step: "what_you_want", field: "targetWeight", label: "Target weight", unit: "lb", min: 80, max: 400 }] as const;

export function parseIntakeCorrections(raw: unknown): Record<string, IntakeCorrection> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, IntakeCorrection> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const c = v as IntakeCorrection;
    if (c && typeof c.step === "string" && typeof c.field === "string" && key === `${c.step}.${c.field}`) out[key] = c;
  }
  return out;
}

/** The client's answers with unseen-question answers dropped and the coach's corrections applied. */
export function effectiveIntakeAnswers(answers: OnboardingProgress["answers"], corrections: Record<string, IntakeCorrection> = {}): OnboardingProgress["answers"] {
  const out = structuredClone(answers ?? {}) as Record<string, OnboardingStepAnswers>;
  for (const c of Object.values(corrections)) {
    const stepAnswers = { ...(out[c.step] ?? {}) };
    if (c.cleared || c.value === null) delete stepAnswers[c.field];
    else stepAnswers[c.field] = c.value as OnboardingAnswerValue;
    out[c.step] = stepAnswers;
  }
  for (const step of ONBOARDING_STEPS) {
    const a = out[step.id];
    if (!a) continue;
    const visible = new Set(visibleFieldsForStep(step, a).map((f) => f.key));
    for (const f of step.fields) if (f.visibleIf && !visible.has(f.key) && f.key in a) delete a[f.key];
  }
  return out as OnboardingProgress["answers"];
}
