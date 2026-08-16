"use client";

import { useState } from "react";
import { DayHeader } from "@/components/today/day-header";
import { TrainingTimeCard } from "@/components/today/training-time-card";
import { NextActionBanner } from "@/components/today/next-action-banner";
import { AdaptiveSchedule } from "@/components/today/adaptive-schedule";
import { FuelSection } from "@/components/today/fuel-section";
import { CoachCard } from "@/components/coach/coach-card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { PUSH_WORKOUT } from "@/lib/mock-data";

// Today's information hierarchy (Phase 3.1 §5 moved Fuel to the top):
// 1. Greeting + date (DayHeader)
// 2. Calories + all three macros (FuelSection)
// 3. Training-time entry or current plan (TrainingTimeCard)
// 4. One clear next action (NextActionBanner)
// 5. Adaptive daily schedule (AdaptiveSchedule)
// 6. Secondary info (CoachCard)
export default function TodayPage() {
  const { isHydrated, dailyTrainingPlan, dailyPlan } = usePrototypeState();
  const [trainingTimeSheetOpen, setTrainingTimeSheetOpen] = useState(false);

  if (!isHydrated) {
    return <ScreenSkeleton />;
  }

  return (
    <div className="space-y-5 pb-4">
      <DayHeader />

      <FuelSection />

      <TrainingTimeCard
        plan={dailyTrainingPlan}
        open={trainingTimeSheetOpen}
        onOpenChange={setTrainingTimeSheetOpen}
      />

      <NextActionBanner
        nextAction={dailyPlan.nextAction}
        onOpenTrainingTime={() => setTrainingTimeSheetOpen(true)}
      />

      <AdaptiveSchedule dailyPlan={dailyPlan} />

      <div className="px-4">
        <CoachCard note={PUSH_WORKOUT.coachNote} />
      </div>
    </div>
  );
}
