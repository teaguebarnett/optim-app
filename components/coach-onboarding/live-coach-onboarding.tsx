"use client";

// Gate 3 — the live calibration survey: the same wizard, backed by the
// coach's real, server-persisted calibration (LiveCalibrationProvider).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import { CoachOnboardingWizard } from "@/components/coach-onboarding/coach-onboarding-wizard";
import { LiveCalibrationProvider, type LiveCalibrationInitial } from "@/components/coach-onboarding/calibration-context";
import { startMethodReviewAction } from "@/app/actions/coach-calibration";
import type { CalibrationChapterId as CoachOnboardingChapterId } from "@/lib/coach/calibration/types";

export function LiveCoachOnboarding({
  initial,
  initialChapterId,
  reviewEntry,
}: {
  initial: LiveCalibrationInitial;
  initialChapterId?: CoachOnboardingChapterId;
  /** Set when the coach is calibrated with no open review draft. */
  reviewEntry: { versionLabel: string; editInSettings: boolean } | null;
}) {
  // Once the wizard has been shown, keep it mounted. Confirming refreshes the
  // page, and the server then reports a calibrated coach — without this latch
  // that refresh would swap the wizard (and its "Calibration complete" /
  // "Go to your dashboard" screen) for the review entry mid-transition.
  const [wizardShown, setWizardShown] = useState(reviewEntry === null);
  if (reviewEntry === null && !wizardShown) setWizardShown(true);
  if (!wizardShown && reviewEntry) {
    // Gate 3.2 — a method from the adaptive calibration is edited in Settings;
    // the interview is only for creating a method (or refining a v1 one).
    if (reviewEntry.editInSettings) return <EditInSettings coachUserId={initial.coachUserId} versionLabel={reviewEntry.versionLabel} />;
    return <StartMethodReview coachUserId={initial.coachUserId} versionLabel={reviewEntry.versionLabel} />;
  }
  return (
    <RequireThemeChoice accountKind="coach" accountId={initial.coachUserId}>
      <LiveCalibrationProvider initial={initial}>
        <CoachOnboardingWizard initialChapterId={initialChapterId} />
      </LiveCalibrationProvider>
    </RequireThemeChoice>
  );
}

/** Gate 3.2 — a calibrated coach who opens the calibration directly: their
 * method is edited in Settings, never by redoing the interview. */
function EditInSettings({ coachUserId, versionLabel }: { coachUserId: string; versionLabel: string }) {
  const router = useRouter();
  return (
    <RequireThemeChoice accountKind="coach" accountId={coachUserId}>
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="max-w-lg">
          <p className="text-label text-accent-fg">Your coaching method</p>
          <h1 className="mt-2 text-heading text-off-white sm:text-display">Your method is active.</h1>
          <p className="mt-3 text-body text-neutral">OPTIM is working from your confirmed method ({versionLabel}). To change any part of it, open it in Settings — nothing changes until you review and confirm.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => router.push("/coach/settings#coaching-method")}>
              Edit your method in Settings <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => router.push("/coach")}>
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    </RequireThemeChoice>
  );
}

/** A calibrated coach with no open review draft: their method stays active;
 * reviewing it is an explicit choice, never automatic. */
export function StartMethodReview({ coachUserId, versionLabel }: { coachUserId: string; versionLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    setError(null);
    const result = await startMethodReviewAction();
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.message);
  }
  return (
    <RequireThemeChoice accountKind="coach" accountId={coachUserId}>
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="max-w-lg">
          <p className="text-label text-accent-fg">Your coaching method</p>
          <h1 className="mt-2 text-heading text-off-white sm:text-display">Your method is active.</h1>
          <p className="mt-3 text-body text-neutral">
            OPTIM is working from your confirmed method ({versionLabel}). Reviewing it opens your answers as a draft — nothing changes until you confirm the update, and your current method stays active meanwhile.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={start} disabled={busy}>
              Review or update your method <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => router.push("/coach")}>
              Back to dashboard
            </Button>
          </div>
          {error ? <p className="mt-3 text-meta text-error-strong">{error}</p> : null}
        </div>
      </div>
    </RequireThemeChoice>
  );
}
