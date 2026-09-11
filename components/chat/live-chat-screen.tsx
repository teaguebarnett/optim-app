"use client";

// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The Supabase-mode client chat surface. Deliberately self-contained rather
// than reusing components/chat/message-bubble.tsx: that component reads the
// demo prototype's localStorage state (usePrototypeState) and speaks the
// demo ChatMessage shape, which has no place in a real, server-persisted
// conversation. It uses the same design tokens, so the two modes look like
// one product without sharing demo-only state.
//
// Everything it knows comes from app/actions/chat.ts — it never imports a
// Supabase client, never sees a workspace id, and never decides anything
// about routing or escalation itself. In particular the "your coach has
// this" chip is rendered from the action's `escalationCreated` boolean,
// which is true only when a real escalation row persisted — never inferred
// from the assistant's words.

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { getMyChatScreenStateAction, sendMyChatMessageAction, type MyChatScreenState } from "@/app/actions/chat";
import { cn } from "@/lib/cn";
import type { ConversationMessageView } from "@/lib/production/chat";

/** Free-form starters, not an intent whitelist. Tapping one sends its exact
 * text through sendMyChatMessageAction — the same single path a typed
 * message takes — so a chip can never reach a capability typing cannot. */
const STARTERS = [
  "What does RPE 8 mean?",
  "What's my session today?",
  "Can I use turkey instead of chicken?",
  "I'm going to miss today's workout",
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function MessageRow({ message, coachDisplayName }: { message: ConversationMessageView; coachDisplayName: string }) {
  const isClient = message.actorType === "client";
  const isSystem = message.actorType === "system";

  if (isSystem) {
    return (
      <p className="py-2 text-center text-xs text-neutral">{message.body}</p>
    );
  }

  const authorLabel = message.actorType === "assistant" ? "OPTIM" : message.actorType === "coach" ? coachDisplayName : null;

  return (
    <div className={cn("flex w-full py-1.5", isClient ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-1", isClient && "items-end text-right")}>
        {authorLabel && (
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral">
            {message.actorType === "assistant" && <Sparkles className="size-3" aria-hidden />}
            {authorLabel}
          </p>
        )}
        <div
          className={cn(
            "whitespace-pre-wrap rounded-[var(--radius-md)] px-3.5 py-2.5 text-[15px] leading-relaxed",
            isClient ? "bg-accent text-white" : "bg-surface text-off-white"
          )}
        >
          {message.body}
        </div>
        <p className="text-[11px] text-neutral">{formatTime(message.createdAtIso)}</p>
      </div>
    </div>
  );
}

export function LiveChatScreen() {
  const [state, setState] = useState<MyChatScreenState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setState(await getMyChatScreenStateAction());
      setLoadError(null);
    } catch (err) {
      // An honest error state — never demo content, never a fabricated
      // conversation. See lib/production/mode.ts's "the one fallback this
      // codebase refuses to have."
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    // Initial fetch of server-persisted chat state on mount — setState only
    // runs after the awaited server action resolves, never synchronously
    // during this effect's own execution. There is no Server Component data
    // source to read this from instead: the screen must reflect the
    // authenticated caller's own live conversation, which can change from
    // outside this component's control (a coach's reply, an escalation
    // resolving) and needs the same re-fetch path `load` already provides
    // to handleSend below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state?.messages.length]);

  async function handleSend(text: string) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      const result = await sendMyChatMessageAction(text);
      if (result.kind === "rejected") {
        setNotice({ tone: "warn", text: result.reason });
        return;
      }
      if (result.providerFailure) {
        setNotice({ tone: "warn", text: "OPTIM couldn't answer just now. Your message was saved and nothing was sent to your coach." });
      } else if (result.escalationPersistenceFailed) {
        setNotice({ tone: "warn", text: "This needed your coach, but it couldn't be filed. Nothing was sent — please try again." });
      } else if (result.escalationCreated) {
        setNotice({ tone: "info", text: "Your coach now has this and will follow up here." });
      }
      // Re-read from the server rather than optimistically splicing: routing
      // may have changed (an escalation can open a coach thread) and the
      // server's own state is the only truthful source for that.
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err instanceof Error ? err.message : "Something went wrong sending that message." });
    } finally {
      setPending(false);
    }
  }

  if (loadError) {
    return (
      <div className="px-4 py-8">
        <div className="rounded-[var(--radius-md)] border border-border-strong bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-off-white">
            <AlertTriangle className="size-4" aria-hidden /> Chat is unavailable
          </p>
          <p className="mt-2 text-sm text-neutral">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!state) return <ScreenSkeleton />;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-off-white">{state.isCoachThread ? state.coachThreadLabel : "OPTIM Assistant"}</p>
        <p className="mt-0.5 text-xs text-neutral">
          {state.isCoachThread
            ? `You're talking with ${state.coachDisplayName} directly. This thread closes once it's resolved, and you'll be back with OPTIM.`
            : `Trained on ${state.coachDisplayName}'s coaching. Anything that needs ${state.coachDisplayName} personally gets passed to them.`}
        </p>
      </div>

      {(state.coachNotes.length > 0 || state.campaignMessages.length > 0) && (
        <div className="space-y-2 border-b border-border px-4 py-3">
          {state.coachNotes.map((note) => (
            <div key={note.id} className="rounded-[var(--radius-md)] border border-border-strong bg-surface p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral">Note from {state.coachDisplayName}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-off-white">{note.body}</p>
            </div>
          ))}
          {state.campaignMessages.map((message) => (
            <div key={message.id} className="rounded-[var(--radius-md)] border border-border-strong bg-surface p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral">
                {message.title} · from {message.coachDisplayName}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-off-white">{message.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1 px-4 py-3">
        {state.messages.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral">
            Ask OPTIM anything about your training, nutrition, or how you&apos;re tracking.
          </p>
        )}
        {state.messages.map((message) => (
          <MessageRow key={message.id} message={message} coachDisplayName={state.coachDisplayName} />
        ))}
        {pending && (
          <p className="flex items-center gap-2 py-2 text-xs text-neutral">
            <Loader2 className="size-3 animate-spin" aria-hidden /> OPTIM is thinking…
          </p>
        )}
        <div ref={sentinelRef} />
      </div>

      {notice && (
        <div className="px-4 pb-2">
          <p
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs",
              notice.tone === "warn" ? "border-border-strong bg-surface text-off-white" : "border-border bg-surface text-neutral"
            )}
          >
            {notice.tone === "warn" ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />}
            {notice.text}
          </p>
        </div>
      )}

      <div className="sticky bottom-[4.75rem] z-20 border-t border-border bg-near-black/95 backdrop-blur-md">
        {!state.isCoachThread && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                disabled={pending}
                onClick={() => void handleSend(starter)}
                className="shrink-0 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs text-neutral transition-colors hover:text-off-white disabled:opacity-50"
              >
                {starter}
              </button>
            ))}
          </div>
        )}
        <ChatComposer
          placeholder={state.isCoachThread ? `Message ${state.coachDisplayName}…` : "Ask OPTIM…"}
          onSend={(text) => void handleSend(text)}
          onSendVoice={() => setNotice({ tone: "warn", text: "Voice messages aren't supported in this mode yet." })}
        />
      </div>
    </div>
  );
}
