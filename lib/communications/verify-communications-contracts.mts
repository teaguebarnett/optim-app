// Phase 6.0A — Production Foundation.
//
// Pure logic tests for lib/communications/types.ts's state-machine rules —
// no DB, no network, no browser. Run with:
// npm run verify:communications-contracts

import assert from "node:assert/strict";
import {
  actorRequiresUserId,
  canPublishCampaign,
  coachThreadLifecycle,
  describeEscalationForAssistantMessage,
  isValidCampaignTransition,
  isValidEscalationTransition,
  type Escalation,
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

function makeEscalation(overrides: Partial<Escalation>): Escalation {
  return {
    id: "esc-1",
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    sourceMessageId: null,
    reasonCategory: "pain_or_safety",
    status: "pending",
    proposedResponse: null,
    coachAction: null,
    resolvedBy: null,
    resolvedAtIso: null,
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

console.log("\n1. actorRequiresUserId — client/coach must carry an actor; assistant/system must not\n");

check("client requires an actor user id", () => assert.equal(actorRequiresUserId("client"), true));
check("coach requires an actor user id", () => assert.equal(actorRequiresUserId("coach"), true));
check("assistant does not require an actor user id", () => assert.equal(actorRequiresUserId("assistant"), false));
check("system does not require an actor user id", () => assert.equal(actorRequiresUserId("system"), false));

console.log("\n2. Escalation status transitions — only the approved lifecycle is valid\n");

check("pending -> proposed is valid", () => assert.equal(isValidEscalationTransition("pending", "proposed"), true));
check("proposed -> approved is valid", () => assert.equal(isValidEscalationTransition("proposed", "approved"), true));
check("proposed -> resolved is valid (declined without a coach response)", () =>
  assert.equal(isValidEscalationTransition("proposed", "resolved"), true)
);
check("approved -> coach_responded is valid", () =>
  assert.equal(isValidEscalationTransition("approved", "coach_responded"), true)
);
check("coach_responded -> resolved is valid", () =>
  assert.equal(isValidEscalationTransition("coach_responded", "resolved"), true)
);
check("resolved has no valid outgoing transitions — a resolved escalation stays resolved", () =>
  assert.deepEqual(isValidEscalationTransition("resolved", "pending"), false)
);
check("pending -> resolved directly is invalid — must pass through proposed", () =>
  assert.equal(isValidEscalationTransition("pending", "resolved"), false)
);
check("pending -> coach_responded is invalid — cannot skip proposed/approved", () =>
  assert.equal(isValidEscalationTransition("pending", "coach_responded"), false)
);

console.log("\n3. coachThreadLifecycle — derived, never a sixth stored status\n");

check("pending maps to unopened", () => assert.equal(coachThreadLifecycle("pending"), "unopened"));
check("proposed maps to unopened", () => assert.equal(coachThreadLifecycle("proposed"), "unopened"));
check("approved maps to open", () => assert.equal(coachThreadLifecycle("approved"), "open"));
check("coach_responded maps to open", () => assert.equal(coachThreadLifecycle("coach_responded"), "open"));
check("resolved maps to resolved", () => assert.equal(coachThreadLifecycle("resolved"), "resolved"));

console.log('\n4. describeEscalationForAssistantMessage — "sent to Teague" requires a real, non-pending record\n');

check("null escalation never produces a claim", () => assert.equal(describeEscalationForAssistantMessage(null), null));
check("a merely-pending escalation never produces a claim", () =>
  assert.equal(describeEscalationForAssistantMessage(makeEscalation({ status: "pending" })), null)
);
check("a proposed escalation does produce a claim", () =>
  assert.notEqual(describeEscalationForAssistantMessage(makeEscalation({ status: "proposed" })), null)
);
check("a resolved escalation still produces a claim (it really was sent, historically)", () =>
  assert.notEqual(describeEscalationForAssistantMessage(makeEscalation({ status: "resolved" })), null)
);

console.log("\n5. Campaign transitions and publish-eligibility\n");

check("draft -> preview is valid", () => assert.equal(isValidCampaignTransition("draft", "preview"), true));
check("preview -> draft is valid (coach can send it back for edits)", () =>
  assert.equal(isValidCampaignTransition("preview", "draft"), true)
);
check("preview -> approved is valid", () => assert.equal(isValidCampaignTransition("preview", "approved"), true));
check("approved -> published is valid", () => assert.equal(isValidCampaignTransition("approved", "published"), true));
check("draft -> published directly is invalid — must pass through preview and approved", () =>
  assert.equal(isValidCampaignTransition("draft", "published"), false)
);
check("published has no valid outgoing transitions", () =>
  assert.equal(isValidCampaignTransition("published", "draft"), false)
);

check("canPublishCampaign is false without both approvedBy and approvedAtIso", () => {
  assert.equal(canPublishCampaign({ status: "approved", approvedBy: null, approvedAtIso: null }), false);
  assert.equal(canPublishCampaign({ status: "approved", approvedBy: "coach-1", approvedAtIso: null }), false);
});
check("canPublishCampaign is true only once status is approved with both fields set", () => {
  assert.equal(
    canPublishCampaign({ status: "approved", approvedBy: "coach-1", approvedAtIso: "2026-01-01T00:00:00.000Z" }),
    true
  );
  assert.equal(
    canPublishCampaign({ status: "draft", approvedBy: "coach-1", approvedAtIso: "2026-01-01T00:00:00.000Z" }),
    false
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
