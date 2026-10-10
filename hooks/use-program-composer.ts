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
  selectNutritionPrescription as selectNutritionPrescriptionForRecord,
  applyNutritionRevisionApproval,
  healthReviewPermitsActivation,
  latestGenerationForClient,
  ActivationPersistenceError,
  type ActivationGenerationRecord,
  type ApproveActivationResult,
} from "@/lib/coach/activation-lifecycle";
import { interpretRevisionInstruction, applyProgramRevision, type ProgramRevisionRecord, type RevisionPlan } from "@/lib/coach/program-revision";
import {
  interpretNutritionRevisionInstruction,
  applyNutritionRevision,
  type CompleteNutritionPrescription,
  type NutritionRevisionPlan,
  type NutritionRevisionRecord,
} from "@/lib/coach/nutrition-directions";
import { detectAdaptationProposals, applyAdaptationProposal, persistAdaptationProposalReview, type ProgramAdaptationProposal } from "@/lib/coach/program-adaptation";
import { resolveReviewRequest } from "@/lib/coach/review-lifecycle";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import { resolveClientLocalDateIso, resolveBrowserTimeZone } from "@/lib/shared/local-date";
import { extractClientSnapshot, equipmentForClient } from "@/lib/coach/activation-generation";
import type { EquipmentTag } from "@/lib/coach/exercise-library";
import type { ClientAssignedProgram, ReviewRequest } from "@/lib/types";
import type { ClientProfileId } from "@/lib/tenancy/types";

/** Phase 5.6A.3 — approveInitial's real, honest outcome: either the
 * verified-persisted result, or a real error the coach can act on. Never a
 * bare boolean/null that loses the actual reason a failure happened. */
