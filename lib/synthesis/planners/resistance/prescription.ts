// Gate 4.0C-2 — sets, reps, effort, rest and their week-by-week
// progression. Every number sits inside the coach's own range. Where the
// goal narrows the choice, the narrowing comes from sourced Fitness
// Knowledge (ACSM rep zones), intersected with the coach's range; if they
// don't overlap, the coach's range governs.

import type { ExercisePrescription, NumberRange } from "../../plan-spec.ts";
import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";
import type { Emphasis, Quality } from "./architecture.ts";
import type { ProgressionMethod, Range, ResistanceMethod } from "./method.ts";

export type Role = "main" | "accessory";

export interface RoleQualities {
  main: Quality;
  accessory: Quality;
  /** Main lifts alternate between these by week (undulating coach + two goals). */
  mainAlternates: [Quality, Quality] | null;
}

export function roleQualities(emphasis: Emphasis, undulating: boolean): RoleQualities {
  const { primary, secondary } = emphasis;
  const main: Quality = primary;
  const accessory: Quality = primary === "general" ? "general" : "hypertrophy";
  const mainAlternates: [Quality, Quality] | null = secondary && undulating ? [primary, secondary] : null;
  return { main, accessory, mainAlternates };
}

const intersect = (a: Range, b: { min?: number; max?: number }): NumberRange | null => {
  const min = Math.max(a.min, b.min ?? -Infinity);
  const max = Math.min(a.max, b.max ?? Infinity);
  return min <= max ? { min, max } : null;
};

/** The third of the coach's range nearest a zone it doesn't overlap. */
const nearestThird = (coach: Range, zone: { min?: number; max?: number }): NumberRange => {
  const span = Math.max(0, Math.round((coach.max - coach.min) / 3));
  return (zone.max ?? Infinity) < coach.min ? { min: coach.min, max: coach.min + span } : { min: coach.max - span, max: coach.max };
};

export interface RepZone {
  range: NumberRange;
  source: string;
}

export function repZone(params: { knowledge: FitnessKnowledgeRegistry; coach: Range; quality: Quality; experience: string | null }): RepZone {
  const { coach, quality } = params;
  if (quality === "general") return { range: { min: coach.min, max: coach.max }, source: "coach range (general support: no goal-specific narrowing)" };
  const concept = params.knowledge.concept("repetition_range");
  const zone =
    quality === "strength"
      ? params.experience === "beginner"
        ? { claim: "reps.acsm_strength", param: concept?.claims.find((c) => c.id === "reps.acsm_strength")?.parameters?.novice }
        : { claim: "reps.acsm_strength", param: concept?.claims.find((c) => c.id === "reps.acsm_strength")?.parameters?.heavyEmphasis }
      : { claim: "reps.acsm_hypertrophy", param: concept?.claims.find((c) => c.id === "reps.acsm_hypertrophy")?.parameters?.emphasis };
  if (!zone.param) return { range: { min: coach.min, max: coach.max }, source: "coach range (knowledge zone unavailable)" };
  const both = intersect(coach, zone.param);
  if (both) return { range: both, source: `coach range ∩ ${quality} zone ${zone.param.min}–${zone.param.max} (knowledge: ${zone.claim})` };
  return { range: nearestThird(coach, zone.param), source: `coach range doesn't overlap the ${quality} zone (knowledge: ${zone.claim}); the coach's range governs — nearest third used` };
}

/** Week-level variation inside a zone: undulating alternates halves;
 * phase variation moves from the upper half to the lower half across thirds. */
export function weekZone(zone: NumberRange, week: number, buildWeeks: number, mode: "undulating" | "phase" | "none"): { range: NumberRange; label: string } {
  const span = zone.max - zone.min;
  if (mode === "none" || span < 2) return { range: zone, label: "same zone" };
  const half = Math.floor(span / 2);
  const lower = { min: zone.min, max: zone.min + half };
  const upper = { min: zone.max - half, max: zone.max };
  if (mode === "undulating") return week % 2 === 1 ? { range: upper, label: "lighter (upper half)" } : { range: lower, label: "heavier (lower half)" };
  const third = week / Math.max(1, buildWeeks);
  return third <= 1 / 3 ? { range: upper, label: "foundation (upper half)" } : third <= 2 / 3 ? { range: zone, label: "development (full zone)" } : { range: lower, label: "peak (lower half)" };
}

export function chooseSets(range: Range, role: Role, emphasis: Emphasis): { sets: number; why: string } {
  const top = range.max;
  const mid = Math.ceil((range.min + range.max) / 2);
  const strengthGoal = emphasis.primary === "strength" || emphasis.secondary === "strength";
  const hypGoal = emphasis.primary === "hypertrophy" || emphasis.secondary === "hypertrophy";
  if (role === "main") {
    if (strengthGoal) return { sets: top, why: "top of the coach's main-lift set range (strength goal)" };
    if (hypGoal) return { sets: mid, why: "middle of the coach's main-lift set range (hypertrophy goal)" };
    return { sets: range.min, why: "bottom of the coach's main-lift set range (general support)" };
  }
  if (hypGoal) return { sets: top, why: "top of the coach's accessory set range (hypertrophy goal; knowledge: volume.dose_response_hypertrophy)" };
  return { sets: range.min, why: "bottom of the coach's accessory set range" };
}

