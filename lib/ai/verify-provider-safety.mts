// Gate 4.0C-2A fix — provider credential handling and secret-safe errors.
// Uses a synthetic, obviously fake key and an injected fetch: no network,
// no real credential is ever read or printed.
// Run with --conditions=react-server (lib/ai is server-only).

import assert from "node:assert/strict";
import { getAiEnvConfig } from "./env.ts";
import { AiProviderUnavailableError } from "./provider.ts";
import { AnthropicChatModelProvider } from "./providers/anthropic-provider.ts";
import { resolveChatModelProvider, resolveStructuredJsonProvider } from "./resolve.ts";
import { classifyProviderError, INTERPRETER_UNAVAILABLE_MESSAGE, redactSecrets, validateApiKey } from "./safe-errors.ts";
import { FOUNDATION_KNOWLEDGE as K } from "../synthesis/knowledge/registry.ts";
import { interpretLimitationText, MANUAL_FALLBACK_MESSAGE, type StructuredJsonModel } from "../synthesis/limitations/interpret.ts";
import { parseStoredLimitations } from "../synthesis/limitations/confirm.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

const FAKE_KEY = "sk-ant-api03-" + "TESTONLYnotarealkey0".repeat(4);
const TEXT = "No squats. No ab workouts.";
const leaks = (value: unknown) => {
  const s = typeof value === "string" ? value : JSON.stringify(value, Object.getOwnPropertyNames(value ?? {}));
  return s.includes(FAKE_KEY) || s.includes("TESTONLYnotarealkey0") || /sk-ant-/.test(s);
};

