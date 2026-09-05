"use client";

import { useCallback, useRef, useState } from "react";
import { SCRIPTED_CHAT_TOPICS } from "@/lib/mock-data";
import { visibleSuggestionIds } from "@/lib/chat/composer-guards";

// A restrained horizontal fade at both edges — signals "more to scroll"
// without a hard visual cutoff. Matches the depth-mask technique already
// used by components/today/training-time-wheel.tsx, just horizontal here.
const EDGE_FADE = "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)";

const ALL_TOPIC_IDS = SCRIPTED_CHAT_TOPICS.map((t) => t.id);
const TAP_COOLDOWN_MS = 800;

/**
 * Template quick-suggestion chips — visually secondary to the conversation
 * (small, muted, never competing with real messages), with a smooth
 * mobile-friendly horizontal scroll and restrained edge fades rather than a
 * hard clip. A tapped suggestion is held back from the carousel until every
 * other suggestion has also been used at least once (see
 * lib/chat/composer-guards.ts's visibleSuggestionIds), so the same chip
 * never immediately reappears right after being used.
 */
export function SuggestedPrompts({ onSelect }: { onSelect: (topicId: string) => void }) {
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const lastTapRef = useRef<{ id: string; atMs: number } | null>(null);

  const visibleIdSet = new Set(visibleSuggestionIds(ALL_TOPIC_IDS, usedIds));
  const visibleTopics = SCRIPTED_CHAT_TOPICS.filter((t) => visibleIdSet.has(t.id));

  const handleTap = useCallback(
    (topicId: string) => {
      const now = Date.now();
      // Duplicate-tap guard — a rapid double-tap on the same chip never
      // queues the message twice.
      if (lastTapRef.current && lastTapRef.current.id === topicId && now - lastTapRef.current.atMs < TAP_COOLDOWN_MS) {
        return;
      }
      lastTapRef.current = { id: topicId, atMs: now };
      setUsedIds((prev) => {
        const withUsed = prev.includes(topicId) ? prev : [...prev, topicId];
        return withUsed.length >= ALL_TOPIC_IDS.length ? [] : withUsed;
      });
      onSelect(topicId);
    },
    [onSelect]
  );

  if (visibleTopics.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pb-1"
      style={{
        scrollbarWidth: "none",
        scrollSnapType: "x proximity",
        maskImage: EDGE_FADE,
        WebkitMaskImage: EDGE_FADE,
      }}
    >
      {visibleTopics.map((topic) => (
        <button
          key={topic.id}
          type="button"
          onClick={() => handleTap(topic.id)}
          style={{ scrollSnapAlign: "start" }}
          className="shrink-0 whitespace-nowrap rounded-full border border-border-strong/60 bg-off-white/[0.02] px-3.5 py-1.5 text-xs font-medium text-neutral transition-colors hover:border-accent/30 hover:text-off-white/80"
        >
          {topic.prompt}
        </button>
      ))}
    </div>
  );
}
