"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { ClientAssignedProgram, ProgramDay } from "@/lib/types";

/**
 * Phase 5.6A.1 — the actual weekly program, inspectable without forcing the
 * coach through tiny pills and deeply nested modals (spec Part 2's Training
 * review): the weekly split at a glance, Week 1 fully expanded inline by
 * default, and a compact multi-week progression strip for direct access to
 * every other week (still via ProgramWeekPreviewSheet — see the caller —
 * now contrast-fixed for both themes).
 */
export function PlanTrainingReview({ program, onOpenWeek }: { program: ClientAssignedProgram; onOpenWeek: (weekNumber: number) => void }) {
  const week1 = program.weeks.find((w) => w.weekNumber === 1) ?? program.weeks[0];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-subheading text-off-white">{program.name}</p>
          <p className="text-meta text-neutral">
            {program.durationWeeks}-week program &middot; {week1.days.filter((d) => d.type === "training").length} training days/week
          </p>
        </div>

        {/* Weekly split at a glance */}
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {week1.days.map((day) => (
            <div key={day.dayOfWeek} className={cn("rounded-[var(--radius-sm)] px-1.5 py-2 text-center", day.type === "training" ? "bg-accent-soft" : "bg-surface-raised")}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral">{day.dayOfWeek.slice(0, 3)}</p>
              <p className={cn("mt-1 text-xs font-medium", day.type === "training" ? "text-accent-fg" : "text-neutral")}>{day.type === "training" ? "Train" : "Rest"}</p>
            </div>
          ))}
        </div>

        {/* Compact multi-week progression overview */}
        {program.weeks.length > 1 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral">Progression — {program.weeks.length} weeks</p>
            <div className="flex flex-wrap gap-1.5">
              {program.weeks.map((w) => (
                <button
                  key={w.weekNumber}
                  onClick={() => onOpenWeek(w.weekNumber)}
                  className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-off-white hover:border-accent/50 hover:bg-surface-input"
                >
                  Wk {w.weekNumber}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <p className="text-subheading text-off-white">Week 1</p>
        <p className="mt-0.5 text-meta text-neutral">Expanded by default — every other week is one click away above.</p>
        <div className="mt-3 space-y-2">
          {week1.days.map((day) => (
            <WeekDayRow key={day.dayOfWeek} day={day} />
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * Exported so the active-plan screen's current-week view (see
 * active-plan-current-week.tsx) can render each day with the exact same
 * detail-level treatment as the pre-approval review, rather than a second,
 * subtly different implementation. `isToday` marks the client's real
 * current local day — a display affordance only, never a gate on which
 * days are editable (that stays governed entirely by week number).
 */
export function WeekDayRow({ day, isToday }: { day: ProgramDay; isToday?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (day.type === "rest" || !day.workout) {
    return (
      <div className={cn("flex items-center justify-between rounded-[var(--radius-sm)] border px-3.5 py-2.5", isToday ? "border-accent/50 bg-accent-soft/30" : "border-border")}>
        <p className="flex items-center gap-2 text-sm font-medium text-off-white">
          {day.dayOfWeek}
          {isToday ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-accent">Today</span> : null}
        </p>
        <p className="text-sm text-neutral">Rest day</p>
      </div>
    );
  }

  const workout = day.workout;
  return (
    <div className={cn("rounded-[var(--radius-sm)] border", isToday ? "border-accent/50 bg-accent-soft/20" : "border-border-strong")}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-off-white">
            {day.dayOfWeek} &middot; {workout.name}
            {isToday ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-accent">Today</span> : null}
          </p>
          <p className="text-meta text-neutral">
            {workout.focus} &middot; ~{workout.estimatedDurationMin} min &middot; {workout.exercises.length} exercises
          </p>
        </div>
        {expanded ? <ChevronUp size={16} className="shrink-0 text-neutral" aria-hidden="true" /> : <ChevronDown size={16} className="shrink-0 text-neutral" aria-hidden="true" />}
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-border px-3.5 pb-3.5 pt-3">
          {workout.exercises.map((ex, i) => (
            <div key={ex.id} className="rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2.5">
              <p className="text-sm font-semibold text-off-white">
                {i + 1}. {ex.name}
              </p>
              <p className="mt-0.5 text-sm text-neutral">
                {ex.workingSets} sets &middot; {ex.targetRepsLow}–{ex.targetRepsHigh} reps &middot; RPE {ex.targetRpe} &middot; Rest {ex.restSeconds}s
              </p>
              {ex.cue ? <p className="mt-0.5 text-meta text-neutral">{ex.cue}</p> : null}
            </div>
          ))}
          {workout.coachNote ? <p className="text-meta text-neutral">Coach note: {workout.coachNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
