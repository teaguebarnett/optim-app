import { SCRIPTED_CHAT_TOPICS } from "./mock-data";
import type { ScriptedChatTopic } from "./types";

const KEYWORD_MAP: Array<{ topicId: string; keywords: string[] }> = [
  { topicId: "meal-substitution", keywords: ["turkey", "substitut", "swap", "instead of chicken"] },
  { topicId: "exercise-technique", keywords: ["rpe", "technique", "form", "how do i"] },
  { topicId: "missed-workout", keywords: ["miss", "skip today", "can't train", "cant train"] },
  { topicId: "shoulder-discomfort", keywords: ["shoulder", "hurt", "pain", "sore"] },
  { topicId: "restaurant-meal", keywords: ["restaurant", "eating out", "dinner out"] },
  { topicId: "schedule-change", keywords: ["schedule", "later today", "reschedule", "train later"] },
];

export function genericFallbackResponse(coachName: string): string {
  return `Real AI has not been connected in this prototype yet, so I can't answer that specific question. ${coachName} will see your message and follow up, or you can try one of the suggested questions above.`;
}

export function findScriptedResponse(userText: string): ScriptedChatTopic | null {
  const normalized = userText.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some((k) => normalized.includes(k))) {
      return SCRIPTED_CHAT_TOPICS.find((t) => t.id === entry.topicId) ?? null;
    }
  }
  return null;
}

export function getScriptedTopicById(id: string): ScriptedChatTopic | null {
  return SCRIPTED_CHAT_TOPICS.find((t) => t.id === id) ?? null;
}
