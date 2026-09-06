// Phase 5.4B — verifies the Command Center's time-of-day adaptivity: which
// hour maps to which real time-of-day bucket, and the resulting secondary-
// section order (spec §2's "morning emphasizes prepared briefings...").
// "Needs Your Attention" dominance itself is a live-composition behavior of
// app/coach/page.tsx and is covered by manual visual QA, not a pure
// function — see this phase's final report.

import assert from "node:assert/strict";
import { SECONDARY_SECTION_ORDER, timeOfDayForHour } from "./command-center.ts";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

console.log("\n1. Hour -> time-of-day mapping\n");

check("early morning hours map to 'morning'", () => {
  assert.equal(timeOfDayForHour(6), "morning");
  assert.equal(timeOfDayForHour(10), "morning");
});

check("midday/afternoon hours map to 'midday'", () => {
  assert.equal(timeOfDayForHour(11), "midday");
  assert.equal(timeOfDayForHour(16), "midday");
});

check("evening hours map to 'evening'", () => {
  assert.equal(timeOfDayForHour(17), "evening");
  assert.equal(timeOfDayForHour(22), "evening");
});

console.log("\n2. Secondary section ordering per time of day\n");

check("morning promotes Daily Briefings first", () => {
  assert.equal(SECONDARY_SECTION_ORDER.morning[0], "briefings");
});

check("midday promotes Worth a Personal Touch first (live activity window)", () => {
  assert.equal(SECONDARY_SECTION_ORDER.midday[0], "personal_touch");
});

check("evening promotes Waiting first (clearing out unresolved work)", () => {
  assert.equal(SECONDARY_SECTION_ORDER.evening[0], "waiting");
});

check("every time-of-day includes all three sections exactly once", () => {
  for (const order of Object.values(SECONDARY_SECTION_ORDER)) {
    assert.equal(new Set(order).size, 3);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
