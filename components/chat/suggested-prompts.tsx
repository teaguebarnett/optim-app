import { SCRIPTED_CHAT_TOPICS } from "@/lib/mock-data";

export function SuggestedPrompts({ onSelect }: { onSelect: (topicId: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
      {SCRIPTED_CHAT_TOPICS.map((topic) => (
        <button
          key={topic.id}
          onClick={() => onSelect(topic.id)}
          className="shrink-0 rounded-full border border-border-strong px-3.5 py-2 text-sm font-medium text-off-white/90 hover:border-accent/40 hover:text-off-white"
        >
          {topic.prompt}
        </button>
      ))}
    </div>
  );
}
