// Gate U2 — persistence of a Unified Program proposal as ONE parent row (unified_program_proposals, migration 034)
// linking genuine DRAFT domain content:
//   • a training_program_versions draft holding the lifting (proposed, the coach's pending draft, or a copy of the
//     approved program — never the approved row itself) plus executable cardio sessions;
//   • a nutrition_plan_versions draft when the strategy fits the existing AssignedNutritionPlan contract; otherwise the
//     strategy is kept, with its meaning and the reason, in the row (never forced into fabricated numbers).
//
// Runs under the CALLER'S Supabase session (coach RLS is the backstop for every write; the migration's trigger checks
// every link). Two steps so retries are safe and cheap:
//   beginUnifiedProposal — idempotency key → an existing finished row is returned as-is (no orchestration, no model
//     calls); a failed or stale attempt is resumed; otherwise a 'preparing' row is created (single-flight per client).
//   completeUnifiedProposal — stores the proposal and domain runs FIRST, then creates each draft only if the row isn't
//     already linked to one, so a retry after a partial failure reuses what exists and never duplicates.
// Nothing is approved, published, assigned or notified. Not "server-only": the production wrapper
// (lib/production/unified-proposals.ts) supplies the session client; local e2e tests supply a signed-in client.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignedNutritionPlan } from "../types.ts";
import type { GenerationInputs, UniversalTrainingProgramContent } from "../training/types.ts";
import type { FitnessKnowledgeRegistry } from "../synthesis/knowledge/types.ts";
import type { ReasonerResult } from "../synthesis/reasoner/reasoner.ts";
import type { CardioReasonerResult } from "../synthesis/reasoner/cardio/reasoner.ts";
import type { NutritionReasonerResult } from "../synthesis/reasoner/nutrition/reasoner.ts";
import { reasonerResultToProgramContent } from "../synthesis/reasoner/to-program.ts";
import { toAssignedNutritionPlanDraft } from "../synthesis/reasoner/nutrition/to-plan.ts";
import { cardioOnlyProgram, cardioToSessions, mergeCardioIntoProgram } from "../synthesis/unified/cardio-content.ts";
import type { UnifiedProgramProposal, UnifiedStatus } from "../synthesis/unified/contract.ts";
import { validateAssignedNutritionPlanContent, validateUniversalTrainingProgramContent } from "./validation.ts";
import { insertDraftNutritionVersion, insertDraftProgramVersion } from "./draft-versions.ts";

export const UNIFIED_STALE_AFTER_MS = 10 * 60_000;
const FINAL = new Set(["draft_ready", "needs_coach_decision", "incomplete", "escalated", "needs_input", "incoherent"]);

export type RowStatus = "preparing" | "draft_ready" | "needs_coach_decision" | "incomplete" | "escalated" | "needs_input" | "incoherent" | "failed";
export interface UnifiedRow {
  id: string;
  status: RowStatus;
  failure_category: string | null;
  proposal: UnifiedProgramProposal | Record<string, never>;
  domain_runs: UnifiedArtifacts | Record<string, never>;
  nutrition_strategy: { reason: string; strategy: unknown } | null;
  training_program_version_id: string | null;
  nutrition_plan_version_id: string | null;
  created_at: string;
  updated_at: string;
}
const ROW = "id, status, failure_category, proposal, domain_runs, nutrition_strategy, training_program_version_id, nutrition_plan_version_id, created_at, updated_at";

/** What the drafts are built from — stored with the row so a retry rebuilds the SAME drafts (no recomputation). */
export interface UnifiedArtifacts {
  resistance:
    | { source: "proposed_program"; result: Extract<ReasonerResult, { status: "PLANNED" }>; generationInputs: GenerationInputs }
    | { source: "existing_draft" | "approved_program"; versionId: string; content: UniversalTrainingProgramContent }
    | { source: "none" };
  cardio: CardioReasonerResult | null;
  nutrition: NutritionReasonerResult | null;
}

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** The request's identity: same client state, goal, coach method, lifting source and title → same proposal row. */
export function unifiedIdempotencyKey(p: { clientStateHash: string; goalContractHash: string; coachMethodVersionId: string | null; resistanceSource: string; sourceVersionId: string | null; sourceContentHash: string | null; title: string; unifiedVersion: string }): string {
  return sha(p);
}

export type BeginResult = { kind: "existing"; row: UnifiedRow } | { kind: "in_progress"; row: UnifiedRow | null } | { kind: "started"; rowId: string } | { kind: "resume"; row: UnifiedRow };

