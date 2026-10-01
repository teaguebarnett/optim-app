// Gate 2 refinement — the coach dashboard's opened decision for its focus
// escalation. Same data, same bound Server Actions, same gating as
// EscalationCard (which /coach/escalations keeps using unchanged); only the
// presentation differs, because on the dashboard the navy briefing directly
// above already shows who, what happened, why it matters, and the client's
// own words. So this panel never repeats them, never shows raw record
// metadata (timestamps, status enums), and orders the work the way a coach
// decides it:
//
//   1. Training decision — pain/safety only; the existing health-review
//      statuses (still blocked vs. clear to proceed), unchanged semantics.
//   2. Reply — OPTIM's draft, clearly labelled as OPTIM's, with ONE primary
//      action (approve and send as-is); editing, replying personally, and
//      closing without a reply are secondary.
//   3. Teach OPTIM — collapsed, after the decision; creates only a draft.
//
// Authority is unchanged: approve/edit/respond only exist when the caller
// passed them (app/coach/page.tsx gates them on a real source message, so a
// recorded pain summary can never be "sent" as a reply).

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupabaseHealthReviewDecisionCard } from "@/components/coach/supabase-health-review-decision-card";
import type { EscalationCardActions, EscalationHealthReview } from "@/components/coach/escalation-card";
import type { AttentionItem } from "@/lib/production/coach-operations";
import type { ConversationMessageView } from "@/lib/production/chat";
import { coachThreadLifecycle } from "@/lib/communications/types";
import { firstNameOf } from "@/lib/coach/dashboard-zones";

const TEXTAREA = "w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-body text-off-white outline-none focus-visible:border-accent";
const DISCLOSURE_SUMMARY =
  "flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-action text-accent-fg [&::-webkit-details-marker]:hidden";

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="px-5 py-5 sm:px-6">
      <div className="flex items-baseline gap-2.5">
        <span className="flex h-5 w-5 shrink-0 translate-y-[-1px] items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold tabular-nums text-neutral" aria-hidden="true">
          {n}
        </span>
        <h4 className="text-subheading text-off-white">{title}</h4>
      </div>
      {note ? <p className="mt-1 pl-[30px] text-meta text-neutral">{note}</p> : null}
      <div className="mt-3 sm:pl-[30px]">{children}</div>
    </section>
  );
}

function Disclosure({ label, quiet = false, children }: { label: string; quiet?: boolean; children: ReactNode }) {
  return (
    <details className="group">
      <summary className={`${DISCLOSURE_SUMMARY} ${quiet ? "text-neutral! font-medium hover:text-off-white!" : ""}`}>
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
        {label}
      </summary>
      <div className="pb-2 pt-1">{children}</div>
    </details>
  );
}

