// Phase 7A — Persist Client Health Reviews and Coach Escalation.
//
// The pure, framework-independent piece of lib/production/pain-safety.ts —
// split out exactly like lib/coach/attention-item.ts was split out of
// lib/production/coach-operations.ts (see that file's own doc for the same
// rationale): lib/production/pain-safety.ts is "server-only" (it imports
// lib/supabase/server.ts, which needs a real Next.js request via
// next/headers) and so cannot be imported from a plain test script or
// anywhere else that isn't a genuine server context. This file has no such
// dependency, so it's directly unit-testable and importable from anywhere.

import { classifyPainSeverity } from "../workout/pain-policy.ts";
import type { PainSymptomQuality } from "../types";

export interface AcutePainReportInput {
  location: string;
  ratingZeroToTen: number;
  onset: string;
  causedByMovement: string;
  continuedAfterSet: boolean;
  affectsOutsideGym: boolean;
  symptomQuality: PainSymptomQuality;
  /** The real training item's display name, when the caller has one (the
   * live session always does) — never an internal id, so the coach reads a
   * real exercise/activity name. */
  itemName?: string;
  note?: string;
}

/** Builds the same kind of short, factual, non-diagnostic summary
 * lib/production/onboarding.ts's baseline trigger and demo mode's own
 * REPORT_PAIN reducer case already use ("Pain reported: <location> during
 * today's workout.") — extended with the real severity classification and
 * exercise context OPTIM actually has, never a diagnosis or a severity
 * beyond classifyPainSeverity's own established two-tier scale. */
export function buildPainSummary(input: AcutePainReportInput): string {
  const severity = classifyPainSeverity({
    ratingZeroToTen: input.ratingZeroToTen,
    continuedAfterSet: input.continuedAfterSet,
    affectsOutsideGym: input.affectsOutsideGym,
    symptomQuality: input.symptomQuality,
  });
  const where = input.itemName ? ` during ${input.itemName}` : "";
  const gateNote = severity === "block-exercise" ? "OPTIM paused this exercise for the client." : "OPTIM offered the client the option to resume after confirming it resolved.";
  const noteText = input.note ? ` Client note: ${input.note}` : "";
  return `Pain reported: ${input.location}, ${input.ratingZeroToTen}/10${where}. ${gateNote}${noteText}`;
}
