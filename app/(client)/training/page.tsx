"use client";

import { Suspense } from "react";
import { TrainingScreen } from "@/components/training/training-screen";
import { ScreenSkeleton } from "@/components/ui/skeleton";

// Phase 13B (Gate 2A) — /training is preserved as a functional deep link
// (Today's workout-task shortcut and any bookmarked/shared URL) rendering
// the exact same TrainingScreen the /plan destination's Training subsection
// uses — see components/training/training-screen.tsx and
// app/(client)/plan/page.tsx. No business logic lives in either page file.
//
// The default export just wraps the real screen in Suspense: DayCarousel
// and PastSessionCard both read useHistoryDayPicker/useHistoricalDayReview,
// which resolve their live-vs-demo source via useSearchParams() (see
// hooks/use-historical-day-review.ts) — the same reason
// app/progress/history/[date]/page.tsx wraps its screen in Suspense.
export default function TrainingPage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <TrainingScreen />
    </Suspense>
  );
}
