"use client";

import { useState, type ReactNode } from "react";
import { Lock, ChevronDown, ChevronUp } from "lucide-react";
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
  /** Task's own after-the-fact status line, e.g. "Logged at 6:11 PM" —
   * distinct from scheduleLabel below. */
  timeLabel?: string;
  /** The planner's forward-looking guidance for this item, e.g. "Planned
   * for 5:30 PM" or "Recommended around 2:30 PM" — shown compactly on the
   * tile and, once expanded, inside the full card. Never a countdown. */
  scheduleLabel?: string;
  children?: ReactNode;
  emphasisOverride?: TaskEmphasis;
  /** TodayBento sets this on any tile that must occupy its own row — the
   * last tile when the remaining count is odd, plus (Phase 4.4B-1.1) the
   * currently-expanded tile and its immediate predecessor, so a spanning
   * neighbor never leaves an orphan half-row gap. Switches the collapsed
   * tile from a narrow vertical layout to a compact horizontal row that
   * suits the extra width. Has no effect on primary/quiet tiers. */
  fillWidth?: boolean;
  /** Controlled expansion (Phase 4.4B-1.1 corrective) — TodayBento owns a
   * single `expandedTaskId` for the whole grid and passes this tile's
   * membership in it, rather than each TaskShell instance tracking its own
   * independent boolean. Omit both this and `onToggleExpand` for a
   * standalone TaskShell outside that grid (e.g. none today) to fall back
   * to the old self-contained behavior. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

/**
 * Phase 4.4B.1 (bento revision) — TodayBento (components/today/today-bento.tsx)
 * renders every non-spotlight item into explicit rows (see that file's
 * buildGridRows), so `emphasis` here isn't just a color variant — it
 * decides whether this task is a real grid tile and how wide it renders:
 *
 * - `locked` — a small, dimmed tile. No interaction. Its hint text is
 *   always a single truncated line — collapsed means genuinely compact,
 *   never an explanatory paragraph.
 * - `secondary` — a compact tile by default (icon, title, the planner's
 *   schedule label); tapping it claims its own full-width row and reveals
 *   the exact same interaction the task always provided. Phase 4.4B-1.1 —
 *   expansion is controlled by TodayBento's single `expandedTaskId` (see
 *   `expanded`/`onToggleExpand` above), which is what guarantees only one
 *   tile is ever open at a time across the whole grid.
 * - Both `locked` and collapsed `secondary` tiles accept `fillWidth`, which
 *   TodayBento sets whenever this tile must occupy its own row — see that
 *   prop's doc above.
 * - `primary` — the single current-priority surface. Content only — no
 *   card chrome of its own; TodayBento wraps it (and Day Progress)
 *   together in one shared card. Larger padding, larger icon, brass
 *   detailing — the one place OPTIM is allowed to take up real room today.
 * - `quiet` — completed/skipped. TodayBento no longer renders these
 *   individually at all (see tiles/progress-strip.tsx, which summarizes
 *   them in one line), so this tier is effectively unused today; kept for
 *   resilience, not deleted.
 */
export function TaskShell({
  title,
  icon,
  state,
  lockedHint,
  timeLabel,
  scheduleLabel,
  children,
  emphasisOverride,
  fillWidth,
  expanded: expandedProp,
  onToggleExpand,
}: TaskShellProps) {
  const emphasis = emphasisOverride ?? emphasisForState(state);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  const toggleExpand = onToggleExpand ?? (() => setInternalExpanded((v) => !v));

  if (emphasis === "locked") {
    // Collapsed always means genuinely compact — one line of hint text,
    // never an explanatory paragraph — regardless of tile width.
    if (fillWidth) {
      return (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-charcoal/60 p-3 opacity-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-off-white/[0.04] text-neutral">
            <Lock size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-subheading text-off-white">{title}</p>
            {lockedHint ? <p className="truncate text-meta text-neutral">{lockedHint}</p> : null}
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-[96px] flex-col gap-2 rounded-[var(--radius-lg)] bg-charcoal/60 p-3 opacity-50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-off-white/[0.04] text-neutral">
          <Lock size={14} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-subheading text-off-white">{title}</p>
          {lockedHint ? <p className="mt-0.5 truncate text-meta text-neutral">{lockedHint}</p> : null}
        </div>
      </div>
    );
  }

  if (emphasis === "quiet") {
    return (
      <div className="pc-animate-in flex items-center gap-3 rounded-[var(--radius-lg)] bg-charcoal/60 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-off-white/[0.05] text-neutral">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-subheading text-off-white/75">{title}</p>
        </div>
        <StatePill state={state} />
      </div>
    );
  }

  if (emphasis === "secondary") {
    if (!expanded) {
      if (fillWidth) {
        return (
          <button
            type="button"
            onClick={toggleExpand}
            className="pc-animate-in flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-charcoal p-3 text-left shadow-[var(--shadow-subtle)] transition-shadow duration-200 hover:shadow-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
              {icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-subheading text-off-white">{title}</span>
              {(timeLabel ?? scheduleLabel) ? (
                <span className="block truncate text-meta text-neutral">{timeLabel ?? scheduleLabel}</span>
              ) : null}
            </span>
            <ChevronDown size={15} className="shrink-0 text-neutral" aria-hidden="true" />
          </button>
        );
      }
      return (
        <button
          type="button"
          onClick={toggleExpand}
          className="pc-animate-in flex min-h-[96px] w-full flex-col items-start gap-2 rounded-[var(--radius-lg)] bg-charcoal p-3 text-left shadow-[var(--shadow-subtle)] transition-shadow duration-200 hover:shadow-md"
        >
          <div className="flex w-full items-start justify-between gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
              {icon}
            </span>
            <ChevronDown size={15} className="mt-1 shrink-0 text-neutral" aria-hidden="true" />
          </div>
          <div className="min-w-0 w-full">
            <p className="truncate text-subheading text-off-white">{title}</p>
            {(timeLabel ?? scheduleLabel) ? (
              <p className="mt-0.5 truncate text-meta text-neutral">{timeLabel ?? scheduleLabel}</p>
            ) : null}
          </div>
        </button>
      );
    }

    // Expanded — claims its own full-width row (see today-bento.tsx's
    // buildGridRows) so the real interaction (a meal sheet trigger,
    // cardio's stepper, etc.) has room, then collapses back to a compact
    // tile.
    return (
      <div className="pc-animate-in rounded-[var(--radius-lg)] bg-charcoal p-4 shadow-[var(--shadow-subtle)]">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-subheading text-off-white">{title}</p>
              <StatePill state={state} />
            </div>
            {(timeLabel ?? scheduleLabel) ? (
              <p className="mt-0.5 text-meta text-neutral">{timeLabel ?? scheduleLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleExpand}
            aria-label="Collapse"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
          >
            <ChevronUp size={16} />
          </button>
        </div>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    );
  }

  // Primary — the spotlight's content only. TodayBento owns the
  // surrounding card so it can be visually unified with the Day Progress
  // strip as one coordinated region, rather than this shell repeating its
  // own border/shadow.
  return (
    <div className="pc-animate-in p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-heading text-off-white">{title}</p>
            <StatePill state={state} />
          </div>
          {timeLabel ? (
            <p className="mt-0.5 text-meta text-neutral">{timeLabel}</p>
          ) : scheduleLabel ? (
            <p className="mt-0.5 text-meta text-neutral">{scheduleLabel}</p>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
