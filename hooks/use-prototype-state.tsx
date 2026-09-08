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
import { usePathname } from "next/navigation";
import {
  computeDailyCompletionPercent,
  computeNutritionTotals,
  computeRemaining,
  deriveTaskStates,
  getNextActionTaskId,
  nutritionStatusMessage,
} from "@/lib/calculations";
import { createInitialState, reducer, type Action, type AppState } from "@/lib/state";
import {
  clearClientAppState,
  createClientAppState,
  loadClientAppState,
  saveClientAppState,
} from "@/lib/tenancy/client-state-store";
import { getDemoClientSession, resolveActiveContext } from "@/lib/tenancy/context";
import { getClientLifecycle, resolveCoachCreatedClientContext, shouldAutosaveClientAppState } from "@/lib/coach/repository";
import { resolveDefaultDevPerspective } from "@/lib/coach/routing";
import {
  getDemoCoachSession,
  hasStoredDevPerspective,
  loadActiveClientId,
  loadActiveCoachUserId,
  loadDevPerspective,
  saveActiveClientId,
  saveActiveCoachUserId,
  saveDevPerspective,
  type DevPerspective,
} from "@/lib/tenancy/session";
import { CLIENT_PROFILE_DEMO, TEAGUE_USER, WORKSPACE_OPTIM_ID } from "@/lib/tenancy/seed";
import { usePlatformState } from "@/hooks/use-platform-state";
import { buildDailyPlan } from "@/lib/planning/planner";
import { resolveScopedTrainingPlan } from "@/lib/planning/training-plan";
import { resolveClientLocalDateIso } from "@/lib/shared/local-date";
import { resolveRollover } from "@/lib/history/rollover";
import type { PlatformState } from "@/lib/coach/platform-store";
import type { ActiveAppContext, ClientProfileId, WorkspaceId } from "@/lib/tenancy/types";
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
   * from here instead of importing hardcoded identity values. Reflects
   * `perspective`/`activeClientId` below — see lib/tenancy/session.ts's
   * module doc. */
  activeContext: ActiveAppContext;
  /** Whether the app is currently acting as a coach or a client —
   * production authentication isn't connected yet, so this is the local,
   * development-only stand-in (see lib/tenancy/session.ts). */
  perspective: DevPerspective;
  setPerspective: (perspective: DevPerspective) => void;
  /** Which client the "client" perspective currently acts as — the seeded
   * demo client by default, or any client once activated (see
   * lib/tenancy/session.ts). Irrelevant while perspective === "coach". */
  activeClientId: ClientProfileId;
  /** Switches which client "client" perspective acts as AND immediately
   * loads that client's own real AppState (creating one if this is their
   * first time) — the one entry point for "open as this client," used by
   * /invite/[token], /setup-status/[clientId], and the /dev console. Also
   * flips perspective to "client" so the switch always actually takes the
   * caller into that client's experience. */
  setActiveClientId: (clientId: ClientProfileId) => void;
  /** Which coach the "coach" perspective currently acts as — Teague by
   * default. Exists purely so /dev's multi-coach QA entries can genuinely
   * inhabit a second coach's own workspace view (see lib/tenancy/
   * session.ts's ACTIVE_COACH_USER_STORAGE_KEY doc). Irrelevant while
   * perspective === "client". */
  activeCoachUserId: string;
  setActiveCoachUserId: (userId: string) => void;
  /** Today's training-time decision, scoped to the active workspace/client/
   * local date — null means no decision has been made yet for today. */
  dailyTrainingPlan: DailyTrainingPlan | null;
  /** The centralized adaptive schedule — see lib/planning/planner.ts. */
  dailyPlan: DailyPlanResult;
}

const PrototypeStateContext = createContext<PrototypeStateValue | null>(null);

/** Loads (migrating/rolling-over as needed) or creates one client's own
 * AppState — the single hydration path both the initial bootstrap and a
 * later client switch use, so "what does this client's state look like
 * right now" is never computed two different ways. `platform` resolves a
 * coach-created client's real assigned coach for the "create fresh"
 * fallback below — this should be rare in practice (a client can only ever
 * reach this session once activated, by which point the coach setup flow
 * has already created their real AppState with the correct coach — see
 * lib/coach/setup.ts), but stays correct rather than merely non-crashing
 * if it's ever hit. */
function hydrateClientState(clientId: ClientProfileId, workspaceId: WorkspaceId, platform: PlatformState): AppState {
  const stored = loadClientAppState(clientId);
  if (stored) {
    const today = resolveClientLocalDateIso(new Date(), stored.programEnrollment.timeZone);
    return resolveRollover(stored, today).nextState;
  }
  // Nothing stored, or what was stored couldn't be recognized/migrated —
  // clearing an already-empty key is harmless, so this is safe either way.
  // Start this client fresh under their own identity rather than showing
  // garbage or another client's data.
  clearClientAppState(clientId);
  const primaryCoachId = platform.clients.find((c) => c.id === clientId)?.primaryCoachId;
  return createClientAppState(clientId, workspaceId, primaryCoachId);
}

