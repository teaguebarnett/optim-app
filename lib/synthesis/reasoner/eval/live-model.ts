// Shared live-model boundary for Reasoner evaluations (resistance and nutrition): a real model via ANTHROPIC_API_KEY
// (never printed), metered by a LEDGER file that counts only calls that EXECUTED (consumed tokens). The call cap is
// enforced before every call, with in-flight calls reserved so concurrency can never overshoot it. With `maxUsd`, a
// dollar cap is enforced the same way: a call starts only if the spend so far plus a WORST-CASE call (input estimate +
// the full output cap) stays within it — at the model's published per-token price.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ReasonerModel } from "../core.ts";

/** Published Claude API prices, $ per million tokens (input, output). A dollar cap refuses unknown models. */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export interface Ledger {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Estimated spend at published prices (present when a dollar cap is used). */
  usd?: number;
  entries: Array<{ at: string; scenario: string; inputTokens: number; outputTokens: number; latencyMs: number; usd?: number }>;
}

export function createLedger(path: string, maxCalls: number, money?: { maxUsd: number; inputTokensEstimate: number }) {
  let inFlight = 0;
  const read = (): Ledger => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, entries: [] });
  return {
    read,
    maxCalls,
    async liveModel(scenario: string, opts: { effort?: "high" | "medium" | "low" } = {}): Promise<ReasonerModel> {
      const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
      if (!key || /\s/.test(key)) throw new Error("Set ANTHROPIC_API_KEY (one key) to run --live.");
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: key, authToken: null, maxRetries: 3 });
      const modelId = process.env.AI_MODEL_ID || "claude-opus-5";
      const price = PRICE_PER_MTOK[modelId];
      if (money && !price) throw new Error(`No published price recorded for ${modelId}; a dollar cap can't be enforced.`);
      const usdOf = (inTok: number, outTok: number) => (price ? (inTok * price.input + outTok * price.output) / 1e6 : 0);
      return {
        provider: "anthropic",
        modelId,
        async generate({ systemPrompt, userMessage, maxOutputTokens }) {
          if (read().calls + inFlight >= maxCalls) throw Object.assign(new Error("live call budget exhausted"), { name: "BudgetExhausted" });
          if (money) {
            const worst = usdOf(money.inputTokensEstimate * 1.5, maxOutputTokens);
            if ((read().usd ?? 0) + (inFlight + 1) * worst > money.maxUsd) throw Object.assign(new Error("live dollar budget exhausted"), { name: "BudgetExhausted" });
          }
          inFlight++;
          const t = Date.now();
          let res;
          try {
            res = await client.messages.create({ model: modelId, max_tokens: maxOutputTokens, system: systemPrompt, messages: [{ role: "user", content: userMessage }], output_config: { effort: opts.effort ?? (process.env.REASONER_EFFORT as "high" | "medium" | undefined) ?? "high" } }, { timeout: 300_000 });
          } catch (err) {
            // Rejected before execution (billing, refusal, network…): not counted; recorded by status only.
            const status = (err as { status?: number }).status;
            throw Object.assign(new Error("provider request failed"), { name: `ProviderRequestFailed${status ? `_${status}` : ""}` });
          } finally {
            inFlight--;
          }
          const latencyMs = Date.now() - t;
          const ledger = read();
          ledger.calls++;
          ledger.inputTokens += res.usage.input_tokens;
          ledger.outputTokens += res.usage.output_tokens;
          ledger.latencyMs += latencyMs;
          const usd = usdOf(res.usage.input_tokens, res.usage.output_tokens);
          if (price) ledger.usd = +((ledger.usd ?? 0) + usd).toFixed(6);
          ledger.entries.push({ at: new Date().toISOString(), scenario, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, latencyMs, ...(price ? { usd: +usd.toFixed(6) } : {}) });
          writeFileSync(path, JSON.stringify(ledger, null, 1));
          if (res.stop_reason === "max_tokens") throw Object.assign(new Error("output hit max_tokens"), { name: "AiProviderInvalidOutputError", truncated: true, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } });
          const text = res.content.find((b) => b.type === "text");
          if (!text || text.type !== "text") throw Object.assign(new Error("no text"), { name: "AiProviderInvalidOutputError" });
          const s = text.text;
          return { json: JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)), usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }, requestId: (res as { _request_id?: string | null })._request_id ?? undefined, latencyMs };
        },
      };
    },
  };
}
