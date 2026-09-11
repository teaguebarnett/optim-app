// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// Pure logic tests for lib/coach/roster.ts's deriveLifecycle — the one
// function that turns (client_enrollments.status, whether/when a
// client_onboarding_progress row exists) into the shared
// invited/onboarding/coach_setup/active/paused/completed vocabulary every
// coach surface (demo and Supabase) renders through the same
// LifecycleBadge/RosterRow shape. No DB, no network — see
// lib/production/roster.ts's own module doc for why lifecycle is derived
// rather than stored.
//
// Run with: npm run verify:roster

import assert from "node:assert/strict";
import { deriveLifecycle } from "../coach/roster.ts";

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

console.log("\n1. No enrollment status yet (nothing staff has set) — driven entirely by onboarding\n");

check("no onboarding row at all -> invited", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: null, onboardingExists: false, onboardingCompletedAtIso: null }), "invited");
});

check("onboarding row exists, not completed -> onboarding", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: null, onboardingExists: true, onboardingCompletedAtIso: null }), "onboarding");
});

check("onboarding row exists and completed, enrollment still 'invited' -> coach_setup (awaiting review)", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "invited", onboardingExists: true, onboardingCompletedAtIso: "2026-09-11T00:00:00.000Z" }), "coach_setup");
});

check("enrollment status 'onboarding', onboarding not complete -> onboarding", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "onboarding", onboardingExists: true, onboardingCompletedAtIso: null }), "onboarding");
});

console.log("\n2. Staff-controlled enrollment status always wins once set to active/paused/offboarded\n");

check("enrollment status 'active' -> active, REGARDLESS of onboarding completion", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "active", onboardingExists: true, onboardingCompletedAtIso: null }), "active");
  assert.equal(deriveLifecycle({ enrollmentStatus: "active", onboardingExists: false, onboardingCompletedAtIso: null }), "active");
});

check("enrollment status 'paused' -> paused, even with completed onboarding", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "paused", onboardingExists: true, onboardingCompletedAtIso: "2026-09-11T00:00:00.000Z" }), "paused");
});

check("enrollment status 'offboarded' -> completed", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "offboarded", onboardingExists: true, onboardingCompletedAtIso: "2026-09-11T00:00:00.000Z" }), "completed");
});

console.log("\n3. The exact real-pilot sequence, in order — regression guard against re-introducing the\n   'setting a start date silently activates a not-yet-reviewed client' defect this phase fixed\n");

check("real pilot walk: invited -> onboarding -> coach_setup -> active, one honest state at a time", () => {
  // 1. Coach invites: no onboarding row, no enrollment row (or 'invited').
  assert.equal(deriveLifecycle({ enrollmentStatus: null, onboardingExists: false, onboardingCompletedAtIso: null }), "invited");
  // 2. Client starts onboarding: row exists, not yet completed.
  assert.equal(deriveLifecycle({ enrollmentStatus: null, onboardingExists: true, onboardingCompletedAtIso: null }), "onboarding");
  // 3. Client finishes: completed_at set. Coach has NOT activated yet — even
  //    if the coach has already set a start date (setClientProgramStartDate
  //    no longer forces status to "active" — see lib/production/programs.ts's
  //    own fix doc), this must stay "coach_setup", never jump to "active".
  assert.equal(deriveLifecycle({ enrollmentStatus: "onboarding", onboardingExists: true, onboardingCompletedAtIso: "2026-09-11T00:00:00.000Z" }), "coach_setup");
  // 4. Coach explicitly activates (activateClientEnrollment) once program +
  //    nutrition + start date all exist: status flips to "active".
  assert.equal(deriveLifecycle({ enrollmentStatus: "active", onboardingExists: true, onboardingCompletedAtIso: "2026-09-11T00:00:00.000Z" }), "active");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
