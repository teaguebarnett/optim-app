import Link from "next/link";
import { Newspaper, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DailyBriefingRecord } from "@/lib/coach/daily-briefing";
import type { ClientProfileId } from "@/lib/tenancy/types";

/**
 * "Daily Briefings" (spec §2/§7) — a compact summary of today's briefings
 * that still need a coach action (drafted, or held for review), one row per
 * client, linking straight into that client's own workspace where the real
 * prepare/preview/edit/approve/publish controls live (spec §5: the overview
 * never duplicates the deeper workflow, it just gets you there fast).
 */
export function DailyBriefingsSummaryList({ briefings, clientNameById }: { briefings: DailyBriefingRecord[]; clientNameById: Map<ClientProfileId, string> }) {
  const needsAction = briefings.filter((b) => b.status === "draft" || b.status === "held_for_review");
  if (needsAction.length === 0) return null;

  return (
    <div className="space-y-2">
      {needsAction.map((briefing) => {
        const held = briefing.status === "held_for_review";
        return (
          <Link key={briefing.id} href={`/coach/clients/${briefing.clientId}`} className="block">
            <Card className={`flex items-start gap-3 border-l-2 ${held ? "border-l-error" : "border-l-accent"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${held ? "bg-error-soft text-error" : "bg-accent-soft text-accent-fg"}`}>
                {held ? <ShieldAlert size={16} aria-hidden="true" /> : <Newspaper size={16} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-off-white">{clientNameById.get(briefing.clientId) ?? "Unknown client"}</p>
                <p className="mt-0.5 text-sm text-neutral">{held ? briefing.heldForReviewReason : "Ready for your review before it publishes."}</p>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