export async function beginUnifiedProposal(supabase: SupabaseClient, userId: string, p: { workspaceId: string; clientProfileId: string; title: string; idempotencyKey: string; nowMs: number }): Promise<BeginResult> {
  const { data: existing, error } = await supabase.from("unified_program_proposals").select(ROW).eq("workspace_id", p.workspaceId).eq("client_profile_id", p.clientProfileId).eq("idempotency_key", p.idempotencyKey).maybeSingle();
  if (error) throw new Error(`beginUnifiedProposal (lookup) failed: ${error.message}`);
  if (existing) {
    const row = existing as unknown as UnifiedRow;
    if (FINAL.has(row.status)) return { kind: "existing", row };
    if (row.status === "preparing" && p.nowMs - Date.parse(row.updated_at) < UNIFIED_STALE_AFTER_MS) return { kind: "in_progress", row };
    // A failed (or stale) attempt is resumed on the same row: its stored artifacts and linked drafts are reused.
    const { data: resumed, error: e2 } = await supabase.from("unified_program_proposals").update({ status: "preparing", failure_category: null }).eq("id", row.id).select(ROW).single();
    if (e2) return e2.code === "23505" ? { kind: "in_progress", row: null } : Promise.reject(new Error(`beginUnifiedProposal (resume) failed: ${e2.message}`));
    return { kind: "resume", row: resumed as unknown as UnifiedRow };
  }
  const { data: created, error: e3 } = await supabase.from("unified_program_proposals").insert({ workspace_id: p.workspaceId, client_profile_id: p.clientProfileId, requested_by: userId, idempotency_key: p.idempotencyKey, title: p.title }).select("id").single();
  if (e3) {
    if (e3.code === "23505") return { kind: "in_progress", row: null }; // another proposal for this client is in flight
    throw new Error(`beginUnifiedProposal (insert) failed: ${e3.message}`);
  }
  return { kind: "started", rowId: created.id as string };
}

const ROW_STATUS: Record<UnifiedStatus, RowStatus> = { READY_FOR_REVIEW: "draft_ready", NEEDS_COACH_DECISION: "needs_coach_decision", INCOMPLETE: "incomplete", ESCALATE: "escalated", NEEDS_INPUT: "needs_input", INCOHERENT: "incoherent" };

/** Lifting (as the source provides it, unchanged) + executable cardio → one training program content, or null. */
export function buildUnifiedTrainingContent(p: { rowId: string; artifacts: UnifiedArtifacts; proposal: UnifiedProgramProposal; knowledge: FitnessKnowledgeRegistry; workspaceId: string; clientProfileId: string; coachId: string; title: string; nowIso: string }): UniversalTrainingProgramContent | null {
  const a = p.artifacts;
  const id = `unified-${p.rowId}`;
  let base: UniversalTrainingProgramContent | null = null;
  if (a.resistance.source === "proposed_program") base = reasonerResultToProgramContent({ result: a.resistance.result, knowledge: p.knowledge, programId: id, workspaceId: p.workspaceId, clientProfileId: p.clientProfileId, coachId: p.coachId, title: p.title, jobId: p.rowId, generationInputs: a.resistance.generationInputs, nowIso: p.nowIso });
  else if (a.resistance.source !== "none") base = { ...structuredClone(a.resistance.content), id, name: p.title };
  const cardio = a.cardio && a.cardio.status === "PLANNED" && a.cardio.plan.warranted ? a.cardio : null;
  const conv = cardio ? cardioToSessions(cardio) : null;
  let content = base && conv ? mergeCardioIntoProgram(base, conv) : base ?? (conv ? cardioOnlyProgram({ cardio: conv, id, workspaceId: p.workspaceId, clientId: p.clientProfileId, coachId: p.coachId, name: p.title }) : null);
  if (!content) return null;
  // A NEW draft, whatever the source's state (an approved/assigned program's copy is a draft proposal, not assigned).
  content = {
    ...content,
    clientId: p.clientProfileId,
    workspaceId: p.workspaceId,
    status: "draft",
    createdAtIso: p.nowIso,
    updatedAtIso: p.nowIso,
    unifiedProvenance: {
      proposalRunId: p.proposal.runId,
      unifiedVersion: p.proposal.version,
      resistance: a.resistance.source === "proposed_program" ? { source: "proposed_program", runId: a.resistance.result.run.runId } : a.resistance.source === "none" ? { source: "none" } : { source: a.resistance.source, versionId: a.resistance.versionId },
      cardio: cardio && conv ? { runId: cardio.run.runId, promptVersion: cardio.run.versions.prompt, weeks: conv.weeks } : null,
    },
  };
  return content;
}

export interface CompleteResult {
  status: RowStatus;
  trainingVersionId: string | null;
  nutritionVersionId: string | null;
  nutritionStrategy: { reason: string; strategy: unknown } | null;
  error?: string;
}

