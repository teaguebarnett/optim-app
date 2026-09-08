"use client";

import { useState } from "react";
import { ChevronLeft, MessageSquare, Send } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/progress/status-badge";
import { PageHeader } from "@/components/coach/page-header";
import { EmptyState } from "@/components/coach/empty-state";
import { MessageBubble } from "@/components/chat/message-bubble";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { getClientLifecycle, getOnboardingProgress } from "@/lib/coach/repository";
import { sendCoachMessage } from "@/lib/coach/coach-messaging";
import { ONBOARDING_STEPS } from "@/lib/coach/onboarding-steps";
import { describePrimaryGoal, NOT_PROVIDED } from "@/lib/coach/onboarding-format";
import { cn } from "@/lib/cn";
import type { ClientProfileId } from "@/lib/tenancy/types";

const SENDER_PREFIX: Record<string, string> = {
  client: "",
  coach: "You: ",
  assistant: "OPTIM: ",
};

/**
 * A real master-detail messaging layout — a conversation list and the
 * active conversation side by side on desktop, never a narrow stack
 * floating in unused space. Selecting a row updates the detail pane in
 * place; it never navigates away from Messages. On mobile, selecting a
 * conversation replaces the list with the detail view (a real list-to-
 * conversation transition, not both panes squeezed together). Chat itself
 * stays exactly where it already lives — one continuous client<->coach
 * thread (see app/(client)/chat) — this reads and can append to that same
 * real data (see lib/coach/coach-messaging.ts), never a separate messaging
 * system.
 */
export default function CoachMessagesPage() {
  const workspace = useCoachWorkspace();
  const [selectedClientId, setSelectedClientId] = useState<ClientProfileId | null>(null);
  const [draft, setDraft] = useState("");
  const [, forceRerender] = useState(0);

  const rows = workspace.clients
    .map((client) => {
      const messages = workspace.clientAppStates.get(client.id)?.chatMessages ?? [];
      const last = messages[messages.length - 1] ?? null;
      const flagged = workspace.attentionQueue.some((item) => item.clientId === client.id);
      return { client, last, flagged };
    })
    .sort((a, b) => {
      if (!a.last && !b.last) return a.client.name.localeCompare(b.client.name);
      if (!a.last) return 1;
      if (!b.last) return -1;
      return new Date(b.last.createdAtIso).getTime() - new Date(a.last.createdAtIso).getTime();
    });

  const selectedRow = rows.find((r) => r.client.id === selectedClientId) ?? null;
  const selectedMessages = selectedClientId ? (workspace.clientAppStates.get(selectedClientId)?.chatMessages ?? []) : [];
  const selectedLifecycle = selectedClientId ? getClientLifecycle(workspace.platform, selectedClientId) : null;
  // Phase 5.6A.4 — the real submitted primary goal, same source
  // client-workspace.tsx's header now reads — never the stale `client.goal`
  // field (see components/coach/client-workspace.tsx's comment for why).
  const selectedGoals = selectedClientId ? getOnboardingProgress(workspace.platform, selectedClientId)?.answers.what_you_want : undefined;
  const selectedGoalLabel = selectedGoals ? describePrimaryGoal(ONBOARDING_STEPS, selectedGoals) : NOT_PROVIDED;
  const coachOverride = workspace.activeContext.coachProfile
    ? { displayName: workspace.activeContext.coachProfile.displayName, avatarInitials: workspace.activeContext.coachProfile.avatarInitials }
    : null;

  function handleSend() {
    if (!selectedClientId || !workspace.coachId || !draft.trim()) return;
    const sent = sendCoachMessage(selectedClientId, workspace.workspaceId, workspace.coachId, draft, new Date().toISOString());
    if (sent) {
      setDraft("");
      forceRerender((n) => n + 1);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Every client conversation, in one place." />

      {rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations yet" description="Client conversations will appear here once they start chatting." />
      ) : (
        <div className="grid gap-0 overflow-hidden rounded-[var(--radius-lg)] border border-border md:grid-cols-[320px_minmax(0,1fr)] md:h-[calc(100vh-220px)]">
          {/* Conversation list. */}
          <div className={cn("divide-y divide-border overflow-y-auto bg-charcoal md:block md:border-r md:border-border", selectedClientId ? "hidden" : "block")}>
            {rows.map(({ client, last, flagged }) => {
              const active = client.id === selectedClientId;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setSelectedClientId(client.id)}
                  className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors", active ? "bg-selected-bg" : "hover:bg-surface-raised")}
                  style={{ transitionDuration: "var(--motion-fast)" }}
                >
                  <Avatar initials={client.avatarInitials} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("truncate text-sm font-semibold", active ? "text-accent-strong" : "text-off-white")}>{client.name}</p>
                      {flagged ? <StatusBadge label="Flagged" tone="error" /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-neutral">{last ? `${SENDER_PREFIX[last.sender] ?? ""}${last.text || "(attachment)"}` : "No messages yet."}</p>
                  </div>
                  {last ? (
                    <span className="shrink-0 text-meta text-neutral">{new Date(last.createdAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Active conversation. */}
          <div className={cn("flex min-w-0 flex-col bg-near-black md:flex", selectedClientId ? "flex" : "hidden")}>
            {selectedRow && selectedClientId ? (
              <>
                <div className="flex items-center gap-3 border-b border-border bg-charcoal px-4 py-3">
                  <button type="button" onClick={() => setSelectedClientId(null)} className="text-neutral md:hidden" aria-label="Back to conversations">
                    <ChevronLeft size={20} aria-hidden="true" />
                  </button>
                  <Avatar initials={selectedRow.client.avatarInitials} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-off-white">{selectedRow.client.name}</p>
                    <p className="text-meta text-neutral">{selectedGoalLabel}</p>
                  </div>
                  {selectedLifecycle ? <LifecycleBadge lifecycle={selectedLifecycle} className="shrink-0" /> : null}
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto p-4">
                  {selectedMessages.length === 0 ? (
                    <p className="text-sm text-neutral">No messages yet.</p>
                  ) : (
                    selectedMessages.map((message) => (
                      <MessageBubble key={message.id} message={message} coachOverride={coachOverride} clientAvatarInitialsOverride={selectedRow.client.avatarInitials} />
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-border bg-charcoal p-3">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    placeholder={`Message ${selectedRow.client.name.split(" ")[0]}…`}
                    className="h-11 flex-1 rounded-[var(--radius-md)] border border-border-strong bg-surface-input px-3.5 text-[15px] text-off-white outline-none placeholder:text-neutral focus-visible:border-accent"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim()}
                    aria-label="Send message"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-opacity disabled:opacity-40"
                  >
                    <Send size={17} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a client from the list to see their messages." />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
