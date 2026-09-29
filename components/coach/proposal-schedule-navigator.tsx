"use client";

// Week + day navigation for the proposal review (components/coach/
// program-proposal-review.tsx). The day panels are rendered on the server,
// with all of their edit forms and server actions, and passed in as props.
// This component only chooses which one is visible, replacing the old stack
// of nested <details> that forced a coach to scroll through every week.
// One week and one day at a time, with scrollable chips and previous/next
// controls that work the same on desktop and mobile.

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface NavigatorDay {
  key: string;
  label: string;
  sublabel: string;
  panel: ReactNode;
}

export interface NavigatorWeek {
  weekNumber: number;
  summary: string;
  restDaysLabel: string | null;
  days: NavigatorDay[];
}

function chipClass(active: boolean): string {
  return `shrink-0 rounded-[var(--radius-sm)] border px-3 py-1.5 text-left text-sm transition-colors ${
    active ? "border-accent bg-accent-soft text-off-white" : "border-border-strong bg-surface text-neutral hover:text-off-white"
  }`;
}

export function ProposalScheduleNavigator({ weeks }: { weeks: NavigatorWeek[] }) {
  const [weekIndex, setWeekIndex] = useState(0);
  const [dayKey, setDayKey] = useState<string | null>(weeks[0]?.days[0]?.key ?? null);

  if (weeks.length === 0) return null;
  const week = weeks[Math.min(weekIndex, weeks.length - 1)];
  // Keep the same weekday selected when moving between weeks, if it exists.
  const day = week.days.find((d) => d.key === dayKey) ?? week.days[0] ?? null;

  function goToWeek(index: number) {
    setWeekIndex(Math.max(0, Math.min(weeks.length - 1, index)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToWeek(weekIndex - 1)}
          disabled={weekIndex === 0}
          aria-label="Previous week"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong text-neutral hover:text-off-white disabled:opacity-40"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Program weeks">
          {weeks.map((w, i) => (
            <button key={w.weekNumber} type="button" role="tab" aria-selected={i === weekIndex} onClick={() => goToWeek(i)} className={chipClass(i === weekIndex)}>
              Week {w.weekNumber}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => goToWeek(weekIndex + 1)}
          disabled={weekIndex === weeks.length - 1}
          aria-label="Next week"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong text-neutral hover:text-off-white disabled:opacity-40"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <p className="text-xs text-neutral">
        {week.summary}
        {week.restDaysLabel ? ` · Rest: ${week.restDaysLabel}` : ""}
      </p>

      {week.days.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label={`Week ${week.weekNumber} training days`}>
          {week.days.map((d) => (
            <button key={d.key} type="button" role="tab" aria-selected={day?.key === d.key} onClick={() => setDayKey(d.key)} className={chipClass(day?.key === d.key)}>
              <span className="block font-medium">{d.label}</span>
              <span className="block max-w-[10rem] truncate text-xs">{d.sublabel}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral">No training days this week.</p>
      )}

      {day ? <div key={`${week.weekNumber}-${day.key}`}>{day.panel}</div> : null}
    </div>
  );
}
