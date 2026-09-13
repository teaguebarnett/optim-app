// Phase 8C — Generated Program Review and Approval Workflow.
//
// Pure-logic proof for the framework-independent editing/diffing utility —
// item location, patch application (immutable, never mutates input),
// structural diffing (stable-id matched, never array-position matched),
// delta grouping, and the restriction-conflict checker. The real
// Supabase-mode proposal lifecycle (generate/edit/approve/reject, RLS,
// decision-evidence integration) is proven live instead — see
// scripts/e2e-program-proposal-review.mts — matching this repo's
// established "pure logic here, e2e there" split.
//
// Run with: npm run verify:program-proposal-editing

import assert from "node:assert/strict";
import {
  locateTrainingItem,
  applyTrainingItemPatch,
  diffProgramProposal,
  groupDeltasByItem,
  findRestrictionConflicts,
  removeTrainingItem,
  addTrainingItem,
  moveTrainingItem,
  moveBlock,
  renameSession,
  convertTrainingDayToRest,
  buildCoachAuthoredItem,
  describeProgramDiffEntry,
  type TrainingItemPath,
  type ProgramDiffEntry,
} from "./program-proposal-editing.ts";
import type { UniversalTrainingProgramContent, TrainingItemInstance } from "./types.ts";

function fieldEntries(entries: ProgramDiffEntry[]): Extract<ProgramDiffEntry, { kind: "field" }>[] {
  return entries.filter((e): e is Extract<ProgramDiffEntry, { kind: "field" }> => e.kind === "field");
}

let passed = 0;
let failed = 0;
function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

function benchItem(overrides: Partial<TrainingItemInstance> = {}): TrainingItemInstance {
  return {
    id: "item-monday-1-barbell-bench-press",
    order: 1,
    name: "Barbell Bench Press",
    category: "resistance",
    prescription: { family: "resistance", sets: 4, reps: { low: 8, high: 10 }, rpe: 8, restSeconds: 120 },
    ...overrides,
  };
}

function zone2Item(overrides: Partial<TrainingItemInstance> = {}): TrainingItemInstance {
  return {
    id: "item-tuesday-1-zone-2-cardio",
    order: 1,
    name: "Zone 2 Cardio",
    category: "continuous",
    prescription: { family: "continuous", duration: { seconds: 1800 }, heartRate: { low: 120, high: 140 } },
    ...overrides,
  };
}

function buildContent(items: { monday?: TrainingItemInstance; tuesday?: TrainingItemInstance } = {}): UniversalTrainingProgramContent {
  return {
    schemaVersion: 2,
    id: "program-test-1",
    workspaceId: "workspace-1",
    clientId: "client-1",
    coachId: "coach-1",
    name: "Test Program",
    durationWeeks: 4,
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayOfWeek: "Monday", type: "training", sessions: [{ id: "s1", name: "Upper", focus: "upper", estimatedDurationMin: 45, blocks: [{ id: "b1", kind: "straight", order: 1, items: [items.monday ?? benchItem()] }] }] },
          { dayOfWeek: "Tuesday", type: "training", sessions: [{ id: "s2", name: "Cardio", focus: "cardio", estimatedDurationMin: 30, blocks: [{ id: "b2", kind: "straight", order: 1, items: [items.tuesday ?? zone2Item()] }] }] },
          { dayOfWeek: "Wednesday", type: "rest" },
          { dayOfWeek: "Thursday", type: "rest" },
          { dayOfWeek: "Friday", type: "rest" },
          { dayOfWeek: "Saturday", type: "rest" },
          { dayOfWeek: "Sunday", type: "rest" },
        ],
      },
      {
        weekNumber: 2,
        days: [
          { dayOfWeek: "Monday", type: "training", sessions: [{ id: "s1", name: "Upper", focus: "upper", estimatedDurationMin: 45, blocks: [{ id: "b1", kind: "straight", order: 1, items: [{ ...benchItem(), prescription: { family: "resistance", sets: 4, reps: { low: 6, high: 8 }, rpe: 9, restSeconds: 120 } }] }] }] },
          { dayOfWeek: "Tuesday", type: "rest" },
          { dayOfWeek: "Wednesday", type: "rest" },
          { dayOfWeek: "Thursday", type: "rest" },
          { dayOfWeek: "Friday", type: "rest" },
          { dayOfWeek: "Saturday", type: "rest" },
          { dayOfWeek: "Sunday", type: "rest" },
        ],
      },
    ],
    status: "draft",
    createdAtIso: "2026-09-16T00:00:00.000Z",
    updatedAtIso: "2026-09-16T00:00:00.000Z",
  };
}

