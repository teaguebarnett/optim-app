"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";

export function ChatInput({ onSend, coachName }: { onSend: (text: string) => void; coachName: string }) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 pb-3">
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder={`Message ${coachName}...`}
        className="max-h-28 flex-1 resize-none rounded-[var(--radius-md)] border border-border-strong bg-surface px-3.5 py-2.5 text-[15px] text-off-white outline-none placeholder:text-neutral/60 focus-visible:border-accent"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Send message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
      >
        <ArrowUp size={18} />
      </button>
    </form>
  );
}
