// Phase 5.2 — the review resolution lifecycle.
//
// A ReviewRequest (lib/types.ts) is never silently dismissed. Opening its
// detail view shows full context but never changes its status; only a
// deliberate action does — "Start review" (needs_review -> in_progress), a
// final outcome ("Reviewed — no change needed" / "Resolve review", both ->
// resolved), or, for a significant kind, "Move to waiting" (Phase 5.4B) when
// the coach has acted but something else still needs to happen first.
// Resolving removes it from the default queue but the record itself is
// never deleted — see reopenReviewRequest, and app/coach/reviews/page.tsx's
// Resolved tab.
//
// Every mutation here writes directly into the target client's own AppState
// (see lib/tenancy/client-state-store.ts) rather than through the per-client
// reducer in lib/state.ts — a coach must be able to resolve any of their
// clients' reviews regardless of which client this browser currently "acts
// as," exactly the same reasoning lib/coach/setup.ts's applyCoachSetup
// already follows for program/nutrition setup.
//
// Phase 5.4B — resolveReviewRequest now enforces spec §3's resolution-
// receipt gate: a "significant" kind (see
// requiresClientNotificationBeforeResolution) cannot become "resolved"
// without a real message actually being relayed to the client. The coach
// still has a real, non-dead-end path when they aren't ready to write that
// message yet — moveReviewToWaiting — so this is never a hard block, just an
// honest one.

import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import { requiresClientNotificationBeforeResolution } from "./review-support.ts";
import { composeRelayedDecisionMessage } from "./coach-messaging.ts";
import type { AppState } from "../state";
import type { AttentionHistoryEntry, ChatMessage, ResolutionReceipt, ReviewRequest, ReviewResolutionAction } from "../types";
import type { ClientProfileId, CoachProfileId } from "../tenancy/types";

export { requiresResolutionNote, severityForKind, findDuplicateReviewRequest, requiresClientNotificationBeforeResolution } from "./review-support.ts";

function mutateReviewRequest(clientId: ClientProfileId, reviewId: string, mutate: (review: ReviewRequest) => ReviewRequest): boolean {
  const appState = loadClientAppState(clientId);
  if (!appState) return false;
  let found = false;
  const reviewRequests = appState.reviewRequests.map((r) => {
    if (r.id !== reviewId) return r;
    found = true;
    return mutate(r);
  });
  if (!found) return false;
  const next: AppState = { ...appState, reviewRequests };
  saveClientAppState(clientId, next);
  return true;
}

/** needs_review -> in_progress. A no-op (returns true without changing
 * anything) if the review is already past needs_review, so re-clicking
 * "Start review" — or navigating away and back — can never move a resolved
 * review backward. */
export function startReviewRequest(clientId: ClientProfileId, reviewId: string, nowIso: string): boolean {
  return mutateReviewRequest(clientId, reviewId, (r) =>
    r.status === "needs_review" ? { ...r, status: "in_progress", updatedAtIso: nowIso } : r
  );
}

export interface ResolveReviewRequestInput {
  clientId: ClientProfileId;
  reviewId: string;
  resolutionAction: ReviewResolutionAction;
  resolutionNote?: string;
  resolvedByCoachId: CoachProfileId;
  /** The real authenticated coach's display name — never a hardcoded
   * "Teague." Used both in the audit-trail entry and, when a client message
   * is relayed, in that message's own coach-involvement framing (spec §6). */
  resolvedByCoachName: string;
  nowIso: string;
  /**
   * The real message to relay to the client as a coach-reviewed decision
   * (see lib/coach/coach-messaging.ts's composeRelayedDecisionMessage).
   * Required to resolve a "significant" kind (see
   * requiresClientNotificationBeforeResolution) — omitting it there returns
   * `{ ok: false, reason: "notification_required" }` and changes nothing;
   * the coach can still record their decision by calling
   * moveReviewToWaiting instead. Ignored (never sent) for a kind that
   * doesn't require it.
   */
  clientMessage?: string;
  /** A short, concrete description of what actually changed — stored on the
   * resolution receipt. Defaults to the resolution note when omitted. */
  whatChanged?: string;
}

export type ResolveReviewRequestResult = { ok: true } | { ok: false; reason: "not_found" | "notification_required" };

/**
 * -> resolved, with the coach's deliberately chosen final outcome. For a
 * routine kind this is exactly the original Phase 5.2 behavior. For a
 * "significant" kind (spec §3), it also builds and attaches a real
 * ResolutionReceipt and — only when a clientMessage is provided — appends
 * one real, provenance-tagged ChatMessage relaying the decision. Never
 * partially applies: either both the review and the message are written
 * together, or (when notification is required but missing) nothing changes
 * at all.
 */
