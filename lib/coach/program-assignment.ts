// Phase 5.2 — writing a client's own training-protocol copy.
//
// Exactly the same reasoning as lib/coach/setup.ts's applyCoachSetup and
// lib/coach/review-lifecycle.ts: a client's assignedProgram is a property
// of their own daily AppState (see lib/state.ts), not the coach-side
// PlatformState, so it's written directly into that client's storage
// rather than through the per-client reducer — a coach must be able to
// create/assign/edit a program for any of their clients regardless of
// which client this browser currently "acts as."

import { assignTemplateToClient } from "./training.ts";
import { loadOrCreateClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import type { ClientAssignedProgram } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { CoachProgramTemplate } from "./types";

/** The one write path for a client's program, whether it's a from-scratch
 * draft, an in-progress edit, or finalizing to "assigned" — the editor
 * always passes the complete ClientAssignedProgram it wants persisted. */
export function saveClientProgram(clientId: ClientProfileId, workspaceId: WorkspaceId, primaryCoachId: CoachProfileId, program: ClientAssignedProgram): void {
  const appState = loadOrCreateClientAppState(clientId, workspaceId, primaryCoachId);
  saveClientAppState(clientId, { ...appState, assignedProgram: program });
}

/** Assigning a saved template to a client — produces and persists an
 * independent copy (see lib/coach/training.ts's assignTemplateToClient);
 * the template itself is never modified, and a later edit to this client's
 * copy can never affect the template or any other client's copy. */
export function assignTemplateToClientAppState(
  clientId: ClientProfileId,
  workspaceId: WorkspaceId,
  primaryCoachId: CoachProfileId,
  template: CoachProgramTemplate,
  nowIso: string
): ClientAssignedProgram {
  const program = assignTemplateToClient(template, { clientId, nowIso });
  saveClientProgram(clientId, workspaceId, primaryCoachId, program);
  return program;
}
