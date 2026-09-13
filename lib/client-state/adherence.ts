// Phase 9D — the adherence domain: a conservative, deterministic
// derivation of "did the client do the training that was actually
// scheduled," distinguishing a temporary disruption from a developing
// trend (spec section 7, the central distinction this whole phase exists
// to make) using two windows (recent vs baseline — spec section 9/24) and
// real structured skip reasons (spec section 8) rather than treating every
// miss identically.
//
// Central design choice: a finding is ALWAYS recomputed fresh from the
// CURRENT evidence window, never accumulated/mutated state. This is what
// makes "return to baseline" (spec section 25) work for free — once the
// most recent window shows normal completion again, the very next
// analysis call naturally produces stable_adherence, with no separate
// "resolve the old finding" step required.

import type { ClientStateFinding, ReasonClassification } from "./types.ts";
import type { RawObservation } from "./evidence.ts";
import { ADHERENCE_BASELINE_WINDOW_DAYS, ADHERENCE_RECENT_WINDOW_DAYS } from "./windows.ts";
import { addDaysToLocalDate, isLocalDateAfter, isLocalDateBefore } from "../shared/local-date.ts";

interface SessionOutcome {
  dateIso: string;
  /** null means no session_status observation exists at all for this
   * scheduled date — a real silent miss, never fabricated as "skipped"
   * with an invented reason. */
  status: "completed" | "ended-early" | "skipped" | null;
  skipReason: string | null;
  observationId: string | null;
}

function parseDateFromSessionSourceRef(sourceRef: string | null): string | null {
  if (!sourceRef) return null;
  const parts = sourceRef.split(":");
  // buildDailyRecordObservationRef: "daily_records:<clientProfileId>:<dateIso>"
  if (parts.length === 3 && parts[0] === "daily_records") return parts[2];
  return null;
}

/** Cross-references every real scheduled training date against whatever
 * session_status observation (if any) exists for it — the one place
 * "scheduled but silently never logged" becomes a real, distinct outcome
 * from "explicitly skipped." */
function resolveSessionOutcomes(scheduledDates: string[], observations: RawObservation[]): SessionOutcome[] {
  const sessionStatusByDate = new Map<string, RawObservation>();
  const skipReasonByDate = new Map<string, RawObservation>();
  for (const obs of observations) {
    if (obs.metricKey === "session_status") {
      const date = parseDateFromSessionSourceRef(obs.sourceRef);
      if (date) sessionStatusByDate.set(date, obs);
    } else if (obs.metricKey === "skip_reason") {
      const date = parseDateFromSessionSourceRef(obs.sourceRef);
      if (date) skipReasonByDate.set(date, obs);
    }
  }
  return scheduledDates.map((dateIso) => {
    const statusObs = sessionStatusByDate.get(dateIso);
    if (!statusObs || statusObs.value.valueType !== "categorical") {
      return { dateIso, status: null, skipReason: null, observationId: null };
    }
    const status = statusObs.value.valueText as "completed" | "ended-early" | "skipped";
    const skipObs = skipReasonByDate.get(dateIso);
    const skipReason = skipObs && skipObs.value.valueType === "categorical" ? skipObs.value.valueText : null;
    return { dateIso, status, skipReason, observationId: statusObs.id };
  });
}

function classifyReasons(misses: SessionOutcome[]): ReasonClassification | null {
  if (misses.length === 0) return null;
  const buckets: Record<Exclude<ReasonClassification, "mixed">, number> = {
    illness: 0,
    schedule_conflict: 0,
    pain_or_discomfort: 0,
    equipment: 0,
    fatigue: 0,
    unexplained: 0,
  };
  for (const miss of misses) {
    if (miss.skipReason === "feeling-sick") buckets.illness += 1;
    else if (miss.skipReason === "out-of-time" || miss.skipReason === "schedule-conflict") buckets.schedule_conflict += 1;
    else if (miss.skipReason === "pain-or-discomfort") buckets.pain_or_discomfort += 1;
    else if (miss.skipReason === "equipment-unavailable") buckets.equipment += 1;
    else if (miss.skipReason === "excessive-fatigue") buckets.fatigue += 1;
    else buckets.unexplained += 1; // "forgot" | "other" | no observation at all (silent miss)
  }
  const entries = Object.entries(buckets) as [Exclude<ReasonClassification, "mixed">, number][];
  const [topReason, topCount] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return topCount > misses.length / 2 ? topReason : "mixed";
}