const MONDAY_BENCH_PATH: TrainingItemPath = { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "b1", itemId: "item-monday-1-barbell-bench-press" };
const TUESDAY_CARDIO_PATH: TrainingItemPath = { weekNumber: 1, dayOfWeek: "Tuesday", sessionIndex: 0, blockId: "b2", itemId: "item-tuesday-1-zone-2-cardio" };

// ---------------------------------------------------------------------------
// locateTrainingItem — stable-path addressing across recurring week ids
// ---------------------------------------------------------------------------

console.log("\n1. locateTrainingItem — stable path addressing\n");

check("locates a real item by its exact path", () => {
  const content = buildContent();
  const located = locateTrainingItem(content, MONDAY_BENCH_PATH);
  assert.ok(located);
  assert.equal(located!.item.name, "Barbell Bench Press");
});

check("the SAME item id in week 2 is a genuinely different, independently addressable occurrence", () => {
  const content = buildContent();
  const week2Path: TrainingItemPath = { ...MONDAY_BENCH_PATH, weekNumber: 2 };
  const week1 = locateTrainingItem(content, MONDAY_BENCH_PATH)!;
  const week2 = locateTrainingItem(content, week2Path)!;
  assert.equal(week1.item.id, week2.item.id, "same recurring slot id");
  assert.notDeepEqual(week1.item.prescription, week2.item.prescription, "but genuinely different periodized values");
});

check("returns null for a path that doesn't exist — never throws", () => {
  const content = buildContent();
  assert.equal(locateTrainingItem(content, { ...MONDAY_BENCH_PATH, itemId: "does-not-exist" }), null);
});

// ---------------------------------------------------------------------------
// applyTrainingItemPatch — immutable, targeted, never touches other items
// ---------------------------------------------------------------------------

console.log("\n2. applyTrainingItemPatch — immutable, targeted\n");

check("R/S: a patch that keeps the content structurally valid updates only the targeted item, never mutating the input", () => {
  const content = buildContent();
  const before = JSON.parse(JSON.stringify(content));
  const patched = applyTrainingItemPatch(content, MONDAY_BENCH_PATH, { sets: 3, repsLow: 6, repsHigh: 8, rpe: 7 });
  assert.deepEqual(content, before, "the original content object must never be mutated");
  const patchedItem = locateTrainingItem(patched, MONDAY_BENCH_PATH)!.item;
  assert.equal(patchedItem.prescription.sets, 3);
  assert.deepEqual(patchedItem.prescription.reps, { low: 6, high: 8 });
  assert.equal(patchedItem.prescription.rpe, 7);
  // Untouched sibling item (Tuesday cardio) must be byte-identical.
  const untouchedItem = locateTrainingItem(patched, TUESDAY_CARDIO_PATH)!.item;
  assert.deepEqual(untouchedItem, locateTrainingItem(content, TUESDAY_CARDIO_PATH)!.item);
  // Week 2's own occurrence of the same recurring slot must be untouched.
  const week2Item = locateTrainingItem(patched, { ...MONDAY_BENCH_PATH, weekNumber: 2 })!.item;
  assert.deepEqual(week2Item, locateTrainingItem(content, { ...MONDAY_BENCH_PATH, weekNumber: 2 })!.item);
});

check("E: a continuous item's duration/distance/heart-rate fields can be edited", () => {
  const content = buildContent();
  const patched = applyTrainingItemPatch(content, TUESDAY_CARDIO_PATH, { durationSeconds: 2400, heartRateLow: 130, heartRateHigh: 150 });
  const item = locateTrainingItem(patched, TUESDAY_CARDIO_PATH)!.item;
  assert.equal(item.prescription.duration?.seconds, 2400);
  assert.deepEqual(item.prescription.heartRate, { low: 130, high: 150, zoneLabel: undefined });
});

