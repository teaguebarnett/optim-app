"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { RpeWheel } from "@/components/workout/live/rpe-wheel";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import { totalIntervalRounds } from "@/lib/workout/interval";
import type { RpeValue } from "@/lib/types";
import type { IntervalExecutionProgress } from "@/lib/types";
import type { TrainingItemInstance } from "@/lib/training/types";

/**
 * Phase 11A — the interval counterpart of ContinuousLoggingPanel: the ONE
 * capture step, reached once every round is done (or the client taps
 * "Finish now" early from IntervalActivePanel) — an optional RPE only,
 * never a per-round metrics form (spec section 13's minimal-logging-burden
 * discipline). Every round's own actual (duration/distance/skip) was
 * already captured automatically as the client tapped through — this step
 * exists purely to close out the activity-level effort rating the
 * prescription's own RPE target implies.
 */
export function IntervalLoggingPanel({
  item,
  progress,
  painReportActive = false,
}: {
  item: TrainingItemInstance;
  progress: IntervalExecutionProgress;
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();
  const [rpe, setRpe] = useState<RpeValue | null>(null);
  const wantsRpe = item.prescription.rpe !== undefined;

  const rounds = totalIntervalRounds(item.prescription);
  const completedCount = progress.roundActuals.filter((r) => r.status === "completed").length;

  function handleSubmit() {
    dispatch({ type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: item.id, rpe: rpe ?? undefined });
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <p className="text-label text-neutral">{item.name}</p>
      <p className="text-heading text-off-white">Nice work.</p>
      <p className="mt-1 text-meta text-neutral">
        {completedCount} of {rounds} rounds completed.
      </p>

      {wantsRpe ? (
        <div className="mt-4">
          <p className="mb-1 text-label text-neutral">How hard did that feel overall?</p>
          <RpeWheel key={item.id} id={`interval-rpe-${item.id}`} onChange={setRpe} />
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={handleSubmit}>
        Complete
      </Button>
    </div>
  );
}
