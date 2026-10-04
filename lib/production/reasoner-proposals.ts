// Gate 4.0C-4 — Fitness Reasoner production integration: persistence and the
// background job runner for Reasoner-prepared DRAFT proposals.
//
//   coach clicks "Prepare proposal" (server action, returns immediately)
//   → reasoner_generation_jobs row 'preparing' (single-flight per client)
//   → after(): Reasoner (medium effort) → deterministic validation
//   → PLANNED: converted to the existing proposal content and saved as a
//     DRAFT training_program_versions row → job 'ready_for_review'
//   → otherwise: 'needs_input' | 'unsupported' | 'failed' with a safe message.
//
// Nothing here publishes, assigns, edits Coach Brain or touches confirmed
// constraints, and no failure ever falls back to another planner. Callers
// (app/actions/production-programs.ts) authorize the coach first.

import "server-only";
import { resolveStructuredJsonProvider } from "../ai/resolve.ts";
import { getSupabaseServerClient } from "../supabase/server.ts";
import type { ReasonerModel, ReasonerResult } from "../synthesis/reasoner/reasoner.ts";
import { serializeRun } from "../synthesis/reasoner/run.ts";
import { auditColumns, executeReasonerJob, isStale, MESSAGES, parseEnabledClients, type FailureCategory, type JobFinish, type JobOutcome, type JobStatus, type ReasonerJobView } from "../synthesis/reasoner/proposal-job.ts";
import type { SynthesisInput } from "../synthesis/synthesis-input.ts";

export const REASONER_EFFORT = "medium" as const;
/** Inside the 300 s function limit (maxDuration) with room to persist the result. */
export const REASONER_TIMEOUT_MS = 240_000;

/** Server-only controlled rollout: an explicit allowlist of client profile ids. */
export function isReasonerProposalEnabled(clientProfileId: string): boolean {
  return parseEnabledClients(process.env.OPTIM_REASONER_PROPOSAL_CLIENTS).has(clientProfileId.toLowerCase());
}

const isLocalSupabase = () => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

/** The production model boundary (canonical provider, medium effort). A test
 * provider exists ONLY against a local Supabase stack, for offline E2E. */
export async function productionReasonerModel(): Promise<ReasonerModel | null> {
  const test = process.env.OPTIM_REASONER_TEST_PROVIDER;
  if (test && isLocalSupabase()) {
    const { fakeModel, scriptedOutput } = await import("../synthesis/reasoner/eval/fixtures.ts");
    const delay = Number(process.env.OPTIM_REASONER_TEST_DELAY_MS ?? 6000);
    const scripted = fakeModel((ri) => scriptedOutput(ri));
    return {
      provider: "local-test",
      modelId: `local-test:${test}`,
      generate: async (req) => {
        await new Promise((r) => setTimeout(r, delay));
        if (test === "fail") throw Object.assign(new Error("simulated provider failure"), { name: "AiProviderUnavailableError" });
        if (test === "invalid") return { json: { status: "PLAN", plan: { domain: "resistance" } }, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: delay };
        return { ...(await scripted.generate(req)), usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: delay };
      },
    };
  }
  const resolved = resolveStructuredJsonProvider();
  if (!resolved.provider) return null;
  const provider = resolved.provider;
  return {
    provider: provider.id,
    modelId: provider.modelId,
    generate: async (r) => {
      const res = await provider.generateJsonWithMeta({ ...r, timeoutMs: REASONER_TIMEOUT_MS, effort: REASONER_EFFORT });
      return { json: res.json, usage: res.usage ?? undefined, requestId: res.requestId ?? undefined, latencyMs: res.latencyMs };
    },
  };
}

interface JobRow {
  id: string;
  workspace_id: string;
  client_profile_id: string;
  status: JobStatus;
  failure_category: FailureCategory | null;
  outcome: JobOutcome;
  program_version_id: string | null;
  title: string;
  created_at: string;
  completed_at: string | null;
}