check("REGRESSION: editing an unrelated field never fabricates a load object out of thin air just because the paired unit <select> always submits a value", () => {
  const content = buildContent(); // benchItem has no `load` at all
  // Simulates the real review UI's form: every field round-trips, and a
  // <select> for loadUnit always has SOME value ("lb") even when the
  // numeric loadValue input was genuinely left blank — the bug this
  // regression test guards against fabricated { value: 0, unit: "lb" }
  // whenever that happened.
  const patched = applyTrainingItemPatch(content, MONDAY_BENCH_PATH, { sets: 3, loadUnit: "lb" });
  const item = locateTrainingItem(patched, MONDAY_BENCH_PATH)!.item;
  assert.equal(item.prescription.load, undefined, "no loadValue was ever supplied — a bare unit selection must never manufacture a load");
});

check("REGRESSION: the same guard applies to distance/distanceUnit", () => {
  const content = buildContent(); // zone2Item has no `distance` at all
  const patched = applyTrainingItemPatch(content, TUESDAY_CARDIO_PATH, { rpe: 6, distanceUnit: "mi" });
  const item = locateTrainingItem(patched, TUESDAY_CARDIO_PATH)!.item;
  assert.equal(item.prescription.distance, undefined);
});

check("a name change (substitution) is applied alongside prescription fields", () => {
  const content = buildContent();
  const patched = applyTrainingItemPatch(content, MONDAY_BENCH_PATH, { name: "Landmine Press" });
  assert.equal(locateTrainingItem(patched, MONDAY_BENCH_PATH)!.item.name, "Landmine Press");
});

check("throws a clear error for a stale/nonexistent path — never silently no-ops", () => {
  const content = buildContent();
  assert.throws(() => applyTrainingItemPatch(content, { ...MONDAY_BENCH_PATH, itemId: "gone" }, { sets: 1 }));
});

// ---------------------------------------------------------------------------
// diffProgramProposal / groupDeltasByItem — domain-aware, stable-id diffing
// ---------------------------------------------------------------------------

console.log("\n3. diffProgramProposal / groupDeltasByItem — domain-aware structural diff\n");

check("I: identifies exactly the changed fields on the edited item", () => {
  const original = buildContent();
  const chosen = applyTrainingItemPatch(original, MONDAY_BENCH_PATH, { sets: 3, repsLow: 6, repsHigh: 8 });
  const deltas = fieldEntries(diffProgramProposal(original, chosen)).filter((d) => d.itemId === MONDAY_BENCH_PATH.itemId && d.weekNumber === 1);
  const fields = deltas.map((d) => d.field).sort();
  assert.deepEqual(fields, ["reps", "sets"]);
});

check("J: an untouched item produces NO deltas at all — never fake evidence", () => {
  const original = buildContent();
  const chosen = applyTrainingItemPatch(original, MONDAY_BENCH_PATH, { sets: 3 });
  const cardioDeltas = diffProgramProposal(original, chosen).filter((d) => "itemId" in d && d.itemId === TUESDAY_CARDIO_PATH.itemId);
  assert.equal(cardioDeltas.length, 0);
});

check("week 2's independent occurrence of the same recurring item is untouched by a week-1-only edit", () => {
  const original = buildContent();
  const chosen = applyTrainingItemPatch(original, MONDAY_BENCH_PATH, { sets: 3 });
  const week2Deltas = diffProgramProposal(original, chosen).filter((d) => d.weekNumber === 2);
  assert.equal(week2Deltas.length, 0, "a week-1 edit must never bleed into week 2's own periodized values");
});

check("a name change is reported as its own 'name' field delta (the substitution signal)", () => {
  const original = buildContent();
  const chosen = applyTrainingItemPatch(original, MONDAY_BENCH_PATH, { name: "Landmine Press" });
  const deltas = fieldEntries(diffProgramProposal(original, chosen)).filter((d) => d.itemId === MONDAY_BENCH_PATH.itemId && d.weekNumber === 1);
  assert.ok(deltas.some((d) => d.field === "name" && d.from === "Barbell Bench Press" && d.to === "Landmine Press"));
});

check("groupDeltasByItem collapses multiple field deltas on one item into a single group — one evidence record per decision, not per field", () => {
  const original = buildContent();
  const chosen = applyTrainingItemPatch(original, MONDAY_BENCH_PATH, { sets: 3, rpe: 7 });
  const deltas = diffProgramProposal(original, chosen).filter((d) => d.weekNumber === 1);
  const groups = groupDeltasByItem(deltas);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].fields.length, 2);
});

