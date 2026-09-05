// Phase 5.0B — the coach setup flow's write path.
//
// "Complete setup" writes directly into the target client's own AppState
// (see lib/tenancy/client-state-store.ts) rather than through the platform
// store's reducer — AppState and PlatformState stay two separate stores by
// design (see lib/coach/platform-store.ts's module doc), and program/
// nutrition/check-in configuration are properties of a client's real daily
// state, not of the coach-side roster record. Structured as a temporary
// seeded assignment (see buildProgramEnrollmentForClient's own doc): a
// future real program builder or spreadsheet import only ever needs to
// produce a different ProgramEnrollment/nutritionTargets pair through this
// exact same applyCoachSetup entry point, never a different activation
// path.

import { buildProgramEnrollmentForClient } from "../scheduling/enrollment.ts";
import { buildDemoCheckInScheduleConfig } from "../scheduling/check-in.ts";
import { loadOrCreateClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import type { AppState } from "../state";
import type { NutritionTargets } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { ClientLifecycleStatus } from "./types";

export interface CoachSetupInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  /** Required so a client's very first AppState (created right here, if
   * this is their first setup save) can be stamped with their real coach —
   * see AppState.primaryCoachId's own doc for why this can never be
   * re-derived later from clientId alone for a coach-created client. */
  primaryCoachId: CoachProfileId;
  startDateIso: string;
  durationWeeks: number;
  nutritionTargets: NutritionTargets;
  /** Whether to finalize a real weekly check-in schedule — "None for now"
   * (the invitation-stage default) must remain valid and must never block
   * activation; see lib/coach/activation.ts, which never checks this. */
  assignWeeklyCheckIn: boolean;
  now?: Date;
}

/**
 * Pure merge — given whatever this client's AppState already looked like
 * (freshly created, or a previous setup being edited before activation),
 * returns what it should look like after this setup save. Never touches
 * meals/workoutSession/chatMessages/reviewRequests/morningWeight/cardio —
 * only the three fields this setup screen actually owns. Split out from
 * applyCoachSetup below so this can be tested without touching storage.
 */
export function buildCoachSetupAppState(base: AppState, input: CoachSetupInput): AppState {
  const programEnrollment = buildProgramEnrollmentForClient({
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    startDateIso: input.startDateIso,
    durationWeeks: input.durationWeeks,
    now: input.now,
  });

  const checkInSchedule = input.assignWeeklyCheckIn
    ? buildDemoCheckInScheduleConfig({
        workspaceId: input.workspaceId,
        clientId: input.clientId,
        enrollmentId: programEnrollment.id,
        timeZone: programEnrollment.timeZone,
        now: input.now,
      })
    : null;

  return {
    ...base,
    programEnrollment,
    nutritionTargets: input.nutritionTargets,
    checkInSchedule,
  };
}

/**
 * Loads (or creates, for a client's very first setup save) this client's
 * own AppState, applies the coach's setup, and persists it — the one real
 * write path "Complete setup" uses. Never touches any other client's
 * state, and never shares/derives from the seeded demo client's.
 */
export function applyCoachSetup(input: CoachSetupInput): AppState {
  const base = loadOrCreateClientAppState(input.clientId, input.workspaceId, input.primaryCoachId);
  const next = buildCoachSetupAppState(base, input);
  saveClientAppState(input.clientId, next);
  return next;
}

/**
 * Whether saving "Complete setup" should also advance lifecycle to
 * "ready_to_activate" — true only from "coach_setup" (the normal forward
 * path). Saving setup must never REGRESS a client who's already active,
 * paused, or completed — a coach revisiting this screen to correct a
 * nutrition target after activation is still just editing configuration,
 * not un-activating them. Mirrors lib/coach/platform-store.ts's own
 * PRE_ONBOARDING_STATUSES guard for SAVE_ONBOARDING_STEP — same "only
 * advance forward" principle, applied here since this is a page-level
 * action rather than a case inside that reducer (see
 * app/coach/clients/[clientId]/setup/page.tsx's handleSave).
 */
export function shouldAdvanceLifecycleOnSetupSave(currentLifecycle: ClientLifecycleStatus): boolean {
  return currentLifecycle === "coach_setup";
}
