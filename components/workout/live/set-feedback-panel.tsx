"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { buildImmediateSetFeedback } from "@/lib/workout/guidance";
import { recommendRest } from "@/lib/workout/rest-policy";
import { firstUnresolvedWorkingSetNumber, isExerciseResolved } from "@/lib/workout/session-flow";
import { prescribedWorkingSet, workingSetDisplayIndex } from "@/components/workout/live/helpers";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import { cn } from "@/lib/cn";
import type { Exercise, ExerciseLog } from "@/lib/types";

/**
 * Phase 4.4B-2.1 correction — this used to show a ticking "Resting 00:xx"
 * count-up. That was conceptually inaccurate: between finishing a set and
 * opening OPTIM to log it, the client puts the weight down and picks up
 * their phone — a real 15-30+ second handling delay that made any
 * "elapsed rest" reading dishonest from the first second. There is no timer
 * here anymore. Rest guidance is a static, RPE-aware recommendation (see
 * lib/workout/rest-policy.ts) — advisory only, never a countdown or a gate;
 * "Continue" is always available immediately.
 */
export function SetFeedbackPanel({
  exercise,
  log,
  assistantName,
  painReportActive = false,
}: {
  exercise: Exercise;
  log: ExerciseLog;
  assistantName: string;
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();

  const lastSet = [...log.loggedSets].reverse().find((s) => !s.isWarmup);
  if (!lastSet) return null;

  const feedback = buildImmediateSetFeedback(exercise, lastSet);
  const rest =
    lastSet.status === "completed"
      ? recommendRest(exercise.restSeconds, lastSet.rpe, exercise.targetRpe)
      : recommendRest(exercise.restSeconds, null, exercise.targetRpe);
  const resolved = isExerciseResolved(exercise, log);
  const nextSetNumber = resolved ? null : firstUnresolvedWorkingSetNumber(exercise, log);
  const nextPrescribed = nextSetNumber !== null ? prescribedWorkingSet(exercise, nextSetNumber) : undefined;
  const nextDisplayIndex = nextSetNumber !== null ? workingSetDisplayIndex(exercise, nextSetNumber) : -1;

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-brass-strong" aria-hidden="true" />
        <p className="text-label text-brass-strong">{assistantName} guidance</p>
      </div>
      <p className="mt-1.5 text-body text-off-white">{feedback.message}</p>

      <div className="mt-4 rounded-[var(--radius-md)] bg-off-white/[0.04] px-4 py-3">
        <p className="text-label text-neutral">Recommended rest</p>
        <p className="mt-0.5 text-subheading text-off-white">{rest.label}</p>
        <p className="mt-1 text-meta text-neutral">Continue whenever you&apos;re ready — this is guidance, not a timer.</p>
      </div>
      {rest.note ? (
        <p className={cn("mt-2 text-meta", rest.caution ? "text-warning" : "text-neutral")}>{rest.note}</p>
      ) : null}

      <div className="mt-4 border-t border-border pt-4">
        {nextSetNumber !== null ? (
          <>
            <p className="text-label text-neutral">Next</p>
            <p className="mt-0.5 text-subheading text-off-white">
              Set {nextDisplayIndex + 1} of {exercise.workingSets}
              {nextPrescribed?.prescribedWeightLb !== undefined
                ? ` — ${nextPrescribed.prescribedWeightLb} lb × ${nextPrescribed.prescribedReps}`
                : ""}
            </p>
          </>
        ) : (
          <p className="text-subheading text-off-white">That was the last working set for {exercise.name}.</p>
        )}
      </div>

      <Button className="mt-4 w-full" size="lg" onClick={() => dispatch({ type: "CONTINUE_TO_NEXT_SET" })}>
        Continue
      </Button>
    </div>
  );
}
