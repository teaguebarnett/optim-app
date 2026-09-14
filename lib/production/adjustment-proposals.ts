// Phase 10B — the one real read/write boundary for evidence-backed
// adjustment proposals. Deliberately reuses every existing Phase 8C/8D
// program-version primitive (createDraftProgramVersion, the same
// draft/published/archived lifecycle, the same RLS) rather than inventing
// a parallel "adaptation" persistence layer (spec section 19/20) — an
// adjustment proposal IS a training_program_versions draft, distinguished
// from a fresh-generation proposal only by an additive
// `adjustmentProvenance` field inside its own content (see
// lib/training/types.ts's own doc — no SQL migration).
//
// Non-negotiable (spec section 18): generating a proposal here NEVER
// mutates the client's active program. Every write below is a brand-new
// draft in a brand-new program family — the exact same "propose, never
// mutate" posture generateUniversalProgramProposalContent already has.
//
// Failure semantics (spec section 51): adjustment intelligence is
// strictly supplementary. A failure anywhere in this file degrades to
// "no proposal," logged, never thrown in a way that could block the
// client workspace, program review, or any canonical write.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getActiveProgramAssignment, getPendingProgramProposal, createDraftProgramVersion, getClientProgramContext } from "./programs.ts";
import { resolveUniversalProgramContent } from "../training/legacy-adapter.ts";
import { getOnboardingProgressForClient } from "./onboarding.ts";
import { resolveHealthReviewRecordForClient } from "./pain-safety.ts";
import { getOrBootstrapApprovedPlaybook } from "./playbooks.ts";
import { resolveApplicableCoachRules } from "./rule-resolution.ts";
import { resolveClientStateEvidence } from "./client-state-evidence.ts";
import { extractClientProgrammingProfile } from "../coach/programming-profile.ts";
import { buildPlaceholderProgrammingProfile } from "../coach/universal-program-generation.ts";
import { avoidedTermsForProfile } from "../coach/program-directions.ts";
import { deriveProgramWeek } from "../scheduling/enrollment.ts";
import { analyzeClientState } from "../client-state/analyze-client-state.ts";
import { selectFindingsForCoachUI } from "../client-state/presentation.ts";
import { evaluateAdjustmentForFinding, type AdjustmentEngineParams } from "../adjustment/build-proposal.ts";
import { DAYS_OF_WEEK_ORDER } from "../coach/training.ts";
import type { NoProposalReason } from "../adjustment/types.ts";
import type { AdjustmentProvenance } from "../training/types.ts";

const DEFAULT_AVAILABLE_DAYS = [DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]];

export type AdjustmentResolution = { kind: "existing_pending"; versionId: string; isAdjustment: boolean } | { kind: "no_proposal"; reason: NoProposalReason; detail: string } | { kind: "new_proposal"; versionId: string; programId: string };

/** Bounded — the last 20 draft/archived versions for this client is far
 * more than any real workspace produces in normal use, and the query is
 * indexed on workspace_id (spec section 53: no unbounded scan). */
async function findVersionWithSignature(params: { workspaceId: string; clientProfileId: string; signature: string }): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("training_program_versions").select("content").eq("workspace_id", params.workspaceId).eq("proposed_for_client_profile_id", params.clientProfileId).in("status", ["draft", "archived"]).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(`findVersionWithSignature failed: ${error.message}`);
  return (data ?? []).some((row) => (row.content as { adjustmentProvenance?: AdjustmentProvenance })?.adjustmentProvenance?.proposalSignature === params.signature);
}

/** The one real entry point: resolves (or builds) the current adjustment
 * proposal state for a client. Never creates a second pending draft when
 * one already exists (spec section 57) — the coach must resolve it
 * first, matching the exact same UI text the existing "generate another
 * proposal" flow already uses. */
