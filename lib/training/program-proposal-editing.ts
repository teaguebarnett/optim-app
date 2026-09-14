// Phase 8C/8D — Generated Program Review and Approval Workflow.
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
// Phase 8D extends this file across the full training horizon (not just
// week 1) and adds a small, deliberately bounded set of structural edits:
// item removal, item addition, item reordering (both within a block and
// across blocks in a session), session rename, and converting a training
// day to a rest day.
//
// A real generated RESISTANCE session places exactly one item per block —
// one block per exercise (see universal-program-generation.ts's own
// `blocks: items.map((item, i) => ({..., items: [item]}))`) — while a real
// CONTINUOUS/cardio session has exactly one block total. This matters for
// two reasons this file has to get right: (1) removing the sole item in a
// block must also remove the now-empty block, or every real removal would
// leave structurally invalid content (caught live against a real generated
// program during this phase's own E2E verification); (2) "reordering
// exercises in a session" for real content means reordering BLOCKS, not
// items within one — see moveBlock below, which is the practical mechanism
// this phase actually needs; moveTrainingItem (within-block reordering)
// stays correct and available for the rarer coach-authored multi-item
// block (a real superset/circuit), but is a no-op against any block
// generation itself ever produces today.
//
// Execution order is driven by Block.order (sorted) then
// TrainingItemInstance.order within a block — see
// lib/workout/session-flow.ts's buildInitialFlowState — NOT array
// position, so every reordering function here swaps the real `order`
// field, never just array position, or the change would have zero effect
// on actual workout execution.
//
// Converting a REST day into a training day is not supported — that would
// require synthesizing real prescriptions from nothing, which is
// generation/authoring infrastructure, not an edit to already-generated
// content (this phase's own "no blank-canvas builder" boundary).
//
// Deterministic, side-effect-free, and never mutates its inputs — every
// function here returns a new value rather than editing in place.

import type { UniversalTrainingProgramContent, TrainingItemInstance, Prescription, ExecutionFamily, Block, Session } from "./types.ts";
import type { DayOfWeek } from "../types";

export interface TrainingItemPath {
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  sessionIndex: number;
  blockId: string;
  itemId: string;
}

export interface SessionPath {
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  sessionIndex: number;
}

export interface BlockPath extends SessionPath {
  blockId: string;
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

/** Every field a V1 edit is allowed to touch — see this phase's completion
 * report for the exact, deliberately bounded scope. All optional: a patch
 * only ever sets the fields the coach actually changed. */
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
  warmupSets?: number;
  durationSeconds?: number;
  distanceValue?: number;
  distanceUnit?: "m" | "mi" | "km";
  heartRateLow?: number;
  heartRateHigh?: number;
  /** Phase 8D — closes the pace gap Phase 8C documented: PrescriptionPace
   * already exists in the universal grammar and is already read by the
   * real execution/display path (lib/workout/continuous.ts's formatPace),
   * so this is completing existing support, not inventing a new primitive.
   * "Speed" (e.g. mph) has no corresponding grammar primitive anywhere in
   * this codebase today (only pace, in min/mi or min/km) — this phase does
   * not fabricate one; see this phase's completion report. */
  paceValue?: number;
  paceUnit?: "min_per_mi" | "min_per_km";
  /** Phase 11A — interval-only fields. `distanceValue`/`distanceUnit` above
   * are reused for the WORK target of a distance-based interval (the same
   * primitive continuous already edits); these three are additive and
   * interval-specific. */
  rounds?: number;
  workIntervalSeconds?: number;
  recoveryIntervalSeconds?: number;
  recoveryDistanceValue?: number;
  recoveryDistanceUnit?: "m" | "mi" | "km";
  /** Phase 11C — power's own contacts primitive (never conflated with
   * reps — spec section 6), and mobility's side selection. `sets`, `reps`,
   * `distance*`, `duration*`, and `restSeconds` above are already
   * genuinely shared with power/mobility, so only these two are new. */
  contactsValue?: number;
  side?: "left" | "right" | "alternating" | "bilateral";
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
  // load/distance/pace object out of thin air (value: 0) on every edit to
  // an item that never had one, purely because the unit dropdown's own
  // default was submitted alongside an unrelated field change.
  if (patch.loadValue !== undefined) {
    next.load = { value: patch.loadValue, unit: patch.loadUnit ?? prescription.load?.unit ?? "lb" };
  }
  if (patch.restSeconds !== undefined) next.restSeconds = patch.restSeconds;
  if (patch.tempo !== undefined) next.tempo = patch.tempo;
  if (patch.warmupInstruction !== undefined) next.warmupInstruction = patch.warmupInstruction;
  if (patch.warmupSets !== undefined) next.warmupSets = patch.warmupSets;
  if (patch.durationSeconds !== undefined) next.duration = { seconds: patch.durationSeconds };
  if (patch.distanceValue !== undefined) {
    next.distance = { value: patch.distanceValue, unit: patch.distanceUnit ?? prescription.distance?.unit ?? "mi" };
  }
  if (patch.heartRateLow !== undefined || patch.heartRateHigh !== undefined) {
    next.heartRate = { low: patch.heartRateLow ?? prescription.heartRate?.low ?? 0, high: patch.heartRateHigh ?? prescription.heartRate?.high ?? 0, zoneLabel: prescription.heartRate?.zoneLabel };
  }
  if (patch.paceValue !== undefined) {
    next.pace = { value: patch.paceValue, unit: patch.paceUnit ?? prescription.pace?.unit ?? "min_per_mi" };
  }
  if (patch.rounds !== undefined) next.rounds = patch.rounds;
  if (patch.workIntervalSeconds !== undefined) next.workInterval = { seconds: patch.workIntervalSeconds };
  if (patch.recoveryIntervalSeconds !== undefined) next.recoveryInterval = { seconds: patch.recoveryIntervalSeconds };
  if (patch.recoveryDistanceValue !== undefined) {
    next.recoveryDistance = { value: patch.recoveryDistanceValue, unit: patch.recoveryDistanceUnit ?? prescription.recoveryDistance?.unit ?? "m" };
  }
  if (patch.contactsValue !== undefined) next.contacts = patch.contactsValue;
  if (patch.side !== undefined) next.side = patch.side;
  return next;
}

