"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { resolveSessionWarmupConfigFromSession } from "@/lib/workout/warmup";
import type { SkipReason } from "@/lib/types";

/**
 * Phase 4.4B-2 §D — the once-per-session preparation routine, sourced from
 * the session's own real `warmupOverview` text (never fabricated). Only
 * ever rendered when resolveSessionWarmupConfigFromSession reports
 * "confirmation" — ActiveSessionShell skips straight past this phase for a
 * hypothetical future session with no session-level routine.
 *
 * Phase 6A — reads resolvedSession (always present once a session is
 * started, legacy or universal-origin alike) rather than resolvedWorkout
 * (null for a continuous-only or mixed session) — this fixes a real bug: a
 * universal-origin session with a real warmupOverview would enter this
 * phase and then render nothing at all, with no way to proceed.
 */
export function SessionWarmupPanel() {
  const { state, dispatch } = usePrototypeState();
  const [skipOpen, setSkipOpen] = useState(false);
  const trainingSession = state.workoutSession.resolvedSession;
  if (!trainingSession) return null;
  const config = resolveSessionWarmupConfigFromSession(trainingSession);
  if (config.mode !== "confirmation") return null;

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_SESSION_WARMUP", reason, note });
    setSkipOpen(false);
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Flame size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-neutral">Before you begin</p>
          <p className="text-heading text-off-white">Get ready</p>
        </div>
      </div>

      <p className="mt-4 text-body text-off-white">{config.instruction}</p>

      <div className="mt-5 flex gap-2">
        <Button className="flex-1" onClick={() => dispatch({ type: "CONFIRM_SESSION_WARMUP" })}>
          I&apos;m ready
        </Button>
        <Button variant="outline" onClick={() => setSkipOpen(true)}>
          Skip
        </Button>
      </div>

      <SkipReasonSheet
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        title="Skip warm-up"
        description="A quick reason helps your coach understand today's session."
        onConfirm={handleSkipConfirm}
      />
    </div>
  );
}
