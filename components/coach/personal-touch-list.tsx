"use client";

import { useState } from "react";
import { Trophy, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveReviewRequest } from "@/lib/coach/review-lifecycle";
import { sendRelayedCoachDecisionMessage } from "@/lib/coach/coach-messaging";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { CoachProfileId, WorkspaceId } from "@/lib/tenancy/types";

/**
 * "Worth a Personal Touch" (spec §2/§4) — genuinely positive signals, kept
 * visually and structurally separate from the decision surface above it:
 * a real, ready-to-send prepared message per client, one tap to send. Never
 * mixed with a risk/decision alert, and never itself becomes an urgent
 * item — sending (or skipping) one never blocks anything else.
 */
export function PersonalTouchList({
  items,
  coachId,
  coachName,
  workspaceId,
  onChanged,
}: {
  items: AttentionQueueItem[];
  coachId: CoachProfileId;
  coachName: string;
  workspaceId: WorkspaceId;
  onChanged: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <PersonalTouchRow key={item.reviewRequestId} item={item} coachId={coachId} coachName={coachName} workspaceId={workspaceId} onChanged={onChanged} />
      ))}
    </div>
  );
}

function PersonalTouchRow({
  item,
  coachId,
  coachName,
  workspaceId,
  onChanged,
}: {
  item: AttentionQueueItem;
  coachId: CoachProfileId;
  coachName: string;
  workspaceId: WorkspaceId;
  onChanged: () => void;
}) {
  const [message, setMessage] = useState(item.preparedClientMessage ?? "");
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!message.trim()) return;
    const nowIso = new Date().toISOString();
    sendRelayedCoachDecisionMessage(item.clientId, workspaceId, coachId, coachName, message.trim(), item.reviewRequestId, nowIso);
    resolveReviewRequest({
      clientId: item.clientId,
      reviewId: item.reviewRequestId,
      resolutionAction: "resolved",
      resolvedByCoachId: coachId,
      resolvedByCoachName: coachName,
      nowIso,
    });
    setSent(true);
    onChanged();
  }

  return (
    <Card className="flex items-start gap-3 border-l-2 border-l-success">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <Trophy size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-off-white">{item.clientName}</p>
        <p className="mt-0.5 text-sm text-neutral">{item.summary}</p>
        {!sent ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="h-9 min-w-[220px] flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-2.5 text-sm text-off-white outline-none focus-visible:border-accent"
            />
            <Button size="sm" onClick={handleSend} disabled={!message.trim()}>
              <Sparkles size={13} aria-hidden="true" /> Send
            </Button>
          </div>
        ) : (
          <p className="mt-1.5 text-meta text-success">Sent</p>
        )}
      </div>
    </Card>
  );
}
