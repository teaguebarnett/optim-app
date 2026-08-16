// Weekly cardio aggregation — sums raw actual/target duration across
// evaluable days for a capped adherence ratio, while preserving the raw
// (uncapped) actual total separately. An approved alternative is always
// measured against its own selected option's target, never the default
// option's — see lib/history/derive-cardio.ts.

import { deriveCardioAdherence } from "../history/derive-cardio.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import type { DayRecordSlot } from "./collect-week-records";
import type { CardioCardModel, CardioDaySummaryModel } from "./types";

export function aggregateCardio(slots: DayRecordSlot[]): CardioCardModel {
  const days: CardioDaySummaryModel[] = [];
  let completedDurationMin = 0;
  let targetDurationMin = 0;
  let cappedCompletedMin = 0;
  let evaluableDays = 0;

  for (const slot of slots) {
    const dayOfWeek = localDateDayOfWeek(slot.dateIso);

    if (!slot.record || slot.isFuture) {
      const marker = slot.isFuture ? "future" : "no_record";
      days.push({ dateIso: slot.dateIso, dayOfWeek, outcome: marker, durationMin: 0, targetDurationMin: 0, usedApprovedAlternative: false });
      continue;
    }

    const result = deriveCardioAdherence(slot.record);
    const target = slot.record.cardio.selectedOptionSnapshot?.targetDurationMin ?? 0;
    const usedApprovedAlternative = slot.record.cardio.selectedOptionSnapshot?.isDefault === false;

    if (result.outcome !== "not_applicable") {
      evaluableDays += 1;
      completedDurationMin += slot.record.cardio.durationMin;
      targetDurationMin += target;
      cappedCompletedMin += target > 0 ? Math.min(slot.record.cardio.durationMin, target) : slot.record.cardio.durationMin;
    }

    days.push({
      dateIso: slot.dateIso,
      dayOfWeek,
      outcome: result.outcome,
      durationMin: slot.record.cardio.durationMin,
      targetDurationMin: target,
      usedApprovedAlternative,
    });
  }

  const adherenceRatio = targetDurationMin > 0 ? Math.min(1, cappedCompletedMin / targetDurationMin) : null;
  const status: CardioCardModel["status"] = evaluableDays === 0 ? "insufficient_data" : "ok";

  return { completedDurationMin, targetDurationMin, adherenceRatio, status, days };
}
