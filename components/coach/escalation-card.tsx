// Phase 6.0D-A — Unified Production Coach Operations Surface.
//
// The one shared card rendering a real Supabase escalation's full context
// and available actions — factored out of app/coach/escalations/page.tsx so
// app/coach/page.tsx's "Needs Your Attention" section and the full
// escalations list render the exact same presentation, restyled onto the
// established design tokens (text-label/text-meta/text-body, SectionHeader-
// consistent spacing) instead of ad hoc opacity-based grays. A Server
// Component — every action prop is a real bound Server Action the caller
// constructs per-item (see either page for exactly how), never invented or
// re-derived here.
//
// Truthful attribution stays structural, not a styling choice: this card
// only ever shows what the client said, what OPTIM proposed, and what YOU
// (the coach) can do about it — never a label implying OPTIM already acted
// as the coach.

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SupabaseHealthReviewDecisionCard } from "@/components/coach/supabase-health-review-decision-card";
import type { AttentionItem } from "@/lib/production/coach-operations";
import type { ConversationMessageView } from "@/lib/production/chat";
import { coachThreadLifecycle } from "@/lib/communications/types";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

export interface EscalationCardActions {
  approve?: () => Promise<void>;
  editAndSend?: (formData: FormData) => Promise<void>;
  respondPersonally?: (formData: FormData) => Promise<void>;
  resolveThread?: () => Promise<void>;
  resolveSilently?: () => Promise<void>;
  proposeExample?: (formData: FormData) => Promise<void>;
}

export interface EscalationHealthReview {
  clientFirstName: string;
  record: HealthReviewRecord;
  clientReportedDetail?: string | null;
  onResolve: (status: HealthReviewStatus, documentedLimitations?: string) => Promise<void>;
}

export function EscalationCard({
  item,
  threadMessages = [],
  actions,
  healthReview,
}: {
  item: AttentionItem;
  threadMessages?: ConversationMessageView[];
  actions: EscalationCardActions;
  /** Phase 7B — present only for a pain_or_safety item, rendering the
   * coach's real health-review decision surface inside this SAME card
   * (never a separate injury dashboard — spec section 15). */
  healthReview?: EscalationHealthReview;
}) {
  const lifecycle = item.escalationStatus ? coachThreadLifecycle(item.escalationStatus) : "unopened";
  const statusLabel = (item.escalationStatus ?? item.status).replaceAll("_", " ");

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-label text-neutral">{item.kindLabel}</span>
        <span className="text-meta text-neutral">{item.clientDisplayName}</span>
        <span className="text-meta text-neutral">{new Date(item.createdAtIso).toLocaleString()}</span>
        <span className="ml-auto text-label text-neutral">{statusLabel}</span>
      </div>

      {item.sourceMessageBody && (
        <div className="mb-3">
          <p className="text-label text-neutral">What they said</p>
          <p className="mt-1 whitespace-pre-wrap text-body text-off-white">{item.sourceMessageBody}</p>
        </div>
      )}

      {item.proposedResponse && (
        <div className="mb-3">
          <p className="text-label text-neutral">What OPTIM said / proposes</p>
          <p className="mt-1 whitespace-pre-wrap text-body text-neutral">{item.proposedResponse}</p>
        </div>
      )}

      {healthReview && (
        <div className="mb-3">
          <SupabaseHealthReviewDecisionCard
            clientFirstName={healthReview.clientFirstName}
            healthReview={healthReview.record}
            clientReportedDetail={healthReview.clientReportedDetail}
            onResolve={healthReview.onResolve}
          />
        </div>
      )}

      {lifecycle === "open" && (
        <div className="mb-3 rounded-[var(--radius-md)] border border-border-strong p-3">
          <p className="text-label text-neutral">Temporary thread with {item.clientDisplayName} — open</p>
          <div className="mt-2 space-y-2">
            {threadMessages.length === 0 && <p className="text-meta text-neutral">No messages yet.</p>}
            {threadMessages.map((message) => (
              <p key={message.id} className="text-body text-off-white">
                <span className="text-label text-neutral">{message.actorType === "coach" ? "You" : item.clientDisplayName}: </span>
                {message.body}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {lifecycle !== "open" && item.proposedResponse && actions.approve && (
          <form action={actions.approve}>
            <Button type="submit" variant="secondary" size="sm">
              Approve OPTIM&apos;s response as-is
            </Button>
          </form>
        )}

        {lifecycle !== "open" && actions.editAndSend && (
          <form action={actions.editAndSend} className="flex flex-col gap-2">
            <textarea
              name="editedBody"
              rows={2}
              placeholder="Edit OPTIM's response and send it as your own…"
              defaultValue={item.proposedResponse ?? ""}
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-body text-off-white outline-none focus-visible:border-accent"
            />
            <Button type="submit" variant="secondary" size="sm">
              Send as my own edit
            </Button>
          </form>
        )}

        {actions.respondPersonally && (
          <form action={actions.respondPersonally} className="flex flex-col gap-2">
            <textarea
              name="personalBody"
              rows={2}
              placeholder={lifecycle === "open" ? "Reply in the thread…" : "Respond personally — this opens a temporary two-way thread…"}
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-body text-off-white outline-none focus-visible:border-accent"
            />
            <Button type="submit" variant="primary" size="sm">
              {lifecycle === "open" ? "Send reply" : "Respond personally"}
            </Button>
          </form>
        )}

        {lifecycle === "open"
          ? actions.resolveThread && (
              <form action={actions.resolveThread}>
                <Button type="submit" variant="secondary" size="sm">
                  Resolve &amp; close thread
                </Button>
              </form>
            )
          : actions.resolveSilently && (
              <form action={actions.resolveSilently}>
                <Button type="submit" variant="secondary" size="sm">
                  Resolve without messaging
                </Button>
              </form>
            )}

        {actions.proposeExample && (
          <form action={actions.proposeExample} className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-label text-neutral">Teach OPTIM from this (creates a DRAFT Playbook version — nothing changes until you approve it)</p>
            <input
              type="text"
              name="resolution"
              placeholder="How you want this handled next time…"
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-body text-off-white outline-none focus-visible:border-accent"
            />
            <Button type="submit" variant="secondary" size="sm">
              Propose as Playbook example
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
