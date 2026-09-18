"use client";

import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { resolveCoachCalibrationStatus, type CoachCalibrationStatus } from "@/lib/coach/coach-onboarding-engine";

const STATUS_LABEL: Record<CoachCalibrationStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  inferred_unconfirmed: "Inferred, not yet confirmed",
  calibrated: "Calibrated",
};

const STATUS_TONE: Record<CoachCalibrationStatus, string> = {
  not_started: "text-neutral",
  in_progress: "text-warning",
  inferred_unconfirmed: "text-warning",
  calibrated: "text-success",
};

/**
 * Phase 5.4A corrective pass — the permanent, always-there entry point
 * into Coach Calibration. The Playbook page above this card already
 * explains what OPTIM does automatically; this is the survey that
 * actually TAUGHT it to do that, and it must stay reachable forever (to
 * revise methodology), not just during a coach's first run — manual
 * review found no such entry existed anywhere in Settings/Playbook.
 * This card is never a substitute for the calibration survey itself
 * (see the Playbook page's own module doc) — it only reports status and
 * links to the real wizard at /coach-onboarding.
 */
export function YourCoachingMethodCard() {
  const router = useRouter();
  const com = useCoachOperatingModel();
  const status = resolveCoachCalibrationStatus({ activeModel: com.activeModel, progress: com.progress });
  const lastUpdatedIso = com.activeModel?.activatedAtIso ?? com.progress?.updatedAtIso ?? null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
          <Compass size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-subheading text-off-white">Your Coaching Method</p>
          <p className="mt-1 text-meta text-neutral">The calibration survey OPTIM uses to build and adjust every client&apos;s plan in your own style.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-meta text-neutral">Status</p>
          <p className={`font-medium ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</p>
        </div>
        <div>
          <p className="text-meta text-neutral">Active model version</p>
          <p className="font-medium text-off-white">{com.activeModel ? `v${com.activeModel.version}` : "—"}</p>
        </div>
        <div>
          <p className="text-meta text-neutral">Last updated</p>
          <p className="font-medium text-off-white">{lastUpdatedIso ? new Date(lastUpdatedIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</p>
        </div>
        <div>
          <p className="text-meta text-neutral">Completion</p>
          <p className="font-medium text-off-white">{com.progressSummary.percentComplete}%</p>
        </div>
      </div>

      <Button variant={status === "calibrated" ? "secondary" : "primary"} size="sm" onClick={() => router.push("/coach-onboarding")}>
        {status === "not_started" ? "Begin calibration" : status === "in_progress" ? "Resume calibration" : status === "inferred_unconfirmed" ? "Review and confirm" : "Review or update"}
      </Button>
    </Card>
  );
}
