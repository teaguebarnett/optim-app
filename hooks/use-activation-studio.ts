"use client";

import { useCallback } from "react";
import { useCoachClientView } from "@/hooks/use-coach-data";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { useAiAuthority } from "@/hooks/use-ai-authority";
import { getActivationGenerationsForClient, getCommunicationPolicy } from "@/lib/coach/repository";
import { resolveEffectiveAiAuthorityLevel, resolveAiActionDisposition, AI_AUTHORITY_LEVEL_LABELS } from "@/lib/coach/ai-authority";
import {
  approveActivation,
  generateActivation,
  healthReviewPermitsActivation,
  latestGenerationForClient,
  selectActivationOptions,
  type ActivationGenerationRecord,
} from "@/lib/coach/activation-lifecycle";
import { resolveClientLocalDateIso, resolveBrowserTimeZone } from "@/lib/shared/local-date";
import type { ClientProfileId } from "@/lib/tenancy/types";

/**
 * The Activation Studio's one data + action source for a single client —
 * joins coach-workspace data, the active Coach Operating Model, AI
 * Authority, and this client's real activation-generation history (see
 * lib/coach/activation-lifecycle.ts).
 */
export function useActivationStudio(clientId: ClientProfileId) {
  const clientView = useCoachClientView(clientId);
  const com = useCoachOperatingModel();
  const authority = useAiAuthority();

  const generations = getActivationGenerationsForClient(clientView.platform, clientId);
  const latest = latestGenerationForClient(generations, clientId);
  const communicationPolicy = getCommunicationPolicy(clientView.platform, clientId);
  const healthReviewResolved = healthReviewPermitsActivation(clientView.platform, clientId);
  const effectiveLevel = clientView.coachId ? resolveEffectiveAiAuthorityLevel(authority.settings, clientId, "training_generation") : "copilot";
  const disposition = resolveAiActionDisposition(effectiveLevel, "activation_approval");

  const runGeneration = useCallback(
    (regenerationInstruction?: string) => {
      if (!clientView.coachId) return null;
      const nowIso = new Date().toISOString();
      const result = generateActivation({
        clientId,
        workspaceId: clientView.workspaceId,
        coachId: clientView.coachId,
        onboarding: clientView.onboarding,
        activeCoachOperatingModel: com.activeModel,
        healthReviewResolved,
        existingRecords: generations,
        regenerationInstruction,
        nowIso,
      });
      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: result.record });
      return result.record;
    },
    [clientId, clientView, com.activeModel, healthReviewResolved, generations]
  );

  const selectOptions = useCallback(
    (record: ActivationGenerationRecord, trainingOptionId: string, nutritionOptionId: string | null) => {
      const nowIso = new Date().toISOString();
      const updated = selectActivationOptions(record, trainingOptionId, nutritionOptionId, nowIso);
      clientView.dispatchPlatform({ type: "SAVE_ACTIVATION_GENERATION", record: updated });
      return updated;
    },
    [clientView]
  );

  const approve = useCallback(
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

  return {
    ...clientView,
    activeModel: com.activeModel,
    authoritySettings: authority.settings,
    effectiveLevel,
    effectiveLevelLabel: AI_AUTHORITY_LEVEL_LABELS[effectiveLevel],
    disposition,
    healthReviewResolved,
    generations,
    latest,
    communicationPolicy,
    runGeneration,
    selectOptions,
    approve,
  };
}
