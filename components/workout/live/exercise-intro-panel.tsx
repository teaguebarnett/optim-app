"use client";

import { useState } from "react";
import { Dumbbell, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { resolveExerciseWarmupConfig } from "@/lib/workout/warmup";
import { formatRestRecommendation, workingPrescribedSets } from "@/components/workout/live/helpers";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import type { Exercise } from "@/lib/types";

/**
 * Phase 4.4B-2 §C — the focused introduction shown once per exercise.
 * Previous performance is deliberately a small secondary line, never
 * competing with the current instruction — expandable on demand rather than
 * shown inline by default.
 */
export function ExerciseIntroPanel({
  exercise,
  painReportActive = false,
}: {
  exercise: Exercise;
  /** Phase 4.4B-2.2 — true whenever ANY pain report remains active this
   * session, so a compact caution stays visible even on an exercise already
   * confirmed unaffected. See components/workout/live/active-pain-banner.tsx. */
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();
  const [showLastTime, setShowLastTime] = useState(false);
  const working = workingPrescribedSets(exercise);
  const warmupConfig = resolveExerciseWarmupConfig(exercise);

  const warmupNote =
    warmupConfig.mode === "none"
      ? "No additional warm-up for this exercise."
      : warmupConfig.mode === "instruction"
        ? warmupConfig.instruction
        : `${warmupConfig.steps.length} warm-up set${warmupConfig.steps.length === 1 ? "" : "s"} before working sets.`;

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Dumbbell size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-neutral">Next up</p>
          <p className="text-heading text-off-white">{exercise.name}</p>
        </div>
      </div>

      <p className="mt-3 text-body text-off-white">{exercise.cue}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta text-neutral">
        <span>
          {working.length} working set{working.length === 1 ? "" : "s"} · {exercise.targetRepsLow}–{exercise.targetRepsHigh} reps
        </span>
        <span aria-hidden="true">·</span>
        <span>Target RPE {exercise.targetRpe}</span>
      </div>
      <p className="mt-1 text-meta text-neutral">
        Tempo {exercise.tempo} · {formatRestRecommendation(exercise.restSeconds)}
      </p>

      <div className="mt-3 rounded-[var(--radius-sm)] bg-off-white/[0.04] px-3 py-2.5">
        <p className="text-label text-neutral">Warm-up</p>
        <p className="mt-0.5 text-meta text-off-white">{warmupNote}</p>
      </div>

      {exercise.previousPerformance.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowLastTime((v) => !v)}
            className="flex items-center gap-1 text-action text-neutral hover:text-off-white"
          >
            Last time
            {showLastTime ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showLastTime ? (
            <p className="mt-1.5 text-meta text-neutral">
              {exercise.previousPerformance.map((p) => `${p.weightLb} lb × ${p.reps} @ RPE ${p.rpe}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button className="mt-4 w-full" onClick={() => dispatch({ type: "BEGIN_EXERCISE" })}>
        Begin {exercise.name}
      </Button>
    </div>
  );
}
