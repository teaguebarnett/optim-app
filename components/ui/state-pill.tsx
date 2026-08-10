import type { DailyTaskState } from "@/lib/types";
import { cn } from "@/lib/cn";

const STATE_CONFIG: Record<DailyTaskState, { label: string; className: string }> = {
  locked: { label: "Locked", className: "bg-white/[0.06] text-neutral" },
  upcoming: { label: "Upcoming", className: "bg-white/[0.06] text-neutral" },
  "recommended-now": { label: "Recommended now", className: "bg-accent-soft text-accent-strong" },
  "in-progress": { label: "In progress", className: "bg-accent-soft text-accent-strong" },
  completed: { label: "Completed", className: "bg-success-soft text-success" },
  "partially-completed": { label: "Partially completed", className: "bg-warning-soft text-warning" },
  skipped: { label: "Skipped", className: "bg-white/[0.06] text-neutral" },
  missed: { label: "Missed", className: "bg-error-soft text-error" },
  "needs-attention": { label: "Needs attention", className: "bg-warning-soft text-warning" },
  "awaiting-review": { label: "Awaiting Teague's review", className: "bg-warning-soft text-warning" },
};

export function StatePill({ state, className }: { state: DailyTaskState; className?: string }) {
  const config = STATE_CONFIG[state];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export function stateLabel(state: DailyTaskState): string {
  return STATE_CONFIG[state].label;
}
