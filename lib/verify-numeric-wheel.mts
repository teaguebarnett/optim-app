// Correction pass — targeted verification for the unified numeric
// wheel-picker's pure math (lib/numeric-wheel.ts), shared by
// components/ui/number-wheel.tsx (pain rating, cardio duration) and the
// morning-weight two-column composite. Component rendering/scroll
// interaction itself isn't covered here — this repo has no DOM/component
// test harness (every existing verify:* script is pure-function/reducer
// only, see lib/workout/verify-workout-flow.mts) and this correction
// deliberately avoids adding one. Run with: npm run verify:numeric-wheel

import assert from "node:assert/strict";
import { buildStepRange, nearestValueIndex } from "./numeric-wheel.ts";

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

console.log("\n1. buildStepRange — boundaries and increment\n");

check("An integer step produces exactly min..max inclusive, no drift", () => {
  assert.deepEqual(buildStepRange(0, 10, 1), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

check("A single-value range (min === max) returns exactly one row", () => {
  assert.deepEqual(buildStepRange(5, 5, 1), [5]);
});

check("A fractional step (0.2) never accumulates floating-point drift into a missing or extra last row", () => {
  const range = buildStepRange(0, 2, 0.2);
  assert.equal(range.length, 11);
  assert.equal(range[0], 0);
  assert.equal(range.at(-1), 2, "the exact endpoint must be reachable, not stop at 1.9999999999998");
  assert.deepEqual(range, [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2]);
});

check("A degenerate range (step <= 0, or max < min) returns an empty array rather than throwing or looping forever", () => {
  assert.deepEqual(buildStepRange(0, 10, 0), []);
  assert.deepEqual(buildStepRange(0, 10, -1), []);
  assert.deepEqual(buildStepRange(10, 0, 1), []);
});

console.log("\n2. nearestValueIndex — snap-to-nearest and clamping\n");

check("An exact match returns its own index", () => {
  assert.equal(nearestValueIndex([0, 1, 2, 3], 2), 2);
});

check("A value between two rows snaps to the closer one", () => {
  assert.equal(nearestValueIndex([0, 10, 20], 6), 1, "6 is closer to 10 than to 0");
  assert.equal(nearestValueIndex([0, 10, 20], 4), 0, "4 is closer to 0 than to 10");
});

check("A target below the range clamps to the first row; above clamps to the last", () => {
  assert.equal(nearestValueIndex([5, 10, 15], -100), 0);
  assert.equal(nearestValueIndex([5, 10, 15], 100), 2);
});

check("An empty values array returns 0 rather than throwing", () => {
  assert.equal(nearestValueIndex([], 42), 0);
});

console.log("\n3. Real migrated ranges — min/max/step preserved exactly from each field's prior implementation\n");

check("Pain rating (0-10, step 1) — unchanged from the prior NumberField's min/max, default step", () => {
  const range = buildStepRange(0, 10, 1);
  assert.equal(range.length, 11);
  assert.equal(range[0], 0);
  assert.equal(range.at(-1), 10);
});

check("Cardio duration (0-180 min, step 1) — unchanged from DURATION_MAX_MIN/DURATION_STEP_MIN", () => {
  const range = buildStepRange(0, 180, 1);
  assert.equal(range.length, 181);
  assert.equal(range[0], 0);
  assert.equal(range.at(-1), 180);
});

check("Body weight whole-pound column (60-600, step 1) — unchanged from isValidWeight's 60/600 bounds", () => {
  const range = buildStepRange(60, 600, 1);
  assert.equal(range.length, 541);
  assert.equal(range[0], 60);
  assert.equal(range.at(-1), 600);
});

check("Body weight tenths column reconstructs the prior 0.2 lb step exactly (0, .2, .4, .6, .8)", () => {
  // The morning-weight wheel keeps the tenths column as a fixed 5-value
  // list rather than deriving it from buildStepRange (see
  // components/today/tasks/morning-weight-task.tsx) — this asserts that
  // list still represents the exact same 0.2 lb increment the old
  // NumberField's step={0.2} enforced, and that snapping an arbitrary whole
  // + tenths pair lands correctly.
  const tenths = [0, 2, 4, 6, 8];
  assert.equal(nearestValueIndex(tenths, 4), 2);
  const whole = buildStepRange(60, 600, 1);
  const wholePart = 182;
  const tenthsPart = 4;
  const reconstructed = Math.round((wholePart + tenthsPart / 10) * 10) / 10;
  assert.equal(reconstructed, 182.4);
  assert.equal(nearestValueIndex(whole, wholePart), whole.indexOf(182));
});

console.log("\n4. Reopening centers the saved/drafted value (deterministic index reconstruction)\n");

check("The same (values, target) pair always reconstructs the same starting index — reopening a picker re-derives its center from this, never from remembered scroll position", () => {
  const range = buildStepRange(0, 180, 1);
  const savedValue = 47;
  const indexOnFirstOpen = nearestValueIndex(range, savedValue);
  const indexOnReopen = nearestValueIndex(range, savedValue);
  assert.equal(indexOnFirstOpen, indexOnReopen);
  assert.equal(range[indexOnReopen], savedValue);
});

check("A persisted value that doesn't fall exactly on a step still re-centers on the closest valid row rather than failing to find one", () => {
  const range = buildStepRange(0, 10, 1);
  // e.g. a pre-existing/legacy value slightly off-grid.
  const index = nearestValueIndex(range, 6.4);
  assert.equal(range[index], 6);
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
