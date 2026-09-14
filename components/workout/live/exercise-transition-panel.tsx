"use client";

import { CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { completedWorkingSetCount } from "@/components/workout/live/helpers";
import { formatDistance, formatDurationMinutes } from "@/lib/workout/continuous";
import type { WorkoutSession } from "@/lib/types";
import type { TrainingItemInstance } from "@/lib/training/types";

/** Phase 4 — a short, honest completion line for a finished continuous item,
 * mirroring the resistance branch's own "state exactly what happened, never
 * a fabricated split" discipline (see lib/workout-analysis.ts's
 * describeContinuousExecution, which this intentionally matches).
 *
 * Phase 11A — an interval item's own real round count (never
 * duration/distance, which describe the ITEM as a whole and would be
 * misleading for a multi-round activity) — see ExecutionRecord.roundActuals. */
function continuousCompletionLine(name: string, session: WorkoutSession, itemId: string): string {
  const execution = session.continuousExecutions?.[itemId];
  if (!execution) return `${name} logged.`;
  const suffix = execution.status === "partial" ? " (partial)" : "";
  if (execution.roundActuals) {
    const completedRounds = execution.roundActuals.filter((r) => r.status === "completed").length;
    return `${name}: ${completedRounds} round${completedRounds === 1 ? "" : "s"} completed${suffix}.`;
  }
  const parts: string[] = [];
  if (execution.actual?.duration) parts.push(formatDurationMinutes(execution.actual.duration.seconds));
  if (execution.actual?.distance) parts.push(formatDistance(execution.actual.distance));
  return parts.length > 0 ? `${name}: ${parts.join(", ")} logged${suffix}.` : `${name} logged${suffix}.`;
}

/**
 * Phase 4.4B-2 §H — the short transition state between exercises. Never a
 * redundant "Mark exercise complete" button (the exercise already
 * auto-completed in canonical state the moment its final set resolved) —
 * this only summarizes what happened and introduces what's next.
 *
 * Phase 4 — now looks up both the finished and next item on the universal
 * Session (session.resolvedSession) rather than the legacy Workout, since a
 * continuous TrainingItemInstance has no legacy Exercise counterpart at
 * all — see findTrainingItemById. A resistance item's `.name` is identical
 * either way, so this is a strict generalization, not a behavior change for
 * existing resistance-only sessions.
 */
export function ExerciseTransitionPanel({
  finishedItem,
  nextItem,
  session,
}: {
  finishedItem: TrainingItemInstance | undefined;
  nextItem: TrainingItemInstance | undefined;
  session: WorkoutSession;
}) {
  const { dispatch } = usePrototypeState();
  const wasDeferred = finishedItem ? session.deferredExerciseIds.includes(finishedItem.id) : false;
  const finishedLog = finishedItem ? session.exerciseLogs[finishedItem.id] : undefined;
  const wasSkipped = finishedLog?.status === "skipped";
  const isResistance = finishedItem?.prescription.family === "resistance";
  const completedCount = isResistance ? completedWorkingSetCount(finishedLog) : 0;

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

      {finishedItem ? (
        <p className="mt-3 text-body text-off-white">
          {wasDeferred
            ? `${finishedItem.name} moved to later in the session.`
            : wasSkipped
              ? `${finishedItem.name} skipped.`
              : isResistance
                ? `${completedCount} working set${completedCount === 1 ? "" : "s"} logged for ${finishedItem.name}.`
                : continuousCompletionLine(finishedItem.name, session, finishedItem.id)}
        </p>
      ) : null}

      {nextItem ? (
        <div className="mt-4 border-t border-border pt-4 text-left">
          <p className="text-label text-neutral">Next</p>
          <p className="mt-0.5 text-heading text-off-white">{nextItem.name}</p>
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={() => dispatch({ type: "ENTER_EXERCISE_INTRO" })}>
        Continue
      </Button>
    </div>
  );
}
