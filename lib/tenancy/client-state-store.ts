// Phase 5.0B — per-client AppState storage.
//
// Before this phase, exactly one AppState ever existed (the seeded demo
// client's, under a single fixed localStorage key — see lib/state.ts's
// module doc) because the prototype only ever ran as one client. Now that a
// coach can activate any number of newly onboarded clients into their own
// real Today/Training/Nutrition experience, each one needs its own
// independently-persisted daily state — never sharing or overwriting
// another client's.
//
// The seeded demo client keeps using the ORIGINAL fixed key unchanged: zero
// migration, zero risk of ever touching its real history. Every other
// client (anyone created through the coach's "Add client" flow) gets its
// own namespaced key. This is the one place that decides which key a given
// client's state lives under — every reader/writer (the client-app session
// in hooks/use-prototype-state.tsx, and the coach setup flow in
// lib/coach/setup.ts) goes through here rather than building a key itself.

import { CLIENT_PROFILE_DEMO } from "./seed.ts";
import { migrateStoredState } from "./migrate.ts";
import { clearState, loadState, saveState } from "../storage.ts";
import { createInitialState } from "../state.ts";
import type { AppState } from "../state";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "./types";

const BASE_STATE_STORAGE_KEY = "peak-coaching:state:v1";

export function resolveClientStateStorageKey(clientId: ClientProfileId): string {
  return clientId === CLIENT_PROFILE_DEMO.id ? BASE_STATE_STORAGE_KEY : `${BASE_STATE_STORAGE_KEY}:${clientId}`;
}

/** A client's AppState can be written from outside its own reducer — a
 * coach resolving a review (lib/coach/review-lifecycle.ts) or completing
 * setup (lib/coach/setup.ts) writes directly into a specific client's
 * state, which no React state/dispatch elsewhere ever observes. Any coach
 * screen reading derived data across clients (see hooks/use-coach-data.ts's
 * useCoachWorkspace, and the nav badge it feeds) subscribes to this event
 * to know to re-read fresh, since a save happening in a different
 * component/hook instance otherwise leaves it silently stale. */
const CLIENT_APP_STATE_CHANGED_EVENT = "peak-coaching:client-app-state-changed";

export function subscribeToClientAppStateChanges(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CLIENT_APP_STATE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CLIENT_APP_STATE_CHANGED_EVENT, callback);
}

/** Reads and migrates one client's own persisted daily state — never
 * creates one. Returns null when this client has no state yet (the normal
 * case for a newly onboarded client before the coach completes setup — see
 * lib/coach/activation.ts, which reads exactly this null/non-null signal as
 * "program assigned"/"nutrition configured"), or when what's stored can't
 * be recognized/migrated. */
export function loadClientAppState(clientId: ClientProfileId): AppState | null {
  const stored = loadState<unknown>(resolveClientStateStorageKey(clientId));
  return migrateStoredState(stored);
}

export function saveClientAppState(clientId: ClientProfileId, state: AppState): void {
  saveState(state, resolveClientStateStorageKey(clientId));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CLIENT_APP_STATE_CHANGED_EVENT));
}

/** Removes one client's own stored state (never any other client's) —
 * used only when what's stored can't be recognized/migrated, exactly
 * mirroring lib/storage.ts's original single-client "unrecognized shape"
 * fallback. */
export function clearClientAppState(clientId: ClientProfileId): void {
  clearState(resolveClientStateStorageKey(clientId));
}

/** A brand-new client's own initial daily state, stamped with THEIR
 * identity — never the demo client's — so nothing about their workout
 * session, chat, or reviews can ever be confused for another client's. Not
 * persisted by this call; the caller decides when to save (see
 * loadOrCreateClientAppState below, and lib/coach/setup.ts).
 *
 * `primaryCoachId` is required for any client outside the seed roster
 * (createInitialState's own resolveAssignedCoachId fallback throws for
 * those) — every real caller already has the client's real ClientProfile
 * in hand and passes its primaryCoachId here directly. */
export function createClientAppState(clientId: ClientProfileId, workspaceId: WorkspaceId, primaryCoachId?: CoachProfileId): AppState {
  return createInitialState({ clientId, workspaceId, primaryCoachId });
}

/** The one entry point for "this client's real daily state, creating it if
 * this is the first time anything has written to it" — used by the coach
 * setup flow (see lib/coach/setup.ts) so assigning a program/nutrition
 * config to a client who has never had an AppState before and updating one
 * who already does are the exact same code path. */
export function loadOrCreateClientAppState(clientId: ClientProfileId, workspaceId: WorkspaceId, primaryCoachId?: CoachProfileId): AppState {
  return loadClientAppState(clientId) ?? createClientAppState(clientId, workspaceId, primaryCoachId);
}