check("21: identity stability — internal id reuse across weeks never produces a false 'item replaced' delta when nothing in that week actually changed", () => {
  const original = buildContent();
  const chosen = buildContent(); // structurally identical, freshly built
  const deltas = diffProgramProposal(original, chosen);
  assert.equal(deltas.length, 0);
});

// ---------------------------------------------------------------------------
// findRestrictionConflicts — reuses the existing avoided-term mechanism,
// never a new medical-policy engine; warns, never blocks
// ---------------------------------------------------------------------------

console.log("\n4. findRestrictionConflicts — safety-restriction awareness (W)\n");

check("W: an item whose name contains an avoided term produces a real, readable warning", () => {
  const content = buildContent({ monday: { ...benchItem(), name: "Barbell Overhead Press" } });
  const warnings = findRestrictionConflicts(content, ["overhead press"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Barbell Overhead Press/);
  assert.match(warnings[0], /overhead press/);
});

check("W: no avoided terms means no warnings, even with a real resistance program", () => {
  const content = buildContent();
  assert.deepEqual(findRestrictionConflicts(content, []), []);
});

check("W: an item that doesn't match any avoided term produces no warning", () => {
  const content = buildContent();
  assert.deepEqual(findRestrictionConflicts(content, ["deadlift"]), []);
});

// ---------------------------------------------------------------------------
// Phase 8D — full-horizon editing: any week, structural edits, pace
// ---------------------------------------------------------------------------

console.log("\n5. Phase 8D — editing week 2+ (full-horizon, not just week 1)\n");

const WEEK2_BENCH_PATH: TrainingItemPath = { ...MONDAY_BENCH_PATH, weekNumber: 2 };

check("B/C: a resistance item in week 2 can be edited exactly like week 1, and only week 2's occurrence changes", () => {
  const content = buildContent();
  const patched = applyTrainingItemPatch(content, WEEK2_BENCH_PATH, { sets: 2, rpe: 6 });
  const week2Item = locateTrainingItem(patched, WEEK2_BENCH_PATH)!.item;
  const week1Item = locateTrainingItem(patched, MONDAY_BENCH_PATH)!.item;
  assert.equal(week2Item.prescription.sets, 2);
  assert.equal(week2Item.prescription.rpe, 6);
  assert.equal(week1Item.prescription.sets, 4, "week 1's own occurrence must be untouched by a week-2 edit");
});

check("D/E: pace is now editable on a continuous item and reaches the real grammar field the execution path already reads", () => {
  const content = buildContent();
  const patched = applyTrainingItemPatch(content, TUESDAY_CARDIO_PATH, { paceValue: 9.5, paceUnit: "min_per_mi" });
  const item = locateTrainingItem(patched, TUESDAY_CARDIO_PATH)!.item;
  assert.deepEqual(item.prescription.pace, { value: 9.5, unit: "min_per_mi" });
});

check("REGRESSION: pace, like load/distance, is never fabricated by an unrelated edit just because paceUnit alone were ever supplied", () => {
  const content = buildContent();
  const patched = applyTrainingItemPatch(content, TUESDAY_CARDIO_PATH, { rpe: 5, paceUnit: "min_per_km" });
  assert.equal(locateTrainingItem(patched, TUESDAY_CARDIO_PATH)!.item.prescription.pace, undefined);
});

console.log("\n6. Phase 8D — structural edits: remove, add, reorder, session rename, day-to-rest\n");

check("H: removeTrainingItem removes exactly the targeted item's block, leaving a sibling exercise (a separate block) untouched", () => {
  // A real generated session holds one item per block (see
  // program-proposal-editing.ts's own header doc) — set up a genuine
  // two-exercise Week 2 Monday session first, exactly like addTrainingItem
  // itself would produce, so removal exercises the real cascading-block
  // path rather than the single-exercise edge case.
  const content = buildContent();
  const sibling = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Press", category: "resistance" });
  const withSibling = addTrainingItem(content, { weekNumber: 2, dayOfWeek: "Monday", sessionIndex: 0 }, sibling);
  const patched = removeTrainingItem(withSibling, WEEK2_BENCH_PATH);
  assert.equal(locateTrainingItem(patched, WEEK2_BENCH_PATH), null);
  assert.notEqual(locateTrainingItem(patched, MONDAY_BENCH_PATH), null, "week 1's occurrence must survive a week-2 removal");
  const week2Session = patched.weeks[1].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  assert.equal(week2Session.blocks.length, 1, "the emptied block itself must be removed, not left behind as { items: [] }");
  assert.equal(week2Session.blocks[0].items[0].id, sibling.id, "the sibling exercise (a separate block) survives the removal");
});

check("removeTrainingItem cascades: removing the sole item in a block also removes the now-empty block", () => {
  const content = buildContent();
  const sibling = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Press", category: "resistance" });
  const withSibling = addTrainingItem(content, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0 }, sibling);
  const patched = removeTrainingItem(withSibling, MONDAY_BENCH_PATH);
  const session = patched.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  assert.equal(session.blocks.length, 1, "bench's own now-empty block must be gone, not a dangling { items: [] } block");
  assert.equal(session.blocks.some((b) => b.id === "b1"), false, "the specific emptied block id is gone");
});

