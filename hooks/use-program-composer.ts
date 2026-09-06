"use client";

import { useCallback, useMemo } from "react";
import { useCoachClientView } from "@/hooks/use-coach-data";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { useAiAuthority } from "@/hooks/use-ai-authority";
import { getActivationGenerationsForClient, getCommunicationPolicy } from "@/lib/coach/repository";
import { resolveEffectiveAiAuthorityLevel, resolveAiActionDisposition, AI_AUTHORITY_LEVEL_LABELS } from "@/lib/coach/ai-authority";
import { nextPlatformId } from "@/lib/coach/platform-store";
import {
  approveActivation,
  generateProgramDirections,
  generateFullProgramFromDirection,
  applyProgramRevisionApproval,
  healthReviewPermitsActivation,
  latestGenerationForClient,
  type ActivationGenerationRecord,
} from "@/lib/coach/activation-lifecycle";
import { interpretRevisionInstruction, applyProgramRevision, type ProgramRevisionRecord, type RevisionPlan } from "@/lib/coach/program-revision";
import { detectAdaptationProposals, applyAdaptationProposal, persistAdaptationProposalReview, type ProgramAdaptationProposal } from "@/lib/coach/program-adaptation";
import { resolveReviewRequest } from "@/lib/coach/review-lifecycle";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import { resolveClientLocalDateIso, resolveBrowserTimeZone } from "@/lib/shared/local-date";
import { extractClientSnapshot, equipmentForClient } from "@/lib/coach/activation-generation";
import type { EquipmentTag } from "@/lib/coach/exercise-library";
import type { ClientAssignedProgram, ReviewRequest } from "@/lib/types";
import type { ClientProfileId } from "@/lib/tenancy/types";

/**
 * The Program Composer's one data + action source for a single client
 * (spec Phase 5.5 Part 4) — the two-stage flow (directions, then exactly
 * one full program) for a not-yet-active client, and conversational
 * revision + adaptation proposals for an already-active one. Joins the
 * same coach-workspace/Coach Operating Model/AI-authority data
 * useActivationStudio already does, plus the new Phase 5.5 engines.
 */
