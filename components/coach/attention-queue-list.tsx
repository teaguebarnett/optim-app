import Link from "next/link";
import { AlertTriangle, RefreshCcw, Activity, SkipForward, Flag, HeartPulse, TrendingDown, ShieldAlert, Trophy, CalendarX, Wand2, ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/coach/empty-state";
import { CheckCircle2 } from "lucide-react";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import type { AttentionQueueItem } from "@/lib/coach/types";

const KIND_ICON: Record<AttentionQueueItem["kind"], typeof AlertTriangle> = {
  health_review: HeartPulse,
  plan_approval: ClipboardCheck,
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

/** Pain/injury and a pending health review both read as a genuinely more
 * serious tone (restrained oxblood) than a routine review — never through
 * saturation/alarm, through the same disciplined status-color vocabulary
 * every other surface uses. */
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

/**
 * The coach's prioritized "Needs attention" queue — every row traces to a
 * real ReviewRequest (see lib/coach/attention-queue.ts's buildAttentionQueue,
 * which already sorted these safety-first: pain/injury always first). Never
 * a fabricated notification. Pain/injury carries a visibly stronger
 * (restrained, never saturated-red-alarm) treatment than a routine RPE or
 * skipped-workout review — see toneClassesForKind — so urgency is legible
 * at a glance without the page feeling alarming.
 */
export function AttentionQueueList({ items, emptyMessage }: { items: AttentionQueueItem[]; emptyMessage?: string }) {
  if (items.length === 0) {
    return <EmptyState icon={CheckCircle2} title="You're caught up" description={emptyMessage ?? "Nothing needs your attention right now."} />;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        const tone = toneClassesForKind(item.kind);
        return (
          <Link key={item.reviewRequestId} href={`/coach/clients/${item.clientId}`} className="block">
            <Card
              className={`flex items-start gap-3 border-l-2 ${tone.accentBorder} transition-colors hover:border-accent/30`}
              style={{ transitionDuration: "var(--motion-fast)" }}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.icon}`}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <p className="truncate text-sm font-semibold text-off-white">{item.clientName}</p>
                  <span className="shrink-0 text-meta text-neutral">
                    {new Date(item.createdAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className={`mt-0.5 text-xs font-semibold uppercase tracking-wide ${tone.icon}`}>{ATTENTION_KIND_LABELS[item.kind]}</p>
                <p className="mt-1 text-sm text-neutral">{item.summary}</p>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
