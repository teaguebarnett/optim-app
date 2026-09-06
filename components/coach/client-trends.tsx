import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buildProgressDashboard } from "@/lib/progress/build-dashboard";
import { getLiveHistoryStore } from "@/lib/history/local-storage-history-store";
import type { AppState } from "@/lib/state";
import type { ReviewRequest } from "@/lib/types";

function formatRatio(ratio: number | null): string {
  return ratio === null ? "Not enough data yet" : `${Math.round(ratio * 100)}%`;
}

/**
 * "Key trends" (spec §5.5) — reuses the exact same aggregates the client's
 * own /progress page already computes (lib/progress/build-dashboard.ts,
 * over the same real HistoryStore) rather than a second, parallel
 * analytics derivation. Compact rows only — no charts here; deeper history
 * still lives at /progress and the historical day review, unchanged.
 */
export function ClientTrends({
  clientAppState,
  coachDisplayName,
  recentPerformanceFlags,
}: {
  clientAppState: AppState;
  coachDisplayName: string;
  recentPerformanceFlags: ReviewRequest[];
}) {
  const dashboard = buildProgressDashboard({
    store: getLiveHistoryStore(),
    scope: { workspaceId: clientAppState.workspaceId, clientId: clientAppState.clientId, enrollmentId: clientAppState.programEnrollment.id },
    source: "live",
    effectiveDateIso: clientAppState.dateIso,
    enrollment: clientAppState.programEnrollment,
    checkInSchedule: clientAppState.checkInSchedule,
    liveState: clientAppState,
    coachDisplayName,
    chatMessages: clientAppState.chatMessages,
    now: new Date(),
  });

  const weightChange = dashboard.weight.changeSinceProgramStartLb;
  const WeightIcon = weightChange === null ? Minus : weightChange < 0 ? TrendingDown : weightChange > 0 ? TrendingUp : Minus;

  return (
    <Card>
      <p className="text-subheading text-off-white">Key trends</p>
      <dl className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="flex items-baseline justify-between border-b border-border/60 py-1.5">
          <dt className="text-sm text-neutral">Training adherence</dt>
          <dd className="text-sm text-off-white">{formatRatio(dashboard.training.adherenceRatio)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-b border-border/60 py-1.5">
          <dt className="text-sm text-neutral">Nutrition adherence</dt>
          <dd className="text-sm text-off-white">{formatRatio(dashboard.nutrition.mealPlanAdherenceRatio)}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-border/60 py-1.5">
          <dt className="text-sm text-neutral">Weight direction</dt>
          <dd className="flex items-center gap-1 text-sm text-off-white">
            <WeightIcon size={13} aria-hidden="true" />
            {weightChange === null ? "Not enough data yet" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} lb since start`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-b border-border/60 py-1.5">
          <dt className="text-sm text-neutral">RPE/performance</dt>
          <dd className="text-sm text-off-white">{recentPerformanceFlags.length === 0 ? "No recent flags" : `${recentPerformanceFlags.length} recent flag${recentPerformanceFlags.length === 1 ? "" : "s"}`}</dd>
        </div>
      </dl>
    </Card>
  );
}
