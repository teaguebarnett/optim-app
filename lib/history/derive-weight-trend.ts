// Weight-history/trend derivation — Phase 4 Required Derivation Correction
// #5: a 7-day rolling/trailing average is acceptable, but the trend must
// never fabricate or interpolate a missing day's weight, must always
// preserve the raw logged points, and must report an explicit
// insufficient-data state rather than a misleading trend line when too few
// points exist yet.

import type { DailyRecord } from "./types";
import { addDaysToLocalDate, compareLocalDates } from "../shared/local-date.ts";

/** Minimum distinct dated weight entries required before a trend is
 * reported at all — centralized so every caller agrees on the same
 * threshold rather than each guessing its own. */
export const MIN_WEIGHT_TREND_DAYS = 4;

export const DEFAULT_TREND_WINDOW_DAYS = 7;

export interface WeightTrendPoint {
  dateIso: string;
  /** The logged weight for this date. When more than one entry exists for
   * the same date, the latest by loggedAtIso wins for the trend value —
   * nothing is discarded from the underlying DailyRecords themselves, only
   * from this derived series. */
  weightLb: number;
  /** Trailing average over the window ending on this date, using only the
   * calendar days that actually have a logged point in that window — a gap
   * is excluded, never filled in. Null only if this point itself is the
   * sole value in its window (still shown as a raw point, just with no
   * meaningful average yet). */
  trailingAverageLb: number | null;
}

export interface WeightTrendResult {
  points: WeightTrendPoint[];
  status: "ok" | "insufficient_data";
}

export function deriveWeightTrend(
  records: DailyRecord[],
  windowDays: number = DEFAULT_TREND_WINDOW_DAYS
): WeightTrendResult {
  const latestByDate = new Map<string, { weightLb: number; loggedAtIso: string }>();
  for (const record of records) {
    if (record.weight.weightLb === null) continue;
    const loggedAtIso = record.weight.loggedAtIso ?? "";
    const existing = latestByDate.get(record.dateIso);
    if (!existing || loggedAtIso > existing.loggedAtIso) {
      latestByDate.set(record.dateIso, { weightLb: record.weight.weightLb, loggedAtIso });
    }
  }

  const dates = Array.from(latestByDate.keys()).sort(compareLocalDates);

  const points: WeightTrendPoint[] = dates.map((dateIso, index) => {
    const weightLb = latestByDate.get(dateIso)!.weightLb;
    const windowStart = addDaysToLocalDate(dateIso, -(windowDays - 1));
    const windowValues: number[] = [];
    for (let j = 0; j <= index; j++) {
      const candidate = dates[j];
      if (compareLocalDates(candidate, windowStart) >= 0 && compareLocalDates(candidate, dateIso) <= 0) {
        windowValues.push(latestByDate.get(candidate)!.weightLb);
      }
    }
    const trailingAverageLb =
      windowValues.length > 0 ? Math.round((windowValues.reduce((sum, v) => sum + v, 0) / windowValues.length) * 10) / 10 : null;
    return { dateIso, weightLb, trailingAverageLb };
  });

  return { points, status: dates.length >= MIN_WEIGHT_TREND_DAYS ? "ok" : "insufficient_data" };
}
