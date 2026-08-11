// Internal multi-workspace isolation verification.
//
// Not a UI test — this exercises the tenancy access layer directly against
// the OPTIM demo workspace plus the internal-only Atlas fixture workspace
// (see ./seed.ts) to prove workspace/client/coach scoping actually holds.
// No workspace switcher or Atlas content is ever exposed in the app itself.
//
// Run with: npm run verify:tenancy
// (Uses Node's built-in TypeScript stripping — see package.json — rather
// than adding a test framework the project doesn't already use.)

import assert from "node:assert/strict";

import {
  resolveActiveContext,
  tryResolveActiveContext,
  getDemoClientSession,
  TenancyAccessError,
} from "./context.ts";
import {
  getClientProfile,
  listCoachAssignedClients,
  listWorkspaceClients,
  scopeClientOwnedRecords,
} from "./access.ts";
import {
  ALL_SAMPLE_MESSAGES,
  ALL_SAMPLE_REVIEW_REQUESTS,
  ALEX_USER,
  ATLAS_CLIENT_SESSION,
  CLIENT_PROFILE_DEMO,
  CLIENT_PROFILE_JORDAN,
  CLIENT_PROFILE_SECONDARY,
  CLIENT_USER,
  COACH_PROFILE_ALEX,
  COACH_PROFILE_TEAGUE,
  JORDAN_USER,
  TEAGUE_USER,
  WORKSPACE_ATLAS_ID,
  WORKSPACE_OPTIM_ID,
} from "./seed.ts";
import type { SessionPointer } from "./types.ts";

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

function assertThrowsTenancyError(fn: () => void, message: string): void {
  assert.throws(fn, TenancyAccessError, message);
}

console.log("\n1. Identity resolves from centralized workspace configuration, not a hardcoded default\n");

check("OPTIM demo session resolves OPTIM/Teague/OPTIM Assistant/Client", () => {
  const ctx = resolveActiveContext(getDemoClientSession());
  assert.equal(ctx.branding.businessName, "OPTIM");
  assert.equal(ctx.assistantDisplayName, "OPTIM Assistant");
  assert.equal(ctx.primaryCoach?.displayName, "Teague");
  assert.equal(ctx.clientProfile?.name, "Client");
  assert.equal(ctx.role, "client");
});

check("Atlas fixture session resolves entirely different identity from the same resolver", () => {
  const ctx = resolveActiveContext(ATLAS_CLIENT_SESSION);
  assert.equal(ctx.branding.businessName, "Atlas Performance Coaching");
  assert.equal(ctx.assistantDisplayName, "Atlas Coach Assistant");
  assert.equal(ctx.primaryCoach?.displayName, "Priya");
  assert.equal(ctx.clientProfile?.name, "Jordan");
  assert.notEqual(ctx.workspace.id, WORKSPACE_OPTIM_ID);
});

console.log("\n2. A workspace cannot retrieve another workspace's records\n");

check("getClientProfile throws when the client belongs to a different workspace", () => {
  const optimCtx = resolveActiveContext({ userId: TEAGUE_USER.id, workspaceId: WORKSPACE_OPTIM_ID });
  assertThrowsTenancyError(
    () => getClientProfile(optimCtx, CLIENT_PROFILE_JORDAN.id),
    "OPTIM workspace owner should not be able to fetch Atlas's client"
  );
});

check("scopeClientOwnedRecords excludes every other workspace's messages", () => {
  const optimCtx = resolveActiveContext(getDemoClientSession());
  const visible = scopeClientOwnedRecords(optimCtx, ALL_SAMPLE_MESSAGES);
  assert.ok(visible.length > 0, "expected at least one OPTIM message to be visible");
  assert.ok(
    visible.every((m) => m.workspaceId === WORKSPACE_OPTIM_ID),
    "no Atlas-workspace message should appear in an OPTIM-scoped read"
  );
});

check("scopeClientOwnedRecords excludes every other workspace's review requests", () => {
  const atlasCtx = resolveActiveContext(ATLAS_CLIENT_SESSION);
  const visible = scopeClientOwnedRecords(atlasCtx, ALL_SAMPLE_REVIEW_REQUESTS);
  assert.ok(visible.length > 0, "expected at least one Atlas review request to be visible");
  assert.ok(
    visible.every((r) => r.workspaceId === WORKSPACE_ATLAS_ID),
    "no OPTIM-workspace review request should appear in an Atlas-scoped read"
  );
});

console.log("\n3. Coach assignments are correctly scoped, including within one workspace\n");

check("Teague (workspace owner) can list every OPTIM client, including ones he doesn't personally coach", () => {
  const teagueCtx = resolveActiveContext({ userId: TEAGUE_USER.id, workspaceId: WORKSPACE_OPTIM_ID });
  const clients = listWorkspaceClients(teagueCtx);
  const ids = clients.map((c) => c.id);
  assert.ok(ids.includes(CLIENT_PROFILE_DEMO.id));
  assert.ok(ids.includes(CLIENT_PROFILE_SECONDARY.id));
});

