// Weekly cardio aggregation — sums raw actual/target duration across
// evaluable days for a capped adherence ratio, while preserving the raw
// (uncapped) actual total separately. An approved alternative is always
// measured against its own selected option's target, never the default
// option's — see lib/history/derive-cardio.ts.
//
// A day the client's coach-assigned program never prescribed cardio for is
// excluded from adherence entirely and reported "not_applicable" ("Not
// scheduled"), never conflated with a real missed day — a record's own
// cardioDayType snapshot is authoritative when a record exists; a day with
// no record at all (future, or a genuine gap) falls back to the client's
// live assigned schedule (see lib/mock-data.ts's isCardioAssignedForDay),
// the same schedule every other cardio-assignment check in this app reads.
//
// Today's cardio is still live/open — a not-yet-started or in-progress
// session is never reported as missed before the day is actually over (see
// the isToday branch below), matching the "current day" rule the rest of
// this derivation is held to.

import { deriveCardioAdherence } from "../history/derive-cardio.ts";
import { resolvedCardioDayType } from "../history/types.ts";
import { isCardioAssignedForDay } from "../mock-data.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import type { ClientProfileId } from "../tenancy/types";
import type { DayRecordSlot } from "./collect-week-records";
import type { CardioCardModel, CardioDaySummaryModel } from "./types";

export function aggregateCardio(slots: DayRecordSlot[], clientId: ClientProfileId): CardioCardModel {
  const days: CardioDaySummaryModel[] = [];
  let completedDurationMin = 0;
  let targetDurationMin = 0;
  let cappedCompletedMin = 0;
  let evaluableDays = 0;
  let assignedDays = 0;

  for (const slot of slots) {
    const dayOfWeek = localDateDayOfWeek(slot.dateIso);
    const isToday = slot.isToday;
    const assigned = slot.record ? resolvedCardioDayType(slot.record.cardio) === "scheduled" : isCardioAssignedForDay(clientId, dayOfWeek);

    if (!assigned) {
      days.push({ dateIso: slot.dateIso, dayOfWeek, outcome: "not_applicable", durationMin: 0, targetDurationMin: 0, usedApprovedAlternative: false, isToday });
      continue;
    }
    assignedDays += 1;

    if (!slot.record || slot.isFuture) {
      const marker = slot.isFuture ? "future" : "no_record";
      days.push({ dateIso: slot.dateIso, dayOfWeek, outcome: marker, durationMin: 0, targetDurationMin: 0, usedApprovedAlternative: false, isToday });
      continue;
    }

    const target = slot.record.cardio.selectedOptionSnapshot?.targetDurationMin ?? 0;

    if (isToday && (slot.record.cardio.status === "not-started" || slot.record.cardio.status === "in-progress")) {
      days.push({
        dateIso: slot.dateIso,
        dayOfWeek,
        outcome: "future",
        durationMin: slot.record.cardio.durationMin,
        targetDurationMin: target,
        usedApprovedAlternative: false,
        isToday,
      });
      continue;
    }

    const result = deriveCardioAdherence(slot.record);
    const usedApprovedAlternative = slot.record.cardio.selectedOptionSnapshot?.isDefault === false;

    evaluableDays += 1;
    completedDurationMin += slot.record.cardio.durationMin;
    targetDurationMin += target;
    cappedCompletedMin += target > 0 ? Math.min(slot.record.cardio.durationMin, target) : slot.record.cardio.durationMin;

    days.push({
      dateIso: slot.dateIso,
      dayOfWeek,
      outcome: result.outcome,
      durationMin: slot.record.cardio.durationMin,
      targetDurationMin: target,
      usedApprovedAlternative,
      isToday,
    });
  }

  const adherenceRatio = targetDurationMin > 0 ? Math.min(1, cappedCompletedMin / targetDurationMin) : null;
  const status: CardioCardModel["status"] = assignedDays === 0 ? "not_applicable" : evaluableDays === 0 ? "insufficient_data" : "ok";

  return { completedDurationMin, targetDurationMin, adherenceRatio, status, days };
}
