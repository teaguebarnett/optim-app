"use client";

import { useState } from "react";
import { PageHeader } from "@/components/coach/page-header";
import { ReviewQueueList } from "@/components/coach/review-queue-list";
import { ReviewDetailSheet } from "@/components/coach/review-detail-sheet";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { cn } from "@/lib/cn";

type ReviewTab = "needs_review" | "in_progress" | "waiting" | "resolved";

const TABS: { id: ReviewTab; label: string }[] = [
  { id: "needs_review", label: "Needs review" },
  { id: "in_progress", label: "In progress" },
  { id: "waiting", label: "Waiting" },
  { id: "resolved", label: "Resolved" },
];

const EMPTY_MESSAGE: Record<ReviewTab, string> = {
  needs_review: "No open reviews — you're caught up.",
  in_progress: "Nothing currently in progress.",
  waiting: "Nothing waiting right now.",
  resolved: "No resolved reviews yet.",
};

export default function CoachReviewsPage() {
  const workspace = useCoachWorkspace();
  const [tab, setTab] = useState<ReviewTab>("needs_review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setRefreshTick] = useState(0);

  // `selected` is derived fresh every render rather than stored as its own
  // piece of state — a lifecycle action (start/resolve/reopen) writes
  // directly into the client's own AppState (see
  // lib/coach/review-lifecycle.ts), not through this page's own reactive
  // state, so re-deriving from the freshly re-read queue after
  // handleChanged's re-render is what makes the open sheet reflect the
  // change instead of a stale snapshot.
  const selected = selectedId ? (workspace.reviewQueueItems.find((item) => item.reviewRequestId === selectedId) ?? null) : null;

  const items = workspace.reviewQueueItems.filter((item) => item.status === tab);
  const countByTab: Record<ReviewTab, number> = {
    needs_review: workspace.reviewQueueItems.filter((item) => item.status === "needs_review").length,
    in_progress: workspace.reviewQueueItems.filter((item) => item.status === "in_progress").length,
    waiting: workspace.reviewQueueItems.filter((item) => item.status === "waiting").length,
    resolved: workspace.reviewQueueItems.filter((item) => item.status === "resolved").length,
  };

  function handleChanged() {
    setRefreshTick((n) => n + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description="Every pain report, program-change request, and flagged item routed to you, most urgent first."
      />

      <div className="max-w-2xl">
        <div className="mb-4 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
                tab === t.id ? "border-accent text-off-white" : "border-transparent text-neutral hover:text-off-white"
              )}
              style={{ transitionDuration: "var(--motion-fast)" }}
            >
              {t.label}
              {countByTab[t.id] > 0 ? <span className="ml-1.5 text-neutral">{countByTab[t.id]}</span> : null}
            </button>
          ))}
        </div>

        <ReviewQueueList items={items} emptyMessage={EMPTY_MESSAGE[tab]} onSelect={(item) => setSelectedId(item.reviewRequestId)} />
      </div>

      {workspace.coachId ? (
        <ReviewDetailSheet
          item={selected}
          coachId={workspace.coachId}
          coachName={workspace.activeContext.coachProfile?.displayName ?? "Your coach"}
          onClose={() => setSelectedId(null)}
          onChanged={handleChanged}
        />
      ) : null}
    </div>
  );
}
