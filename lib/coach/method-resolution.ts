// Gate 3.1 — how live generation reads a coach's method.
//
// One deterministic contract per value. A method confirmed through
// calibration v2 (`model.calibration`) is read from the coach's own answers:
// a coach-provided range is a CONSTRAINT — never collapsed to a midpoint,
// never silently widened, and a value inside it is chosen only by the rule
// documented on each function (or by the coach's own preferred value or
// exception). A v1 method (no `model.calibration`) is read exactly as before
// Gate 3.1, so active v1 coaches generate identical programs.
//
// Pure. Shared by program-directions.ts, universal-program-generation.ts,
// program-periodization.ts and activation-generation.ts.

import type { CoachOperatingModel } from "./operating-model.ts";
import type { RangeAnswer } from "./calibration/types.ts";
import { asLayered, asRange, baseOf, PLAIN_EFFORT_RIR } from "./calibration/model.ts";

export type RpeTarget = 6 | 7 | 8 | 9 | 10;

/** Client facts a contract may use to pick an exception. */
export interface ClientMethodContext {
  /** The client's own intake experience answer, if known. */
  trainingExperience?: string | null;
}

function v2(com: CoachOperatingModel): Record<string, unknown> | null {
  return com.calibration?.schema === 2 ? com.calibration.answers : null;
}

function isNa(v: unknown): boolean {
  return !!v && typeof v === "object" && (v as { notApplicable?: boolean }).notApplicable === true;
}

/** Maps the client's own intake experience answer onto the coach's
 * experience keys. Unknown experience → no experience exception applies. */
export function experienceKeyFor(client?: ClientMethodContext): string | null {
  const e = client?.trainingExperience;
  if (e === "new" || e === "learning_fundamentals") return "beginner";
  if (e === "comfortable_common") return "intermediate";
  if (e === "experienced_consistent") return "advanced";
  return null;
}

/** A layered range for this context: an exception for the exercise type
 * (or, when the coach varies by experience, the client's experience level)
 * wins; otherwise the base range. */
function layeredRange(raw: unknown, isCompound: boolean, client?: ClientMethodContext): RangeAnswer | undefined {
  const l = asLayered(raw);
  if (!l) return asRange(raw);
  const ex = l.exceptions ?? {};
  if (l.varies === "exercise_type") return asRange(ex[isCompound ? "main" : "accessory"]) ?? asRange(l.base);
  if (l.varies === "experience_level") {
    const key = experienceKeyFor(client);
    return (key ? asRange(ex[key]) : undefined) ?? asRange(l.base);
  }
  return asRange(l.base);
}

const legacyRepRange = (philosophy: string): [number, number] => (philosophy === "strength_low_3_6" ? [3, 6] : philosophy === "higher_12_20" ? [12, 20] : [8, 12]);

/** Rep range for one exercise. v2: the coach's range (exception or base). */
export function resolveRepRange(com: CoachOperatingModel, isCompound: boolean): [number, number] {
  const a = v2(com);
  if (!a) return legacyRepRange(com.programArchitecture.repRangePhilosophy);
  const r = layeredRange(a.t_reps, isCompound);
  if (!r) return legacyRepRange(com.programArchitecture.repRangePhilosophy);
  return [r.min, r.max ?? r.min];
}

/** Whether the coach shifts rep ranges across program phases. */
export function resolveRepsVaryByPhase(com: CoachOperatingModel): boolean {
  const a = v2(com);
  if (!a) return com.programArchitecture.repRangePhilosophy === "varied_by_block";
  return asLayered(a.t_reps)?.varies === "program_phase";
}

/**
 * Phase-adjusted rep range. v1: the existing shift (which may move beyond the
 * base range). v2: stays INSIDE the coach's range — foundation phases use the
 * upper half, peak phases the lower half, other phases the whole range.
 */
export function resolvePhaseRepRange(com: CoachOperatingModel, isCompound: boolean, shift: "lower" | "higher" | "none"): [number, number] {
  const [lo, hi] = resolveRepRange(com, isCompound);
  if (!v2(com)) {
    if (shift === "none") return [lo, hi];
    const span = Math.max(1, hi - lo);
    return shift === "higher" ? [lo + span, hi + span] : [Math.max(1, lo - span), Math.max(2, hi - span)];
  }
  if (shift === "none" || hi - lo < 2) return [lo, hi];
  const half = Math.floor((hi - lo) / 2);
  return shift === "higher" ? [hi - half, hi] : [lo, lo + half];
}

