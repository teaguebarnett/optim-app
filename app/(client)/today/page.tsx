"use client";

import { useState } from "react";
import { DayHeader } from "@/components/today/day-header";
import { FuelSection } from "@/components/today/fuel-section";
import { TrainingTimeCard } from "@/components/today/training-time-card";
import { TodayBento } from "@/components/today/today-bento";
import { CoachNote } from "@/components/today/coach-note";
import { PreStartToday } from "@/components/today/pre-start-today";
import { DailyEntranceSequence } from "@/components/today/daily-entrance-sequence";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { PUSH_WORKOUT } from "@/lib/mock-data";
import { resolveProgramTiming } from "@/lib/scheduling/program-timing";

// Today's visual architecture (Phase 4.4B.1 bento revision — see
// docs/design/OPTIM_VISUAL_CONSTITUTION.md): a compact header, one
// instrument-panel overview, and a genuine 2-column bento grid for
// everything else — not a linear stack or a chronological list.
//
// - DayHeader: compact greeting/date/program context, bare on canvas.
// - CoachNote: sits directly beneath the date/program line as top-of-day
//   human context (not a low-priority tile), differentiated through
//   composition — a brass keyline, explicit "From your coach" label —
//   rather than a different typeface. See coach-note.tsx.
// - Daily Overview: the calorie ring/macro readout and training-time
//   status composed as one instrument panel (see fuel-section.tsx).
// - TodayBento: the adaptive grid — the planner's true next action as the
//   one dominant full-width tile, a slim day-progress status strip, and
//   every remaining item as a 1-column tile that only claims a full row
//   once tapped. See today-bento.tsx.
export default function TodayPage() {
  const { isHydrated, state, dispatch, dailyTrainingPlan, dailyPlan } = usePrototypeState();
  const [trainingTimeSheetOpen, setTrainingTimeSheetOpen] = useState(false);

  if (!isHydrated) {
    return <ScreenSkeleton />;
  }

  // A client is only ever "active" once a real program has been assigned
  // (see lib/coach/setup.ts) — but the assigned start date can still be in
  // the future relative to this client's own local calendar date. Showing
  // the normal actionable day for a program that hasn't begun would be
  // meaningless (and previously showed a blank week label) — see
  // components/today/pre-start-today.tsx and the Phase 5.0C brief's
  // pre-start requirement.
  const timing = resolveProgramTiming(state.programEnrollment, state.dateIso);
  if (timing.phase === "pre_program") {
    return <PreStartToday timing={timing} state={state} />;
  }

  // Phase 5.4B, spec §8 — shown only once per client-local calendar date;
  // a second same-day open (dailyEntrance.lastSeenLocalDateIso already
  // matches today's real dateIso) skips straight to the normal experience
  // below. See lib/state.ts's MARK_DAILY_ENTRANCE_SEEN and
  // DailyEntranceState's doc for why a new calendar day needs no extra
  // rollover handling of its own.
  if (state.dailyEntrance.lastSeenLocalDateIso !== state.dateIso) {
    return <DailyEntranceSequence onDone={() => dispatch({ type: "MARK_DAILY_ENTRANCE_SEEN" })} />;
  }

  return (
    <div className="pb-4">
      <DayHeader />

      <div className="mt-3">
        <CoachNote note={PUSH_WORKOUT.coachNote} />
      </div>

      <section className="mx-4 mt-3 divide-y divide-border/70 overflow-hidden rounded-[var(--radius-lg)] bg-charcoal shadow-[var(--shadow-subtle)]">
        <FuelSection />
        <TrainingTimeCard
          plan={dailyTrainingPlan}
          open={trainingTimeSheetOpen}
          onOpenChange={setTrainingTimeSheetOpen}
        />
      </section>

      <div className="mt-5">
        <TodayBento dailyPlan={dailyPlan} />
      </div>
    </div>
  );
}
