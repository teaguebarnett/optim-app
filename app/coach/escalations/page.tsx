// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
// Phase 6.0D-A — restyled onto the shared EscalationCard component and the
// established design tokens so this reads as the SAME product as /coach,
// not a bolted-on proof page — see that page's own doc. Still the full
// open+resolved history (mirroring the demo dashboard's own /coach/reviews
// "full queue" page), reached from /coach's "Needs Your Attention" section
// and a real nav link (see components/coach/coach-shell.tsx), never a
// hidden URL-only surface. In demo mode it does not exist at all (404) —
// demo has its own equivalent at /coach/reviews.
//
// Routine OPTIM conversation never appears here — only real escalation
// rows do, and those are only ever created by lib/production/chat.ts.

import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/coach/section-header";
import { EscalationCard } from "@/components/coach/escalation-card";
import { resolveAppMode } from "@/lib/production/mode";
import { getCoachOperationsRepository } from "@/lib/production/coach-operations";
import {
  getCoachThreadMessagesAction,
  approveEscalationResponseAction,
  editAndSendEscalationResponseAction,
  respondPersonallyAction,
  resolveCoachThreadAction,
  resolveEscalationWithoutMessagingAction,
  proposePlaybookExampleAction,
} from "@/app/actions/coach-communications";

export default async function CoachEscalationsPage() {
  if (resolveAppMode() !== "supabase") {
    // Demo mode has its own (localStorage-backed) attention queue at
    // /coach/reviews — this surface only exists against real persistence.
    notFound();
  }

  const inbox = await getCoachOperationsRepository().getAttentionInbox();
  const { workspaceId } = inbox;

  const threads = await Promise.all(
    inbox.open.filter((item) => item.hasOpenCoachThread).map(async (item) => ({ id: item.id, messages: await getCoachThreadMessagesAction({ workspaceId, escalationId: item.id }) }))
  );
  const threadFor = (id: string) => threads.find((t) => t.id === id)?.messages ?? [];

  // Phase 7A — see app/coach/page.tsx's identical actionsFor for why these
  // three are gated on hasSourceMessage: a pain_or_safety escalation with
  // no originating chat message must never let a coach "send" its recorded
  // summary text to the client as if it were a chat reply.
  function actionsFor(escalationId: string, hasSourceMessage: boolean) {
    async function approve() {
      "use server";
      await approveEscalationResponseAction({ workspaceId, escalationId });
    }
    async function editAndSend(formData: FormData) {
      "use server";
      const editedBody = String(formData.get("editedBody") ?? "").trim();
      if (!editedBody) return;
      await editAndSendEscalationResponseAction({ workspaceId, escalationId, editedBody });
    }
    async function respondPersonally(formData: FormData) {
      "use server";
      const body = String(formData.get("personalBody") ?? "").trim();
      if (!body) return;
      await respondPersonallyAction({ workspaceId, escalationId, body });
    }
    async function resolveThread() {
      "use server";
      await resolveCoachThreadAction({ workspaceId, escalationId });
    }
    async function resolveSilently() {
      "use server";
      await resolveEscalationWithoutMessagingAction({ workspaceId, escalationId });
    }
    async function proposeExample(formData: FormData) {
      "use server";
      const resolution = String(formData.get("resolution") ?? "").trim();
      if (!resolution) return;
      const item = inbox.open.find((i) => i.id === escalationId);
      await proposePlaybookExampleAction({ escalationId, situation: item?.summary ?? "Client message", resolution });
    }
    return {
      approve: hasSourceMessage ? approve : undefined,
      editAndSend: hasSourceMessage ? editAndSend : undefined,
      respondPersonally: hasSourceMessage ? respondPersonally : undefined,
      resolveThread,
      resolveSilently,
      proposeExample,
    };
  }

  return (
    <div className="mx-auto w-full max-w-[800px] space-y-6">
      <div>
        <h1 className="text-heading text-off-white">Escalations</h1>
        <p className="mt-1 text-body text-neutral">
          Real escalations OPTIM raised from client chat. Routine conversation never lands here — only a genuine safety concern, a meaningful plan
          change, something outside OPTIM&apos;s authority, unresolved uncertainty, a sensitive concern, or a client explicitly asking for you.
        </p>
      </div>

      <section className="space-y-4">
        <SectionHeader title="Open" />
        {inbox.open.length === 0 ? (
          <Card className="flex items-center gap-2.5 py-4">
            <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden="true" />
            <p className="text-body text-neutral">Nothing waiting on you — OPTIM is handling the routine conversation.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {inbox.open.map((item) => (
              <EscalationCard key={item.id} item={item} threadMessages={threadFor(item.id)} actions={actionsFor(item.id, item.sourceMessageBody !== null)} />
            ))}
          </div>
        )}
      </section>

      {inbox.resolved.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Resolved" />
          <Card className="divide-y divide-border p-0">
            {inbox.resolved.slice(0, 20).map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-label text-neutral">{item.kindLabel}</span>
                <p className="min-w-0 flex-1 truncate text-body text-off-white">{item.clientDisplayName}</p>
                <span className="shrink-0 text-meta text-neutral">{new Date(item.createdAtIso).toLocaleDateString()}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
