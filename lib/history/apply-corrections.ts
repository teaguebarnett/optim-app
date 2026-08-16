// Deterministically derives the corrected/effective view of a DailyRecord
// from its stored original plus any Corrections that target it. The stored
// DailyRecord is never mutated — every caller that needs "what the record
// really says now" should go through applyCorrections rather than reading
// record fields directly, so a Correction always takes effect everywhere
// consistently.

import type { Correction, DailyRecord } from "./types";

function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = cursor[segments[i]];
    if (typeof next !== "object" || next === null) return; // unknown/invalid path — skip rather than throw
    cursor = next as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

/**
 * Applies every correction that targets `record.id`, in createdAtIso order
 * (oldest first, so a later correction to the same field always wins) —
 * never mutating `record`. Corrections targeting a different dailyRecordId
 * are ignored, so callers may pass a broader corrections list without
 * pre-filtering.
 */
export function applyCorrections(record: DailyRecord, corrections: Correction[]): DailyRecord {
  const applicable = corrections
    .filter((c) => c.dailyRecordId === record.id)
    .slice()
    .sort((a, b) => (a.createdAtIso < b.createdAtIso ? -1 : a.createdAtIso > b.createdAtIso ? 1 : 0));

  if (applicable.length === 0) return record;

  const next = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  for (const correction of applicable) {
    setByPath(next, correction.fieldPath, correction.correctedValue);
  }
  return next as unknown as DailyRecord;
}
