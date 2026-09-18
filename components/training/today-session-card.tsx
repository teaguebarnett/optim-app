"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, BedDouble, CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceShell } from "@/components/training/surface-shell";
import { WorkoutDetailsSheet } from "@/components/workout/workout-details-sheet";
import { TrainingTimeSheet } from "@/components/today/training-time-sheet";
import { UniversalTodaySessionCard } from "@/components/training/universal-today-session-card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { resolveWorkoutAvailabilityForDay } from "@/lib/mock-data";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import { localDateDayOfWeek } from "@/lib/shared/local-date";
import { resolvePlannedDateTime } from "@/lib/planning/training-plan";
import type { DailyTaskState } from "@/lib/types";

/**
 * Training's dominant session surface for the actual current day — Phase
 * 4.4B-1. This is the one place the training-intent state machine (no
 * response yet / time selected / not sure yet / rest day, from
 * dailyTrainingPlan — see lib/planning/types.ts) maps onto the real primary
 * action, replacing the old page's separate Today-card + weekly-list +
 * Last-Week + buried coach-note composition.
 *
 * Every status/label mirrors the exact real-data rules
 * lib/planning/planner.ts and lib/calculations.ts already established for
 * today's workout (the isRestDay definition, etc.) — never a competing
 * scheduling formula — but the ACTION mapping is Training-specific per this
 * phase's spec: "Set training time" is only ever the primary action when no
 * response exists yet; once a response exists (scheduled or unsure), "Start
 * session" is primary. This deliberately differs from Today's WorkoutTask
 * (which always shows "Begin workout" regardless of training-intent state)
 * — WorkoutTask itself is untouched.
 *
 * Phase 4.4B-1.1 — availability (whether real catalog content exists for
 * today) is resolved through the one shared resolveWorkoutAvailabilityForDay
 * (see lib/mock-data.ts), the exact same function lib/calculations.ts and
 * lib/planning/planner.ts use, so Today and Training can never disagree
 * about whether a given day is executable. Selecting a training time never
 * factors into that result — it only ever changes which of the "no
 * response / unsure / scheduled" branches below applies once the workout is
 * already known to be available.
 *
 * Phase 4.4B-2.1 correction — `resolveWorkoutAvailabilityForDay`'s
 * `isUnavailable` is deliberately narrow (only "the schedule itself says
 * training, with no catalog match" — the exact thing lib/calculations.ts's
 * "locked" state means). It does NOT cover a scheduled *rest* day that's
 * since been overridden by a real training-time decision (unsure/scheduled)
 * with still no catalog entry for that day of week — a real, legitimate
 * combination (e.g. choosing "unsure" on a Sunday). The `workoutUnavailable`
 * local below is the broader, correct check for whether THIS component can
 * safely render the full prescription — see its own comment.
 */
