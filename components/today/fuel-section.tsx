import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { MacroRow } from "@/components/nutrition/macro-row";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { NUTRITION_TARGETS } from "@/lib/mock-data";

/**
 * Today-screen hierarchy item #2 (Phase 3.1 §5): calories and all three
 * macros, immediately visible at the top of Today. Reuses
 * usePrototypeState().nutritionTotals directly — the same computation the
 * full Nutrition screen uses — so this only ever reflects actually
 * selected/logged meals, never a preview, a suggestion, or an optional
 * snack that wasn't eaten. See lib/calculations.ts's isMealCounted.
 */
export function FuelSection() {
  const { nutritionTotals } = usePrototypeState();
  const percent = Math.round((nutritionTotals.calories / NUTRITION_TARGETS.calories) * 100);

  return (
    <Link
      href="/nutrition"
      className="mx-4 block rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Fuel</p>
        <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
      </div>

      <div className="mt-2 flex items-center gap-4">
        <ProgressRing percent={percent} size={56} strokeWidth={6} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-off-white">
            {nutritionTotals.calories} <span className="font-normal text-neutral">of {NUTRITION_TARGETS.calories} cal</span>
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <MacroRow label="Protein" consumed={nutritionTotals.proteinG} target={NUTRITION_TARGETS.proteinG} unit="g" color="var(--pc-accent)" />
        <MacroRow label="Carbs" consumed={nutritionTotals.carbsG} target={NUTRITION_TARGETS.carbsG} unit="g" color="var(--pc-success)" />
        <MacroRow label="Fat" consumed={nutritionTotals.fatG} target={NUTRITION_TARGETS.fatG} unit="g" color="var(--pc-warning)" />
      </div>
    </Link>
  );
}
