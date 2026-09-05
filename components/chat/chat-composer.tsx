"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { AttachmentPickerSheet } from "@/components/chat/attachment-picker-sheet";
import { AttachmentPreview } from "@/components/chat/attachment-preview";
import { VoiceRecorder } from "@/components/chat/voice-recorder";
import { buildChatAttachment, validateAttachmentFile } from "@/lib/chat/attachments";
import { isSendKeystroke, shouldSuppressDuplicateSend } from "@/lib/chat/composer-guards";
import type { ChatAttachment, ChatAttachmentKind } from "@/lib/types";

interface ChatComposerProps {
  coachName: string;
  onSend: (text: string, attachments: ChatAttachment[]) => void;
  onSendVoice: (attachment: ChatAttachment) => void;
}

const MAX_TEXTAREA_HEIGHT_PX = 160;

export function ChatComposer({ coachName, onSend, onSendVoice }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSentRef = useRef<{ text: string; atMs: number } | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed && draftAttachments.length === 0) return;
    const now = Date.now();
    if (shouldSuppressDuplicateSend(lastSentRef.current, trimmed, now)) return;
    lastSentRef.current = { text: trimmed, atMs: now };
    onSend(trimmed, draftAttachments);
    setValue("");
    setDraftAttachments([]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  async function handleFileSelected(file: File, kind: ChatAttachmentKind) {
    const result = validateAttachmentFile(file, kind);
    if (!result.ok) {
      setAttachmentError(result.reason ?? "That file can't be attached.");
      window.setTimeout(() => setAttachmentError(null), 4000);
      return;
    }
    const attachment = await buildChatAttachment(file, kind, file.name);
    setDraftAttachments((prev) => [...prev, attachment]);
  }

  function removeDraftAttachment(id: string) {
    setDraftAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
  }

  async function handleVoiceSend(blob: Blob, seconds: number) {
    setRecording(false);
    const attachment = await buildChatAttachment(blob, "voice", `voice-message-${Date.now()}.webm`, seconds);
    onSendVoice(attachment);
  }

  if (recording) {
    return (
      <div className="px-4 pb-3">
        <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setRecording(false)} />
      </div>
    );
  }

  return (
    <div>
      {attachmentError ? <p className="px-4 pb-2 text-xs text-error">{attachmentError}</p> : null}
      <AttachmentPreview attachments={draftAttachments} onRemove={removeDraftAttachment} />
      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Add attachment"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
        >
          <Paperclip size={19} />
        </button>

        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          ref={textareaRef}
          id="chat-input"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (isSendKeystroke(e)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Message ${coachName}...`}
          className="max-h-40 flex-1 resize-none rounded-[var(--radius-md)] border border-border-strong bg-surface px-3.5 py-2.5 text-[15px] text-off-white outline-none placeholder:text-neutral/60 focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={!value.trim() && draftAttachments.length === 0}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
        >
          <ArrowUp size={18} />
        </button>
      </form>

      <AttachmentPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onFileSelected={handleFileSelected}
        onSelectVoice={() => setRecording(true)}
      />
    </div>
  );
}