function isMiss(outcome: SessionOutcome): boolean {
  return outcome.status === "skipped" || outcome.status === null;
}

interface WindowSummary {
  scheduled: SessionOutcome[];
  misses: SessionOutcome[];
  missRatio: number;
  dominantReason: ReasonClassification | null;
}

function summarizeWindow(scheduledDates: string[], observations: RawObservation[], sinceIso: string, untilIso: string): WindowSummary {
  const inWindow = scheduledDates.filter((d) => !isLocalDateBefore(d, sinceIso) && !isLocalDateAfter(d, untilIso));
  const outcomes = resolveSessionOutcomes(inWindow, observations);
  const misses = outcomes.filter(isMiss);
  return {
    scheduled: outcomes,
    misses,
    missRatio: outcomes.length > 0 ? misses.length / outcomes.length : 0,
    dominantReason: classifyReasons(misses),
  };
}

/** The one adherence entry point. `nowIso` anchors both windows (recent =
 * the ADHERENCE_RECENT_WINDOW_DAYS ending today; baseline = the
 * ADHERENCE_BASELINE_WINDOW_DAYS immediately before that — spec section
 * 9/24). Returns exactly one finding — insufficient_evidence when there's
 * nothing scheduled to reason about, never a fabricated "stable" claim
 * from zero data. */
