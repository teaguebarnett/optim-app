"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrainingTimeWheel } from "@/components/today/training-time-wheel";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { getDailyBriefing } from "@/lib/coach/repository";
import { generateDailyBriefing, isBriefingVisibleToClient, resolveBriefingGenerationInput } from "@/lib/coach/daily-briefing";
import { resolveWorkoutAvailabilityForDay } from "@/lib/mock-data";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import { localDateDayOfWeek } from "@/lib/shared/local-date";
import { formatTimeLabel } from "@/lib/planning/training-plan";
import type { SkipReason } from "@/lib/types";

/**
 * Phase 5.4B, spec §8 — the premium first-open-of-the-day sequence, shown
 * only once per client-local calendar date (see AppState.dailyEntrance,
 * gated by the parent Today page) before the normal Today experience.
 *
 * Training day: Screen 1 confirms/collects today's training time (reusing
 * the exact same wheel and SET_TRAINING_* actions Today's own sheet already
 * uses — never a second, parallel time-entry system); Screen 2 shows the
 * short "Today's Edge" reflecting whatever time was just confirmed.
 * Rest day (recognized from the coach's own assigned schedule, via
 * resolveWorkoutAvailabilityForDay — never from the client's own
 * not-yet-made daily decision): skips straight to a recovery-oriented
 * Screen 2, no irrelevant training-time question.
 *
 * "This isn't happening today" reuses the existing skip-reason pattern
 * (SkipReasonSheet + SKIP_WORKOUT) — a real adherence signal, never an
 * autonomous program rewrite.
 */
export function DailyEntranceSequence({ onDone }: { onDone: () => void }) {
  const { state, dispatch, activeContext } = usePrototypeState();
  const { platform } = usePlatformState();
  const [draftTime, setDraftTime] = useState(state.dailyTrainingPlan?.plannedTime24 ?? "07:00");
  const [skipSheetOpen, setSkipSheetOpen] = useState(false);
  const [confirmedTimeLabel, setConfirmedTimeLabel] = useState<string | null>(
    state.dailyTrainingPlan?.status === "scheduled" ? (state.dailyTrainingPlan.plannedTimeLabel ?? null) : null
  );
  const [pastScreenOne, setPastScreenOne] = useState(false);
  const [wantsToChangeTime, setWantsToChangeTime] = useState(false);
  const [cancelledToday, setCancelledToday] = useState(false);

  const clientDeclaredRest = state.dailyTrainingPlan?.status === "rest_day";
  const dayOfWeek = localDateDayOfWeek(state.dateIso);
  const weekNumber = deriveProgramWeek(state.programEnrollment, state.dateIso);
  const availability = resolveWorkoutAvailabilityForDay(dayOfWeek, clientDeclaredRest, state.assignedProgram, weekNumber);
  const isTrainingDay = !clientDeclaredRest && availability.scheduleEntry?.type === "training";
  const hasExistingTimeDecision = state.dailyTrainingPlan?.status === "scheduled";

  const showScreenOne = isTrainingDay && !pastScreenOne;

  function handleConfirmExistingTime() {
    setPastScreenOne(true);
  }

  function handleSetTime() {
    dispatch({ type: "SET_TRAINING_TIME", time24: draftTime });
    setConfirmedTimeLabel(formatTimeLabel(draftTime));
    setPastScreenOne(true);
  }

  function handleNotSureYet() {
    dispatch({ type: "SET_TRAINING_UNSURE" });
    setPastScreenOne(true);
  }

  function handleNotHappening(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_WORKOUT", reason, note });
    setSkipSheetOpen(false);
    setCancelledToday(true);
    setPastScreenOne(true);
  }

  if (showScreenOne) {
    return (
      <div className="flex min-h-[100dvh] flex-col justify-center px-6 py-10">
        <p className="text-label text-accent-fg">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1.5 text-display text-off-white">Good morning, {activeContext.clientProfile?.name?.split(" ")[0] ?? "there"}.</h1>

        {hasExistingTimeDecision && !wantsToChangeTime ? (
          <div className="mt-8 space-y-4">
            <p className="text-body text-neutral">
              Training around <span className="font-semibold text-off-white">{state.dailyTrainingPlan?.plannedTimeLabel}</span> today?
            </p>
            <Button className="w-full" onClick={handleConfirmExistingTime}>
              That&apos;s right
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setWantsToChangeTime(true)}>
              Change time
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <p className="text-body text-neutral">What time are you training today?</p>
            <TrainingTimeWheel value={draftTime} onChange={setDraftTime} />
            <Button className="w-full" onClick={handleSetTime}>
              Confirm time
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleNotSureYet}>
                Not sure yet
              </Button>
              <Button variant="outline" onClick={() => setSkipSheetOpen(true)}>
                Not happening today
              </Button>
            </div>
          </div>
        )}

        <SkipReasonSheet
          open={skipSheetOpen}
          onClose={() => setSkipSheetOpen(false)}
          title="What's going on?"
          description="A quick reason helps OPTIM adjust today, not the whole plan."
          onConfirm={handleNotHappening}
        />
      </div>
    );
  }

  const briefing = getDailyBriefing(platform, state.clientId, state.dateIso);
  const briefingVisible = briefing && isBriefingVisibleToClient(briefing.status);
  // `state` already reflects whatever decision was just made (React
  // re-renders with the reducer's own updated dailyTrainingPlan) — no need
  // to re-derive or override it here.
  const fallback = generateDailyBriefing(resolveBriefingGenerationInput(state, state.primaryCoachId, "review_first", new Date().toISOString()));
  const todaysEdgeText = cancelledToday
    ? "No training today — OPTIM adjusted your reminders. Focus on recovery and hitting your nutrition targets."
    : briefingVisible
      ? briefing!.todaysEdgeText
      : fallback.todaysEdgeText;

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center px-6 py-10">
      <p className="text-label text-brass-strong">TODAY&apos;S EDGE</p>
      <p className="mt-3 text-heading text-off-white">{todaysEdgeText}</p>
      {confirmedTimeLabel ? <p className="mt-3 text-sm text-neutral">Training at {confirmedTimeLabel} today.</p> : null}
      <Button className="mt-8 w-full" onClick={onDone}>
        <Sparkles size={15} aria-hidden="true" /> Enter OPTIM
      </Button>
    </div>
  );
}
