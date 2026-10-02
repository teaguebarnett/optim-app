"use server";

// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The client-callable surface over lib/production/onboarding.ts — mirrors
// app/actions/production-programs.ts's own "the only file client components
// import from" discipline: components/onboarding/live-onboarding-wizard.tsx
// never imports lib/production/onboarding.ts or lib/supabase/* directly.

import { getMyOnboardingProgress, saveOnboardingStep, completeOnboarding } from "../../lib/production/onboarding";
import { getOwnLifecycleStatus, type OwnLifecycleStatus } from "../../lib/production/roster";
import type { OnboardingStepAnswers, OnboardingStepId } from "../../lib/coach/types";

export async function getMyLifecycleStatusAction(): Promise<OwnLifecycleStatus> {
  return getOwnLifecycleStatus();
}

export interface LiveOnboardingBootstrap {
  clientId: string;
  workspaceId: string;
  clientDisplayName: string;
  coachDisplayName: string;
  coachAvatarInitials: string | null;
  currentStepIndex: number;
  answers: Partial<Record<OnboardingStepId, OnboardingStepAnswers>>;
  completedAtIso: string | null;
  /** Gate 4.0B — whether a progress row exists at all. False = nothing
   * started yet: the client sees the welcome, never a "resumed" chapter. */
  hasProgress: boolean;
}

export async function getMyOnboardingBootstrapAction(): Promise<LiveOnboardingBootstrap> {
  const { identity, progress } = await getMyOnboardingProgress();
  return {
    clientId: identity.clientProfileId,
    workspaceId: identity.workspaceId,
    clientDisplayName: identity.clientDisplayName,
    coachDisplayName: identity.coachDisplayName,
    coachAvatarInitials: identity.coachAvatarInitials,
    currentStepIndex: progress?.currentStepIndex ?? 0,
    answers: progress?.answers ?? {},
    completedAtIso: progress?.completedAtIso ?? null,
    hasProgress: progress !== null,
  };
}

export async function saveOnboardingStepAction(params: {
  stepId: OnboardingStepId;
  answers: OnboardingStepAnswers;
  nextStepIndex: number;
}): Promise<void> {
  await saveOnboardingStep(params);
}

export async function completeOnboardingAction(finalAnswers: OnboardingStepAnswers): Promise<void> {
  await completeOnboarding(finalAnswers);
}
