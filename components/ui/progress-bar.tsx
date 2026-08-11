import { cn } from "@/lib/cn";

interface ProgressBarProps {
  percent: number;
  className?: string;
  trackClassName?: string;
  color?: string;
}

export function ProgressBar({ percent, className, trackClassName, color = "var(--pc-accent)" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-off-white/[0.08]", trackClassName)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", className)}
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}
