"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { SuggestedPrompts } from "@/components/chat/suggested-prompts";
import { ChatInput } from "@/components/chat/chat-input";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { CHAT_ASSISTANT_DESCRIPTION } from "@/lib/mock-data";
import { findScriptedResponse, GENERIC_FALLBACK_RESPONSE, getScriptedTopicById } from "@/lib/scripted-chat";
import { nextId } from "@/lib/state";
import type { ChatMessage } from "@/lib/types";

const SEED_MESSAGE: Omit<ChatMessage, "id" | "createdAtIso"> = {
  sender: "coach",
  text: "Nice work last week — 100% consistency. Let's carry that into Week 8. Let me know if anything comes up today.",
};

export default function ChatPage() {
  const { state, dispatch, isHydrated } = usePrototypeState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (isHydrated && state.chatMessages.length === 0 && !seeded.current) {
      seeded.current = true;
      dispatch({
        type: "ADD_CHAT_MESSAGE",
        message: { id: nextId("msg"), createdAtIso: new Date().toISOString(), ...SEED_MESSAGE },
      });
    }
  }, [isHydrated, state.chatMessages.length, dispatch]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.chatMessages.length]);

  if (!isHydrated) return <ScreenSkeleton />;

  function addMessage(message: Omit<ChatMessage, "id" | "createdAtIso">) {
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: { id: nextId("msg"), createdAtIso: new Date().toISOString(), ...message },
    });
  }

  function handleSelectPrompt(topicId: string) {
    const topic = getScriptedTopicById(topicId);
    if (!topic) return;
    addMessage({ sender: "client", text: topic.prompt, isScripted: true });
    window.setTimeout(() => {
      addMessage({ sender: topic.responseSender, text: topic.response, isScripted: true });
    }, 400);
  }

  function handleSend(text: string) {
    addMessage({ sender: "client", text });
    const matched = findScriptedResponse(text);
    window.setTimeout(() => {
      if (matched) {
        addMessage({ sender: matched.responseSender, text: matched.response });
      } else {
        addMessage({ sender: "assistant", text: GENERIC_FALLBACK_RESPONSE });
      }
    }, 400);
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-off-white">Message Teague</p>
        <p className="mt-0.5 text-xs text-neutral">{CHAT_ASSISTANT_DESCRIPTION}</p>
      </div>

      <div className="min-h-[50vh] space-y-1 px-4 py-3">
        {state.chatMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="sticky bottom-[4.75rem] z-20 border-t border-border bg-near-black/95 backdrop-blur-md">
        <div className="pb-2 pt-2">
          <SuggestedPrompts onSelect={handleSelectPrompt} />
        </div>
        <ChatInput onSend={handleSend} />
      </div>
    </div>
  );
}
