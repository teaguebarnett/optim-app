"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
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
 */
export function TrainingTimeCard({ plan, open, onOpenChange }: TrainingTimeCardProps) {
  const { dispatch } = usePrototypeState();
  const [draftTime, setDraftTime] = useState(plan?.plannedTime24 ?? "17:30");

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => setDraftTime(plan?.plannedTime24 ?? "17:30"), 0);
    return () => clearTimeout(timeout);
  }, [open, plan?.plannedTime24]);

  function handleSaveTime() {
    dispatch({ type: "SET_TRAINING_TIME", time24: draftTime });
    onOpenChange(false);
  }

  function handleNotSure() {
    dispatch({ type: "SET_TRAINING_UNSURE" });
    onOpenChange(false);
  }

  function handleRestDay() {
    dispatch({ type: "SET_TRAINING_REST_DAY" });
    onOpenChange(false);
  }

  const noDecisionYet = plan === null;

  return (
    <>
      <div className="mx-4 rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)]">
        {noDecisionYet ? (
          <div>
            <p className="text-[15px] font-semibold text-off-white">Enter your training time</p>
            <p className="mt-1 text-sm text-neutral">
              OPTIM will organize today&apos;s meals and recommendations around it.
            </p>
            <Button className="mt-3 w-full" onClick={() => onOpenChange(true)}>
              Enter your training time
            </Button>
          </div>
        ) : plan.status === "scheduled" ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral">Training</p>
              <p className="truncate text-[15px] font-semibold text-off-white">{plan.plannedTimeLabel}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
              Change
            </Button>
          </div>
        ) : plan.status === "rest_day" ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-off-white">Rest day today</p>
              <p className="mt-0.5 text-sm text-neutral">Your workout stays available if your plan changes.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
              Change
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-off-white">Training time not set</p>
              <p className="mt-0.5 text-sm text-neutral">
                Entering a time later will improve OPTIM&apos;s recommendations.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
              Enter time
            </Button>
          </div>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => onOpenChange(false)}
        title="Training time"
        description="OPTIM will organize today's meals and recommendations around it."
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="training-time-input" className="mb-1.5 block text-sm font-medium text-off-white">
              Time
            </label>
            <input
              id="training-time-input"
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value)}
              className="h-12 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[17px] text-off-white outline-none focus-visible:border-accent"
            />
            <Button className="mt-3 w-full" onClick={handleSaveTime}>
              Save training time
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleNotSure}>
              Not sure yet
            </Button>
            <Button variant="outline" onClick={handleRestDay}>
              Rest day
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
