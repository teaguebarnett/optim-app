"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ActiveWorkoutHeader } from "@/components/workout/active-workout-header";
import { ExerciseCard } from "@/components/workout/exercise-card";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { PainReportSheet } from "@/components/workout/pain-report-sheet";
import { TechniqueQuestionSheet } from "@/components/workout/technique-question-sheet";
import { WorkoutDetailsSheet } from "@/components/workout/workout-details-sheet";
import { CompleteWorkoutSheet } from "@/components/workout/complete-workout-sheet";
import { WorkoutCompleteScreen } from "@/components/workout/workout-complete-screen";
import { Sheet } from "@/components/ui/sheet";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { PUSH_WORKOUT } from "@/lib/mock-data";
import { buildWorkoutSummary } from "@/lib/workout-analysis";
import type { RpeValue, SkipReason } from "@/lib/types";

type SkipTarget =
  | { kind: "set"; setNumber: number; isWarmup: boolean }
  | { kind: "exercise" }
  | { kind: "workout" };

export default function ActiveWorkoutPage() {
  const { state, dispatch, isHydrated, activeContext } = usePrototypeState();
  const router = useRouter();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  const [overviewOpen, setOverviewOpen] = useState(false);
  const [skipTarget, setSkipTarget] = useState<SkipTarget | null>(null);
  const [painOpen, setPainOpen] = useState(false);
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [equipmentNote, setEquipmentNote] = useState("");
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);

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

  const exercises = PUSH_WORKOUT.exercises;
  const currentIndex = session.currentExerciseIndex;
  const currentExercise = exercises[currentIndex];
  const currentLog = session.exerciseLogs[currentExercise.id];
  const completedCount = exercises.filter((e) => session.exerciseLogs[e.id]?.status === "completed" || session.exerciseLogs[e.id]?.status === "skipped").length;

  function goToIndex(index: number) {
    if (index < 0 || index >= exercises.length) return;
    dispatch({ type: "SET_CURRENT_EXERCISE_INDEX", index });
  }

  function handleLogSet(setNumber: number, isWarmup: boolean, weightLb: number, reps: number, rpe: RpeValue, note?: string) {
    dispatch({
      type: "LOG_SET",
      exerciseId: currentExercise.id,
      setNumber,
      isWarmup,
      weightLb,
      reps,
      rpe,
      note,
    });
  }

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    if (!skipTarget) return;
    if (skipTarget.kind === "set") {
      dispatch({
        type: "SKIP_SET",
        exerciseId: currentExercise.id,
        setNumber: skipTarget.setNumber,
        isWarmup: skipTarget.isWarmup,
        reason,
        note,
      });
    } else if (skipTarget.kind === "exercise") {
      dispatch({ type: "SKIP_EXERCISE", exerciseId: currentExercise.id, reason, note });
    } else {
      dispatch({ type: "SKIP_WORKOUT", reason, note });
    }
    const wasPain = reason === "pain-or-discomfort";
    setSkipTarget(null);
    if (wasPain) {
      setPainOpen(true);
    }
  }

  function handlePainSubmit(report: {
    location: string;
    ratingZeroToTen: number;
    onset: string;
    causedByMovement: string;
    continuedAfterSet: boolean;
    affectsOutsideGym: boolean;
    note?: string;
  }) {
    dispatch({ type: "REPORT_PAIN", exerciseId: currentExercise.id, ...report });
  }

  function handleCompleteExercise() {
    dispatch({ type: "COMPLETE_EXERCISE", exerciseId: currentExercise.id });
    if (currentIndex < exercises.length - 1) {
      goToIndex(currentIndex + 1);
    }
  }

  const preview = buildWorkoutSummary(session, session.startedAtIso ?? new Date().toISOString(), new Date().toISOString());

  function handleConfirmCompleteWorkout() {
    const completedAtIso = new Date().toISOString();
    const summary = buildWorkoutSummary(session, session.startedAtIso ?? completedAtIso, completedAtIso);
    dispatch({ type: "COMPLETE_WORKOUT", summary });
    setCompleteSheetOpen(false);
  }

  return (
    <div className="pb-32">
      <ActiveWorkoutHeader
        startedAtIso={session.startedAtIso}
        currentExerciseIndex={currentIndex}
        totalExercises={exercises.length}
        completedCount={completedCount}
        onOpenOverview={() => setOverviewOpen(true)}
      />

      <div className="px-4 py-4">
        {/* Phase 3.1.1 §4 — keying by exercise id fully remounts the card
            (including its own "extra set" counter, not just each SetRow's
            RPE/weight/reps) whenever the client advances, so nothing from
            the previous exercise can carry forward as a stale selection. */}
        <ExerciseCard
          key={currentExercise.id}
          exercise={currentExercise}
          log={currentLog}
          onLogSet={handleLogSet}
          onSkipSetRequested={(setNumber, isWarmup) => setSkipTarget({ kind: "set", setNumber, isWarmup })}
          onCompleteExercise={handleCompleteExercise}
          onSkipExerciseRequested={() => setSkipTarget({ kind: "exercise" })}
          onReportPain={() => setPainOpen(true)}
          onReportEquipment={() => setEquipmentOpen(true)}
          onAskTechnique={() => setTechniqueOpen(true)}
        />

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => goToIndex(currentIndex - 1)} disabled={currentIndex === 0}>
            <ChevronLeft size={16} />
            Previous
          </Button>
          {currentIndex === exercises.length - 1 ? (
            <Button onClick={() => setCompleteSheetOpen(true)}>Complete workout</Button>
          ) : (
            <Button variant="outline" onClick={() => goToIndex(currentIndex + 1)}>
              Next
              <ChevronRight size={16} />
            </Button>
          )}
        </div>

        <button
          onClick={() => setSkipTarget({ kind: "workout" })}
          className="mt-4 w-full text-center text-xs font-medium text-neutral hover:text-off-white"
        >
          Skip workout
        </button>
      </div>

      <WorkoutDetailsSheet open={overviewOpen} onClose={() => setOverviewOpen(false)} />

      <SkipReasonSheet
        open={!!skipTarget}
        onClose={() => setSkipTarget(null)}
        title={
          skipTarget?.kind === "set"
            ? "Skip this set"
            : skipTarget?.kind === "exercise"
              ? "Skip this exercise"
              : preview.workingSetsCompleted > 0
                ? "End today's workout"
                : "Skip today's workout"
        }
        onConfirm={handleSkipConfirm}
      />

      <PainReportSheet
        open={painOpen}
        onClose={() => setPainOpen(false)}
        defaultMovement={currentExercise.name}
        coachName={coachName}
        onSubmit={handlePainSubmit}
      />

      <TechniqueQuestionSheet open={techniqueOpen} onClose={() => setTechniqueOpen(false)} />

      <Sheet
        open={equipmentOpen}
        onClose={() => setEquipmentOpen(false)}
        title="Equipment unavailable"
        description={`This exercise will be marked skipped and flagged for ${coachName}.`}
      >
        <div className="space-y-4">
          <TextArea
            id="equipment-note"
            label="Optional note"
            value={equipmentNote}
            onChange={(e) => setEquipmentNote(e.target.value)}
            placeholder="e.g. Both cable stations were in use the whole session."
          />
          <Button
            className="w-full"
            onClick={() => {
              dispatch({
                type: "SKIP_EXERCISE",
                exerciseId: currentExercise.id,
                reason: "equipment-unavailable",
                note: equipmentNote.trim() || undefined,
              });
              setEquipmentNote("");
              setEquipmentOpen(false);
            }}
          >
            Confirm
          </Button>
        </div>
      </Sheet>

      <CompleteWorkoutSheet
        open={completeSheetOpen}
        onClose={() => setCompleteSheetOpen(false)}
        onConfirm={handleConfirmCompleteWorkout}
        preview={preview}
      />
    </div>
  );
}