export async function resolveAdjustmentProposal(params: { workspaceId: string; clientProfileId: string; coachId: string }): Promise<AdjustmentResolution> {
  try {
    const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
    if (pending) return { kind: "existing_pending", versionId: pending.versionId, isAdjustment: !!pending.content.adjustmentProvenance };

    const activeAssignment = await getActiveProgramAssignment(params.clientProfileId);
    const activeContent = activeAssignment ? resolveUniversalProgramContent(activeAssignment.content) : null;
    if (!activeAssignment || !activeContent) return { kind: "no_proposal", reason: "no_active_program", detail: "No active universal-grammar program exists for this client." };

    const [onboarding, healthReview, playbookRow, programContext, evidenceBundle] = await Promise.all([
      getOnboardingProgressForClient(params.clientProfileId),
      resolveHealthReviewRecordForClient(params.clientProfileId, params.workspaceId),
      getSupabaseServerClient().then((supabase) => supabase.from("workspaces").select("business_name").eq("id", params.workspaceId).single()),
      getClientProgramContext({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId }),
      resolveClientStateEvidence({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId }),
    ]);
    if (playbookRow.error) throw new Error(`resolveAdjustmentProposal (workspace lookup) failed: ${playbookRow.error.message}`);
    const playbook = await getOrBootstrapApprovedPlaybook({ workspaceId: params.workspaceId, businessName: playbookRow.data.business_name as string });
    const com = playbook.content.operatingModel;

    const profileResult = extractClientProgrammingProfile(onboarding, healthReview);
    const profile = "profile" in profileResult ? profileResult.profile : buildPlaceholderProgrammingProfile(DEFAULT_AVAILABLE_DAYS);
    const avoidedTerms = avoidedTermsForProfile(profile, com);

    const currentProgramWeek = programContext.enrollment ? deriveProgramWeek(programContext.enrollment, new Date().toISOString().slice(0, 10)) : null;
    const applicableRules = await resolveApplicableCoachRules({ clientProfileId: params.clientProfileId });

    const analysis = analyzeClientState(evidenceBundle);
    const presented = selectFindingsForCoachUI(analysis);

    let firstNoProposal: { reason: NoProposalReason; detail: string } | null = null;
    for (const { finding } of presented) {
      const engineParams: AdjustmentEngineParams = {
        finding,
        observations: evidenceBundle.observations,
        activeContent,
        activeProgramVersionId: activeAssignment.versionId,
        com,
        applicableRules,
        avoidedTerms,
        currentProgramWeek,
        clientProfileId: params.clientProfileId,
      };
      const result = evaluateAdjustmentForFinding(engineParams);
      if (result.outcome === "no_proposal") {
        if (!firstNoProposal) firstNoProposal = result.noProposal;
        continue;
      }

      const { proposal } = result;
      const alreadyExists = await findVersionWithSignature({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, signature: proposal.proposalSignature });
      if (alreadyExists) {
        if (!firstNoProposal) firstNoProposal = { reason: "duplicate_or_recently_rejected", detail: "An identical adjustment was already proposed and resolved against this exact program version." };
        continue;
      }

      const provenance: AdjustmentProvenance = {
        adjustmentType: proposal.adjustmentType,
        scope: proposal.scope,
        rationale: proposal.rationale,
        sourceFindingDomain: proposal.sourceFindingDomain,
        sourceFindingType: proposal.sourceFindingType,
        sourceEvidenceRefs: proposal.sourceEvidenceRefs,
        activeProgramVersionId: proposal.activeProgramVersionId,
        learnedRuleIdsUsed: proposal.learnedRuleIdsUsed,
        changeDescriptions: proposal.changeDescriptions,
        proposalSignature: proposal.proposalSignature,
      };
      const content = {
        ...proposal.content,
        name: `Adjustment — ${adjustmentTypeLabel(proposal.adjustmentType)}`,
        directionLabel: `Proposed adjustment: ${adjustmentTypeLabel(proposal.adjustmentType)}`,
        adjustmentProvenance: provenance,
        // Reuses Phase 10A's own rule-provenance resolution/UI as-is
        // (components/coach/program-proposal-review.tsx's
        // RuleProvenanceSection) rather than building a second rendering
        // path for the same underlying concept.
        ...(proposal.learnedRuleIdsUsed.length > 0 ? { appliedLearnedRuleIds: proposal.learnedRuleIdsUsed } : {}),
      };
      const created = await createDraftProgramVersion({ workspaceId: params.workspaceId, title: content.name, content, proposedForClientProfileId: params.clientProfileId });
      return { kind: "new_proposal", versionId: created.versionId, programId: created.programId };
    }

    return { kind: "no_proposal", reason: firstNoProposal?.reason ?? "stable_or_normal", detail: firstNoProposal?.detail ?? "No current finding is meaningful enough to justify an adjustment." };
  } catch (err) {
    console.error(`resolveAdjustmentProposal failed, treating as no_proposal: ${err instanceof Error ? err.message : String(err)}`);
    return { kind: "no_proposal", reason: "insufficient_evidence", detail: "Adjustment analysis could not complete." };
  }
}

