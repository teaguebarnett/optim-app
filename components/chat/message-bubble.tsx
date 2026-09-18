import { Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { AttachmentMessage } from "@/components/chat/attachment-message";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { talkToCoachRepliedSystemText } from "@/lib/chat/assistant";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function AttachmentList({ attachments }: { attachments: ChatMessage["attachments"] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <AttachmentMessage key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}

export function MessageBubble({
  message,
  onOpenSchedulePicker,
  coachOverride,
  clientAvatarInitialsOverride,
}: {
  message: ChatMessage;
  /** Wired only by app/(client)/chat/page.tsx, which owns the
   * TrainingTimeSheet this opens — see ChatMessage.promptsSchedulePicker's
   * doc. */
  onOpenSchedulePicker?: () => void;
  /** Overrides activeContext.primaryCoach for attributing a "coach" message
   * — used only when this bubble renders outside the client's own /chat
   * page (see app/coach/clients/[clientId]/page.tsx's read-only thread
   * view), where activeContext represents the ACTING COACH's own session,
   * not "this client's assigned coach." Pass explicitly whenever the coach
   * workspace is viewing a specific client's thread. */
  coachOverride?: { displayName: string; avatarInitials: string } | null;
  clientAvatarInitialsOverride?: string;
}) {
  const { state, activeContext } = usePrototypeState();
  const coach = coachOverride !== undefined ? coachOverride : activeContext.primaryCoach;
  const clientAvatarInitials = clientAvatarInitialsOverride ?? activeContext.clientProfile?.avatarInitials ?? "?";
  const hasText = message.text.trim().length > 0;
  const hasAttachments = !!message.attachments && message.attachments.length > 0;

  if (message.sender === "system") {
    // Gate 2C human-QA correction — a "system" line linked to a Talk-to-
    // {coach} request (see ChatMessage.reviewRequestId) must read as
    // resolved the moment the real ReviewRequest is, not stay frozen on
    // its creation-time "awaiting a reply" wording. Derived live off that
    // request's own `resolved` field every render; the stored message.text
    // itself is never rewritten, and every other system message (with no
    // reviewRequestId) renders exactly as before.
    const linkedReview = message.reviewRequestId ? state.reviewRequests.find((r) => r.id === message.reviewRequestId) : undefined;
    const displayText = linkedReview?.resolved ? talkToCoachRepliedSystemText(coach?.displayName ?? "your coach") : message.text;
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-off-white/[0.05] px-3 py-1 text-xs text-neutral">{displayText}</span>
      </div>
    );
  }

  if (message.sender === "client") {
    return (
      <div className="flex items-end justify-end gap-2 py-1">
        <div className="max-w-[78%] space-y-1.5">
          {hasAttachments ? (
            <div className="rounded-[var(--radius-md)] rounded-br-sm bg-accent/15 p-1.5">
              <AttachmentList attachments={message.attachments} />
            </div>
          ) : null}
          {hasText ? (
            <div className="rounded-[var(--radius-md)] rounded-br-sm bg-accent px-3.5 py-2.5">
              <p className="text-[15px] leading-relaxed text-on-accent">{message.text}</p>
            </div>
          ) : null}
        </div>
        <Avatar initials={clientAvatarInitials} size="sm" />
      </div>
    );
  }

  if (message.sender === "coach") {
    // The active client's assigned primary coach is who a "coach" message is
    // attributed to — never the assistant, and never a different coach.
    return (
      <div className="flex items-start gap-2 py-1">
        <Avatar initials={coach?.avatarInitials ?? "?"} size="sm" variant="accent" />
        <div className="max-w-[78%]">
          <p className="mb-1 text-xs font-semibold text-off-white">{coach?.displayName ?? "Coach"} · Coach</p>
          <div className="space-y-1.5 rounded-[var(--radius-md)] rounded-tl-sm border border-accent/30 bg-charcoal px-3.5 py-2.5">
            {hasText ? <p className="text-[15px] leading-relaxed text-off-white">{message.text}</p> : null}
            <AttachmentList attachments={message.attachments} />
          </div>
          <p className="mt-1 text-[11px] text-neutral">{formatTime(message.createdAtIso)}</p>
        </div>
      </div>
    );
  }

  // assistant — always labeled with the workspace's assistant name, and
  // never rendered as if it came from the coach. Phase 5.4B: when this
  // specific message relays a coach's own reviewed decision (see
  // lib/coach/review-lifecycle.ts's resolveReviewRequest), an explicit
  // provenance line names the real coach — never a technical system label
  // like "relayed" or "system" — matching spec §6's "never claim OPTIM
  // independently made a coach-only decision."
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-off-white/[0.06] text-neutral">
        <Sparkles size={14} />
      </span>
      <div className="max-w-[78%]">
        <p className="mb-1 text-xs font-medium text-neutral">{activeContext.assistantDisplayName}</p>
        <div className={cn("space-y-1.5 rounded-[var(--radius-md)] rounded-tl-sm bg-surface-raised px-3.5 py-2.5")}>
          {hasText ? <p className="text-[15px] leading-relaxed text-off-white/90">{message.text}</p> : null}
          <AttachmentList attachments={message.attachments} />
        </div>
        {message.relayedCoachDecision ? (
          <p className="mt-1 text-[11px] text-neutral">{message.relayedCoachDecision.coachDisplayName} reviewed this</p>
        ) : null}
        {message.promptsSchedulePicker && onOpenSchedulePicker ? (
          <button
            type="button"
            onClick={onOpenSchedulePicker}
            className="mt-2 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft px-3.5 py-2 text-sm font-medium text-accent-fg hover:border-accent/70"
          >
            Update today&apos;s training time
          </button>
        ) : null}
      </div>
    </div>
  );
}
