import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DailyTaskState } from "@/lib/types";
import { StatePill } from "@/components/ui/state-pill";

export type TaskEmphasis = "primary" | "secondary" | "quiet" | "locked";

export function emphasisForState(state: DailyTaskState): TaskEmphasis {
  if (state === "recommended-now" || state === "in-progress" || state === "needs-attention") return "primary";
  if (state === "completed" || state === "skipped") return "quiet";
  if (state === "locked") return "locked";
  return "secondary";
}

interface TaskShellProps {
  title: string;
  icon: ReactNode;
  state: DailyTaskState;
  lockedHint?: string;
  timeLabel?: string;
  children?: ReactNode;
  emphasisOverride?: TaskEmphasis;
}

export function TaskShell({ title, icon, state, lockedHint, timeLabel, children, emphasisOverride }: TaskShellProps) {
  const emphasis = emphasisOverride ?? emphasisForState(state);

  if (emphasis === "locked") {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-charcoal/40 px-4 py-3.5 opacity-60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-off-white/[0.04] text-neutral">
          <Lock size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-off-white">{title}</p>
          {lockedHint ? <p className="mt-0.5 text-xs text-neutral">{lockedHint}</p> : null}
        </div>
      </div>
    );
  }

  if (emphasis === "quiet") {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-charcoal/60 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-off-white/[0.05] text-neutral">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-off-white/80">{title}</p>
        </div>
        <StatePill state={state} />
      </div>
    );
  }

  const isPrimary = emphasis === "primary";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border bg-charcoal p-4 shadow-[var(--shadow-subtle)]",
        isPrimary ? "border-accent/40" : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            isPrimary ? "bg-accent-soft text-accent-strong" : "bg-off-white/[0.05] text-neutral"
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-off-white">{title}</p>
            <StatePill state={state} />
          </div>
          {timeLabel ? <p className="mt-0.5 text-xs text-neutral">{timeLabel}</p> : null}
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
