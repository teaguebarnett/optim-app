import { OutcomeBadge } from "./outcome-badge";
import type { HistoricalDaySummaryModel } from "@/lib/progress/types";

function formatFullDate(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function DaySummarySection({ summary }: { summary: HistoricalDaySummaryModel }) {
  const weekLabel =
    summary.programWeek !== null
      ? `Week ${summary.programWeek}`
      : summary.programPhase === "pre_program"
        ? "Before program start"
        : "After program end";

  return (
    <div>
      <p className="text-lg font-semibold text-off-white">{formatFullDate(summary.dateIso)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={summary.hasRecord ? summary.overallStatus : "no_record"} />
        <span className="text-sm text-neutral">{weekLabel}</span>
      </div>
      {!summary.hasRecord ? (
        <p className="mt-2.5 text-sm text-neutral">Nothing was recorded for this date.</p>
      ) : null}
    </div>
  );
}
