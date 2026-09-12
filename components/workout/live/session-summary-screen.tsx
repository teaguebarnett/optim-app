"use client";

import { useMemo } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { buildWorkoutSummary, sessionReviewHeadline } from "@/lib/workout-analysis";
import { buildSessionGuidanceSignals } from "@/lib/workout/guidance";
import type { WorkoutSession } from "@/lib/types";

/**
 * Phase 4.4B-2 §K — the concise, real-data-only completion summary shown
 * before the final COMPLETE_WORKOUT dispatch. Replaces the old
 * CompleteWorkoutSheet trigger — this IS the session-summary phase's
 * dominant surface, not an extra confirmation dialog on top of it.
 */
export function SessionSummaryScreen({
  session,
  techniqueFlagCount,
}: {
  session: WorkoutSession;
  /** Technique concerns flagged this session — from AppState.reviewRequests,
   * counted by the page (see app/training/workout/page.tsx) since review
   * requests live outside WorkoutSession. */
  techniqueFlagCount: number;
}) {
  const { dispatch, activeContext, dailyPlan } = usePrototypeState();
  const assistantName = activeContext.assistantDisplayName;

  const preview = useMemo(
    () =>
      buildWorkoutSummary(
        session.resolvedSession ?? null,
        session,
        session.startedAtIso ?? new Date().toISOString(),
        new Date().toISOString()
      ),
    [session]
  );
  // Phase 3 — deliberately still reads resolvedWorkout (unchanged), not
  // resolvedSession: this signal set depends on Exercise.previousPerformance
  // (real execution history OPTIM already has), which has no home in the
  // Phase 1/2 universal Prescription grammar by design (prescription vs.
  // execution — see lib/workout/guidance.ts's own module doc). Migrating
  // this specific derivation is out of Phase 3's scope; see the Phase 3
  // completion report's "prescription/execution semantics" section.
  const signals = useMemo(
    () => buildSessionGuidanceSignals(session.resolvedWorkout, session, { techniqueFlagCount }),
    [session, techniqueFlagCount]
  );
  const flaggedSignals = signals.filter((s) => s.forCoachReview);
  const otherSignals = signals.filter((s) => !s.forCoachReview);

  // Phase 4 — workingSetsCompleted alone would be wrong for a real,
  // fully-completed pure continuous session (no "working sets" exist for
  // that family at all) — see lib/state.ts's COMPLETE_WORKOUT guard, which
  // this must never disagree with.
  const hasNoLoggedWork = preview.workingSetsCompleted === 0 && preview.exercisesCompleted === 0;
  const postWorkoutMeal = dailyPlan.items.find((i) => i.id === "post-workout-meal");

  function handleComplete() {
    dispatch({ type: "COMPLETE_WORKOUT", summary: preview });
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-neutral">Session summary</p>
          <p className="text-heading text-off-white">{sessionReviewHeadline(preview)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Exercises completed" value={String(preview.exercisesCompleted)} />
        <Stat label="Working sets" value={String(preview.workingSetsCompleted)} />
        <Stat label="Average RPE" value={preview.averageRpe !== null ? String(preview.averageRpe) : "—"} />
        <Stat label="Duration" value={`${preview.durationMin} min`} />
      </div>

      {flaggedSignals.length > 0 || preview.painReportCount > 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft p-3.5">
          <p className="text-label text-warning">Flagged for coach review</p>
          <ul className="mt-1.5 space-y-1 text-meta text-off-white">
            {flaggedSignals.map((s, i) => (
              <li key={i}>{s.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {otherSignals.length > 0 ? (
        <div className="mt-3 rounded-[var(--radius-md)] bg-off-white/[0.04] p-3.5">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-brass-strong" aria-hidden="true" />
            <p className="text-label text-brass-strong">{assistantName} noticed</p>
          </div>
          <ul className="mt-1.5 space-y-1 text-meta text-neutral">
            {otherSignals.map((s, i) => (
              <li key={i}>{s.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {postWorkoutMeal ? (
        <div className="mt-3 rounded-[var(--radius-md)] bg-off-white/[0.04] p-3.5">
          <p className="text-label text-neutral">Next</p>
          <p className="mt-0.5 text-meta text-off-white">
            {postWorkoutMeal.title}
            {postWorkoutMeal.timeLabel ? ` — ${postWorkoutMeal.timeLabel}` : ""}
          </p>
        </div>
      ) : null}

      {hasNoLoggedWork ? (
        <p className="mt-3 text-meta text-error">
          No working-set data was submitted yet — log or skip at least one set before completing.
        </p>
      ) : null}

      <Button className="mt-4 w-full" size="lg" disabled={hasNoLoggedWork} onClick={handleComplete}>
        Complete workout
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-off-white/[0.04] p-3">
      <p className="text-subheading text-off-white">{value}</p>
      <p className="text-meta text-neutral">{label}</p>
    </div>
  );
}
