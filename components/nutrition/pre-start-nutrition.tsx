import { CalendarClock, MessageCircle } from "lucide-react";
import { NO_TARGET_LABEL, resolveDisplayTargets, targetText } from "@/lib/nutrition/plan-display";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { NUTRITION_NOT_ASSIGNED_LABEL } from "@/lib/calculations";
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
  const targets = state.nutritionTargets;
  // U3A — a method plan (e.g. calories and protein) shows only what's prescribed.
  const display = resolveDisplayTargets(state);
  // With no assigned targets there is no nutrition plan to "start" — name
  // the program start instead of implying one exists.
  const subject = display.planAssigned ? "Your nutrition plan" : "Your program";
  const relative = days === 1 ? `${subject} starts tomorrow.` : days > 1 ? `${subject} starts in ${days} days.` : `${subject} starts today.`;

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
          <span className="font-medium text-off-white">{targetText(display.calories, display.planAssigned, NUTRITION_NOT_ASSIGNED_LABEL, (n) => `${n} cal`)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral">Macros</span>
          <span className="font-medium text-off-white">
            {targets ? `${targets.proteinG}P / ${targets.carbsG}C / ${targets.fatG}F` : [display.proteinG !== null ? `${display.proteinG}P` : null, display.carbsG !== null ? `${display.carbsG}C` : null, display.fatG !== null ? `${display.fatG}F` : null].filter(Boolean).join(" / ") || (display.planAssigned ? NO_TARGET_LABEL : NUTRITION_NOT_ASSIGNED_LABEL)}
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
