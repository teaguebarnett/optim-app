import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import type { AttentionQueueItem } from "@/lib/coach/types";

function formatResurface(iso?: string): string {
  if (!iso) return "No resurface time set";
  return `Resurfaces ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/**
 * "Waiting" (spec §2/§3/§9) — items the coach already acted on and is
 * genuinely waiting on something else for, never re-shown as if they still
 * need a fresh decision. Compact, readable rows only — no Kanban board;
 * lifecycle is visible entirely through this list plus each item's own
 * status pill (spec §3).
 */
export function WaitingList({ items, onSelect }: { items: AttentionQueueItem[]; onSelect: (item: AttentionQueueItem) => void }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button key={item.reviewRequestId} type="button" onClick={() => onSelect(item)} className="block w-full text-left">
          <Card className="flex items-start gap-3 border-l-2 border-l-brass">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
              <Clock3 size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <p className="truncate text-sm font-semibold text-off-white">{item.clientName}</p>
                <span className="shrink-0 text-meta text-neutral">{formatResurface(item.resurfaceAtIso)}</span>
              </div>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-brass-strong">{ATTENTION_KIND_LABELS[item.kind]}</p>
              <p className="mt-1 text-sm text-neutral">Waiting — {item.waitingOn ?? "on something you noted"}</p>
            </div>
          </Card>
        </button>
      ))}
      <Link href="/coach/reviews" className="block px-1 text-action text-neutral hover:text-off-white">
        View all in Reviews →
      </Link>
    </div>
  );
}
