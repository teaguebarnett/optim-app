"use client";

// Gate 3 — Settings → Coaching method. The coach-facing view of their Coach
// Brain's active method: confirmed status, the same human-readable summary
// the calibration Review shows, and one way to change it — "Review or update
// your method", which opens a DRAFT prefilled from the active method. The
// active method keeps running until the coach explicitly confirms the
// update. No low-level configuration fields here (the legacy 12-field form,
// components/coach/live-coach-playbook-summary.tsx, is no longer shown).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MethodSummaryGrid } from "@/components/coach-onboarding/method-summary";
import { CalibrationSummary } from "@/components/coach-onboarding/v2/calibration-summary";
import { startMethodReviewAction } from "@/app/actions/coach-calibration";
import type { CoachOperatingModel } from "@/lib/coach/operating-model";
import type { CalibrationChapterId as CoachOnboardingChapterId } from "@/lib/coach/calibration/types";

export function CoachMethodSettings({
  model,
  version,
  confirmedLabel,
  calibratedLabel,
  hasOpenReview,
}: {
  model: CoachOperatingModel;
  version: number;
  confirmedLabel: string;
  calibratedLabel: string | null;
  hasOpenReview: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openReview(chapter?: CoachOnboardingChapterId) {
    setBusy(true);
    setError(null);
    const result = await startMethodReviewAction();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(chapter ? `/coach-onboarding?chapter=${chapter}` : "/coach-onboarding");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="text-subheading text-off-white">Calibration complete · method active</p>
            <p className="mt-0.5 text-meta text-neutral">
              Version {version} · confirmed {confirmedLabel}
              {calibratedLabel && calibratedLabel !== confirmedLabel ? ` · first calibrated ${calibratedLabel}` : ""}
            </p>
            <p className="mt-1.5 max-w-xl text-meta text-neutral">OPTIM follows this method for everything it prepares for your clients. It never changes on its own — only when you confirm an update.</p>
          </div>
        </div>
        {model.calibration ? (
          <Button onClick={() => openReview()} disabled={busy}>
            {hasOpenReview ? "Continue reviewing" : "Review or update your method"} <ArrowRight size={16} aria-hidden="true" />
          </Button>
        ) : (
          // A method from before the adaptive calibration: changing it means
          // refining it (below). This only shows the method that's active now.
          <Button variant="secondary" onClick={() => document.getElementById("current-method-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            View current method
          </Button>
        )}
      </div>
      {hasOpenReview && model.calibration ? <p className="text-meta text-warning-strong">You have method changes in progress that aren’t active yet. Your current method stays in use until you confirm them.</p> : null}
      {error ? <p role="alert" className="text-meta text-error-strong">{error}</p> : null}
      {model.calibration ? (
        <CalibrationSummary answers={model.calibration.answers} onEditChapter={(chapter) => void openReview(chapter)} />
      ) : (
        <>
          {/* Gate 3.1 — a method confirmed before the adaptive calibration. It
              stays active; refining is optional and never automatic. */}
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-accent/30 bg-accent-soft p-4 sm:p-5">
            <div className="max-w-xl">
              <p className="text-subheading text-off-white">{hasOpenReview ? "Your refinement is in progress" : "Refine your method"}</p>
              <p className="mt-1 text-meta text-neutral">
                {hasOpenReview
                  ? "Pick up where you left off. Your current method stays active until you confirm the refined one."
                  : "OPTIM’s calibration now adapts to what you coach and captures ranges and “it depends” rules. Answers that kept their meaning carry over — you only confirm what changed and answer what’s new. Your current method stays active until you confirm."}
              </p>
            </div>
            <Button onClick={() => openReview()} disabled={busy}>
              {hasOpenReview ? "Continue refining" : "Refine your method"} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
          <div id="current-method-summary" className="scroll-mt-24">
            <p className="mb-3 text-label text-neutral">Your current method</p>
            <MethodSummaryGrid model={model} />
          </div>
        </>
      )}
    </div>
  );
}
