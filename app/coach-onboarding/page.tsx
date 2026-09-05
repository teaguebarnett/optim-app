"use client";

import { usePrototypeState } from "@/hooks/use-prototype-state";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import { RequireDesktopViewport } from "@/components/coach-onboarding/require-desktop-viewport";
import { CoachOnboardingWizard } from "@/components/coach-onboarding/coach-onboarding-wizard";

/**
 * Phase 5.4A — the dedicated coach onboarding route. Deliberately sits
 * OUTSIDE /coach/* so it never renders inside CoachShell's horizontal-nav
 * chrome (see lib/coach/routing.ts's explicit /coach-onboarding carve-out)
 * — a full-bleed, computer-only calibration experience, exactly like
 * /onboarding/[clientId] sits outside the client-app shell for the same
 * reason.
 */
export default function CoachOnboardingPage() {
  const { activeContext } = usePrototypeState();
  const businessName = activeContext.branding.businessName;
  const coachAccountId = activeContext.coachProfile?.userId ?? activeContext.coachProfile?.id ?? "";

  return (
    <RequireThemeChoice accountKind="coach" accountId={coachAccountId}>
      <RequireDesktopViewport>
        <CoachOnboardingWizard businessName={businessName} />
      </RequireDesktopViewport>
    </RequireThemeChoice>
  );
}
