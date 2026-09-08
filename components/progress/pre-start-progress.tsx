import { CalendarClock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { formatLongDateLabel } from "@/lib/shared/local-date";
import type { ProgramTiming } from "@/lib/scheduling/program-timing";
import type { AppState } from "@/lib/state";

/**
 * Phase 5.6A.4 — Progress's own pre-start gate, mirroring
 * components/today/pre-start-today.tsx and the Training/Nutrition
 * equivalents. Before this, the full dashboard (weight, training,
 * nutrition, cardio, check-in cards) rendered unconditionally, even though
 * a client whose program hasn't started yet has no real adherence,
 * weigh-in, or completion history to show — there is nothing honest for
 * this page to display yet.
 */
export function PreStartProgress({ timing, state }: { timing: ProgramTiming; state: AppState }) {
  const { activeContext } = usePrototypeState();
  const coach = activeContext.primaryCoach;
  const days = timing.daysUntilStart ?? 0;
  const startLabel = formatLongDateLabel(state.programEnrollment.startDateIso);
  const relative = days === 1 ? "Your progress tracking starts tomorrow." : days > 1 ? `Your progress tracking starts in ${days} days.` : "Your progress tracking starts today.";

  return (
    <div className="px-4 pb-6 pt-5">
      <h1 className="text-display text-off-white">Progress</h1>

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
        <p className="text-body text-off-white">There&apos;s nothing to track yet — check back once your program begins on your start date.</p>
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
