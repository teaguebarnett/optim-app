"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useCountdown } from "@/hooks/use-countdown";
import {
  computeRecommendedWorkoutWindow,
  getWorkoutWindowPhase,
  WORKOUT_WINDOW_DEMO_SPEED_MULTIPLIER,
} from "@/lib/workout-window";
import type { DailyTaskState, ScheduleChangeChoice } from "@/lib/types";

const TIME_OPTIONS = ["9:00 AM", "12:30 PM", "3:00 PM", "6:00 PM"];

const SCHEDULE_CHOICES: Array<{ value: ScheduleChangeChoice; label: string }> = [
  { value: "earlier-than-planned", label: "Earlier than planned" },
  { value: "later-than-planned", label: "Later than planned" },
  { value: "cannot-train-today", label: "I cannot train today" },
  { value: "not-sure-yet", label: "I am not sure yet" },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function WorkoutWindowTask({ state }: { state: DailyTaskState }) {
  const { state: appState, dispatch } = usePrototypeState();
  const router = useRouter();
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);

  const windowIsPending = appState.workoutWindow.status === "pending";
  const mealConfirmedAtIso = appState.meals.breakfast?.completedAtIso;

  useEffect(() => {
    if (state === "recommended-now" && windowIsPending) {
      const reference = mealConfirmedAtIso ?? new Date().toISOString();
      const { startIso, endIso } = computeRecommendedWorkoutWindow(reference);
      dispatch({ type: "ACTIVATE_WORKOUT_WINDOW", startIso, endIso });
    }
  }, [state, windowIsPending, mealConfirmedAtIso, dispatch]);

  const startMs = useMemo(() => {
    const iso = appState.workoutWindow.windowStartIso;
    return iso ? new Date(iso).getTime() : null;
  }, [appState.workoutWindow.windowStartIso]);

  const endMs = useMemo(() => {
    const iso = appState.workoutWindow.windowEndIso;
    return iso ? new Date(iso).getTime() : null;
  }, [appState.workoutWindow.windowEndIso]);

  const countdown = useCountdown(startMs, WORKOUT_WINDOW_DEMO_SPEED_MULTIPLIER);

  const phase =
    countdown.nowMs !== null && startMs !== null && endMs !== null
      ? getWorkoutWindowPhase(countdown.nowMs, startMs, endMs)
      : "before";

  if (state === "locked") {
    return (
      <TaskShell
        title="Recommended workout window"
        icon={<AlarmClock size={17} />}
        state={state}
        lockedHint="Unlocks once breakfast is logged."
      />
    );
  }

  if (state !== "recommended-now") {
    return <TaskShell title="Recommended workout window" icon={<AlarmClock size={17} />} state={state} />;
  }

  function handleTrainNow() {
    dispatch({ type: "START_WORKOUT" });
    router.push("/training/workout");
  }

  const windowLabel =
    appState.workoutWindow.windowStartIso && appState.workoutWindow.windowEndIso
      ? `Recommended workout window: ${formatTime(appState.workoutWindow.windowStartIso)}–${formatTime(
          appState.workoutWindow.windowEndIso
        )}`
      : "Recommended workout window";

  return (
    <>
      <TaskShell title="Recommended workout window" icon={<AlarmClock size={17} />} state={state}>
        <p className="text-sm text-off-white">{windowLabel}</p>

        {phase === "before" ? (
          <>
            <p className="mt-1 text-sm text-neutral">
              Based on today&apos;s breakfast and schedule, your recommended workout window begins in:
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-accent-strong">{countdown.formatted}</p>
          </>
        ) : phase === "open" ? (
          <p className="mt-2 inline-flex items-center rounded-full bg-success-soft px-3 py-1.5 text-sm font-medium text-success">
            Your window is open now
          </p>
        ) : (
          <p className="mt-2 inline-flex items-center rounded-full bg-warning-soft px-3 py-1.5 text-sm font-medium text-warning">
            Your window has passed — you can still train now
          </p>
        )}

        <p className="mt-2 text-xs text-neutral">This is flexible guidance based on today&apos;s plan.</p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button onClick={handleTrainNow}>Train now</Button>
          <Button variant="outline" size="md" onClick={() => setTimeSheetOpen(true)}>
            Choose another time
          </Button>
          <Button variant="outline" size="md" onClick={() => setScheduleSheetOpen(true)}>
            My schedule changed
          </Button>
        </div>
      </TaskShell>

      <Sheet
        open={timeSheetOpen}
        onClose={() => setTimeSheetOpen(false)}
        title="Choose another time"
        description="We'll update today's plan to reflect your new training time."
      >
        <div className="grid grid-cols-2 gap-2">
          {TIME_OPTIONS.map((time) => (
            <button
              key={time}
              onClick={() => {
                dispatch({ type: "CHOOSE_WORKOUT_TIME", label: time });
                setTimeSheetOpen(false);
              }}
              className="min-h-[48px] rounded-[var(--radius-sm)] border border-border-strong px-3 py-2.5 text-sm font-medium text-off-white hover:border-accent/40"
            >
              {time}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={scheduleSheetOpen}
        onClose={() => setScheduleSheetOpen(false)}
        title="My schedule changed"
        description="Let us know what changed so today's plan stays accurate."
      >
        <div className="space-y-2">
          {SCHEDULE_CHOICES.map((choice) => (
            <button
              key={choice.value}
              onClick={() => {
                dispatch({ type: "SET_SCHEDULE_CHANGE", choice: choice.value });
                setScheduleSheetOpen(false);
              }}
              className="flex min-h-[48px] w-full items-center rounded-[var(--radius-sm)] border border-border-strong px-4 py-3 text-left text-sm font-medium text-off-white hover:border-accent/40"
            >
              {choice.label}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
