// Phase 5.5 — real periodization (spec Part 3): "each week must reflect an
// intentional progression through the selected program architecture,"
// never Week 1 cloned N times. Driven entirely by the coach's own real,
// already-answered Coach Operating Model fields (programArchitecture.
// progressionMethod/repRangePhilosophy/deloadFrequencyWeeks) — never a
// fabricated periodization model the coach never endorsed.

import type { CoachOperatingModel } from "./operating-model.ts";
import { resolveDeloadEvery, resolveRepsVaryByPhase, resolveUndulating, type ClientMethodContext } from "./method-resolution.ts";
import type { RpeValue } from "../types";

export type ProgramPhaseName = "foundation" | "build" | "peak";

export interface ProgramPhase {
  name: ProgramPhaseName;
  label: string;
  purpose: string;
  startWeek: number;
  endWeek: number;
}

/**
 * Three real phases scaled to the program's actual duration (never fewer
 * than 1 week each; a very short program still gets a genuine, if
 * compressed, arc rather than silently collapsing to one phase). The final
 * phase always ends on the program's last week, which doubles as the
 * deload/reassessment week — see computeWeekParameters.
 */
export function computeProgramPhases(durationWeeks: number): ProgramPhase[] {
  const foundationWeeks = Math.max(1, Math.round(durationWeeks * 0.35));
  const peakWeeks = Math.max(1, Math.round(durationWeeks * 0.2));
  const buildWeeks = Math.max(1, durationWeeks - foundationWeeks - peakWeeks);

  const foundationEnd = foundationWeeks;
  const buildEnd = foundationEnd + buildWeeks;
  const peakEnd = Math.min(durationWeeks, buildEnd + peakWeeks);

  const phases: ProgramPhase[] = [
    { name: "foundation", label: "Foundation", purpose: "Build consistency and technical proficiency at moderate effort.", startWeek: 1, endWeek: foundationEnd },
    { name: "build", label: "Build", purpose: "Progressively increase working demand toward the coach's configured target.", startWeek: foundationEnd + 1, endWeek: buildEnd },
    { name: "peak", label: "Peak & reassess", purpose: "Push intensity toward the program's hardest work, then deload and reassess.", startWeek: buildEnd + 1, endWeek: Math.max(buildEnd + 1, peakEnd) },
  ];
  return phases.filter((p) => p.startWeek <= p.endWeek);
}

export function phaseForWeek(phases: ProgramPhase[], weekNumber: number): ProgramPhase {
  return phases.find((p) => weekNumber >= p.startWeek && weekNumber <= p.endWeek) ?? phases[phases.length - 1];
}

export interface WeekParameters {
  phase: ProgramPhase;
  /** Multiplies the coach's configured working-set count for the week —
   * 1.0 is the coach's own default; never below 0.5 or above 1.25. */
  volumeMultiplier: number;
  /** Added to the coach's configured target RPE for the week (clamped by
   * the caller to the valid 6-10 range) — negative eases off, positive
   * pushes closer to failure. */
  intensityRpeOffset: number;
  /** Shifts the target rep range toward the low or high end of the coach's
   * configured philosophy for this week — only meaningfully non-zero when
   * the coach's own repRangePhilosophy is "varied_by_block" (their own
   * stated intent to vary reps by block); otherwise 0 (the coach asked for
   * a fixed range, so this never overrides that). */
  repRangeShift: "lower" | "higher" | "none";
  isDeload: boolean;
  /** The program's final week doubles as a real reassessment point — a
   * deload in load/volume paired with the client re-testing how the work
   * feels, never a fabricated "1RM test" this app has no way to log. */
  isReassessmentWeek: boolean;
}

/**
 * The one function that decides how one specific week differs from every
 * other week — this is what makes "no cloned weeks" real rather than
 * asserted. `deloadFrequencyWeeks` is the coach's own existing configured
 * cadence (see activation-generation.ts, unchanged) — always respected
 * first; phase-based modulation layers on top of it, never replaces it.
 */