export function resolveReviewRequest(input: ResolveReviewRequestInput): ResolveReviewRequestResult {
  const appState = loadClientAppState(input.clientId);
  if (!appState) return { ok: false, reason: "not_found" };
  const existing = appState.reviewRequests.find((r) => r.id === input.reviewId);
  if (!existing) return { ok: false, reason: "not_found" };

  const needsNotification = requiresClientNotificationBeforeResolution(existing.kind);
  const clientMessage = input.clientMessage?.trim();
  if (needsNotification && !clientMessage) {
    return { ok: false, reason: "notification_required" };
  }

  const historyEntry: AttentionHistoryEntry = {
    id: `${input.nowIso}-resolved`,
    atIso: input.nowIso,
    actorType: "coach",
    actorLabel: input.resolvedByCoachName,
    action: input.resolutionAction === "resolved" ? "Resolved, with a change." : "Reviewed — no change needed.",
    note: input.resolutionNote,
  };

  const resolutionReceipt: ResolutionReceipt | undefined = needsNotification
    ? {
        decision: input.resolutionAction === "resolved" ? "Resolved" : "Reviewed — no change needed",
        approvedByCoachId: input.resolvedByCoachId,
        approvedByCoachName: input.resolvedByCoachName,
        whatChanged: input.whatChanged ?? input.resolutionNote ?? (input.resolutionAction === "resolved" ? "See coach note." : "No change made."),
        clientCommunicated: clientMessage ?? "",
        clientNotifiedAtIso: clientMessage ? input.nowIso : undefined,
        responseRequired: false,
      }
    : undefined;

  const reviewRequests = appState.reviewRequests.map((r): ReviewRequest =>
    r.id === input.reviewId
      ? {
          ...r,
          status: "resolved",
          resolved: true,
          resolutionAction: input.resolutionAction,
          resolutionNote: input.resolutionNote,
          resolvedAtIso: input.nowIso,
          resolvedByCoachId: input.resolvedByCoachId,
          updatedAtIso: input.nowIso,
          clientNotifiedAtIso: clientMessage ? input.nowIso : r.clientNotifiedAtIso,
          responseRequiredFromClient: false,
          history: [...(r.history ?? []), historyEntry],
          resolutionReceipt,
        }
      : r
  );

  const relayedMessage: ChatMessage | null = clientMessage
    ? {
        id: `chat-${input.nowIso}-${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: appState.workspaceId,
        clientId: appState.clientId,
        assignedCoachId: appState.primaryCoachId,
        sender: "assistant",
        text: composeRelayedDecisionMessage(input.resolvedByCoachName, clientMessage),
        createdAtIso: input.nowIso,
        relayedCoachDecision: { coachDisplayName: input.resolvedByCoachName, reviewRequestId: input.reviewId },
      }
    : null;

  saveClientAppState(input.clientId, {
    ...appState,
    reviewRequests,
    chatMessages: relayedMessage ? [...appState.chatMessages, relayedMessage] : appState.chatMessages,
  });

  return { ok: true };
}

export interface MoveReviewToWaitingInput {
  clientId: ClientProfileId;
  reviewId: string;
  /** A short, concrete description of what's being waited on (e.g.
   * "Client's reply about tomorrow's session"). */
  waitingOn: string;
  /** When OPTIM should resurface this as needing attention again — see
   * lib/coach/attention-queue.ts's attentionBucketForItem. Omitted means it
   * stays in Waiting until the coach (or a future real event) moves it. */
  resurfaceAtIso?: string;
  actorLabel: string;
  nowIso: string;
}

/** Any active status -> waiting. The coach has already acted — this only
 * records what's being waited on and, optionally, when to resurface it; it
 * never resolves the review or sends anything to the client on its own. */
export function moveReviewToWaiting(input: MoveReviewToWaitingInput): boolean {
  return mutateReviewRequest(input.clientId, input.reviewId, (r) => ({
    ...r,
    status: "waiting",
    waitingOn: input.waitingOn,
    resurfaceAtIso: input.resurfaceAtIso,
    updatedAtIso: input.nowIso,
    history: [
      ...(r.history ?? []),
      { id: `${input.nowIso}-waiting`, atIso: input.nowIso, actorType: "coach", actorLabel: input.actorLabel, action: `Moved to waiting: ${input.waitingOn}` },
    ],
  }));
}

/** resolved -> needs_review. Clears the resolution fields (and the
 * resolution receipt) rather than leaving a stale outcome/note/receipt
 * attached to a review that's open again. */
export function reopenReviewRequest(clientId: ClientProfileId, reviewId: string, nowIso: string): boolean {
  return mutateReviewRequest(clientId, reviewId, (r) => ({
    ...r,
    status: "needs_review",
    resolved: false,
    resolutionAction: undefined,
    resolutionNote: undefined,
    resolvedAtIso: undefined,
    resolvedByCoachId: undefined,
    resolutionReceipt: undefined,
    updatedAtIso: nowIso,
  }));
}
