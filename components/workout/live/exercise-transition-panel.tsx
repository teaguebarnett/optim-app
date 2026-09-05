"use client";

import { CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { completedWorkingSetCount } from "@/components/workout/live/helpers";
import type { Exercise, WorkoutSession } from "@/lib/types";

/**
 * Phase 4.4B-2 §H — the short transition state between exercises. Never a
 * redundant "Mark exercise complete" button (the exercise already
 * auto-completed in canonical state the moment its final set resolved) —
 * this only summarizes what happened and introduces what's next.
 */
export function ExerciseTransitionPanel({
  finishedExercise,
  nextExercise,
  session,
}: {
  finishedExercise: Exercise | undefined;
  nextExercise: Exercise | undefined;
  session: WorkoutSession;
}) {
  const { dispatch } = usePrototypeState();
  const wasDeferred = finishedExercise ? session.deferredExerciseIds.includes(finishedExercise.id) : false;
  const finishedLog = finishedExercise ? session.exerciseLogs[finishedExercise.id] : undefined;
  const completedCount = completedWorkingSetCount(finishedLog);
  const wasSkipped = finishedLog?.status === "skipped";

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)] text-center">
      <span
        className={
          "mx-auto flex h-12 w-12 items-center justify-center rounded-full " +
          (wasDeferred ? "bg-warning-soft text-warning" : "bg-success-soft text-success")
        }
      >
        {wasDeferred ? <Clock3 size={22} /> : <CheckCircle2 size={22} />}
      </span>

      {finishedExercise ? (
        <p className="mt-3 text-body text-off-white">
          {wasDeferred
            ? `${finishedExercise.name} moved to later in the session.`
            : wasSkipped
              ? `${finishedExercise.name} skipped.`
              : `${completedCount} working set${completedCount === 1 ? "" : "s"} logged for ${finishedExercise.name}.`}
        </p>
      ) : null}

      {nextExercise ? (
        <div className="mt-4 border-t border-border pt-4 text-left">
          <p className="text-label text-neutral">Next</p>
          <p className="mt-0.5 text-heading text-off-white">{nextExercise.name}</p>
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={() => dispatch({ type: "ENTER_EXERCISE_INTRO" })}>
        Continue
      </Button>
    </div>
  );
}
