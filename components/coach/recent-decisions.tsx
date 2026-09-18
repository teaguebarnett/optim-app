import { CheckCircle2, Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import type { DailyBriefingRecord } from "@/lib/coach/daily-briefing";
import type { ReviewRequest } from "@/lib/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * "Recent decisions" (spec §5.6) — a real, readable chronological record:
 * every resolved review's real resolution (and, for a "significant" kind,
 * its full receipt — what was decided, who approved it, what was
 * communicated), plus the most recent published Daily Briefing. Reads
 * directly from already-persisted records; nothing here is synthesized for
 * display.
 */
export function RecentDecisions({ resolvedReviews, latestPublishedBriefing }: { resolvedReviews: ReviewRequest[]; latestPublishedBriefing: DailyBriefingRecord | null }) {
  const sorted = [...resolvedReviews].filter((r) => r.resolvedAtIso).sort((a, b) => (a.resolvedAtIso! < b.resolvedAtIso! ? 1 : -1));

  if (sorted.length === 0 && !latestPublishedBriefing) {
    return (
      <Card>
        <p className="text-subheading text-off-white">Recent decisions</p>
        <p className="mt-1.5 text-sm text-neutral">No resolved decisions yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-subheading text-off-white">Recent decisions</p>
      <ul className="mt-2.5 space-y-3">
        {latestPublishedBriefing?.publishedAtIso ? (
          <li className="flex items-start gap-2.5">
            <Newspaper size={15} className="mt-0.5 shrink-0 text-accent-fg" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-off-white">Daily Briefing published: &ldquo;{latestPublishedBriefing.todaysEdgeText}&rdquo;</p>
              <p className="text-meta text-neutral">{formatTimestamp(latestPublishedBriefing.publishedAtIso)}</p>
            </div>
          </li>
        ) : null}
        {sorted.slice(0, 8).map((r) => (
          <li key={r.id} className="flex items-start gap-2.5">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-off-white">
                {ATTENTION_KIND_LABELS[r.kind]}: {r.resolutionAction === "reviewed_no_change" ? "Reviewed — no change needed" : "Resolved"}
              </p>
              {r.resolutionReceipt?.clientCommunicated ? (
                <p className="mt-0.5 text-meta text-neutral">Told client: &ldquo;{r.resolutionReceipt.clientCommunicated}&rdquo;</p>
              ) : r.resolutionNote ? (
                <p className="mt-0.5 text-meta text-neutral">{r.resolutionNote}</p>
              ) : null}
              <p className="text-meta text-neutral">{formatTimestamp(r.resolvedAtIso!)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
