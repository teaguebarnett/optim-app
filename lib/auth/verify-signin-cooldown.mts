// Phase 6.0A — Production Foundation.
//
// Pure logic tests for lib/auth/signin-cooldown.ts — the client-side
// mitigation for the live-reproduced PKCE bug where a second signInWithOtp
// request (even one GoTrue itself rate-limits with a 429) invalidates a
// still-outstanding first magic-link's server-side challenge. See that
// file's own doc for the full root-cause evidence. No DB, no network, no
// browser. Run with: npm run verify:signin-cooldown

import assert from "node:assert/strict";
import {
  DEFAULT_COOLDOWN_SECONDS,
  parseRetryAfterSeconds,
  readCooldownMs,
  writeCooldown,
  type CooldownStorage,
} from "./signin-cooldown.ts";

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

/** A minimal in-memory stand-in for window.sessionStorage — the real
 * cooldown module only ever calls getItem/setItem, matching the real API
 * exactly, so this is a faithful substitute for tests. */
function fakeStorage(): CooldownStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

check("Scenario A — a single request for an email with no prior history is never blocked", () => {
  const storage = fakeStorage();
  assert.equal(readCooldownMs(storage, "a@example.com", 1_000_000), 0);
});

check("after a request is recorded, the SAME email is blocked for the cooldown window", () => {
  const storage = fakeStorage();
  const now = 1_000_000;
  writeCooldown(storage, "a@example.com", 60, now);
  assert.equal(readCooldownMs(storage, "a@example.com", now), 60_000);
  assert.equal(readCooldownMs(storage, "a@example.com", now + 30_000), 30_000);
});

check("Scenario B — the cooldown recorded by request A blocks a same-tab resubmit for the SAME email before it can ever reach the network", () => {
  // This is the exact reported sequence: request A succeeds, and a few
  // seconds later (well inside the 60s window) the user resubmits the same
  // form for the same email. The fix's whole point is that this second
  // signInWithOtp call must never be dispatched — GoTrue proved (live) that
  // its mere arrival invalidates request A's still-unclicked link,
  // regardless of whether the second request's own response succeeds.
  const storage = fakeStorage();
  const now = 1_000_000;
  writeCooldown(storage, "a@example.com", DEFAULT_COOLDOWN_SECONDS, now);
  const remaining = readCooldownMs(storage, "a@example.com", now + 5_000);
  assert.ok(remaining > 0, "a resubmit 5s later must still be blocked, not sent");
});

check("cooldown is scoped per email — a different address is never blocked by another email's pending link", () => {
  const storage = fakeStorage();
  const now = 1_000_000;
  writeCooldown(storage, "a@example.com", 60, now);
  assert.equal(readCooldownMs(storage, "b@example.com", now), 0);
});

check("cooldown expires exactly at the recorded window and allows a resubmit again after it", () => {
  const storage = fakeStorage();
  const now = 1_000_000;
  writeCooldown(storage, "a@example.com", 60, now);
  assert.equal(readCooldownMs(storage, "a@example.com", now + 60_000), 0);
  assert.equal(readCooldownMs(storage, "a@example.com", now + 61_000), 0);
});

check("corrupted/foreign storage content is treated as no cooldown, not a crash", () => {
  const storage = fakeStorage();
  storage.setItem("optim-signin-cooldown", "not json");
  assert.equal(readCooldownMs(storage, "a@example.com", 1_000_000), 0);
});

check("parseRetryAfterSeconds reads GoTrue's own real 429 message text", () => {
  assert.equal(
    parseRetryAfterSeconds("For security purposes, you can only request this after 42 seconds."),
    42
  );
  assert.equal(
    parseRetryAfterSeconds("For security purposes, you can only request this after 1 seconds."),
    1
  );
});

check("parseRetryAfterSeconds falls back to the default when the message doesn't match", () => {
  assert.equal(parseRetryAfterSeconds("Some unrelated error"), DEFAULT_COOLDOWN_SECONDS);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