export async function completeUnifiedProposal(
  supabase: SupabaseClient,
  userId: string,
  p: { row: { id: string; training_program_version_id?: string | null; nutrition_plan_version_id?: string | null }; workspaceId: string; clientProfileId: string; coachId: string; title: string; nowIso: string; proposal: UnifiedProgramProposal; artifacts: UnifiedArtifacts; knowledge: FitnessKnowledgeRegistry; failBefore?: "nutrition" },
): Promise<CompleteResult> {
  const { proposal: u, artifacts: a } = p;
  const rowId = p.row.id;
  const fail = async (category: "content_invalid" | "draft_not_saved", error: string, links: { t: string | null; n: string | null }): Promise<CompleteResult> => {
    await supabase.from("unified_program_proposals").update({ status: "failed", failure_category: category }).eq("id", rowId);
    return { status: "failed", trainingVersionId: links.t, nutritionVersionId: links.n, nutritionStrategy: null, error };
  };
  // 1. The proposal and its domain runs first — what the drafts are built from survives any later failure.
  const resistanceSource = a.resistance.source;
  const { error: e1 } = await supabase
    .from("unified_program_proposals")
    .update({
      proposal: u,
      domain_runs: a,
      unified_version: u.version,
      resistance_source: resistanceSource,
      source_resistance_version_id: a.resistance.source === "existing_draft" || a.resistance.source === "approved_program" ? a.resistance.versionId : null,
      coach_method_version_id: u.provenance.coachMethod?.versionId ?? null,
      client_state_hash: u.provenance.clientState,
      goal_contract_hash: u.provenance.goalContract,
      model_calls: u.provenance.modelCalls,
    })
    .eq("id", rowId);
  if (e1) return fail("draft_not_saved", `storing the proposal failed: ${e1.message}`, { t: null, n: null });

  let trainingVersionId = p.row.training_program_version_id ?? null;
  let nutritionVersionId = p.row.nutrition_plan_version_id ?? null;
  let nutritionStrategy: CompleteResult["nutritionStrategy"] = null;
  // 2. Drafts only for a coherent program a coach can review; otherwise the row records the outcome and no content.
  if (u.status === "READY_FOR_REVIEW" || u.status === "NEEDS_COACH_DECISION") {
    if (!trainingVersionId) {
      let content: UniversalTrainingProgramContent | null;
      try {
        content = buildUnifiedTrainingContent({ rowId, artifacts: a, proposal: u, knowledge: p.knowledge, workspaceId: p.workspaceId, clientProfileId: p.clientProfileId, coachId: p.coachId, title: p.title, nowIso: p.nowIso });
        if (content) validateUniversalTrainingProgramContent(content);
      } catch (err) {
        return fail("content_invalid", (err as Error).message, { t: null, n: nutritionVersionId });
      }
      if (content) {
        try {
          const { versionId } = await insertDraftProgramVersion(supabase, userId, { workspaceId: p.workspaceId, title: p.title, content });
          trainingVersionId = versionId;
          const { error } = await supabase.from("unified_program_proposals").update({ training_program_version_id: versionId }).eq("id", rowId);
          if (error) return fail("draft_not_saved", `linking the training draft failed: ${error.message}`, { t: versionId, n: nutritionVersionId });
        } catch (err) {
          return fail("draft_not_saved", (err as Error).message, { t: null, n: nutritionVersionId });
        }
      }
    }
    if (p.failBefore === "nutrition") return fail("draft_not_saved", "simulated failure before the nutrition draft", { t: trainingVersionId, n: nutritionVersionId });
    const n = a.nutrition && (a.nutrition.status === "PLANNED" || a.nutrition.status === "NEEDS_COACH_REVIEW") ? a.nutrition : null;
    if (n && !nutritionVersionId) {
      const mapped = toAssignedNutritionPlanDraft(n.plan);
      if (mapped.ok && n.status === "PLANNED") {
        // Proposed, not approved: approvedAtIso stays empty until a coach approves (Gate U3 stamps it).
        const content: AssignedNutritionPlan = { id: `nutrition-unified-${rowId}`, ...mapped.content, approvedAtIso: "" };
        // U3A — the same production validator every nutrition read uses: method-faithful, no invented targets.
        try {
          validateAssignedNutritionPlanContent(content);
        } catch (err) {
          return fail("content_invalid", (err as Error).message, { t: trainingVersionId, n: null });
        }
        try {
          const { versionId } = await insertDraftNutritionVersion(supabase, userId, { workspaceId: p.workspaceId, title: `${p.title} — nutrition`, content });
          nutritionVersionId = versionId;
          const { error } = await supabase.from("unified_program_proposals").update({ nutrition_plan_version_id: versionId }).eq("id", rowId);
          if (error) return fail("draft_not_saved", `linking the nutrition draft failed: ${error.message}`, { t: trainingVersionId, n: versionId });
        } catch (err) {
          return fail("draft_not_saved", (err as Error).message, { t: trainingVersionId, n: null });
        }
      } else {
        nutritionStrategy = { reason: mapped.ok ? "A qualified human must decide on restrictive items before this strategy can become a plan." : mapped.reason, strategy: n.plan };
      }
    }
  }
  // 3. Final status.
  const status = ROW_STATUS[u.status];
  const { error: e3 } = await supabase.from("unified_program_proposals").update({ status, nutrition_strategy: nutritionStrategy, completed_at: new Date().toISOString() }).eq("id", rowId);
  if (e3) return fail("draft_not_saved", `recording the outcome failed: ${e3.message}`, { t: trainingVersionId, n: nutritionVersionId });
  return { status, trainingVersionId, nutritionVersionId, nutritionStrategy };
}
