import { AlertTriangle, RefreshCcw, Activity, SkipForward, Flag, HeartPulse } from "lucide-react";
import { cn } from "@/lib/cn";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import type { AttentionQueueItem } from "@/lib/coach/types";

const KIND_ICON: Record<AttentionQueueItem["kind"], typeof AlertTriangle> = {
  health_review: HeartPulse,
  "pain-report": AlertTriangle,
  "program-change-request": RefreshCcw,
  "rpe-anomaly": Activity,
  "workout-skipped": SkipForward,
  "technique-flag": Flag,
  "schedule-change": RefreshCcw,
};

function toneClassesForKind(kind: AttentionQueueItem["kind"]): { icon: string } {
  if (kind === "health_review" || kind === "pain-report") return { icon: "text-error" };
  if (kind === "program-change-request" || kind === "rpe-anomaly" || kind === "workout-skipped") return { icon: "text-warning" };
  return { icon: "text-accent-strong" };
}

/**
 * Everything in the decision queue EXCEPT whichever item is currently
 * expanded in the focus surface — unframed rows with separators (per this
 * phase's surface rules: "keep compact queue rows largely unframed"),
 * never a second stack of card surfaces competing with the one focus
 * panel above them. Selecting a row updates the focus surface in place;
 * it never navigates away.
 */
export function DecisionQueueRows({
  items,
  selectedId,
  onSelect,
}: {
  items: AttentionQueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-charcoal">
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        const tone = toneClassesForKind(item.kind);
        const active = item.reviewRequestId === selectedId;
        return (
          <button
            key={item.reviewRequestId}
            type="button"
            onClick={() => onSelect(item.reviewRequestId)}
            aria-pressed={active}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-[var(--radius-lg)] last:rounded-b-[var(--radius-lg)]",
              active ? "bg-selected-bg" : "hover:bg-surface-raised"
            )}
            style={{ transitionDuration: "var(--motion-fast)" }}
          >
            <Icon size={16} className={cn("shrink-0", tone.icon)} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className={cn("truncate text-sm font-semibold", active ? "text-accent-strong" : "text-off-white")}>{item.clientName}</span>
                <span className="shrink-0 text-meta text-neutral">{new Date(item.createdAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </span>
              <span className="mt-0.5 block truncate text-meta text-neutral">{ATTENTION_KIND_LABELS[item.kind]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
