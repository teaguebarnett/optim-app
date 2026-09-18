"use client";

import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { PainReport } from "@/lib/types";
import type { PainSafetyActivity } from "@/components/workout/live/pain-review-panel";

const SYMPTOM_QUALITY_LABELS: Record<string, string> = {
  "sharp-pinching": "sharp or pinching pain",
  aching: "aching pain",
  burning: "burning pain",
  "numbness-tingling": "numbness or tingling",
  "instability-weakness": "instability or weakness",
  "normal-fatigue": "normal muscular fatigue",
  other: "discomfort",
};

/**
 * Phase 4.4B-2.2 — the exercise-specific safety gate shown before beginning
 * any exercise OTHER than the one an active, unresolved pain report was made
 * on. "Continue with unaffected exercises" on the original exercise never
 * means "every remaining exercise is unaffected" — OPTIM has no way to know
 * whether THIS exercise involves or aggravates the same area, so each
 * subsequent exercise needs its own explicit, once-per-exercise
 * confirmation. Rendered whenever session.phase === "exercise-pain-check"
 * (canonical, reducer-owned — see lib/state.ts's ENTER_EXERCISE_INTRO), so
 * it survives refresh, leaving the route, and resuming, and reducer-level
 * guards (currentExerciseRequiresPainCheck) independently prevent
 * BEGIN_EXERCISE/BEGIN_SET_LOGGING/LOG_SET/etc. from bypassing it even if
 * something dispatches them directly.
 *
 * Never declares the exercise safe, never diagnoses, never substitutes for
 * the client's own judgment — it only asks for a deliberate decision instead
 * of silent, blind progression.
 */
export function ExercisePainCheckPanel({
  exercise,
  report,
}: {
  exercise: PainSafetyActivity;
  report: PainReport | undefined;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  if (!report) return null;

  const qualityLabel = SYMPTOM_QUALITY_LABELS[report.symptomQuality ?? "other"] ?? "discomfort";

  function handleUnaffected() {
    dispatch({ type: "CONFIRM_EXERCISE_UNAFFECTED", exerciseId: exercise.id });
  }

  function handleSkip() {
    dispatch({
      type: "SKIP_EXERCISE",
      exerciseId: exercise.id,
      reason: "pain-or-discomfort",
      note: "Skipped while a pain report from earlier this session was still active.",
    });
  }

  function handleEndWorkout() {
    dispatch({ type: "SKIP_WORKOUT", reason: "pain-or-discomfort" });
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] border border-warning/30 bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-brass-strong" aria-hidden="true" />
        <p className="text-label text-brass-strong">OPTIM guidance</p>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <AlertTriangle size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-heading text-off-white">Before you begin {exercise.name}</p>
          <p className="mt-1 text-body text-off-white">
            Earlier this session you reported {report.ratingZeroToTen}/10 {qualityLabel} in your {report.location}.
            OPTIM can&apos;t tell whether {exercise.name} will involve or aggravate that area — only continue if
            you&apos;re confident it doesn&apos;t.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Button className="w-full" size="lg" onClick={handleUnaffected}>
          This exercise feels unaffected
        </Button>

        <Button variant="outline" className="w-full" onClick={handleSkip}>
          Skip this exercise
        </Button>

        <Link
          href="/chat"
          className="flex w-full items-center justify-center py-1 text-action text-accent-fg hover:underline"
        >
          Message {coachName}
        </Link>

        <Button variant="ghost" className="w-full" onClick={handleEndWorkout}>
          End workout
        </Button>
      </div>
    </div>
  );
}