function rirRange(com: CoachOperatingModel, isCompound: boolean): RangeAnswer | undefined {
  const a = v2(com);
  if (!a) return undefined;
  const plain = typeof a.t_effort_plain === "string" ? PLAIN_EFFORT_RIR[a.t_effort_plain] : undefined;
  if (plain) return { min: plain[0], max: plain[1], unit: "reps in reserve" };
  return layeredRange(a.t_effort_rir, isCompound);
}

const clampRpe = (n: number): RpeTarget => Math.max(6, Math.min(10, Math.round(n))) as RpeTarget;

/**
 * Base RPE target. v1: the existing proximity mapping. v2: one rep above the
 * hardest end of the coach's RIR range, never outside it — target RIR =
 * min(min RIR + 1, max RIR); RPE = 10 − target RIR. (For the three v1 bands
 * this reproduces the v1 targets exactly: 0–1 → 9, 1–2 → 8, 2–4 → 7.)
 */
export function resolveBaseRpe(com: CoachOperatingModel, isCompound: boolean): RpeTarget {
  const r = rirRange(com, isCompound);
  if (!r) {
    const p = com.programArchitecture.proximityToFailure;
    return p === "0_1_reps_in_reserve" ? 9 : p === "2_4_reps_in_reserve" ? 7 : 8;
  }
  const max = r.max ?? r.min;
  return clampRpe(10 - Math.min(r.min + 1, max));
}

/** Keeps a phase-adjusted RPE inside the coach's RIR range (v2 only). A
 * deload may go easier than the range, never harder. */
export function constrainRpe(com: CoachOperatingModel, isCompound: boolean, rpe: number, isDeload: boolean): RpeTarget {
  const r = rirRange(com, isCompound);
  if (!r) return clampRpe(rpe);
  const hardest = 10 - r.min; // fewest reps in reserve
  const easiest = 10 - (r.max ?? r.min);
  const capped = Math.min(rpe, hardest);
  return clampRpe(isDeload ? capped : Math.max(capped, easiest));
}

/** Working sets before phase scaling. Main lifts use the top of the coach's
 * range, accessories the bottom (unchanged from v1); exceptions for exercise
 * type or the client's experience level apply first. */
export function resolveBaseSets(com: CoachOperatingModel, isCompound: boolean, client?: ClientMethodContext): number {
  const a = v2(com);
  const r = a ? layeredRange(a.t_sets, isCompound, client) : undefined;
  if (!r) return isCompound ? com.programArchitecture.setsPerExerciseMax : com.programArchitecture.setsPerExerciseMin;
  return isCompound ? (r.max ?? r.min) : r.min;
}

/** Keeps phase-scaled sets inside the coach's range (v2 only). A deload may
 * drop below it, never above it. */
export function constrainSets(com: CoachOperatingModel, isCompound: boolean, sets: number, isDeload: boolean, client?: ClientMethodContext): number {
  const a = v2(com);
  const r = a ? layeredRange(a.t_sets, isCompound, client) : undefined;
  if (!r) return Math.max(1, sets);
  const top = r.max ?? r.min;
  const capped = Math.min(sets, top);
  return Math.max(1, isDeload ? capped : Math.max(capped, r.min));
}

/**
 * Weeks between scheduled deloads; 0 = no periodic deload. v1: the stored
 * value, defaulting to 6 as before. v2: "as needed" or "none" schedules no
 * periodic deload (the final reassessment week is a product structure, not
 * a deload rule). A fixed range picks the N inside it that leaves the fewest
 * leftover weeks in this program; ties go to the larger N.
 */
export function resolveDeloadEvery(com: CoachOperatingModel, durationWeeks: number): number {
  const a = v2(com);
  if (!a) return com.programArchitecture.deloadFrequencyWeeks ?? 6;
  if (a.t_deload_approach !== "fixed") return 0;
  const r = asRange(a.t_deload_every);
  if (!r) return 0;
  const hi = r.max ?? r.min;
  let best = r.min;
  for (let n = r.min; n <= hi; n++) {
    const leftover = durationWeeks % n;
    if (leftover < durationWeeks % best || (leftover === durationWeeks % best && n > best)) best = n;
  }
  return Math.max(1, best);
}