interface Captured {
  headers: Headers;
  body: Record<string, unknown>;
}
function fakeFetch(respond: (c: Captured) => Response | Promise<Response>, sink: Captured[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const c = { headers, body };
    sink.push(c);
    return respond(c);
  }) as typeof fetch;
}
const okMessage = (text: string) =>
  new Response(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "test-model", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json", "request-id": "req_test123" } });
const asModel = (p: AnthropicChatModelProvider): StructuredJsonModel => ({ modelId: p.modelId, generateJson: (r) => p.generateJson({ ...r, timeoutMs: 5000 }) });

const savedEnv = { ...process.env };
const setEnv = (vars: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

console.log("\nGate 4.0C-2A fix — provider credential + secret safety\n");

await check("1. One provider credential becomes exactly one request credential", async () => {
  setEnv({ ANTHROPIC_AUTH_TOKEN: "stray-token-should-never-be-sent-0000" });
  const sink: Captured[] = [];
  const p = new AnthropicChatModelProvider(`${FAKE_KEY}\n`, "test-model", { fetch: fakeFetch(() => okMessage('{"restrictions":[],"clarifications":[],"unsupported":[]}'), sink) });
  await p.generateJson({ systemPrompt: "s", userMessage: "u", maxOutputTokens: 10, timeoutMs: 5000 });
  assert.equal(sink.length, 1);
  const h = sink[0].headers;
  assert.equal(h.get("x-api-key"), FAKE_KEY, "trimmed single key, sent once (no concatenation)");
  assert.equal(h.get("authorization"), null, "no second credential from ANTHROPIC_AUTH_TOKEN");
  setEnv({ ANTHROPIC_AUTH_TOKEN: savedEnv.ANTHROPIC_AUTH_TOKEN });
});

await check("2. Malformed / duplicated credential configuration fails safely before any request", async () => {
  for (const bad of [`${FAKE_KEY}\n${FAKE_KEY}`, `${FAKE_KEY}${FAKE_KEY}`, `${FAKE_KEY} ${FAKE_KEY}`, `${FAKE_KEY.slice(0, 20)}\n${FAKE_KEY.slice(20)}`, "short", `${FAKE_KEY}\u0000`]) {
    const v = validateApiKey(bad);
    assert.equal(v.ok, false, `rejected: problem shape #${bad.length}`);
  }
  assert.deepEqual(validateApiKey(`  ${FAKE_KEY}\n`), { ok: true, key: FAKE_KEY }, "surrounding whitespace is trimmed");
  setEnv({ ANTHROPIC_API_KEY: `${FAKE_KEY}\n${FAKE_KEY}`, AI_PROVIDER: undefined });
  const env = getAiEnvConfig();
  assert.equal(env.anthropicApiKey, undefined);
  assert.equal(env.anthropicKeyProblem, "multiple_tokens");
  const r = resolveStructuredJsonProvider();
  assert.equal(r.provider, null);
  assert.ok(!leaks(r), "structured resolver result carries no key material");
  try {
    resolveChatModelProvider({} as never, {} as never);
    assert.fail("chat resolver should refuse");
  } catch (err) {
    assert.match((err as Error).message, /more than one key/);
    assert.ok(!leaks((err as Error).message) && !leaks((err as Error).stack ?? ""));
  }
  let sent = 0;
  assert.throws(() => new AnthropicChatModelProvider(`${FAKE_KEY}\n${FAKE_KEY}`, "m", { fetch: (async () => { sent++; return okMessage("{}"); }) as typeof fetch }), (e: Error) => e instanceof AiProviderUnavailableError && !leaks(e.message));
  assert.equal(sent, 0, "no request is sent with a malformed key");
  setEnv({ ANTHROPIC_API_KEY: savedEnv.ANTHROPIC_API_KEY, AI_PROVIDER: savedEnv.AI_PROVIDER });
});

await check("3. Provider errors cannot expose credentials in returned UI messages", async () => {
  // Reproduces the production failure shape: a runtime error whose text echoes the header value.
  const p = new AnthropicChatModelProvider(FAKE_KEY, "m", { fetch: (async () => { throw new TypeError(`Headers.append: "${FAKE_KEY}${FAKE_KEY}" is an invalid header value.`); }) as typeof fetch });
  const proposal = await interpretLimitationText({ sourceText: TEXT, knowledge: K, model: asModel(p) });
  assert.equal(proposal.interpreter.kind, "manual");
  assert.equal(proposal.interpreter.kind === "manual" && proposal.interpreter.reason, MANUAL_FALLBACK_MESSAGE);
  assert.equal(MANUAL_FALLBACK_MESSAGE, INTERPRETER_UNAVAILABLE_MESSAGE);
  assert.ok(!leaks(proposal), "nothing key-shaped in what the coach receives");
});

await check("4. Provider errors cannot expose Authorization / x-api-key / header values", async () => {
  const echo = `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key: ${FAKE_KEY}; Authorization: Bearer ${FAKE_KEY}"}}`;
  const p = new AnthropicChatModelProvider(FAKE_KEY, "m", { fetch: fakeFetch(() => new Response(echo, { status: 401, headers: { "content-type": "application/json", "request-id": "req_abc123" } })) });
  const err = await p.generateJson({ systemPrompt: "s", userMessage: "u", maxOutputTokens: 10, timeoutMs: 5000 }).then(() => null, (e) => e as AiProviderUnavailableError);
  assert.ok(err instanceof AiProviderUnavailableError);
  assert.ok(!leaks(err.message) && !leaks(err.stack ?? "") && !leaks(err.diagnostic), "message, stack and diagnostic are clean");
  assert.equal(err.diagnostic?.category, "auth_rejected");
  assert.equal(err.diagnostic?.statusClass, "4xx");
  assert.ok(!/x-api-key|authorization|bearer/i.test(err.message));
});

await check("5. Raw provider exception strings are sanitized", () => {
  const raw = `Headers.append: "${FAKE_KEY}" invalid; x-api-key: ${FAKE_KEY}; Authorization: Bearer abc.def.ghi; ANTHROPIC_API_KEY=${FAKE_KEY}`;
  const red = redactSecrets(raw, [FAKE_KEY]);
  assert.ok(!leaks(red) && !/abc\.def\.ghi/.test(red), red);
  assert.ok(!leaks(redactSecrets(`token ${FAKE_KEY}`)), "pattern-based redaction even without the known secret");
  const d = classifyProviderError(new TypeError(`Headers.append: "${FAKE_KEY}"`), "anthropic");
  assert.equal(d.category, "request_construction");
  assert.ok(!leaks(d));
});

await check("6. Manual fallback still works (provider off / unavailable)", async () => {
  setEnv({ AI_PROVIDER: "fake" });
  const r = resolveStructuredJsonProvider();
  assert.equal(r.provider, null);
  const proposal = await interpretLimitationText({ sourceText: TEXT, knowledge: K, model: null, unavailableReason: r.provider ? undefined : r.reason });
  assert.equal(proposal.interpreter.kind, "manual");
  assert.equal(proposal.restrictions.length, 0);
  setEnv({ AI_PROVIDER: savedEnv.AI_PROVIDER });
});

await check("7. Successful interpretation returns valid structured constraints; only coach text + vocabulary are sent", async () => {
  const sink: Captured[] = [];
  const out = JSON.stringify({ restrictions: [{ optionId: "avoid_squat", quote: "No squats" }, { optionId: "avoid_direct_trunk", quote: "No ab workouts" }], clarifications: [], unsupported: [] });
  const p = new AnthropicChatModelProvider(FAKE_KEY, "m", { fetch: fakeFetch(() => okMessage(out), sink) });
  const diags: unknown[] = [];
  const proposal = await interpretLimitationText({ sourceText: TEXT, knowledge: K, model: asModel(p), onDiagnostic: (d) => diags.push(d) });
  assert.equal(proposal.interpreter.kind, "model");
  assert.deepEqual(proposal.restrictions.map((x) => x.optionId), ["avoid_squat", "avoid_direct_trunk"]);
  assert.equal(diags.length, 0);
  const body = sink[0].body as { system?: string; messages?: Array<{ content: string }> };
  assert.equal(body.messages?.length, 1);
  assert.ok(body.messages![0].content.includes(TEXT), "coach text sent");
  assert.ok(/avoid_squat/.test(body.system ?? ""), "vocabulary sent");
  assert.ok(!/clientProfileId|workspace|onboarding|@/.test(JSON.stringify(body)), "no client identity in the request");
  // Invalid taxonomy from the model is rejected → manual, with a safe message.
  const bad = new AnthropicChatModelProvider(FAKE_KEY, "m", { fetch: fakeFetch(() => okMessage(JSON.stringify({ restrictions: [{ optionId: "ban_everything", quote: "No squats" }] }))) });
  const rejected = await interpretLimitationText({ sourceText: TEXT, knowledge: K, model: asModel(bad) });
  assert.ok(rejected.interpreter.kind === "manual" && rejected.interpreter.reason === MANUAL_FALLBACK_MESSAGE);
  // Ambiguity still asks.
  const vague = new AnthropicChatModelProvider(FAKE_KEY, "m", { fetch: fakeFetch(() => okMessage(JSON.stringify({ restrictions: [{ optionId: "avoid_bracing_high", quote: "heavy stuff" }] }))) });
  const amb = await interpretLimitationText({ sourceText: "No heavy stuff.", knowledge: K, model: asModel(vague) });
  assert.ok(amb.restrictions.length === 0 && amb.clarifications.length === 1);
});

await check("8. No constraint becomes active without coach confirmation", async () => {
  const out = JSON.stringify({ restrictions: [{ optionId: "avoid_squat", quote: "No squats" }] });
  const p = new AnthropicChatModelProvider(FAKE_KEY, "m", { fetch: fakeFetch(() => okMessage(out)) });
  const proposal = await interpretLimitationText({ sourceText: TEXT, knowledge: K, model: asModel(p) });
  assert.ok(proposal.restrictions.length > 0);
  // A proposal is not a confirmation: the only way into planning is a coach-confirmed stored record.
  assert.equal(parseStoredLimitations(proposal, K), null, "a raw proposal is never accepted as a confirmed limitation");
  assert.equal(parseStoredLimitations({ ...proposal, schema: 1 }, K), null, "even shaped like a record, it lacks a coach confirmation");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
