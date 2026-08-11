import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { DailyTaskState } from "@/lib/types";
import { cn } from "@/lib/cn";

const STATE_CLASSNAMES: Record<DailyTaskState, string> = {
  locked: "bg-off-white/[0.06] text-neutral",
  upcoming: "bg-off-white/[0.06] text-neutral",
  "recommended-now": "bg-accent-soft text-accent-strong",
  "in-progress": "bg-accent-soft text-accent-strong",
  completed: "bg-success-soft text-success",
  "partially-completed": "bg-warning-soft text-warning",
  skipped: "bg-off-white/[0.06] text-neutral",
  missed: "bg-error-soft text-error",
  "needs-attention": "bg-warning-soft text-warning",
  "awaiting-review": "bg-warning-soft text-warning",
};

/** Builds the static (workspace-independent) labels, plus the one label that
 * names the active coach — kept out of a plain constant map since it must
 * resolve dynamically per workspace. */
function buildStateLabels(coachDisplayName: string): Record<DailyTaskState, string> {
  return {
    locked: "Locked",
    upcoming: "Upcoming",
    "recommended-now": "Recommended now",
    "in-progress": "In progress",
    completed: "Completed",
    "partially-completed": "Partially completed",
    skipped: "Skipped",
    missed: "Missed",
    "needs-attention": "Needs attention",
    "awaiting-review": `Awaiting ${coachDisplayName}'s review`,
  };
}

export function StatePill({ state, className }: { state: DailyTaskState; className?: string }) {
  const { activeContext } = usePrototypeState();
  const label = buildStateLabels(activeContext.primaryCoach?.displayName ?? "your coach")[state];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        STATE_CLASSNAMES[state],
        className
      )}
    >
      {label}
    </span>
  );
}