/** Whether week-to-week intensity alternates (undulating structure). */
export function resolveUndulating(com: CoachOperatingModel, client?: ClientMethodContext): boolean {
  const a = v2(com);
  if (!a) return com.programArchitecture.progressionMethod === "planned_undulation";
  const l = asLayered(a.t_long_term_structure);
  if (!l) return false;
  const key = experienceKeyFor(client);
  const value = l.varies === "experience_level" && key && typeof l.exceptions?.[key] === "string" ? l.exceptions[key] : l.base;
  return value === "undulating";
}

/** Resistance days for this client: capped by the coach's maximum. v2 also
 * reports when the client's availability is below the coach's minimum. */
export function resolveResistanceDays(com: CoachOperatingModel, availableDays: number): { count: number; belowCoachMinimum: number | null } {
  const a = v2(com);
  const r = a ? asRange(baseOf(a.t_days)) : undefined;
  const max = r ? (r.max ?? r.min) : com.programArchitecture.typicalFrequencyDaysMax;
  const count = Math.max(1, Math.min(availableDays, max));
  return { count, belowCoachMinimum: r && availableDays < r.min ? r.min : null };
}

/**
 * Session-length ceiling used to fit exercises. v1: the client's own maximum.
 * v2: the lower of the client's maximum and the coach's maximum; if the
 * client's maximum is below the coach's minimum, the client's maximum wins
 * and it's flagged. With no client maximum: the coach's preferred value,
 * otherwise the coach's maximum (it's a ceiling, not a target).
 */
export function resolveSessionCap(com: CoachOperatingModel, clientMaxMinutes: number | null | undefined): { cap: number; belowCoachMinimum: number | null } {
  const a = v2(com);
  const r = a && !isNa(a.t_session_length) ? asRange(a.t_session_length) : undefined;
  const clientMax = typeof clientMaxMinutes === "number" && Number.isFinite(clientMaxMinutes) && clientMaxMinutes > 0 ? clientMaxMinutes : null;
  if (!r) return { cap: clientMax ?? 60, belowCoachMinimum: null };
  const coachMax = r.max ?? r.min;
  if (clientMax === null) return { cap: r.preferred ?? coachMax, belowCoachMinimum: null };
  return { cap: Math.min(clientMax, coachMax), belowCoachMinimum: clientMax < r.min ? r.min : null };
}

/** The splits OPTIM may choose from for this many training days: the
 * coach's own day-count exception if they set one, otherwise their splits. */
export function resolvePreferredSplits(com: CoachOperatingModel, dayCount: number): string[] {
  const a = v2(com);
  if (!a) return com.programArchitecture.preferredSplits;
  const l = asLayered(a.t_splits);
  if (!l) return com.programArchitecture.preferredSplits;
  const exception = l.varies === "day_count" ? l.exceptions?.[String(dayCount)] : undefined;
  const pick = Array.isArray(exception) && exception.length ? exception : l.base;
  return Array.isArray(pick) ? (pick as string[]) : com.programArchitecture.preferredSplits;
}

/** The coach's usual program length (proposal form hint), if they set one. */
export function resolveProgramLengthHint(com: CoachOperatingModel | null | undefined): { min: number; max: number | null; preferred: number | null } | null {
  if (!com) return null;
  const a = v2(com);
  if (!a) return null;
  const r = asRange(baseOf(a.program_length));
  return r ? { min: r.min, max: r.max, preferred: r.preferred ?? null } : null;
}

/** Whether a v2 method covers resistance programming at all. A v1 method
 * always did (it had no notion of areas). */
export function methodCoversResistance(com: CoachOperatingModel): boolean {
  const a = v2(com);
  if (!a) return true;
  return ["t_days", "t_sets", "t_reps", "t_splits"].every((k) => a[k] !== undefined && !isNa(a[k])) && (a.t_effort_rir !== undefined || a.t_effort_plain !== undefined);
}
