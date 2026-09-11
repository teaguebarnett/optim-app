"use client";

import { Suspense, useState } from "react";
import { RotateCcw } from "lucide-react";
import { DayCarousel } from "@/components/training/day-carousel";
import { SessionSurface } from "@/components/training/session-surface";
import { PreStartTraining } from "@/components/training/pre-start-training";
import { CoachNote } from "@/components/today/coach-note";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { TRAINING_WEEKLY_NOTE } from "@/lib/mock-data";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import { resolveProgramTiming } from "@/lib/scheduling/program-timing";
import { AwaitingProgramSetup } from "@/components/today/awaiting-program-setup";

// Training's NOW architecture (Phase 4.4B-1 — see
// docs/design/OPTIM_VISUAL_CONSTITUTION.md): a compact header, a centered
// day carousel scoped to the client's real current week, and exactly one
// dominant session surface driven by whichever day is selected plus today's
// real training-intent state. Replaces the old generic seven-day grid +
// separate Today card + repetitive weekly list + buried coach note — see
// components/training/session-surface.tsx for the state machine and
// components/training/day-carousel.tsx for the carousel itself.
//
// Phase 5.4A — the client experience is phone-only at every viewport width
// (see components/app-shell/shell.tsx and
// docs/design/OPTIM_VISUAL_CONSTITUTION.md §19); a prior phase's desktop
// two-column rail was removed so this always renders the same single-column
// phone stack regardless of window size.
//
// `pickedDateIso` is the client's own carousel selection, kept entirely
// local to this page — it never mutates state.dateIso, dailyTrainingPlan,
// or any historical/program data (see the acceptance scenarios in this
// phase's spec). `null` means "no explicit pick yet," which always resolves
// to the client-local current day, so a rollover to a new real day is
// reflected automatically without this page needing its own reset logic.
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

function TrainingScreen() {
  const { isHydrated, state, activeContext, supabaseProgramNotAssigned } = usePrototypeState();
  const [pickedDateIso, setPickedDateIso] = useState<string | null>(null);

  if (!isHydrated) return <ScreenSkeleton />;
  if (supabaseProgramNotAssigned) return <AwaitingProgramSetup />;

  // Phase 5.6A.4 — the same shared pre-start boundary Today already uses
  // (see app/(client)/today/page.tsx), applied here too: none of this
  // screen's real calendar days, "today" workout, or coach focus note can
  // exist for a program that hasn't reached its own start date yet.
  const timing = resolveProgramTiming(state.programEnrollment, state.dateIso);
  if (timing.phase === "pre_program") {
    return <PreStartTraining timing={timing} state={state} />;
  }

  const selectedDateIso = pickedDateIso ?? state.dateIso;
  const isViewingToday = selectedDateIso === state.dateIso;
  const programWeek = deriveProgramWeek(state.programEnrollment, state.dateIso);
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  return (
    <div className="pb-4">
      <div className="flex items-start justify-between px-4 pt-4">
        <h1 className="text-display text-off-white">Training</h1>
        <div className="flex flex-col items-end gap-0.5 pt-1">
          {programWeek !== null ? (
            <span className="text-meta text-neutral">
              Week {programWeek} of {state.programEnrollment.durationWeeks}
            </span>
          ) : null}
          {/* Fixed-height reservation so this action's appearance/disappearance
              never shifts "Week X of Y" or the carousel below it. */}
          <div className="flex h-8 items-center">
            {!isViewingToday ? (
              <button
                type="button"
                onClick={() => setPickedDateIso(null)}
                className="relative flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-action text-accent-strong before:absolute before:-inset-1 before:content-['']"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Back to today
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <DayCarousel selectedDateIso={selectedDateIso} onSelect={setPickedDateIso} />
      </div>

      <div className="mt-4 px-4">
        <SessionSurface selectedDateIso={selectedDateIso} />
      </div>

      {isViewingToday ? (
        <div className="mt-4 px-4">
          <CoachNote note={TRAINING_WEEKLY_NOTE} label={`${coachName}'s focus for this week`} />
        </div>
      ) : null}
    </div>
  );
}
