// Phase 8C — Generated Program Review and Approval Workflow.
//
// Pure, framework-independent editing/diffing over UniversalTrainingProgramContent
// (schemaVersion 2) — never legacy content, never a text/JSON-serialized
// diff. An edit always targets one real TrainingItemInstance, addressed by
// its stable (weekNumber, dayOfWeek, sessionIndex, blockId, itemId) path —
// item ids are stable WITHIN a week but reused ACROSS weeks (the same
// generated slot, e.g. "item-monday-1-barbell-bench-press", recurs every
// week with different periodized values — see
// lib/coach/universal-program-generation.ts's id-building), so the full
// path, not the item id alone, is what makes an edit target unambiguous.
//
// Deterministic, side-effect-free, and never mutates its inputs — every
// function here returns a new value rather than editing in place.

import type { UniversalTrainingProgramContent, TrainingItemInstance, Prescription } from "./types.ts";
import type { DayOfWeek } from "../types";

export interface TrainingItemPath {
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  sessionIndex: number;
  blockId: string;
  itemId: string;
}

export interface LocatedTrainingItem extends TrainingItemPath {
  item: TrainingItemInstance;
}

/** Finds the FIRST item matching this exact path — there is always at most
 * one, since (week, day, session, block, item id) is a genuinely unique
 * coordinate in a well-formed program. Returns null rather than throwing;
 * callers decide how to surface "that item doesn't exist anymore." */
export function locateTrainingItem(content: UniversalTrainingProgramContent, path: TrainingItemPath): LocatedTrainingItem | null {
  const week = content.weeks.find((w) => w.weekNumber === path.weekNumber);
  const day = week?.days.find((d) => d.dayOfWeek === path.dayOfWeek);
  const session = day?.sessions?.[path.sessionIndex];
  const block = session?.blocks.find((b) => b.id === path.blockId);
  const item = block?.items.find((i) => i.id === path.itemId);
  if (!item) return null;
  return { ...path, item };
}

/** Every field a Phase 8C V1 edit is allowed to touch — see this phase's
 * completion report for the exact, deliberately bounded scope (pace/speed
 * and structural add/remove/reorder are out of scope for V1). All optional:
 * a patch only ever sets the fields the coach actually changed. */
export interface TrainingItemPatch {
  name?: string;
  sets?: number;
  repsLow?: number;
  repsHigh?: number;
  rpe?: number;
  rir?: number;
  loadValue?: number;
  loadUnit?: "lb" | "kg";
  restSeconds?: number;
  tempo?: string;
  warmupInstruction?: string;
  durationSeconds?: number;
  distanceValue?: number;
  distanceUnit?: "m" | "mi" | "km";
  heartRateLow?: number;
  heartRateHigh?: number;
}

function applyPatchToPrescription(prescription: Prescription, patch: TrainingItemPatch): Prescription {
  const next: Prescription = { ...prescription };
  if (patch.sets !== undefined) next.sets = patch.sets;
  if (patch.repsLow !== undefined || patch.repsHigh !== undefined) {
    next.reps = { low: patch.repsLow ?? prescription.reps?.low ?? 0, high: patch.repsHigh ?? prescription.reps?.high ?? 0 };
  }
  if (patch.rpe !== undefined) next.rpe = patch.rpe as Prescription["rpe"];
  if (patch.rir !== undefined) next.rir = patch.rir;
  // Gated on the PRIMARY numeric field alone, deliberately — the paired
  // unit <select> in the review UI always submits a real value (a <select>
  // has no true "empty" state the way a number input does when left
  // blank), so triggering on "either field present" would fabricate a
  // load/distance object out of thin air (value: 0) on every edit to an
  // item that never had one, purely because the unit dropdown's own
  // default was submitted alongside an unrelated field change.
  if (patch.loadValue !== undefined) {
    next.load = { value: patch.loadValue, unit: patch.loadUnit ?? prescription.load?.unit ?? "lb" };
  }
  if (patch.restSeconds !== undefined) next.restSeconds = patch.restSeconds;
  if (patch.tempo !== undefined) next.tempo = patch.tempo;
  if (patch.warmupInstruction !== undefined) next.warmupInstruction = patch.warmupInstruction;
  if (patch.durationSeconds !== undefined) next.duration = { seconds: patch.durationSeconds };
  if (patch.distanceValue !== undefined) {
    next.distance = { value: patch.distanceValue, unit: patch.distanceUnit ?? prescription.distance?.unit ?? "mi" };
  }
  if (patch.heartRateLow !== undefined || patch.heartRateHigh !== undefined) {
    next.heartRate = { low: patch.heartRateLow ?? prescription.heartRate?.low ?? 0, high: patch.heartRateHigh ?? prescription.heartRate?.high ?? 0, zoneLabel: prescription.heartRate?.zoneLabel };
  }
  return next;
}

