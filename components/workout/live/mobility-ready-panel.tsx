"use client";

import { useState } from "react";
import { Wind, AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { describeMobilityOverview } from "@/lib/workout/mobility";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { PainReportOverlay } from "@/components/workout/live/pain-report-overlay";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import type { SkipReason } from "@/lib/types";
import type { TrainingItemInstance } from "@/lib/training/types";

/**
 * Phase 11C — the mobility/flexibility counterpart of IntervalReadyPanel:
 * the item overview (set count, hold duration or reps, which side(s))
 * before starting.
 */
export function MobilityReadyPanel({
  item,
  painReportActive = false,
}: {
  item: TrainingItemInstance;
  painReportActive?: boolean;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [helpOpen, setHelpOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);

  const overviewLines = describeMobilityOverview(item.prescription);

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: item.id, reason, note });
    setSkipOpen(false);
    setHelpOpen(false);
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Wind size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-neutral">Next up</p>
          <p className="text-heading text-off-white">{item.name}</p>
        </div>
      </div>

      {item.coachCue ? <p className="mt-3 text-body text-off-white">{item.coachCue}</p> : null}

      {overviewLines.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta text-neutral">
          {overviewLines.map((line, i) => (
            <span key={line}>
              {line}
              {i < overviewLines.length - 1 ? <span aria-hidden="true"> ·</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      <Button className="mt-4 w-full" onClick={() => dispatch({ type: "BEGIN_MOBILITY_EXECUTION", exerciseId: item.id })}>
        Begin {item.name}
      </Button>

      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 text-action text-neutral hover:text-off-white"
      >
        <HelpCircle size={14} />
        Need help?
      </button>

      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Need help?" description={`For ${item.name}.`}>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setPainOpen(true)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
              <AlertTriangle size={17} />
            </span>
            <span className="flex-1 text-subheading text-off-white">Report pain</span>
          </button>
          <button
            type="button"
            onClick={() => setSkipOpen(true)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
              <Clock size={17} />
            </span>
            <span className="flex-1 text-subheading text-off-white">Skip this activity</span>
          </button>
        </div>
      </Sheet>

      <SkipReasonSheet
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        title="Skip this activity"
        description={`${item.name} will be marked skipped and flagged for ${coachName}.`}
        onConfirm={handleSkipConfirm}
      />

      <PainReportOverlay
        open={painOpen}
        onClose={() => {
          setPainOpen(false);
          setHelpOpen(false);
        }}
        exerciseName={item.name}
        coachName={coachName}
        onSubmit={(report) => {
          dispatch({ type: "REPORT_PAIN", exerciseId: item.id, ...report });
          setPainOpen(false);
        }}
      />
    </div>
  );
}
