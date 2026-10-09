// Cardio Reasoner V1 — the coach's canonical cardio methodology, read from the active Coach Brain version's v2
// calibration answers. Two sources, never mixed with OPTIM defaults:
//   • Training / general-fitness / weight-management coaches: t_cardio_roles (+ weekly minutes per role),
//     g_intensity_guide, g_steps_target / w_steps_target.
//   • Endurance coaches: the e_* chapter (days, weekly hours, hard sessions, intensity distribution and method,
//     weekly increase, down weeks). V1 reads only what aerobic BASE work needs — race structure is out of scope.
// Every value keeps its Brain key so decisions can cite it. Nothing is defaulted.

import type { ConfirmedCoachMethod } from "../../coach/coach-brain.ts";
import { asRange } from "../../coach/calibration/model.ts";
import type { Range, Sourced } from "../planners/resistance/method.ts";

export const CARDIO_ROLES = ["optional_low_intensity", "fat_loss", "conditioning", "health"] as const;
export type CardioRole = (typeof CARDIO_ROLES)[number];
export const INTENSITY_METHODS = ["talk_test", "rpe", "heart_rate", "simple_words"] as const;
export type IntensityMethod = (typeof INTENSITY_METHODS)[number];

export interface CardioMethod {
  versionId: string;
  version: number;
  kind: "general" | "endurance";
  /** General coaches: the roles cardio plays, each with the coach's weekly minutes when stated. */
  roles: Sourced<CardioRole[]>;
  minutesByRole: Partial<Record<CardioRole, Sourced<Range>>>;
  /** How the coach guides intensity; null = not stated (OPTIM then uses only talk test / RPE, never heart rate). */
  intensityMethods: Sourced<IntensityMethod[]> | null;
  stepsTarget: Sourced<Range> | null;
  /** Endurance coaches only. */
  endurance: {
    days: Sourced<Range> | null;
    weeklyHours: Sourced<Range> | null;
    hardSessions: Sourced<Range> | null;
    intensityMix: Sourced<string> | null;
    weeklyIncreasePct: Sourced<Range> | null;
    downWeeks: Sourced<string> | null;
  } | null;
}

export type CardioMethodRead =
  | { ok: true; method: CardioMethod }
  | { ok: false; reason: "not_coached"; message: string }
  | { ok: false; reason: "incomplete"; missing: Array<{ key: string; why: string }> };

const toRange = (v: unknown): Range | null => {
  const r = asRange(v);
  return r ? { min: r.min, max: r.max ?? r.min } : null;
};
const strs = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const src = <T>(value: T | null, key: string): Sourced<T> | null => (value === null ? null : { value, keys: [key] });

export function readCardioMethod(method: ConfirmedCoachMethod): CardioMethodRead {
  const cal = method.operatingModel.calibration;
  if (cal?.schema !== 2) return { ok: false, reason: "incomplete", missing: [{ key: "calibration.schema", why: "The coach's method predates canonical calibration (v1)." }] };
  const a = cal.answers as Record<string, unknown>;
  const areas = strs(a.coaching_areas) ?? [];
  const endurance = areas.includes("endurance");
  const methods = (strs(endurance ? a.e_intensity_method : a.g_intensity_guide) ?? [])
    .map((x) => (x === "pace" || x === "power" ? null : x === "heart_rate" ? "heart_rate" : x === "rpe" ? "rpe" : x === "talk_test" ? "talk_test" : x === "simple_words" ? "simple_words" : null))
    .filter((x): x is IntensityMethod => !!x);
  const intensityMethods = methods.length ? { value: [...new Set(methods)], keys: [endurance ? "e_intensity_method" : "g_intensity_guide"] } : null;
  const stepsTarget = src(toRange(a.g_steps_target), "g_steps_target") ?? src(toRange(a.w_steps_target), "w_steps_target");

  if (endurance) {
    const missing: Array<{ key: string; why: string }> = [];
    const days = src(toRange(a.e_days), "e_days");
    if (!days) missing.push({ key: "e_days", why: "How many endurance days the coach programs." });
    const unit = str(a.e_volume_unit);
    const weeklyHours = unit === "hours" ? src(toRange(a.e_weekly_volume), "e_weekly_volume") : null;
    if (unit !== "hours") missing.push({ key: "e_volume_unit", why: "Cardio Reasoner V1 plans endurance volume in time; this coach measures it in distance or load, which V1 can't convert honestly." });
    if (missing.length) return { ok: false, reason: "incomplete", missing };
    return {
      ok: true,
      method: {
        versionId: method.versionId,
        version: method.version,
        kind: "endurance",
        roles: { value: ["conditioning"], keys: ["coaching_areas"] },
        minutesByRole: {},
        intensityMethods,
        stepsTarget,
        endurance: { days, weeklyHours, hardSessions: src(toRange(a.e_quality_sessions), "e_quality_sessions"), intensityMix: src(str(a.e_intensity_mix), "e_intensity_mix"), weeklyIncreasePct: src(toRange(a.e_weekly_increase), "e_weekly_increase"), downWeeks: src(str(a.e_down_weeks), "e_down_weeks") },
      },
    };
  }

  const roles = strs(a.t_cardio_roles);
  if (!roles) return { ok: false, reason: "incomplete", missing: [{ key: "t_cardio_roles", why: "Whether — and why — the coach prescribes cardio decides whether OPTIM may propose any." }] };
  if (roles.includes("none") || !roles.length) return { ok: false, reason: "not_coached", message: "This coach doesn't prescribe cardio, so OPTIM proposes none for their clients." };
  const known = roles.filter((r): r is CardioRole => (CARDIO_ROLES as readonly string[]).includes(r));
  const minutesByRole: CardioMethod["minutesByRole"] = {};
  const fl = src(toRange(a.t_cardio_fat_loss_minutes), "t_cardio_fat_loss_minutes");
  const he = src(toRange(a.t_cardio_health_minutes), "t_cardio_health_minutes");
  const co = src(toRange(a.t_conditioning_minutes), "t_conditioning_minutes");
  if (fl) minutesByRole.fat_loss = fl;
  if (he) minutesByRole.health = he;
  if (co) minutesByRole.conditioning = co;
  return { ok: true, method: { versionId: method.versionId, version: method.version, kind: "general", roles: { value: known, keys: ["t_cardio_roles"] }, minutesByRole, intensityMethods, stepsTarget, endurance: null } };
}
