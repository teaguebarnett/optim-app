// Phase 6.1A — Secure Founder Command Center.
//
// Pure logic test for lib/shared/stats.ts's median — the one genuinely pure
// piece of math lib/production/platform-operations.ts's AI-operations
// latency metric depends on. No DB, no network, no "server-only" import
// chain — see that file's own module doc for why the repository itself
// (entirely "server-only") has no dedicated unit test, mirroring
// lib/production/repository.ts's own established precedent.
//
// Run with: npm run verify:platform-stats

import assert from "node:assert/strict";
import { median } from "./stats.ts";

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

console.log("\n1. Empty / trivial inputs\n");

check("empty array -> null (never a fabricated 0)", () => {
  assert.equal(median([]), null);
});

check("single value -> that value", () => {
  assert.equal(median([42]), 42);
});

console.log("\n2. Odd/even counts\n");

check("odd count -> the exact middle value, order-independent", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([3, 1, 5]), 3);
});

check("even count -> average of the two middle values", () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([100, 200]), 150);
});

console.log("\n3. Does not mutate its input\n");

check("input array is left in its original order", () => {
  const input = [9, 1, 5];
  median(input);
  assert.deepEqual(input, [9, 1, 5]);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
