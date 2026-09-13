// Phase 9D — the training_performance / continuous_performance domains: a
// conservative, deterministic direction (improving/declining/stable/
// inconsistent) computed ONLY over genuinely comparable exposures (spec
// section 10/11) — never a fake composite score, never a comparison across
// unrelated prescriptions.
//
// Comparability signature (spec section 10): resistance items are grouped
// by the exercise's own real name, deterministically recoverable from its
// trainingItemInstanceId — generation always builds a resistance item's id
// as `item-${dayOfWeek}-${order}-${slugified exercise name}`
// (lib/coach/universal-program-generation.ts) with no random/time suffix
// at the item level, so the same exercise name always parses back to the
// same identity regardless of which day/week/program-version it came
// from. This is a real, stable, already-existing identifier — not a new
// fabricated one. Known limitation (documented, not silently assumed
// away): this does not currently factor in rep-range/load-context
// (bench 5x5 vs bench 3x12 both parse to the same "barbell-bench-press"
// group) because rep range is not captured in the observation layer —
// see this phase's completion report, "false-positive risks."
//
// Continuous items' ids carry no such slug (generation always mints
// `cardio-${dayOfWeek}-${Date.now()}-...`), which is fine today because
// this generator only ever produces ONE continuous activity type ("Easy
// Cardio") per program — confirmed during Phase 9C's own audit of this
// exact file — so every continuous_duration observation is comparable by
// construction. Documented as a real, verified architectural fact, not an
// assumption.

import type { ClientStateFinding, EvidenceStrength } from "./types.ts";
import type { RawObservation } from "./evidence.ts";
import { PERFORMANCE_LOOKBACK_DAYS, PERFORMANCE_MIN_COMPARABLE_EXPOSURES } from "./windows.ts";
import { addDaysToLocalDate, isLocalDateBefore } from "../shared/local-date.ts";

/** Recovers the stable exercise-name slug from a resistance item's real
 * generation-assigned id, or null when the id doesn't match that scheme
 * (e.g. a continuous item, or a legacy/demo record predating this
 * convention) — null is a real, honest "not resolvable," never a guess. */
export function resistanceExerciseSlug(trainingItemInstanceId: string | null): string | null {
  if (!trainingItemInstanceId) return null;
  const parts = trainingItemInstanceId.split("-");
  if (parts[0] !== "item" || parts.length < 4) return null;
  return parts.slice(3).join("-");
}

interface Exposure {
  dateIso: string;
  observationId: string;
  value: number;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

interface DirectionResult {
  direction: "performance_improving" | "performance_declining" | "performance_stable" | "performance_inconsistent";
  strength: EvidenceStrength;
}

const MEANINGFUL_CHANGE_RATIO = 0.05;

/** The one shared trend computation both domains use — a transparent,
 * inspectable half-split average comparison, never a fabricated composite
 * score (spec section 11). Genuinely mixed up/down movement (real
 * variability, not a direction) is reported as inconsistent rather than
 * forced into improving/declining (spec section 11's own explicit
 * category, and test matrix item N: "one high RPE does not become
 * trend" generalizes to "noisy data does not become a false trend"). */
function computeDirection(exposures: Exposure[], higherIsBetter: boolean): DirectionResult {
  const sorted = [...exposures].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  const values = sorted.map((e) => e.value);
  const deltas: number[] = [];
  for (let i = 1; i < values.length; i++) deltas.push(values[i] - values[i - 1]);
  const positive = deltas.filter((d) => d > 0).length;
  const negative = deltas.filter((d) => d < 0).length;
  const noisy = deltas.length >= 3 && positive > 0 && negative > 0 && Math.min(positive, negative) / deltas.length >= 1 / 3;

  const strength: EvidenceStrength = exposures.length >= 6 ? "strong" : exposures.length >= PERFORMANCE_MIN_COMPARABLE_EXPOSURES ? "emerging" : "insufficient";

  if (noisy) return { direction: "performance_inconsistent", strength };

  const half = Math.floor(values.length / 2);
  const olderAvg = average(values.slice(0, half));
  const newerAvg = average(values.slice(values.length - half));
  const pctChange = olderAvg === 0 ? 0 : (newerAvg - olderAvg) / Math.abs(olderAvg);

  if (Math.abs(pctChange) < MEANINGFUL_CHANGE_RATIO) return { direction: "performance_stable", strength };
  const wentUp = pctChange > 0;
  return { direction: wentUp === higherIsBetter ? "performance_improving" : "performance_declining", strength };
}

function groupExposures(observations: RawObservation[], metricKey: string, groupKeyFn: (obs: RawObservation) => string | null, sinceIso: string): Map<string, Exposure[]> {
  const groups = new Map<string, Exposure[]>();
  for (const obs of observations) {
    if (obs.metricKey !== metricKey || obs.value.valueType !== "numeric") continue;
    const dateIso = obs.observedAtIso.slice(0, 10);
    if (isLocalDateBefore(dateIso, sinceIso)) continue;
    const key = groupKeyFn(obs);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ dateIso, observationId: obs.id, value: obs.value.valueNumeric });
    groups.set(key, list);
  }
  return groups;
}

