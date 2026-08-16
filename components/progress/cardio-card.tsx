import { ExpandableCard } from "./expandable-card";
import { StatusBadge } from "./status-badge";
import type { CardioCardModel, CardioDaySummaryModel } from "@/lib/progress/types";

function cardioBadge(day: CardioDaySummaryModel) {
  if (day.outcome === "complete") return <StatusBadge label="Completed" tone="success" />;
  if (day.outcome === "partial") return <StatusBadge label="Partial" tone="warning" />;
  if (day.outcome === "missed") return <StatusBadge label="Skipped" tone="error" />;
  if (day.outcome === "future") return <StatusBadge label="Upcoming" tone="neutral" />;
  return <StatusBadge label="No record" tone="neutral" />;
}

export function CardioCard({ cardio }: { cardio: CardioCardModel }) {
  const summary =
    cardio.status === "insufficient_data"
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
          {cardio.days.map((day) => (
            <li key={day.dateIso} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-off-white">{day.dayOfWeek}</p>
                <p className="text-xs text-neutral">
                  {day.outcome === "future"
                    ? "Upcoming"
                    : day.outcome === "no_record"
                      ? "No record"
                      : `${day.durationMin} of ${day.targetDurationMin} min${day.usedApprovedAlternative ? " · approved alternative" : ""}`}
                </p>
              </div>
              {cardioBadge(day)}
            </li>
          ))}
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
