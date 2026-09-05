import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export type DeltaSense = "up_good" | "up_bad" | "neutral";

/** A small, honest "+2.1 lb" / "-3%" chip — direction and color are
 * color-independent (an icon carries the meaning too) and driven by real
 * deltas only. `sense` decides whether "up" reads as good (mint) or bad
 * (coral); `neutral` never colors the delta as good or bad, just states
 * it. */
export function DeltaIndicator({ value, unit = "", sense = "neutral", precision = 1 }: { value: number; unit?: string; sense?: DeltaSense; precision?: number }) {
  const rounded = Number(value.toFixed(precision));
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-neutral">
        <Minus size={13} aria-hidden="true" />
        No change
      </span>
    );
  }

  const isUp = rounded > 0;
  const isGood = sense === "neutral" ? null : (sense === "up_good") === isUp;
  const colorClass = isGood === null ? "text-neutral" : isGood ? "text-success" : "text-error";
  const Icon = isUp ? ArrowUp : ArrowDown;

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", colorClass)}>
      <Icon size={13} aria-hidden="true" />
      {isUp ? "+" : ""}
      {rounded}
      {unit}
    </span>
  );
}
