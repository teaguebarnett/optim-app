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
import { migrateStoredState } from "@/lib/tenancy/migrate";
import { getActiveAppContext } from "@/lib/tenancy/context";
import type { ActiveAppContext } from "@/lib/tenancy/types";
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
  /** Resolved workspace/coach/assistant/client identity for the active
   * session — components should read branding, coach, and assistant names
   * from here instead of importing hardcoded identity values. */
  activeContext: ActiveAppContext;
}

const PrototypeStateContext = createContext<PrototypeStateValue | null>(null);

export function PrototypeStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const storedRaw = loadState<unknown>();
      // Upgrades Phase 1 (version 1, no workspace/client attribution) state
      // to the current shape — existing users never need to clear storage.
      const migrated = migrateStoredState(storedRaw);
      const today = new Date().toISOString().slice(0, 10);
      if (migrated && migrated.dateIso === today) {
        dispatch({ type: "HYDRATE", payload: migrated });
      } else if (storedRaw) {
        // Either from a previous day, or an unrecognized/corrupt shape —
        // start fresh rather than showing stale or garbage data as today's.
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
  // The demo always resolves to the same session (see lib/tenancy/seed.ts) —
  // computed once rather than per-render, since it never changes at runtime
  // in this phase (no workspace switcher yet).
  const activeContext = useMemo(() => getActiveAppContext(), []);

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
    activeContext,
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
