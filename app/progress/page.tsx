"use client";

import { Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LineChart } from "@/components/progress/line-chart";
import { BarChart } from "@/components/progress/bar-chart";
import { CoachCard } from "@/components/coach/coach-card";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import {
  MILESTONES,
  NUTRITION_ADHERENCE_HISTORY,
  PROGRESS_COACH_NOTE,
  STRENGTH_HISTORY,
  WEEKLY_COMPLETION_HISTORY,
  WEIGHT_HISTORY,
} from "@/lib/mock-data";

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProgressPage() {
  const { isHydrated } = usePrototypeState();
  if (!isHydrated) return <ScreenSkeleton />;

  return (
    <div className="px-4 pb-6 pt-5">
      <h1 className="text-xl font-semibold text-off-white">Progress</h1>
      <p className="mt-1 text-sm text-neutral">A high-level look at the last four weeks.</p>

      <Card className="mt-4">
        <p className="text-sm font-semibold text-off-white">Body weight</p>
        <p className="text-xs text-neutral">Last four weekly check-ins</p>
        <div className="mt-2">
          <LineChart
            points={WEIGHT_HISTORY.map((p) => ({ label: formatShortDate(p.dateIso), value: p.weightLb }))}
            valueSuffix=" lb"
          />
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-semibold text-off-white">Weekly training completion</p>
        <p className="text-xs text-neutral">Share of programmed sessions logged</p>
        <div className="mt-2">
          <BarChart points={WEEKLY_COMPLETION_HISTORY.map((p) => ({ label: p.weekLabel, value: p.completionPercent }))} color="var(--pc-accent)" />
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-semibold text-off-white">Nutrition adherence</p>
        <p className="text-xs text-neutral">Days on target with logged nutrition</p>
        <div className="mt-2">
          <BarChart points={NUTRITION_ADHERENCE_HISTORY.map((p) => ({ label: p.weekLabel, value: p.adherencePercent }))} color="var(--pc-success)" />
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-semibold text-off-white">Incline Dumbbell Press — top set</p>
        <p className="text-xs text-neutral">Heaviest working set logged each week</p>
        <div className="mt-2">
          <LineChart
            points={STRENGTH_HISTORY.map((p) => ({ label: formatShortDate(p.dateIso), value: p.topSetWeightLb }))}
            color="var(--pc-success)"
            valueSuffix=" lb"
          />
        </div>
      </Card>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral">Recent milestones</p>
        <div className="space-y-2">
          {MILESTONES.map((m) => (
            <div key={m.id} className="flex gap-3 rounded-[var(--radius-md)] border border-border bg-charcoal px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                <Award size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-off-white">{m.title}</p>
                <p className="mt-0.5 text-xs text-neutral">{m.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <CoachCard note={PROGRESS_COACH_NOTE} />
      </div>
    </div>
  );
}
