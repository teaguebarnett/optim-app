"use client";

// The demo-mode calibration page — previously app/coach-onboarding/page.tsx
// itself, moved here unchanged (apart from no longer hard-blocking phones)
// so the route can branch on app mode server-side. Reads/writes the demo
// prototype's browser-local state through DemoCalibrationProvider.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import { CoachOnboardingWizard } from "@/components/coach-onboarding/coach-onboarding-wizard";
import { DemoCalibrationProvider } from "@/components/coach-onboarding/calibration-context";
import { CHAPTER_ORDER as ALL_CHAPTER_IDS_IN_ORDER } from "@/lib/coach/calibration/questions";
import type { CalibrationChapterId as CoachOnboardingChapterId } from "@/lib/coach/calibration/types";

export function DemoCoachOnboardingPage() {
  return (
    <Suspense>
      <DemoCoachOnboardingPageInner />
    </Suspense>
  );
}

function DemoCoachOnboardingPageInner() {
  const { activeContext } = usePrototypeState();
  const searchParams = useSearchParams();
  const businessName = activeContext.branding.businessName;
  const coachAccountId = activeContext.coachProfile?.userId ?? activeContext.coachProfile?.id ?? "";
  const chapterParam = searchParams.get("chapter");
  const initialChapterId = ALL_CHAPTER_IDS_IN_ORDER.find((id) => id === chapterParam) as CoachOnboardingChapterId | undefined;

  return (
    <RequireThemeChoice accountKind="coach" accountId={coachAccountId}>
      <DemoCalibrationProvider businessName={businessName}>
        <CoachOnboardingWizard initialChapterId={initialChapterId} />
      </DemoCalibrationProvider>
    </RequireThemeChoice>
  );
}
