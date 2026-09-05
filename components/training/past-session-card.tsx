"use client";

import { useRouter } from "next/navigation";
import { Dumbbell, BedDouble, CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceShell } from "@/components/training/surface-shell";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import { useHistoricalDayReview } from "@/hooks/use-historical-day-review";
import { formatLongDateLabel } from "@/lib/shared/local-date";

/**
 * Read-only review for a day earlier in the current week — Phase 4.4B-1.
 * Reuses lib/progress/build-historical-day.ts's buildHistoricalDayReview via
 * the exact same hook the Progress > History screen uses (Phase 4.3), so
 * this can never diverge from what a full Historical Day Review would say
 * about the same date, and never re-derives its own adherence formula. Only
 * shows a compact training summary here — the full read-only day (nutrition,
 * cardio, weight) stays exclusively on Progress/History; "Review day" links
 * there rather than duplicating it.
 *
 * A day this app never actually lived through (or that rolled over without
 * being archived — see lib/history/rollover.ts's "only one live day ever
 * exists at a time" note) has no DailyRecord at all. That's an honest gap,
 * not something to fabricate a status for — see the `no_record` branch.
 */
export function PastSessionCard({ dateIso }: { dateIso: string }) {
  const router = useRouter();
  const result = useHistoricalDayReview(dateIso);
  const dateLabel = formatLongDateLabel(dateIso);

  if (result.status !== "ok") {
    return (
      <SurfaceShell icon={<Dumbbell size={22} />} title="Not available" meta={dateLabel}>
        <p className="text-body text-neutral">This day can&apos;t be reviewed here.</p>
      </SurfaceShell>
    );
  }

  const { training } = result.review;

  if (training.trainingDayType === "scheduled_rest") {
    return (
      <SurfaceShell icon={<BedDouble size={22} />} title="Recovery day" meta={dateLabel}>
        <p className="text-body text-off-white">A rest day — no training was scheduled.</p>
      </SurfaceShell>
    );
  }

  if (training.trainingDayType === "no_session_scheduled" || training.outcome === "no_record") {
    return (
      <SurfaceShell icon={<Dumbbell size={22} />} title={training.workoutName ?? "Workout"} meta={dateLabel}>
        <p className="text-body text-neutral">No record was saved for this day.</p>
      </SurfaceShell>
    );
  }

  const outcome = training.outcome;
  const icon =
    outcome === "complete" ? <CheckCircle2 size={22} /> : outcome === "missed" ? <XCircle size={22} /> : <PauseCircle size={22} />;
  const outcomeLine = outcome === "complete" ? "Completed." : outcome === "missed" ? "Missed." : "Partially completed.";

  return (
    <SurfaceShell
      icon={icon}
      title={training.workoutName ?? "Workout"}
      meta={`${dateLabel}${training.focus ? ` · ${training.focus}` : ""}`}
    >
      <p className="text-body text-off-white">{outcomeLine}</p>
      <p className="mt-1 text-meta text-neutral">
        {training.workingSetsCompleted} of {training.workingSetsPrescribed} working sets
      </p>
      {training.skipReason ? (
        <p className="mt-1 text-meta text-neutral">Reason: {SKIP_REASON_LABELS[training.skipReason]}</p>
      ) : null}
      <Button className="mt-4 w-full" onClick={() => router.push(`/progress/history/${dateIso}`)}>
        Review day
      </Button>
    </SurfaceShell>
  );
}
