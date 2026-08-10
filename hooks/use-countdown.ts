"use client";

import { useEffect, useMemo, useState } from "react";

export interface CountdownResult {
  remainingMs: number;
  isDone: boolean;
  formatted: string;
  /** The hook's internal (possibly accelerated) clock, for callers that need
   * to compare against other timestamps using the same virtual clock. */
  nowMs: number | null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Mock-accelerated countdown to a target timestamp. Real elapsed time is
 * multiplied by `speedMultiplier` so a demo "workout window" can be tested
 * in seconds rather than hours, per the prototype's mock-timing allowance.
 */
export function useCountdown(targetMs: number | null, speedMultiplier = 1): CountdownResult {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (targetMs === null) return;
    const startReal = Date.now();
    const startVirtual = Date.now();

    const tick = () => {
      const elapsedReal = Date.now() - startReal;
      setNow(startVirtual + elapsedReal * speedMultiplier);
    };

    // Fire once immediately (deferred a tick, per react-hooks/set-state-in-effect)
    // so the first paint doesn't wait a full interval before showing a value.
    const immediate = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);

    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [targetMs, speedMultiplier]);

  return useMemo(() => {
    if (targetMs === null || now === null) {
      return { remainingMs: 0, isDone: false, formatted: "00:00", nowMs: now };
    }
    const remainingMs = Math.max(0, targetMs - now);
    return {
      remainingMs,
      isDone: remainingMs <= 0,
      formatted: formatDuration(remainingMs),
      nowMs: now,
    };
  }, [targetMs, now]);
}
