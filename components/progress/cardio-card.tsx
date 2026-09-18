"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ExpandableCard } from "./expandable-card";
import { StatusBadge } from "./status-badge";
import { useDemoQuery } from "@/hooks/use-historical-day-review";
import type { CardioCardModel, CardioDaySummaryModel } from "@/lib/progress/types";

function cardioBadge(day: CardioDaySummaryModel) {
  if (day.outcome === "complete") return <StatusBadge label="Completed" tone="success" />;
  if (day.outcome === "partial") return <StatusBadge label="Partial" tone="warning" />;
  if (day.outcome === "missed") return <StatusBadge label="Skipped" tone="error" />;
  if (day.outcome === "not_applicable") return <StatusBadge label="Not scheduled" tone="neutral" />;
  if (day.outcome === "future") return <StatusBadge label={day.isToday ? "Today" : "Upcoming"} tone="neutral" />;
  return <StatusBadge label="No record" tone="neutral" />;
}

export function CardioCard({ cardio }: { cardio: CardioCardModel }) {
  const demoQuery = useDemoQuery();
  const summary =
    cardio.status === "not_applicable"
      ? "No cardio scheduled this week"
      : cardio.status === "insufficient_data"
        ? "Not enough data yet"
        : cardio.targetDurationMin > 0
          ? `${cardio.completedDurationMin} of ${cardio.targetDurationMin} min`
          : `${cardio.completedDurationMin} min logged`;

  return (
    <ExpandableCard
      title="Cardio"
      detailTitle="This week's cardio"
      detail={
        <ul className="space-y-2">
          {cardio.days.map((day) => {
            // Gate 2D — same reasoning as Training/Nutrition's day rows: a
            // past day's cardio record is real archived evidence; today and
            // any future day stay plain (cardio has no separate "prescribed
            // day" browsing surface in Plan to send a future row to).
            const isPast = !day.isToday && day.outcome !== "future";
            const rowContent = (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-off-white">{day.dayOfWeek}</p>
                  <p className="text-xs text-neutral">
                    {day.outcome === "not_applicable"
                      ? "Not scheduled"
                      : day.outcome === "future"
                        ? day.isToday
                          ? "Today"
                          : "Upcoming"
                        : day.outcome === "no_record"
                          ? "No record"
                          : `${day.durationMin} of ${day.targetDurationMin} min${day.usedApprovedAlternative ? " · approved alternative" : ""}`}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  {cardioBadge(day)}
                  {isPast ? <ChevronRight size={14} className="text-neutral" aria-hidden="true" /> : null}
                </span>
              </>
            );
            return isPast ? (
              <li key={day.dateIso}>
                <Link
                  href={`/progress/history/${day.dateIso}${demoQuery}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5 transition-colors hover:bg-off-white/[0.06]"
                >
                  {rowContent}
                </Link>
              </li>
            ) : (
              <li key={day.dateIso} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
                {rowContent}
              </li>
            );
          })}
        </ul>
      }
    >
      <p className="text-lg font-semibold text-off-white">{summary}</p>
      {cardio.adherenceRatio !== null ? (
        <p className="mt-1 text-xs text-neutral">{Math.round(cardio.adherenceRatio * 100)}% of target</p>
      ) : null}
    </ExpandableCard>
  );
}