export function chooseRir(range: Range, role: Role, quality: Quality): { rir: number; why: string } {
  const clamp = (n: number) => Math.max(range.min, Math.min(range.max, n));
  if (quality === "general") return { rir: clamp(Math.round((range.min + range.max) / 2)), why: "middle of the coach's RIR range" };
  if (role === "main") return { rir: clamp(range.min + 1), why: "one rep above the coach's hardest RIR for main lifts" };
  return { rir: clamp(Math.max(range.min, 1)), why: "hard end of the coach's range, short of failure (knowledge: effort.failure_not_required_hypertrophy)" };
}

const PLAIN_RIR: Record<string, [number, number]> = { comfortable: [4, 5], challenging: [2, 3], very_hard: [0, 1] };

export function effortFor(method: ResistanceMethod, role: Role, quality: Quality, deload: boolean): ExercisePrescription["effort"] & { why: string } {
  if (method.effort.rir) {
    const r = method.effort.rir[role].value;
    const c = deload ? { rir: r.max, why: "easiest end of the coach's RIR range (deload)" } : chooseRir(r, role, quality);
    const usesRpe = method.effort.metrics.includes("rpe");
    return { metric: usesRpe ? "rpe" : "rir", target: usesRpe ? 10 - c.rir : c.rir, rirRange: { min: r.min, max: r.max }, why: c.why };
  }
  const plain = method.effort.plain!.value;
  return { metric: "plain", target: plain, rirRange: { min: PLAIN_RIR[plain][0], max: PLAIN_RIR[plain][1] }, why: "coach's plain-language effort cue" };
}

export function restFor(method: ResistanceMethod, knowledge: FitnessKnowledgeRegistry, role: Role, quality: Quality): { range: NumberRange | null; why: string } {
  if (method.rest) {
    const r = method.rest[role].value;
    if (role === "main" && quality === "strength" && r.max > r.min) return { range: { min: (r.min + r.max) / 2, max: r.max }, why: "upper half of the coach's main-lift rest (strength)" };
    return { range: { min: r.min, max: r.max }, why: `coach's ${role} rest range` };
  }
  const claim = knowledge.concept("rest_intervals")?.claims.find((c) => c.id === "rest.acsm");
  const p = quality === "strength" ? claim?.parameters?.strengthHeavy : quality === "hypertrophy" ? claim?.parameters?.hypertrophy : undefined;
  if (p?.min !== undefined && p.max !== undefined) return { range: { min: p.min, max: p.max }, why: `coach sets no rest; general ${quality} guidance (knowledge: rest.acsm)` };
  return { range: null, why: "coach sets no rest and no goal-specific guidance applies" };
}

export function progressionRule(methods: ProgressionMethod[]): string {
  const first = methods[0];
  const text: Record<ProgressionMethod, string> = {
    add_load_when_reps_hit: "Add load once every set reaches the top of the rep target at the prescribed effort.",
    double_progression: "Add reps across sessions until the top of the range, then add load and return to the bottom.",
    add_reps_or_sets: "Add a rep or a set (within the coach's range) when the current target is completed.",
    percentage_waves: "Percentage waves (needs 1RM baselines).",
    autoregulated: "Choose load each session to land on the prescribed RPE/RIR.",
    small_steps_by_feel: "Add a small amount of load when the work feels easier.",
  };
  return [text[first], ...methods.slice(1).map((m) => `Then: ${text[m]}`)].join(" ");
}

export interface DurationChoice {
  weeks: number;
  deloadWeeks: number[];
  why: string;
}

/** Program length from the coach's range; deloads only as the coach's method defines them. */
export function chooseDuration(method: ResistanceMethod): DurationChoice | null {
  const len = method.programLengthWeeks?.value;
  if (!len) return null;
  const d = method.deload.value;
  if (d.approach !== "fixed" || !d.every) {
    const weeks = len.preferred ?? len.min;
    return { weeks, deloadWeeks: [], why: `${len.preferred ? "coach's preferred" : "shortest"} program length in the coach's ${len.min}–${len.max}-week range; deloads ${d.approach === "as_needed" ? "are taken when the coach's triggers appear, not scheduled" : "aren't programmed (coach method)"}` };
  }
  // The length in range and interval in range that leave the fewest leftover weeks; prefer the coach's preferred values.
  let best: { weeks: number; every: number; leftover: number } | null = null;
  for (let w = len.min; w <= len.max; w++) {
    for (let n = d.every.min; n <= d.every.max; n++) {
      const leftover = w % n;
      const better = !best || leftover < best.leftover || (leftover === best.leftover && (w === len.preferred || (best.weeks !== len.preferred && w < best.weeks)));
      if (better) best = { weeks: w, every: n, leftover };
    }
  }
  const b = best!;
  const deloadWeeks = Array.from({ length: Math.floor(b.weeks / b.every) }, (_, i) => (i + 1) * b.every);
  return { weeks: b.weeks, deloadWeeks, why: `${b.weeks} weeks with a deload every ${b.every} weeks (coach: scheduled deloads every ${d.every.min}–${d.every.max} weeks; fewest leftover weeks)` };
}
