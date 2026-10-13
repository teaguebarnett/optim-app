// Production "Let OPTIM Build" (prepare a unified proposal) — offline checks of the spending/readiness policy and the hard call budget.
// No database, no paid calls (scripted models).
//
//   node --experimental-strip-types lib/production/verify-unified-prepare.mts

import assert from "node:assert/strict";
import { boundedModel, CallBudgetExceededError, PREPARE_POLICY, preparePreflight, type PrepareFacts } from "./unified-prepare-policy.ts";
import { unifiedIdempotencyKey } from "./unified-drafts.ts";
import { runUnifiedProgram } from "../synthesis/unified/orchestrate.ts";
import { fullCoach, routerModel, scenarioInput, NOW } from "../synthesis/unified/eval/fixtures.ts";
import type { ReasonerModel } from "../synthesis/reasoner/core.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}\n        ${(err as Error).message}`);
    failed++;
  }
}
const ready: PrepareFacts = { allowlisted: true, providerConfigured: true, openProposal: null, approvedProgram: null };

console.log("\nProduction prepare — policy and call budget (offline)\n");

await check("1. preflight passes only when every condition holds; the Fitness Reasoner plans lifting unless an approved program exists", () => {
  assert.deepEqual(preparePreflight(ready), { ok: true, lifting: { source: "fitness_reasoner" } });
  assert.deepEqual(preparePreflight({ ...ready, approvedProgram: { versionId: "p1" } }), { ok: true, lifting: { source: "approved_program", versionId: "p1" } }, "the program the client follows is kept, never silently replaced");
});

await check("2. refusals, in order, before any model call: not allowlisted → open proposal → no provider", () => {
  const code = (f: PrepareFacts) => (preparePreflight(f) as { code?: string }).code;
  assert.equal(code({ ...ready, allowlisted: false, openProposal: { id: "x", approvalState: "proposed", status: "draft_ready" } }), "not_enabled");
  assert.equal(code({ ...ready, openProposal: { id: "x", approvalState: "approved", status: "draft_ready" } }), "open_proposal");
  assert.match((preparePreflight({ ...ready, openProposal: { id: "x", approvalState: "approved", status: "draft_ready" } }) as { message: string }).message, /approved and waiting to be published/);
  assert.equal(code({ ...ready, providerConfigured: false }), "provider_unavailable");
});

await check("3. the call budget is a hard stop: calls beyond it throw before reaching the provider", async () => {
  let reached = 0;
  const inner: ReasonerModel = { provider: "t", modelId: "t", generate: async () => { reached++; return { json: {} }; } };
  const m = boundedModel(inner, 2);
  await m.generate({ systemPrompt: "", userMessage: "", maxOutputTokens: 1 });
  await m.generate({ systemPrompt: "", userMessage: "", maxOutputTokens: 1 });
  await assert.rejects(m.generate({ systemPrompt: "", userMessage: "", maxOutputTokens: 1 }), (e: Error) => e instanceof CallBudgetExceededError && e.name === "CallBudgetExceeded");
  assert.equal(reached, 2);
  assert.equal(m.calls(), 2);
});

await check("3b. the time budget: no new call starts once the preparation has run past noNewCallAfterMs (calls in flight finish)", async () => {
  let reached = 0;
  let clock = 0;
  const inner: ReasonerModel = { provider: "t", modelId: "t", generate: async () => { reached++; clock += 70_000; return { json: {} }; } };
  const m = boundedModel(inner, PREPARE_POLICY.maxModelCalls, { noNewCallAfterMs: PREPARE_POLICY.noNewCallAfterMs, now: () => clock });
  const req = { systemPrompt: "", userMessage: "", maxOutputTokens: 1 };
  // Resistance ~140 s, then calls of ~70 s: no new call may start at or after the limit.
  for (let i = 0; i < 6; i++) {
    if (clock >= PREPARE_POLICY.noNewCallAfterMs) break;
    await m.generate(req);
  }
  await assert.rejects(m.generate(req), (e: Error) => e instanceof CallBudgetExceededError);
  assert.ok(reached >= 1 && reached <= PREPARE_POLICY.maxModelCalls);
  assert.ok(PREPARE_POLICY.noNewCallAfterMs + 240_000 <= 800_000, "a call started at the limit still ends (240 s provider timeout) inside the 800 s maxDuration");
});

await check("4. a real (scripted) preparation: the Fitness Reasoner plans lifting (no legacy draft inherited), within budget", async () => {
  const coach = fullCoach({ t_cardio_roles: ["fat_loss"] });
  const input = scenarioInput({ clientId: "c", coach, patch: { what_you_want: { primaryGoal: "build_muscle" }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] } } });
  const router = routerModel();
  const m = boundedModel(router, PREPARE_POLICY.maxModelCalls);
  let results: { resistance: { status: string } | null } | null = null;
  const u = await runUnifiedProgram({ input, model: m, nowIso: NOW, maxAttempts: PREPARE_POLICY.maxAttemptsPerDomain, onResults: (r) => (results = r as never) });
  assert.ok(router.calls.resistance >= 1, "lifting is reasoned by the Fitness Reasoner");
  assert.equal(results!.resistance?.status, "PLANNED");
  assert.equal(u.domains.resistance.status, "PROPOSED");
  assert.ok(m.calls() <= PREPARE_POLICY.maxModelCalls && u.provenance.modelCalls === m.calls(), `calls ${m.calls()}`);
});

await check("5. a budget of 0 calls ends as a provider failure (no crash, no retry storm)", async () => {
  const coach = fullCoach();
  const input = scenarioInput({ clientId: "c", coach, patch: { what_you_want: { primaryGoal: "build_muscle" } } });
  const { programContent, LOWER, UPPER } = await import("../synthesis/unified/eval/fixtures.ts");
  const content = { ...programContent([{ day: "Monday", exercises: LOWER }, { day: "Tuesday", exercises: UPPER }], 4), clientId: "c" };
  const router = routerModel();
  const m = boundedModel(router, 0);
  const u = await runUnifiedProgram({ input, model: m, nowIso: NOW, maxAttempts: 2, existingResistanceDraft: { versionId: "v", content } });
  // Refused attempts are recorded on the proposal (provenance.modelCalls counts attempts), but none reached the provider.
  assert.equal(m.calls(), 0);
  assert.equal(router.calls.resistance + router.calls.cardio + router.calls.nutrition, 0);
  assert.equal(u.domains.nutrition.status, "PROVIDER_FAILED");
  assert.ok(u.provenance.modelCalls <= 2, "one refused attempt per domain — no retry storm");
});

await check("6. idempotency: existing keys are unchanged; a new round (after a decided proposal) gets a fresh key", () => {
  const k = { clientStateHash: "a", goalContractHash: "b", coachMethodVersionId: "m", resistanceSource: "existing_draft", sourceVersionId: "v4", sourceContentHash: "h", title: "Unified program", unifiedVersion: "u" };
  assert.equal(unifiedIdempotencyKey(k), unifiedIdempotencyKey({ ...k, round: undefined }));
  assert.notEqual(unifiedIdempotencyKey(k), unifiedIdempotencyKey({ ...k, round: 1 }));
  assert.equal(unifiedIdempotencyKey({ ...k, round: 1 }), unifiedIdempotencyKey({ ...k, round: 1 }));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
