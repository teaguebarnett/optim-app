// Production "Prepare unified proposal" — the pure policy (no I/O, importable by tests). The server half is
// lib/production/unified-prepare.ts.
//
// Spending is bounded three ways: (1) only allowlisted clients (OPTIM_REASONER_PROPOSAL_CLIENTS); (2) preparation
// reuses lifting the coach already has (their pending draft, else the client's approved program) — it never pays for a
// new lifting plan here — so only cardio and nutrition can call the model; (3) a hard per-preparation call budget wraps
// the model: once reached, further calls fail as a provider failure (that domain stops; nothing retries). One open
// proposal per client at a time, and idempotent retries, keep a coach from paying twice for the same thing.

import type { ReasonerModel } from "../synthesis/reasoner/core.ts";

export const PREPARE_POLICY = {
  /** At most one repair per domain. */
  maxAttemptsPerDomain: 2,
  /** Cardio + nutrition, each with its one repair. */
  maxModelCalls: 4,
  /** No new model call STARTS after this much of the preparation has elapsed. Calls run one after another (cardio,
   * then nutrition) and take ~40–70 s each live, while the request is capped at 300 s (the page's maxDuration — also
   * the Hobby plan's ceiling). A preparation killed mid-call would waste the spend, so late calls are refused instead:
   * that domain is recorded as a provider failure the coach can see, and nothing retries. */
  noNewCallAfterMs: 150_000,
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
  pendingDraft: { versionId: string } | null;
  /** The client's active approved program, when it's universal content (usable as fixed lifting). */
  approvedProgram: { versionId: string } | null;
}

export type PrepareDecision =
  | { ok: true; lifting: { source: "existing_draft" | "approved_program"; versionId: string } }
  | { ok: false; code: "not_enabled" | "open_proposal" | "no_lifting" | "provider_unavailable"; message: string };

/** Whether a paid preparation may start, decided BEFORE any model call. */
export function preparePreflight(f: PrepareFacts): PrepareDecision {
  if (!f.allowlisted) return { ok: false, code: "not_enabled", message: "Unified proposals aren't enabled for this client yet." };
  if (f.openProposal) return { ok: false, code: "open_proposal", message: `This client already has a unified proposal ${f.openProposal.approvalState === "approved" ? "approved and waiting to be published" : "waiting for your review"} — publish or reject it before preparing another.` };
  // The coach's pending draft is their latest intent for the next block; otherwise the program the client follows.
  const lifting = f.pendingDraft ? { source: "existing_draft" as const, versionId: f.pendingDraft.versionId } : f.approvedProgram ? { source: "approved_program" as const, versionId: f.approvedProgram.versionId } : null;
  if (!lifting) return { ok: false, code: "no_lifting", message: "Preparing a unified proposal starts from this client's lifting — generate (or approve) a training program first." };
  if (!f.providerConfigured) return { ok: false, code: "provider_unavailable", message: "OPTIM's AI provider isn't configured, so nothing was prepared." };
  return { ok: true, lifting };
}
