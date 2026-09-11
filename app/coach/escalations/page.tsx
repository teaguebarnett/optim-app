// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The Supabase-mode "Needs your attention" surface for real, persisted
// escalations.
//
// A deliberate judgment call, documented here rather than buried: the
// existing coach dashboard queue (app/coach/reviews, components/coach/
// review-queue-list.tsx, lib/coach/attention-queue.ts) is built entirely on
// the demo prototype's localStorage-backed PlatformState/ReviewRequest
// records through hooks/use-coach-data.ts. It has no Supabase data path at
// all — Phase 6.0B left every coach-side Supabase surface as a focused
// proof page for exactly this reason. Wiring server-persisted escalations
// into a client-side localStorage queue would mean porting that whole
// subsystem, which Part 7 explicitly forbids in this phase. So this page is
// the Supabase-mode counterpart of that queue, NOT a parallel inbox for the
// same records: it reuses the queue's own safety-first ordering (see
// ESCALATION_PRIORITY in lib/production/chat.ts, derived from
// lib/coach/attention-queue.ts's ATTENTION_PRIORITY), and in demo mode it
// does not exist at all (404) so there is never a dead or duplicate
// surface. Unifying the two queues behind one repository is the natural
// first task of the next phase.
//
// Routine OPTIM conversation never appears here — only real escalation
// rows do, and those are only ever created by lib/production/chat.ts.

import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveAppMode } from "@/lib/production/mode";
import { coachThreadLifecycle } from "@/lib/communications/types";
import {
  getCoachEscalationInboxAction,
  getCoachThreadMessagesAction,
  approveEscalationResponseAction,
  editAndSendEscalationResponseAction,
  respondPersonallyAction,
  resolveCoachThreadAction,
  resolveEscalationWithoutMessagingAction,
  proposePlaybookExampleAction,
} from "@/app/actions/coach-communications";

const REASON_LABELS: Record<string, string> = {
  pain_or_safety: "Pain / safety",
  plan_change: "Plan change",
  out_of_authority: "Outside OPTIM's authority",
  unresolved_uncertainty: "Unresolved uncertainty",
  conflicting_information: "Conflicting information",
  adherence_or_sensitive: "Adherence / sensitive",
  explicit_request: "Client asked for you",
};

