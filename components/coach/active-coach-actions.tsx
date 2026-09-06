"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCcw, Activity, SkipForward, Flag, TrendingDown, ShieldAlert, CalendarX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ReviewDetailSheet } from "@/components/coach/review-detail-sheet";
import { PersonalTouchList } from "@/components/coach/personal-touch-list";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { CoachProfileId, WorkspaceId } from "@/lib/tenancy/types";

const KIND_ICON: Record<string, typeof AlertTriangle> = {
  "pain-report": AlertTriangle,
  "program-change-request": RefreshCcw,
  "rpe-anomaly": Activity,
  "workout-skipped": SkipForward,
  "technique-flag": Flag,
  "schedule-change": RefreshCcw,
  "performance-pattern": Activity,
  "adherence-pattern": CalendarX,
  "recovery-deterioration": TrendingDown,
  "ai-authority-boundary": ShieldAlert,
};

const STATUS_LABEL: Record<string, string> = {
  needs_review: "Needs your decision",
  in_progress: "In progress",
  waiting: "Waiting",
};

/**
 * "Active coach actions" (spec §5.3) — every unresolved flag, waiting item,
 * and prepared message for THIS one client, each with its exact next step,
 * reusing the exact same lifecycle detail sheet and personal-touch send
 * flow the Command Center already uses (see app/coach/page.tsx) — a review
 * resolved here and one resolved from the dashboard are indistinguishable
 * afterward.
 */
export function ActiveCoachActions({
  items,
  coachId,
  coachName,
  workspaceId,
  onChanged,
}: {
  items: AttentionQueueItem[];
  coachId: CoachProfileId;
  coachName: string;
  workspaceId: WorkspaceId;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const decisions = items.filter((i) => i.kind !== "milestone");
  const personalTouch = items.filter((i) => i.kind === "milestone");
  const selected = selectedId ? (items.find((i) => i.reviewRequestId === selectedId) ?? null) : null;

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral">Nothing open right now.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {decisions.length > 0 ? (
        <Card className="divide-y divide-border p-0">
          {decisions.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? AlertTriangle;
            return (
              <button
                key={item.reviewRequestId}
                type="button"
                onClick={() => setSelectedId(item.reviewRequestId)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-raised first:rounded-t-[var(--radius-lg)] last:rounded-b-[var(--radius-lg)]"
                style={{ transitionDuration: "var(--motion-fast)" }}
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-warning">{ATTENTION_KIND_LABELS[item.kind]}</p>
                  <p className="mt-0.5 text-sm text-off-white">{item.summary}</p>
                  <p className="mt-0.5 text-meta text-neutral">{STATUS_LABEL[item.status] ?? item.status}{item.waitingOn ? ` — ${item.waitingOn}` : ""}</p>
                </div>
              </button>
            );
          })}
        </Card>
      ) : null}

      <PersonalTouchList items={personalTouch} coachId={coachId} coachName={coachName} workspaceId={workspaceId} onChanged={onChanged} />

      <ReviewDetailSheet item={selected} coachId={coachId} coachName={coachName} onClose={() => setSelectedId(null)} onChanged={onChanged} />
    </div>
  );
}
