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
import { ContinuousReadyPanel } from "@/components/workout/live/continuous-ready-panel";
import { ContinuousLoggingPanel } from "@/components/workout/live/continuous-logging-panel";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { findTrainingItemById } from "@/lib/workout/session-flow";
import { trainingItemToLegacyExercise } from "@/lib/training/legacy-adapter";
import type { TrainingItemInstance } from "@/lib/training/types";

/** Shared shape PainReviewPanel/ExercisePainCheckPanel actually need — see
 * pain-review-panel.tsx's PainSafetyActivity doc for why this works
 * identically for a resistance or continuous item. */
function toPainSafetyActivity(item: TrainingItemInstance) {
  return { id: item.id, name: item.name, approvedSubstituteExerciseId: item.substituteItemId };
}

// Phase 4.4B-2 — the live workout is now a guided, state-aware experience
// rather than one long linear checklist page. This file is purely an
// orchestrator: it reads canonical session state (status + phase) and
// renders exactly one dominant surface at a time from components/workout/
// live/ — no scheduling/business logic lives here. See lib/state.ts's
// reducer for the actual phase-transition rules and lib/workout/
// session-flow.ts for the pure queue logic behind them.
//
// Phase 4 — the current TrainingItemInstance's own prescription family
// (looked up once, on the universal Session) is the ONE thing this file
// branches on to decide whether the resistance panels (still rendered from
// the legacy Exercise, unchanged) or the new continuous panels (rendered
// from the universal item directly, since a continuous item has no legacy
// Exercise counterpart at all) apply — see currentTrainingItem below.
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
  // The same current item, looked up on the universal Session this session
  // was actually started against — the one source both families can be
  // rendered from. A resistance item's `.name`/etc. match currentExercise
  // exactly; a continuous item has no legacy counterpart at all, so this is
  // the only lookup that ever finds it.
  const currentTrainingItem = findTrainingItemById(session.resolvedSession, session.currentExerciseId);
  // Phase 6A — a real universal-origin session (resolvedWorkout null: a
  // continuous-only or mixed session has no legacy Workout counterpart at
  // all — see lib/training/legacy-adapter.ts) has nothing in
  // sessionExercises to find. The resistance panels below still need an
  // Exercise-shaped prop, so the current resistance item is converted
  // on the fly, for display only, via the same per-item conversion
  // sessionToLegacyWorkout itself uses — never a second, independently
  // drifting mapping.
  const currentExercise =
    sessionExercises.find((e) => e.id === session.currentExerciseId) ??
    (currentTrainingItem && currentTrainingItem.prescription.family === "resistance" ? (trainingItemToLegacyExercise(currentTrainingItem) ?? undefined) : undefined);

  const techniqueFlagCount = state.reviewRequests.filter(
    (r) => r.kind === "technique-flag" && (!session.startedAtIso || r.createdAtIso >= session.startedAtIso)
  ).length;

  function renderPhase() {
    // Phase 4.4B-2.1 — the pain safety interruption is checked first,
    // ahead of everything else `phase` might otherwise say, since it's a
    // persisted, reducer-owned override on top of the normal flow (see
    // lib/state.ts's REPORT_PAIN) rather than a step within it. It must
    // never be bypassed by a refresh, a route re-entry, or any other phase
    // branch below. Phase 4 — looked up on the universal Session so this
    // works identically whether the interrupted item is resistance or
    // continuous (the same OPTIM safety architecture either way, per spec
    // section 12 — never a family-specific safety path).
    if (session.phase === "pain-review" && session.activePainInterruption) {
      const interruption = session.activePainInterruption;
      const interruptedItem = findTrainingItemById(session.resolvedSession, interruption.exerciseId);
      const report = session.painReports.find((r) => r.id === interruption.painReportId);
      return interruptedItem ? (
        <PainReviewPanel exercise={toPainSafetyActivity(interruptedItem)} interruption={interruption} report={report} />
      ) : null;
    }

    // Phase 4.4B-2.2 — a DIFFERENT exercise from the one an active,
    // unresolved report was made on, gated until the client explicitly
    // confirms it feels unaffected — see lib/state.ts's ENTER_EXERCISE_INTRO.
    if (session.phase === "exercise-pain-check" && session.activePainInterruption) {
      const interruption = session.activePainInterruption;
      const gatedItem = findTrainingItemById(session.resolvedSession, session.currentExerciseId);
      const report = session.painReports.find((r) => r.id === interruption.painReportId);
      return gatedItem ? <ExercisePainCheckPanel exercise={toPainSafetyActivity(gatedItem)} report={report} /> : null;
    }

    if (session.phase === "session-warmup") {
      return <SessionWarmupPanel />;
    }

    if (session.phase === "session-summary") {
      return <SessionSummaryScreen session={session} techniqueFlagCount={techniqueFlagCount} />;
    }

    if (session.phase === "exercise-transition") {
      const finishedItem = findTrainingItemById(session.resolvedSession, session.lastResolvedExerciseId);
      return <ExerciseTransitionPanel finishedItem={finishedItem} nextItem={currentTrainingItem} session={session} />;
    }

    if (!currentTrainingItem) {
      // Defensive fallback — canonical state has no current item but the
      // phase implies one should exist (shouldn't happen through the normal
      // reducer transitions). Route to the summary rather than rendering
      // nothing.
      return <SessionSummaryScreen session={session} techniqueFlagCount={techniqueFlagCount} />;
    }

    // Phase 4.4B-2.2 — a compact, persistent caution for as long as ANY
    // pain report remains active this session (including on an exercise
    // already confirmed unaffected) — never shown for the report's own
    // originating exercise mid-block, since that's covered by the stricter
    // pain-review surface instead; by the time a normal panel below can
    // render at all, currentExerciseRequiresPainCheck has already been
    // satisfied for whatever exercise this is.
    const painReportActive = Boolean(session.activePainInterruption);

    // Phase 4 — continuous work has its own two phases and never touches
    // any of the resistance-only panels below (which all render from the
    // legacy Exercise, something a continuous item was never converted
    // into — see lib/training/legacy-adapter.ts).
    if (currentTrainingItem.prescription.family !== "resistance") {
      switch (session.phase) {
        case "continuous-ready":
          return <ContinuousReadyPanel item={currentTrainingItem} painReportActive={painReportActive} />;
        case "continuous-logging":
          return <ContinuousLoggingPanel item={currentTrainingItem} painReportActive={painReportActive} />;
        default:
          return null;
      }
    }

    if (!currentExercise) return null; // a resistance item always has a legacy counterpart; defensive only.
    const log = session.exerciseLogs[currentExercise.id];

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
        return log && currentTrainingItem ? (
          <SetFeedbackPanel
            exercise={currentExercise}
            trainingItem={currentTrainingItem}
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
