// Gate 4.0C-3 / 3A — Fitness Reasoner evaluation harness.
//
//   offline (default)       scripted model — proves the HARD rails for every scenario (CI-safe)
//   --live                  real model via ANTHROPIC_API_KEY (never printed), metered by a LEDGER
//   --ledger <file>         required with --live: shared call/token ledger; hard cap 30 calls
//   --max-calls <n>         cap (default 30); refuses to start a call that would exceed it
//   --only 01,05,25         subset
//   --repeat <n>            run each selected scenario n times (variance)
//   --out <file>            full JSON report (results + ReasonerRun artifacts)
//   --pack <dir>            write the human review pack (markdown + rubric template)
//   --concurrency <n>       parallel live calls (default 3)
//   --from-raw <report.json> replay the first saved model response per scenario from an earlier
//                           report through the CURRENT parser/validator — no model call

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runFitnessReasoner, type ReasonerModel, type ReasonerResult } from "../reasoner.ts";
import { FOUNDATION_KNOWLEDGE } from "../../knowledge/registry.ts";
import { SCENARIOS, type Scenario } from "./scenarios.ts";
import { fakeModel, NOW, scriptedOutput } from "./fixtures.ts";
import { classifyResult } from "./taxonomy.ts";
import { varianceReport } from "./variance.ts";
import { reviewPage, rubricTemplate } from "./review-pack.ts";

const args = process.argv.slice(2);
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const live = args.includes("--live");
const only = arg("--only") ? new Set(arg("--only")!.split(",")) : null;
const repeat = Number(arg("--repeat") ?? 1);
const maxCalls = Number(arg("--max-calls") ?? 30);
const concurrency = Number(arg("--concurrency") ?? 3);
const ledgerPath = arg("--ledger");

interface Ledger { calls: number; inputTokens: number; outputTokens: number; latencyMs: number; entries: Array<{ at: string; scenario: string; inputTokens: number; outputTokens: number; latencyMs: number }> }
const readLedger = (): Ledger => (ledgerPath && existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : { calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, entries: [] });
let ledger = readLedger();
const saveLedger = () => ledgerPath && writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));

async function liveModel(scenario: string): Promise<ReasonerModel> {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key || /\s/.test(key)) throw new Error("Set ANTHROPIC_API_KEY (one key) to run --live.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key, authToken: null, maxRetries: 1 });
  const modelId = process.env.AI_MODEL_ID || "claude-opus-5";
  return {
    provider: "anthropic",
    modelId,
    async generate({ systemPrompt, userMessage, maxOutputTokens }) {
      // Budget guard: never START a call beyond the cap (checked against the shared ledger).
      ledger = readLedger();
      if (ledger.calls >= maxCalls) throw Object.assign(new Error("live call budget exhausted"), { name: "BudgetExhausted" });
      ledger.calls++;
      saveLedger();
      const t = Date.now();
      const res = await client.messages.create({ model: modelId, max_tokens: maxOutputTokens, system: systemPrompt, messages: [{ role: "user", content: userMessage }], output_config: { effort: (process.env.REASONER_EFFORT as "high" | "medium" | undefined) ?? "high" } }, { timeout: 300_000 });
      const latencyMs = Date.now() - t;
      ledger = readLedger();
      ledger.inputTokens += res.usage.input_tokens;
      ledger.outputTokens += res.usage.output_tokens;
      ledger.latencyMs += latencyMs;
      ledger.entries.push({ at: new Date().toISOString(), scenario, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, latencyMs });
      saveLedger();
      const text = res.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") throw Object.assign(new Error("no text"), { name: "AiProviderInvalidOutputError" });
      const s = text.text;
      return { json: JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)), usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }, requestId: (res as { _request_id?: string | null })._request_id ?? undefined, latencyMs };
    },
  };
}

if (live && !ledgerPath) throw new Error("--live requires --ledger <file> so live calls are metered.");
const fromRaw = arg("--from-raw");
const savedRaw = new Map<string, unknown>();
if (fromRaw) for (const r of JSON.parse(readFileSync(fromRaw, "utf8")).report as Array<{ scenario: string; run: { attempts: Array<{ raw: unknown }> } }>) if (r.run.attempts[0]?.raw) savedRaw.set(r.scenario, r.run.attempts[0].raw);
const replayModel = (scenario: string): ReasonerModel => ({ provider: "saved", modelId: "saved-response", generate: async () => { if (!savedRaw.has(scenario)) throw Object.assign(new Error("no saved response"), { name: "NoSavedResponse" }); return { json: savedRaw.get(scenario) }; } });
const selected = SCENARIOS.filter((s) => (!only || only.has(s.id)) && (!fromRaw || savedRaw.has(s.id) || !s.expectsModel));
const jobs: Array<{ s: Scenario; i: number }> = selected.flatMap((s) => Array.from({ length: s.expectsModel ? repeat : 1 }, (_, i) => ({ s, i })));
if (live) {
  const modelJobs = jobs.filter((j) => j.s.expectsModel).length;
  console.log(`Live budget: ${ledger.calls}/${maxCalls} used; this run needs up to ${modelJobs} calls (+1 per repair).`);
  if (ledger.calls + modelJobs > maxCalls) {
    console.log(`STOP: would exceed the ${maxCalls}-call cap. Reduce scope or get approval.`);
    process.exit(2);
  }
}

