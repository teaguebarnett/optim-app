"use client";

import { MorningWeightTask } from "@/components/today/tasks/morning-weight-task";
import { MealTask } from "@/components/today/tasks/meal-task";
import { WorkoutTask } from "@/components/today/tasks/workout-task";
import { CardioTask } from "@/components/today/tasks/cardio-task";
import { DailyCompletionTask } from "@/components/today/tasks/daily-completion-task";
import { emphasisForState } from "@/components/today/task-shell";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { DailyPlanResult } from "@/lib/planning/types";
import type { DailyTaskId, DailyTaskState } from "@/lib/types";

/**
 * Today-screen hierarchy item #4: the client's day as a clean, scannable
 * sequence. Ordering and which items appear at all come from the planner
 * (lib/planning/planner.ts) — this component only renders them. The
 * dominant next action (if any) is the one item shown with primary
 * emphasis; every other item is deliberately calmer, and none of them are
 * ever rendered "locked" — see lib/calculations.ts's flexible task states.
 */
export function AdaptiveSchedule({ dailyPlan }: { dailyPlan: DailyPlanResult }) {
  const { tasks } = usePrototypeState();
  const taskState = (id: DailyTaskId): DailyTaskState => tasks.find((t) => t.id === id)?.state ?? "upcoming";

  function emphasisFor(itemId: string, state: DailyTaskState, isNextAction: boolean): "primary" | "secondary" | undefined {
    if (isNextAction) return "primary";
    return emphasisForState(state) === "primary" ? "secondary" : undefined;
  }

  return (
    <div className="space-y-2.5 px-4">
      {dailyPlan.items.map((item) => {
        if (item.kind === "training-time") return null; // rendered separately, above the schedule

        const caption =
          item.timeLabel && item.explanation
            ? `${item.timeLabel} — ${item.explanation}`
            : item.timeLabel ?? item.explanation;

        return (
          <div key={item.id} id={item.id}>
            {caption ? <p className="mb-1.5 px-1 text-xs text-neutral">{caption}</p> : null}

            {item.kind === "morning-weight" ? (
              <MorningWeightTask
                state={taskState("morning-weight")}
                emphasisOverride={emphasisFor(item.id, taskState("morning-weight"), item.isNextAction)}
              />
            ) : item.kind === "workout" ? (
              <WorkoutTask
                state={taskState("workout")}
                emphasisOverride={emphasisFor(item.id, taskState("workout"), item.isNextAction)}
              />
            ) : item.kind === "cardio" ? (
              <CardioTask
                state={taskState("cardio")}
                emphasisOverride={emphasisFor(item.id, taskState("cardio"), item.isNextAction)}
              />
            ) : item.kind === "review" ? (
              <DailyCompletionTask state={taskState("daily-completion")} />
            ) : item.id === "breakfast" ? (
              <MealTask
                period="breakfast"
                state={taskState("breakfast")}
                emphasisOverride={emphasisFor(item.id, taskState("breakfast"), item.isNextAction)}
              />
            ) : item.id === "post-workout-meal" ? (
              <MealTask
                period="postWorkout"
                state={taskState("post-workout-meal")}
                emphasisOverride={emphasisFor(item.id, taskState("post-workout-meal"), item.isNextAction)}
              />
            ) : item.id === "lunch" ? (
              <MealTask
                period="lunch"
                state={taskState("lunch")}
                emphasisOverride={emphasisFor(item.id, taskState("lunch"), item.isNextAction)}
              />
            ) : item.id === "dinner" ? (
              <MealTask
                period="dinner"
                state={taskState("dinner")}
                emphasisOverride={emphasisFor(item.id, taskState("dinner"), item.isNextAction)}
              />
            ) : item.id === "snack" ? (
              <MealTask
                period="snack"
                state={taskState("snack")}
                emphasisOverride={emphasisFor(item.id, taskState("snack"), item.isNextAction)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
