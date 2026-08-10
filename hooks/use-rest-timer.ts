"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface RestTimerState {
  isActive: boolean;
  isPaused: boolean;
  isMinimized: boolean;
  isFinished: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  start: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  addThirtySeconds: () => void;
  minimize: () => void;
  restore: () => void;
  dismiss: () => void;
}

export function useRestTimer(): RestTimerState {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const tick = useCallback(() => {
    setRemainingSeconds((prev) => {
      if (prev <= 1) {
        clear();
        setIsFinished(true);
        return 0;
      }
      return prev - 1;
    });
  }, [clear]);

  const start = useCallback(
    (seconds: number) => {
      clear();
      setTotalSeconds(seconds);
      setRemainingSeconds(seconds);
      setIsActive(true);
      setIsPaused(false);
      setIsMinimized(false);
      setIsFinished(false);
      intervalRef.current = setInterval(tick, 1000);
    },
    [clear, tick]
  );

  const pause = useCallback(() => {
    clear();
    setIsPaused(true);
  }, [clear]);

  const resume = useCallback(() => {
    if (!isActive || isFinished) return;
    clear();
    setIsPaused(false);
    intervalRef.current = setInterval(tick, 1000);
  }, [clear, tick, isActive, isFinished]);

  const skip = useCallback(() => {
    clear();
    setIsActive(false);
    setIsPaused(false);
    setIsFinished(false);
    setRemainingSeconds(0);
  }, [clear]);

  const addThirtySeconds = useCallback(() => {
    setRemainingSeconds((prev) => prev + 30);
    setTotalSeconds((prev) => prev + 30);
    if (isFinished) {
      setIsFinished(false);
      clear();
      intervalRef.current = setInterval(tick, 1000);
    }
  }, [isFinished, clear, tick]);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const restore = useCallback(() => setIsMinimized(false), []);

  const dismiss = useCallback(() => {
    clear();
    setIsActive(false);
    setIsPaused(false);
    setIsFinished(false);
    setIsMinimized(false);
    setRemainingSeconds(0);
  }, [clear]);

  return {
    isActive,
    isPaused,
    isMinimized,
    isFinished,
    remainingSeconds,
    totalSeconds,
    start,
    pause,
    resume,
    skip,
    addThirtySeconds,
    minimize,
    restore,
    dismiss,
  };
}
