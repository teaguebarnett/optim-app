"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { WorkoutCompleteScreen } from "@/components/workout/workout-complete-screen";
import { ActiveSessionShell } from "@/components/workout/live/active-session-shell";
import { SessionWarmupPanel } from "@/components/workout/live/session-warmup-panel";
import { ExerciseIntroPanel } from "@/components/workout/live/exercise-intro-panel";
import { ExerciseWarmupPanel } from "@/components/workout/live/exercise-warmup-panel";
import { SetReadyPanel } from "@/components/workout/live/set-ready-panel";
import { SetLoggingPanel } from "@/components/workout/live/set-logging-panel";
import { SetFeedbackPanel } from "@/components/workout/live/set-feedback-panel";
import { ExerciseTransitionPanel } from "@/components/workout/live/exercise-transition-panel";
import { SessionSummaryScreen } from "@/components/workout/live/session-summary-screen";
import { PainReviewPanel } from "@/components/workout/live/pain-review-panel";
import { ExercisePainCheckPanel } from "@/components/workout/live/exercise-pain-check-panel";
import { usePrototypeState } from "@/hooks/use-prototype-state";

// Phase 4.4B-2 — the live workout is now a guided, state-aware experience
// rather than one long linear checklist page. This file is purely an
// orchestrator: it reads canonical session state (status + phase) and
// renders exactly one dominant surface at a time from components/workout/
// live/ — no scheduling/business logic lives here. See lib/state.ts's
// reducer for the actual phase-transition rules and lib/workout/
// session-flow.ts for the pure queue logic behind them.
export default function ActiveWorkoutPage() {
  const router = useRouter();
  const { state, isHydrated, activeContext } = usePrototypeState();

  if (!isHydrated) return <ScreenSkeleton />;

  const session = state.workoutSession;

  if (session.status === "not-started") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-off-white">Ready when you are.</h1>
        <p className="mt-2 max-w-xs text-sm text-neutral">
          Start today&apos;s workout from the Today screen to begin logging.
        </p>
        <Button className="mt-5" onClick={() => router.push("/today")}>
          Back to Today
        </Button>
      </div>
    );
  }

  if (session.status === "completed" || session.status === "skipped" || session.status === "ended-early") {
    return <WorkoutCompleteScreen session={session} />;
  }

  const sessionExercises = session.resolvedWorkout?.exercises ?? [];
  const currentExercise = sessionExercises.find((e) => e.id === session.currentExerciseId);

  const techniqueFlagCount = state.reviewRequests.filter(
    (r) => r.kind === "technique-flag" && (!session.startedAtIso || r.createdAtIso >= session.startedAtIso)
  ).length;

  function renderPhase() {
    // Phase 4.4B-2.1 — the pain safety interruption is checked first,
    // ahead of everything else `phase` might otherwise say, since it's a
    // persisted, reducer-owned override on top of the normal flow (see
    // lib/state.ts's REPORT_PAIN) rather than a step within it. It must
    // never be bypassed by a refresh, a route re-entry, or any other phase
    // branch below.
    if (session.phase === "pain-review" && session.activePainInterruption) {
      const interruption = session.activePainInterruption;
      const interruptedExercise = sessionExercises.find((e) => e.id === interruption.exerciseId);
      const report = session.painReports.find((r) => r.id === interruption.painReportId);
      return interruptedExercise ? (
        <PainReviewPanel exercise={interruptedExercise} interruption={interruption} report={report} />
      ) : null;
    }

    // Phase 4.4B-2.2 — a DIFFERENT exercise from the one an active,
    // unresolved report was made on, gated until the client explicitly
    // confirms it feels unaffected — see lib/state.ts's ENTER_EXERCISE_INTRO.
    if (session.phase === "exercise-pain-check" && session.activePainInterruption) {
      const interruption = session.activePainInterruption;
      const gatedExercise = sessionExercises.find((e) => e.id === session.currentExerciseId);
      const report = session.painReports.find((r) => r.id === interruption.painReportId);
      return gatedExercise ? <ExercisePainCheckPanel exercise={gatedExercise} report={report} /> : null;
    }

    if (session.phase === "session-warmup") {
      return <SessionWarmupPanel />;
    }

    if (session.phase === "session-summary") {
      return <SessionSummaryScreen session={session} techniqueFlagCount={techniqueFlagCount} />;
    }

    if (session.phase === "exercise-transition") {
      const finishedExercise = sessionExercises.find((e) => e.id === session.lastResolvedExerciseId);
      return <ExerciseTransitionPanel finishedExercise={finishedExercise} nextExercise={currentExercise} session={session} />;
    }

    if (!currentExercise) {
      // Defensive fallback — canonical state has no current exercise but
      // the phase implies one should exist (shouldn't happen through the
      // normal reducer transitions). Route to the summary rather than
      // rendering nothing.
      return <SessionSummaryScreen session={session} techniqueFlagCount={techniqueFlagCount} />;
    }

    const log = session.exerciseLogs[currentExercise.id];
    // Phase 4.4B-2.2 — a compact, persistent caution for as long as ANY
    // pain report remains active this session (including on an exercise
    // already confirmed unaffected) — never shown for the report's own
    // originating exercise mid-block, since that's covered by the stricter
    // pain-review surface instead; by the time a normal panel below can
    // render at all, currentExerciseRequiresPainCheck has already been
    // satisfied for whatever exercise this is.
    const painReportActive = Boolean(session.activePainInterruption);

    switch (session.phase) {
      case "exercise-intro":
        return <ExerciseIntroPanel exercise={currentExercise} painReportActive={painReportActive} />;
      case "exercise-warmup":
        return (
          <ExerciseWarmupPanel
            exercise={currentExercise}
            outcome={session.exerciseWarmups[currentExercise.id]}
            painReportActive={painReportActive}
          />
        );
      case "set-ready":
        return session.currentSetNumber !== null ? (
          <SetReadyPanel exercise={currentExercise} setNumber={session.currentSetNumber} painReportActive={painReportActive} />
        ) : null;
      case "set-logging":
        return session.currentSetNumber !== null ? (
          <SetLoggingPanel exercise={currentExercise} setNumber={session.currentSetNumber} painReportActive={painReportActive} />
        ) : null;
      case "set-feedback":
        return log ? (
          <SetFeedbackPanel
            exercise={currentExercise}
            log={log}
            assistantName={activeContext.assistantDisplayName}
            painReportActive={painReportActive}
          />
        ) : null;
      default:
        return null;
    }
  }

  return <ActiveSessionShell session={session}>{renderPhase()}</ActiveSessionShell>;
}
