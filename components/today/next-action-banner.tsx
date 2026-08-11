"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { PlannerItem } from "@/lib/planning/types";

interface NextActionBannerProps {
  nextAction: PlannerItem | null;
  onOpenTrainingTime: () => void;
}

/**
 * Today-screen hierarchy item #3: one visually dominant next action. The
 * planner (lib/planning/planner.ts) already decided what it is — this
 * component only renders that decision and routes the tap to the right
 * real action (open the training-time sheet, begin/resume the actual
 * workout, or jump to the relevant item in the adaptive schedule below).
 * It never invents a completed meal, workout, or recommendation itself.
 */
export function NextActionBanner({ nextAction, onOpenTrainingTime }: NextActionBannerProps) {
  const { dispatch } = usePrototypeState();
  const router = useRouter();

  if (!nextAction) return null;

  function handleClick() {
    if (!nextAction) return;
    if (nextAction.kind === "training-time") {
      onOpenTrainingTime();
      return;
    }
    if (nextAction.kind === "workout") {
      dispatch({ type: "START_WORKOUT" });
      router.push("/training/workout");
      return;
    }
    if (nextAction.href?.startsWith("#")) {
      document.getElementById(nextAction.href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="mx-4">
      <button
        onClick={handleClick}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-accent px-4 py-4 text-left shadow-[var(--shadow-subtle)] transition-transform active:scale-[0.99]"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-on-accent/80">Next</p>
          <p className="mt-0.5 truncate text-[17px] font-semibold text-on-accent">
            {nextAction.actionLabel ?? nextAction.title}
          </p>
        </div>
        <ArrowRight size={20} className="shrink-0 text-on-accent" aria-hidden="true" />
      </button>
    </div>
  );
}
