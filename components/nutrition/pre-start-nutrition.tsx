import { CalendarClock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { formatLongDateLabel } from "@/lib/shared/local-date";
import type { ProgramTiming } from "@/lib/scheduling/program-timing";
import type { AppState } from "@/lib/state";

/**
 * Phase 5.6A.4 — Nutrition's own pre-start gate, mirroring
 * components/today/pre-start-today.tsx and
 * components/training/pre-start-training.tsx. Before this, Nutrition
 * rendered a fully actionable calorie ring/meal timeline/photo-estimator
 * for a client whose approved program hadn't started yet — no target is
 * "due" and no meal can be "logged" before the client's real start date.
 * The approved calories/macros are still shown here, but only ever as an
 * explicitly labeled plan preview — never as today's live totals.
 */
export function PreStartNutrition({ timing, state }: { timing: ProgramTiming; state: AppState }) {
  const { activeContext } = usePrototypeState();
  const coach = activeContext.primaryCoach;
  const days = timing.daysUntilStart ?? 0;
  const startLabel = formatLongDateLabel(state.programEnrollment.startDateIso);
  const relative = days === 1 ? "Your nutrition plan starts tomorrow." : days > 1 ? `Your nutrition plan starts in ${days} days.` : "Your nutrition plan starts today.";
  const targets = state.nutritionTargets;

  return (
    <div className="px-4 pb-6 pt-5">
      <h1 className="text-display text-off-white">Nutrition</h1>

      <Card className="mt-4 border-l-2 border-l-brass">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
            <CalendarClock size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-heading text-off-white">{relative}</p>
            <p className="mt-1 text-body text-neutral">{startLabel}</p>
          </div>
        </div>
      </Card>

      <Card className="mt-3">
        <p className="text-body text-off-white">Your daily targets and meal tracking unlock automatically on your start date.</p>
      </Card>

      <p className="mb-2 mt-6 text-label text-neutral">Nutrition plan preview</p>
      <Card className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral">Daily calories</span>
          <span className="font-medium text-off-white">{targets.calories} cal</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral">Macros</span>
          <span className="font-medium text-off-white">
            {targets.proteinG}P / {targets.carbsG}C / {targets.fatG}F
          </span>
        </div>
      </Card>

      <Link
        href="/chat"
        className="mt-5 flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border-strong bg-surface px-4 py-3.5 text-action text-off-white transition-colors hover:border-accent/40"
        style={{ transitionDuration: "var(--motion-base)" }}
      >
        <MessageCircle size={16} className="text-neutral" />
        Message {coach?.displayName ?? "your coach"}
      </Link>
    </div>
  );
}
