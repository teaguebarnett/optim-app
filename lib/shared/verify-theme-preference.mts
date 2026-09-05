// Phase 5.3B — per-account theme-preference persistence. Uses a minimal
// in-memory localStorage stand-in (this runs under plain Node, not a
// browser) so the real module under test never needs a test-only branch.

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

(globalThis as unknown as { window: unknown }).window = { localStorage: new MemoryStorage() };

const { loadThemePreference, saveThemePreference } = await import("./theme-preference.ts");

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

console.log("\n1. First-time accounts have no saved preference\n");

check("An account that has never chosen returns null, never a silent default", () => {
  assert.equal(loadThemePreference("client", "client-never-chosen"), null);
  assert.equal(loadThemePreference("coach", "coach-never-chosen"), null);
});

console.log("\n2. Saving and loading round-trips exactly\n");

check("A saved client preference is read back exactly", () => {
  saveThemePreference("client", "client-1", "dark");
  assert.equal(loadThemePreference("client", "client-1"), "dark");
});

check("A saved coach preference is read back exactly", () => {
  saveThemePreference("coach", "coach-teague", "light");
  assert.equal(loadThemePreference("coach", "coach-teague"), "light");
});

console.log("\n3. Per-account isolation — never a single global key\n");

check("Two different clients' preferences never collide, even when chosen oppositely", () => {
  saveThemePreference("client", "client-a", "light");
  saveThemePreference("client", "client-b", "dark");
  assert.equal(loadThemePreference("client", "client-a"), "light");
  assert.equal(loadThemePreference("client", "client-b"), "dark");
});

check("A coach's preference never leaks into a client's, even with the same underlying account id string", () => {
  saveThemePreference("coach", "shared-id-1", "dark");
  saveThemePreference("client", "shared-id-1", "light");
  assert.equal(loadThemePreference("coach", "shared-id-1"), "dark");
  assert.equal(loadThemePreference("client", "shared-id-1"), "light");
});

check("Two coaches in the same workspace (Teague, Alex) keep fully independent preferences", () => {
  saveThemePreference("coach", "coach-teague", "dark");
  saveThemePreference("coach", "coach-alex", "light");
  assert.equal(loadThemePreference("coach", "coach-teague"), "dark");
  assert.equal(loadThemePreference("coach", "coach-alex"), "light");
});

console.log("\n4. Changing a preference overwrites cleanly, never appends or corrupts\n");

check("Re-saving a different mode for the same account replaces the old value", () => {
  saveThemePreference("client", "client-switch", "light");
  assert.equal(loadThemePreference("client", "client-switch"), "light");
  saveThemePreference("client", "client-switch", "dark");
  assert.equal(loadThemePreference("client", "client-switch"), "dark");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