/** Rewrites exactly one session (addressed by week/day/sessionIndex),
 * leaving every other week/day/session byte-identical — the shared
 * tree-rewrite every SESSION-level structural edit (removeTrainingItem,
 * addTrainingItem, moveBlock) is built from. */
function mapSessionAt(content: UniversalTrainingProgramContent, path: SessionPath, mapSession: (session: Session) => Session): UniversalTrainingProgramContent {
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
            sessions: day.sessions?.map((session, sessionIndex) => (sessionIndex === path.sessionIndex ? mapSession(session) : session)),
          };
        }),
      };
    }),
  };
}

/** Rewrites exactly one block (addressed by week/day/session/blockId),
 * leaving every other week/day/session/block byte-identical — the one
 * shared tree-rewrite every item-VALUE edit in this file is built from
 * (structural edits that add/remove a whole block use mapSessionAt
 * instead, since they change the session's blocks array itself). */
function mapBlockAt(content: UniversalTrainingProgramContent, path: Pick<TrainingItemPath, "weekNumber" | "dayOfWeek" | "sessionIndex" | "blockId">, mapBlock: (block: Block) => Block): UniversalTrainingProgramContent {
  return mapSessionAt(content, path, (session) => ({
    ...session,
    blocks: session.blocks.map((block) => (block.id === path.blockId ? mapBlock(block) : block)),
  }));
}

/** Returns a NEW content tree with exactly one item's fields replaced —
 * the original `content` argument is never mutated. Throws if the target
 * item no longer exists (e.g. a stale path from an out-of-date page). */
export function applyTrainingItemPatch(content: UniversalTrainingProgramContent, path: TrainingItemPath, patch: TrainingItemPatch): UniversalTrainingProgramContent {
  const located = locateTrainingItem(content, path);
  if (!located) throw new Error(`applyTrainingItemPatch: no item at week ${path.weekNumber} ${path.dayOfWeek} session ${path.sessionIndex} block ${path.blockId} item ${path.itemId}`);
  return mapBlockAt(content, path, (block) => ({
    ...block,
    items: block.items.map((item: TrainingItemInstance) => (item.id !== path.itemId ? item : { ...item, name: patch.name ?? item.name, prescription: applyPatchToPrescription(item.prescription, patch) })),
  }));
}

