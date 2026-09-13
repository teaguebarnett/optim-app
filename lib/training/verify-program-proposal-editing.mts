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
import { locateTrainingItem, applyTrainingItemPatch, diffProgramProposal, groupDeltasByItem, findRestrictionConflicts, type TrainingItemPath } from "./program-proposal-editing.ts";
import type { UniversalTrainingProgramContent, TrainingItemInstance } from "./types.ts";

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
  const deltas = diffProgramProposal(original, chosen).filter((d) => d.itemId === MONDAY_BENCH_PATH.itemId && d.weekNumber === 1);
  const fields = deltas.map((d) => d.field).sort();
  assert.deepEqual(fields, ["reps", "sets"]);
});

check("J: an untouched item produces NO deltas at all — never fake evidence", () => {
  const original = buildContent();
  const chosen = applyTrainingItemPatch(original, MONDAY_BENCH_PATH, { sets: 3 });
  const cardioDeltas = diffProgramProposal(original, chosen).filter((d) => d.itemId === TUESDAY_CARDIO_PATH.itemId);
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
  const deltas = diffProgramProposal(original, chosen).filter((d) => d.itemId === MONDAY_BENCH_PATH.itemId && d.weekNumber === 1);
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

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
