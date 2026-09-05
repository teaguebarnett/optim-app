"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { WorkoutDetailsSheet } from "@/components/workout/workout-details-sheet";
import type { DayOfWeek, ProgramWeek } from "@/lib/types";

/**
 * "Preview client-facing Training experience before activation" — reuses
 * the exact same WorkoutDetailsSheet the real client Training/Today pages
 * already use to preview a day's session, rather than building a second,
 * disconnected preview surface. Only one Sheet is ever open at a time
 * (the week list, or a day's detail) so there's no nested-modal focus
 * fight — picking a day swaps the list out for the detail rather than
 * stacking on top of it.
 */
export function ProgramWeekPreviewSheet({ week, open, onClose }: { week: ProgramWeek | null; open: boolean; onClose: () => void }) {
  const [previewDay, setPreviewDay] = useState<DayOfWeek | null>(null);

  if (!week) return null;
  const previewedDay = week.days.find((d) => d.dayOfWeek === previewDay) ?? null;

  return (
    <>
      <Sheet
        open={open && !previewedDay}
        onClose={onClose}
        title={`Week ${week.weekNumber} preview`}
        description="Exactly what the client will see for each day this week."
      >
        <div className="space-y-2">
          {week.days.map((day) => {
            const disabled = day.type === "rest";
            return (
              <button
                key={day.dayOfWeek}
                type="button"
                disabled={disabled}
                onClick={() => setPreviewDay(day.dayOfWeek)}
                className="flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3.5 py-3 text-left disabled:opacity-50"
              >
                <span className="text-sm font-medium text-off-white">{day.dayOfWeek}</span>
                <span className="text-sm text-neutral">{day.type === "rest" ? "Rest day" : (day.workout?.name ?? "No session authored yet")}</span>
              </button>
            );
          })}
        </div>
      </Sheet>

      {previewedDay ? (
        <WorkoutDetailsSheet
          open
          onClose={() => setPreviewDay(null)}
          workout={previewedDay.workout ?? null}
          fallbackName={previewedDay.dayOfWeek}
        />
      ) : null}
    </>
  );
}
