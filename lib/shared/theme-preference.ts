// Phase 5.3B — per-account appearance-mode persistence.
//
// Every user (a coach account or a client account) explicitly chooses
// "Light — Pearl Ivory" or "Dark — Midnight Navy" once, and that choice is
// saved under a key scoped to THAT account — never a single global
// storage key — so a coach's selection can never alter a client's, and two
// different clients (or two different coaches, e.g. Teague and Alex — see
// lib/tenancy/seed.ts) sharing this browser's localStorage never overwrite
// each other's preference. Mirrors the exact same
// per-account-key-in-localStorage pattern already used by
// lib/tenancy/session.ts, rather than inventing a second storage
// convention. Deliberately never reads `prefers-color-scheme` — appearance
// is always an explicit, persisted choice, never inferred from the OS or
// device.

export type ThemeMode = "light" | "dark";
export type ThemeAccountKind = "coach" | "client";

function storageKey(kind: ThemeAccountKind, accountId: string): string {
  return `peak-coaching:theme:v1:${kind}:${accountId}`;
}

function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__peak_coaching_theme_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/** Null means this account has never chosen — the caller must present the
 * appearance selector rather than silently defaulting to a theme (see
 * components/app-shell/theme-provider.tsx's RequireThemeChoice). */
export function loadThemePreference(kind: ThemeAccountKind, accountId: string): ThemeMode | null {
  if (!isStorageAvailable() || !accountId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(kind, accountId));
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

export function saveThemePreference(kind: ThemeAccountKind, accountId: string, mode: ThemeMode): void {
  if (!isStorageAvailable() || !accountId) return;
  try {
    window.localStorage.setItem(storageKey(kind, accountId), mode);
  } catch {
    // ignore — in-memory state for the rest of this session still works.
  }
}