export default async function CoachEscalationsPage() {
  if (resolveAppMode() !== "supabase") {
    // Demo mode has its own (localStorage-backed) attention queue at
    // /coach/reviews — this surface only exists against real persistence.
    notFound();
  }

  const inbox = await getCoachEscalationInboxAction();

  const threads = await Promise.all(
    inbox.open.map(async (escalation) => ({
      escalationId: escalation.id,
      messages:
        coachThreadLifecycle(escalation.status) === "open"
          ? await getCoachThreadMessagesAction({ workspaceId: inbox.workspaceId, escalationId: escalation.id })
          : [],
    }))
  );
  const threadFor = (id: string) => threads.find((t) => t.escalationId === id)?.messages ?? [];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <Link href="/coach" className="text-sm text-off-white/60 hover:text-off-white">
        ← Coach
      </Link>
      <h1 className="text-xl font-semibold text-off-white">Needs your attention</h1>
      <p className="text-sm text-off-white/60">
        Real escalations OPTIM raised from client chat. Routine conversation never lands here — only a genuine safety concern, a meaningful plan
        change, something outside OPTIM&apos;s authority, unresolved uncertainty, a sensitive concern, or a client explicitly asking for you.
      </p>

      {inbox.open.length === 0 && (
        <Card>
          <p className="text-sm text-off-white/60">Nothing waiting on you — OPTIM is handling the routine conversation.</p>
        </Card>
      )}

      {inbox.open.map((escalation) => {
        const lifecycle = coachThreadLifecycle(escalation.status);
        const threadMessages = threadFor(escalation.id);

        async function approve() {
          "use server";
          await approveEscalationResponseAction({ workspaceId: inbox.workspaceId, escalationId: escalation.id });
        }
        async function editAndSend(formData: FormData) {
          "use server";
          const editedBody = String(formData.get("editedBody") ?? "").trim();
          if (!editedBody) return;
          await editAndSendEscalationResponseAction({ workspaceId: inbox.workspaceId, escalationId: escalation.id, editedBody });
        }
        async function respondPersonally(formData: FormData) {
          "use server";
          const body = String(formData.get("personalBody") ?? "").trim();
          if (!body) return;
          await respondPersonallyAction({ workspaceId: inbox.workspaceId, escalationId: escalation.id, body });
        }
        async function resolveThread() {
          "use server";
          await resolveCoachThreadAction({ workspaceId: inbox.workspaceId, escalationId: escalation.id });
        }
        async function resolveSilently() {
          "use server";
          await resolveEscalationWithoutMessagingAction({ workspaceId: inbox.workspaceId, escalationId: escalation.id });
        }
        async function proposeExample(formData: FormData) {
          "use server";
          const resolution = String(formData.get("resolution") ?? "").trim();
          if (!resolution) return;
          await proposePlaybookExampleAction({
            escalationId: escalation.id,
            situation: escalation.sourceMessageBody ?? REASON_LABELS[escalation.reasonCategory] ?? escalation.reasonCategory,
            resolution,
          });
        }

        return (
          <Card key={escalation.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[11px] uppercase tracking-wide text-off-white/70">
                {REASON_LABELS[escalation.reasonCategory] ?? escalation.reasonCategory}
              </span>
              <span className="text-xs text-off-white/60">{escalation.clientDisplayName}</span>
              <span className="text-xs text-off-white/40">{new Date(escalation.createdAtIso).toLocaleString()}</span>
              <span className="ml-auto text-[11px] uppercase tracking-wide text-off-white/50">{escalation.status.replaceAll("_", " ")}</span>
            </div>

            {escalation.sourceMessageBody && (
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-wide text-off-white/50">What they said</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-off-white">{escalation.sourceMessageBody}</p>
              </div>
            )}

            {escalation.proposedResponse && (
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-wide text-off-white/50">What OPTIM said / proposes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-off-white/80">{escalation.proposedResponse}</p>
              </div>
            )}

            {lifecycle === "open" && (
              <div className="mb-3 rounded border border-border-strong p-3">
                <p className="text-[11px] uppercase tracking-wide text-off-white/50">
                  Temporary thread with {escalation.clientDisplayName} — open
                </p>
                <div className="mt-2 space-y-2">
                  {threadMessages.length === 0 && <p className="text-xs text-off-white/50">No messages yet.</p>}
                  {threadMessages.map((message) => (
                    <p key={message.id} className="text-sm text-off-white/80">
                      <span className="text-[11px] uppercase tracking-wide text-off-white/50">
                        {message.actorType === "coach" ? "You" : escalation.clientDisplayName}:{" "}
                      </span>
                      {message.body}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {lifecycle !== "open" && escalation.proposedResponse && (
                <form action={approve}>
                  <Button type="submit" variant="secondary" size="sm">
                    Approve OPTIM&apos;s response as-is
                  </Button>
                </form>
              )}

              {lifecycle !== "open" && (
                <form action={editAndSend} className="flex flex-col gap-2">
                  <textarea
                    name="editedBody"
                    rows={2}
                    placeholder="Edit OPTIM's response and send it as your own…"
                    defaultValue={escalation.proposedResponse ?? ""}
                    className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Send as my own edit
                  </Button>
                </form>
              )}

              <form action={respondPersonally} className="flex flex-col gap-2">
                <textarea
                  name="personalBody"
                  rows={2}
                  placeholder={lifecycle === "open" ? "Reply in the thread…" : "Respond personally — this opens a temporary two-way thread…"}
                  className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white"
                />
                <Button type="submit" variant="primary" size="sm">
                  {lifecycle === "open" ? "Send reply" : "Respond personally"}
                </Button>
              </form>

              {lifecycle === "open" ? (
                <form action={resolveThread}>
                  <Button type="submit" variant="secondary" size="sm">
                    Resolve &amp; close thread
                  </Button>
                </form>
              ) : (
                <form action={resolveSilently}>
                  <Button type="submit" variant="secondary" size="sm">
                    Resolve without messaging
                  </Button>
                </form>
              )}

              <form action={proposeExample} className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-[11px] uppercase tracking-wide text-off-white/50">
                  Teach OPTIM from this (creates a DRAFT Playbook version — nothing changes until you approve it)
                </p>
                <input
                  type="text"
                  name="resolution"
                  placeholder="How you want this handled next time…"
                  className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Propose as Playbook example
                </Button>
              </form>
            </div>
          </Card>
        );
      })}

      {inbox.resolved.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-medium text-off-white">Resolved</h2>
          <ul className="space-y-1">
            {inbox.resolved.slice(0, 10).map((escalation) => (
              <li key={escalation.id} className="text-xs text-off-white/60">
                {escalation.clientDisplayName} — {REASON_LABELS[escalation.reasonCategory] ?? escalation.reasonCategory} ·{" "}
                {new Date(escalation.createdAtIso).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
