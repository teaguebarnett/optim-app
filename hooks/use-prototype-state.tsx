"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  computeDailyCompletionPercent,
  computeNutritionTotals,
  computeRemaining,
  deriveTaskStates,
  getNextActionTaskId,
  nutritionStatusMessage,
} from "@/lib/calculations";
import { clearState, loadState, saveState } from "@/lib/storage";
import { createInitialState, reducer, type Action, type AppState } from "@/lib/state";
import type { DailyTask, DailyTaskId } from "@/lib/types";

interface PrototypeStateValue {
  state: AppState;
  dispatch: (action: Action) => void;
  isHydrated: boolean;
  tasks: DailyTask[];
  nextActionTaskId: DailyTaskId | null;
  nutritionTotals: ReturnType<typeof computeNutritionTotals>;
  nutritionRemaining: ReturnType<typeof computeRemaining>;
  nutritionMessage: string;
  dailyCompletionPercent: number;
  resetToday: () => void;
  loadPreset: (preset: "completed-day" | "awaiting-review") => void;
}

const PrototypeStateContext = createContext<PrototypeStateValue | null>(null);

export function PrototypeStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const stored = loadState<AppState>();
      const today = new Date().toISOString().slice(0, 10);
      if (stored && stored.version === 1 && stored.dateIso === today) {
        dispatch({ type: "HYDRATE", payload: stored });
      } else if (stored) {
        // Stored data is from a previous day — start fresh rather than
        // showing yesterday's completed tasks as if they were today's.
        clearState();
      }
      setIsHydrated(true);
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveState(state);
  }, [state, isHydrated]);

  const resetToday = useCallback(() => dispatch({ type: "RESET_TODAY" }), []);
  const loadPreset = useCallback(
    (preset: "completed-day" | "awaiting-review") => dispatch({ type: "LOAD_PRESET", preset }),
    []
  );

  const tasks = useMemo(() => deriveTaskStates(state), [state]);
  const nextActionTaskId = useMemo(() => getNextActionTaskId(tasks), [tasks]);
  const nutritionTotals = useMemo(() => computeNutritionTotals(state.meals), [state.meals]);
  const nutritionRemaining = useMemo(() => computeRemaining(nutritionTotals), [nutritionTotals]);
  const nutritionMessage = useMemo(
    () => nutritionStatusMessage(nutritionTotals, state.meals),
    [nutritionTotals, state.meals]
  );
  const dailyCompletionPercent = useMemo(() => computeDailyCompletionPercent(state), [state]);

  const value: PrototypeStateValue = {
    state,
    dispatch,
    isHydrated,
    tasks,
    nextActionTaskId,
    nutritionTotals,
    nutritionRemaining,
    nutritionMessage,
    dailyCompletionPercent,
    resetToday,
    loadPreset,
  };

  return <PrototypeStateContext.Provider value={value}>{children}</PrototypeStateContext.Provider>;
}

export function usePrototypeState(): PrototypeStateValue {
  const ctx = useContext(PrototypeStateContext);
  if (!ctx) {
    throw new Error("usePrototypeState must be used within a PrototypeStateProvider");
  }
  return ctx;
}