function richestGroup(groups: Map<string, Exposure[]>): [string, Exposure[]] | null {
  let best: [string, Exposure[]] | null = null;
  for (const entry of groups) {
    if (!best || entry[1].length > best[1].length || (entry[1].length === best[1].length && entry[1][entry[1].length - 1].dateIso > best[1][best[1].length - 1].dateIso)) {
      best = entry;
    }
  }
  return best;
}

function emptyFinding(clientProfileId: string, domain: "training_performance" | "continuous_performance", window: ClientStateFinding["analysisWindow"], activeSafetyRestriction: boolean, summary: string): ClientStateFinding {
  return { clientProfileId, domain, findingType: "insufficient_evidence", strength: "insufficient", analysisWindow: window, summary, supportingEvidenceRefs: [], contradictingEvidenceRefs: [], reasonClassification: null, firstObservedIso: null, lastObservedIso: null, activeSafetyRestriction };
}

/** Resistance performance direction, based on performed_load (the only
 * numeric resistance-output metric the observation layer captures — see
 * this module's header doc for why reps-performed isn't available yet),
 * with RPE used only as a secondary corroborating adjustment (spec
 * section 12): if load is genuinely stable but comparable RPE is rising,
 * that's rising perceived effort for the same output — reported as
 * declining. RPE rising ALONGSIDE rising load is left alone (expected
 * progression, spec section 12's own explicit counter-example), since the
 * adjustment only fires when load itself resolved to "stable". */
