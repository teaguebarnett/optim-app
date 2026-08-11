"use client";

import { useState } from "react";
import { UtensilsCrossed, Clock3 } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { MealSelectionSheet } from "@/components/meals/meal-selection-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import type { DailyTaskState, MealPeriod } from "@/lib/types";

const LOCKED_HINTS: Partial<Record<MealPeriod, string>> = {
  postWorkout: "Unlocks once today's workout is completed or skipped.",
  lunch: "Unlocks after your post-workout meal is logged.",
  dinner: "Unlocks after lunch is logged.",
  snack: "Unlocks after dinner is logged.",
};

function formatTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function MealTask({
  period,
  state,
  emphasisOverride,
}: {
  period: MealPeriod;
  state: DailyTaskState;
  emphasisOverride?: "primary" | "secondary";
}) {
  const { state: appState } = usePrototypeState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const selection = appState.meals[period];
  const label = MEAL_PERIOD_LABELS[period];

  if (state === "locked") {
    return (
      <TaskShell
        title={label}
        icon={<UtensilsCrossed size={17} />}
        state={state}
        lockedHint={LOCKED_HINTS[period]}
      />
    );
  }

  if (state === "completed" && selection) {
    return (
      <TaskShell
        title={`${label} logged`}
        icon={<UtensilsCrossed size={17} />}
        state={state}
        emphasisOverride="quiet"
      />
    );
  }

  return (
    <>
      <TaskShell
        title={label}
        icon={<UtensilsCrossed size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        timeLabel={selection?.completedAtIso ? `Logged at ${formatTime(selection.completedAtIso)}` : undefined}
      >
        {selection?.source === "skipped" ? (
          <div>
            <p className="text-sm text-neutral">
              Skipped — {SKIP_REASON_LABELS[selection.skipReason ?? "other"]}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setSheetOpen(true)}>
              Log something instead
            </Button>
          </div>
        ) : selection?.source === "planned-later" ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm text-neutral">
              <Clock3 size={14} /> Planned for later
            </p>
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              Choose now
            </Button>
          </div>
        ) : (
          <Button onClick={() => setSheetOpen(true)} className="w-full">
            Choose your {label.toLowerCase()}
          </Button>
        )}
      </TaskShell>
      <MealSelectionSheet period={period} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
