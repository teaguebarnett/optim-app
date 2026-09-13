// Phase 10A — the ONE plain-language formatter for a raw observation, used
// only by the coach-facing evidence drill-down (spec section 13: "session/
// date, skip reason, completion result, comparable load/RPE fact" — never
// a database id, raw JSON, or every observation dumped). Pure formatting
// only — this never re-interprets a fact into a stronger claim than the
// finding it's supporting evidence for; it just renders the fact plainly.

import type { RawObservation } from "./evidence.ts";

const METRIC_LABELS: Record<string, string> = {
  session_status: "Session",
  skip_reason: "Reason",
  exercise_status: "Exercise",
  exercise_skip_reason: "Reason",
  rpe: "RPE",
  performed_load: "Load",
  continuous_duration: "Duration",
  performed_as_prescribed: "Met target",
};

function formatValue(obs: RawObservation): string {
  if (obs.value.valueType === "categorical" || obs.value.valueType === "text") return obs.value.valueText.replaceAll("-", " ");
  if (obs.value.valueType === "boolean") return obs.value.valueBoolean ? "yes" : "no";
  if (obs.metricKey === "continuous_duration") return `${Math.round(obs.value.valueNumeric / 60)} min`;
  if (obs.metricKey === "performed_load") return `${obs.value.valueNumeric} ${obs.unit ?? "lb"}`;
  return `${obs.value.valueNumeric}${obs.unit ? ` ${obs.unit}` : ""}`;
}

export interface EvidenceDetailLine {
  dateIso: string;
  label: string;
  value: string;
}

/** One plain, bounded line per real observation — never more than what
 * that single row actually says. Callers cap the input list themselves
 * (a finding's own supportingEvidenceRefs is already bounded). */
export function formatObservationForDisplay(obs: RawObservation): EvidenceDetailLine {
  return {
    dateIso: obs.observedAtIso.slice(0, 10),
    label: METRIC_LABELS[obs.metricKey] ?? obs.metricKey,
    value: formatValue(obs),
  };
}
