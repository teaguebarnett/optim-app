"use client";

import { useSearchParams } from "next/navigation";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import { RequireDesktopViewport } from "@/components/coach-onboarding/require-desktop-viewport";
import { CoachOnboardingWizard } from "@/components/coach-onboarding/coach-onboarding-wizard";
import { ALL_CHAPTER_IDS_IN_ORDER, type CoachOnboardingChapterId } from "@/lib/coach/coach-onboarding-questions";

/**
 * Phase 5.4A — the dedicated coach onboarding route. Deliberately sits
 * OUTSIDE /coach/* so it never renders inside CoachShell's horizontal-nav
 * chrome (see lib/coach/routing.ts's explicit /coach-onboarding carve-out)
 * — a full-bleed, computer-only calibration experience, exactly like
 * /onboarding/[clientId] sits outside the client-app shell for the same
 * reason.
 *
 * Gate 5A — accepts an optional ?chapter= so the Playbook page's per-
 * section "Edit" links (components/coach/coach-playbook-detail.tsx) land
 * the coach directly on the relevant chapter instead of always chapter 1.
 * An unrecognized or missing value is simply ignored — the wizard already
 * falls back to its own default start (see CoachOnboardingWizard's own
 * initialChapterId handling), never a broken or blank route.
 */
export default function CoachOnboardingPage() {
  const { activeContext } = usePrototypeState();
  const searchParams = useSearchParams();
  const businessName = activeContext.branding.businessName;
  const coachAccountId = activeContext.coachProfile?.userId ?? activeContext.coachProfile?.id ?? "";
  const chapterParam = searchParams.get("chapter");
  const initialChapterId = ALL_CHAPTER_IDS_IN_ORDER.find((id) => id === chapterParam) as CoachOnboardingChapterId | undefined;

  return (
    <RequireThemeChoice accountKind="coach" accountId={coachAccountId}>
      <RequireDesktopViewport>
        <CoachOnboardingWizard businessName={businessName} initialChapterId={initialChapterId} />
      </RequireDesktopViewport>
    </RequireThemeChoice>
  );
}