export function EscalationDecisionPanel({
  item,
  threadMessages = [],
  actions,
  healthReview,
}: {
  item: AttentionItem;
  threadMessages?: ConversationMessageView[];
  actions: EscalationCardActions;
  healthReview?: EscalationHealthReview;
}) {
  const first = firstNameOf(item.clientDisplayName);
  const lifecycle = item.escalationStatus ? coachThreadLifecycle(item.escalationStatus) : "unopened";
  let step = 0;

  return (
    <div className="divide-y divide-border">
      {healthReview ? (
        <Step n={++step} title="Training decision" note="OPTIM won’t program around this until you choose an outcome under “Clear to proceed.” This isn’t a diagnosis.">
          <SupabaseHealthReviewDecisionCard
            variant="inline"
            clientFirstName={healthReview.clientFirstName}
            healthReview={healthReview.record}
            clientReportedDetail={healthReview.clientReportedDetail}
            onResolve={healthReview.onResolve}
          />
        </Step>
      ) : null}

      {lifecycle === "open" ? (
        <Step n={++step} title={`Conversation with ${first}`} note="Open until you close it. OPTIM stays out of it meanwhile.">
          <div className="space-y-2">
            {threadMessages.length === 0 ? <p className="text-meta text-neutral">No messages yet.</p> : null}
            {threadMessages.map((message) => (
              <p key={message.id} className="text-body text-off-white">
                <span className="font-semibold">{message.actorType === "coach" ? "You" : first}: </span>
                {message.body}
              </p>
            ))}
          </div>
          {actions.respondPersonally ? (
            <form action={actions.respondPersonally} className="mt-3 flex flex-col gap-2">
              <textarea name="personalBody" rows={2} placeholder={`Reply to ${first}…`} className={TEXTAREA} aria-label={`Reply to ${first}`} />
              <Button type="submit" variant="primary" className="self-start">
                Send reply
              </Button>
            </form>
          ) : null}
          {actions.resolveThread ? (
            <form action={actions.resolveThread} className="mt-2">
              <Button type="submit" variant="ghost" size="sm" className="-ml-3 min-h-11 sm:min-h-0">
                Close conversation
              </Button>
            </form>
          ) : null}
        </Step>
      ) : actions.approve || actions.editAndSend || actions.respondPersonally ? (
        <Step n={++step} title={`Reply to ${first}`} note="Sending a reply closes this item.">
          {item.proposedResponse ? (
            <div className="rounded-[var(--radius-sm)] bg-surface-raised px-3.5 py-3">
              <p className="text-meta font-semibold text-neutral">OPTIM’s draft reply</p>
              <p className="mt-1 whitespace-pre-wrap text-body text-off-white">{item.proposedResponse}</p>
            </div>
          ) : null}
          {item.proposedResponse && actions.approve ? (
            <form action={actions.approve} className="mt-3">
              <Button type="submit" variant="primary">
                Approve and send
              </Button>
            </form>
          ) : null}
          <div className="mt-2">
            {actions.editAndSend && item.proposedResponse ? (
              <Disclosure label="Edit before sending">
                <form action={actions.editAndSend} className="flex flex-col gap-2">
                  <textarea name="editedBody" rows={3} defaultValue={item.proposedResponse ?? ""} className={TEXTAREA} aria-label="Edited reply" />
                  <p className="text-meta text-neutral">Sent as your own message.</p>
                  <Button type="submit" variant="secondary" size="sm" className="min-h-11 self-start sm:min-h-9">
                    Send my edited reply
                  </Button>
                </form>
              </Disclosure>
            ) : null}
            {actions.respondPersonally ? (
              <Disclosure label="Reply personally instead">
                <form action={actions.respondPersonally} className="flex flex-col gap-2">
                  <textarea name="personalBody" rows={3} placeholder={`Write to ${first}…`} className={TEXTAREA} aria-label={`Personal reply to ${first}`} />
                  <p className="text-meta text-neutral">Opens a temporary two-way conversation with {first}.</p>
                  <Button type="submit" variant="secondary" size="sm" className="min-h-11 self-start sm:min-h-9">
                    Send and open conversation
                  </Button>
                </form>
              </Disclosure>
            ) : null}
          </div>
          {actions.resolveSilently ? (
            <form action={actions.resolveSilently} className="mt-1 border-t border-border pt-2">
              <Button type="submit" variant="ghost" size="sm" className="-ml-3 min-h-11 text-neutral sm:min-h-0">
                Close without replying
              </Button>
            </form>
          ) : null}
        </Step>
      ) : actions.resolveSilently ? (
        <Step n={++step} title="Close this item" note={`This came from ${first}’s report, not a chat message, so there’s no reply to send.`}>
          <form action={actions.resolveSilently}>
            <Button type="submit" variant="secondary">
              Close without messaging
            </Button>
          </form>
        </Step>
      ) : null}

      {actions.proposeExample ? (
        <div className="px-5 py-1 sm:px-6">
          <Disclosure label="Teach OPTIM how to handle this next time" quiet>
            <form action={actions.proposeExample} className="flex flex-col gap-2 sm:pl-5">
              <input type="text" name="resolution" placeholder="How you want this handled next time…" className={`${TEXTAREA} min-h-11`} aria-label="How you want this handled next time" />
              <p className="text-meta text-neutral">Creates a draft Playbook example. Nothing changes until you approve it.</p>
              <Button type="submit" variant="secondary" size="sm" className="min-h-11 self-start sm:min-h-9">
                Propose as Playbook example
              </Button>
            </form>
          </Disclosure>
        </div>
      ) : null}
    </div>
  );
}
