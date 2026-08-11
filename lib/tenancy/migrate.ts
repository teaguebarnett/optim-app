// Versioned migration for persisted client state.
//
// Phase 1's AppState (version 1) had no workspace/client attribution — it
// implicitly belonged to "the" client at "the" coaching business, because
// Phase 1 only ever supported one of each. Phase 2 (version 2) introduced
// explicit workspaceId/clientId on the day record and its nested workout
// session. Phase 3 (version 3) replaced the countdown-driven workoutWindow
// field with a client-entered dailyTrainingPlan. Each step below is a small,
// additive upgrade — existing localStorage data always migrates forward
// through every step rather than being reset.
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

/** v1 -> v2: stamp workspaceId/clientId onto the day record and every
 * independently-addressable nested record (see Phase 2's tenancy model). */
function migrateV1ToV2(stored: Record<string, unknown>): Record<string, unknown> {
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

  return migrated;
}

/** v2 -> v3: drop the retired countdown-driven workoutWindow field and add
 * dailyTrainingPlan. There's no lossless way to translate an old "activated/
 * rescheduled/declined" countdown window into a client-entered training
 * decision — those were two different concepts — so this starts the field
 * at null (no decision made yet) rather than fabricating one. Nothing about
 * the actual workout session, logged sets, or completion status is touched. */
function migrateV2ToV3(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...stored, version: 3, dailyTrainingPlan: null };
  delete migrated.workoutWindow;
  return migrated;
}

/**
 * Upgrades raw localStorage content (of unknown/any prior shape) to the
 * current AppState (version 3), stepping through every intermediate version
 * in order. Returns null when the input isn't a recognized AppState at all,
 * so the caller can safely fall back to a fresh state instead of hydrating
 * garbage.
 */
export function migrateStoredState(stored: unknown): AppState | null {
  if (!isRecord(stored)) return null;

  let working: Record<string, unknown> = stored;

  if (working.version === 1) {
    working = migrateV1ToV2(working);
  }
  if (working.version === 2 && typeof working.workspaceId === "string" && typeof working.clientId === "string") {
    working = migrateV2ToV3(working);
  }

  if (working.version === 3 && typeof working.workspaceId === "string" && typeof working.clientId === "string") {
    return working as unknown as AppState;
  }

  // Unrecognized shape (corrupt data, a future version this build doesn't
  // know about, etc.) — let the caller fall back to a fresh state rather
  // than hydrating something we can't interpret.
  return null;
}
