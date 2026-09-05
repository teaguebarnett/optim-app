"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { SuggestedPrompts } from "@/components/chat/suggested-prompts";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { TrainingTimeSheet, type TrainingTimeCommitResult } from "@/components/today/training-time-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { chatAssistantDescription } from "@/lib/mock-data";
import { getScriptedTopicById } from "@/lib/scripted-chat";
import {
  classifyClientMessage,
  interpolateCoachName,
  painSafetyReplyText,
  programChangeAckReplyText,
  scheduleChangePromptText,
  scheduleUpdateConfirmationText,
  unsupportedHandoffReplyText,
} from "@/lib/chat/assistant";
import { isNearBottom } from "@/lib/chat/composer-guards";
import { nextId } from "@/lib/state";
import type { ChatActionKind, ChatAttachment, ChatMessage } from "@/lib/types";

type SeedMessage = Omit<ChatMessage, "id" | "createdAtIso" | "workspaceId" | "clientId" | "assignedCoachId">;

/** A pain or program-change escalation just fired — the very next client
 * message, if it repeats the same category, is treated as additional
 * context for that same open request rather than filing a second one. Any
 * other category clears this immediately. See handleSend. */
type PendingEscalation = "pain" | "program_change" | null;

export default function ChatPage() {
  const { state, dispatch, isHydrated, activeContext, dailyTrainingPlan } = usePrototypeState();
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const wasNearBottomRef = useRef(true);
  const pendingEscalationRef = useRef<PendingEscalation>(null);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  useEffect(() => {
    if (isHydrated && state.chatMessages.length === 0 && !seeded.current) {
      seeded.current = true;
      addMessage({
        sender: "coach",
        text: "Nice work last week — 100% consistency. Let's carry that into Week 8. Let me know if anything comes up today.",
      });
    }
    // addMessage is stable enough for this one-time seed effect — see its
    // definition below (closes only over dispatch, which useReducer keeps
    // referentially stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, state.chatMessages.length]);

  // Tracks "is the client currently near the bottom of the page," updated
  // continuously as they scroll — read (not recomputed) when a new message
  // arrives, so appending a message never yanks someone back down who has
  // deliberately scrolled up to read older history.
  useEffect(() => {
    function handleScroll() {
      wasNearBottomRef.current = isNearBottom(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight
      );
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!wasNearBottomRef.current) return;
    scrollSentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.chatMessages.length]);

  // Keeps the last message clear of the composer regardless of how tall the
  // composer currently is (multiline text, an attachment preview strip, or
  // the voice recorder panel all change its height).
  useEffect(() => {
    const el = composerWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setComposerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!isHydrated) return <ScreenSkeleton />;

  function addMessage(message: SeedMessage) {
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: { id: nextId("msg"), createdAtIso: new Date().toISOString(), ...message },
    });
  }

  function handleSelectPrompt(topicId: string) {
    const topic = getScriptedTopicById(topicId);
    if (!topic) return;
    handleSend(topic.prompt, []);
  }

  function handleSend(text: string, attachments: ChatAttachment[]) {
    const clientMessageId = nextId("msg");
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: {
        id: clientMessageId,
        createdAtIso: new Date().toISOString(),
        sender: "client",
        text,
        attachments: attachments.length > 0 ? attachments : undefined,
        deliveryState: "sent",
      },
    });

    const intent = classifyClientMessage(text);

    // The immediate next message in the same open escalation category is
    // additional context, not a second escalation — see PendingEscalation's
    // doc.
    if (pendingEscalationRef.current && intent.kind === pendingEscalationRef.current) {
      pendingEscalationRef.current = null;
      window.setTimeout(() => addMessage({ sender: "assistant", text: `Thanks — I've added that for ${coachName}.` }), 400);
      return;
    }
    pendingEscalationRef.current = intent.kind === "pain" || intent.kind === "program_change" ? intent.kind : null;

    if (intent.kind === "acknowledgement") {
      // Deliberately no reply — a simple "thanks"/"okay" lets the
      // conversation rest instead of triggering a response.
      return;
    }

    if (intent.kind === "routine") {
      window.setTimeout(() => {
        addMessage({
          sender: intent.topic.responseSender,
          text: interpolateCoachName(intent.topic.response, coachName),
          isScripted: true,
        });
      }, 400);
      return;
    }

    if (intent.kind === "schedule_change") {
      window.setTimeout(() => {
        addMessage({ sender: "assistant", text: scheduleChangePromptText(), promptsSchedulePicker: true });
      }, 400);
      return;
    }

    if (intent.kind === "pain") {
      window.setTimeout(() => {
        addMessage({ sender: "assistant", text: painSafetyReplyText(coachName) });
        window.setTimeout(() => {
          addMessage({ sender: "system", text: `Sent to ${coachName} — awaiting review`, handoffState: "pending_coach_review" });
        }, 300);
      }, 400);
      dispatch({
        type: "CREATE_CHAT_REVIEW_REQUEST",
        kind: "pain-report",
        summary: `Pain reported via chat: "${text}"`,
        sourceMessageId: clientMessageId,
      });
      return;
    }

    if (intent.kind === "program_change") {
      window.setTimeout(() => {
        addMessage({ sender: "assistant", text: programChangeAckReplyText(coachName) });
        window.setTimeout(() => {
          addMessage({ sender: "system", text: `Sent to ${coachName} — awaiting review`, handoffState: "pending_coach_review" });
        }, 300);
      }, 400);
      dispatch({
        type: "CREATE_CHAT_REVIEW_REQUEST",
        kind: "program-change-request",
        summary: `Program-change request via chat: "${text}"`,
        sourceMessageId: clientMessageId,
      });
      return;
    }

    // unsupported
    window.setTimeout(() => addMessage({ sender: "assistant", text: unsupportedHandoffReplyText(coachName) }), 400);
  }

  function handleSendVoice(attachment: ChatAttachment) {
    addMessage({ sender: "client", text: "", attachments: [attachment], deliveryState: "sent" });
    window.setTimeout(() => {
      addMessage({ sender: "assistant", text: `Got it — ${coachName} will get your voice message.` });
    }, 400);
  }

  function handleScheduleCommitted(result: TrainingTimeCommitResult) {
    const text = scheduleUpdateConfirmationText(coachName, result);
    const kind: ChatActionKind =
      result.kind === "scheduled" ? "training_time_set" : result.kind === "rest_day" ? "training_rest_day" : "training_unsure";
    addMessage({ sender: "assistant", text, actionPerformed: { kind, detail: text } });
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-off-white">Message {coachName}</p>
        <p className="mt-0.5 text-xs text-neutral">
          {chatAssistantDescription(activeContext.assistantDisplayName, coachName)}
        </p>
      </div>

      <div className="space-y-1 px-4 py-3" style={{ paddingBottom: composerHeight + 24 }}>
        {state.chatMessages.map((message) => (
          <MessageBubble key={message.id} message={message} onOpenSchedulePicker={() => setScheduleSheetOpen(true)} />
        ))}
        <div ref={scrollSentinelRef} />
      </div>

      <div ref={composerWrapRef} className="sticky bottom-[4.75rem] z-20 border-t border-border bg-near-black/95 backdrop-blur-md">
        <div className="pb-2 pt-2">
          <SuggestedPrompts onSelect={handleSelectPrompt} />
        </div>
        <ChatComposer coachName={coachName} onSend={handleSend} onSendVoice={handleSendVoice} />
      </div>

      <TrainingTimeSheet
        plan={dailyTrainingPlan}
        open={scheduleSheetOpen}
        onOpenChange={setScheduleSheetOpen}
        onCommitted={handleScheduleCommitted}
      />
    </div>
  );
}
