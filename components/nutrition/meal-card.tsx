"use client";

import { useState } from "react";
import { Camera, Check, ChevronRight, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MealSelectionSheet } from "@/components/meals/meal-selection-sheet";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import { deriveMealCardStatus, mealDisplayName, mealProvenanceLabel, nextRelevantMealPeriod, TASK_ID_FOR_PERIOD } from "@/lib/nutrition/view-model";
import type { MealPeriod } from "@/lib/types";

/**
 * One meal in today's sequence. Status/emphasis is derived, never stored —
 * see lib/nutrition/view-model.ts's deriveMealCardStatus, built directly on
 * the same per-meal DailyTaskState Today reads (usePrototypeState().tasks),
 * so the two screens can never disagree about whether a meal is logged,
 * skipped, or still open. Every status renders as one tappable surface that
 * opens the same MealSelectionSheet — confirm a planned meal, log by photo,
 * correct manually, or reopen an already-logged meal — never a duplicate
 * modal system.
 */
export function MealCard({ period }: { period: MealPeriod }) {
  const { state, dailyPlan, tasks } = usePrototypeState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitialView, setSheetInitialView] = useState<"options" | "photo">("options");

  const selection = state.meals[period];
  const entry = dailyPlan.mealSchedule.entries[period];
  const taskState = tasks.find((t) => t.id === TASK_ID_FOR_PERIOD[period])?.state;
  const isNextAction = nextRelevantMealPeriod(state, dailyPlan) === period;
  const status = deriveMealCardStatus({ taskState, isNextAction, scheduleEntry: entry, now: new Date() });

  const label = MEAL_PERIOD_LABELS[period];
  const displayName = mealDisplayName(period, selection);
  const provenance = mealProvenanceLabel(selection);

  function openSheet(view: "options" | "photo" = "options") {
    setSheetInitialView(view);
    setSheetOpen(true);
  }

  if (status === "current") {
    const roleLabel = entry?.role === "pre-workout" ? "Pre-training" : entry?.role === "post-workout" ? "Post-training" : null;
    return (
      <>
        <div className="rounded-[var(--radius-lg)] border border-brass/30 bg-charcoal p-4 shadow-[var(--shadow-subtle)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-brass-strong">Right now</span>
            {roleLabel ? <span className="text-meta text-neutral">{roleLabel}</span> : null}
          </div>
          <p className="mt-1.5 text-heading text-off-white">{label}</p>
          {entry?.timeLabel ? <p className="text-meta text-neutral">{entry.timeLabel}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => openSheet("options")}>
              Log {label.toLowerCase()}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Log ${label} with a photo`}
              onClick={() => openSheet("photo")}
            >
              <Camera size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
        <MealSelectionSheet period={period} open={sheetOpen} initialView={sheetInitialView} onClose={() => setSheetOpen(false)} />
      </>
    );
  }

  if (status === "logged") {
    return (
      <>
        <button
          type="button"
          onClick={() => openSheet()}
          className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-charcoal/70 p-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <Check size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-subheading text-off-white">
              {label}
              {displayName ? ` — ${displayName}` : ""}
            </span>
            <span className="block truncate text-meta text-neutral">
              {selection?.macros ? `${Math.round(selection.macros.calories)} cal` : ""}
              {provenance ? ` · ${provenance}` : ""}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
        </button>
        <MealSelectionSheet period={period} open={sheetOpen} initialView="options" onClose={() => setSheetOpen(false)} />
      </>
    );
  }

  const statusLabel =
    status === "skipped"
      ? `Skipped${selection?.skipReason ? ` — ${SKIP_REASON_LABELS[selection.skipReason]}` : ""}`
      : status === "missed"
        ? "Missed — log if you still want to catch up"
        : (entry?.timeLabel ?? "Not logged yet");

  return (
    <>
      <button
        type="button"
        onClick={() => openSheet()}
        className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-charcoal p-3 text-left shadow-[var(--shadow-subtle)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-off-white/[0.05] text-neutral">
          <UtensilsCrossed size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-subheading text-off-white">{label}</span>
          <span className="block truncate text-meta text-neutral">{statusLabel}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
      </button>
      <MealSelectionSheet period={period} open={sheetOpen} initialView="options" onClose={() => setSheetOpen(false)} />
    </>
  );
}
