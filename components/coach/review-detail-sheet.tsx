"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { ATTENTION_KIND_LABELS } from "@/lib/coach/labels";
import { requiresResolutionNote, resolveReviewRequest, reopenReviewRequest, startReviewRequest } from "@/lib/coach/review-lifecycle";
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
 */
export function ReviewDetailSheet({
  item,
  coachId,
  onClose,
  onChanged,
}: {
  item: AttentionQueueItem | null;
  coachId: CoachProfileId;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");

  if (!item) return null;

  const noteRequired = item.kind !== "health_review" && requiresResolutionNote(item.kind);
  const noteBlocksResolution = noteRequired && note.trim().length === 0;

  function handleStart() {
    startReviewRequest(item!.clientId, item!.reviewRequestId, new Date().toISOString());
    onChanged();
  }

  function handleResolve(action: "reviewed_no_change" | "resolved") {
    if (noteBlocksResolution) return;
    resolveReviewRequest({
      clientId: item!.clientId,
      reviewId: item!.reviewRequestId,
      resolutionAction: action,
      resolutionNote: note.trim() || undefined,
      resolvedByCoachId: coachId,
      nowIso: new Date().toISOString(),
    });
    setNote("");
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
        </div>

        {item.status === "resolved" ? (
          <div className="rounded-[var(--radius-sm)] border border-border bg-surface-raised p-3.5">
            <p className="text-sm font-medium text-off-white">
              {item.resolutionAction === "reviewed_no_change" ? "Reviewed — no change needed" : "Resolved"}
            </p>
            {item.resolutionNote ? <p className="mt-1.5 text-sm text-neutral">{item.resolutionNote}</p> : null}
            {item.resolvedAtIso ? <p className="mt-2 text-meta text-neutral">{formatTimestamp(item.resolvedAtIso)}</p> : null}
            <Button variant="secondary" className="mt-3 w-full" onClick={handleReopen}>
              Reopen
            </Button>
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
                label="Resolution note (required for safety-related reviews)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you do about this?"
                rows={3}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => handleResolve("reviewed_no_change")} disabled={noteBlocksResolution}>
                Reviewed — no change needed
              </Button>
              <Button onClick={() => handleResolve("resolved")} disabled={noteBlocksResolution}>
                Resolve review
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
