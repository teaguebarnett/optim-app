"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import { resolutionOutcomeVerb } from "@/lib/coach/attention-queue";
import {
  moveReviewToWaiting,
  requiresClientNotificationBeforeResolution,
  requiresResolutionNote,
  resolveReviewRequest,
  reopenReviewRequest,
  startReviewRequest,
} from "@/lib/coach/review-lifecycle";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { CoachProfileId } from "@/lib/tenancy/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Full context for exactly one review, and every deliberate lifecycle
 * action available on it — see lib/coach/review-lifecycle.ts's module doc.
 * Opening this sheet (or closing it) never itself changes the review's
 * status; only pressing one of the buttons below does. Every mutation
 * writes directly into the owning client's own AppState, so `onChanged`
 * exists purely to make the parent page re-read fresh data (see
 * app/coach/reviews/page.tsx) — it never carries the new state itself.
 *
 * Phase 5.4B — resolving a "significant" kind now requires a real message
 * to relay to the client (see requiresClientNotificationBeforeResolution);
 * "Move to waiting" is the honest alternative when the coach isn't ready to
 * write that yet. A resolved item's resolution receipt (spec §3) is shown
 * in place of the older bare outcome/note.
 */
export function ReviewDetailSheet({
  item,
  coachId,
  coachName,
  onClose,
  onChanged,
}: {
  item: AttentionQueueItem | null;
  coachId: CoachProfileId;
  coachName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  if (!item) return null;

  const noteRequired = item.kind !== "health_review" && item.kind !== "plan_approval" && requiresResolutionNote(item.kind);
  const notificationRequired = item.kind !== "health_review" && item.kind !== "plan_approval" && requiresClientNotificationBeforeResolution(item.kind);
  const noteBlocksResolution = noteRequired && note.trim().length === 0;
  const messageBlocksResolution = notificationRequired && clientMessage.trim().length === 0;

  function handleStart() {
    startReviewRequest(item!.clientId, item!.reviewRequestId, new Date().toISOString());
    onChanged();
  }

  function handleResolve(action: "reviewed_no_change" | "resolved") {
    if (noteBlocksResolution || messageBlocksResolution) return;
    setBlockedReason(null);
    const result = resolveReviewRequest({
      clientId: item!.clientId,
      reviewId: item!.reviewRequestId,
      resolutionAction: action,
      resolutionNote: note.trim() || undefined,
      resolvedByCoachId: coachId,
      resolvedByCoachName: coachName,
      clientMessage: notificationRequired ? clientMessage.trim() : undefined,
      nowIso: new Date().toISOString(),
    });
    if (!result.ok) {
      setBlockedReason("Tell the client what this means before resolving — or move this to Waiting until you're ready.");
      return;
    }
    setNote("");
    setClientMessage("");
    onChanged();
  }

  function handleMoveToWaiting() {
    moveReviewToWaiting({
      clientId: item!.clientId,
      reviewId: item!.reviewRequestId,
      waitingOn: note.trim() || "Coach still deciding what to tell the client",
      actorLabel: coachName,
      nowIso: new Date().toISOString(),
    });
    onChanged();
  }

  function handleReopen() {
    reopenReviewRequest(item!.clientId, item!.reviewRequestId, new Date().toISOString());
    onChanged();
  }

  return (
    <Sheet open onClose={onClose} title={item.clientName} description={ATTENTION_KIND_LABELS[item.kind]}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-off-white">{item.summary}</p>
          <p className="mt-2 text-meta text-neutral">Flagged {formatTimestamp(item.createdAtIso)}</p>
          {item.escalationReason ? <p className="mt-2 text-sm text-neutral">{item.escalationReason}</p> : null}
        </div>

        {item.status === "resolved" ? (
          <div className="rounded-[var(--radius-sm)] border border-border bg-surface-raised p-3.5">
            <p className="text-sm font-medium text-off-white">
              {item.resolutionAction === "reviewed_no_change" ? "Reviewed — no change needed" : "Resolved"}
            </p>
            {item.resolutionNote ? <p className="mt-1.5 text-sm text-neutral">{item.resolutionNote}</p> : null}
            {item.resolutionReceipt ? (
              <div className="mt-2 space-y-1 border-t border-border pt-2 text-meta text-neutral">
                <p>
                  {resolutionOutcomeVerb(item)} by {item.resolutionReceipt.approvedByCoachName}
                </p>
                {item.resolutionReceipt.clientCommunicated ? <p>Told {item.clientName.split(" ")[0]}: &ldquo;{item.resolutionReceipt.clientCommunicated}&rdquo;</p> : null}
              </div>
            ) : null}
            {item.resolvedAtIso ? <p className="mt-2 text-meta text-neutral">{formatTimestamp(item.resolvedAtIso)}</p> : null}
            <Button variant="secondary" className="mt-3 w-full" onClick={handleReopen}>
              Reopen
            </Button>
          </div>
        ) : item.status === "waiting" ? (
          <div className="space-y-3">
            <p className="text-label text-brass-strong">Waiting — {item.waitingOn ?? "on something you noted"}</p>
            {noteRequired ? (
              <TextArea id="review-resolution-note" label="Resolution note (required for this kind)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            ) : null}
            {notificationRequired ? (
              <TextArea
                id="review-client-message"
                label={`Message to relay to ${item.clientName.split(" ")[0]} (required before resolving)`}
                value={clientMessage}
                onChange={(e) => setClientMessage(e.target.value)}
                rows={3}
              />
            ) : null}
            {blockedReason ? <p className="text-meta text-error">{blockedReason}</p> : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => handleResolve("reviewed_no_change")} disabled={noteBlocksResolution || messageBlocksResolution}>
                Reviewed — no change needed
              </Button>
              <Button onClick={() => handleResolve("resolved")} disabled={noteBlocksResolution || messageBlocksResolution}>
                Resolve review
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {item.status === "needs_review" ? (
              <Button variant="secondary" className="w-full" onClick={handleStart}>
                Start review
              </Button>
            ) : (
              <p className="text-label text-brass-strong">In progress</p>
            )}

            {noteRequired ? (
              <TextArea
                id="review-resolution-note"
                label="Resolution note (required for this kind)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you do about this?"
                rows={3}
              />
            ) : null}

            {notificationRequired ? (
              <TextArea
                id="review-client-message"
                label={`Message to relay to ${item.clientName.split(" ")[0]} (required before resolving)`}
                value={clientMessage}
                onChange={(e) => setClientMessage(e.target.value)}
                placeholder="What should OPTIM tell them, on your behalf?"
                rows={3}
              />
            ) : null}

            {blockedReason ? <p className="text-meta text-error">{blockedReason}</p> : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => handleResolve("reviewed_no_change")} disabled={noteBlocksResolution || messageBlocksResolution}>
                Reviewed — no change needed
              </Button>
              <Button onClick={() => handleResolve("resolved")} disabled={noteBlocksResolution || messageBlocksResolution}>
                Resolve review
              </Button>
            </div>
            {notificationRequired ? (
              <Button variant="outline" className="w-full" onClick={handleMoveToWaiting}>
                Move to waiting
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Sheet>
  );
}
