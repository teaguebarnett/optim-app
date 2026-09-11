"use server";

// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The client-callable surface over lib/production/chat.ts. Every function
// here re-derives the caller's own client identity and workspace from the
// authenticated Supabase session (resolveOwnClientIdentity) rather than
// accepting them as arguments — there is deliberately no parameter on this
// surface that a browser could use to act as, or read, another client. The
// only thing a caller may send is the text of their own message.
//
// Client components import ONLY this file, never lib/production/chat.ts or
// lib/supabase/* directly, exactly like Phase 6.0B's
// app/actions/production-programs.ts.

import { resolveOwnClientIdentity } from "../../lib/production/identity";
import {
  getMyChatState,
  sendClientChatMessage,
  RateLimitExceededError,
  InvalidMessageError,
  type ClientChatState,
  type ConversationMessageView,
} from "../../lib/production/chat";
import { getMyCampaignMessages, type ClientCampaignMessageView } from "../../lib/production/campaigns";
import { getClientCoachNotes, type CoachNoteView } from "../../lib/production/coach-notes";
import type { ProviderFailureKind } from "../../lib/ai/pipeline";

export interface MyChatScreenState extends ClientChatState {
  clientDisplayName: string;
  coachDisplayName: string;
  /** One-way Personal Coach Notes — rendered as coach-attributed cards, not
   * as a DM thread. */
  coachNotes: CoachNoteView[];
  /** Delivered Adaptive Campaign messages addressed to this client. */
  campaignMessages: ClientCampaignMessageView[];
}

export async function getMyChatScreenStateAction(): Promise<MyChatScreenState> {
  const identity = await resolveOwnClientIdentity();
  const [state, coachNotes, campaignMessages] = await Promise.all([
    getMyChatState({ clientProfileId: identity.clientProfileId, coachDisplayName: identity.coachDisplayName }),
    getClientCoachNotes(identity.clientProfileId),
    getMyCampaignMessages(identity.clientProfileId),
  ]);
  return {
    ...state,
    clientDisplayName: identity.clientDisplayName,
    coachDisplayName: identity.coachDisplayName,
    coachNotes,
    campaignMessages,
  };
}

export type SendMyChatMessageResult =
  | {
      kind: "ok";
      clientMessage: ConversationMessageView;
      responseMessages: ConversationMessageView[];
      routedToCoachThread: boolean;
      providerFailure: ProviderFailureKind | null;
      /** The UI must read "your coach has this" from THIS, never from the
       * assistant's own words. */
      escalationCreated: boolean;
      escalationPersistenceFailed: boolean;
    }
  | { kind: "rejected"; reason: string };

/** The single entry point for every client-authored message — typed text
 * and suggestion chips alike. A chip is literally just its prompt text sent
 * through here, so there is no separate intent whitelist and no path that
 * bypasses safety, authority, or persistence. */
export async function sendMyChatMessageAction(body: string): Promise<SendMyChatMessageResult> {
  const identity = await resolveOwnClientIdentity();
  try {
    const result = await sendClientChatMessage({
      clientProfileId: identity.clientProfileId,
      workspaceId: identity.workspaceId,
      clientDisplayName: identity.clientDisplayName,
      coachDisplayName: identity.coachDisplayName,
      body,
    });
    return {
      kind: "ok",
      clientMessage: result.clientMessage,
      responseMessages: result.responseMessages,
      routedToCoachThread: result.routedToCoachThread,
      providerFailure: result.providerFailure,
      escalationCreated: result.escalationId !== null,
      escalationPersistenceFailed: result.escalationPersistenceFailed,
    };
  } catch (err) {
    // A rate limit or a malformed message is an honest, expected outcome
    // the UI renders as a message — never an unhandled 500, and never a
    // fabricated assistant reply.
    if (err instanceof RateLimitExceededError || err instanceof InvalidMessageError) {
      return { kind: "rejected", reason: err.message };
    }
    throw err;
  }
}
