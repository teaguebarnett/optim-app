import type { ReactNode } from "react";
import { StatePill } from "@/components/ui/state-pill";
import type { DailyTaskState } from "@/lib/types";

interface SurfaceShellProps {
  icon: ReactNode;
  title: string;
  /** Reuses the exact same DailyTaskState pill the rest of the app already
   * shows for this workout (see hooks/use-prototype-state.tsx's `tasks`) —
   * omitted entirely for states that don't map cleanly onto it (rest day,
   * an honestly-unavailable schedule day), rather than forcing a misleading
   * label. */
  pillState?: DailyTaskState | null;
  meta?: string | null;
  scheduleLabel?: string | null;
  children?: ReactNode;
}

/**
 * The one dominant session surface's shared shell — Phase 4.4B-1. Mirrors
 * the "primary" tier of components/today/task-shell.tsx (brass-soft icon
 * circle, heading + status pill, meta line) so Training's NOW surface reads
 * as the same visual language as Today's spotlight, without importing
 * TaskShell itself — TaskShell is wired specifically to Today's bento grid
 * (fillWidth/expand state, DailyTaskId-shaped children) and Training's
 * surface has a different shape (future/past read-only variants that never
 * appear in Today's grid at all).
 */
export function SurfaceShell({ icon, title, pillState, meta, scheduleLabel, children }: SurfaceShellProps) {
  return (
    <div className="pc-animate-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-heading text-off-white">{title}</p>
            {pillState ? <StatePill state={pillState} /> : null}
          </div>
          {meta ? <p className="mt-0.5 text-meta text-neutral">{meta}</p> : null}
          {scheduleLabel ? <p className="mt-0.5 text-meta text-neutral">{scheduleLabel}</p> : null}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
