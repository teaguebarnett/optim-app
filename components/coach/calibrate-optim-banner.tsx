"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { resolveCoachCalibrationStatus } from "@/lib/coach/coach-onboarding-engine";

/**
 * Phase 5.4A corrective pass — manual review found the real, working
 * /coach-onboarding route had no discoverable entry point anywhere a coach
 * would actually look (Command Center, Settings, Playbook, or the nav) —
 * a coach would have had to know or guess the URL. This is the primary
 * discovery surface: a prominent Command Center module for any coach who
 * hasn't genuinely confirmed their Coach Operating Model yet (see
 * resolveCoachCalibrationStatus — "an active model exists" and "the coach
 * actually confirmed it" are deliberately NOT the same thing). Renders
 * nothing once calibrated, so it never lingers as clutter after this job
 * is done. The permanent, always-available re-entry point lives in the
 * Playbook (see components/coach/your-coaching-method-card.tsx) — this
 * banner is the first-run/incomplete nudge only.
 */
export function CalibrateOptimBanner() {
  const router = useRouter();
  const com = useCoachOperatingModel();
  const status = resolveCoachCalibrationStatus({ activeModel: com.activeModel, progress: com.progress });
  const goToOnboarding = () => router.push("/coach-onboarding");

  if (status === "calibrated") return null;

  if (status === "inferred_unconfirmed") {
    return (
      <Card className="border-l-2 border-l-accent">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-body font-semibold text-off-white">Confirm your coaching model</p>
              <p className="mt-1 text-meta text-neutral">
                Part of how OPTIM builds and adjusts client plans in your style is still based on inferred defaults you haven&apos;t explicitly confirmed yet.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={goToOnboarding}>
            Review and confirm
          </Button>
        </div>
      </Card>
    );
  }

  const isInProgress = status === "in_progress";

  return (
    <Card className="border-l-2 border-l-accent-strong">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-body font-semibold text-off-white">Calibrate OPTIM</p>
            <p className="mt-1 text-meta text-neutral">
              {isInProgress
                ? `You're ${com.progressSummary.percentComplete}% through teaching OPTIM how you coach.`
                : "Teach OPTIM your methodology once, and it builds and adjusts every client's training and nutrition in your style — not a generic template."}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={goToOnboarding}>
          {isInProgress ? "Resume calibration" : "Begin calibration"}
        </Button>
      </div>
    </Card>
  );
}
