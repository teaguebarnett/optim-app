// Gate 4.0C-4 — pure rules for Reasoner proposal generation jobs (no I/O),
// shared by the production job runner and its tests.
//
// * Controlled rollout: a server-only allowlist of client profile ids
//   (OPTIM_REASONER_PROPOSAL_CLIENTS). Empty / unset = nobody: every existing
//   client keeps the legacy Generate Proposal path, byte for byte.
// * Outcomes are fixed, coach-safe messages — never provider text.
// * A job that outlives the platform's function limit is "stale" and is
//   closed as failed (timed out), never left preparing forever.

import { runFitnessReasoner, type ReasonerModel, type ReasonerResult } from "./reasoner.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import type { ReasonerRun } from "./run.ts";

export type JobStatus = "preparing" | "ready_for_review" | "needs_input" | "unsupported" | "failed";
export type FailureCategory = "provider_failed" | "rejected_by_validators" | "timed_out" | "draft_not_saved" | "superseded";

export interface JobOutcome {
  /** Short, plain explanation for the coach. */
  message?: string;
  /** NEEDS_INPUT: what is missing and who provides it. */
  missing?: Array<{ fact: string; why: string; providedBy: "client" | "coach" | "either" }>;
}

/** Comma/whitespace-separated client profile ids. Anything that isn't a UUID is ignored. */
export function parseEnabledClients(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)));
}

export const MESSAGES = {
  provider_failed: "OPTIM couldn't reach its reasoning service, so no proposal was prepared. Nothing was saved or changed — try again in a few minutes.",
  rejected_by_validators: "OPTIM's draft didn't pass its own safety and method checks, so it was discarded. Nothing was saved — try again, or review the inputs below.",
  timed_out: "Preparing the proposal took too long and was stopped. Nothing was saved — try again.",
  draft_not_saved: "OPTIM prepared a proposal but couldn't save it as a draft. Nothing reached the client — try again.",
  superseded: "Another proposal is already waiting for your review, so this one wasn't saved.",
  unsupported: "This client's goal needs a kind of planning OPTIM's reasoner doesn't support yet. No plan was generated, and nothing was substituted.",
} as const;

/**
 * Maps a finished Reasoner result to the job's terminal state. PLANNED is
 * returned as "ready_for_review" only provisionally — the caller must save
 * the draft first and use "draft_not_saved" if that fails. No path ever
 * falls back to another planner.
 */
export function outcomeForResult(result: ReasonerResult): { status: Exclude<JobStatus, "preparing">; failureCategory: FailureCategory | null; outcome: JobOutcome } {
  switch (result.status) {
    case "PLANNED":
      return { status: "ready_for_review", failureCategory: null, outcome: {} };
    case "NEEDS_INPUT":
      return { status: "needs_input", failureCategory: null, outcome: { message: result.summary ?? "OPTIM needs more information before it can prepare a proposal.", missing: result.missing.map((m) => ({ fact: m.fact, why: m.why, providedBy: m.providedBy })) } };
    case "DOMAIN_NOT_YET_SUPPORTED":
      return { status: "unsupported", failureCategory: null, outcome: { message: MESSAGES.unsupported } };
    case "REJECTED":
      return { status: "failed", failureCategory: "rejected_by_validators", outcome: { message: MESSAGES.rejected_by_validators } };
    case "PROVIDER_FAILED":
      return { status: "failed", failureCategory: "provider_failed", outcome: { message: MESSAGES.provider_failed } };
  }
}

/** Function limit (300 s) + margin: a job still preparing after this is dead. */
export const STALE_AFTER_MS = 8 * 60_000;
export const isStale = (job: { status: JobStatus; created_at: string }, nowMs: number) => job.status === "preparing" && nowMs - Date.parse(job.created_at) > STALE_AFTER_MS;

/** Audit columns derived from a ReasonerRun (all safe metadata). */
export function auditColumns(run: ReasonerRun) {
  return {
    reasoner_version: run.versions.reasoner,
    prompt_version: run.versions.prompt,
    knowledge_version: run.versions.knowledge,
    model_id: run.versions.model?.modelId ?? null,
    input_hash: run.hashes.input,
    client_state_hash: run.hashes.clientState,
    goal_contract_hash: run.hashes.goalContract,
    constraint_set_hash: run.hashes.constraintSet,
    model_calls: run.totals.calls,
    input_tokens: run.totals.inputTokens,
    output_tokens: run.totals.outputTokens,
    latency_ms: run.totals.latencyMs,
  };
}

/** What the coach's workspace shows for a job (never the run itself). */
export interface ReasonerJobView {
  jobId: string;
  status: JobStatus;
  failureCategory: FailureCategory | null;
  outcome: JobOutcome;
  programVersionId: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
}

export interface JobFinish {
  status: Exclude<JobStatus, "preparing">;
  failureCategory: FailureCategory | null;
  outcome: JobOutcome;
  programVersionId?: string | null;
  result?: ReasonerResult;
}

/**
 * The background job body, with I/O injected (tested offline). Exactly one
 * Reasoner run per job; every path calls `finish` once with a terminal state;
 * exceptions are reduced to fixed categories (no provider text, no stacks).
 * `saveDraft` is called only for a PLANNED result — never for NEEDS_INPUT,
 * unsupported domains or failures, and no other planner is ever invoked.
 */
export async function executeReasonerJob(deps: {
  jobId: string;
  nowIso: () => string;
  loadInput: () => Promise<SynthesisInput>;
  model: () => Promise<ReasonerModel | null>;
  saveDraft: (result: Extract<ReasonerResult, { status: "PLANNED" }>) => Promise<{ versionId: string } | { superseded: true } | { notSaved: string }>;
  finish: (f: JobFinish) => Promise<void>;
  log?: (line: string) => void;
}): Promise<void> {
  let result: ReasonerResult | undefined;
  try {
    const input = await deps.loadInput();
    result = await runFitnessReasoner({ input, model: await deps.model(), nowIso: deps.nowIso(), runId: deps.jobId, onDiagnostic: (d) => deps.log?.(`reasoner job ${deps.jobId}: ${d.stage} (${d.detail.slice(0, 200)})`) });
    const mapped = outcomeForResult(result);
    if (result.status !== "PLANNED") return await deps.finish({ ...mapped, result });
    const saved = await deps.saveDraft(result);
    if ("versionId" in saved) return await deps.finish({ status: "ready_for_review", failureCategory: null, outcome: {}, programVersionId: saved.versionId, result });
    if ("superseded" in saved) return await deps.finish({ status: "failed", failureCategory: "superseded", outcome: { message: MESSAGES.superseded }, result });
    return await deps.finish({ status: "failed", failureCategory: "draft_not_saved", outcome: { message: saved.notSaved || MESSAGES.draft_not_saved }, result });
  } catch (err) {
    deps.log?.(`reasoner job ${deps.jobId}: ${err instanceof Error ? err.name : "unknown"}`);
    const planned = result?.status === "PLANNED";
    await deps.finish({ status: "failed", failureCategory: planned ? "draft_not_saved" : "provider_failed", outcome: { message: planned ? MESSAGES.draft_not_saved : MESSAGES.provider_failed }, result });
  }
}