export function analyzeAdherence(params: { clientProfileId: string; scheduledTrainingDates: string[]; observations: RawObservation[]; activeSafetyRestriction: boolean; nowIso: string }): ClientStateFinding {
  const { clientProfileId, scheduledTrainingDates, observations, activeSafetyRestriction, nowIso } = params;
  const todayIso = nowIso.slice(0, 10);
  const recentSinceIso = addDaysToLocalDate(todayIso, -(ADHERENCE_RECENT_WINDOW_DAYS - 1));
  const baselineUntilIso = addDaysToLocalDate(recentSinceIso, -1);
  const baselineSinceIso = addDaysToLocalDate(baselineUntilIso, -(ADHERENCE_BASELINE_WINDOW_DAYS - 1));

  const recent = summarizeWindow(scheduledTrainingDates, observations, recentSinceIso, todayIso);
  const baseline = summarizeWindow(scheduledTrainingDates, observations, baselineSinceIso, baselineUntilIso);

  const window = { sinceIso: recentSinceIso, untilIso: todayIso, label: `last ${ADHERENCE_RECENT_WINDOW_DAYS} days (vs. prior ${ADHERENCE_BASELINE_WINDOW_DAYS}-day baseline)` };
  const missRefs = recent.misses.map((m) => m.observationId).filter((id): id is string => id !== null);
  const completedRefs = recent.scheduled.filter((s) => s.status === "completed").map((s) => s.observationId!).filter((id): id is string => !!id);

  const base = { clientProfileId, domain: "adherence" as const, analysisWindow: window, activeSafetyRestriction };

  if (recent.scheduled.length === 0) {
    return { ...base, findingType: "insufficient_evidence", strength: "insufficient", summary: "No training was scheduled in the recent analysis window.", supportingEvidenceRefs: [], contradictingEvidenceRefs: [], reasonClassification: null, firstObservedIso: null, lastObservedIso: null };
  }

  if (recent.misses.length === 0) {
    const strength = recent.scheduled.length >= 3 ? "strong" : "emerging";
    return {
      ...base,
      findingType: "stable_adherence",
      strength,
      summary: `${recent.scheduled.length} of ${recent.scheduled.length} scheduled sessions completed in the last ${ADHERENCE_RECENT_WINDOW_DAYS} days.`,
      supportingEvidenceRefs: completedRefs,
      contradictingEvidenceRefs: [],
      reasonClassification: null,
      firstObservedIso: recent.scheduled[0]?.dateIso ?? null,
      lastObservedIso: recent.scheduled[recent.scheduled.length - 1]?.dateIso ?? null,
    };
  }

  const baselineHadEvidence = baseline.scheduled.length > 0;
  const baselineWasStrong = baselineHadEvidence && baseline.missRatio <= 0.25;
  const scheduleConflictRepeatsAcrossWindows = recent.dominantReason === "schedule_conflict" && baselineHadEvidence && baseline.missRatio > 0;
  const summaryDates = recent.misses.map((m) => m.dateIso).join(", ");

  if (recent.dominantReason === "illness" && (baselineWasStrong || !baselineHadEvidence)) {
    return {
      ...base,
      findingType: "illness_related_disruption",
      strength: "emerging",
      summary: `${recent.misses.length} illness-related missed session(s) in the last ${ADHERENCE_RECENT_WINDOW_DAYS} days (${summaryDates})${baselineHadEvidence ? `, following ${Math.round((1 - baseline.missRatio) * 100)}% completion over the prior ${ADHERENCE_BASELINE_WINDOW_DAYS} days` : ""}.`,
      supportingEvidenceRefs: missRefs,
      contradictingEvidenceRefs: completedRefs,
      reasonClassification: "illness",
      firstObservedIso: recent.misses[0].dateIso,
      lastObservedIso: recent.misses[recent.misses.length - 1].dateIso,
    };
  }

  if (scheduleConflictRepeatsAcrossWindows) {
    return {
      ...base,
      findingType: "recurring_schedule_conflict",
      strength: baseline.missRatio > 0.25 ? "strong" : "emerging",
      summary: `Schedule-related misses recur across both the last ${ADHERENCE_RECENT_WINDOW_DAYS} days and the prior ${ADHERENCE_BASELINE_WINDOW_DAYS}-day baseline (${summaryDates}).`,
      supportingEvidenceRefs: missRefs,
      contradictingEvidenceRefs: completedRefs,
      reasonClassification: "schedule_conflict",
      firstObservedIso: recent.misses[0].dateIso,
      lastObservedIso: recent.misses[recent.misses.length - 1].dateIso,
    };
  }

  const persistingOrUnexplained = (recent.dominantReason === "unexplained" || recent.dominantReason === "mixed") && recent.missRatio >= 0.4 && (!baselineHadEvidence || baseline.missRatio >= 0.25);
  if (persistingOrUnexplained) {
    return {
      ...base,
      findingType: "recurring_unexplained_skips",
      strength: baselineHadEvidence && baseline.missRatio >= 0.25 ? "strong" : "emerging",
      summary: `${recent.misses.length} of ${recent.scheduled.length} scheduled sessions missed in the last ${ADHERENCE_RECENT_WINDOW_DAYS} days with no clearly dominant explained reason (${summaryDates}).`,
      supportingEvidenceRefs: missRefs,
      contradictingEvidenceRefs: completedRefs,
      reasonClassification: recent.dominantReason,
      firstObservedIso: recent.misses[0].dateIso,
      lastObservedIso: recent.misses[recent.misses.length - 1].dateIso,
    };
  }

  return {
    ...base,
    findingType: "isolated_disruption",
    strength: "emerging",
    summary: `${recent.misses.length} of ${recent.scheduled.length} scheduled sessions missed in the last ${ADHERENCE_RECENT_WINDOW_DAYS} days (${summaryDates}), with no corroborating pattern across the prior baseline.`,
    supportingEvidenceRefs: missRefs,
    contradictingEvidenceRefs: completedRefs,
    reasonClassification: recent.dominantReason,
    firstObservedIso: recent.misses[0].dateIso,
    lastObservedIso: recent.misses[recent.misses.length - 1].dateIso,
  };
}
