import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One focal, sculptural number with a label and optional trailing visual
 * (a MiniTrend, a DeltaIndicator, a ProgressRing) — the shared building
 * block for a dashboard that needs several real metrics side by side
 * without each becoming its own oversized card. */
export function MetricTile({
  label,
  value,
  unit,
  accessory,
  toneClassName = "text-off-white",
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  accessory?: ReactNode;
  toneClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-charcoal px-4 py-3.5", className)}>
      <div className="min-w-0">
        <p className="text-label text-neutral">{label}</p>
        <p className={cn("mt-1 text-metric leading-none", toneClassName)}>
          {value}
          {unit ? <span className="ml-1 text-subheading text-neutral">{unit}</span> : null}
        </p>
      </div>
      {accessory ? <div className="shrink-0">{accessory}</div> : null}
    </div>
  );
}
