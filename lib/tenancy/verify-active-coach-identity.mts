// Pre-production QA fix — active coach identity correction.
//
// Exercises lib/tenancy/session.ts's applyActiveCoachIdentityCorrectionOnce
// (a one-time, identity-specific migration that repairs a browser whose
// active-coach-user-id was left pointing at the Alex QA fixture by an
// earlier /dev "Enter as Alex (second coach)" session) directly against the
// real implementation, no UI rendering involved. Uses a minimal in-memory
// localStorage stand-in (this runs under plain Node, not a browser) so the
// real module under test never needs a test-only branch — same convention
// as lib/shared/verify-theme-preference.mts. Run with:
// npm run verify:active-coach-identity

import assert from "node:assert/strict";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

let memoryStorage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = {
  get localStorage() {
    return memoryStorage;
  },
};

const { loadActiveCoachUserId, saveActiveCoachUserId, loadActiveClientId, saveActiveClientId } = await import("./session.ts");
const { getDemoCoachSession } = await import("./session.ts");
const { resolveActiveContext } = await import("./context.ts");
const { TEAGUE_USER, ALEX_USER, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO, ALL_CLIENT_PROFILES } = await import("./seed.ts");

const ACTIVE_COACH_KEY = "peak-coaching:active-coach-user-id:v1";
const CORRECTION_KEY = "peak-coaching:active-coach-identity-correction:v1";
const ACTIVE_CLIENT_KEY = "peak-coaching:active-client-id:v1";

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

/** Fresh, empty in-memory browser for each check — no correction-applied
 * flag, no stored identity, exactly like a browser this fix has never
 * touched. */
function resetBrowser(): void {
  memoryStorage = new MemoryStorage();
}

console.log("\n1. A browser stuck on the stale Alex QA fixture is corrected to Teague\n");

check("A browser whose stored active-coach-user-id is Alex's resolves to Teague after the one-time correction", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, ALEX_USER.id);
  assert.equal(loadActiveCoachUserId(), TEAGUE_USER.id);
  // Not just the in-memory return value — the correction actually wrote
  // Teague back to the real storage key, so a second independent read
  // (e.g. a different hook instance) agrees.
  assert.equal(memoryStorage.getItem(ACTIVE_COACH_KEY), TEAGUE_USER.id);
});

check("getDemoCoachSession/resolveActiveContext resolve the corrected browser's active coach as Teague, not Alex", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, ALEX_USER.id);
  const ctx = resolveActiveContext(getDemoCoachSession());
  assert.equal(ctx.coachProfile?.id, COACH_PROFILE_TEAGUE.id);
  assert.equal(ctx.coachProfile?.displayName, "Coach");
  assert.equal(ctx.coachProfile?.avatarInitials, "C");
});

check("The exact coachOverride shape components/chat/message-bubble.tsx attributes coach-authored messages to resolves to Teague", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, ALEX_USER.id);
  const ctx = resolveActiveContext(getDemoCoachSession());
  // Mirrors components/coach/client-workspace.tsx's own coachOverride
  // derivation exactly — the one place a coach-authored chat bubble's
  // attribution actually comes from.
  const coachOverride = ctx.coachProfile
    ? { displayName: ctx.coachProfile.displayName, avatarInitials: ctx.coachProfile.avatarInitials }
    : null;
  assert.deepEqual(coachOverride, { displayName: "Coach", avatarInitials: "C" });
});

console.log("\n2. The correction is one-time only — it never reverts a later, genuine choice\n");

check("After correction, explicitly switching to Alex again via saveActiveCoachUserId sticks — the fix never fights a real developer choice", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, ALEX_USER.id);
  assert.equal(loadActiveCoachUserId(), TEAGUE_USER.id); // corrected once
  saveActiveCoachUserId(ALEX_USER.id); // a fresh, deliberate choice
  assert.equal(loadActiveCoachUserId(), ALEX_USER.id); // never re-corrected
});

check("The correction-applied flag is permanent so the correction logic runs at most once", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, ALEX_USER.id);
  loadActiveCoachUserId();
  assert.equal(memoryStorage.getItem(CORRECTION_KEY), "done");
});

console.log("\n3. Baseline behavior for browsers that were never affected\n");

check("A fresh browser with nothing stored still defaults to Teague, unaffected by the correction logic", () => {
  resetBrowser();
  assert.equal(loadActiveCoachUserId(), TEAGUE_USER.id);
});

check("A browser already correctly on Teague is left untouched", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, TEAGUE_USER.id);
  assert.equal(loadActiveCoachUserId(), TEAGUE_USER.id);
  assert.equal(memoryStorage.getItem(CORRECTION_KEY), "done");
});

console.log("\n4. The correction never touches client identity or any other data\n");

check("Correcting the active coach never changes which client is active", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, ALEX_USER.id);
  saveActiveClientId(CLIENT_PROFILE_DEMO.id);
  loadActiveCoachUserId();
  assert.equal(memoryStorage.getItem(ACTIVE_CLIENT_KEY), CLIENT_PROFILE_DEMO.id);
  assert.equal(loadActiveClientId(), CLIENT_PROFILE_DEMO.id);
});

check("Every seeded client profile is exactly what it was before this fix — no client was renamed or altered", () => {
  const names = ALL_CLIENT_PROFILES.map((c) => c.name).sort();
  assert.deepEqual(names, ["Client", "Jordan", "Secondary Fixture Client"].sort());
});

console.log("\n5. OPTIM the assistant stays distinct from Teague the human coach\n");

check("The AI assistant's display name is never conflated with the corrected coach's own name", () => {
  resetBrowser();
  memoryStorage.setItem(ACTIVE_COACH_KEY, ALEX_USER.id);
  const ctx = resolveActiveContext(getDemoCoachSession());
  assert.equal(ctx.assistantDisplayName, "OPTIM Assistant");
  assert.notEqual(ctx.assistantDisplayName, ctx.coachProfile?.displayName);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
