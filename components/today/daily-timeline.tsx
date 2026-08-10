"use client";

import { usePrototypeState } from "@/hooks/use-prototype-state";
import { MorningWeightTask } from "@/components/today/tasks/morning-weight-task";
import { MealTask } from "@/components/today/tasks/meal-task";
import { WorkoutWindowTask } from "@/components/today/tasks/workout-window-task";
import { WorkoutTask } from "@/components/today/tasks/workout-task";
import { CardioTask } from "@/components/today/tasks/cardio-task";
import { DailyCompletionTask } from "@/components/today/tasks/daily-completion-task";

export function DailyTimeline() {
  const { tasks } = usePrototypeState();
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t.state]));

  return (
    <div className="space-y-3 px-4 pb-4">
      <MorningWeightTask state={byId["morning-weight"]} />
      <MealTask period="breakfast" state={byId["breakfast"]} />
      <WorkoutWindowTask state={byId["workout-window"]} />
      <WorkoutTask state={byId["workout"]} />
      <MealTask period="postWorkout" state={byId["post-workout-meal"]} />
      <MealTask period="lunch" state={byId["lunch"]} />
      <CardioTask state={byId["cardio"]} />
      <MealTask period="dinner" state={byId["dinner"]} />
      <MealTask period="snack" state={byId["snack"]} />
      <DailyCompletionTask state={byId["daily-completion"]} />
    </div>
  );
}
