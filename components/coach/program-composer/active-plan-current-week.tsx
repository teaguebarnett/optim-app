"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { WeekDayRow } from "@/components/coach/program-composer/plan-training-review";
import type { ClientAssignedProgram } from "@/lib/types";
import type { DayOfWeek } from "@/lib/types";

/**
 * Phase 5.6A.2 — the active-plan screen leads with the CURRENT week (spec
 * Part 1), not twelve equally-weighted week pills. The full 12-week
 * timeline stays one click away behind "View full program" rather than
 * dominating the first card. Preserves the existing rule (enforced
 * elsewhere — program-revision.ts's own weeksToTouch/applyProgramRevision;
 * this component only reflects it, never re-implements it) that a
 * completed week strictly before the client's current week can never be
 * rewritten; the current week and every future week stay eligible for a
 * real coach- or OPTIM-driven adjustment.
 */
export function ActivePlanCurrentWeek({
  program,
  currentWeekNumber,
  todayDayOfWeek,
  onOpenWeek,
}: {
  program: ClientAssignedProgram;
  currentWeekNumber: number;
  todayDayOfWeek: DayOfWeek;
  onOpenWeek: (weekNumber: number) => void;
}) {
  const [fullProgramOpen, setFullProgramOpen] = useState(false);
  const currentWeek = program.weeks.find((w) => w.weekNumber === currentWeekNumber) ?? program.weeks[0];

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-subheading text-off-white">Week {currentWeek.weekNumber}</p>
          <p className="text-meta text-neutral">
            {currentWeek.days.filter((d) => d.type === "training").length} training days &middot; {currentWeek.days.filter((d) => d.type === "rest").length} rest days
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {currentWeek.days.map((day) => (
            <WeekDayRow key={day.dayOfWeek} day={day} isToday={day.dayOfWeek === todayDayOfWeek} />
          ))}
        </div>
      </Card>

      <button
        type="button"
        onClick={() => setFullProgramOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-off-white hover:bg-surface-input"
      >
        View full program — {program.durationWeeks} weeks
        {fullProgramOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>

      {fullProgramOpen ? (
        <Card>
          <p className="flex items-center gap-1.5 text-meta text-neutral">
            <Lock size={12} aria-hidden="true" /> Completed weeks are locked — week {currentWeekNumber} onward can still be adjusted.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {program.weeks.map((w) => (
              <button
                key={w.weekNumber}
                onClick={() => onOpenWeek(w.weekNumber)}
                className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-off-white hover:border-accent/50 hover:bg-surface-input"
              >
                Wk {w.weekNumber}
                {w.weekNumber === currentWeekNumber ? " · current" : w.weekNumber < currentWeekNumber ? " · done" : ""}
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