/** Phase 11B — every BLOCK-level field a coach may edit on a circuit (spec
 * section 26: "round count, block name... round rest, applicable block
 * timing"). Deliberately separate from TrainingItemPatch: a circuit's
 * rounds/rest/name are BLOCK behavior, never confused with one item's own
 * prescription (spec section 10's own "do not confuse a circuit round with
 * a resistance set" extends to never blurring block-level and item-level
 * edits together). All optional — a patch only ever sets what the coach
 * actually changed. */
export interface BlockPatch {
  name?: string;
  rounds?: number;
  restBetweenItemsSeconds?: number;
  restBetweenRoundsSeconds?: number;
  timeCapSeconds?: number;
}

/** Returns a NEW content tree with exactly one block's own fields
 * replaced — never touches its items. Throws if the target block no
 * longer exists, matching applyTrainingItemPatch's own discipline. */
export function applyBlockPatch(content: UniversalTrainingProgramContent, path: BlockPath, patch: BlockPatch): UniversalTrainingProgramContent {
  const week = content.weeks.find((w) => w.weekNumber === path.weekNumber);
  const day = week?.days.find((d) => d.dayOfWeek === path.dayOfWeek);
  const located = day?.sessions?.[path.sessionIndex]?.blocks.find((b) => b.id === path.blockId);
  if (!located) throw new Error(`applyBlockPatch: no block at week ${path.weekNumber} ${path.dayOfWeek} session ${path.sessionIndex} block ${path.blockId}`);
  return mapBlockAt(content, path, (block) => ({
    ...block,
    name: patch.name ?? block.name,
    rounds: patch.rounds ?? block.rounds,
    restBetweenItemsSeconds: patch.restBetweenItemsSeconds ?? block.restBetweenItemsSeconds,
    restBetweenRoundsSeconds: patch.restBetweenRoundsSeconds ?? block.restBetweenRoundsSeconds,
    timeCapSeconds: patch.timeCapSeconds ?? block.timeCapSeconds,
  }));
}

/** Phase 8D — removes one proposed item outright. "At minimum, removal/
 * replacement should be practical" (spec section 9). Throws if the item is
 * already gone, matching applyTrainingItemPatch's own discipline.
 *
 * Cascades: a real generated block holds exactly one item (see this file's
 * header doc), so removing that item and leaving a `{ items: [] }` block
 * behind would always fail validation ("block.items must have at least one
 * item") — caught live against real generated content during this phase's
 * own E2E verification. Removing the emptied block along with its last
 * item is the correct structural consequence, never a dangling empty
 * block. If that would ALSO leave the session with zero blocks (the item
 * removed was the session's only exercise), this throws a clear, specific
 * error rather than producing session-level invalid content — a coach who
 * genuinely wants to clear an entire session should convert the day to
 * rest instead (see convertTrainingDayToRest). */
export function removeTrainingItem(content: UniversalTrainingProgramContent, path: TrainingItemPath): UniversalTrainingProgramContent {
  const located = locateTrainingItem(content, path);
  if (!located) throw new Error(`removeTrainingItem: no item at that path`);
  return mapSessionAt(content, path, (session) => {
    const targetBlock = session.blocks.find((b) => b.id === path.blockId)!;
    const remainingItems = targetBlock.items.filter((item) => item.id !== path.itemId);
    if (remainingItems.length > 0) {
      return { ...session, blocks: session.blocks.map((b) => (b.id === path.blockId ? { ...b, items: remainingItems } : b)) };
    }
    const remainingBlocks = session.blocks.filter((b) => b.id !== path.blockId);
    if (remainingBlocks.length === 0) {
      throw new Error(`removeTrainingItem: cannot remove the last exercise in a session — convert the day to rest instead, or add a replacement item first`);
    }
    return { ...session, blocks: remainingBlocks };
  });
}

/** Phase 8D — adds one new, coach-authored exercise to a session, as a
 * brand-new block (matching real generated content's own one-block-per-
 * exercise shape — see this file's header doc — rather than smuggling a
 * second item into an existing block, which would silently create an
 * unintended superset). The new item's id is deterministic (caller-
 * supplied, following the same `item-<day>-<order>-<slug>` convention
 * lib/coach/universal-program-generation.ts already uses), so a retried
 * "add" request targeting the SAME intended item is naturally idempotent
 * at the content level too. Deliberately minimal defaults — the coach
 * fine-tunes via the existing per-item edit form immediately after adding
 * (this phase's own "do not force every possible field before a first
 * save" discipline). */
