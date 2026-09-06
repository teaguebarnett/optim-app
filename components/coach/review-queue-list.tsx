import Link from "next/link";
import { AlertTriangle, RefreshCcw, Activity, SkipForward, Flag, HeartPulse, CheckCircle2, TrendingDown, ShieldAlert, Trophy, CalendarX, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/coach/empty-state";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import { cn } from "@/lib/cn";
import type { AttentionQueueItem } from "@/lib/coach/types";

const KIND_ICON: Record<AttentionQueueItem["kind"], typeof AlertTriangle> = {
  health_review: HeartPulse,
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
  "adaptation-proposal": Wand2,
  milestone: Trophy,
};

function toneClassesForKind(kind: AttentionQueueItem["kind"]): { icon: string; bg: string; accentBorder: string } {
  if (kind === "health_review" || kind === "pain-report" || kind === "recovery-deterioration") {
    return { icon: "text-error", bg: "bg-error-soft", accentBorder: "border-l-error" };
  }
  if (
    kind === "program-change-request" ||
    kind === "rpe-anomaly" ||
    kind === "workout-skipped" ||
    kind === "performance-pattern" ||
    kind === "adherence-pattern" ||
    kind === "ai-authority-boundary"
  ) {
    return { icon: "text-warning", bg: "bg-warning-soft", accentBorder: "border-l-warning" };
  }
  if (kind === "milestone") return { icon: "text-success", bg: "bg-success-soft", accentBorder: "border-l-success" };
  return { icon: "text-accent-strong", bg: "bg-accent-soft", accentBorder: "border-l-accent" };
}

const STATUS_PILL_CLASSES: Record<AttentionQueueItem["status"], string> = {
  needs_review: "bg-warning-soft text-warning",
  in_progress: "bg-accent-soft text-accent-strong",
  waiting: "bg-brass-soft text-brass-strong",
  resolved: "bg-success-soft text-success",
};

const STATUS_PILL_LABELS: Record<AttentionQueueItem["status"], string> = {
  needs_review: "Needs review",
  in_progress: "In progress",
  waiting: "Waiting",
  resolved: "Resolved",
};

/**
 * The Reviews page's own list — distinct from
 * components/coach/attention-queue-list.tsx (which stays unresolved-only,
 * used by dashboard "Needs you" widgets that never showed resolved items).
 * A real ReviewRequest row opens the lifecycle detail sheet (see
 * app/coach/reviews/page.tsx); a synthesized "health_review" row still
 * links straight to the client page, since its own resolution lives there
 * (see components/coach/review-detail-sheet.tsx's module doc).
 */
export function ReviewQueueList({
  items,
  emptyMessage,
  onSelect,
}: {
  items: AttentionQueueItem[];
  emptyMessage?: string;
  onSelect: (item: AttentionQueueItem) => void;
}) {
  if (items.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Nothing here" description={emptyMessage ?? "Nothing in this view right now."} />;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        const tone = toneClassesForKind(item.kind);
        const dateIso = item.status === "resolved" && item.resolvedAtIso ? item.resolvedAtIso : item.createdAtIso;
        const content = (
          <Card
            className={cn("flex items-start gap-3 border-l-2 transition-colors hover:border-accent/30", tone.accentBorder)}
            style={{ transitionDuration: "var(--motion-fast)" }}
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tone.bg, tone.icon)}>
              <Icon size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <p className="truncate text-sm font-semibold text-off-white">{item.clientName}</p>
                <span className="shrink-0 text-meta text-neutral">
                  {new Date(dateIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className={cn("text-xs font-semibold uppercase tracking-wide", tone.icon)}>{ATTENTION_KIND_LABELS[item.kind]}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium leading-none", STATUS_PILL_CLASSES[item.status])}>
                  {STATUS_PILL_LABELS[item.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral">{item.summary}</p>
            </div>
          </Card>
        );

        if (item.kind === "health_review") {
          return (
            <Link key={item.reviewRequestId} href={`/coach/clients/${item.clientId}`} className="block">
              {content}
            </Link>
          );
        }

        return (
          <button key={item.reviewRequestId} type="button" onClick={() => onSelect(item)} className="block w-full text-left">
            {content}
          </button>
        );
      })}
    </div>
  );
}
