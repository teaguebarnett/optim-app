"use client";

import { Suspense } from "react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useProgressDashboard } from "@/hooks/use-progress-dashboard";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { ProgressHeader } from "@/components/progress/progress-header";
import { PriorityCard } from "@/components/progress/priority-card";
import { WeightCard } from "@/components/progress/weight-card";
import { TrainingCard } from "@/components/progress/training-card";
import { NutritionCard } from "@/components/progress/nutrition-card";
import { CardioCard } from "@/components/progress/cardio-card";
import { CheckInCard } from "@/components/progress/checkin-card";
import { CoachGuidanceCard } from "@/components/progress/coach-guidance-card";
import { HistoryDayPicker } from "@/components/progress/history-day-picker";

// Phase 4.2 — the client-visible expression of OPTIM's memory. Every value
// on this page traces back to a Phase 4.1 record, correction, weekly
// review, authored note, or pure derivation — see lib/progress/
// build-dashboard.ts, the one place this data is assembled. Card order is
// stable and never rearranges; only the priority card is conditional.
function ProgressDashboard() {
  const { isHydrated } = usePrototypeState();
  const { dashboard, source } = useProgressDashboard();

  if (!isHydrated) return <ScreenSkeleton />;

  return (
    <div className="space-y-4 pb-6 pt-5">
      {source === "fixture" ? (
        <div
          role="status"
          className="mx-4 rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft px-4 py-2.5 text-center text-xs font-medium text-warning"
        >
          Demo data — not connected to your real history
        </div>
      ) : null}

      <ProgressHeader header={dashboard.header} />

      <PriorityCard priority={dashboard.priority} />

      <WeightCard weight={dashboard.weight} />

      <div className="grid grid-cols-2 gap-3 px-4 max-[360px]:grid-cols-1">
        <TrainingCard training={dashboard.training} />
        <NutritionCard nutrition={dashboard.nutrition} />
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 max-[360px]:grid-cols-1">
        <CardioCard cardio={dashboard.cardio} />
        <CheckInCard checkIn={dashboard.checkIn} />
      </div>

      <CoachGuidanceCard coachGuidance={dashboard.coachGuidance} />

      <HistoryDayPicker />
    </div>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <ProgressDashboard />
    </Suspense>
  );
}
