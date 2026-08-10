"use client";

import { DayHeader } from "@/components/today/day-header";
import { CoachCard } from "@/components/coach/coach-card";
import { DailyTimeline } from "@/components/today/daily-timeline";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { PUSH_WORKOUT } from "@/lib/mock-data";

export default function TodayPage() {
  const { isHydrated, dailyCompletionPercent } = usePrototypeState();

  if (!isHydrated) {
    return <ScreenSkeleton />;
  }

  return (
    <div className="pb-4">
      <DayHeader completionPercent={dailyCompletionPercent} />
      <div className="px-4 pt-4">
        <CoachCard note={PUSH_WORKOUT.coachNote} />
      </div>
      <div className="mt-5">
        <DailyTimeline />
      </div>
    </div>
  );
}
