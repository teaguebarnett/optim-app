"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { loadThemePreference, saveThemePreference, type ThemeAccountKind, type ThemeMode } from "@/lib/shared/theme-preference";
import { AppearanceSelector } from "@/components/app-shell/appearance-selector";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Applies `data-theme` to <html> and exposes `useTheme()` for Settings'
 * theme switcher. Never touches `prefers-color-scheme`. Takes the already-
 * resolved starting mode as a prop (see RequireThemeChoice below, the only
 * caller) rather than loading it itself, so mounting this never needs its
 * own "is it resolved yet" render pass.
 */
export function ThemeProvider({
  accountKind,
  accountId,
  initialMode,
  children,
}: {
  accountKind: ThemeAccountKind;
  accountId: string;
  initialMode: ThemeMode;
  children: ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      saveThemePreference(accountKind, accountId, next);
      setModeState(next);
    },
    [accountKind, accountId]
  );

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/**
 * The one place a genuinely first-time account (no saved preference at
 * all) is stopped and shown the two-choice appearance selector before
 * anything else renders — never a silent default. Once chosen, renders
 * `children` through ThemeProvider for the rest of this account's session.
 * Mounted around the coach shell, the client app shell, and the invite/
 * onboarding entry points (see each for which account id it resolves) —
 * each is its own independent first-run moment, matching "the coach's
 * selection must not alter the client's."
 *
 * Renders nothing (not a flash of the wrong theme, not default light
 * content) until the account's stored preference has been checked — the
 * same brief blank-then-render pattern every other hydration gate in this
 * app already uses (see hooks/use-prototype-state.tsx's isHydrated). The
 * resolving setState is deferred into a microtask rather than called
 * directly in the effect body, matching that same file's own convention.
 */
export function RequireThemeChoice({
  accountKind,
  accountId,
  children,
}: {
  accountKind: ThemeAccountKind;
  accountId: string;
  children: ReactNode;
}) {
  const [resolved, setResolved] = useState<ThemeMode | "unset" | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setResolved(loadThemePreference(accountKind, accountId) ?? "unset");
    }, 0);
    return () => clearTimeout(timeout);
  }, [accountKind, accountId]);

  if (resolved === null) return null;

  if (resolved === "unset") {
    return (
      <AppearanceSelector
        phoneOnly={accountKind === "client"}
        onChoose={(mode) => {
          saveThemePreference(accountKind, accountId, mode);
          setResolved(mode);
        }}
      />
    );
  }

  return (
    <ThemeProvider accountKind={accountKind} accountId={accountId} initialMode={resolved}>
      {children}
    </ThemeProvider>
  );
}
