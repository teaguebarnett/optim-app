// Production "Let OPTIM Build" (prepare a unified proposal) — the pure policy (no I/O, importable by tests). The server
// half is lib/production/unified-prepare.ts.
//
// Resistance comes from the coach-approved program when the client has one (kept as-is; publication never replaces it
// without the coach's explicit confirmation), otherwise from the Fitness Reasoner — a pending legacy draft is never
// inherited. Spending is bounded three ways: (1) only allowlisted clients (OPTIM_REASONER_PROPOSAL_CLIENTS); (2) a hard
// per-preparation call budget wraps the model: once reached, further calls fail as a provider failure (that domain
// stops; nothing retries); (3) no new call starts late in the request. One open proposal per client at a time, and
// idempotent retries, keep a coach from paying twice for the same thing.

import type { ReasonerModel } from "../synthesis/reasoner/core.ts";

export const PREPARE_POLICY = {
  /** At most one repair per domain. */
  maxAttemptsPerDomain: 2,
  /** Resistance (Fitness Reasoner) + cardio + nutrition, each with its one repair. */
  maxModelCalls: 6,
  /** No new model call STARTS after this much of the preparation has elapsed. Calls run one after another (resistance
   * ~85–140 s live, then cardio and nutrition ~40–70 s each) inside the client page's 800 s maxDuration (Vercel Pro);
   * a call started at the limit still ends by its 240 s provider timeout. A preparation killed mid-call would waste the
   * spend, so late calls are refused instead: that domain is recorded as a provider failure the coach can see. */
  noNewCallAfterMs: 560_000,
} as const;

export class CallBudgetExceededError extends Error {
  constructor(max: number, reason: "calls" | "time" = "calls") {
    super(reason === "time" ? `The time limit for starting model calls in one preparation (${Math.round(max / 1000)} s) was reached.` : `The model-call limit for one preparation (${max}) was reached.`);
    this.name = "CallBudgetExceeded";
  }
}

/** The model, with a hard call budget — a number of calls and, optionally, a time after which no new call starts. Calls
 * beyond it throw (the reasoner records a provider failure and stops). */
export function boundedModel(model: ReasonerModel, maxCalls: number, time?: { noNewCallAfterMs: number; now?: () => number }): ReasonerModel & { calls(): number } {
  let calls = 0;
  const now = time?.now ?? Date.now;
  const startedAt = now();
  return {
    provider: model.provider,
    modelId: model.modelId,
    calls: () => calls,
    async generate(request) {
      if (calls >= maxCalls) throw new CallBudgetExceededError(maxCalls);
      if (time && now() - startedAt >= time.noNewCallAfterMs) throw new CallBudgetExceededError(time.noNewCallAfterMs, "time");
      calls++;
      return model.generate(request);
    },
  };
}

export interface PrepareFacts {
  allowlisted: boolean;
  providerConfigured: boolean;
  /** The client's latest unified proposal still awaiting review/approval/publication (not preparing). */
  openProposal: { id: string; approvalState: string; status: string } | null;
  /** The client's active approved program, when it's universal content (kept as the fixed lifting). */
  approvedProgram: { versionId: string } | null;
}

export type PrepareDecision =
  | { ok: true; lifting: { source: "approved_program"; versionId: string } | { source: "fitness_reasoner" } }
  | { ok: false; code: "not_enabled" | "open_proposal" | "provider_unavailable"; message: string };

/** Whether a paid preparation may start, decided BEFORE any model call. */
export function preparePreflight(f: PrepareFacts): PrepareDecision {
  if (!f.allowlisted) return { ok: false, code: "not_enabled", message: "Let OPTIM Build isn't enabled for this client yet." };
  if (f.openProposal) return { ok: false, code: "open_proposal", message: `This client already has a program ${f.openProposal.approvalState === "approved" ? "approved and waiting to be published" : "waiting for your review"} — publish or reject it before building another.` };
  if (!f.providerConfigured) return { ok: false, code: "provider_unavailable", message: "OPTIM's AI provider isn't configured, so nothing was prepared." };
  // The program the client follows stays fixed (never silently replaced); otherwise the Fitness Reasoner plans lifting.
  return { ok: true, lifting: f.approvedProgram ? { source: "approved_program", versionId: f.approvedProgram.versionId } : { source: "fitness_reasoner" } };
}
