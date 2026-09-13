"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { isSevereRating } from "@/lib/workout/pain-policy";
import { cn } from "@/lib/cn";
import type { PainInterruption, PainReport } from "@/lib/types";

/** Phase 4 — generalized from a full legacy Exercise to the minimal identity
 * this panel actually needs, so a continuous TrainingItemInstance (which has
 * no legacy Exercise counterpart at all) can participate in the exact same
 * safety flow as a resistance one — see this panel's own doc and
 * app/(client)/training/workout/page.tsx's lookup, which now sources this
 * from the universal Session for either family identically. */
export interface PainSafetyActivity {
  id: string;
  name: string;
  approvedSubstituteExerciseId?: string;
}

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
 * Phase 4.4B-2.1 — the persisted safety-interruption surface. Pain/injury
 * feedback is an always-escalate category: this replaces the old behavior
 * of quietly returning to the next set after a report was saved. Rendered
 * whenever session.phase === "pain-review" (canonical, reducer-owned state
 * — see lib/state.ts's REPORT_PAIN/CONFIRM_PAIN_RESOLVED/RESUME_AFTER_PAIN
 * — so it survives refresh, leaving the route, and resuming; it is never
 * component-local state that a navigation could silently bypass).
 *
 * OPTIM's immediate caution is visually and semantically distinct from
 * coach communication (§6): the guidance block never claims to have sent
 * anything, never diagnoses, and never independently changes programming —
 * it only offers the deterministic next actions lib/workout/pain-policy.ts
 * allows.
 */
export function PainReviewPanel({
  exercise,
  interruption,
  report,
}: {
  exercise: PainSafetyActivity;
  interruption: PainInterruption;
  report: PainReport | undefined;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [confirmingContinue, setConfirmingContinue] = useState(false);

  if (!report) return null;

  const severe = isSevereRating(report.ratingZeroToTen);
  const heading = interruption.severity === "resume-eligible" ? `Pause ${exercise.name}` : severe ? "Stop this exercise." : `Pause ${exercise.name}`;
  const qualityLabel = SYMPTOM_QUALITY_LABELS[report.symptomQuality ?? "other"] ?? "discomfort";

  const canSubstitute = !!exercise.approvedSubstituteExerciseId;

  function handleSkip() {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: exercise.id, reason: "pain-or-discomfort", note: "Reported during set — see pain report." });
  }

  function handleSubstitute() {
    dispatch({
      type: "SKIP_EXERCISE",
      exerciseId: exercise.id,
      reason: "pain-or-discomfort",
      note: "Replaced with coach-approved substitute after a pain report.",
    });
  }

  function handleEndWorkout() {
    dispatch({ type: "SKIP_WORKOUT", reason: "pain-or-discomfort" });
  }

  function handleContinueUnaffected() {
    dispatch({ type: "DEFER_EXERCISE", exerciseId: exercise.id });
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] border border-error/30 bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-brass-strong" aria-hidden="true" />
        <p className="text-label text-brass-strong">OPTIM guidance</p>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-error-soft text-error">
          <AlertTriangle size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-heading text-off-white">{heading}</p>
          <p className="mt-1 text-body text-off-white">
            You reported {report.ratingZeroToTen}/10 {qualityLabel} in your {report.location}.{" "}
            {interruption.severity === "block-exercise"
              ? "Do not begin another set of this exercise right now."
              : "Take a moment before deciding how to continue."}
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-[var(--radius-sm)] bg-off-white/[0.04] px-3 py-2.5 text-meta text-neutral">
        {report.escalationConfirmed === false
          ? // Phase 7A — only ever shown once Supabase-mode persistence has
            // actually, confirmedly failed (see lib/production/pain-safety.ts) —
            // never claim a coach notification that didn't really happen.
            // The report itself is still saved in this session regardless.
            `Saved on this device. I wasn't able to confirm this reached ${coachName} — please message them directly if this feels urgent.`
          : `Saved and flagged for ${coachName} to review.`}
      </p>

      {interruption.severity === "resume-eligible" ? (
        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={() => dispatch({ type: "CONFIRM_PAIN_RESOLVED" })}
            aria-pressed={interruption.confirmedResolved}
            className={cn(
              "flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left",
              interruption.confirmedResolved ? "border-success bg-success-soft" : "border-border-strong"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                interruption.confirmedResolved ? "border-success bg-success text-on-accent" : "border-border-strong"
              )}
            >
              {interruption.confirmedResolved ? <Check size={14} /> : null}
            </span>
            <span className="text-subheading text-off-white">The discomfort has fully resolved.</span>
          </button>

          <Button
            className="w-full"
            size="lg"
            disabled={!interruption.confirmedResolved}
            onClick={() => dispatch({ type: "RESUME_AFTER_PAIN" })}
          >
            Continue this exercise
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleSkip}>
              Skip this exercise
            </Button>
            <Button variant="ghost" className="flex-1" onClick={handleEndWorkout}>
              End workout
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Button className="w-full" size="lg" onClick={handleSkip}>
            Skip this exercise
          </Button>

          {canSubstitute ? (
            <Button variant="outline" className="w-full" onClick={handleSubstitute}>
              Use coach-approved substitute
            </Button>
          ) : null}

          {!confirmingContinue ? (
            <Button variant="outline" className="w-full" onClick={() => setConfirmingContinue(true)}>
              Continue with unaffected exercises
            </Button>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-border-strong p-3.5">
              <p className="text-body text-off-white">
                {exercise.name} will move to later in the session rather than being skipped outright. Continue with the
                rest of today&apos;s workout now?
              </p>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={handleContinueUnaffected}>
                  Confirm
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingContinue(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Button variant="ghost" className="w-full" onClick={handleEndWorkout}>
            End workout
          </Button>

          <Link
            href="/chat"
            className="mt-1 flex w-full items-center justify-center text-action text-accent-strong hover:underline"
          >
            Message {coachName}
          </Link>
        </div>
      )}
    </div>
  );
}