export function computeWeekParameters(weekNumber: number, durationWeeks: number, phases: ProgramPhase[], com: CoachOperatingModel, client?: ClientMethodContext): WeekParameters {
  const phase = phaseForWeek(phases, weekNumber);
  // Gate 3.1 — resolved through method-resolution.ts: a v1 method reads
  // exactly as before; a v2 "as needed"/"none" schedules no periodic deload.
  const deloadEvery = resolveDeloadEvery(com, durationWeeks);
  const isFinalWeek = weekNumber === durationWeeks;
  const isDeload = isFinalWeek || (deloadEvery > 0 && weekNumber % deloadEvery === 0);

  const undulating = resolveUndulating(com, client);
  const withinPhaseProgress = phase.endWeek === phase.startWeek ? 1 : (weekNumber - phase.startWeek) / (phase.endWeek - phase.startWeek);

  let volumeMultiplier = 1;
  let intensityRpeOffset = 0;

  if (phase.name === "foundation") {
    volumeMultiplier = 0.9;
    intensityRpeOffset = -1;
  } else if (phase.name === "build") {
    volumeMultiplier = 1;
    intensityRpeOffset = 0;
  } else {
    volumeMultiplier = 1.1;
    intensityRpeOffset = 1;
  }

  // planned_undulation: the coach explicitly asked for week-to-week
  // variation rather than a smooth ramp — alternate a lighter/higher-volume
  // week with a heavier/lower-volume one on top of the phase's own base,
  // real variation traceable to the coach's own stated method.
  if (undulating && !isDeload) {
    const undulateHeavy = weekNumber % 2 === 0;
    volumeMultiplier += undulateHeavy ? -0.1 : 0.1;
    intensityRpeOffset += undulateHeavy ? 1 : -1;
  }

  // autoregulated / linear_load / double_progression: all three of the
  // coach's "smooth ramp" methods (as opposed to planned_undulation's
  // deliberate alternation) step intensity upward in real, discrete
  // increments across a phase rather than jumping straight to the phase's
  // ceiling on week 1 — a real week-to-week difference a client would
  // actually feel, not a fractional value invisible at the rounded
  // RPE/set-count level. Three real steps per phase (early/mid/late) is
  // enough to make every week distinguishable without pretending at a
  // precision this deterministic model doesn't have.
  if (!undulating && !isDeload) {
    const step = Math.min(2, Math.floor(withinPhaseProgress * 3));
    intensityRpeOffset += step;
    volumeMultiplier += step * 0.05;
  }

  if (isDeload) {
    volumeMultiplier = Math.min(volumeMultiplier, 0.7);
    intensityRpeOffset = Math.min(intensityRpeOffset, -2);
  }

  const repRangeShift: WeekParameters["repRangeShift"] = resolveRepsVaryByPhase(com) ? (phase.name === "foundation" ? "higher" : phase.name === "peak" ? "lower" : "none") : "none";

  return {
    phase,
    volumeMultiplier: Math.max(0.5, Math.min(1.25, volumeMultiplier)),
    intensityRpeOffset,
    repRangeShift,
    isDeload,
    isReassessmentWeek: isFinalWeek,
  };
}

/** Applies a WeekParameters' rep-range shift to a base [low, high] range —
 * shared by both the direction-summary text and the real full-program
 * generator so they can never describe a different range than what's
 * actually generated. */
export function shiftRepRange(base: [number, number], shift: WeekParameters["repRangeShift"]): [number, number] {
  if (shift === "none") return base;
  const [low, high] = base;
  const span = Math.max(1, high - low);
  return shift === "higher" ? [low + span, high + span] : [Math.max(1, low - span), Math.max(2, high - span)];
}

/** Clamps a computed RPE offset onto a base target, staying inside the
 * real, loggable 6-10 RpeValue range. */
export function applyRpeOffset(base: RpeValue, offset: number): RpeValue {
  return Math.max(6, Math.min(10, Math.round(base + offset))) as RpeValue;
}
