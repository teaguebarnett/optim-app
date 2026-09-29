// Pure logic tests for lib/auth/post-sign-in.ts — where a completed email
// sign-in lands, and that a carried `next` can never become an open
// redirect or a cross-role destination. No DB, no network, no browser.
// Run with: npm run verify:post-sign-in

import assert from "node:assert/strict";
import {
  isDestinationAllowed,
  resolvePostSignInDestination,
  resolveRoleHome,
  sanitizeNextPath,
  type SignInAccess,
} from "./post-sign-in.ts";

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

const NONE: SignInAccess = { isPlatformStaff: false, isWorkspaceStaff: false, isClient: false };
const OWNER: SignInAccess = { ...NONE, isWorkspaceStaff: true };
const CLIENT: SignInAccess = { ...NONE, isClient: true };
const FOUNDER: SignInAccess = { ...NONE, isPlatformStaff: true };
const FOUNDER_OWNER: SignInAccess = { ...NONE, isPlatformStaff: true, isWorkspaceStaff: true };

console.log("role homes");
check("workspace owner/coach -> /coach", () => assert.equal(resolveRoleHome(OWNER), "/coach"));
check("client -> /today", () => assert.equal(resolveRoleHome(CLIENT), "/today"));
check("founder/admin with no workspace -> /admin", () => assert.equal(resolveRoleHome(FOUNDER), "/admin"));
check("founder who also owns a workspace -> /coach", () => assert.equal(resolveRoleHome(FOUNDER_OWNER), "/coach"));
check("no role -> null", () => assert.equal(resolveRoleHome(NONE), null));

console.log("default destination (no next) — the reported bug");
check("owner with no next never lands on /auth/account", () => assert.equal(resolvePostSignInDestination(null, OWNER), "/coach"));
check("client with no next -> /today", () => assert.equal(resolvePostSignInDestination(null, CLIENT), "/today"));
check("founder with no next -> /admin", () => assert.equal(resolvePostSignInDestination(null, FOUNDER), "/admin"));
check("role-less session -> /auth/account", () => assert.equal(resolvePostSignInDestination(null, NONE), "/auth/account"));

console.log("authorized next is honored");
check("owner next=/coach/clients", () => assert.equal(resolvePostSignInDestination("/coach/clients?tab=all", OWNER), "/coach/clients?tab=all"));
check("owner next=/coach-onboarding", () => assert.equal(resolvePostSignInDestination("/coach-onboarding", OWNER), "/coach-onboarding"));
check("client next=/training", () => assert.equal(resolvePostSignInDestination("/training", CLIENT), "/training"));
check("founder-owner next=/admin", () => assert.equal(resolvePostSignInDestination("/admin", FOUNDER_OWNER), "/admin"));

console.log("unauthorized next falls back to the role's home");
check("owner next=/today -> /coach", () => assert.equal(resolvePostSignInDestination("/today", OWNER), "/coach"));
check("owner next=/admin -> /coach", () => assert.equal(resolvePostSignInDestination("/admin/users", OWNER), "/coach"));
check("client next=/coach -> /today", () => assert.equal(resolvePostSignInDestination("/coach", CLIENT), "/today"));
check("client next=/admin -> /today", () => assert.equal(resolvePostSignInDestination("/admin", CLIENT), "/today"));
check("founder next=/coach -> /admin", () => assert.equal(resolvePostSignInDestination("/coach", FOUNDER), "/admin"));
check("prefix lookalike /coaching is not coach area", () => assert.equal(isDestinationAllowed("/coaching", OWNER), false));
check("prefix lookalike /administrator is not admin area", () => assert.equal(isDestinationAllowed("/administrator", FOUNDER), false));

console.log("open-redirect and loop protection");
for (const bad of [
  "https://evil.example/coach",
  "//evil.example/coach",
  "/\\evil.example",
  "\\\\evil.example",
  "javascript:alert(1)",
  "coach",
  "",
  "/auth/account",
  "/auth/confirm?next=/coach",
  "/auth",
]) {
  check(`sanitizeNextPath rejects ${JSON.stringify(bad)}`, () => assert.equal(sanitizeNextPath(bad), null));
  check(`owner with next=${JSON.stringify(bad)} -> /coach`, () => assert.equal(resolvePostSignInDestination(bad, OWNER), "/coach"));
}
check("sanitizeNextPath normalizes dot segments out of /auth", () => assert.equal(sanitizeNextPath("/coach/../auth/account"), null));
check("sanitizeNextPath keeps query and hash", () => assert.equal(sanitizeNextPath("/coach/clients?x=1#top"), "/coach/clients?x=1#top"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
