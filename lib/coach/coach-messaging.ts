// Phase 5.3C — lets a coach send a real chat message to any of their
// clients from the Messages master-detail view, mirroring exactly the
// pattern lib/coach/review-lifecycle.ts already uses: read the target
// client's own AppState directly (never through the per-client reducer,
// which only ever applies to whichever client THIS browser is currently
// acting as — see lib/state.ts's ADD_CHAT_MESSAGE), append one real
// ChatMessage, save it back. No generative AI involved — this is the
// coach's own authored text, stamped with their real coachId.

import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import type { ChatMessage } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

/**
 * Phase 5.4B — OPTIM's exact wording when it relays a coach's own reviewed
 * decision (spec §6): always makes the coach's involvement explicit using
 * their real, live display name — never a hardcoded "Teague" — and never
 * phrases it as if OPTIM decided anything itself. `coachDisplayName`'s
 * first name is used the way every other client-facing coach reference in
 * this app already does (see e.g. lib/coach/communication-policy.ts's
 * buildWelcomeDraft).
 */
export function composeRelayedDecisionMessage(coachDisplayName: string, decisionText: string): string {
  const firstName = coachDisplayName.split(" ")[0] || coachDisplayName;
  return `${firstName} reviewed this and wants you to know: ${decisionText}`;
}

/** Sends a real, provenance-tagged assistant message relaying a coach's own
 * prepared note (e.g. a "milestone" item's preparedClientMessage) —
 * distinct from resolveReviewRequest's own relay (which is tied to a
 * specific decision's resolution), for cases like a personal-touch message
 * that isn't resolving anything. */
export function sendRelayedCoachDecisionMessage(
  clientId: ClientProfileId,
  workspaceId: WorkspaceId,
  coachId: CoachProfileId,
  coachDisplayName: string,
  text: string,
  reviewRequestId: string,
  nowIso: string
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const appState = loadClientAppState(clientId);
  if (!appState) return false;

  const message: ChatMessage = {
    id: `chat-${nowIso}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    clientId,
    assignedCoachId: coachId,
    sender: "assistant",
    text: trimmed,
    createdAtIso: nowIso,
    relayedCoachDecision: { coachDisplayName, reviewRequestId },
  };

  saveClientAppState(clientId, { ...appState, chatMessages: [...appState.chatMessages, message] });
  return true;
}

export function sendCoachMessage(clientId: ClientProfileId, workspaceId: WorkspaceId, coachId: CoachProfileId, text: string, nowIso: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const appState = loadClientAppState(clientId);
  if (!appState) return false;

  const message: ChatMessage = {
    id: `chat-${nowIso}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    clientId,
    assignedCoachId: coachId,
    authorCoachId: coachId,
    sender: "coach",
    text: trimmed,
    createdAtIso: nowIso,
  };

  saveClientAppState(clientId, { ...appState, chatMessages: [...appState.chatMessages, message] });
  return true;
}
