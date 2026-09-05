// Phase 5.3B — AI Coaching Authority: pure policy-resolver and
// platform-store persistence tests. No generative AI service exists in
// this repository; this only tests the deterministic permission model
// (lib/coach/ai-authority.ts) and its storage (lib/coach/platform-store.ts).

import assert from "node:assert/strict";
import {
  AI_AUTHORITY_LEVELS,
  defaultCoachAiAuthoritySettings,
  resolveAiActionDisposition,
  resolveEffectiveAiAuthorityLevel,
  type CoachAiAuthoritySettings,
} from "./ai-authority.ts";
import { createInitialPlatformState, migratePlatformState, platformReducer, type PlatformState } from "./platform-store.ts";
import { getAiAuthoritySettings } from "./repository.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, COACH_PROFILE_ALEX } from "../tenancy/seed.ts";

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

console.log("\n1. Honest defaults — no fabricated 'AI disabled' or undefined state\n");

check("A coach who has never touched this setting gets a real, documented default level", () => {
  const state = createInitialPlatformState();
  const settings = getAiAuthoritySettings(state, COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID);
  assert.equal(settings.global.level, "copilot");
  assert.deepEqual(settings.clientOverrides, {});
});

console.log("\n2. Safety rules are absolute — never softened by level\n");

check("Pain/injury always escalates, at every one of the four levels", () => {
  for (const level of AI_AUTHORITY_LEVELS) {
    assert.equal(resolveAiActionDisposition(level, "pain_or_injury"), "escalate", `${level} must escalate pain_or_injury`);
  }
});

check("Out-of-bounds actions always escalate, at every level", () => {
  for (const level of AI_AUTHORITY_LEVELS) {
    assert.equal(resolveAiActionDisposition(level, "out_of_bounds"), "escalate", `${level} must escalate out_of_bounds`);
  }
});

check("A 'major' training or nutrition change always escalates, even at the most autonomous levels", () => {
  assert.equal(resolveAiActionDisposition("ai_led", "training_change", "major"), "escalate");
  assert.equal(resolveAiActionDisposition("review_only", "nutrition_change", "major"), "escalate");
  assert.equal(resolveAiActionDisposition("advisor", "training_change", "major"), "escalate");
});

console.log("\n3. Routine-action dispositions match each level's real, documented behavior\n");

check("Advisor only ever suggests — never drafts or auto-executes anything routine", () => {
  for (const category of ["training_change", "nutrition_change", "daily_planning_adjustment", "messaging_nudge"] as const) {
    assert.equal(resolveAiActionDisposition("advisor", category), "suggest");
  }
});

check("Copilot drafts meaningful training/nutrition changes but auto-handles clearly routine daily-planning/messaging actions", () => {
  assert.equal(resolveAiActionDisposition("copilot", "training_change"), "draft");
  assert.equal(resolveAiActionDisposition("copilot", "nutrition_change"), "draft");
  assert.equal(resolveAiActionDisposition("copilot", "daily_planning_adjustment"), "auto_execute");
  assert.equal(resolveAiActionDisposition("copilot", "messaging_nudge"), "auto_execute");
});

check("AI-led auto-executes every routine category (only major/pain/out-of-bounds escalate)", () => {
  for (const category of ["training_change", "nutrition_change", "daily_planning_adjustment", "messaging_nudge"] as const) {
    assert.equal(resolveAiActionDisposition("ai_led", category), "auto_execute");
  }
});

console.log("\n4. Global default vs. per-client override vs. domain override resolution\n");

function makeSettings(overrides: Partial<CoachAiAuthoritySettings> = {}): CoachAiAuthoritySettings {
  return { ...defaultCoachAiAuthoritySettings(COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID, "2026-01-01T00:00:00.000Z"), ...overrides };
}

check("With no override anywhere, every client resolves to the coach's global level", () => {
  const settings = makeSettings({ global: { level: "ai_led", domainOverrides: {} } });
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, "client-1"), "ai_led");
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, null), "ai_led");
});

check("A per-client override replaces the global level for that client only", () => {
  const settings = makeSettings({
    global: { level: "copilot", domainOverrides: {} },
    clientOverrides: { "client-1": { level: "advisor", domainOverrides: {} } },
  });
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, "client-1"), "advisor");
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, "client-2"), "copilot");
});

