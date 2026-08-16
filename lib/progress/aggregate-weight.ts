// Weight-card aggregation — thin wrapper over Phase 4.1's tested
// deriveWeightTrend (7-day trailing average, MIN_WEIGHT_TREND_DAYS
// threshold, same-date-dedup, never interpolated) that also marks which raw
// points were corrected and computes the program-start comparison from the
// earliest valid weigh-in actually within range, never an unrelated global
// weight value.

import { deriveWeightTrend } from "../history/derive-weight-trend.ts";
import type { DayRecordSlot } from "./collect-week-records";
import type { DailyRecord } from "../history/types";
import type { WeightCardModel, WeightRangeKey, WeightRangeModel } from "./types";

function slotsToRecords(slots: DayRecordSlot[]): DailyRecord[] {
  const records: DailyRecord[] = [];
  for (const slot of slots) {
    if (slot.record) records.push(slot.record);
  }
  return records;
}

function buildRange(slots: DayRecordSlot[], key: WeightRangeKey): WeightRangeModel {
  const records = slotsToRecords(slots);
  const trend = deriveWeightTrend(records);
  const correctedDates = new Set(
    slots.filter((s) => s.correctedFieldPaths.some((p) => p.startsWith("weight."))).map((s) => s.dateIso)
  );

  return {
    key,
    label: key === "fourWeeks" ? "4 Weeks" : "Full Program",
    rawPoints: trend.points.map((p) => ({ dateIso: p.dateIso, weightLb: p.weightLb, isCorrected: correctedDates.has(p.dateIso) })),
    trendPoints: trend.points.map((p) => ({ dateIso: p.dateIso, trailingAverageLb: p.trailingAverageLb })),
    status: trend.points.length === 0 ? "empty" : trend.status,
  };
}

export function aggregateWeight(fourWeekSlots: DayRecordSlot[], fullProgramSlots: DayRecordSlot[]): WeightCardModel {
  const fourWeeks = buildRange(fourWeekSlots, "fourWeeks");
  const fullProgram = buildRange(fullProgramSlots, "fullProgram");

  const earliestPoint = fullProgram.rawPoints[0] ?? null;
  const latestPoint = fullProgram.rawPoints[fullProgram.rawPoints.length - 1] ?? null;
  const hasValidChange = !!earliestPoint && !!latestPoint && earliestPoint.dateIso !== latestPoint.dateIso;

  return {
    latestWeightLb: latestPoint?.weightLb ?? null,
    latestDateIso: latestPoint?.dateIso ?? null,
    changeSinceProgramStartLb: hasValidChange ? Math.round((latestPoint!.weightLb - earliestPoint!.weightLb) * 10) / 10 : null,
    changeStatus: hasValidChange ? "ok" : "insufficient_data",
    ranges: { fourWeeks, fullProgram },
  };
}
