"use client";

import { Button } from "@/components/ui/button";
import { TrainingTimeSheet } from "@/components/today/training-time-sheet";
import type { DailyTrainingPlan } from "@/lib/planning/types";

interface TrainingTimeCardProps {
  plan: DailyTrainingPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Today-screen hierarchy item #2: the client's own training-time entry or
 * current decision. OPTIM never assumes a time — a fresh day always shows
 * the primary "Enter your training time" prompt (not a confirmation of a
 * guessed time), and "Not sure yet" gets a calm, low-emphasis reminder
 * rather than repeating that same prompt.
 *
 * Phase 4.4B.1 — renders as content only (no outer card chrome); it sits
 * directly beneath FuelSection inside the shared "Today overview" cluster
 * card in app/today/page.tsx, separated by a hairline divider rather than
 * its own repeated border/shadow.
 *
 * Phase 4.4B-1 — the actual Sheet/wheel/dispatch logic now lives in
 * components/today/training-time-sheet.tsx so Training's dominant session
 * surface can open the identical flow directly (see that file's doc);
 * this component keeps only the compact display block.
 */
export function TrainingTimeCard({ plan, open, onOpenChange }: TrainingTimeCardProps) {
  const noDecisionYet = plan === null;

  return (
    <>
      <div className="p-4">
        {noDecisionYet ? (
          <div>
            <p className="text-subheading text-off-white">Enter your training time</p>
            <Button className="mt-2.5 w-full" onClick={() => onOpenChange(true)}>
              Enter your training time
            </Button>
          </div>
        ) : plan.status === "scheduled" ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-label text-neutral">Training</p>
              <p className="truncate text-subheading text-off-white">{plan.plannedTimeLabel}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
              Change
            </Button>
          </div>
        ) : plan.status === "rest_day" ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-subheading text-off-white">Rest day today</p>
              <p className="mt-0.5 text-meta text-neutral">Your workout stays available if your plan changes.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
              Change
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-subheading text-off-white">Training time not set</p>
              <p className="mt-0.5 text-meta text-neutral">
                Entering a time later will improve OPTIM&apos;s recommendations.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
              Enter time
            </Button>
          </div>
        )}
      </div>

      <TrainingTimeSheet plan={plan} open={open} onOpenChange={onOpenChange} />
    </>
  );
}