export function addTrainingItem(content: UniversalTrainingProgramContent, sessionPath: SessionPath, newItem: TrainingItemInstance): UniversalTrainingProgramContent {
  const week = content.weeks.find((w) => w.weekNumber === sessionPath.weekNumber);
  const day = week?.days.find((d) => d.dayOfWeek === sessionPath.dayOfWeek);
  const session = day?.sessions?.[sessionPath.sessionIndex];
  if (!session) throw new Error(`addTrainingItem: no session at that path`);
  if (session.blocks.some((b) => b.items.some((i) => i.id === newItem.id))) throw new Error(`addTrainingItem: an item with id "${newItem.id}" already exists in this session`);
  // Appends after the highest EXISTING order, never `blocks.length + 1` —
  // once a block has been removed, remaining orders no longer line up with
  // the array length, and length+1 could collide with a surviving block's
  // own order (caught live during this phase's own E2E verification).
  const nextOrder = Math.max(0, ...session.blocks.map((b) => b.order)) + 1;
  const newBlock: Block = { id: `block-${newItem.id}`, kind: "straight", order: nextOrder, items: [{ ...newItem, order: 1 }] };
  return mapSessionAt(content, sessionPath, (s) => ({ ...s, blocks: [...s.blocks, newBlock] }));
}

/** Phase 8D — swaps one item's position with its immediate neighbor within
 * the SAME block, swapping their real `order` field (not just array
 * position — see this file's header doc for why array position alone
 * would have zero effect on actual execution). A plain move-up/move-down
 * control, deliberately, rather than drag-and-drop (spec section 9:
 * "simple controls are more reliable [than] arbitrary drag-and-drop
 * complexity"). A no-op (returns content unchanged) at either end of the
 * list — never throws for an edge that simply has nowhere to move. Only
 * ever meaningful for a real multi-item block (a coach-authored
 * superset/circuit) — every block generation itself produces holds exactly
 * one item, so reordering EXERCISES in a session is moveBlock's job, not
 * this function's; see this file's header doc. */
