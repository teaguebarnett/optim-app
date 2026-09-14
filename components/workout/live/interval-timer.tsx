"use client";

import { useEffect, useState } from "react";

/**
 * Phase 11A — the smallest deterministic client-side interval timer this
 * feature needs (spec section 7). Purely presentational: it never
 * dispatches anything itself. Remaining time is ALWAYS re-derived from a
 * real timestamp anchor (`phaseStartedAtIso`) and the current wall clock —
 * never a mutable "remaining seconds" counter that could drift or
 * double-decrement. This is what makes it immune to backgrounding/
 * re-render: a tab backgrounded for 30 seconds and then foregrounded
 * simply recomputes the correct elapsed time on its next tick, the same
 * answer as if it had never stopped ticking, rather than silently skipping
 * or repeating a phase. Mirrors components/workout/live/active-session-shell.tsx's
 * own real-time-elapsed pattern exactly (setInterval + Date.now(), one real
 * anchor timestamp).
 *
 * At 0 remaining, this shows "Time's up" but does NOT auto-advance
 * anything — advancing to the next phase is always the client's own
 * explicit tap (see interval-active-panel.tsx), matching
 * lib/workout/rest-policy.ts's established "guidance, not a forced gate"
 * philosophy. This is deliberate, not a missing feature: it's what
 * guarantees "no accidental advancement while backgrounded/re-rendered."
 */
export function IntervalTimer({ phaseStartedAtIso, durationSeconds }: { phaseStartedAtIso: string; durationSeconds: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const immediate = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, []);

  const elapsedSeconds = now ? Math.max(0, (now - new Date(phaseStartedAtIso).getTime()) / 1000) : 0;
  const remainingSeconds = Math.max(0, Math.ceil(durationSeconds - elapsedSeconds));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const done = now !== null && remainingSeconds <= 0;

  return (
    <div className="text-center">
      <p className={`font-mono text-display tabular-nums ${done ? "text-accent-strong" : "text-off-white"}`}>
        {String(minutes).padStart(1, "0")}:{String(seconds).padStart(2, "0")}
      </p>
      {done ? <p className="mt-1 text-meta text-accent-strong">Time&apos;s up — tap to continue</p> : null}
    </div>
  );
}
