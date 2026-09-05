"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TrainingTimeWheel } from "@/components/today/training-time-wheel";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { formatTimeLabel } from "@/lib/planning/training-plan";
import type { DailyTrainingPlan } from "@/lib/planning/types";

/** What a training-time decision actually resolved to, reported only after
 * the real SET_TRAINING_* dispatch has already run — see onCommitted below.
 * `timeLabel` is present only for "scheduled". */
export type TrainingTimeCommitResult =
  | { kind: "scheduled"; time24: string; timeLabel: string }
  | { kind: "unsure" }
  | { kind: "rest_day" };

interface TrainingTimeSheetProps {
  plan: DailyTrainingPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires once the canonical dailyTrainingPlan has actually been updated —
   * never before. Lets a caller outside Today (e.g. Chat, see
   * app/chat/page.tsx) confirm exactly what changed without re-deriving or
   * duplicating this sheet's own dispatch logic. Optional — Today/Training's
   * own usage doesn't need it. */
  onCommitted?: (result: TrainingTimeCommitResult) => void;
}

/**
 * OPTIM's one training-time decision sheet — the wheel picker plus Not sure
 * yet / Rest day, all dispatching the same SET_TRAINING_* actions. Extracted
 * from components/today/training-time-card.tsx (Phase 4.4B-1) so Training's
 * dominant session surface (see components/training/) can open the exact
 * same flow directly — "Set training time," "Change time," and "Change
 * decision" all just flip this sheet open — rather than routing back to
 * Today first or duplicating the wheel/dispatch logic.
 */
export function TrainingTimeSheet({ plan, open, onOpenChange, onCommitted }: TrainingTimeSheetProps) {
  const { dispatch } = usePrototypeState();
  const [draftTime, setDraftTime] = useState(plan?.plannedTime24 ?? "17:30");

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => setDraftTime(plan?.plannedTime24 ?? "17:30"), 0);
    return () => clearTimeout(timeout);
  }, [open, plan?.plannedTime24]);

  function handleSetTime() {
    dispatch({ type: "SET_TRAINING_TIME", time24: draftTime });
    onCommitted?.({ kind: "scheduled", time24: draftTime, timeLabel: formatTimeLabel(draftTime) });
    onOpenChange(false);
  }

  function handleNotSure() {
    dispatch({ type: "SET_TRAINING_UNSURE" });
    onCommitted?.({ kind: "unsure" });
    onOpenChange(false);
  }

  function handleRestDay() {
    dispatch({ type: "SET_TRAINING_REST_DAY" });
    onCommitted?.({ kind: "rest_day" });
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onClose={() => onOpenChange(false)}
      title="Training time"
      description="OPTIM will organize today's meals and recommendations around it."
    >
      <div className="space-y-4">
        <div>
          <TrainingTimeWheel value={draftTime} onChange={setDraftTime} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetTime}>Set time</Button>
          </div>
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
  );
}