/** Returns a NEW content tree with exactly one item's fields replaced —
 * the original `content` argument is never mutated. Throws if the target
 * item no longer exists (e.g. a stale path from an out-of-date page). */
export function applyTrainingItemPatch(content: UniversalTrainingProgramContent, path: TrainingItemPath, patch: TrainingItemPatch): UniversalTrainingProgramContent {
  const located = locateTrainingItem(content, path);
  if (!located) throw new Error(`applyTrainingItemPatch: no item at week ${path.weekNumber} ${path.dayOfWeek} session ${path.sessionIndex} block ${path.blockId} item ${path.itemId}`);

  return {
    ...content,
    weeks: content.weeks.map((week) => {
      if (week.weekNumber !== path.weekNumber) return week;
      return {
        ...week,
        days: week.days.map((day) => {
          if (day.dayOfWeek !== path.dayOfWeek) return day;
          return {
            ...day,
            sessions: day.sessions?.map((session, sessionIndex) => {
              if (sessionIndex !== path.sessionIndex) return session;
              return {
                ...session,
                blocks: session.blocks.map((block) => {
                  if (block.id !== path.blockId) return block;
                  return {
                    ...block,
                    items: block.items.map((item) => {
                      if (item.id !== path.itemId) return item;
                      return {
                        ...item,
                        name: patch.name ?? item.name,
                        prescription: applyPatchToPrescription(item.prescription, patch),
                      };
                    }),
                  };
                }),
              };
            }),
          };
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Structural, domain-aware diff — section 20/21: stable-id matching, never
// arbitrary text/JSON diffing as the signal. Used to build decision
// evidence at approval time, comparing the untouched original proposal
// against whatever the coach ultimately approved.
// ---------------------------------------------------------------------------

export interface TrainingItemFieldDelta extends TrainingItemPath {
  itemName: string;
  field: string;
  from: unknown;
  to: unknown;
}

const PRESCRIPTION_SCALAR_FIELDS = ["sets", "warmupSets", "rpe", "rir", "restSeconds", "tempo", "cadence", "warmupInstruction"] as const;
const PRESCRIPTION_STRUCT_FIELDS = ["reps", "load", "duration", "distance", "heartRate"] as const;

function comparePrescriptions(from: Prescription, to: Prescription): Array<{ field: string; from: unknown; to: unknown }> {
  const deltas: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const field of PRESCRIPTION_SCALAR_FIELDS) {
    if (from[field] !== to[field]) deltas.push({ field, from: from[field] ?? null, to: to[field] ?? null });
  }
  for (const field of PRESCRIPTION_STRUCT_FIELDS) {
    const a = from[field] ?? null;
    const b = to[field] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) deltas.push({ field, from: a, to: b });
  }
  return deltas;
}

function collectItemsByPath(content: UniversalTrainingProgramContent): Map<string, LocatedTrainingItem> {
  const map = new Map<string, LocatedTrainingItem>();
  for (const week of content.weeks) {
    for (const day of week.days) {
      if (day.type !== "training") continue;
      (day.sessions ?? []).forEach((session, sessionIndex) => {
        for (const block of session.blocks) {
          for (const item of block.items) {
            const path: TrainingItemPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id, itemId: item.id };
            map.set(pathKey(path), { ...path, item });
          }
        }
      });
    }
  }
  return map;
}

function pathKey(path: TrainingItemPath): string {
  return `${path.weekNumber}:${path.dayOfWeek}:${path.sessionIndex}:${path.blockId}:${path.itemId}`;
}

/** Every real, meaningful field-level difference between two universal
 * program trees — matched by stable item path, never by array position, so
 * a purely internal reordering or a regenerated id never produces false
 * evidence (section 21). An item present in one tree but not the other is
 * intentionally NOT reported here — V1 editing never adds or removes
 * items (section 8's own scope boundary), so that case doesn't arise from
 * a real edit; treating it as silence here (rather than fabricating an
 * "added"/"removed" entry for a case this phase's editor cannot itself
 * produce) is the honest choice. */
export function diffProgramProposal(original: UniversalTrainingProgramContent, chosen: UniversalTrainingProgramContent): TrainingItemFieldDelta[] {
  const originalItems = collectItemsByPath(original);
  const chosenItems = collectItemsByPath(chosen);
  const deltas: TrainingItemFieldDelta[] = [];

  for (const [key, chosenLocated] of chosenItems) {
    const originalLocated = originalItems.get(key);
    if (!originalLocated) continue;
    if (originalLocated.item.name !== chosenLocated.item.name) {
      deltas.push({ ...chosenLocated, itemName: chosenLocated.item.name, field: "name", from: originalLocated.item.name, to: chosenLocated.item.name });
    }
    for (const delta of comparePrescriptions(originalLocated.item.prescription, chosenLocated.item.prescription)) {
      deltas.push({ ...chosenLocated, itemName: chosenLocated.item.name, field: delta.field, from: delta.from, to: delta.to });
    }
  }
  return deltas;
}

/** Phase 8C spec section 27 — a coach editor must not silently forget an
 * active Phase 7B training restriction. Reuses the SAME avoided-term list
 * lib/coach/program-directions.ts's avoidedTermsForProfile already
 * computes (never a new medical-policy engine) — this function only ever
 * checks whether a proposal's own resistance item names collide with
 * terms the caller already determined are off-limits for this client, and
 * reports plain-language warnings. Never blocks/mutates anything itself —
 * callers decide how to surface this (spec: "validate/warn appropriately,"
 * never "silently forget," but coach authority remains non-negotiable —
 * see this phase's own section 3). */
export function findRestrictionConflicts(content: UniversalTrainingProgramContent, avoidedTerms: string[]): string[] {
  if (avoidedTerms.length === 0) return [];
  const warnings: string[] = [];
  for (const week of content.weeks) {
    for (const day of week.days) {
      if (day.type !== "training") continue;
      for (const session of day.sessions ?? []) {
        for (const block of session.blocks) {
          for (const item of block.items) {
            const name = item.name.toLowerCase();
            const matched = avoidedTerms.find((term) => name.includes(term));
            if (matched) warnings.push(`Week ${week.weekNumber}, ${day.dayOfWeek}: "${item.name}" may conflict with a documented client restriction ("${matched}").`);
          }
        }
      }
    }
  }
  return warnings;
}

/** Groups flat field deltas back up to one entry per item — this is the
 * granularity decision evidence actually uses (section 12: "one evidence
 * record per meaningful coach decision," not one row per field). */
export function groupDeltasByItem(deltas: TrainingItemFieldDelta[]): Array<{ path: TrainingItemPath; itemName: string; fields: Array<{ field: string; from: unknown; to: unknown }> }> {
  const groups = new Map<string, { path: TrainingItemPath; itemName: string; fields: Array<{ field: string; from: unknown; to: unknown }> }>();
  for (const delta of deltas) {
    const key = pathKey(delta);
    const path: TrainingItemPath = { weekNumber: delta.weekNumber, dayOfWeek: delta.dayOfWeek, sessionIndex: delta.sessionIndex, blockId: delta.blockId, itemId: delta.itemId };
    if (!groups.has(key)) groups.set(key, { path, itemName: delta.itemName, fields: [] });
    groups.get(key)!.fields.push({ field: delta.field, from: delta.from, to: delta.to });
  }
  return Array.from(groups.values());
}
