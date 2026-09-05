"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useHistoricalDayReview } from "@/hooks/use-historical-day-review";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DaySummarySection } from "@/components/progress/historical/day-summary-section";
import { TrainingSection } from "@/components/progress/historical/training-section";
import { NutritionSection } from "@/components/progress/historical/nutrition-section";
import { CardioWeightSection } from "@/components/progress/historical/cardio-weight-section";

// Phase 4.3 — a single archived day, fully read-only. Every value here
// comes from lib/progress/build-historical-day.ts's buildHistoricalDayReview
// — this page never reads storage or a Phase 4.1 derivation directly, and
// never dispatches an action that could mutate live or archived state (see
// that module's doc for why "today" itself is never eligible here). This is
// also the first surface built to the new light/near-white, navy-accent,
// modular OPTIM visual standard — see components/progress/historical/
// section-card.tsx and disclosure.tsx, the two reusable primitives it
// introduces for Phase 4.4 to build on.
function HistoricalDayReviewScreen() {
  const { isHydrated } = usePrototypeState();
  const params = useParams<{ date: string }>();
  const router = useRouter();
  const result = useHistoricalDayReview(params.date);

  if (!isHydrated) return <ScreenSkeleton />;

  if (result.status !== "ok") {
    const message =
      result.status === "future"
        ? "That date hasn't happened yet — only past days can be reviewed."
        : result.status === "today"
          ? "Today is still in progress — Historical Day Review is only for past days. See Today for what's happening now."
          : "That doesn't look like a valid date.";
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-base font-medium text-off-white">Can&apos;t open this day</p>
        <p className="mt-2 max-w-xs text-sm text-neutral">{message}</p>
        <Button className="mt-5" onClick={() => router.push("/progress")}>
          Back to Progress
        </Button>
      </div>
    );
  }

  const { review } = result;

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-near-black/95 px-3 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back to Progress"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-off-white">Day review</p>
      </div>

      {review.source === "fixture" ? (
        <div role="status" className="mx-4 mt-4 rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft px-4 py-2.5 text-center text-xs font-medium text-warning">
          Demo data — not connected to your real history
        </div>
      ) : null}

      <div className="space-y-4 px-4 pt-4">
        <section className="rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)]">
          <DaySummarySection summary={review.summary} />
        </section>

        <TrainingSection training={review.training} />
        <NutritionSection nutrition={review.nutrition} />
        <CardioWeightSection cardio={review.cardio} weight={review.weight} />
      </div>
    </div>
  );
}

export default function HistoricalDayReviewPage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <HistoricalDayReviewScreen />
    </Suspense>
  );
}
