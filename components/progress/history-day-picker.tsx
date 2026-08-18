"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { cn } from "@/lib/cn";
import { useHistoryDayPicker } from "@/hooks/use-historical-day-review";
import type { HistoryDayPickerStatus } from "@/lib/progress/types";

const DOT_TONE: Record<HistoryDayPickerStatus, string> = {
  complete: "bg-success",
  partial: "bg-warning",
  missed: "bg-error",
  not_applicable: "bg-border-strong",
  no_record: "bg-border-strong",
};

/**
 * Phase 4.3 — the Progress-page entry point into the read-only Historical
 * Day Review. A compact horizontal strip of recent past days (never today,
 * never a future date — see buildHistoryDayPickerEntries); selecting one
 * navigates to /progress/history/[date], preserving demo mode via the
 * query string so a day picked from a demo preview opens the matching demo
 * day rather than looking up (or leaking into) real live history.
 *
 * Timeline reads chronologically left-to-right (oldest -> newest), matching
 * buildHistoryDayPickerEntries' ordering. Scrolling left moves backward into
 * older history; scrolling right moves toward the present. Since the most
 * recent eligible day is what a client almost always wants first, the strip
 * scrolls itself to the rightmost (newest) entry exactly once, the first
 * time real entries are available — never on a later re-render, so the
 * client's own scroll position is never yanked back mid-review.
 */
export function HistoryDayPicker() {
  const { entries, demoQuery } = useHistoryDayPicker();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasPositionedRef = useRef(false);

  useEffect(() => {
    if (hasPositionedRef.current) return;
    if (entries.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    hasPositionedRef.current = true;
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <section className="px-4">
      <div className="rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)]">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-off-white">
          <History size={16} className="text-accent-strong" aria-hidden="true" />
          History
        </h2>
        <div ref={scrollRef} className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {entries.map((entry) => (
            <button
              key={entry.dateIso}
              type="button"
              onClick={() => router.push(`/progress/history/${entry.dateIso}${demoQuery}`)}
              className={cn(
                "flex shrink-0 flex-col items-center gap-1.5 rounded-[var(--radius-md)] border border-border-strong px-3 py-2.5 text-center transition-colors hover:border-accent/40"
              )}
              aria-label={`Review ${entry.dayOfWeek}, ${entry.shortLabel}`}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral">{entry.dayOfWeek.slice(0, 3)}</span>
              <span className="text-sm font-medium text-off-white">{entry.shortLabel}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", DOT_TONE[entry.status])} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
