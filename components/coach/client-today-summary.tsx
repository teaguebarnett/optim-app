import { Clock3, Dumbbell, Utensils } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { AppState } from "@/lib/state";
import type { MealPeriod } from "@/lib/types";

const MEAL_PERIODS: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner", "snack"];

const WORKOUT_STATUS_LABEL: Record<string, string> = {
  "not-started": "Not started yet",
  "in-progress": "In progress right now",
  completed: "Completed",
  skipped: "Skipped",
  "ended-early": "Ended early",
};

/**
 * "Today" (spec §5.4) — training time, current workout, nutrition timing,
 * completion, and anything being monitored, read directly from this
 * client's own real AppState. No decorative analytics, no fabricated
 * "next expected action" beyond what's directly derivable from real state.
 */
export function ClientTodaySummary({ clientAppState, monitoredItems }: { clientAppState: AppState; monitoredItems: AttentionQueueItem[] }) {
  const trainingPlan = clientAppState.dailyTrainingPlan;
  const trainingTimeLabel =
    trainingPlan?.status === "scheduled"
      ? trainingPlan.plannedTimeLabel
      : trainingPlan?.status === "rest_day"
        ? "Rest day"
        : trainingPlan?.status === "unsure"
          ? "Not sure yet"
          : "Not set yet";

  const mealsSelected = MEAL_PERIODS.filter((p) => clientAppState.meals[p]).length;

  return (
    <Card className="space-y-3">
      <p className="text-subheading text-off-white">Today</p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <Clock3 size={15} className="mt-0.5 shrink-0 text-neutral" aria-hidden="true" />
          <div>
            <p className="text-meta text-neutral">Training time</p>
            <p className="text-sm text-off-white">{trainingTimeLabel}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Dumbbell size={15} className="mt-0.5 shrink-0 text-neutral" aria-hidden="true" />
          <div>
            <p className="text-meta text-neutral">Workout</p>
            <p className="text-sm text-off-white">{WORKOUT_STATUS_LABEL[clientAppState.workoutSession.status] ?? clientAppState.workoutSession.status}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Utensils size={15} className="mt-0.5 shrink-0 text-neutral" aria-hidden="true" />
          <div>
            <p className="text-meta text-neutral">Nutrition</p>
            <p className="text-sm text-off-white">{mealsSelected} of {MEAL_PERIODS.length} meals logged</p>
          </div>
        </div>
      </div>

      {monitoredItems.length > 0 ? (
        <div className="border-t border-border pt-2.5">
          <p className="text-meta text-neutral">Being monitored</p>
          <ul className="mt-1 space-y-0.5 text-sm text-off-white">
            {monitoredItems.map((item) => (
              <li key={item.reviewRequestId}>&bull; {ATTENTION_KIND_LABELS[item.kind]}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
