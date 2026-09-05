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
