"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadState, saveState } from "@/lib/storage";
import {
  createInitialPlatformState,
  migratePlatformState,
  platformReducer,
  PLATFORM_STORAGE_KEY,
  type PlatformAction,
  type PlatformState,
} from "@/lib/coach/platform-store";

interface PlatformStateValue {
  platform: PlatformState;
  dispatch: (action: PlatformAction) => void;
  isPlatformHydrated: boolean;
}

const PlatformStateContext = createContext<PlatformStateValue | null>(null);

/**
 * Mirrors hooks/use-prototype-state.tsx's own hydrate-then-persist pattern,
 * against the separate platform store (see lib/coach/platform-store.ts's
 * module doc for why this is a distinct store from AppState). Mounted
 * alongside PrototypeStateProvider in app/layout.tsx so every route —
 * client or coach — can read it.
 */
export function PlatformStateProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<PlatformState>(createInitialPlatformState);
  const [isPlatformHydrated, setIsPlatformHydrated] = useState(false);

  useEffect(() => {
    // Deferred a tick (matching hooks/use-prototype-state.tsx's own
    // hydration effect) rather than calling setState synchronously in the
    // effect body.
    const timeout = setTimeout(() => {
      const stored = loadState<unknown>(PLATFORM_STORAGE_KEY);
      const migrated = migratePlatformState(stored);
      if (migrated) setPlatform(migrated);
      setIsPlatformHydrated(true);
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!isPlatformHydrated) return;
    saveState(platform, PLATFORM_STORAGE_KEY);
  }, [platform, isPlatformHydrated]);

  // Phase 5.6A — a coach can have this exact client's page open in one tab
  // while the client completes onboarding (or the coach approves a plan) in
  // another. The browser's own `storage` event fires in every OTHER tab the
  // instant localStorage changes (never the tab that wrote it), so re-
  // reading here is the one honest way an already-open tab picks up that
  // write without the coach needing to guess a manual refresh is required.
  // A `visibilitychange` re-read is a defensive backstop for the rarer case
  // a `storage` event is missed (e.g. the tab was suspended) — coming back
  // to a stale tab re-syncs it immediately rather than waiting on another
  // write to happen anywhere.
  useEffect(() => {
    if (!isPlatformHydrated) return;
    function resync() {
      const stored = loadState<unknown>(PLATFORM_STORAGE_KEY);
      const migrated = migratePlatformState(stored);
      if (migrated) setPlatform(migrated);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === PLATFORM_STORAGE_KEY) resync();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") resync();
    }
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", resync);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", resync);
    };
  }, [isPlatformHydrated]);

  function dispatch(action: PlatformAction) {
    setPlatform((prev) => platformReducer(prev, action));
  }

  return (
    <PlatformStateContext.Provider value={{ platform, dispatch, isPlatformHydrated }}>
      {children}
    </PlatformStateContext.Provider>
  );
}

export function usePlatformState(): PlatformStateValue {
  const ctx = useContext(PlatformStateContext);
  if (!ctx) {
    throw new Error("usePlatformState must be used within a PlatformStateProvider");
  }
  return ctx;
}
