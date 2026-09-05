"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, LifeBuoy, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NeedHelpSheet } from "@/components/workout/live/need-help-sheet";
import { comparablePreviousSetPerformance } from "@/lib/workout/guidance";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { prescribedWorkingSet, workingSetDisplayIndex, workingPrescribedSets } from "@/components/workout/live/helpers";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import type { Exercise } from "@/lib/types";

/**
 * Phase 4.4B-2 §E — the dominant surface for exactly one current working
 * set. Never a list of every remaining set — only this one, plus a compact
 * secondary reference to the comparable set from last time.
 */
export function SetReadyPanel({
  exercise,
  setNumber,
  painReportActive = false,
}: {
  exercise: Exercise;
  setNumber: number;
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();
  const [showLastTime, setShowLastTime] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const prescribed = prescribedWorkingSet(exercise, setNumber);
  const working = workingPrescribedSets(exercise);
  const displayIndex = workingSetDisplayIndex(exercise, setNumber);
  const comparable = comparablePreviousSetPerformance(exercise, displayIndex);

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-neutral">{exercise.name}</p>
          <p className="text-heading text-off-white">
            Set {displayIndex + 1} of {working.length}
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Target size={20} />
        </span>
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] bg-off-white/[0.04] p-4 text-center">
        {prescribed?.prescribedWeightLb !== undefined ? (
          <p className="text-metric text-off-white">
            {prescribed.prescribedWeightLb} lb × {prescribed.prescribedReps}
          </p>
        ) : (
          <p className="text-metric text-off-white">
            {exercise.targetRepsLow}–{exercise.targetRepsHigh} reps
          </p>
        )}
        <p className="mt-1 text-meta text-neutral">Target RPE {exercise.targetRpe}</p>
      </div>

      <p className="mt-3 text-body text-off-white">{exercise.cue}</p>

      {comparable ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowLastTime((v) => !v)}
            className="flex items-center gap-1 text-action text-neutral hover:text-off-white"
          >
            Last time, Set {displayIndex + 1}
            {showLastTime ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showLastTime ? (
            <p className="mt-1.5 text-meta text-neutral">
              {comparable.weightLb} lb × {comparable.reps} @ RPE {comparable.rpe}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={() => dispatch({ type: "BEGIN_SET_LOGGING" })}>
        Complete set
      </Button>

      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 text-action text-neutral hover:text-off-white"
      >
        <LifeBuoy size={14} />
        Need help / Change plan
      </button>

      <NeedHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} exercise={exercise} setNumber={setNumber} />
    </div>
  );
}
