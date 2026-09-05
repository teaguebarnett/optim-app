// Safe localStorage access for the prototype. Every call is guarded so a
// missing/blocked localStorage (SSR, private browsing, disabled storage)
// never throws and never breaks the app.
//
// Every independent persisted store (the per-client AppState, and — as of
// Phase 5.0A — the workspace/platform store; see lib/coach/platform-store.ts)
// gets its own key, passed explicitly rather than assumed, so the two can
// never collide or accidentally overwrite each other.

const STORAGE_KEY = "peak-coaching:state:v1";

export function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__peak_coaching_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function loadState<T>(key: string = STORAGE_KEY): T | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveState<T>(state: T, key: string = STORAGE_KEY): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage full or blocked mid-session — fail silently, state still
    // works in-memory for the rest of this session.
  }
}

export function clearState(key: string = STORAGE_KEY): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
