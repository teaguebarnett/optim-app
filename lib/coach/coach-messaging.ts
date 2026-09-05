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
