"use client";

import { useState } from "react";
import { AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { IntervalTimer } from "@/components/workout/live/interval-timer";
import { describeIntervalPhaseTarget, hasRecoveryPhase, isTimeBasedRecovery, isTimeBasedWork, phaseDurationSeconds, totalIntervalRounds } from "@/lib/workout/interval";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { PainReportOverlay } from "@/components/workout/live/pain-report-overlay";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import type { SkipReason } from "@/lib/types";
import type { TrainingItemInstance } from "@/lib/training/types";
import type { IntervalExecutionProgress } from "@/lib/types";

/**
 * Phase 11A — the live round/phase flow (spec section 6's own worked
 * example: "Round 3 of 6, WORK 00:45 Target RPE 9, then RECOVER 01:15").
 * The countdown is guidance only — advancing to the next phase is always
 * this panel's own single explicit button tap, never an auto-dispatch from
 * IntervalTimer itself (see that component's own doc for why). This is
 * also what keeps the logging burden minimal (spec section 13): a
 * time-based round needs zero typing at all — the real elapsed time is
 * captured automatically from the phase's own timestamp anchor the moment
 * the client taps through.
 */
export function IntervalActivePanel({
  item,
  progress,
  painReportActive = false,
}: {
  item: TrainingItemInstance;
  progress: IntervalExecutionProgress;
  painReportActive?: boolean;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [helpOpen, setHelpOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [skipActivityOpen, setSkipActivityOpen] = useState(false);
  const [actualDistanceValue, setActualDistanceValue] = useState<number | undefined>(undefined);
  const [showDistanceEntry, setShowDistanceEntry] = useState(false);

  const { prescription } = item;
  const rounds = totalIntervalRounds(prescription);
  const targetLines = describeIntervalPhaseTarget(prescription, progress.phase);
  const isWork = progress.phase === "work";
  const timeBased = isWork ? isTimeBasedWork(prescription) : isTimeBasedRecovery(prescription);
  const durationSeconds = phaseDurationSeconds(prescription, progress.phase);

  function elapsedSecondsNow(): number {
    return Math.round((Date.now() - new Date(progress.phaseStartedAtIso).getTime()) / 1000);
  }

  function handleAdvance(skipped: boolean) {
    dispatch({
      type: "ADVANCE_INTERVAL_PHASE",
      exerciseId: item.id,
      actualSeconds: timeBased ? elapsedSecondsNow() : undefined,
      actualDistanceValue: isWork && !timeBased ? actualDistanceValue : undefined,
      skipped,
    });
    setActualDistanceValue(undefined);
    setShowDistanceEntry(false);
  }

  function handleSkipActivity(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: item.id, reason, note });
    setSkipActivityOpen(false);
    setHelpOpen(false);
  }

  const phaseLabel = isWork ? "WORK" : "RECOVER";
  const continueLabel = isWork && hasRecoveryPhase(prescription) ? "Start recovery" : progress.round < rounds ? "Next round" : "Finish";

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-center justify-between">
        <p className="text-label text-neutral">{item.name}</p>
        <p className="text-label text-neutral">
          Round {progress.round} of {rounds}
        </p>
      </div>

      <p className={`mt-2 text-center text-heading ${isWork ? "text-accent-strong" : "text-success"}`}>{phaseLabel}</p>

      {timeBased && durationSeconds !== undefined ? (
        <div className="mt-3">
          <IntervalTimer key={`${item.id}-${progress.round}-${progress.phase}`} phaseStartedAtIso={progress.phaseStartedAtIso} durationSeconds={durationSeconds} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-meta text-neutral">
          {targetLines.map((line, i) => (
            <span key={line}>
              {line}
              {i < targetLines.length - 1 ? <span aria-hidden="true"> ·</span> : null}
            </span>
          ))}
        </div>
      )}

      {isWork && !timeBased ? (
        <div className="mt-3">
          {!showDistanceEntry ? (
            <button type="button" onClick={() => setShowDistanceEntry(true)} className="text-action text-neutral hover:text-off-white">
              Log actual time (optional)
            </button>
          ) : (
            <label className="block">
              <span className="mb-1 block text-label text-neutral">Actual time (seconds, optional)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                value={actualDistanceValue ?? ""}
                onChange={(e) => setActualDistanceValue(e.target.value ? Number(e.target.value) : undefined)}
              />
            </label>
          )}
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={() => handleAdvance(false)}>
        {continueLabel}
      </Button>

      <button type="button" onClick={() => handleAdvance(true)} className="mt-2 w-full text-center text-action text-neutral hover:text-off-white">
        Skip this round
      </button>

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
            onClick={() => setSkipActivityOpen(true)}
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
        open={skipActivityOpen}
        onClose={() => setSkipActivityOpen(false)}
        title="Skip this activity"
        description={`${item.name} will be marked skipped and flagged for ${coachName}. Rounds already completed will still be recorded.`}
        onConfirm={handleSkipActivity}
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
