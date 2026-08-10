"use client";

import { CheckCircle2 } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { NUTRITION_TARGETS, TRAINING_WEEK } from "@/lib/mock-data";
import type { DailyTaskState } from "@/lib/types";

export function DailyCompletionTask({ state }: { state: DailyTaskState }) {
  const { state: appState, nutritionTotals } = usePrototypeState();

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

  const proteinStatus =
    nutritionTotals.proteinG >= NUTRITION_TARGETS.proteinG
      ? "Target reached"
      : `${Math.round((nutritionTotals.proteinG / NUTRITION_TARGETS.proteinG) * 100)}% of target`;

  const tuesday = TRAINING_WEEK.find((d) => d.dayOfWeek === "Tuesday");

  return (
    <TaskShell
      title="Monday complete."
      icon={<CheckCircle2 size={17} />}
      state={state}
      emphasisOverride="primary"
    >
      <p className="text-sm text-off-white">Nice work staying consistent today.</p>

      <ul className="mt-3 space-y-1.5 text-sm text-neutral">
        <li>
          Workout —{" "}
          <span className="text-off-white">
            {appState.workoutSession.status === "completed" ? "completed" : "skipped"}
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

      <div className="mt-4 rounded-[var(--radius-sm)] bg-white/[0.04] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Prepare for tomorrow</p>
        <p className="mt-1 text-sm text-off-white">
          Set out tomorrow&apos;s training clothes and make sure breakfast ingredients are ready.
        </p>
        {tuesday ? (
          <p className="mt-2 text-xs text-neutral">
            Tuesday: {tuesday.workoutName} — {tuesday.focus}
          </p>
        ) : null}
      </div>
    </TaskShell>
  );
}
