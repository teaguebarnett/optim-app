// Phase 6.0A — Production Foundation.
//
// Pure logic tests for lib/production/mode.ts's runtime-mode boundary — the
// fail-closed "production build must reject demo mode" rule in particular.
// No DB, no network, no browser. Run with: npm run verify:production-mode
//
// The "server-only" package (imported by mode.ts) throws by default —
// node_modules/server-only/package.json's exports map only resolves to the
// safe empty.js under the "react-server" condition (the one Next.js sets
// for genuine server bundles); its plain "default" condition throws
// unconditionally, precisely so an accidental client-bundle import fails
// loudly. Plain `node lib/production/verify-mode.mts` doesn't set that
// condition either, so this script (and the "verify:production-mode" npm
// script that runs it) must pass `--conditions=react-server` to node, or
// this import throws immediately on line 1 of mode.ts. See that script in
// package.json.

import assert from "node:assert/strict";

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

/** Each check runs against a fresh process.env snapshot and a fresh dynamic
 * import isn't actually necessary here — resolveAppMode() reads
 * process.env live on every call rather than caching, so mutating env vars
 * between checks is sufficient. Confirmed by reading the module's own
 * source: no module-level caching of the resolved mode. */
const { resolveAppMode, isSupabaseMode, isDemoMode } = await import("./mode.ts");

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

console.log("\n1. Default behavior — demo mode everywhere except a real Vercel Production deploy\n");

check("no APP_MODE, no VERCEL_ENV: resolves to demo", () => {
  withEnv({ APP_MODE: undefined, VERCEL_ENV: undefined }, () => {
    assert.equal(resolveAppMode(), "demo");
    assert.equal(isDemoMode(), true);
    assert.equal(isSupabaseMode(), false);
  });
});

check("APP_MODE=supabase, no VERCEL_ENV: resolves to supabase", () => {
  withEnv({ APP_MODE: "supabase", VERCEL_ENV: undefined }, () => {
    assert.equal(resolveAppMode(), "supabase");
    assert.equal(isSupabaseMode(), true);
  });
});

check('an unrecognized APP_MODE value falls back to demo, never throws or picks "supabase"', () => {
  withEnv({ APP_MODE: "some-typo", VERCEL_ENV: undefined }, () => {
    assert.equal(resolveAppMode(), "demo");
  });
});

console.log("\n2. Preview deployments may run either mode\n");

check("VERCEL_ENV=preview with APP_MODE=demo: allowed, resolves to demo", () => {
  withEnv({ APP_MODE: "demo", VERCEL_ENV: "preview" }, () => {
    assert.equal(resolveAppMode(), "demo");
  });
});

check("VERCEL_ENV=preview with APP_MODE=supabase: allowed, resolves to supabase", () => {
  withEnv({ APP_MODE: "supabase", VERCEL_ENV: "preview" }, () => {
    assert.equal(resolveAppMode(), "supabase");
  });
});

console.log('\n3. A real Production deploy must reject demo mode — "production build must reject demo mode"\n');

check("VERCEL_ENV=production with APP_MODE=supabase: allowed", () => {
  withEnv({ APP_MODE: "supabase", VERCEL_ENV: "production" }, () => {
    assert.equal(resolveAppMode(), "supabase");
  });
});

check("VERCEL_ENV=production with APP_MODE=demo: throws rather than silently running demo in production", () => {
  withEnv({ APP_MODE: "demo", VERCEL_ENV: "production" }, () => {
    assert.throws(() => resolveAppMode(), /Refusing to start/);
  });
});

check("VERCEL_ENV=production with APP_MODE unset: throws (unset defaults to demo, which is still rejected)", () => {
  withEnv({ APP_MODE: undefined, VERCEL_ENV: "production" }, () => {
    assert.throws(() => resolveAppMode(), /Refusing to start/);
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
