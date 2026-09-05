"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { resolveExerciseWarmupConfig } from "@/lib/workout/warmup";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import type { Exercise, SkipReason, WarmupOutcome } from "@/lib/types";

/**
 * Phase 4.4B-2 §D — per-exercise warm-up. Renders the coach-configured
 * shape (a single free-text instruction, or individually stepped ramping
 * sets) — never RPE/weight/reps logging, unless coach configuration one day
 * requires it (not the case for any current catalog exercise). ONLY
 * rendered by ActiveSessionShell when the resolved config mode isn't
 * "none."
 */
export function ExerciseWarmupPanel({
  exercise,
  outcome,
  painReportActive = false,
}: {
  exercise: Exercise;
  outcome: WarmupOutcome | undefined;
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();
  const [skipOpen, setSkipOpen] = useState(false);
  const config = resolveExerciseWarmupConfig(exercise);
  if (config.mode === "none") return null;

  const stepsCompleted = outcome?.stepsCompleted ?? 0;

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE_WARMUP", reason, note });
    setSkipOpen(false);
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Flame size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-neutral">Warm-up · {exercise.name}</p>
          {config.mode === "stepped" ? (
            <p className="text-heading text-off-white">
              Step {Math.min(stepsCompleted + 1, config.steps.length)} of {config.steps.length}
            </p>
          ) : (
            <p className="text-heading text-off-white">Get ready</p>
          )}
        </div>
      </div>

      {config.mode === "instruction" ? (
        <p className="mt-4 text-body text-off-white">{config.instruction}</p>
      ) : (
        <p className="mt-4 text-body text-off-white">
          {config.steps[Math.min(stepsCompleted, config.steps.length - 1)].targetRepsLow}–
          {config.steps[Math.min(stepsCompleted, config.steps.length - 1)].targetRepsHigh} reps
          {config.steps[Math.min(stepsCompleted, config.steps.length - 1)].prescribedWeightLb
            ? `, about ${config.steps[Math.min(stepsCompleted, config.steps.length - 1)].prescribedWeightLb} lb`
            : ""}
        </p>
      )}
      <p className="mt-1 text-meta text-neutral">Guidance only — no need to log this set.</p>

      <div className="mt-5 flex gap-2">
        <Button className="flex-1" onClick={() => dispatch({ type: "ADVANCE_EXERCISE_WARMUP" })}>
          {config.mode === "stepped" && stepsCompleted + 1 < config.steps.length ? "Done — next step" : "Warm-up complete"}
        </Button>
        <Button variant="outline" onClick={() => setSkipOpen(true)}>
          Skip
        </Button>
      </div>

      <SkipReasonSheet
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        title="Skip warm-up"
        description={`For ${exercise.name}.`}
        onConfirm={handleSkipConfirm}
      />
    </div>
  );
}
