"use client";

import { useCallback } from "react";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { getActiveCoachOperatingModel, getCoachOnboardingProgress, getCoachOperatingModelVersions } from "@/lib/coach/repository";
import { applyCoachAnswersToModel, computeProgressSummary, pruneAnswersToVisibleQuestions, type CoachOnboardingProgress } from "@/lib/coach/coach-onboarding-engine";
import { createDefaultCoachOperatingModel, type CoachOperatingModel } from "@/lib/coach/operating-model";
import type { CoachOnboardingAnswers } from "@/lib/coach/coach-onboarding-questions";

/**
 * The one place a coach screen reads/writes coach-onboarding progress and
 * the Coach Operating Model — mirrors useAiAuthority's join pattern.
 * `answers` is the coach's real, in-progress (or completed) answer bag,
 * persisted after every meaningful change via saveAnswers (this phase's
 * brief §III.7: "Save after every meaningful answer").
 */
export function useCoachOperatingModel() {
  const { platform, dispatchPlatform, coachId, workspaceId, activeContext } = useCoachWorkspace();

  const progress = coachId ? getCoachOnboardingProgress(platform, coachId) : null;
  const answers: CoachOnboardingAnswers = progress?.answers ?? {};
  const activeModel = coachId ? getActiveCoachOperatingModel(platform, coachId) : null;
  const versions = coachId ? getCoachOperatingModelVersions(platform, coachId) : [];
  const progressSummary = computeProgressSummary(answers);
  const businessName = activeContext.branding.businessName;

  const saveAnswers = useCallback(
    (nextAnswers: CoachOnboardingAnswers) => {
      if (!coachId) return;
      const nowIso = new Date().toISOString();
      const pruned = pruneAnswersToVisibleQuestions(nextAnswers);
      const next: CoachOnboardingProgress = { coachId, workspaceId, answers: pruned, completedAtIso: progress?.completedAtIso, updatedAtIso: nowIso };
      dispatchPlatform({ type: "SAVE_COACH_ONBOARDING_PROGRESS", progress: next });
    },
    [coachId, workspaceId, progress?.completedAtIso, dispatchPlatform]
  );

  /** Builds (or continues) the draft model from current answers, without
   * activating it — used by every chapter screen so the Review chapter's
   * live preview always reflects the coach's latest answers even before
   * they've reached Review. Never persisted directly; only
   * confirmAndActivate below writes a real model version. */
  const buildDraftModel = useCallback((): CoachOperatingModel => {
    const base = versions[0] ?? createDefaultCoachOperatingModel({ coachId: coachId ?? "", workspaceId, nowIso: new Date().toISOString(), businessName });
    return applyCoachAnswersToModel(base, answers, new Date().toISOString());
  }, [versions, coachId, workspaceId, businessName, answers]);

  const confirmAndActivate = useCallback(
    (model: CoachOperatingModel) => {
      if (!coachId) return;
      const nowIso = new Date().toISOString();
      const nextVersion = (versions[0]?.version ?? 0) + 1;
      dispatchPlatform({ type: "SAVE_COACH_OPERATING_MODEL", model: { ...model, coachId, workspaceId, version: nextVersion, status: "active", createdAtIso: nowIso, activatedAtIso: nowIso } });
      dispatchPlatform({
        type: "SAVE_COACH_ONBOARDING_PROGRESS",
        progress: { coachId, workspaceId, answers: pruneAnswersToVisibleQuestions(answers), completedAtIso: progress?.completedAtIso ?? nowIso, updatedAtIso: nowIso },
      });
    },
    [coachId, workspaceId, versions, answers, progress?.completedAtIso, dispatchPlatform]
  );

  /** Saves an in-progress DRAFT version (e.g. after confirming one inference
   * in Chapter 9) without activating it yet — status stays "draft" so
   * generation never reads it as the effective model. */
  const saveDraft = useCallback(
    (model: CoachOperatingModel) => {
      if (!coachId) return;
      const nowIso = new Date().toISOString();
      const version = versions[0]?.status === "draft" ? versions[0].version : (versions[0]?.version ?? 0) + 1;
      dispatchPlatform({ type: "SAVE_COACH_OPERATING_MODEL", model: { ...model, coachId, workspaceId, version, status: "draft", createdAtIso: model.createdAtIso ?? nowIso } });
    },
    [coachId, workspaceId, versions, dispatchPlatform]
  );

  return { coachId, workspaceId, businessName, progress, answers, saveAnswers, activeModel, versions, progressSummary, buildDraftModel, confirmAndActivate, saveDraft };
}