export function TodaySessionCard() {
  const router = useRouter();
  const { state, dispatch, activeContext, tasks, dailyTrainingPlan } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);

  // Phase 6A — a real Supabase client whose active assignment exists ONLY
  // in the universal grammar (no legacy view — see AppState.assignedProgram's
  // own doc) renders through a dedicated, simpler surface instead of falling
  // through this component's resolveWorkoutAvailabilityForDay-based logic
  // below, which would otherwise silently show this client the global demo
  // catalog for today (that fallback is safe only for the genuinely
  // assignment-less seeded demo client it was written for).
  if (state.assignedUniversalProgram && !state.assignedProgram) {
    return <UniversalTodaySessionCard assignedProgram={state.assignedUniversalProgram} coachName={coachName} />;
  }

  const session = state.workoutSession;
  const todayDayOfWeek = localDateDayOfWeek(state.dateIso);
  const clientDeclaredRest = dailyTrainingPlan?.status === "rest_day";
  const availability = resolveWorkoutAvailabilityForDay(
    todayDayOfWeek,
    clientDeclaredRest,
    state.assignedProgram,
    deriveProgramWeek(state.programEnrollment, state.dateIso)
  );
  const catalogWorkoutToday = availability.workout;
  const hasFullDetail = !!catalogWorkoutToday;
  const isRestSurface = clientDeclaredRest || (!dailyTrainingPlan && availability.scheduleEntry?.type === "rest");
  // Correction: `availability.isUnavailable` only ever covers "the schedule
  // itself says training, with no catalog match" (see
  // resolveWorkoutAvailabilityForDay's doc — that narrower meaning is
  // exactly right for lib/calculations.ts's "locked" state). It's
  // deliberately false for a scheduled *rest* day, even one the client has
  // since overridden with a real training-time decision (unsure/scheduled)
  // — and WORKOUTS_BY_ID has no catalog entry for any rest day either. The
  // branch below renders the real prescription (estimatedDurationMin,
  // exercises.length), so it must gate on whether catalog detail actually
  // exists (`!hasFullDetail`), not on the narrower schedule-type check —
  // otherwise a rest day overridden by a training-time decision falls
  // through with no real workout to read from and crashes.
  const workoutUnavailable = !isRestSurface && !hasFullDetail;
  const workoutDisplayName = availability.displayName;
  const workoutFocus = availability.focus;
  const workoutPillState: DailyTaskState = tasks.find((t) => t.id === "workout")?.state ?? "upcoming";

  function handleStart() {
    if (session.status !== "in-progress") dispatch({ type: "START_WORKOUT" });
    router.push("/training/workout");
  }

  let content: ReactNode;

  if (session.status === "in-progress") {
    // Once a real session exists, its title/focus must match its own
    // resolvedWorkout snapshot (see WorkoutSession.resolvedWorkout) — what
    // was actually started/logged — never a live re-resolution of today's
    // schedule, which a later program edit could change out from under an
    // already-running session.
    content = (
      <SurfaceShell
        icon={<Dumbbell size={22} />}
        title={session.resolvedWorkout?.name ?? workoutDisplayName}
        pillState={workoutPillState}
        meta={session.resolvedWorkout?.focus ?? workoutFocus}
      >
        <p className="text-body text-off-white">Pick up right where you left off.</p>
        <Button className="mt-4 w-full" onClick={() => router.push("/training/workout")}>
          Continue session
        </Button>
      </SurfaceShell>
    );
  } else if (session.status === "completed" || session.status === "ended-early" || session.status === "skipped") {
    const summary = session.summary;
    const endedEarly = session.status === "ended-early";
    const icon =
      session.status === "skipped" ? <XCircle size={22} /> : endedEarly ? <PauseCircle size={22} /> : <CheckCircle2 size={22} />;
    content = (
      <SurfaceShell
        icon={icon}
        title={session.resolvedWorkout?.name ?? workoutDisplayName}
        pillState={workoutPillState}
        meta={session.resolvedWorkout?.focus ?? workoutFocus}
      >
        {session.status === "skipped" ? (
          <p className="text-body text-off-white">Today&apos;s session was skipped.</p>
        ) : (
          <>
            {endedEarly ? (
              <p className="text-body text-off-white">Ended early — completed sets and RPE are saved.</p>
            ) : summary ? (
              <p className="text-body text-off-white">{summary.headline}</p>
            ) : null}
            {summary ? <p className="mt-1 text-meta text-neutral">{summary.detail}</p> : null}
          </>
        )}
        {workoutPillState === "awaiting-review" ? (
          <p className="mt-3 text-meta text-warning">
            I&apos;ve organized this for {coachName}&apos;s review. {coachName} will make any programming decisions.
          </p>
        ) : null}
        <Button className="mt-4 w-full" variant="outline" onClick={() => router.push("/training/workout")}>
          Review session
        </Button>
      </SurfaceShell>
    );
  } else if (isRestSurface) {
    content = (
      <SurfaceShell icon={<BedDouble size={22} />} title="Rest day">
        <p className="text-body text-off-white">
          {clientDeclaredRest ? "Today is set as a rest day." : "Today is a scheduled rest day."}
        </p>
        <div className="mt-3 rounded-[var(--radius-sm)] bg-off-white/[0.04] p-3">
          <p className="text-label text-neutral">Originally planned</p>
          <p className="mt-1 text-subheading text-off-white">{workoutDisplayName}</p>
          {workoutFocus ? <p className="text-meta text-neutral">{workoutFocus}</p> : null}
          <p className="mt-1 text-meta text-neutral">Stays available if your plan changes — nothing here has been marked complete.</p>
        </div>
        <div className="mt-4 flex gap-2">
          {clientDeclaredRest ? (
            <Button className="flex-1" variant="outline" onClick={() => setTimeSheetOpen(true)}>
              Change decision
            </Button>
          ) : null}
          {hasFullDetail ? (
            <Button className="flex-1" variant={clientDeclaredRest ? "ghost" : "outline"} onClick={handleStart}>
              Train anyway
            </Button>
          ) : null}
        </div>
      </SurfaceShell>
    );
  } else if (workoutUnavailable || !catalogWorkoutToday) {
    // The `|| !catalogWorkoutToday` is a deliberate second, direct guard —
    // not just relying on `workoutUnavailable`'s boolean elimination.
    // Whatever the exact reason (today's schedule has no catalog match,
    // today is a rest day overridden by a training-time decision with no
    // catalog match, or any other future combination this branch chain
    // hasn't anticipated), rendering the honest "unavailable" surface here
    // is always correct and never crashes — and it lets TypeScript narrow
    // `catalogWorkoutToday` to a real Workout in the final branch below.
    content = (
      <SurfaceShell icon={<Dumbbell size={22} />} title={workoutDisplayName} meta={workoutFocus}>
        <p className="text-body text-off-white">Workout details unavailable.</p>
        <p className="mt-1 text-meta text-neutral">
          {workoutDisplayName} is scheduled today, but full session detail isn&apos;t available yet. Check with{" "}
          {coachName} if you have questions.
        </p>
      </SurfaceShell>
    );
  } else {
    // Not started, real content available: no response / unsure / scheduled.
    // `catalogWorkoutToday` is narrowed to a real Workout here — the branch
    // above already returned for every case where it could be undefined.
    const plannedAt = dailyTrainingPlan ? resolvePlannedDateTime(dailyTrainingPlan, new Date()) : null;
    const scheduleLabel =
      dailyTrainingPlan?.status === "scheduled"
        ? plannedAt && new Date().getTime() >= plannedAt.getTime()
          ? `Training was planned for ${dailyTrainingPlan.plannedTimeLabel}.`
          : `Planned for ${dailyTrainingPlan.plannedTimeLabel}`
        : dailyTrainingPlan?.status === "unsure"
          ? "You said you weren't sure about a time yet."
          : undefined;

    content = (
      <SurfaceShell
        icon={<Dumbbell size={22} />}
        title={workoutDisplayName}
        pillState={workoutPillState}
        meta={workoutFocus}
        scheduleLabel={scheduleLabel}
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-neutral">
          <span>{catalogWorkoutToday.estimatedDurationMin} min</span>
          <span aria-hidden="true">·</span>
          <span>{catalogWorkoutToday.exercises.length} exercises</span>
        </div>

        <div className="mt-4 flex gap-2">
          {dailyTrainingPlan === null ? (
            <>
              <Button className="flex-1" onClick={() => setTimeSheetOpen(true)}>
                Set training time
              </Button>
              <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
            </>
          ) : (
            <>
              <Button className="flex-1" onClick={handleStart}>
                Start session
              </Button>
              <Button variant="outline" onClick={() => setTimeSheetOpen(true)}>
                {dailyTrainingPlan.status === "scheduled" ? "Change time" : "Set a time"}
              </Button>
            </>
          )}
        </div>

        {dailyTrainingPlan !== null ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="mt-3 w-full text-center text-action text-accent-fg hover:underline"
          >
            Preview workout
          </button>
        ) : null}
      </SurfaceShell>
    );
  }

  return (
    <>
      {content}
      <WorkoutDetailsSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        workout={catalogWorkoutToday ?? null}
        fallbackName={workoutDisplayName}
        fallbackFocus={workoutFocus}
      />
      <TrainingTimeSheet plan={dailyTrainingPlan} open={timeSheetOpen} onOpenChange={setTimeSheetOpen} />
    </>
  );
}
