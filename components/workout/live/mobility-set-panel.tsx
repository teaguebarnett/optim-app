"use client";

import { useState } from "react";
import { AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import { IntervalTimer } from "@/components/workout/live/interval-timer";
import { describeMobilitySetTarget, mobilityCaptureFields, totalMobilitySets } from "@/lib/workout/mobility";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { PainReportOverlay } from "@/components/workout/live/pain-report-overlay";
import type { MobilityExecutionProgress, SkipReason } from "@/lib/types";
import type { Prescription, TrainingItemInstance } from "@/lib/training/types";

/**
 * Phase 11C — the live "Set N of M" (and, for a dual-side item, "LEFT
 * 00:45" then "RIGHT 00:45") screen for a mobility item (spec section 15's
 * exact worked example). A duration-based hold reuses Phase 11A's
 * IntervalTimer for a guidance-only countdown (spec section 16) — it never
 * auto-advances; the client always taps Complete themselves. A rep-based
 * item has no timer, just a one-tap completion (or "Performed differently"
 * for an honest rep-count deviation).
 */
export function MobilitySetPanel({
  item,
  progress,
  painReportActive = false,
}: {
  item: TrainingItemInstance;
  progress: MobilityExecutionProgress;
  painReportActive?: boolean;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [helpOpen, setHelpOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [skipActivityOpen, setSkipActivityOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [deviated, setDeviated] = useState(false);
  const [repsActual, setRepsActual] = useState<number | undefined>(undefined);

  const totalSets = totalMobilitySets(item.prescription);
  const capture = mobilityCaptureFields(item.prescription);
  const target = describeMobilitySetTarget(item.prescription);
  const sideLabel = progress.currentSide ? progress.currentSide.toUpperCase() : null;

  function buildActual(): Partial<Prescription> | undefined {
    if (!deviated || !capture.reps) return undefined;
    return { reps: { low: repsActual ?? item.prescription.reps!.low, high: repsActual ?? item.prescription.reps!.high } };
  }

  function resetCaptureState() {
    setDeviated(false);
    setRepsActual(undefined);
  }

  function handleComplete() {
    dispatch({ type: "ADVANCE_MOBILITY_PHASE", exerciseId: item.id, actual: buildActual() });
    resetCaptureState();
  }

  function handleSkip(reason: SkipReason) {
    dispatch({ type: "ADVANCE_MOBILITY_PHASE", exerciseId: item.id, skipped: true, skipReason: reason });
    resetCaptureState();
    setSkipOpen(false);
  }

  function handleSkipActivity(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: item.id, reason, note });
    setSkipActivityOpen(false);
    setHelpOpen(false);
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-center justify-between">
        <p className="text-label text-neutral">
          Set {progress.currentSet} of {totalSets}
        </p>
        {sideLabel ? <p className="text-label text-brass-strong">{sideLabel}</p> : null}
      </div>

      <p className="mt-2 text-heading text-off-white">{item.name}</p>
      {item.coachCue ? <p className="mt-1 text-body text-off-white">{item.coachCue}</p> : null}
      <p className="mt-1 text-meta text-neutral">{target}</p>

      {item.prescription.duration && progress.holdStartedAtIso ? (
        <div className="mt-4">
          <IntervalTimer phaseStartedAtIso={progress.holdStartedAtIso} durationSeconds={item.prescription.duration.seconds} />
        </div>
      ) : null}

      {capture.reps ? (
        <div className="mt-4 rounded-[var(--radius-md)] bg-off-white/[0.04] p-4">
          {!deviated ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-meta text-neutral">Completed as prescribed</p>
                <p className="mt-0.5 text-subheading text-off-white">{target}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDeviated(true)}>
                Performed differently
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-meta text-neutral">What you actually did</p>
                <button type="button" onClick={() => setDeviated(false)} className="text-action text-accent-strong hover:underline">
                  Use prescribed
                </button>
              </div>
              <label className="mt-3 block">
                <span className="mb-1 block text-label text-neutral">Reps</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                  value={repsActual ?? item.prescription.reps?.low ?? ""}
                  onChange={(e) => setRepsActual(e.target.value ? Number(e.target.value) : undefined)}
                />
              </label>
            </div>
          )}
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={handleComplete}>
        Complete
      </Button>

      <button type="button" onClick={() => setSkipOpen(true)} className="mt-2 w-full text-center text-action text-neutral hover:text-off-white">
        Skip {sideLabel ? "this side" : "this set"}
      </button>

      <SkipReasonSheet
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        title={`Skip ${sideLabel ? "this side" : "this set"}`}
        description={`Set ${progress.currentSet}${sideLabel ? ` (${sideLabel})` : ""} of ${item.name} will be marked skipped — the rest of the item continues.`}
        onConfirm={handleSkip}
      />

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
        description={`${item.name} will be marked skipped and flagged for ${coachName}. Sets already completed will still be recorded.`}
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
