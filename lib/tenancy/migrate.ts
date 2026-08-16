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
import { buildDemoDefaultProgramEnrollment } from "../scheduling/enrollment.ts";
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

/** v3 -> v4 (Phase 4.1): adds programEnrollment, replacing
 * ClientProfile.programWeek/programTotalWeeks as a hand-set display value
 * with a real, derivable enrollment. The new enrollment's startDateIso is
 * reverse-derived so it reports the SAME program week the client was
 * already seeing (CLIENT_PROFILE_DEMO.programWeek) evaluated against
 * today's real date — never reset to Week 1, and never depending on a
 * hardcoded calendar date (buildDemoDefaultProgramEnrollment always reads
 * the real current instant). Idempotent by construction: this step only
 * ever runs when `working.version === 3`, so already-migrated (v4) data is
 * never touched a second time and never gets a second, different
 * enrollment. */
function migrateV3ToV4(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, version: 4, programEnrollment: buildDemoDefaultProgramEnrollment() };
}

/** v4 -> v5 (Phase 4.2 correction): corrects the stale durationWeeks a v4
 * programEnrollment was always built with. Schema version 4 never had any
 * coach-configuration UI for program duration, so every v4 enrollment's
 * durationWeeks is necessarily the old default (16, copied at the time from
 * ClientProfile.programTotalWeeks — see lib/scheduling/enrollment.ts) —
 * version 4 is itself the provenance marker this correction is scoped
 * through, per the "do not identify the prototype enrollment through a
 * brittle client name or one-off ID" requirement. Only durationWeeks is
 * touched — startDateIso (and therefore the derived current week), all
 * history, corrections, weekly reviews, and check-in data are untouched.
 * The `=== 16` guard is an extra, deliberately conservative safety net: if
 * a v4 enrollment somehow already carries a different value, this step
 * leaves it alone rather than assuming it's the stale default.
 * Idempotent by construction: this step only ever runs when
 * `working.version === 4`, so a real future coach-configured 16-week
 * enrollment (created once schema version has already moved past 4) can
 * never be silently reverted to 12 by a repeat hydration. */
function migrateV4ToV5(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...stored, version: 5 };
  const enrollment = stored.programEnrollment;
  if (isRecord(enrollment) && enrollment.durationWeeks === 16) {
    migrated.programEnrollment = {
      ...enrollment,
      durationWeeks: 12,
      updatedAtIso: new Date().toISOString(),
    };
  }
  return migrated;
}

/**
 * Upgrades raw localStorage content (of unknown/any prior shape) to the
 * current AppState (version 5), stepping through every intermediate version
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
    working = migrateV3ToV4(working);
  }
  if (
    working.version === 4 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment)
  ) {
    working = migrateV4ToV5(working);
  }

  if (
    working.version === 5 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment)
  ) {
    return working as unknown as AppState;
  }

  // Unrecognized shape (corrupt data, a future version this build doesn't
  // know about, etc.) — let the caller fall back to a fresh state rather
  // than hydrating something we can't interpret.
  return null;
}
