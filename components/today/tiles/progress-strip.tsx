"use client";

import Link from "next/link";
import { ProgressRing } from "@/components/ui/progress-ring";
import { usePrototypeState } from "@/hooks/use-prototype-state";

/**
 * The day's completion summary — how far through the day the client
 * already is. Reuses dailyCompletionPercent and tasks[] directly — the
 * same real values the rest of the app already computes — and
 * consolidates every completed/skipped task into one line instead of a
 * tile per item.
 *
 * "X of Y complete" is derived from tasks[] itself (excluding the
 * "daily-completion" pseudo-task), not a separate hardcoded count — it's
 * exactly the same 8 real checks lib/calculations.ts's
 * computeDailyCompletionPercent already counts, just expressed as a
 * fraction instead of only a percentage.
 *
 * Renders as bare content by default (`attached`), sitting inside the
 * same card as the Current Priority spotlight in today-bento.tsx — one
 * coordinated region, not a detached strip. Pass `attached={false}` for
 * the rare case there's no spotlight to attach to (nothing left to do),
 * where it needs its own card chrome to still read as an intentional
 * surface rather than an orphaned row.
 *
 * Gate 2D — the whole strip links to /progress: once a task recedes here
 * (completed/skipped), Today itself no longer shows its detail (see
 * today-bento.tsx's remainingItems filter) — Progress is the correct,
 * already-existing source of truth for "what actually happened," so this
 * is the one deliberate way back to it rather than leaving completed work
 * undiscoverable. A plain navigational link, so viewing it can never mark
 * anything complete or otherwise mutate state.
 */
export function ProgressStrip({ attached = true }: { attached?: boolean }) {
  const { dailyCompletionPercent, tasks } = usePrototypeState();
  const relevantTasks = tasks.filter((t) => t.id !== "daily-completion");
  const completed = relevantTasks.filter((t) => t.state === "completed" || t.state === "skipped");

  const content = (
    <div className="flex items-center gap-3">
      <ProgressRing percent={dailyCompletionPercent} size={28} strokeWidth={4} color="var(--pc-brass)" />
      <p className="shrink-0 text-subheading text-off-white">
        {completed.length} of {relevantTasks.length} complete
      </p>
      {completed.length > 0 ? (
        <>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
          <p className="line-clamp-1 min-w-0 text-meta text-neutral">{completed.map((t) => t.label).join(" · ")}</p>
        </>
      ) : (
        <p className="text-meta text-neutral">Day progress</p>
      )}
    </div>
  );

  if (!attached) {
    return (
      <Link href="/progress" className="block rounded-[var(--radius-lg)] bg-charcoal/60 px-4 py-3 shadow-[var(--shadow-subtle)]">
        {content}
      </Link>
    );
  }

  return (
    <Link href="/progress" className="block px-4 py-3">
      {content}
    </Link>
  );
}