export function adjustmentTypeLabel(type: string): string {
  switch (type) {
    case "schedule_redistribution":
      return "Schedule adjustment";
    case "volume_reduction":
      return "Volume adjustment";
    case "intensity_reduction":
      return "Intensity adjustment";
    case "continuous_duration_reduction":
      return "Continuous-work adjustment";
    default:
      return "Adjustment";
  }
}

/** Phase 10C — the cheapest real discovery source for the coach attention
 * queue (spec section 17): ONE bounded, workspace-scoped query over
 * already-persisted draft versions — never a per-client re-run of the
 * adjustment engine or Phase 9D analysis (spec section 18: "discover, do
 * not generate"). A pending adjustment proposal IS a real
 * training_program_versions row with status='draft' and a real
 * adjustmentProvenance (see lib/production/adjustment-proposals.ts's own
 * resolveAdjustmentProposal) — approved rows become 'published', rejected
 * rows become 'archived', so this query's own status filter already
 * excludes both without any extra logic (spec section 3).
 *
 * Staleness (spec section 3/14/29): reuses the EXACT SAME truth Phase
 * 10B's own approval staleness check uses — a proposal is only genuinely
 * actionable while content.adjustmentProvenance.activeProgramVersionId
 * still matches that client's real current active version. This is a
 * second real query, but bounded by the number of PENDING adjustment
 * drafts (typically zero or a handful), never the whole roster (spec
 * section 17's actual concern is roster-wide N+1, not this). */
export async function getPendingAdjustmentAttentionItems(workspaceId: string): Promise<{ versionId: string; clientProfileId: string; clientDisplayName: string; adjustmentTypeLabel: string; rationale: string; createdAtIso: string }[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("training_program_versions")
      .select("id, content, created_at, proposed_for_client_profile_id, client_profiles!proposed_for_client_profile_id(display_name)")
      .eq("workspace_id", workspaceId)
      .eq("status", "draft")
      .not("proposed_for_client_profile_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const candidates = (data ?? [])
      .map((row) => {
        const content = row.content as { adjustmentProvenance?: AdjustmentProvenance };
        if (!content.adjustmentProvenance) return null;
        const clientProfile = row.client_profiles as unknown as { display_name: string } | null;
        return {
          versionId: row.id as string,
          clientProfileId: row.proposed_for_client_profile_id as string,
          clientDisplayName: clientProfile?.display_name ?? "Client",
          adjustmentTypeLabel: adjustmentTypeLabel(content.adjustmentProvenance.adjustmentType),
          rationale: content.adjustmentProvenance.rationale,
          activeProgramVersionId: content.adjustmentProvenance.activeProgramVersionId,
          createdAtIso: row.created_at as string,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (candidates.length === 0) return [];

    const currentActiveByClient = new Map<string, string | null>();
    await Promise.all(
      candidates.map(async (c) => {
        if (currentActiveByClient.has(c.clientProfileId)) return;
        const { data: assignment } = await supabase.from("program_assignments").select("program_version_id").eq("client_profile_id", c.clientProfileId).eq("status", "active").maybeSingle();
        currentActiveByClient.set(c.clientProfileId, (assignment?.program_version_id as string | null) ?? null);
      })
    );

    return candidates
      .filter((c) => currentActiveByClient.get(c.clientProfileId) === c.activeProgramVersionId)
      .map((c) => ({ versionId: c.versionId, clientProfileId: c.clientProfileId, clientDisplayName: c.clientDisplayName, adjustmentTypeLabel: c.adjustmentTypeLabel, rationale: c.rationale, createdAtIso: c.createdAtIso }));
  } catch (err) {
    console.error(`getPendingAdjustmentAttentionItems failed, showing zero adjustment attention items: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