check("REGRESSION: removeTrainingItem throws a clear error rather than leaving a session with zero blocks (real generated content is one-item-per-block, so this is the common case, not an edge case) — caught live against a real generated program during this phase's own E2E verification", () => {
  const content = buildContent();
  assert.throws(() => removeTrainingItem(content, MONDAY_BENCH_PATH), /cannot remove the last exercise in a session/);
});

check("removeTrainingItem throws for an already-removed/stale item — never a silent no-op", () => {
  const content = buildContent();
  assert.throws(() => removeTrainingItem(content, { ...MONDAY_BENCH_PATH, itemId: "already-gone" }));
});

check("a coach-authored item has a real, deterministic id and a sane minimal default prescription per family", () => {
  const resistanceItem = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Dumbbell Press", category: "resistance" });
  assert.equal(resistanceItem.id, "item-monday-2-incline-dumbbell-press");
  assert.equal(resistanceItem.prescription.family, "resistance");
  assert.ok(resistanceItem.prescription.sets && resistanceItem.prescription.reps);

  const continuousItem = buildCoachAuthoredItem({ dayOfWeek: "Tuesday", order: 1, name: "Easy Row", category: "continuous" });
  assert.equal(continuousItem.prescription.family, "continuous");
  assert.ok(continuousItem.prescription.duration);
});

check("addTrainingItem appends a real new item to the targeted SESSION as a brand-new block, in any week, without disturbing the existing exercise's own block", () => {
  const content = buildContent();
  const newItem = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Dumbbell Press", category: "resistance" });
  const patched = addTrainingItem(content, { weekNumber: 2, dayOfWeek: "Monday", sessionIndex: 0 }, newItem);
  const located = locateTrainingItem(patched, { weekNumber: 2, dayOfWeek: "Monday", sessionIndex: 0, blockId: `block-${newItem.id}`, itemId: newItem.id });
  assert.ok(located);
  assert.notEqual(locateTrainingItem(patched, WEEK2_BENCH_PATH), null, "the existing exercise's own block must remain");
  const week2Session = patched.weeks[1].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  assert.equal(week2Session.blocks.length, 2, "the new exercise is its own block, matching real generated content's one-item-per-block shape — never smuggled into the existing block as an unintended superset");
});

check("addTrainingItem refuses to add an item whose id already exists anywhere in that session — never silently overwrites", () => {
  const content = buildContent();
  assert.throws(() => addTrainingItem(content, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0 }, benchItem()));
});

check("I: moveTrainingItem swaps a resistance item with its neighbor within the SAME block (a coach-authored multi-item block/superset) — real order field swaps, not just array position", () => {
  // moveTrainingItem is only meaningful for a real multi-item block, which
  // addTrainingItem deliberately never creates on its own (see the test
  // above) — build one directly, the way a genuine superset/circuit would
  // look, to exercise this path.
  const content = buildContent();
  const supersetPartner: TrainingItemInstance = { id: "item-monday-2-incline-press", order: 2, name: "Incline Press", category: "resistance", prescription: { family: "resistance", sets: 3, reps: { low: 8, high: 10 }, rpe: 8 } };
  const withSuperset: UniversalTrainingProgramContent = {
    ...content,
    weeks: content.weeks.map((w, i) => (i !== 0 ? w : { ...w, days: w.days.map((d) => (d.dayOfWeek !== "Monday" ? d : { ...d, sessions: [{ ...d.sessions![0], blocks: [{ ...d.sessions![0].blocks[0], items: [...d.sessions![0].blocks[0].items, supersetPartner] }] }] })) })),
  };
  const moved = moveTrainingItem(withSuperset, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "b1", itemId: supersetPartner.id }, "up");
  const block = moved.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0].blocks[0];
  const sorted = [...block.items].sort((a, b) => a.order - b.order);
  assert.equal(sorted[0].id, supersetPartner.id, "the moved item is now first by real order, not just array position");
  assert.equal(sorted[1].id, "item-monday-1-barbell-bench-press");
});

