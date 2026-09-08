import { CalendarClock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { CoachNote } from "@/components/today/coach-note";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { ProgramTiming } from "@/lib/scheduling/program-timing";
import type { AppState } from "@/lib/state";

function formatFriendlyDate(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Phase 5.0C — the client's own pre-start experience: shown instead of the
 * normal actionable Today whenever they're active but their program's
 * start date hasn't arrived yet in their own local calendar (see
 * lib/scheduling/program-timing.ts's resolveProgramTiming, called from
 * app/(client)/today/page.tsx). Never a blank/actionable day for a program
 * that hasn't begun — no meal, workout, cardio, or completion tiles, no
 * fabricated progress, and never a mutation to programWeek/history. Once
 * the client's local date reaches the start date, the same derivation
 * naturally resolves to "active_program" and this component simply stops
 * rendering — no separate transition logic needed.
 *
 * Acceptance-recovery pass — `todaysEdgeText` is a coach-approved Today's
 * Edge message, when one exists for this exact client/date (see
 * app/(client)/today/page.tsx's getDailyBriefing lookup). Training and
 * nutrition stay locked until the real start date, but coach communication
 * is not a training artifact — it must still reach the client here.
 */
export function PreStartToday({ timing, state, todaysEdgeText }: { timing: ProgramTiming; state: AppState; todaysEdgeText?: string | null }) {
  const { activeContext } = usePrototypeState();
  const coach = activeContext.primaryCoach;
  const days = timing.daysUntilStart ?? 0;
  const startLabel = formatFriendlyDate(state.programEnrollment.startDateIso);
  const relative = days === 1 ? "Your program starts tomorrow." : days > 1 ? `Your program starts in ${days} days.` : "Your program starts today.";
  const targets = state.nutritionTargets;

  return (
    <div className="px-4 pb-6 pt-5">
      <p className="text-label text-brass-strong">Setup complete</p>
      <h1 className="mt-1 text-display text-off-white">You&apos;re all set, {activeContext.clientProfile?.name?.split(" ")[0] ?? "there"}.</h1>

      {todaysEdgeText ? (
        <div className="mt-4">
          <CoachNote note={todaysEdgeText} label="Today's Edge" />
        </div>
      ) : null}

      <Card className="mt-5 border-l-2 border-l-brass">
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
        <div className="flex items-center gap-2.5">
          <Avatar initials={coach?.avatarInitials ?? "?"} size="sm" />
          <p className="min-w-0 flex-1 text-body text-off-white">
            <span className="font-semibold">{coach?.displayName ?? "Your coach"}</span> has finished preparing your plan. Your daily
            experience opens automatically on your start date.
          </p>
        </div>
      </Card>

      <p className="mb-2 mt-6 text-label text-neutral">Your plan at a glance</p>
      <Card className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral">Program length</span>
          <span className="font-medium text-off-white">{state.programEnrollment.durationWeeks} weeks</span>
        </div>
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral">Weekly check-in</span>
          <span className="font-medium text-off-white">{state.checkInSchedule ? "Assigned" : "None for now"}</span>
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