console.log(`\nFitness Reasoner v1.1 — evaluation (${live ? "LIVE" : fromRaw ? "replaying saved model responses" : "offline, scripted model"}; ${selected.length} scenarios${repeat > 1 ? ` × ${repeat}` : ""})\n`);
const results: Array<{ s: Scenario; i: number; result: ReasonerResult; failures: string[] }> = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { s, i } = jobs[next++];
    const input = s.input();
    const scripted = fakeModel((ri) => scriptedOutput(ri));
    const model = live ? await liveModel(`${s.id}#${i + 1}`) : fromRaw ? replayModel(s.id) : scripted;
    const result = await runFitnessReasoner({ input, model, nowIso: NOW, runId: `${s.id}-${i + 1}`, maxAttempts: fromRaw ? 1 : undefined });
    const failures = s.hard(result, input);
    if (!s.expectsModel && result.run.totals.calls > 0) failures.push("the model was called although this must be decided before reasoning");
    results.push({ s, i, result, failures });
    console.log(`${failures.length ? "FAIL" : "PASS"}  ${s.id}${repeat > 1 ? `#${i + 1}` : ""}. ${s.title} → ${result.status}${result.status === "PLANNED" ? ` (${result.plan.frequency.daysPerWeek}d ${result.plan.architecture.split}, attempts ${result.attempts})` : ""}${failures.length ? ` — ${failures.join("; ")}` : ""}`);
  }
}
await Promise.all(Array.from({ length: live ? concurrency : 1 }, worker));
results.sort((a, b) => a.s.id.localeCompare(b.s.id) || a.i - b.i);

const report = results.map(({ s, i, result, failures }) => {
  const reviewFlags = result.status === "PLANNED" && s.review ? s.review(result, s.input()) : [];
  return { scenario: s.id, repeat: i + 1, title: s.title, status: result.status, hardFailures: failures, reviewFlags, findings: classifyResult(result, { hardFailures: failures, expectedStatus: s.expectedStatus, reviewFlags }), run: result.run };
});
const hardFailed = report.filter((r) => r.hardFailures.length).length;
const variance = repeat > 1 ? Object.fromEntries(selected.filter((s) => s.expectsModel).map((s) => [s.id, varianceReport(results.filter((r) => r.s.id === s.id).map((r) => r.result), FOUNDATION_KNOWLEDGE)])) : null;
if (variance) for (const [id, v] of Object.entries(variance)) console.log(`variance ${id}: core ${v.core.coreAgreement ? "agrees" : "DIFFERS"} · freq ${v.core.frequency.values.join("/")} · split ${v.core.split.join("/")} · exercise overlap ${v.expression.exerciseOverlapMeanJaccard} · main-lift overlap ${v.expression.mainLiftOverlapMeanJaccard} · session-shape agreement ${v.expression.sessionSignatureAgreement} · volume CV ${v.expression.volumeCvMajorMuscles}${v.unexplainedVariation.length ? ` · UNEXPLAINED: ${v.unexplainedVariation.join("; ")}` : ""}`);
const flagMisses = report.flatMap((r) => r.reviewFlags.filter((f) => !f.ok).map((f) => `${r.scenario}: ${f.flag} [${f.category}]`));
if (flagMisses.length) console.log(`\nReview flags not met (for human review, not hard failures):\n- ${flagMisses.join("\n- ")}`);
if (live) console.log(`\nLedger: ${ledger.calls}/${maxCalls} calls · ${ledger.inputTokens} in / ${ledger.outputTokens} out tokens · ${(ledger.latencyMs / 1000).toFixed(0)} s model time`);
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify({ generatedAtIso: new Date().toISOString(), live, report, variance }, null, 1));
const pack = arg("--pack");
if (pack) {
  mkdirSync(pack, { recursive: true });
  const pages = report.filter((r) => r.repeat === 1).map((r) => reviewPage({ id: r.scenario, title: r.title, result: results.find((x) => x.s.id === r.scenario && x.i === 0)!.result, knowledge: FOUNDATION_KNOWLEDGE, findings: r.findings }));
  writeFileSync(join(pack, "review-pack.md"), [`# Fitness Reasoner v1.1 — coaching review pack`, "", `Generated ${new Date().toISOString().slice(0, 10)} · ${live ? "live model" : "scripted model (rails only — not for coaching review)"}. Score each plan in review-template.json; the AI does not score itself.`, "", ...pages].join("\n\n"));
  writeFileSync(join(pack, "review-template.json"), JSON.stringify(report.filter((r) => r.repeat === 1 && r.status === "PLANNED").map((r) => rubricTemplate(r.scenario)), null, 1));
}
console.log(`\n${hardFailed === 0 ? "All hard assertions passed" : `${hardFailed} run(s) failed hard assertions`}.\n`);
process.exit(hardFailed ? 1 : 0);