export function PrototypeStateProvider({ children }: { children: ReactNode }) {
  const { platform, isPlatformHydrated } = usePlatformState();
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [perspective, setPerspectiveState] = useState<DevPerspective>("client");
  const [activeClientId, setActiveClientIdState] = useState<ClientProfileId>(CLIENT_PROFILE_DEMO.id);
  const [activeCoachUserId, setActiveCoachUserIdState] = useState<string>(TEAGUE_USER.id);
  const initialPathname = usePathname();

  // One combined bootstrap — reads perspective, which client is currently
  // active, and that client's own AppState together, so there is never an
  // intermediate render mixing a stale default with a freshly-loaded
  // pointer (e.g. briefly showing the demo client's data before correcting
  // to whichever client this browser was last acting as). Waits for the
  // platform store's own hydration first: resolving a coach-created
  // client's real assigned coach (see hydrateClientState's `platform` use)
  // needs platform.clients to actually be loaded from storage, not the
  // empty pre-hydration default every render starts with.
  useEffect(() => {
    if (!isPlatformHydrated) return;
    const timeout = setTimeout(() => {
      // Phase 5.5B — a session that has NEVER explicitly chosen a
      // perspective (a fresh browser/Incognito window) infers one from the
      // very first route it opened rather than always defaulting to
      // "client" — see lib/coach/routing.ts's resolveDefaultDevPerspective
      // for why: that old blanket default made /coach permanently
      // unreachable on a first visit (a client identity can never pass
      // isRouteAllowed's coach-area check, so the boundary redirected it
      // straight back to a client destination). The inferred choice is
      // persisted immediately so it behaves exactly like an explicit
      // choice from then on — refreshes, other tabs, and later navigation
      // never re-infer a different answer.
      const loadedPerspective = hasStoredDevPerspective() ? loadDevPerspective() : resolveDefaultDevPerspective(initialPathname ?? "/");
      if (!hasStoredDevPerspective()) saveDevPerspective(loadedPerspective);
      const loadedClientId = loadActiveClientId();
      const nextState = hydrateClientState(loadedClientId, WORKSPACE_OPTIM_ID, platform);
      setPerspectiveState(loadedPerspective);
      setActiveClientIdState(loadedClientId);
      setActiveCoachUserIdState(loadActiveCoachUserId());
      dispatch({ type: "HYDRATE", payload: nextState });
      setIsHydrated(true);
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformHydrated]);

  // Phase 5.6A.3 — a client who isn't lifecycle "active" yet (invited,
  // onboarding, coach_setup, ready_to_activate — see
  // lib/coach/types.ts's ClientLifecycleStatus) has no legitimate autosaved
  // AppState of their own: their real answers/setup are written through
  // their own dedicated coach/platform paths, and this reducer's defaults
  // (see lib/state.ts's createInitialState / buildDefaultProgramEnrollmentFor,
  // which starts programEnrollment "today") are only ever a scaffold for
  // rendering their waiting screen. Persisting that scaffold here — on every
  // render of this component while it merely hydrates, not on any real
  // client action — is exactly what could clobber the coach's own real
  // approval write (assignedProgram + the coach's chosen startDateIso) with
  // a phantom "starts today, nothing assigned" state if this provider's
  // in-memory `state` was captured even a moment before that approval
  // landed in storage. Waiting for isPlatformHydrated too: before the
  // platform store loads, getClientLifecycle can't see any real lifecycle
  // record yet and would default every client to "active" (see its own
  // doc), reopening the exact same race during that brief window.
  useEffect(() => {
    if (!isHydrated || !isPlatformHydrated) return;
    if (!shouldAutosaveClientAppState(getClientLifecycle(platform, state.clientId))) return;
    saveClientAppState(state.clientId, state);
  }, [state, isHydrated, isPlatformHydrated, platform]);

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
  const nutritionRemaining = useMemo(
    () => computeRemaining(nutritionTotals, state.nutritionTargets),
    [nutritionTotals, state.nutritionTargets]
  );
  const nutritionMessage = useMemo(
    () => nutritionStatusMessage(nutritionTotals, state.meals, state.nutritionTargets),
    [nutritionTotals, state.meals, state.nutritionTargets]
  );
  const dailyCompletionPercent = useMemo(() => computeDailyCompletionPercent(state), [state]);

  const setPerspective = useCallback((next: DevPerspective) => {
    saveDevPerspective(next);
    setPerspectiveState(next);
  }, []);

  // The one entry point for "open as this client" — performs its own
  // hydration synchronously (rather than reacting to activeClientId via a
  // separate effect) so a caller like /invite/[token] can switch and
  // navigate in the same action, with the new client's real state already
  // loaded before the next route renders.
  const setActiveClientId = useCallback(
    (clientId: ClientProfileId) => {
      saveActiveClientId(clientId);
      saveDevPerspective("client");
      const nextState = hydrateClientState(clientId, WORKSPACE_OPTIM_ID, platform);
      dispatch({ type: "HYDRATE", payload: nextState });
      setActiveClientIdState(clientId);
      setPerspectiveState("client");
    },
    [platform]
  );

  const setActiveCoachUserId = useCallback((userId: string) => {
    saveActiveCoachUserId(userId);
    saveDevPerspective("coach");
    setActiveCoachUserIdState(userId);
    setPerspectiveState("coach");
  }, []);

  const activeContext = useMemo(() => {
    if (perspective === "coach") return resolveActiveContext(getDemoCoachSession());
    if (activeClientId === CLIENT_PROFILE_DEMO.id) return resolveActiveContext(getDemoClientSession());
    return resolveCoachCreatedClientContext(activeClientId, platform) ?? resolveActiveContext(getDemoClientSession());
    // activeCoachUserId is read indirectly through getDemoCoachSession()
    // (see lib/tenancy/session.ts) — included here purely so switching it
    // triggers this memo to actually recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspective, activeClientId, platform, activeCoachUserId]);

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
    perspective,
    setPerspective,
    activeClientId,
    setActiveClientId,
    activeCoachUserId,
    setActiveCoachUserId,
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