check("moveTrainingItem is a safe no-op at the start/end of the list — never throws for nowhere to go", () => {
  const content = buildContent();
  const moved = moveTrainingItem(content, MONDAY_BENCH_PATH, "up");
  assert.deepEqual(moved, content);
});

check("K: moveBlock swaps two exercises' real order within a session — the practical 'reorder exercises' mechanism for real one-item-per-block content", () => {
  const content = buildContent();
  const secondExercise = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Press", category: "resistance" });
  const withSecond = addTrainingItem(content, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0 }, secondExercise);
  const secondBlockId = `block-${secondExercise.id}`;
  const moved = moveBlock(withSecond, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: secondBlockId }, "up");
  const session = moved.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  const sortedBlocks = [...session.blocks].sort((a, b) => a.order - b.order);
  assert.equal(sortedBlocks[0].id, secondBlockId, "the moved exercise's block is now first by real order");
  assert.equal(sortedBlocks[1].id, "b1");
});

check("moveBlock is a safe no-op at the start/end of the list — never throws for nowhere to go", () => {
  const content = buildContent();
  const moved = moveBlock(content, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "b1" }, "up");
  assert.deepEqual(moved, content);
});

check("REGRESSION: addTrainingItem never assigns a block order that collides with a surviving block's order after a prior removal — caught live during this phase's own E2E verification (session.blocks.length alone is unsafe once removal has left gaps)", () => {
  const content = buildContent();
  const sibling = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Press", category: "resistance" });
  // Monday now has 2 blocks: "b1" (order 1) and the sibling's own block
  // (order 2). Remove "b1" (the ORIGINAL item) — the sibling survives with
  // order 2 still, while session.blocks.length drops back to 1.
  const withSibling = addTrainingItem(content, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0 }, sibling);
  const afterRemoval = removeTrainingItem(withSibling, MONDAY_BENCH_PATH);
  const sessionAfterRemoval = afterRemoval.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  assert.equal(sessionAfterRemoval.blocks.length, 1, "only the sibling remains");
  assert.equal(sessionAfterRemoval.blocks[0].order, 2, "the surviving sibling KEEPS its original order — never renumbered");

  // A naive `blocks.length + 1` would now compute 1 + 1 = 2, colliding
  // with the surviving sibling's own order=2.
  const thirdExercise = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 3, name: "Cable Fly", category: "resistance" });
  const afterThirdAdd = addTrainingItem(afterRemoval, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0 }, thirdExercise);
  const sessionAfterThirdAdd = afterThirdAdd.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  const orders = sessionAfterThirdAdd.blocks.map((b) => b.order);
  assert.equal(new Set(orders).size, orders.length, `every block must have a genuinely distinct order — got [${orders.join(", ")}]`);
});

check("renameSession renames only the targeted week/day/session", () => {
  const content = buildContent();
  const renamed = renameSession(content, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0 }, "Push Day");
  const session = renamed.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  assert.equal(session.name, "Push Day");
  const week2Session = renamed.weeks[1].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0];
  assert.equal(week2Session.name, "Upper", "an unrelated week's session must keep its original name");
});

check("convertTrainingDayToRest turns a training day into a real, honest rest day — no hidden emptied session", () => {
  const content = buildContent();
  const converted = convertTrainingDayToRest(content, 1, "Tuesday");
  const day = converted.weeks[0].days.find((d) => d.dayOfWeek === "Tuesday")!;
  assert.equal(day.type, "rest");
  assert.equal("sessions" in day, false);
});

console.log("\n7. Phase 8D — full-horizon diff: added/removed items, session rename, day conversion\n");

