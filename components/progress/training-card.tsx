"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ExpandableCard } from "./expandable-card";
import { StatusBadge } from "./status-badge";
import { useDemoQuery } from "@/hooks/use-historical-day-review";
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

// Gate 2D — each past day here has a real archived record to open (the
// exact same Historical Day Review /progress's own History strip already
// links into); each future day has a real prescribed session waiting in
// Plan. Today's own row gets neither: it's already what this whole page is
// about, and /progress/history explicitly refuses today's date (see
// app/(client)/progress/history/[date]/page.tsx). Never a fabricated
// destination for a day with nothing to show.
function dayDestination(day: TrainingDaySummaryModel, demoQuery: string): string | null {
  if (day.isToday) return null;
  if (day.outcome === "future") return `/plan?tab=training&date=${day.dateIso}`;
  return `/progress/history/${day.dateIso}${demoQuery}`;
}

export function TrainingCard({ training }: { training: TrainingCardModel }) {
  const demoQuery = useDemoQuery();
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
          {training.days.map((day) => {
            const destination = dayDestination(day, demoQuery);
            const rowContent = (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-off-white">
                    {day.dayOfWeek}
                    {day.isToday ? " · Today" : ""}
                  </p>
                  <p className="truncate text-xs text-neutral">{day.label}</p>
                  {day.resolvedWithContext ? <p className="text-xs text-neutral">Reason provided</p> : null}
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  {dayBadge(day)}
                  {destination ? <ChevronRight size={14} className="text-neutral" aria-hidden="true" /> : null}
                </span>
              </>
            );
            return (
              <li key={day.dateIso}>
                {destination ? (
                  <Link
                    href={destination}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5 transition-colors hover:bg-off-white/[0.06]"
                  >
                    {rowContent}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
                    {rowContent}
                  </div>
                )}
              </li>
            );
          })}
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
