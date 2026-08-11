import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { NUTRITION_TARGETS } from "@/lib/mock-data";

/**
 * Today-screen hierarchy item #5: a compact Fuel summary. Reuses
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
      className="mx-4 flex items-center gap-4 rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)]"
    >
      <ProgressRing percent={percent} size={56} strokeWidth={6} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Fuel</p>
        <p className="mt-0.5 text-[15px] font-semibold text-off-white">
          {nutritionTotals.calories} <span className="font-normal text-neutral">of {NUTRITION_TARGETS.calories} cal</span>
        </p>
        <p className="mt-0.5 text-sm text-neutral">
          {nutritionTotals.proteinG}g of {NUTRITION_TARGETS.proteinG}g protein
        </p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-neutral" aria-hidden="true" />
    </Link>
  );
}
