// Phase 8A — projects a lightweight, non-authoritative FACT out of a real
// pain/safety report into the observation model. The escalations table
// (Phase 7A/7B) remains the sole canonical safety record and lifecycle —
// this never duplicates the coach-review decision, the queue status, or the
// full summary text, only the client's own structured, factual report
// detail (what they said, not what OPTIM or a coach decided about it).

import { buildEscalationAreaObservationRef, buildEscalationObservationRef, type ClientObservationInput } from "./types.ts";

export interface AcutePainReportForObservation {
  clientProfileId: string;
  workspaceId: string;
  escalationId: string;
  /** The client's own reported location, verbatim — never summarized. */
  location: string;
  ratingZeroToTen: number | null;
  observedAtIso: string;
}

/** One acute, live-workout pain report -> up to two facts: where, and (only
 * when the client actually gave one) how bad. Never fabricates a rating
 * the client didn't report. */
export function projectAcutePainObservations(input: AcutePainReportForObservation): ClientObservationInput[] {
  const sourceRef = buildEscalationObservationRef(input.escalationId);
  const observations: ClientObservationInput[] = [
    {
      clientProfileId: input.clientProfileId,
      workspaceId: input.workspaceId,
      category: "pain_safety",
      metricKey: "pain_reported",
      sourceType: "workout_execution",
      value: { valueType: "text", valueText: input.location },
      unit: null,
      sourceRef,
      observedAtIso: input.observedAtIso,
    },
  ];
  if (input.ratingZeroToTen !== null) {
    observations.push({
      clientProfileId: input.clientProfileId,
      workspaceId: input.workspaceId,
      category: "pain_safety",
      metricKey: "pain_rating",
      sourceType: "workout_execution",
      value: { valueType: "numeric", valueNumeric: input.ratingZeroToTen },
      unit: "rating_0_10",
      sourceRef,
      observedAtIso: input.observedAtIso,
    });
  }
  return observations;
}

export interface BaselineInjuryReportForObservation {
  clientProfileId: string;
  workspaceId: string;
  escalationId: string;
  /** The client's own structured onboarding answer — a real, closed set of
   * body-area values, never free text. */
  injuryBodyAreas: string[];
  observedAtIso: string;
}

/** Baseline onboarding never asks for a 0-10 rating, so no pain_rating fact
 * is ever fabricated here — one pain_reported fact per real reported area,
 * each independently addressable/idempotent (a client with two reported
 * areas gets two distinct observations, never one concatenated string). */
export function projectBaselineInjuryObservations(input: BaselineInjuryReportForObservation): ClientObservationInput[] {
  return input.injuryBodyAreas.map((area) => ({
    clientProfileId: input.clientProfileId,
    workspaceId: input.workspaceId,
    category: "pain_safety" as const,
    metricKey: "pain_reported",
    sourceType: "onboarding" as const,
    value: { valueType: "text" as const, valueText: area },
    unit: null,
    sourceRef: buildEscalationAreaObservationRef(input.escalationId, area),
    observedAtIso: input.observedAtIso,
  }));
}
