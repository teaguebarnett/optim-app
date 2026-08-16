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
import { buildDailyPlan } from "@/lib/planning/planner";
import { resolveScopedTrainingPlan } from "@/lib/planning/training-plan";
import { resolveClientLocalDateIso } from "@/lib/shared/local-date";
import { resolveRollover } from "@/lib/history/rollover";
import type { ActiveAppContext } from "@/lib/tenancy/types";
import type { DailyPlanResult, DailyTrainingPlan } from "@/lib/planning/types";
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
  /** Today's training-time decision, scoped to the active workspace/client/
   * local date — null means no decision has been made yet for today. */
  dailyTrainingPlan: DailyTrainingPlan | null;
  /** The centralized adaptive schedule — see lib/planning/planner.ts. */
  dailyPlan: DailyPlanResult;
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
      if (migrated) {
        // Client-local calendar date in the enrollment's configured IANA
        // timezone (Phase 4.1) — see lib/shared/local-date.ts. A stale day
        // is archived (not silently discarded) before a fresh one begins;
        // see lib/history/rollover.ts.
        const today = resolveClientLocalDateIso(new Date(), migrated.programEnrollment.timeZone);
        const { nextState } = resolveRollover(migrated, today);
        dispatch({ type: "HYDRATE", payload: nextState });
      } else if (storedRaw) {
        // Unrecognized/corrupt shape — start fresh rather than showing
        // garbage data as today's.
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

  // A coarse once-a-minute re-render is enough for "training time passed"
  // language and recommendation windows to stay accurate without
  // reintroducing a countdown — Phase 3 explicitly removed second-by-second
  // ticking. No visible timer is ever rendered from this.
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const resetToday = useCallback(() => dispatch({ type: "RESET_TODAY" }), []);
  const loadPreset = useCallback(
    (preset: "completed-day" | "awaiting-review") => dispatch({ type: "LOAD_PRESET", preset }),
    []
  );

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

  const dailyTrainingPlan = useMemo(
    () => resolveScopedTrainingPlan(state.dailyTrainingPlan, state.workspaceId, state.clientId, state.dateIso),
    [state.dailyTrainingPlan, state.workspaceId, state.clientId, state.dateIso]
  );

  const tasks = useMemo(() => {
    void minuteTick; // a scheduled time crossing "now" must update this too
    return deriveTaskStates(state, dailyTrainingPlan, new Date());
  }, [state, dailyTrainingPlan, minuteTick]);
  const nextActionTaskId = useMemo(() => getNextActionTaskId(tasks), [tasks]);

  const dailyPlan = useMemo(() => {
    void minuteTick; // deliberately re-derive once a minute — see effect above
    return buildDailyPlan({ state, trainingPlan: dailyTrainingPlan, now: new Date(), nutritionTotals });
  }, [state, dailyTrainingPlan, nutritionTotals, minuteTick]);

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
    dailyTrainingPlan,
    dailyPlan,
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
