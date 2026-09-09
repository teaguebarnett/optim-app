// Phase 6.0A — Production Foundation.
//
// Pure logic tests for lib/imports/types.ts's state-machine and provenance
// rules — no DB, no network, no browser, no parsers. Run with:
// npm run verify:import-contracts

import assert from "node:assert/strict";
import {
  canActivateStagedClient,
  hasProvenance,
  isValidImportBatchTransition,
  isValidStagedClientTransition,
} from "./types.ts";

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

console.log("\n1. Import batch status transitions\n");

check("uploading -> processing is valid", () => assert.equal(isValidImportBatchTransition("uploading", "processing"), true));
check("processing -> needs_review is valid", () =>
  assert.equal(isValidImportBatchTransition("processing", "needs_review"), true)
);
check("ready -> activated is valid", () => assert.equal(isValidImportBatchTransition("ready", "activated"), true));
check("uploading -> activated directly is invalid — must pass through processing/review/ready", () =>
  assert.equal(isValidImportBatchTransition("uploading", "activated"), false)
);
check("activated has no valid outgoing transitions — a batch stays activated forever", () =>
  assert.equal(isValidImportBatchTransition("activated", "cancelled"), false)
);
check("failed and cancelled are both terminal", () => {
  assert.equal(isValidImportBatchTransition("failed", "processing"), false);
  assert.equal(isValidImportBatchTransition("cancelled", "processing"), false);
});

console.log("\n2. Staged client status transitions and activation eligibility\n");

check("needs_review -> ready is valid", () => assert.equal(isValidStagedClientTransition("needs_review", "ready"), true));
check("ready -> approved is valid", () => assert.equal(isValidStagedClientTransition("ready", "approved"), true));
check("needs_review -> approved directly is invalid — must pass through ready", () =>
  assert.equal(isValidStagedClientTransition("needs_review", "approved"), false)
);
check("approved and rejected are both terminal", () => {
  assert.equal(isValidStagedClientTransition("approved", "needs_review"), false);
  assert.equal(isValidStagedClientTransition("rejected", "needs_review"), false);
});

check("canActivateStagedClient is false for needs_review and ready", () => {
  assert.equal(canActivateStagedClient({ status: "needs_review" }), false);
  assert.equal(canActivateStagedClient({ status: "ready" }), false);
});
check("canActivateStagedClient is true only once approved", () => {
  assert.equal(canActivateStagedClient({ status: "approved" }), true);
  assert.equal(canActivateStagedClient({ status: "rejected" }), false);
});

console.log("\n3. Field-level provenance — never invent a value with no source\n");

check("a field with a real source value has provenance", () =>
  assert.equal(hasProvenance({ sourceValue: "185 lb", sourceId: null, coachCorrection: null }), true)
);
check("a field with only a source file id has provenance", () =>
  assert.equal(hasProvenance({ sourceValue: null, sourceId: "source-1", coachCorrection: null }), true)
);
check("a field with only a coach correction has provenance", () =>
  assert.equal(hasProvenance({ sourceValue: null, sourceId: null, coachCorrection: { weekIndex: 7 } }), true)
);
check("a field with none of the three has no provenance — the exact case that must never be inserted", () =>
  assert.equal(hasProvenance({ sourceValue: null, sourceId: null, coachCorrection: null }), false)
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
