"use client";

import { resolveDisplayTargets } from "@/lib/nutrition/plan-display";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { ReviewTodaySheet } from "@/components/today/review-today-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { trainingWeekEntryForDay } from "@/lib/mock-data";
import { addDaysToLocalDate, localDateDayOfWeek } from "@/lib/shared/local-date";
import type { DailyTaskState } from "@/lib/types";

const WORKOUT_STATUS_TEXT: Record<string, string> = {
  completed: "completed",
  "ended-early": "ended early",
  skipped: "skipped",
};

export function DailyCompletionTask({ state }: { state: DailyTaskState }) {
  const { state: appState, nutritionTotals } = usePrototypeState();
  const [reviewOpen, setReviewOpen] = useState(false);

  if (state === "locked") {
    return (
      <TaskShell
        title="Daily completion"
        icon={<CheckCircle2 size={17} />}
        state={state}
        lockedHint="Wraps up once today's plan is complete."
      />
    );
  }

  // No assigned targets: report what was logged, never a % of an invented target.
  // U3A — a method plan's prescribed protein counts; a plan without a protein target says so (not "unassigned").
  const display = resolveDisplayTargets(appState);
  const proteinTarget = display.proteinG;
  const proteinStatus =
    proteinTarget === null
      ? `${Math.round(nutritionTotals.proteinG)}g logged — ${display.planAssigned ? "no protein target" : "no target assigned"}`
      : nutritionTotals.proteinG >= proteinTarget
        ? "Target reached"
        : `${Math.round((nutritionTotals.proteinG / proteinTarget) * 100)}% of target`;

  // Phase 4.1 corrective — "today" and "tomorrow" resolve from the real
  // client-local effective date rather than being hardcoded to Monday/
  // Tuesday, so this card (and its "prepare for tomorrow" preview) stays
  // honest on whichever real day it's actually shown.
  const todayDayOfWeek = localDateDayOfWeek(appState.dateIso);
  const tomorrowDayOfWeek = localDateDayOfWeek(addDaysToLocalDate(appState.dateIso, 1));
  const tomorrow = trainingWeekEntryForDay(tomorrowDayOfWeek);

  return (
    <>
      <TaskShell
        title={`${todayDayOfWeek} complete.`}
        icon={<CheckCircle2 size={17} />}
        state={state}
        emphasisOverride="primary"
      >
        <p className="text-body text-off-white">Nice work staying consistent today.</p>

        <ul className="mt-3 space-y-1.5 text-meta text-neutral">
          <li>
            Workout —{" "}
            <span className="text-off-white">
              {WORKOUT_STATUS_TEXT[appState.workoutSession.status] ?? "not started"}
            </span>
          </li>
          <li>
            Meals —{" "}
            <span className="text-off-white">
              {Object.values(appState.meals).filter((m) => m && m.source !== "planned-later").length} of 5 logged
            </span>
          </li>
          <li>
            Protein — <span className="text-off-white">{proteinStatus}</span>
          </li>
          <li>
            Cardio —{" "}
            <span className="text-off-white">
              {appState.cardio.status === "completed" ? "completed" : "skipped"}
            </span>
          </li>
        </ul>

        <div className="mt-4 rounded-[var(--radius-sm)] bg-off-white/[0.04] p-3">
          <p className="text-label text-neutral">Prepare for tomorrow</p>
          <p className="mt-1 text-body text-off-white">
            Set out tomorrow&apos;s training clothes and make sure breakfast ingredients are ready.
          </p>
          {tomorrow ? (
            <p className="mt-2 text-meta text-neutral">
              {tomorrowDayOfWeek}: {tomorrow.type === "rest" ? "Rest day" : `${tomorrow.workoutName} — ${tomorrow.focus}`}
            </p>
          ) : null}
        </div>

        <Button variant="outline" className="mt-3 w-full" onClick={() => setReviewOpen(true)}>
          Review today
        </Button>
      </TaskShell>
      <ReviewTodaySheet open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