export type ApproveInitialOutcome = { ok: true; result: ApproveActivationResult } | { ok: false; error: string };

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
    (record: ActivationGenerationRecord): ApproveInitialOutcome => {
      if (!clientView.coachId || !clientView.client || !com.activeModel) return { ok: false, error: "This workspace isn't ready to approve yet — reload and try again." };
      const nowIso = new Date().toISOString();
      const timeZone = com.activeModel.operationalContext.timeZone || resolveBrowserTimeZone();
      // Phase 5.6A.3 — the coach's own real, previously-chosen intended
      // start date (see lib/coach/types.ts's ClientIntendedProgram, set at
      // "Add client" time) is the one canonical start date. Falling back to
      // "today" only when a client somehow reached approval with no
      // intended date ever recorded at all (a manually-built legacy path) —
      // never silently substituting today's date over a real coach choice,
      // which is exactly the bug that made a future-dated program start
      // immediately on approval day instead of its real start date.
      const startDateIso = clientView.intendedProgram?.intendedStartDateIso ?? resolveClientLocalDateIso(new Date(), timeZone);
      const clientFirstName = clientView.client.name.split(" ")[0];
      const coachName = clientView.activeContext.coachProfile?.displayName ?? "Your coach";
      const aiMayRespondDirectly = resolveAiActionDisposition(resolveEffectiveAiAuthorityLevel(authority.settings, clientId, "communication"), "messaging_nudge") === "auto_execute";

      let result;
      try {
        result = approveActivation({
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
      } catch (err) {
        // Phase 5.6A.3 — approval must never be marked complete when the
        // real client-side write can't be verified (see
        // ActivationPersistenceError's own doc): no dispatch at all here,
        // so the generation record stays exactly at "ready_for_review"/
        // "revision_prepared" and the client's lifecycle never advances.
        // The plan stays visibly awaiting approval — never a false
        // "activated" state — and the coach sees a real, actionable error.
        const message = err instanceof ActivationPersistenceError ? err.message : "Something went wrong while approving this plan. Please try again.";
        return { ok: false, error: message };
      }

      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: result.updatedRecord });
      clientView.dispatchPlatform({ type: "SAVE_COMMUNICATION_POLICY", policy: result.communicationPolicy });
      clientView.dispatchPlatform({ type: "SET_CLIENT_LIFECYCLE", clientId, workspaceId: clientView.workspaceId, status: "active", nowIso });
      return { ok: true, result };
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

  // -- Nutrition side of the unified OPTIM Plan (Phase 5.5A Part 8) --------

  const selectNutrition = useCallback(
    (record: ActivationGenerationRecord, nutritionOptionId: string) => {
      if (!com.activeModel) return null;
      const nowIso = new Date().toISOString();
      const updated = selectNutritionPrescriptionForRecord({ record, nutritionOptionId, com: com.activeModel, nowIso });
      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: updated });
      return updated;
    },
    [clientView, com.activeModel]
  );

  /**
   * The one auto-pilot pipeline: directions -> best-fit full program ->
   * best-fit nutrition, in one call. Phase 5.5A's autonomous-authority
   * "Generate my recommended plan" button and Phase 5.6A's automatic
   * post-intake draft preparation both call this SAME function rather than
   * keeping two parallel implementations that could drift — see this
   * phase's brief: "Reuse the existing Phase 5.5A generation engine...
   * Generation must be idempotent and must not create duplicate plans."
   * Safe to call more than once for the same client: runDirections/
   * buildFullProgram are both idempotent (same idempotency key, or same
   * record id on rebuild), so a redundant call just re-confirms the same
   * record rather than creating a second one.
   */
  const runAutoGeneration = useCallback((): ActivationGenerationRecord | null => {
    const directionsRecord = runDirections();
    if (!directionsRecord?.directions?.length) return directionsRecord;
    if (directionsRecord.trainingOptions.length > 0) return directionsRecord;
    const bestFit = directionsRecord.directions.find((d) => d.kind === "best_fit") ?? directionsRecord.directions[0];
    const withProgram = buildFullProgram(directionsRecord, bestFit.id);
    if (withProgram?.state === "ready_for_review" && withProgram.nutritionOptions.length && !withProgram.selectedNutritionOptionId) {
      const bestFitNutrition = withProgram.nutritionOptions.find((o) => o.kind === "best_fit") ?? withProgram.nutritionOptions[0];
      return selectNutrition(withProgram, bestFitNutrition.id) ?? withProgram;
    }
    return withProgram;
  }, [runDirections, buildFullProgram, selectNutrition]);

  const previewDraftNutritionRevision = useCallback((prescription: CompleteNutritionPrescription, instruction: string, weightLb: number, baseProteinGPerLb: number) => {
    const plan = interpretNutritionRevisionInstruction(instruction);
    const { revisedPrescription, changes } = applyNutritionRevision(prescription, plan, weightLb, baseProteinGPerLb);
    return { plan, revisedPrescription, changes };
  }, []);

  const confirmDraftNutritionRevision = useCallback(
    (record: ActivationGenerationRecord, instruction: string, plan: NutritionRevisionPlan, revisedPrescription: CompleteNutritionPrescription, changes: NutritionRevisionRecord["changes"]) => {
      if (!clientView.coachId || !record.selectedNutritionPrescription) return null;
      const nowIso = new Date().toISOString();
      const revisionRecord: NutritionRevisionRecord = {
        id: nextPlatformId("nutrition-revision"),
        clientId,
        workspaceId: clientView.workspaceId,
        coachId: clientView.coachId,
        instruction,
        plan,
        changes,
        prescriptionBeforeRevision: record.selectedNutritionPrescription,
        prescriptionAfterRevision: revisedPrescription,
        createdAtIso: nowIso,
        confirmedAtIso: nowIso,
      };
      const updated: ActivationGenerationRecord = {
        ...record,
        selectedNutritionPrescription: revisedPrescription,
        nutritionRevisions: [...(record.nutritionRevisions ?? []), revisionRecord],
        updatedAtIso: nowIso,
      };
      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: updated });
      return updated;
    },
    [clientView, clientId]
  );

  const assignedNutritionPlan = clientView.clientAppState?.assignedNutritionPlan ?? null;

  const previewNutritionRevision = useCallback(
    (instruction: string) => {
      // The quick macro-revision tool edits complete four-number targets only; a method-based plan (U3A — e.g. calories
      // and protein, habits) is revised through coach review instead, never by inventing the missing targets.
      if (!assignedNutritionPlan || !assignedNutritionPlan.targets) return null;
      const targets = assignedNutritionPlan.targets;
      const plan = interpretNutritionRevisionInstruction(instruction);
      const prescription: CompleteNutritionPrescription = {
        sourceStrategyKind: "best_fit",
        label: assignedNutritionPlan.sourceStrategyLabel,
        targets,
        usesTrainingRestSplit: assignedNutritionPlan.usesTrainingRestSplit,
        trainingDayTargets: assignedNutritionPlan.trainingDayTargets,
        restDayTargets: assignedNutritionPlan.restDayTargets,
        mealsPerDay: assignedNutritionPlan.mealsPerDay,
        mealStructureDescription: assignedNutritionPlan.mealStructureDescription,
        preTrainingGuidance: assignedNutritionPlan.preTrainingGuidance,
        postTrainingGuidance: assignedNutritionPlan.postTrainingGuidance,
        hydrationOzPerDay: assignedNutritionPlan.hydrationOzPerDay,
        fiberGramsPerDay: assignedNutritionPlan.fiberGramsPerDay,
        substitutionGuidance: assignedNutritionPlan.substitutionGuidance,
        supplementGuidance: assignedNutritionPlan.supplementGuidance,
        adherenceStrategy: assignedNutritionPlan.adherenceStrategy,
        metricsToMonitor: assignedNutritionPlan.metricsToMonitor,
        weeklyAdjustmentRule: assignedNutritionPlan.weeklyAdjustmentRule,
        conditionsPreventingAutoAdjustment: [],
        requiresCoachApproval: false,
        assumptions: [],
        whyItFits: "",
        tradeoff: "",
        clientFactsUsed: [],
        coachingRulesUsed: [],
      };
      const weightLb = clientView.onboarding?.answers.about_you?.weightLb;
      const baseProteinGPerLb = com.activeModel?.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight ?? 1;
      const { revisedPrescription, changes } = applyNutritionRevision(prescription, plan, typeof weightLb === "number" ? weightLb : 180, baseProteinGPerLb);
      return { plan, revisedPrescription, changes };
    },
    [assignedNutritionPlan, clientView.onboarding, com.activeModel]
  );

  const confirmNutritionRevision = useCallback(
    (revisedPrescription: CompleteNutritionPrescription) => {
      if (!clientView.client || !clientView.coachId) return null;
      const coachName = clientView.activeContext.coachProfile?.displayName ?? "Your coach";
      applyNutritionRevisionApproval({
        client: clientView.client,
        revisedPrescription,
        approvedByCoachId: clientView.coachId,
        coachName,
        clientMessage: `${coachName} approved an update to your nutrition targets.`,
      });
      return true;
    },
    [clientView]
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
    runAutoGeneration,
    approveInitial,
    previewDraftRevision,
    confirmDraftRevision,
    previewRevision,
    confirmRevision,
    selectNutrition,
    previewDraftNutritionRevision,
    confirmDraftNutritionRevision,
    assignedNutritionPlan,
    previewNutritionRevision,
    confirmNutritionRevision,
    existingProposals,
    activeProposalReviews,
    checkForAdaptationProposals,
    applyProposal,
    dismissProposal,
  };
}
