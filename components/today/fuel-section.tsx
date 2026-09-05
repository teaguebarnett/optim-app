import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { usePrototypeState } from "@/hooks/use-prototype-state";

const MACRO_META = [
  { key: "proteinG", label: "P", color: "var(--pc-brass)" },
  { key: "carbsG", label: "C", color: "var(--pc-success)" },
  { key: "fatG", label: "F", color: "var(--pc-warning)" },
] as const;

/**
 * Zone 1 (Daily Overview) — one premium control surface, composed
 * horizontally: ring, calorie readout, and a compact three-row macro
 * meter all sit side by side in a single row instead of ring-on-top,
 * macros-spanning-full-width-below. This is what keeps the panel from
 * feeling tall with unused space. Reuses usePrototypeState().nutritionTotals
 * directly — the same computation the full Nutrition screen uses — so this
 * only ever reflects actually selected/logged meals, never a preview, a
 * suggestion, or an optional snack that wasn't eaten. See
 * lib/calculations.ts's isMealCounted.
 *
 * The bottom line surfaces nutritionMessage — the same real, already-
 * computed status line the rest of the app relies on (see
 * lib/calculations.ts's nutritionStatusMessage) — so Fuel earns its role as
 * the daily hero by answering "current state → what matters next" instead
 * of just displaying numbers. Nothing here is invented: at 0 calories it
 * reads "Your nutrition targets are set for today." — never a fabricated
 * claim of progress that hasn't happened (see nutritionStatusMessage).
 */
export function FuelSection() {
  const { state, nutritionTotals, nutritionMessage } = usePrototypeState();
  const targets = state.nutritionTargets;
  const percent = Math.round((nutritionTotals.calories / targets.calories) * 100);

  return (
    <Link href="/nutrition" className="block p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-neutral">Fuel</p>
        <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
      </div>

      <div className="mt-3 flex items-center gap-4">
        <ProgressRing percent={percent} size={62} strokeWidth={6} color="var(--pc-brass)" />
        <div className="shrink-0">
          <p className="text-metric text-off-white">{nutritionTotals.calories}</p>
          <p className="text-meta text-neutral">of {targets.calories} cal</p>
        </div>

        <div className="ml-auto min-w-0 flex-1 space-y-1.5 pl-2">
          {MACRO_META.map((macro) => {
            const consumed = nutritionTotals[macro.key];
            const macroPercent = Math.max(0, Math.min(100, (consumed / targets[macro.key]) * 100));
            return (
              <div key={macro.key} className="flex items-center gap-2">
                <span className="w-3 shrink-0 text-label text-neutral">{macro.label}</span>
                <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-off-white/[0.08]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${macroPercent}%`, backgroundColor: macro.color }}
                  />
                </div>
                <span className="shrink-0 text-meta text-off-white">{Math.round(consumed)}g</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 border-t border-border/60 pt-2.5 text-meta text-neutral">{nutritionMessage}</p>
    </Link>
  );
}
