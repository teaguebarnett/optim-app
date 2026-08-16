import { ExpandableCard } from "./expandable-card";
import { StatusBadge } from "./status-badge";
import type { TrainingCardModel, TrainingDaySummaryModel } from "@/lib/progress/types";

function dayBadge(day: TrainingDaySummaryModel) {
  if (day.outcome === "complete") return <StatusBadge label="Completed" tone="success" />;
  if (day.outcome === "partial") return <StatusBadge label="Partial" tone="warning" />;
  if (day.outcome === "missed") return <StatusBadge label="Skipped" tone="error" />;
  if (day.outcome === "not_applicable") {
    return <StatusBadge label={day.trainingDayType === "scheduled_rest" ? "Rest" : "No session"} tone="neutral" />;
  }
  if (day.outcome === "future") return <StatusBadge label={day.isToday ? "Today" : "Upcoming"} tone="neutral" />;
  return <StatusBadge label="No record" tone="neutral" />;
}

export function TrainingCard({ training }: { training: TrainingCardModel }) {
  const summaryText =
    training.status === "not_applicable"
      ? "No training scheduled this week"
      : training.status === "insufficient_data"
        ? "Not enough data yet this week"
        : `${training.fullyCompletedCount} of ${training.evaluableWorkoutDays} workouts`;

  const adherenceText = training.adherenceRatio !== null ? `${Math.round(training.adherenceRatio * 100)}% of prescribed sets` : null;

  return (
    <ExpandableCard
      title="Training"
      detailTitle="This week's training"
      detail={
        <ul className="space-y-2">
          {training.days.map((day) => (
            <li
              key={day.dateIso}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-off-white">
                  {day.dayOfWeek}
                  {day.isToday ? " · Today" : ""}
                </p>
                <p className="truncate text-xs text-neutral">{day.label}</p>
                {day.resolvedWithContext ? <p className="text-xs text-neutral">Reason provided</p> : null}
              </div>
              {dayBadge(day)}
            </li>
          ))}
        </ul>
      }
    >
      <p className="text-lg font-semibold text-off-white">{summaryText}</p>
      {training.partialOrEndedEarlyCount > 0 ? (
        <p className="mt-0.5 text-xs text-warning">{training.partialOrEndedEarlyCount} partial or ended early</p>
      ) : null}
      {adherenceText ? <p className="mt-1 text-xs text-neutral">{adherenceText}</p> : null}
    </ExpandableCard>
  );
}