check("Alex (coach) sees only his assigned client, not Teague's", () => {
  const alexCtx = resolveActiveContext({ userId: ALEX_USER.id, workspaceId: WORKSPACE_OPTIM_ID });
  assert.equal(alexCtx.role, "coach");
  const assigned = listCoachAssignedClients(alexCtx, COACH_PROFILE_ALEX.id);
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].id, CLIENT_PROFILE_SECONDARY.id);
});

check("Coach cannot retrieve an unassigned client, even inside their own workspace (acceptance test 8)", () => {
  const alexCtx = resolveActiveContext({ userId: ALEX_USER.id, workspaceId: WORKSPACE_OPTIM_ID });
  assertThrowsTenancyError(
    () => getClientProfile(alexCtx, CLIENT_PROFILE_DEMO.id),
    "Alex is not assigned to the demo client and must not be able to fetch it"
  );
});

check("Coach cannot list another coach's assigned-client roster", () => {
  const alexCtx = resolveActiveContext({ userId: ALEX_USER.id, workspaceId: WORKSPACE_OPTIM_ID });
  assertThrowsTenancyError(
    () => listCoachAssignedClients(alexCtx, COACH_PROFILE_TEAGUE.id),
    "Alex should not be able to list Teague's roster"
  );
});

console.log("\n4. A client cannot retrieve another client's records\n");

check("Client role can fetch their own profile", () => {
  const clientCtx = resolveActiveContext(getDemoClientSession());
  const own = getClientProfile(clientCtx, CLIENT_PROFILE_DEMO.id);
  assert.equal(own.id, CLIENT_PROFILE_DEMO.id);
});

check("Client role cannot fetch a different client's profile in the same workspace (acceptance test 9)", () => {
  const clientCtx = resolveActiveContext(getDemoClientSession());
  assertThrowsTenancyError(
    () => getClientProfile(clientCtx, CLIENT_PROFILE_SECONDARY.id),
    "The demo client must not be able to fetch the secondary fixture client's profile"
  );
});

check("Client role cannot fetch a client's profile in a different workspace", () => {
  const clientCtx = resolveActiveContext(getDemoClientSession());
  assertThrowsTenancyError(
    () => getClientProfile(clientCtx, CLIENT_PROFILE_JORDAN.id),
    "The OPTIM demo client must not be able to fetch Atlas's client"
  );
});

check("scopeClientOwnedRecords for a client role returns only that client's own records", () => {
  const clientCtx = resolveActiveContext(getDemoClientSession());
  const visible = scopeClientOwnedRecords(clientCtx, ALL_SAMPLE_MESSAGES);
  assert.ok(visible.length > 0);
  assert.ok(visible.every((m) => m.clientId === CLIENT_PROFILE_DEMO.id));
});

console.log("\n5. Assistant and coach sender identities remain distinct\n");

check("A workspace's assistant name is never equal to its coach's name", () => {
  for (const session of [getDemoClientSession(), ATLAS_CLIENT_SESSION] as SessionPointer[]) {
    const ctx = resolveActiveContext(session);
    assert.notEqual(ctx.assistantDisplayName, ctx.primaryCoach?.displayName);
  }
});

check("Coach-authored sample messages resolve to a real coach identity distinct from the assistant", () => {
  const optimCtx = resolveActiveContext({ userId: TEAGUE_USER.id, workspaceId: WORKSPACE_OPTIM_ID });
  const coachMessages = scopeClientOwnedRecords(
    resolveActiveContext(getDemoClientSession()),
    ALL_SAMPLE_MESSAGES
  ).filter((m) => m.sender === "coach");
  assert.ok(coachMessages.length > 0, "expected at least one coach-sent sample message");
  assert.ok(optimCtx.coachProfile === null || optimCtx.coachProfile.displayName !== optimCtx.assistantDisplayName);
});

console.log("\n6. Missing workspace or membership context fails safely (default-deny)\n");

check("resolveActiveContext throws for an unknown user id", () => {
  assertThrowsTenancyError(
    () => resolveActiveContext({ userId: "user-does-not-exist", workspaceId: WORKSPACE_OPTIM_ID }),
    "an unknown user must not silently resolve to some default identity"
  );
});

check("resolveActiveContext throws for an unknown workspace id", () => {
  assertThrowsTenancyError(
    () => resolveActiveContext({ userId: CLIENT_USER.id, workspaceId: "workspace-does-not-exist" }),
    "an unknown workspace must not silently resolve"
  );
});

check("resolveActiveContext throws when the user has no membership in the requested workspace", () => {
  // Jordan is a member of Atlas, not OPTIM.
  assertThrowsTenancyError(
    () => resolveActiveContext({ userId: JORDAN_USER.id, workspaceId: WORKSPACE_OPTIM_ID }),
    "a user with no membership row for this workspace must be denied, not defaulted"
  );
});

check("tryResolveActiveContext returns null (not a partial context) for the same failure", () => {
  const result = tryResolveActiveContext({ userId: "nobody", workspaceId: "nowhere" });
  assert.equal(result, null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
