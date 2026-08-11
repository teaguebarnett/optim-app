// Versioned migration for persisted client state.
//
// Phase 1's AppState (version 1) had no workspace/client attribution — it
// implicitly belonged to "the" client at "the" coaching business, because
// Phase 1 only ever supported one of each. Phase 2 introduces explicit
// workspaceId/clientId on the day record and its nested workout session, so
// existing localStorage data needs a one-time upgrade rather than a reset.
//
// This must never throw on malformed/unexpected input — the caller (see
// hooks/use-prototype-state.tsx) falls back to a fresh initial state when
// migration can't make sense of what's stored, which is exactly Phase 1's
// existing "unrecognized stored state" behavior.

import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "./seed.ts";
import type { AppState } from "../state";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function stampWorkspaceAndClient<T extends Record<string, unknown>>(record: T): T {
  return { ...record, workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id };
}

/**
 * Upgrades raw localStorage content (of unknown/any prior shape) to the
 * current AppState (version 2). Returns null when the input isn't a
 * recognized AppState at all, so the caller can safely fall back to a fresh
 * state instead of hydrating garbage.
 */
export function migrateStoredState(stored: unknown): AppState | null {
  if (!isRecord(stored)) return null;

  // Already current — nothing to do.
  if (stored.version === 2 && typeof stored.workspaceId === "string" && typeof stored.clientId === "string") {
    return stored as unknown as AppState;
  }

  // Phase 1 shape: version 1, no workspace/client attribution anywhere.
  if (stored.version === 1) {
    const migrated: Record<string, unknown> = {
      ...stored,
      version: 2,
      workspaceId: WORKSPACE_OPTIM_ID,
      clientId: CLIENT_PROFILE_DEMO.id,
    };

    if (isRecord(stored.workoutSession)) {
      migrated.workoutSession = stampWorkspaceAndClient(stored.workoutSession);
    }

    if (Array.isArray(stored.chatMessages)) {
      migrated.chatMessages = stored.chatMessages.map((m) => (isRecord(m) ? stampWorkspaceAndClient(m) : m));
    }

    if (Array.isArray(stored.reviewRequests)) {
      migrated.reviewRequests = stored.reviewRequests.map((r) => (isRecord(r) ? stampWorkspaceAndClient(r) : r));
    }

    if (isRecord(stored.workoutSession) && Array.isArray((stored.workoutSession as Record<string, unknown>).painReports)) {
      const session = migrated.workoutSession as Record<string, unknown>;
      session.painReports = ((stored.workoutSession as Record<string, unknown>).painReports as unknown[]).map((p) =>
        isRecord(p) ? stampWorkspaceAndClient(p) : p
      );
    }

    return migrated as unknown as AppState;
  }

  // Unrecognized shape (corrupt data, a future version this build doesn't
  // know about, etc.) — let the caller fall back to a fresh state rather
  // than hydrating something we can't interpret.
  return null;
}