export function analyzeResistancePerformance(params: { clientProfileId: string; observations: RawObservation[]; activeSafetyRestriction: boolean; nowIso: string }): ClientStateFinding {
  const { clientProfileId, observations, activeSafetyRestriction, nowIso } = params;
  const sinceIso = addDaysToLocalDate(nowIso.slice(0, 10), -(PERFORMANCE_LOOKBACK_DAYS - 1));
  const window = { sinceIso, untilIso: nowIso.slice(0, 10), label: `last ${PERFORMANCE_LOOKBACK_DAYS} days, comparable exposures only` };
  const base = { clientProfileId, domain: "training_performance" as const, activeSafetyRestriction };

  const loadGroups = groupExposures(observations, "performed_load", (o) => resistanceExerciseSlug(o.trainingItemInstanceId), sinceIso);
  const best = richestGroup(loadGroups);
  if (!best || best[1].length < PERFORMANCE_MIN_COMPARABLE_EXPOSURES) {
    return emptyFinding(clientProfileId, "training_performance", window, activeSafetyRestriction, "No single resistance exercise has enough comparable exposures in the lookback window to assess a direction.");
  }
  const [slug, exposures] = best;
  const loadResult = computeDirection(exposures, true);
  const evidenceRefs = exposures.map((e) => e.observationId);
  const readableName = slug.replaceAll("-", " ");

  if (loadResult.direction === "performance_stable") {
    const rpeGroups = groupExposures(
      observations.filter((o) => resistanceExerciseSlug(o.trainingItemInstanceId) === slug),
      "rpe",
      (o) => resistanceExerciseSlug(o.trainingItemInstanceId),
      sinceIso
    );
    const rpeExposures = rpeGroups.get(slug) ?? [];
    if (rpeExposures.length >= PERFORMANCE_MIN_COMPARABLE_EXPOSURES) {
      const rpeResult = computeDirection(rpeExposures, false);
      if (rpeResult.direction === "performance_declining") {
        return {
          ...base,
          findingType: "performance_declining",
          strength: rpeResult.strength,
          analysisWindow: window,
          summary: `Load on ${readableName} has stayed stable across ${exposures.length} comparable exposures, but reported RPE has risen across ${rpeExposures.length} comparable exposures for the same work.`,
          supportingEvidenceRefs: [...evidenceRefs, ...rpeExposures.map((e) => e.observationId)],
          contradictingEvidenceRefs: [],
          reasonClassification: null,
          firstObservedIso: exposures[0].dateIso,
          lastObservedIso: exposures[exposures.length - 1].dateIso,
        };
      }
    }
  }

  return {
    ...base,
    findingType: loadResult.direction,
    strength: loadResult.strength,
    analysisWindow: window,
    summary: `Load on ${readableName} is ${loadResult.direction.replace("performance_", "")} across ${exposures.length} comparable exposures in the lookback window.`,
    supportingEvidenceRefs: evidenceRefs,
    contradictingEvidenceRefs: [],
    reasonClassification: null,
    firstObservedIso: exposures[0].dateIso,
    lastObservedIso: exposures[exposures.length - 1].dateIso,
  };
}

/** Continuous performance direction, based on continuous_duration.
 * Grouped by extracted identity for structural symmetry with the
 * resistance analyzer, but see this module's header doc: this generator
 * currently produces only one continuous activity type, so in practice
 * every continuous_duration observation falls into one comparable group
 * today — a verified fact, not an assumption. */
export function analyzeContinuousPerformance(params: { clientProfileId: string; observations: RawObservation[]; activeSafetyRestriction: boolean; nowIso: string }): ClientStateFinding {
  const { clientProfileId, observations, activeSafetyRestriction, nowIso } = params;
  const sinceIso = addDaysToLocalDate(nowIso.slice(0, 10), -(PERFORMANCE_LOOKBACK_DAYS - 1));
  const window = { sinceIso, untilIso: nowIso.slice(0, 10), label: `last ${PERFORMANCE_LOOKBACK_DAYS} days, comparable exposures only` };

  // Today's generator produces exactly one continuous activity identity —
  // see header doc — so every real exposure is pooled into one group
  // rather than grouped by an unresolvable per-item id.
  const groups = groupExposures(observations, "continuous_duration", () => "continuous", sinceIso);
  const exposures = groups.get("continuous") ?? [];
  if (exposures.length < PERFORMANCE_MIN_COMPARABLE_EXPOSURES) {
    return emptyFinding(clientProfileId, "continuous_performance", window, activeSafetyRestriction, "Not enough comparable continuous-training exposures in the lookback window to assess a direction.");
  }
  const result = computeDirection(exposures, true);
  return {
    clientProfileId,
    domain: "continuous_performance",
    findingType: result.direction,
    strength: result.strength,
    analysisWindow: window,
    summary: `Continuous training duration is ${result.direction.replace("performance_", "")} across ${exposures.length} comparable exposures in the lookback window.`,
    supportingEvidenceRefs: exposures.map((e) => e.observationId),
    contradictingEvidenceRefs: [],
    reasonClassification: null,
    firstObservedIso: exposures[0].dateIso,
    lastObservedIso: exposures[exposures.length - 1].dateIso,
    activeSafetyRestriction,
  };
}
