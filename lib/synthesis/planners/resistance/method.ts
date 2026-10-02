// Gate 4.0C-2 — the coach's canonical resistance methodology, read straight
// from the active Coach Brain version's v2 calibration answers (not the
// legacy programArchitecture projection). Every value keeps the Brain key
// it came from so decisions can cite it. Nothing is defaulted: a missing
// required answer is reported, and a v1-only method can't be planned from.

import type { ConfirmedCoachMethod } from "../../../coach/coach-brain.ts";
import { asLayered, asRange, baseOf } from "../../../coach/calibration/model.ts";

export interface Range {
  min: number;
  max: number;
  preferred?: number;
}

export interface Sourced<T> {
  value: T;
  /** Brain keys (e.g. "t_sets.exceptions.main") that produced it. */
  keys: string[];
}

export type ProgressionMethod = "add_load_when_reps_hit" | "double_progression" | "add_reps_or_sets" | "percentage_waves" | "autoregulated" | "small_steps_by_feel";
export type SplitId = "full_body" | "upper_lower" | "push_pull_legs" | "body_part_split" | "full_body_high_frequency";

export interface ResistanceMethod {
  versionId: string;
  version: number;
  days: Sourced<Range>;
  sessionLength: Sourced<Range> | null;
  /** Splits for a day count: the coach's day-count exception, else their base list. */
  splitsFor(dayCount: number): Sourced<SplitId[]>;
  sets: { main: Sourced<Range>; accessory: Sourced<Range> };
  reps: { main: Sourced<Range>; accessory: Sourced<Range>; variesByPhase: boolean };
  effort: {
    metrics: string[];
    rir: { main: Sourced<Range>; accessory: Sourced<Range> } | null;
    plain: Sourced<"comfortable" | "challenging" | "very_hard"> | null;
  };
  rest: { main: Sourced<Range>; accessory: Sourced<Range> } | null;
  progression: { main: Sourced<ProgressionMethod[]>; accessory: Sourced<ProgressionMethod[]> };
  longTermStructure: Sourced<string> | null;
  deload: Sourced<{ approach: "fixed" | "as_needed" | "none"; every: Range | null; triggers: string[] }>;
  warmup: Sourced<string> | null;
  whenShort: Sourced<string[]> | null;
  programLengthWeeks: Sourced<Range> | null;
  /** Exercises the coach avoids, as the coach typed them (resolved by exact name/alias only). */
  exercisesAvoided: Sourced<string[]>;
}

export type MethodRead = { ok: true; method: ResistanceMethod } | { ok: false; missing: Array<{ key: string; why: string }> };

const isNa = (v: unknown) => !!v && typeof v === "object" && (v as { notApplicable?: boolean }).notApplicable === true;
const toRange = (v: unknown): Range | null => {
  const r = asRange(v);
  if (!r) return null;
  return { min: r.min, max: r.max ?? r.min, ...(typeof r.preferred === "number" ? { preferred: r.preferred } : {}) };
};

/** Maps the client's intake experience onto the coach's experience keys. */
export function experienceKey(trainingExperience: string | undefined): "beginner" | "intermediate" | "advanced" | null {
  if (trainingExperience === "new" || trainingExperience === "learning_fundamentals") return "beginner";
  if (trainingExperience === "comfortable_common") return "intermediate";
  if (trainingExperience === "experienced_consistent") return "advanced";
  return null;
}

