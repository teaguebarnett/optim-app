// Production "Let OPTIM Build" (prepare a unified proposal) — the coach-triggered entry point that produces ONE unified
// proposal of linked DRAFTS for the coach to review: resistance from the Fitness Reasoner (or the client's approved
// program, kept as-is), coordinated with OPTIM's cardio and nutrition reasoning. It never approves, publishes, assigns
// or notifies.
//
// Order of checks (no model call until all pass): the caller is the client's assigned coach / workspace admin
// (requireAssignedCoach); the client is allowlisted (OPTIM_REASONER_PROPOSAL_CLIENTS); no unified proposal is already
// open for the client; the provider is configured. createUnifiedDraftForClient then checks readiness (confirmed coach
// method, completed intake, health review, confirmed exercise restrictions), is idempotent and single-flight, and
// re-checks freshness before writing. The model is wrapped in a hard per-preparation call and time budget.
import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import type { ReasonerModel } from "../synthesis/reasoner/core.ts";
import { requireAssignedCoach } from "./reasoner-lifecycle.ts";
import { isReasonerProposalEnabled, productionReasonerModel } from "./reasoner-proposals.ts";
import { getActiveProgramAssignment } from "./programs.ts";
import { createUnifiedDraftForClient } from "./unified-proposals.ts";
import { boundedModel, PREPARE_POLICY, preparePreflight } from "./unified-prepare-policy.ts";
import type { UniversalTrainingProgramContent } from "../training/types.ts";

export type PrepareOutcome =
  | { ok: true; kind: "completed" | "existing"; rowId: string; status: string; modelCalls: number; message: string }
  | { ok: false; code: string; message: string; modelCalls: number };

const isLocalSupabase = () => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

/** The production model; on a LOCAL stack with the test provider enabled, OPTIM's scripted per-domain models (no paid
 * calls) — the same guard productionReasonerModel uses for its own local test provider. */
async function unifiedModel(): Promise<ReasonerModel | null> {
  if (process.env.OPTIM_REASONER_TEST_PROVIDER && isLocalSupabase()) {
    const { routerModel } = await import("../synthesis/unified/eval/fixtures.ts");
    return routerModel();
  }
  return productionReasonerModel();
}

export async function prepareUnifiedProposalForClient(p: { workspaceId: string; clientProfileId: string; title: string }): Promise<PrepareOutcome> {
  await requireAssignedCoach(p.workspaceId, p.clientProfileId);
  const supabase = await getSupabaseServerClient();

  const [{ data: open }, { count: decided }, active, model] = await Promise.all([
    supabase.from("unified_program_proposals").select("id, approval_state, status").eq("workspace_id", p.workspaceId).eq("client_profile_id", p.clientProfileId).in("approval_state", ["proposed", "approved"]).in("status", ["draft_ready", "needs_coach_decision", "incomplete"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("unified_program_proposals").select("id", { count: "exact", head: true }).eq("workspace_id", p.workspaceId).eq("client_profile_id", p.clientProfileId).in("approval_state", ["rejected", "published", "superseded"]),
    getActiveProgramAssignment(p.clientProfileId),
    unifiedModel(),
  ]);
  const approved = active && (active.content as { schemaVersion?: number }).schemaVersion === 2 ? { versionId: active.versionId, content: active.content as UniversalTrainingProgramContent } : null;

  const decision = preparePreflight({
    allowlisted: isReasonerProposalEnabled(p.clientProfileId),
    providerConfigured: !!model,
    openProposal: open ? { id: open.id as string, approvalState: open.approval_state as string, status: open.status as string } : null,
    approvedProgram: approved ? { versionId: approved.versionId } : null,
  });
  if (!decision.ok) return { ok: false, code: decision.code, message: decision.message, modelCalls: 0 };

  const bounded = boundedModel(model!, PREPARE_POLICY.maxModelCalls, { noNewCallAfterMs: PREPARE_POLICY.noNewCallAfterMs });
  const out = await createUnifiedDraftForClient({
    workspaceId: p.workspaceId,
    clientProfileId: p.clientProfileId,
    title: p.title,
    model: bounded,
    maxAttempts: PREPARE_POLICY.maxAttemptsPerDomain,
    // After a proposal is decided (rejected / published / superseded) the coach may prepare afresh; retries within
    // the same round stay idempotent.
    idempotencyRound: decided ?? 0,
    // The approved program stays fixed; otherwise no lifting is passed and the Fitness Reasoner plans it (a pending
    // legacy draft is never inherited — it is archived only when this proposal is published).
    ...(decision.lifting.source === "approved_program" ? { approvedResistance: approved } : {}),
  });
  const modelCalls = bounded.calls();
  console.log(`prepareUnifiedProposal: ${out.kind}; lifting ${decision.lifting.source}; model calls ${modelCalls}/${PREPARE_POLICY.maxModelCalls}`);
  // The reason a prepared proposal's drafts didn't save (no client data — validator / database messages only).
  if (out.kind === "completed" && out.result.status === "failed") console.error(`prepareUnifiedProposal: drafts not saved for row ${out.rowId}: ${out.result.error ?? "unknown"}`);
  switch (out.kind) {
    case "completed":
      return { ok: true, kind: "completed", rowId: out.rowId, status: out.result.status, modelCalls, message: out.result.status === "failed" ? "OPTIM prepared the proposal but couldn't save its drafts. Trying again reuses this prepared proposal — no new AI generation." : "Proposal prepared — review it below." };
    case "existing":
      return { ok: true, kind: "existing", rowId: out.row.id, status: out.row.status, modelCalls, message: "This proposal was already prepared — nothing new was generated." };
    case "in_progress":
      return { ok: false, code: "in_progress", message: "OPTIM is already preparing a proposal for this client — give it a moment, then reload.", modelCalls };
    case "not_ready":
      return { ok: false, code: "not_ready", message: `Not ready to prepare: ${out.reasons.join(" ")}`, modelCalls };
    case "superseded":
      return { ok: false, code: "superseded", message: `${out.reason} Nothing was saved — prepare again.`, modelCalls };
  }
}
