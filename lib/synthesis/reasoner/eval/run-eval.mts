// Gate 4.0C-3 — Fitness Reasoner evaluation harness.
//
//   offline (default): a scripted model — proves the HARD rails for every
//                      scenario without a provider (runs in CI).
//   --live:            the real model (ANTHROPIC_API_KEY from the
//                      environment; never printed) — hard assertions plus a
//                      reviewable quality report for a human to judge.
//   --out <file>:      also write the full JSON report there.
//   --only A,C,J:      run a subset.

import { writeFileSync } from "node:fs";
import { runFitnessReasoner } from "../reasoner.ts";
import { SCENARIOS, qualityReport } from "./scenarios.ts";
import { fakeModel, NOW, planOutput, scriptedPlan } from "./fixtures.ts";
import type { StructuredJsonModel } from "../../limitations/interpret.ts";

const args = process.argv.slice(2);
const live = args.includes("--live");
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;

async function liveModel(): Promise<StructuredJsonModel & { usage: { input: number; output: number; ms: number } }> {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key || /\s/.test(key)) throw new Error("Set ANTHROPIC_API_KEY (one key) to run --live.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key, authToken: null, maxRetries: 1 });
  const modelId = process.env.AI_MODEL_ID || "claude-opus-5";
  const usage = { input: 0, output: 0, ms: 0 };
  return {
    modelId,
    usage,
    async generateJson({ systemPrompt, userMessage, maxOutputTokens }) {
      const t = Date.now();
      const res = await client.messages.create({ model: modelId, max_tokens: maxOutputTokens, system: systemPrompt, messages: [{ role: "user", content: userMessage }], output_config: { effort: "high" } }, { timeout: 300_000 });
      usage.input += res.usage.input_tokens;
      usage.output += res.usage.output_tokens;
      usage.ms += Date.now() - t;
      const text = res.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") throw Object.assign(new Error("no text"), { name: "AiProviderInvalidOutputError" });
      const s = text.text;
      return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    },
  };
}

const report: Array<Record<string, unknown>> = [];
let hardFailures = 0;
const model = live ? await liveModel() : null;
console.log(`\nFitness Reasoner v1 — evaluation (${live ? `LIVE: ${model!.modelId}` : "offline, scripted model"})\n`);
for (const s of SCENARIOS) {
  if (only && !only.has(s.id)) continue;
  const input = s.input();
  const scripted = fakeModel((ri) => planOutput(scriptedPlan(ri)));
  const before = model ? { ...model.usage } : null;
  const result = await runFitnessReasoner({ input, model: model ?? scripted, nowIso: NOW });
  const calls = model ? (model.usage.ms !== before!.ms ? "yes" : "no") : scripted.calls > 0 ? "yes" : "no";
  const failures = s.hard(result, input);
  if (!s.expectsModel && calls === "yes") failures.push("the model was called although this scenario must be decided before reasoning");
  hardFailures += failures.length ? 1 : 0;
  console.log(`${failures.length ? "FAIL" : "PASS"}  ${s.id}. ${s.title} → ${result.status}${failures.length ? ` — ${failures.join("; ")}` : ""}`);
  const q = qualityReport(result, s);
  if (live && result.status === "PLANNED") for (const [k, v] of Object.entries(q)) if (k !== "status") console.log(`        ${k}: ${String(v).slice(0, 400)}`);
  report.push({ scenario: s.id, title: s.title, status: result.status, hardFailures: failures, modelCalled: calls, quality: q, ...(model ? { usageSoFar: { ...model.usage } } : {}), result: result.status === "PLANNED" ? { plan: result.plan, quality: result.quality } : result });
}
if (model) console.log(`\nTokens in/out: ${model.usage.input}/${model.usage.output} · model time ${(model.usage.ms / 1000).toFixed(0)} s`);
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`\n${hardFailures === 0 ? "All hard assertions passed" : `${hardFailures} scenario(s) failed hard assertions`}.\n`);
process.exit(hardFailures ? 1 : 0);