export function useProgramComposer(clientId: ClientProfileId) {
  const clientView = useCoachClientView(clientId);
  const com = useCoachOperatingModel();
  const authority = useAiAuthority();

  const generations = getActivationGenerationsForClient(clientView.platform, clientId);
  const latest = latestGenerationForClient(generations, clientId);
  const communicationPolicy = getCommunicationPolicy(clientView.platform, clientId);
  const healthReviewResolved = healthReviewPermitsActivation(clientView.platform, clientId);
  const effectiveLevel = clientView.coachId ? resolveEffectiveAiAuthorityLevel(authority.settings, clientId, "training_generation") : "copilot";

  const isActiveClient = clientView.lifecycle === "active";
  const assignedProgram = clientView.clientAppState?.assignedProgram ?? null;
  const currentWeekNumber = clientView.clientAppState
    ? (deriveProgramWeek(clientView.clientAppState.programEnrollment, clientView.clientAppState.dateIso) ?? 1)
    : 1;
  const equipment: EquipmentTag[] = useMemo(() => {
    const snapshotResult = clientView.onboarding ? extractClientSnapshot(clientView.onboarding) : null;
    return snapshotResult && "snapshot" in snapshotResult ? equipmentForClient(snapshotResult.snapshot) : ["bodyweight"];
  }, [clientView.onboarding]);

  const runDirections = useCallback(() => {
    if (!clientView.coachId) return null;
    const nowIso = new Date().toISOString();
    const result = generateProgramDirections({
      clientId,
      workspaceId: clientView.workspaceId,
      coachId: clientView.coachId,
      onboarding: clientView.onboarding,
      activeCoachOperatingModel: com.activeModel,
      healthReview: clientView.healthReview,
      healthReviewResolved,
      existingRecords: generations,
      nowIso,
    });
    clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: result.record });
    return result.record;
  }, [clientId, clientView, com.activeModel, healthReviewResolved, generations]);

  const buildFullProgram = useCallback(
    (record: ActivationGenerationRecord, directionId: string, combineWithDirectionId?: string) => {
      if (!clientView.coachId || !com.activeModel) return null;
      const nowIso = new Date().toISOString();
      const updated = generateFullProgramFromDirection({
        record,
        directionId,
        combineWithDirectionId,
        clientId,
        workspaceId: clientView.workspaceId,
        coachId: clientView.coachId,
        com: com.activeModel,
        nowIso,
      });
      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: updated });
      return updated;
    },
    [clientId, clientView, com.activeModel]
  );

  const approveInitial = useCallback(
    (record: ActivationGenerationRecord) => {
      if (!clientView.coachId || !clientView.client || !com.activeModel) return null;
      const nowIso = new Date().toISOString();
      const timeZone = com.activeModel.operationalContext.timeZone || resolveBrowserTimeZone();
      const startDateIso = resolveClientLocalDateIso(new Date(), timeZone);
      const clientFirstName = clientView.client.name.split(" ")[0];
      const coachName = clientView.activeContext.coachProfile?.displayName ?? "Your coach";
      const aiMayRespondDirectly = resolveAiActionDisposition(resolveEffectiveAiAuthorityLevel(authority.settings, clientId, "communication"), "messaging_nudge") === "auto_execute";

      const result = approveActivation({
        record,
        client: clientView.client,
        approvedByCoachId: clientView.coachId,
        aiAuthorityLevelAtApproval: effectiveLevel,
        clientFirstName,
        coachName,
        businessName: com.businessName,
        com: com.activeModel,
        aiMayRespondDirectlyForRoutine: aiMayRespondDirectly,
        assignWeeklyCheckIn: true,
        startDateIso,
        nowIso,
      });

      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: result.updatedRecord });
      clientView.dispatchPlatform({ type: "SAVE_COMMUNICATION_POLICY", policy: result.communicationPolicy });
      clientView.dispatchPlatform({ type: "SET_CLIENT_LIFECYCLE", clientId, workspaceId: clientView.workspaceId, status: "active", nowIso });
      return result;
    },
    [clientView, com.activeModel, com.businessName, authority.settings, clientId, effectiveLevel]
  );

  // -- Pre-approval conversational revision (spec Part 5, applied to the
  //    freshly generated but not-yet-assigned program) --------------------

  const previewDraftRevision = useCallback(
    (program: ClientAssignedProgram, instruction: string) => {
      const plan = interpretRevisionInstruction(instruction);
      // Nothing has been assigned/started yet — every week is eligible.
      const { revisedProgram, changes } = applyProgramRevision(program, plan, 0, equipment);
      return { plan, revisedProgram, changes };
    },
    [equipment]
  );

  const confirmDraftRevision = useCallback(
    (record: ActivationGenerationRecord, instruction: string, plan: RevisionPlan, revisedProgram: ClientAssignedProgram, changes: ReturnType<typeof applyProgramRevision>["changes"]) => {
      if (!clientView.coachId) return null;
      const nowIso = new Date().toISOString();
      const originalOption = record.trainingOptions[0];
      if (!originalOption) return null;
      const revisionRecord: ProgramRevisionRecord = {
        id: nextPlatformId("revision"),
        clientId,
        workspaceId: clientView.workspaceId,
        coachId: clientView.coachId,
        instruction,
        plan,
        changes,
        programBeforeRevision: originalOption.program,
        programAfterRevision: revisedProgram,
        createdAtIso: nowIso,
        confirmedAtIso: nowIso,
      };
      const updated: ActivationGenerationRecord = {
        ...record,
        trainingOptions: [{ ...originalOption, program: revisedProgram }],
        revisions: [...(record.revisions ?? []), revisionRecord],
        updatedAtIso: nowIso,
      };
      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: updated });
      return updated;
    },
    [clientView, clientId]
  );

  // -- Active-client conversational revision (spec Part 5/6) ---------------

  const previewRevision = useCallback(
    (instruction: string): { plan: RevisionPlan; revisedProgram: ClientAssignedProgram; changes: ReturnType<typeof applyProgramRevision>["changes"] } | null => {
      if (!assignedProgram) return null;
      const plan = interpretRevisionInstruction(instruction);
      const { revisedProgram, changes } = applyProgramRevision(assignedProgram, plan, currentWeekNumber, equipment);
      return { plan, revisedProgram, changes };
    },
    [assignedProgram, currentWeekNumber, equipment]
  );

  const confirmRevision = useCallback(
    (instruction: string, plan: RevisionPlan, revisedProgram: ClientAssignedProgram, changes: ReturnType<typeof applyProgramRevision>["changes"]) => {
      if (!clientView.client || !clientView.coachId || !assignedProgram) return null;
      const nowIso = new Date().toISOString();
      const coachName = clientView.activeContext.coachProfile?.displayName ?? "Your coach";
      const revisionRecord: ProgramRevisionRecord = {
        id: nextPlatformId("revision"),
        clientId,
        workspaceId: clientView.workspaceId,
        coachId: clientView.coachId,
        instruction,
        plan,
        changes,
        programBeforeRevision: assignedProgram,
        programAfterRevision: revisedProgram,
        createdAtIso: nowIso,
        confirmedAtIso: nowIso,
      };

      applyProgramRevisionApproval({
        client: clientView.client,
        revisedProgram,
        approvedByCoachId: clientView.coachId,
        coachName,
        clientMessage: `${coachName} approved an update to your upcoming training.`,
      });

      if (latest) {
        clientView.dispatchPlatform({
          type: "SAVE_ACTIVATION_GENERATION",
          record: { ...latest, revisions: [...(latest.revisions ?? []), revisionRecord], updatedAtIso: nowIso },
        });
      }

      return revisionRecord;
    },
    [clientView, clientId, assignedProgram, latest]
  );

  // -- Adaptive progression proposals (spec Part 7) -------------------------

  const existingProposals = clientView.platform.adaptationProposals.filter((p) => p.clientId === clientId);
  const activeProposalReviews = (clientView.clientAppState?.reviewRequests ?? []).filter((r) => r.kind === "adaptation-proposal" && !r.resolved);

  const checkForAdaptationProposals = useCallback((): ProgramAdaptationProposal[] => {
    if (!clientView.coachId || !com.activeModel || !assignedProgram || !clientView.clientAppState) return [];
    const nowIso = new Date().toISOString();
    const proposals = detectAdaptationProposals({
      clientId,
      workspaceId: clientView.workspaceId,
      coachId: clientView.coachId,
      reviewRequests: clientView.clientAppState.reviewRequests,
      existingProposals,
      assignedProgram,
      currentWeekNumber,
      com: com.activeModel,
      authoritySettings: authority.settings,
      nowIso,
      nextId: () => nextPlatformId("adaptation"),
    });

    for (const proposal of proposals) {
      clientView.dispatchPlatform({ type: "SAVE_ADAPTATION_PROPOSAL", proposal });
      persistAdaptationProposalReview(proposal, nowIso, () => nextPlatformId("review"));
    }
    return proposals;
  }, [clientView, com.activeModel, assignedProgram, existingProposals, currentWeekNumber, authority.settings, clientId]);

  /** Coach-initiated apply for a proposal that required approval (or a
   * confirmation of one OPTIM already auto-applied) — writes the real
   * program change via the same narrow active-client revision path as a
   * conversational revision, then resolves the linked ReviewRequest
   * through the existing review lifecycle (never a bespoke resolution
   * path). */
  const applyProposal = useCallback(
    (proposal: ProgramAdaptationProposal, review: ReviewRequest) => {
      if (!clientView.client || !clientView.coachId || !assignedProgram) return false;
      const nowIso = new Date().toISOString();
      const coachName = clientView.activeContext.coachProfile?.displayName ?? "Your coach";
      const { revisedProgram } = applyAdaptationProposal({
        program: assignedProgram,
        proposal: { ...proposal, aiMayExecute: true },
        currentWeekNumber,
        equipment,
      });

      applyProgramRevisionApproval({
        client: clientView.client,
        revisedProgram,
        approvedByCoachId: clientView.coachId,
        coachName,
        clientMessage: `${coachName} approved an update to your upcoming training.`,
      });

      resolveReviewRequest({
        clientId,
        reviewId: review.id,
        resolutionAction: "resolved",
        resolutionNote: `Applied: ${proposal.proposedChangeSummary}`,
        resolvedByCoachId: clientView.coachId,
        resolvedByCoachName: coachName,
        nowIso,
      });
      return true;
    },
    [clientView, assignedProgram, currentWeekNumber, equipment, clientId]
  );

  const dismissProposal = useCallback(
    (review: ReviewRequest) => {
      if (!clientView.coachId) return false;
      const coachName = clientView.activeContext.coachProfile?.displayName ?? "Your coach";
      resolveReviewRequest({
        clientId,
        reviewId: review.id,
        resolutionAction: "reviewed_no_change",
        resolutionNote: "Reviewed — no program change needed.",
        resolvedByCoachId: clientView.coachId,
        resolvedByCoachName: coachName,
        nowIso: new Date().toISOString(),
      });
      return true;
    },
    [clientView, clientId]
  );

  return {
    ...clientView,
    activeModel: com.activeModel,
    authoritySettings: authority.settings,
    effectiveLevel,
    effectiveLevelLabel: AI_AUTHORITY_LEVEL_LABELS[effectiveLevel],
    healthReviewResolved,
    generations,
    latest,
    communicationPolicy,
    isActiveClient,
    assignedProgram,
    currentWeekNumber,
    equipment,
    runDirections,
    buildFullProgram,
    approveInitial,
    previewDraftRevision,
    confirmDraftRevision,
    previewRevision,
    confirmRevision,
    existingProposals,
    activeProposalReviews,
    checkForAdaptationProposals,
    applyProposal,
    dismissProposal,
  };
}
