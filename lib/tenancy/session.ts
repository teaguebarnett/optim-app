// Local, development-only session adapter — Phase 5.0A, widened in 5.0B.
//
// Production authentication is not connected in this prototype. "Who is
// currently acting" is resolved along two independent axes, both persisted
// here: DevPerspective (coach vs. client) and — only when acting as a
// client — which client. The coach perspective always resolves through the
// exact same resolveActiveContext() every other tenancy check already
// uses; so does the client perspective when it's the seeded demo client.
// Once activation lets a coach-created client into their own daily
// experience (Phase 5.0B), "client" perspective can point at any client at
// all — see loadActiveClientId/saveActiveClientId below, and
// hooks/use-prototype-state.tsx for where this drives which client's own
// AppState (lib/tenancy/client-state-store.ts) actually loads. A
// coach-created client still has no real PlatformUser/WorkspaceMembership
// in this no-auth prototype, so acting as one is resolved directly by
// clientId (see lib/coach/repository.ts's resolveCoachCreatedClientContext)
// rather than through a SessionPointer.

import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID, TEAGUE_USER } from "./seed.ts";
import type { ClientProfileId, SessionPointer, UserId } from "./types";

export type DevPerspective = "client" | "coach";

const PERSPECTIVE_STORAGE_KEY = "peak-coaching:dev-perspective:v1";

/** Phase 5.2 — which coach the "coach" perspective currently acts as.
 * Defaults to Teague (the original, only-ever coach identity this
 * prototype had) so a browser that has never switched behaves exactly as
 * before. Exists solely so /dev's multi-coach QA entries (see
 * lib/coach/dev-actions.ts) can genuinely exercise a second coach's own
 * workspace view — every coach-facing string must be resolved from real
 * profile data, never hardcoded to Teague, and this is how that gets
 * proven live rather than only in unit tests. */
const ACTIVE_COACH_USER_STORAGE_KEY = "peak-coaching:active-coach-user-id:v1";

/** Phase 5.0B — which client the "client" perspective currently acts as.
 * Widens lib/tenancy/session.ts's original two-seeded-session switch (see
 * this file's own history) to any client at all: a coach-created client
 * never gets a real PlatformUser/WorkspaceMembership in this no-auth
 * prototype (see lib/coach/repository.ts's module doc), so "acting as"
 * them is resolved directly by clientId rather than through a
 * SessionPointer — see lib/coach/repository.ts's
 * resolveCoachCreatedClientContext, and hooks/use-prototype-state.tsx for
 * where this actually drives which client's own AppState loads. Defaults
 * to the seeded demo client, preserving every existing behavior exactly
 * for a browser that has never switched. */
const ACTIVE_CLIENT_STORAGE_KEY = "peak-coaching:active-client-id:v1";

export function getDemoCoachSession(): SessionPointer {
  return { userId: loadActiveCoachUserId(), workspaceId: WORKSPACE_OPTIM_ID };
}

function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__peak_coaching_perspective_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/** Defaults to "client" — a fresh browser (or one with storage blocked)
 * always lands on the existing client experience, never the coach
 * workspace, so nothing about default behavior changes for an existing
 * user. Callers deciding what a session with NO stored preference at all
 * should default to (see hasStoredDevPerspective) use
 * lib/coach/routing.ts's resolveDefaultDevPerspective instead — this
 * function alone can't distinguish "never chosen" from "explicitly client". */
export function loadDevPerspective(): DevPerspective {
  if (!isStorageAvailable()) return "client";
  try {
    const raw = window.localStorage.getItem(PERSPECTIVE_STORAGE_KEY);
    return raw === "coach" ? "coach" : "client";
  } catch {
    return "client";
  }
}

/** True once a perspective has been explicitly persisted — by the
 * developer via DevPerspectiveSwitcher, or by the one-time route-aware
 * default (see lib/coach/routing.ts's resolveDefaultDevPerspective and its
 * one caller in hooks/use-prototype-state.tsx) — false only for a browser
 * that has never stored one at all. Kept separate from loadDevPerspective
 * because "nothing stored yet" and "explicitly stored as client" must be
 * distinguishable to fix Phase 5.5B's /coach redirect trap without
 * changing what an already-explicit client session does. */
export function hasStoredDevPerspective(): boolean {
  if (!isStorageAvailable()) return false;
  try {
    return window.localStorage.getItem(PERSPECTIVE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveDevPerspective(perspective: DevPerspective): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(PERSPECTIVE_STORAGE_KEY, perspective);
  } catch {
    // ignore — in-memory state for the rest of this session still works.
  }
}

/** Defaults to the seeded demo client — a fresh browser (or one with
 * storage blocked) always resolves "client" perspective to exactly the
 * client it already did before this concept existed. */
export function loadActiveClientId(): ClientProfileId {
  if (!isStorageAvailable()) return CLIENT_PROFILE_DEMO.id;
  try {
    return window.localStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY) || CLIENT_PROFILE_DEMO.id;
  } catch {
    return CLIENT_PROFILE_DEMO.id;
  }
}

export function saveActiveClientId(clientId: ClientProfileId): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(ACTIVE_CLIENT_STORAGE_KEY, clientId);
  } catch {
    // ignore — in-memory state for the rest of this session still works.
  }
}

/** Defaults to Teague — see ACTIVE_COACH_USER_STORAGE_KEY's own doc. */
export function loadActiveCoachUserId(): UserId {
  if (!isStorageAvailable()) return TEAGUE_USER.id;
  try {
    return window.localStorage.getItem(ACTIVE_COACH_USER_STORAGE_KEY) || TEAGUE_USER.id;
  } catch {
    return TEAGUE_USER.id;
  }
}

export function saveActiveCoachUserId(userId: UserId): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(ACTIVE_COACH_USER_STORAGE_KEY, userId);
  } catch {
    // ignore — in-memory state for the rest of this session still works.
  }
}
