"use client";

// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The Supabase-mode entry point for onboarding — bootstraps this
// authenticated client's real identity/progress via
// app/actions/onboarding.ts, then hands it to the SAME OnboardingWizard
// component demo mode uses (see that file's own OnboardingWizardLiveSource
// doc) through its `live` prop. Never imports a Server Action's
// implementation or lib/supabase/* directly — only the two typed actions.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import {
  getMyOnboardingBootstrapAction,
  saveOnboardingStepAction,
  completeOnboardingAction,
  type LiveOnboardingBootstrap,
} from "@/app/actions/onboarding";

export function LiveOnboardingWizard({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<LiveOnboardingBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyOnboardingBootstrapAction()
      .then((result) => {
        if (cancelled) return;
        // The URL's clientId is never trusted as the identity to act on
        // (getMyOnboardingBootstrapAction resolves the caller's own
        // client_profiles row from the authenticated session only) — this
        // just catches the case where the two disagree (a stale/foreign
        // link) and shows an honest message rather than silently rendering
        // one client's onboarding under another client's URL.
        if (result.clientId !== clientId) {
          setError("This onboarding link doesn't match your account.");
          return;
        }
        setBootstrap(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load onboarding.");
      });
    return () => {
      cancelled = true;
    };
    // Deliberately empty deps: this bootstrap is read once on mount. Each
    // subsequent step is written through saveOnboardingStepAction directly
    // (see the `live` prop below) rather than re-fetched — the wizard's own
    // local draftAnswers state is the source of truth for the rest of this
    // session, exactly like the demo/platform-store path already works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-near-black px-6 text-center">
        <p className="text-sm text-neutral">{error}</p>
      </div>
    );
  }

  return (
    <OnboardingWizard
      clientId={clientId}
      live={{
        isReady: bootstrap !== null,
        clientDisplayName: bootstrap?.clientDisplayName ?? "",
        coachDisplayName: bootstrap?.coachDisplayName ?? "your coach",
        coachAvatarInitials: bootstrap?.coachAvatarInitials ?? null,
        // Only a real saved row counts as progress to resume — a client who
        // hasn't started gets the welcome screen.
        existingProgress:
          bootstrap && bootstrap.hasProgress
            ? { currentStepIndex: bootstrap.currentStepIndex, answers: bootstrap.answers, completedAtIso: bootstrap.completedAtIso ?? undefined }
            : null,
        onSaveStep: (params) => saveOnboardingStepAction(params),
        onComplete: (finalAnswers) => completeOnboardingAction(finalAnswers),
        onCompleteNavigate: () => router.push(`/setup-status/${clientId}`),
      }}
    />
  );
}