check("M: diffProgramProposal correctly reports an item_removed entry at the right week/day, when an item is removed", () => {
  const original = buildContent();
  const sibling = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Press", category: "resistance" });
  const withSibling = addTrainingItem(original, { weekNumber: 2, dayOfWeek: "Monday", sessionIndex: 0 }, sibling);
  const chosen = removeTrainingItem(withSibling, WEEK2_BENCH_PATH);
  const entries = diffProgramProposal(original, chosen);
  const removed = entries.find((e): e is Extract<ProgramDiffEntry, { kind: "item_removed" }> => e.kind === "item_removed");
  assert.ok(removed);
  assert.equal(removed!.weekNumber, 2);
  assert.equal(removed!.dayOfWeek, "Monday");
});

check("M: diffProgramProposal correctly reports an item_added entry when a new item appears", () => {
  const original = buildContent();
  const newItem = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Press", category: "resistance" });
  const chosen = addTrainingItem(original, { weekNumber: 2, dayOfWeek: "Monday", sessionIndex: 0 }, newItem);
  const entries = diffProgramProposal(original, chosen);
  const added = entries.find((e): e is Extract<ProgramDiffEntry, { kind: "item_added" }> => e.kind === "item_added");
  assert.ok(added);
  assert.equal(added!.weekNumber, 2);
});

check("diffProgramProposal reports a session_renamed entry at the right location", () => {
  const original = buildContent();
  const chosen = renameSession(original, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0 }, "Push Day");
  const entries = diffProgramProposal(original, chosen);
  const renamed = entries.find((e): e is Extract<ProgramDiffEntry, { kind: "session_renamed" }> => e.kind === "session_renamed");
  assert.ok(renamed);
  assert.equal(renamed!.from, "Upper");
  assert.equal(renamed!.to, "Push Day");
});

check("diffProgramProposal reports a day_converted_to_rest entry at the right week/day", () => {
  const original = buildContent();
  const chosen = convertTrainingDayToRest(original, 1, "Tuesday");
  const entries = diffProgramProposal(original, chosen);
  const converted = entries.find((e): e is Extract<ProgramDiffEntry, { kind: "day_converted_to_rest" }> => e.kind === "day_converted_to_rest");
  assert.ok(converted);
  assert.equal(converted!.weekNumber, 1);
  assert.equal(converted!.dayOfWeek, "Tuesday");
});

check("N: an untouched program produces zero diff entries of any kind", () => {
  const original = buildContent();
  const chosen = buildContent();
  assert.equal(diffProgramProposal(original, chosen).length, 0);
});

check("O: describeProgramDiffEntry produces a real, readable one-liner for every entry kind, in plain coaching language", () => {
  const fieldEntry: ProgramDiffEntry = { kind: "field", weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "b1", itemId: "x", itemName: "Bench Press", field: "sets", from: 4, to: 3 };
  assert.match(describeProgramDiffEntry(fieldEntry), /Week 1, Monday, Bench Press — sets: 4 → 3/);

  const removedEntry: ProgramDiffEntry = { kind: "item_removed", weekNumber: 2, dayOfWeek: "Wednesday", sessionIndex: 0, blockId: "b1", itemId: "x", itemName: "Deadlift" };
  assert.match(describeProgramDiffEntry(removedEntry), /removed Deadlift/);

  const renamedEntry: ProgramDiffEntry = { kind: "session_renamed", weekNumber: 3, dayOfWeek: "Friday", sessionIndex: 0, from: "Upper", to: "Push Day" };
  assert.match(describeProgramDiffEntry(renamedEntry), /session renamed.*Upper.*Push Day/);

  const restEntry: ProgramDiffEntry = { kind: "day_converted_to_rest", weekNumber: 4, dayOfWeek: "Sunday" };
  assert.match(describeProgramDiffEntry(restEntry), /converted to a rest day/);
});

check("J: groupDeltasByItem never groups structural entries (item_removed/item_added/session_renamed/day_converted_to_rest) — only field-level edits", () => {
  const original = buildContent();
  const sibling = buildCoachAuthoredItem({ dayOfWeek: "Monday", order: 2, name: "Incline Press", category: "resistance" });
  const withSibling = addTrainingItem(original, { weekNumber: 2, dayOfWeek: "Monday", sessionIndex: 0 }, sibling);
  const withRemoval = removeTrainingItem(withSibling, WEEK2_BENCH_PATH);
  const groups = groupDeltasByItem(diffProgramProposal(original, withRemoval));
  assert.equal(groups.length, 0, "an item removal/addition has no 'fields' to group — it gets its own dedicated evidence type instead");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
