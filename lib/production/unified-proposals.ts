// Gate U2 — production entry point for persisting a Unified Program proposal as linked DRAFTS for one client. Server
// only: the coach's session (requireAssignedCoach) and its RLS-scoped Supabase client do every read and write; the
// persistence itself is lib/production/unified-drafts.ts (shared with the local e2e). Nothing is approved, published,
// assigned or notified, and no UI calls this yet (coach review / approval / atomic publication are Gate U3).
//
// Freshness is re-checked before anything is written, like saveReasonerDraft: the coach method must still be the one
// the proposal was made under, and the client's planning inputs must not have changed while OPTIM was working —
// otherwise the row is marked superseded and no drafts are created.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { FOUNDATION_KNOWLEDGE } from "../synthesis/knowledge/registry.ts";
import { sha256 } from "../synthesis/reasoner/run.ts";
import type { ReasonerModel } from "../synthesis/reasoner/core.ts";
import { runUnifiedProgram, type DomainResults } from "../synthesis/unified/orchestrate.ts";
import { UNIFIED_VERSION, type UnifiedProgramProposal } from "../synthesis/unified/contract.ts";
import type { UniversalTrainingProgramContent } from "../training/types.ts";
import { buildGenerationInputs } from "../coach/generation-prerequisites.ts";
import { loadSynthesisInputForClient } from "./synthesis.ts";
import { requireAssignedCoach, resolveGenerationContext } from "./reasoner-lifecycle.ts";
import { beginUnifiedProposal, completeUnifiedProposal, unifiedIdempotencyKey, type CompleteResult, type UnifiedArtifacts, type UnifiedRow } from "./unified-drafts.ts";

export type UnifiedDraftOutcome =
  | { kind: "existing"; row: UnifiedRow }
  | { kind: "in_progress" }
  | { kind: "not_ready"; reasons: string[] }
  | { kind: "superseded"; rowId: string; reason: string }
  | { kind: "completed"; rowId: string; proposal: UnifiedProgramProposal; result: CompleteResult };

export async function createUnifiedDraftForClient(params: {
  workspaceId: string;
  clientProfileId: string;
  title: string;
  model: ReasonerModel | null;
  /** Lifting the coach already has: an approved program (fixed) or their pending draft (used unchanged). */
  approvedResistance?: { versionId: string; content: UniversalTrainingProgramContent } | null;
  existingResistanceDraft?: { versionId: string; content: UniversalTrainingProgramContent } | null;
  proceedWithoutResistance?: boolean;
}): Promise<UnifiedDraftOutcome> {
  const ctx = await requireAssignedCoach(params.workspaceId, params.clientProfileId);
  const supabase = await getSupabaseServerClient();
  const { method, onboarding, prerequisites } = await resolveGenerationContext(params.workspaceId, params.clientProfileId);
  if (!prerequisites.ready) return { kind: "not_ready", reasons: prerequisites.missing.map((m) => m.message) };
  if (!method || !onboarding) return { kind: "not_ready", reasons: ["A confirmed coach method and completed intake are required."] };
  const input = await loadSynthesisInputForClient(params.clientProfileId);
  const source = params.approvedResistance ?? params.existingResistanceDraft ?? null;
  const resistanceSource = params.approvedResistance ? "approved_program" : params.existingResistanceDraft ? "existing_draft" : "proposed_program";
  const key = unifiedIdempotencyKey({ clientStateHash: sha256(input.client), goalContractHash: sha256(input.goal), coachMethodVersionId: method.versionId, resistanceSource, sourceVersionId: source?.versionId ?? null, sourceContentHash: source ? sha256(source.content) : null, title: params.title, unifiedVersion: UNIFIED_VERSION });
  const begun = await beginUnifiedProposal(supabase, ctx.userId, { workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, title: params.title, idempotencyKey: key, nowMs: Date.now() });
  if (begun.kind === "existing") return { kind: "existing", row: begun.row };
  if (begun.kind === "in_progress") return { kind: "in_progress" };
  const rowId = begun.kind === "started" ? begun.rowId : begun.row.id;
  const nowIso = new Date().toISOString();

  let proposal: UnifiedProgramProposal;
  let artifacts: UnifiedArtifacts;
  if (begun.kind === "resume" && (begun.row.proposal as UnifiedProgramProposal).schema) {
    proposal = begun.row.proposal as UnifiedProgramProposal;
    artifacts = begun.row.domain_runs as UnifiedArtifacts;
  } else {
    let results: DomainResults | null = null;
    proposal = await runUnifiedProgram({ input, model: params.model, nowIso, approvedResistance: params.approvedResistance ?? null, existingResistanceDraft: params.existingResistanceDraft ?? null, proceedWithoutResistance: params.proceedWithoutResistance, onResults: (r) => (results = r) });
    const r = results as DomainResults | null;
    const generationInputs = buildGenerationInputs({ playbookVersion: method.version, methodVersionId: method.versionId, operatingModel: method.operatingModel, onboarding, profile: prerequisites.profile, assumptions: prerequisites.assumptions, nowIso });
    artifacts = {
      resistance: params.approvedResistance
        ? { source: "approved_program", versionId: params.approvedResistance.versionId, content: params.approvedResistance.content }
        : params.existingResistanceDraft
          ? { source: "existing_draft", versionId: params.existingResistanceDraft.versionId, content: params.existingResistanceDraft.content }
          : r?.resistance?.status === "PLANNED"
            ? { source: "proposed_program", result: r.resistance, generationInputs }
            : { source: "none" },
      cardio: r?.cardio ?? null,
      nutrition: r?.nutrition ?? null,
    };
  }

  // Freshness: the method and the client's planning inputs must still be what the proposal was made under.
  const now = await loadSynthesisInputForClient(params.clientProfileId);
  const current = await resolveGenerationContext(params.workspaceId, params.clientProfileId);
  const stale = current.method?.versionId !== proposal.provenance.coachMethod?.versionId ? "The coaching method changed while OPTIM was working." : sha256(now.client) !== proposal.provenance.clientState || sha256(now.goal) !== proposal.provenance.goalContract ? "The client's planning inputs changed while OPTIM was working." : null;
  if (stale) {
    await supabase.from("unified_program_proposals").update({ status: "failed", failure_category: "superseded", proposal, domain_runs: artifacts }).eq("id", rowId);
    return { kind: "superseded", rowId, reason: stale };
  }
  const links = begun.kind === "resume" ? { training_program_version_id: begun.row.training_program_version_id, nutrition_plan_version_id: begun.row.nutrition_plan_version_id } : {};
  const result = await completeUnifiedProposal(supabase, ctx.userId, { row: { id: rowId, ...links }, workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId, title: params.title, nowIso, proposal, artifacts, knowledge: FOUNDATION_KNOWLEDGE });
  return { kind: "completed", rowId, proposal, result };
}
