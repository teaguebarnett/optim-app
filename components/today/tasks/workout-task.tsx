"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, BedDouble } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { WorkoutDetailsSheet } from "@/components/workout/workout-details-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { PUSH_WORKOUT, resolveWorkoutAvailabilityForDay } from "@/lib/mock-data";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import { localDateDayOfWeek } from "@/lib/shared/local-date";
import type { DailyTaskState } from "@/lib/types";

export function WorkoutTask({
  state,
  emphasisOverride,
  scheduleLabel,
  fillWidth,
  expanded,
  onToggleExpand,
}: {
  state: DailyTaskState;
  emphasisOverride?: "primary" | "secondary";
  scheduleLabel?: string;
  fillWidth?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const { state: appState, dispatch, activeContext } = usePrototypeState();
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [devPreviewOpen, setDevPreviewOpen] = useState(false);
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  // Phase 4.1 corrective, Phase 4.4B-1.1 refinement — "locked" for the
  // workout task means "today's real schedule prescribes a session with no
  // available catalog detail," resolved through the one shared
  // resolveWorkoutAvailabilityForDay (see lib/mock-data.ts) so this can
  // never disagree with lib/calculations.ts's deriveTaskStates (the
  // function that actually decided this task's state is "locked") or with
  // Training's identical resolution. This is strictly a data-availability
  // fact — reaching this branch has nothing to do with whether a training
  // time has been selected. The scheduled name comes from that same real
  // source, never Push Workout's name — the client is never told a
  // different session is Push Workout just because Push is the only
  // loggable one. The icon stays the task's own (Dumbbell, dimmed by
  // TaskShell's locked treatment) rather than a padlock, since nothing here
  // is actually gated behind an unlock action.
  if (state === "locked") {
    const availability = resolveWorkoutAvailabilityForDay(
      localDateDayOfWeek(appState.dateIso),
      false,
      appState.assignedProgram,
      deriveProgramWeek(appState.programEnrollment, appState.dateIso)
    );

    // TODO: remove temporary workout QA bridge after workout architecture
    // redesign. Dev-only manual-QA escape hatch, never shown in production
    // (see the NODE_ENV check below). Phase 4.4B-2 correction: this used to
    // dispatch START_WORKOUT and immediately start a real session just to
    // make the locked Friday tile testable — that was never real product
    // behavior (starting must only ever happen from an explicit "Begin
    // workout"). It's now a genuinely read-only preview instead: it opens
    // the exact same WorkoutDetailsSheet "Begin workout" already uses for
    // its own real preview, passing the real PUSH_WORKOUT data explicitly
    // (since this day's own catalog is honestly empty) — no dispatch, no
    // session, no mutation of any kind, purely for looking at the real
    // guided-flow preview/detail rendering.
    const isDevBridgeAvailable = process.env.NODE_ENV !== "production";

    return (
      <div>
        <TaskShell
          title={availability.displayName}
          icon={<Dumbbell size={17} />}
          state={state}
          lockedHint={`Workout details unavailable — ${availability.displayName} is scheduled today, but full session detail isn't available yet. Check with ${coachName} if you have questions.`}
          fillWidth={fillWidth}
        />
        {isDevBridgeAvailable ? (
          <>
            <Button variant="outline" className="mt-2 w-full" onClick={() => setDevPreviewOpen(true)}>
              Preview workout
            </Button>
            <WorkoutDetailsSheet open={devPreviewOpen} onClose={() => setDevPreviewOpen(false)} workout={PUSH_WORKOUT} />
          </>
        ) : null}
      </div>
    );
  }

  if (state === "completed" || state === "skipped") {
    return (
      <TaskShell
        title={appState.workoutSession.resolvedWorkout?.name ?? "Workout"}
        icon={<Dumbbell size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
      />
    );
  }

  if (state === "partially-completed") {
    const summary = appState.workoutSession.summary;
    const endedEarly = appState.workoutSession.status === "ended-early";
    return (
      <TaskShell
        title={appState.workoutSession.resolvedWorkout?.name ?? "Workout"}
        icon={<Dumbbell size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        <p className="text-body text-off-white">
          {endedEarly ? "Ended early — completed sets and RPE are saved." : "Submitted with skipped work."}
        </p>
        {summary ? <p className="mt-1 text-meta text-neutral">{summary.detail}</p> : null}
      </TaskShell>
    );
  }

  if (state === "awaiting-review") {
    const summary = appState.workoutSession.summary;
    const endedEarly = appState.workoutSession.status === "ended-early";
    return (
      <TaskShell
        title={appState.workoutSession.resolvedWorkout?.name ?? "Workout"}
        icon={<Dumbbell size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        {endedEarly ? <p className="text-body text-off-white">Ended early — completed sets and RPE are saved.</p> : null}
        {summary ? (
          <div>
            {!endedEarly ? <p className="text-body text-off-white">{summary.headline}</p> : null}
            <p className="mt-1 text-meta text-neutral">{summary.detail}</p>
          </div>
        ) : null}
        <p className="mt-3 text-meta text-warning">
          I&apos;ve organized this for {coachName}&apos;s review. {coachName} will make any programming decisions.
        </p>
      </TaskShell>
    );
  }

  const isInProgress = state === "in-progress";

  // Not started yet — this is the one state where a real assigned program
  // (see lib/coach/training.ts) genuinely has content to show, exactly like
  // components/training/today-session-card.tsx's identical "not started"
  // branch. Once a session actually exists (in-progress above), the session
  // has already snapshotted its own real resolvedWorkout (see
  // lib/state.ts's START_WORKOUT) — read that instead of re-resolving
  // today's live availability, so a mid-session program edit can never
  // change what's shown for an already-running session.
  const todaysAvailability = resolveWorkoutAvailabilityForDay(
    localDateDayOfWeek(appState.dateIso),
    false,
    appState.assignedProgram,
    deriveProgramWeek(appState.programEnrollment, appState.dateIso)
  );
  const todaysWorkout = isInProgress ? appState.workoutSession.resolvedWorkout : todaysAvailability.workout;

  function handleBeginWorkout() {
    if (!isInProgress) {
      dispatch({ type: "START_WORKOUT" });
    }
    router.push("/training/workout");
  }

  // A day with real schedule content but no workout to log is an honest
  // rest day (the "locked"/unavailable-content case is handled entirely by
  // the branch above) — never a silent excuse to show a fabricated PUSH_WORKOUT
  // session under today's name. Mirrors
  // components/training/today-session-card.tsx's own rest-day treatment.
  if (!todaysWorkout) {
    return (
      <TaskShell
        title="Rest day"
        icon={<BedDouble size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        <p className="text-body text-off-white">Today is a scheduled rest day.</p>
      </TaskShell>
    );
  }

  return (
    <>
      <TaskShell
        title={todaysWorkout.name}
        icon={<Dumbbell size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-neutral">
          <span>{todaysWorkout.estimatedDurationMin} min</span>
          <span aria-hidden="true">·</span>
          <span>{todaysWorkout.exercises.length} exercises</span>
          <span aria-hidden="true">·</span>
          <span>{todaysWorkout.focus}</span>
        </div>

        {!isInProgress && (
          <div className="mt-3 rounded-[var(--radius-sm)] bg-off-white/[0.04] p-3">
            <p className="text-label text-neutral">Note from {coachName}</p>
            <p className="mt-1 text-body text-off-white">{todaysWorkout.coachNote}</p>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={handleBeginWorkout}>
            {isInProgress ? "Resume workout" : "Begin workout"}
          </Button>
          <Button variant="outline" onClick={() => setDetailsOpen(true)}>
            View details
          </Button>
        </div>

        <button
          onClick={() => router.push("/training")}
          className="mt-3 w-full text-center text-action text-accent-strong hover:underline"
        >
          See plan
        </button>
      </TaskShell>
      <WorkoutDetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} workout={todaysWorkout} />
    </>
  );
}