export function readResistanceMethod(method: ConfirmedCoachMethod, client: { trainingExperience?: string }): MethodRead {
  const cal = method.operatingModel.calibration;
  if (cal?.schema !== 2) return { ok: false, missing: [{ key: "calibration.schema", why: "The coach's method predates canonical calibration (v1). Refining it in Settings gives the planner the coach's own resistance rules." }] };
  const a = cal.answers as Record<string, unknown>;
  const missing: Array<{ key: string; why: string }> = [];
  const exp = experienceKey(client.trainingExperience);

  /** A layered range for an exercise type: exercise-type or experience exception, else base. */
  const layeredRange = (key: string, role: "main" | "accessory"): Sourced<Range> | null => {
    const raw = a[key];
    if (raw === undefined || isNa(raw)) return null;
    const l = asLayered(raw);
    if (!l) {
      const r = toRange(raw);
      return r ? { value: r, keys: [key] } : null;
    }
    const ex = l.exceptions ?? {};
    if (l.varies === "exercise_type" && toRange(ex[role])) return { value: toRange(ex[role])!, keys: [`${key}.exceptions.${role}`] };
    if (l.varies === "experience_level" && exp && toRange(ex[exp])) return { value: toRange(ex[exp])!, keys: [`${key}.exceptions.${exp}`] };
    const base = toRange(l.base);
    return base ? { value: base, keys: [`${key}.base`] } : null;
  };
  const layeredList = <T extends string>(key: string, role?: "main" | "accessory"): Sourced<T[]> | null => {
    const raw = a[key];
    if (raw === undefined || isNa(raw)) return null;
    const l = asLayered(raw);
    const pick = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => typeof x === "string") as T[]) : null);
    if (l) {
      const ex = l.exceptions ?? {};
      if (role && l.varies === "exercise_type" && pick(ex[role])?.length) return { value: pick(ex[role])!, keys: [`${key}.exceptions.${role}`] };
      if (l.varies === "experience_level" && exp && pick(ex[exp])?.length) return { value: pick(ex[exp])!, keys: [`${key}.exceptions.${exp}`] };
      return pick(l.base) ? { value: pick(l.base)!, keys: [`${key}.base`] } : null;
    }
    return pick(raw) ? { value: pick(raw)!, keys: [key] } : null;
  };
  const need = <T>(v: T | null, key: string, why: string): T => {
    if (v === null) missing.push({ key, why });
    return v as T;
  };

  const daysRaw = toRange(baseOf(a.t_days));
  const days = need(daysRaw ? { value: daysRaw, keys: ["t_days.base"] } : null, "t_days", "Training-day range bounds the frequency decision.");
  const sessionLength = !isNa(a.t_session_length) && toRange(a.t_session_length) ? { value: toRange(a.t_session_length)!, keys: ["t_session_length"] } : null;
  const setsMain = need(layeredRange("t_sets", "main"), "t_sets", "Working sets per exercise.");
  const setsAcc = layeredRange("t_sets", "accessory") ?? setsMain;
  const repsMain = need(layeredRange("t_reps", "main"), "t_reps", "Rep range.");
  const repsAcc = layeredRange("t_reps", "accessory") ?? repsMain;
  const metrics = Array.isArray(a.t_effort_metric) ? (a.t_effort_metric as string[]) : [];
  const rirMain = layeredRange("t_effort_rir", "main");
  const plainRaw = typeof a.t_effort_plain === "string" ? (a.t_effort_plain as "comfortable" | "challenging" | "very_hard") : null;
  if (!rirMain && !plainRaw) missing.push({ key: "t_effort_rir", why: "How hard working sets should be." });
  const restMain = layeredRange("t_rest_periods", "main");
  const progMain = need(layeredList<ProgressionMethod>("t_progression_method", "main"), "t_progression_method", "How the coach progresses week to week.");
  const progAcc = layeredList<ProgressionMethod>("t_progression_method", "accessory") ?? progMain;
  const lt = asLayered(a.t_long_term_structure);
  const ltValue = lt ? (exp && typeof lt.exceptions?.[exp] === "string" ? { value: lt.exceptions[exp] as string, keys: [`t_long_term_structure.exceptions.${exp}`] } : typeof lt.base === "string" ? { value: lt.base, keys: ["t_long_term_structure.base"] } : null) : typeof a.t_long_term_structure === "string" ? { value: a.t_long_term_structure as string, keys: ["t_long_term_structure"] } : null;
  const approach = a.t_deload_approach;
  if (approach !== "fixed" && approach !== "as_needed" && approach !== "none") missing.push({ key: "t_deload_approach", why: "How deloads are handled." });
  const every = approach === "fixed" ? toRange(a.t_deload_every) : null;
  if (approach === "fixed" && !every) missing.push({ key: "t_deload_every", why: "A scheduled deload needs its interval." });
  const splitsRaw = asLayered(a.t_splits);
  if (!splitsRaw && !Array.isArray(a.t_splits)) missing.push({ key: "t_splits", why: "Which splits the coach uses." });
  const lengthRange = toRange(baseOf(a.program_length));

  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    method: {
      versionId: method.versionId,
      version: method.version,
      days,
      sessionLength,
      splitsFor(dayCount: number) {
        const exc = splitsRaw?.varies === "day_count" ? splitsRaw.exceptions?.[String(dayCount)] : undefined;
        if (Array.isArray(exc) && exc.length) return { value: exc as SplitId[], keys: [`t_splits.exceptions.${dayCount}`] };
        const base = splitsRaw ? splitsRaw.base : a.t_splits;
        return { value: (Array.isArray(base) ? base : []) as SplitId[], keys: [splitsRaw ? "t_splits.base" : "t_splits"] };
      },
      sets: { main: setsMain, accessory: setsAcc },
      reps: { main: repsMain, accessory: repsAcc, variesByPhase: asLayered(a.t_reps)?.varies === "program_phase" },
      effort: {
        metrics,
        rir: rirMain ? { main: rirMain, accessory: layeredRange("t_effort_rir", "accessory") ?? rirMain } : null,
        plain: plainRaw ? { value: plainRaw, keys: ["t_effort_plain"] } : null,
      },
      rest: restMain ? { main: restMain, accessory: layeredRange("t_rest_periods", "accessory") ?? restMain } : null,
      progression: { main: progMain, accessory: progAcc },
      longTermStructure: ltValue,
      deload: { value: { approach: approach as "fixed" | "as_needed" | "none", every, triggers: Array.isArray(a.t_deload_triggers) ? (a.t_deload_triggers as string[]) : [] }, keys: ["t_deload_approach", ...(every ? ["t_deload_every"] : []), ...(Array.isArray(a.t_deload_triggers) ? ["t_deload_triggers"] : [])] },
      warmup: typeof a.t_warmup === "string" ? { value: a.t_warmup, keys: ["t_warmup"] } : null,
      whenShort: Array.isArray(a.t_when_short) ? { value: a.t_when_short as string[], keys: ["t_when_short"] } : null,
      programLengthWeeks: lengthRange ? { value: lengthRange, keys: ["program_length.base"] } : null,
      exercisesAvoided: { value: Array.isArray(a.t_exercises_avoided) ? (a.t_exercises_avoided as string[]) : [], keys: ["t_exercises_avoided"] },
    },
  };
}
