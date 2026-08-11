"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { WorkoutDetailsSheet } from "@/components/workout/workout-details-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { PUSH_WORKOUT } from "@/lib/mock-data";
import type { DailyTaskState } from "@/lib/types";

export function WorkoutTask({
  state,
  emphasisOverride,
}: {
  state: DailyTaskState;
  emphasisOverride?: "primary" | "secondary";
}) {
  const { state: appState, dispatch, activeContext } = usePrototypeState();
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  if (state === "locked") {
    return (
      <TaskShell
        title={PUSH_WORKOUT.name}
        icon={<Dumbbell size={17} />}
        state={state}
        lockedHint="Unlocks once your workout window is set."
      />
    );
  }

  if (state === "completed" || state === "skipped") {
    return (
      <TaskShell
        title={PUSH_WORKOUT.name}
        icon={<Dumbbell size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
      />
    );
  }

  if (state === "partially-completed") {
    const summary = appState.workoutSession.summary;
    return (
      <TaskShell title={PUSH_WORKOUT.name} icon={<Dumbbell size={17} />} state={state} emphasisOverride={emphasisOverride}>
        <p className="text-sm text-off-white">Submitted with skipped work.</p>
        {summary ? <p className="mt-1 text-sm text-neutral">{summary.detail}</p> : null}
      </TaskShell>
    );
  }

  if (state === "awaiting-review") {
    const summary = appState.workoutSession.summary;
    return (
      <TaskShell title={PUSH_WORKOUT.name} icon={<Dumbbell size={17} />} state={state} emphasisOverride={emphasisOverride}>
        {summary ? (
          <div>
            <p className="text-sm text-off-white">{summary.headline}</p>
            <p className="mt-1 text-sm text-neutral">{summary.detail}</p>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-warning">
          I&apos;ve organized this for {coachName}&apos;s review. {coachName} will make any programming decisions.
        </p>
      </TaskShell>
    );
  }

  const isInProgress = state === "in-progress";

  function handleBeginWorkout() {
    if (!isInProgress) {
      dispatch({ type: "START_WORKOUT" });
    }
    router.push("/training/workout");
  }

  return (
    <>
      <TaskShell title={PUSH_WORKOUT.name} icon={<Dumbbell size={17} />} state={state} emphasisOverride={emphasisOverride}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral">
          <span>{PUSH_WORKOUT.estimatedDurationMin} min</span>
          <span aria-hidden="true">·</span>
          <span>{PUSH_WORKOUT.exercises.length} exercises</span>
          <span aria-hidden="true">·</span>
          <span>{PUSH_WORKOUT.focus}</span>
        </div>

        {!isInProgress && (
          <div className="mt-3 rounded-[var(--radius-sm)] bg-off-white/[0.04] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral">Note from {coachName}</p>
            <p className="mt-1 text-sm text-off-white">{PUSH_WORKOUT.coachNote}</p>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={handleBeginWorkout}>
            {isInProgress ? "Resume workout" : "Begin workout"}
          </Button>
          <Button variant="outline" onClick={() => setDetailsOpen(true)}>
            View details
          </Button>
        </div>

        <button
          onClick={() => router.push("/training")}
          className="mt-3 w-full text-center text-sm font-medium text-accent-strong hover:underline"
        >
          See plan
        </button>
      </TaskShell>
      <WorkoutDetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </>
  );
}