export function moveTrainingItem(content: UniversalTrainingProgramContent, path: TrainingItemPath, direction: "up" | "down"): UniversalTrainingProgramContent {
  const located = locateTrainingItem(content, path);
  if (!located) throw new Error(`moveTrainingItem: no item at that path`);
  return mapBlockAt(content, path, (block) => {
    const sorted = [...block.items].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((i: TrainingItemInstance) => i.id === path.itemId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return block;
    const items = block.items.map((item) => {
      if (item.id === sorted[index].id) return { ...item, order: sorted[targetIndex].order };
      if (item.id === sorted[targetIndex].id) return { ...item, order: sorted[index].order };
      return item;
    });
    return { ...block, items };
  });
}

/** Phase 8D — swaps one BLOCK's position with its immediate neighbor
 * within the same session, swapping their real `order` field. This is the
 * practical "reorder exercises in a session" mechanism for real content:
 * a real generated resistance session places one exercise per block (see
 * this file's header doc), so the visible exercise sequence is entirely
 * determined by Block.order, not by item order within a single block.
 * Same move-up/move-down, no-op-at-the-edge discipline as
 * moveTrainingItem. */
export function moveBlock(content: UniversalTrainingProgramContent, path: BlockPath, direction: "up" | "down"): UniversalTrainingProgramContent {
  return mapSessionAt(content, path, (session) => {
    const sorted = [...session.blocks].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((b) => b.id === path.blockId);
    if (index === -1) throw new Error(`moveBlock: no block at that path`);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return session;
    const blocks = session.blocks.map((block) => {
      if (block.id === sorted[index].id) return { ...block, order: sorted[targetIndex].order };
      if (block.id === sorted[targetIndex].id) return { ...block, order: sorted[index].order };
      return block;
    });
    return { ...session, blocks };
  });
}

/** Phase 8D — renames a session (e.g. "Upper" -> "Push Day"). Cosmetic,
 * bounded, and safe: never touches the session's actual prescribed content. */
export function renameSession(content: UniversalTrainingProgramContent, path: SessionPath, newName: string): UniversalTrainingProgramContent {
  return {
    ...content,
    weeks: content.weeks.map((week) => {
      if (week.weekNumber !== path.weekNumber) return week;
      return {
        ...week,
        days: week.days.map((day) => {
          if (day.dayOfWeek !== path.dayOfWeek) return day;
          return { ...day, sessions: day.sessions?.map((session, sessionIndex) => (sessionIndex !== path.sessionIndex ? session : { ...session, name: newName })) };
        }),
      };
    }),
  };
}

/** Phase 8D — converts a scheduled training day into a rest day (one
 * direction only — see this file's own module doc for why the reverse
 * isn't supported here). Drops the day's sessions entirely; the client
 * will see a genuine rest day, never a hidden/emptied "training" day
 * (spec section 11: "rest days must remain visually obvious and honest"). */
export function convertTrainingDayToRest(content: UniversalTrainingProgramContent, weekNumber: number, dayOfWeek: DayOfWeek): UniversalTrainingProgramContent {
  return {
    ...content,
    weeks: content.weeks.map((week) => {
      if (week.weekNumber !== weekNumber) return week;
      return { ...week, days: week.days.map((day) => (day.dayOfWeek !== dayOfWeek ? day : { dayOfWeek, type: "rest" as const })) };
    }),
  };
}

/** Builds a real, coach-authored TrainingItemInstance with the smallest
 * sane default prescription for its family — never a fabricated
 * placeholder pretending to be a real recommendation; the coach names it,
 * picks the family, and immediately gets to fine-tune every field via the
 * standard edit form. `order` should be the item's intended position
 * (typically the block's current item count + 1). */
export function buildCoachAuthoredItem(params: { dayOfWeek: DayOfWeek; order: number; name: string; category: Extract<ExecutionFamily, "resistance" | "continuous"> }): TrainingItemInstance {
  const slug = params.name.trim().replace(/\s+/g, "-").toLowerCase() || "item";
  const id = `item-${params.dayOfWeek.toLowerCase()}-${params.order}-${slug}`;
  const prescription: Prescription =
    params.category === "resistance"
      ? { family: "resistance", sets: 3, reps: { low: 8, high: 12 }, rpe: 8 as Prescription["rpe"], restSeconds: 90 }
      : { family: "continuous", duration: { seconds: 600 } };
  return { id, order: params.order, name: params.name.trim(), category: params.category, prescription };
}

// ---------------------------------------------------------------------------
// Structural, domain-aware diff — section 20/21: stable-id matching, never
// arbitrary text/JSON diffing as the signal. Used to build decision
// evidence and the pre-approval changes summary, comparing the untouched
// original proposal against whatever the coach has changed so far.
// ---------------------------------------------------------------------------

interface DiffLocation {
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  sessionIndex: number;
}

export type ProgramDiffEntry =
  | ({ kind: "field" } & TrainingItemPath & { itemName: string; field: string; from: unknown; to: unknown })
  | ({ kind: "item_removed" } & TrainingItemPath & { itemName: string })
  | ({ kind: "item_added" } & TrainingItemPath & { itemName: string })
  | ({ kind: "session_renamed" } & DiffLocation & { from: string; to: string })
  | ({ kind: "day_converted_to_rest" } & Pick<DiffLocation, "weekNumber" | "dayOfWeek">);

const PRESCRIPTION_SCALAR_FIELDS = ["sets", "warmupSets", "rpe", "rir", "restSeconds", "tempo", "cadence", "warmupInstruction", "contacts", "side"] as const;
const PRESCRIPTION_STRUCT_FIELDS = ["reps", "load", "duration", "distance", "heartRate", "pace"] as const;

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

/** Every real, meaningful difference between two universal program trees —
 * matched by stable item path, never by array position, so a purely
 * internal reordering or a regenerated id never produces false evidence
 * (section 21). Covers field-level prescription/name edits, item removal,
 * item addition, session renames, and training-day-to-rest conversions.
 * Item reordering is deliberately NOT diffed here (see this phase's
 * completion report — order-preference evidence is a separate, undecided
 * modeling question, not silently folded into this shape). */
export function diffProgramProposal(original: UniversalTrainingProgramContent, chosen: UniversalTrainingProgramContent): ProgramDiffEntry[] {
  const originalItems = collectItemsByPath(original);
  const chosenItems = collectItemsByPath(chosen);
  const entries: ProgramDiffEntry[] = [];

  for (const [key, chosenLocated] of chosenItems) {
    const originalLocated = originalItems.get(key);
    if (!originalLocated) {
      entries.push({ kind: "item_added", ...chosenLocated, itemName: chosenLocated.item.name });
      continue;
    }
    if (originalLocated.item.name !== chosenLocated.item.name) {
      entries.push({ kind: "field", ...chosenLocated, itemName: chosenLocated.item.name, field: "name", from: originalLocated.item.name, to: chosenLocated.item.name });
    }
    for (const delta of comparePrescriptions(originalLocated.item.prescription, chosenLocated.item.prescription)) {
      entries.push({ kind: "field", ...chosenLocated, itemName: chosenLocated.item.name, field: delta.field, from: delta.from, to: delta.to });
    }
  }
  for (const [key, originalLocated] of originalItems) {
    if (!chosenItems.has(key)) entries.push({ kind: "item_removed", ...originalLocated, itemName: originalLocated.item.name });
  }

  for (const week of chosen.weeks) {
    const originalWeek = original.weeks.find((w) => w.weekNumber === week.weekNumber);
    if (!originalWeek) continue;
    for (const day of week.days) {
      const originalDay = originalWeek.days.find((d) => d.dayOfWeek === day.dayOfWeek);
      if (!originalDay) continue;
      if (originalDay.type === "training" && day.type === "rest") {
        entries.push({ kind: "day_converted_to_rest", weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek });
        continue;
      }
      if (day.type === "training" && originalDay.type === "training") {
        (day.sessions ?? []).forEach((session, sessionIndex) => {
          const originalSession = originalDay.sessions?.[sessionIndex];
          if (originalSession && originalSession.name !== session.name) {
            entries.push({ kind: "session_renamed", weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, from: originalSession.name, to: session.name });
          }
        });
      }
    }
  }

  return entries;
}

/** A concise, coach-facing one-liner for a single diff entry — the "3
 * changes: ..." summary (spec section 15). Never git-diff-styled; plain
 * coaching language, matching the review card's own voice. */
export function describeProgramDiffEntry(entry: ProgramDiffEntry): string {
  const where = `Week ${entry.weekNumber}, ${entry.dayOfWeek}`;
  switch (entry.kind) {
    case "field":
      if (entry.field === "name") return `${where} — ${String(entry.from)} → ${String(entry.to)}`;
      return `${where}, ${entry.itemName} — ${entry.field}: ${formatDiffValue(entry.from)} → ${formatDiffValue(entry.to)}`;
    case "item_removed":
      return `${where} — removed ${entry.itemName}`;
    case "item_added":
      return `${where} — added ${entry.itemName}`;
    case "session_renamed":
      return `${where} — session renamed: "${entry.from}" → "${entry.to}"`;
    case "day_converted_to_rest":
      return `${where} — converted to a rest day`;
  }
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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
 * see this phase's own section 3). Phase 8D — already walked every week
 * from the start; unchanged here, just confirmed and tested at that
 * broader scope (spec section 20: whole-program safety check). */
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
 * granularity item-level decision evidence actually uses (section 12: "one
 * evidence record per meaningful coach decision," not one row per field).
 * Only ever consumes "field"-kind entries — item_removed/item_added/
 * session_renamed/day_converted_to_rest each get their own dedicated
 * decision-evidence projector instead (see lib/decisions/project-structural-edit.ts). */
export function groupDeltasByItem(entries: ProgramDiffEntry[]): Array<{ path: TrainingItemPath; itemName: string; fields: Array<{ field: string; from: unknown; to: unknown }> }> {
  const groups = new Map<string, { path: TrainingItemPath; itemName: string; fields: Array<{ field: string; from: unknown; to: unknown }> }>();
  for (const entry of entries) {
    if (entry.kind !== "field") continue;
    const key = pathKey(entry);
    const path: TrainingItemPath = { weekNumber: entry.weekNumber, dayOfWeek: entry.dayOfWeek, sessionIndex: entry.sessionIndex, blockId: entry.blockId, itemId: entry.itemId };
    if (!groups.has(key)) groups.set(key, { path, itemName: entry.itemName, fields: [] });
    groups.get(key)!.fields.push({ field: entry.field, from: entry.from, to: entry.to });
  }
  return Array.from(groups.values());
}