const toView = (r: JobRow): ReasonerJobView => ({ jobId: r.id, status: r.status, failureCategory: r.failure_category, outcome: r.outcome ?? {}, programVersionId: r.program_version_id, createdAtIso: r.created_at, completedAtIso: r.completed_at });
const COLUMNS = "id, workspace_id, client_profile_id, status, failure_category, outcome, program_version_id, title, created_at, completed_at";

/** Closes a job whose background run died with the function (never left 'preparing'). */
async function closeIfStale(row: JobRow): Promise<JobRow> {
  if (!isStale(row, Date.now())) return row;
  const supabase = await getSupabaseServerClient();
  const patch = { status: "failed", failure_category: "timed_out", outcome: { message: MESSAGES.timed_out }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data } = await supabase.from("reasoner_generation_jobs").update(patch).eq("id", row.id).eq("status", "preparing").select(COLUMNS).maybeSingle();
  return (data as JobRow | null) ?? { ...row, ...(patch as Partial<JobRow>) };
}

export async function getLatestReasonerJob(workspaceId: string, clientProfileId: string): Promise<ReasonerJobView | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("reasoner_generation_jobs").select(COLUMNS).eq("workspace_id", workspaceId).eq("client_profile_id", clientProfileId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`getLatestReasonerJob failed: ${error.code ?? "query_error"}`);
  return data ? toView(await closeIfStale(data as JobRow)) : null;
}

/**
 * Single-flight start: inserts a 'preparing' job, or — when one is already in
 * flight for this client (partial unique index) — returns that job and
 * started:false. Only a started job may run the Reasoner.
 */
export async function startReasonerJob(params: { workspaceId: string; clientProfileId: string; requestedBy: string; title: string }): Promise<{ started: boolean; job: ReasonerJobView }> {
  const supabase = await getSupabaseServerClient();
  const existing = await getLatestReasonerJob(params.workspaceId, params.clientProfileId);
  if (existing?.status === "preparing") return { started: false, job: existing };
  const { data, error } = await supabase
    .from("reasoner_generation_jobs")
    .insert({ workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, requested_by: params.requestedBy, title: params.title, status: "preparing" })
    .select(COLUMNS)
    .single();
  if (error) {
    // 23505 = the in-flight unique index: another click/tab won the race.
    if (error.code === "23505") {
      const winner = await getLatestReasonerJob(params.workspaceId, params.clientProfileId);
      if (winner) return { started: false, job: winner };
    }
    throw new Error(`startReasonerJob failed: ${error.code ?? "insert_error"}`);
  }
  return { started: true, job: toView(data as JobRow) };
}

async function finishJob(jobId: string, patch: JobFinish) {
  const supabase = await getSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("reasoner_generation_jobs")
    .update({
      status: patch.status,
      failure_category: patch.failureCategory,
      outcome: patch.outcome,
      program_version_id: patch.programVersionId ?? null,
      ...(patch.result ? { run: JSON.parse(serializeRun(patch.result.run)), ...auditColumns(patch.result.run) } : {}),
      completed_at: now,
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("status", "preparing");
  if (error) console.error(`reasoner job ${jobId}: could not record outcome (${error.code ?? "update_error"})`);
}

/** The background body (see executeReasonerJob): one Reasoner run, one terminal job state. */
export async function runReasonerJob(params: {
  jobId: string;
  loadInput: () => Promise<SynthesisInput>;
  saveDraft: (result: Extract<ReasonerResult, { status: "PLANNED" }>) => Promise<{ versionId: string } | { superseded: true } | { notSaved: string }>;
}): Promise<void> {
  await executeReasonerJob({ jobId: params.jobId, nowIso: () => new Date().toISOString(), loadInput: params.loadInput, model: productionReasonerModel, saveDraft: params.saveDraft, finish: (f) => finishJob(params.jobId, f), log: (l) => console.error(l) });
}
