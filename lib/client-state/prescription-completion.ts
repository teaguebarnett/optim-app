// Phase 9D — the prescription_completion domain: repeated divergence
// between what was prescribed and what was actually performed, distinct
// from general adherence (which is about whether a scheduled SESSION
// happened at all — spec section 26 calls this out as its own finding:
// "repeated inability to complete the same prescription style across
// multiple comparable exposures").
//
// Continuous work has a clean, already-computed divergence signal
// (performed_as_prescribed, set deterministically by
// lib/workout/continuous.ts's real 0.9-completion-threshold classifier at
// execution time) — this is the primary, most defensible signal here.
// Resistance has no equivalent per-item divergence observation (no
// prescribed/performed set-count is captured at the observation layer —
// see lib/client-state/performance.ts's header doc for the same
// limitation), so resistance under-completion is scoped narrowly to
// REPEATED skips of the SAME comparable exercise (never a fabricated
// "sets missed" ratio).

import type { ClientStateFinding } from "./types.ts";
import type { RawObservation } from "./evidence.ts";
import { PERFORMANCE_LOOKBACK_DAYS, PERFORMANCE_MIN_COMPARABLE_EXPOSURES } from "./windows.ts";
import { resistanceExerciseSlug } from "./performance.ts";
import { addDaysToLocalDate, isLocalDateBefore } from "../shared/local-date.ts";

const UNDER_COMPLETION_RATIO_THRESHOLD = 0.4;

export function analyzePrescriptionCompletion(params: { clientProfileId: string; observations: RawObservation[]; activeSafetyRestriction: boolean; nowIso: string }): ClientStateFinding {
  const { clientProfileId, observations, activeSafetyRestriction, nowIso } = params;
  const sinceIso = addDaysToLocalDate(nowIso.slice(0, 10), -(PERFORMANCE_LOOKBACK_DAYS - 1));
  const window = { sinceIso, untilIso: nowIso.slice(0, 10), label: `last ${PERFORMANCE_LOOKBACK_DAYS} days` };
  const base = { clientProfileId, domain: "prescription_completion" as const, analysisWindow: window, activeSafetyRestriction };
  const inWindow = observations.filter((o) => !isLocalDateBefore(o.observedAtIso.slice(0, 10), sinceIso));

  // Continuous: repeated performed_as_prescribed = false.
  const continuousObs = inWindow.filter((o) => o.metricKey === "performed_as_prescribed" && o.value.valueType === "boolean");
  if (continuousObs.length >= PERFORMANCE_MIN_COMPARABLE_EXPOSURES) {
    const underCompleted = continuousObs.filter((o) => o.value.valueType === "boolean" && o.value.valueBoolean === false);
    const ratio = underCompleted.length / continuousObs.length;
    if (underCompleted.length >= PERFORMANCE_MIN_COMPARABLE_EXPOSURES && ratio >= UNDER_COMPLETION_RATIO_THRESHOLD) {
      const dates = underCompleted.map((o) => o.observedAtIso.slice(0, 10)).sort();
      return {
        ...base,
        findingType: "repeated_under_completion",
        strength: ratio >= 0.6 ? "strong" : "emerging",
        summary: `Continuous-training targets were not met in ${underCompleted.length} of ${continuousObs.length} comparable sessions in the lookback window.`,
        supportingEvidenceRefs: underCompleted.map((o) => o.id),
        contradictingEvidenceRefs: continuousObs.filter((o) => o.value.valueType === "boolean" && o.value.valueBoolean === true).map((o) => o.id),
        reasonClassification: null,
        firstObservedIso: dates[0],
        lastObservedIso: dates[dates.length - 1],
      };
    }
    if (ratio === 0) {
      const dates = continuousObs.map((o) => o.observedAtIso.slice(0, 10)).sort();
      return {
        ...base,
        findingType: "consistent_completion",
        strength: continuousObs.length >= 6 ? "strong" : "emerging",
        summary: `Continuous-training targets were met in all ${continuousObs.length} comparable sessions in the lookback window.`,
        supportingEvidenceRefs: continuousObs.map((o) => o.id),
        contradictingEvidenceRefs: [],
        reasonClassification: null,
        firstObservedIso: dates[0],
        lastObservedIso: dates[dates.length - 1],
      };
    }
  }

  // Resistance: repeated skip of the SAME comparable exercise.
  const resistanceStatusObs = inWindow.filter((o) => o.metricKey === "exercise_status" && o.value.valueType === "categorical" && resistanceExerciseSlug(o.trainingItemInstanceId) !== null);
  const bySlug = new Map<string, RawObservation[]>();
  for (const obs of resistanceStatusObs) {
    const slug = resistanceExerciseSlug(obs.trainingItemInstanceId)!;
    const list = bySlug.get(slug) ?? [];
    list.push(obs);
    bySlug.set(slug, list);
  }
  let richest: [string, RawObservation[]] | null = null;
  for (const entry of bySlug) {
    if (!richest || entry[1].length > richest[1].length) richest = entry;
  }
  if (richest && richest[1].length >= PERFORMANCE_MIN_COMPARABLE_EXPOSURES) {
    const [slug, exposures] = richest;
    const skipped = exposures.filter((o) => o.value.valueType === "categorical" && o.value.valueText === "skipped");
    const ratio = skipped.length / exposures.length;
    if (skipped.length >= PERFORMANCE_MIN_COMPARABLE_EXPOSURES && ratio >= UNDER_COMPLETION_RATIO_THRESHOLD) {
      const dates = skipped.map((o) => o.observedAtIso.slice(0, 10)).sort();
      return {
        ...base,
        findingType: "repeated_under_completion",
        strength: ratio >= 0.6 ? "strong" : "emerging",
        summary: `${slug.replaceAll("-", " ")} was skipped in ${skipped.length} of ${exposures.length} comparable exposures in the lookback window.`,
        supportingEvidenceRefs: skipped.map((o) => o.id),
        contradictingEvidenceRefs: exposures.filter((o) => o.value.valueType === "categorical" && o.value.valueText === "completed").map((o) => o.id),
        reasonClassification: null,
        firstObservedIso: dates[0],
        lastObservedIso: dates[dates.length - 1],
      };
    }
  }

  return { ...base, findingType: "insufficient_evidence", strength: "insufficient", summary: "Not enough comparable prescription-completion evidence in the lookback window.", supportingEvidenceRefs: [], contradictingEvidenceRefs: [], reasonClassification: null, firstObservedIso: null, lastObservedIso: null };
}
