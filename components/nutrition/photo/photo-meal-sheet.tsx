"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { PhotoMealFlow } from "@/components/nutrition/photo/photo-meal-flow";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { MEAL_ORDER } from "@/lib/calculations";
import { MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import type { MacroValues, MealEstimateConfidence, MealEstimateItem, MealPeriod } from "@/lib/types";

interface PhotoMealSheetProps {
  open: boolean;
  onClose: () => void;
  suggestedPeriod: MealPeriod;
}

/**
 * The primary, highly-visible meal-photo entry point (product spec §4) —
 * lets the client pick which meal a photo is for (defaulting to today's most
 * relevant one) and then runs the same PhotoMealFlow every per-meal "Log
 * with a photo" action uses. Confirming dispatches LOG_PHOTO_MEAL exactly
 * once for the chosen period.
 */
export function PhotoMealSheet({ open, onClose, suggestedPeriod }: PhotoMealSheetProps) {
  const { dispatch, dailyPlan } = usePrototypeState();
  const [period, setPeriod] = useState<MealPeriod>(suggestedPeriod);

  // Deferred a tick (matches components/today/training-time-sheet.tsx's
  // established convention) rather than calling setState synchronously in
  // the effect body, which react-hooks' set-state-in-effect rule flags.
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => setPeriod(suggestedPeriod), 0);
    return () => clearTimeout(timeout);
  }, [open, suggestedPeriod]);

  const availablePeriods = MEAL_ORDER.filter((p) => !!dailyPlan.mealSchedule.entries[p]);

  function handleConfirm(items: MealEstimateItem[], macros: MacroValues, confidence: MealEstimateConfidence) {
    dispatch({ type: "LOG_PHOTO_MEAL", period, items, macros, confidence });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a meal photo"
      description="OPTIM estimates calories and macros from a photo — you always review and confirm before it's logged."
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-label text-neutral">Which meal is this?</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose meal">
            {availablePeriods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={p === period}
                className={cn(
                  "min-h-[36px] rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                  p === period ? "border-accent bg-accent-soft text-accent-strong" : "border-border-strong text-neutral"
                )}
              >
                {MEAL_PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <PhotoMealFlow key={period} period={period} onConfirm={handleConfirm} onCancel={onClose} />
      </div>
    </Sheet>
  );
}
