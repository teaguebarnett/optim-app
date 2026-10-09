// The shared Reasoner core — one model-call / repair loop for every domain (resistance, nutrition, …).
//
// A domain supplies its prompt, its canonical input, and `evaluate` (strict parse + deterministic validation). The
// loop owns everything domain-independent: the provider boundary, the attempt record (raw output, usage, latency,
// request id), token totals, safe provider-failure handling, the one repair for unreadable/truncated output, and
// validator feedback (deduplicated) to the repair attempt. It never persists, approves or publishes anything.

import type { ReasonerAttempt, ReasonerRunTotals } from "./run.ts";

/** The model boundary every Reasoner needs (lib/ai's provider implements it). */
export interface ReasonerModel {
  provider: string;
  modelId: string;
  generate(request: { systemPrompt: string; userMessage: string; maxOutputTokens: number }): Promise<{ json: unknown; usage?: { inputTokens: number; outputTokens: number }; requestId?: string; latencyMs?: number }>;
}

export type AttemptVerdict<T> =
  /** Finished with this attempt (a plan, or the model's own NEEDS_INPUT). `recordErrors` are kept on the attempt. */
  | { kind: "done"; value: T; recordErrors?: string[] }
  /** Rejected: the errors become the repair attempt's feedback (when attempts remain). */
  | { kind: "retry"; stage: "schema" | "validation"; errors: string[]; diagnostic?: string };

export type AttemptLoopOutcome<T> = { kind: "done"; value: T; attempt: number } | { kind: "provider_failed"; attempt: number } | { kind: "rejected"; errors: string[]; attempts: number };

export const INVALID_JSON_FEEDBACK = "Your output was not one complete, valid JSON object. Keep text fields short and return only the JSON.";

export async function runModelAttempts<T>(p: {
  model: ReasonerModel;
  systemPrompt: string;
  userMessage: string;
  maxAttempts: number;
  maxOutputTokens: number;
  record: { attempts: ReasonerAttempt[]; totals: ReasonerRunTotals };
  evaluate: (raw: unknown, attempt: number, isLast: boolean) => AttemptVerdict<T>;
  onDiagnostic?: (d: { stage: string; detail: string }) => void;
}): Promise<AttemptLoopOutcome<T>> {
  let feedback: string[] = [];
  for (let attempt = 1; attempt <= p.maxAttempts; attempt++) {
    const rec: ReasonerAttempt = { attempt, raw: null, parseErrors: [], validationErrors: [], usage: null, latencyMs: null, requestId: null, providerError: null };
    p.record.attempts.push(rec);
    p.record.totals.calls++;
    let raw: unknown;
    try {
      const res = await p.model.generate({
        systemPrompt: p.systemPrompt,
        userMessage: p.userMessage + (feedback.length ? `\n\nYour previous output was rejected by OPTIM's validators:\n- ${feedback.join("\n- ")}\nReturn a corrected JSON object.` : ""),
        maxOutputTokens: p.maxOutputTokens,
      });
      raw = res.json;
      rec.usage = res.usage ?? null;
      rec.latencyMs = res.latencyMs ?? null;
      rec.requestId = res.requestId && /^[A-Za-z0-9_\-]{6,80}$/.test(res.requestId) ? res.requestId : null;
      p.record.totals.inputTokens += res.usage?.inputTokens ?? 0;
      p.record.totals.outputTokens += res.usage?.outputTokens ?? 0;
      p.record.totals.latencyMs += res.latencyMs ?? 0;
    } catch (err) {
      const name = err instanceof Error ? err.name : "unknown";
      // Gate 4.0C-3A: an executed-but-unusable call (e.g. truncated at max_tokens) still consumed tokens — record them.
      const meta = err as { usage?: { inputTokens: number; outputTokens: number }; truncated?: boolean };
      rec.providerError = meta.truncated === true ? `${name}:max_tokens` : name;
      if (meta.usage && Number.isFinite(meta.usage.inputTokens) && Number.isFinite(meta.usage.outputTokens)) {
        rec.usage = { inputTokens: meta.usage.inputTokens, outputTokens: meta.usage.outputTokens };
        p.record.totals.inputTokens += meta.usage.inputTokens;
        p.record.totals.outputTokens += meta.usage.outputTokens;
      }
      p.onDiagnostic?.({ stage: "provider", detail: name });
      // Unreadable/truncated JSON is an output problem worth one repair; anything else is a provider failure.
      if (name === "AiProviderInvalidOutputError" || name === "SyntaxError") {
        feedback = [INVALID_JSON_FEEDBACK];
        continue;
      }
      return { kind: "provider_failed", attempt };
    }
    rec.raw = raw;
    const verdict = p.evaluate(raw, attempt, attempt === p.maxAttempts);
    if (verdict.kind === "done") {
      if (verdict.recordErrors?.length) rec.validationErrors = verdict.recordErrors;
      return { kind: "done", value: verdict.value, attempt };
    }
    if (verdict.stage === "schema") rec.parseErrors = verdict.errors;
    else rec.validationErrors = verdict.errors;
    // Deduplicated: the same error repeated across items is one correction, not many.
    feedback = [...new Set(verdict.errors)];
    p.onDiagnostic?.({ stage: verdict.stage, detail: (verdict.diagnostic ?? verdict.errors.join("; ")).slice(0, 300) });
  }
  return { kind: "rejected", errors: feedback, attempts: p.maxAttempts };
}