check("A domain override (global) wins over the base level for that one domain only", () => {
  const settings = makeSettings({ global: { level: "ai_led", domainOverrides: { nutrition: "advisor" } } });
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, null, "nutrition"), "advisor");
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, null, "training"), "ai_led");
});

check("A client's own domain override wins over both its base level and the global domain override", () => {
  const settings = makeSettings({
    global: { level: "copilot", domainOverrides: { training: "advisor" } },
    clientOverrides: { "client-1": { level: "ai_led", domainOverrides: { training: "review_only" } } },
  });
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, "client-1", "training"), "review_only");
});

check("A client override with NO domain overrides of its own still inherits the global domain override for a domain it doesn't mention", () => {
  const settings = makeSettings({
    global: { level: "copilot", domainOverrides: { nutrition: "advisor" } },
    clientOverrides: { "client-1": { level: "ai_led", domainOverrides: {} } },
  });
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, "client-1", "nutrition"), "advisor");
  assert.equal(resolveEffectiveAiAuthorityLevel(settings, "client-1", "training"), "ai_led");
});

console.log("\n5. Platform-store persistence — global default, per-client override, multi-coach isolation\n");

check("SET_AI_AUTHORITY_GLOBAL creates then updates one settings record per coach", () => {
  let state = createInitialPlatformState();
  state = platformReducer(state, {
    type: "SET_AI_AUTHORITY_GLOBAL",
    coachId: COACH_PROFILE_TEAGUE.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    config: { level: "ai_led", domainOverrides: {} },
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(state.aiAuthoritySettings.length, 1);
  assert.equal(getAiAuthoritySettings(state, COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID).global.level, "ai_led");

  state = platformReducer(state, {
    type: "SET_AI_AUTHORITY_GLOBAL",
    coachId: COACH_PROFILE_TEAGUE.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    config: { level: "review_only", domainOverrides: {} },
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  assert.equal(state.aiAuthoritySettings.length, 1, "must update in place, never duplicate a coach's record");
  assert.equal(getAiAuthoritySettings(state, COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID).global.level, "review_only");
});

check("SET_AI_AUTHORITY_CLIENT_OVERRIDE sets, then clears (via null), one client's override without touching the global default", () => {
  let state = createInitialPlatformState();
  state = platformReducer(state, {
    type: "SET_AI_AUTHORITY_CLIENT_OVERRIDE",
    coachId: COACH_PROFILE_TEAGUE.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: "client-1",
    config: { level: "advisor", domainOverrides: {} },
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  let settings = getAiAuthoritySettings(state, COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID);
  assert.equal(settings.clientOverrides["client-1"]?.level, "advisor");
  assert.equal(settings.global.level, "copilot", "setting a client override must never change the global default");

  state = platformReducer(state, {
    type: "SET_AI_AUTHORITY_CLIENT_OVERRIDE",
    coachId: COACH_PROFILE_TEAGUE.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: "client-1",
    config: null,
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  settings = getAiAuthoritySettings(state, COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID);
  assert.equal(settings.clientOverrides["client-1"], undefined, "a null config must remove the override entirely, reverting to the global default");
});

check("Two coaches in the same workspace (Teague, Alex) never share or overwrite each other's AI Authority settings", () => {
  let state = createInitialPlatformState();
  state = platformReducer(state, {
    type: "SET_AI_AUTHORITY_GLOBAL",
    coachId: COACH_PROFILE_TEAGUE.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    config: { level: "advisor", domainOverrides: {} },
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SET_AI_AUTHORITY_GLOBAL",
    coachId: COACH_PROFILE_ALEX.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    config: { level: "ai_led", domainOverrides: {} },
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(state.aiAuthoritySettings.length, 2);
  assert.equal(getAiAuthoritySettings(state, COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID).global.level, "advisor");
  assert.equal(getAiAuthoritySettings(state, COACH_PROFILE_ALEX.id, WORKSPACE_OPTIM_ID).global.level, "ai_led");
});

check("A stored v4 platform state (predating this feature) migrates cleanly through v5 (and, since Phase 5.4A, on to the current version) with an empty aiAuthoritySettings array", () => {
  const v4 = { ...createInitialPlatformState(), version: 4 } as unknown as Record<string, unknown>;
  delete v4.aiAuthoritySettings;
  const migrated = migratePlatformState(v4);
  assert.ok(migrated);
  assert.equal((migrated as PlatformState).version, 6);
  assert.deepEqual((migrated as PlatformState).aiAuthoritySettings, []);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
