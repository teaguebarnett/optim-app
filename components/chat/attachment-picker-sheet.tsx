"use client";

import { useRef, type ChangeEvent } from "react";
import { Camera, Video, FileText, Mic } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { ATTACHMENT_LIMITS } from "@/lib/chat/attachments";
import type { ChatAttachmentKind } from "@/lib/types";

interface AttachmentPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** Photo/video/document all resolve through a native file picker — the
   * raw File (not yet validated/stored) is handed back for the composer to
   * validate and build a preview from. */
  onFileSelected: (file: File, kind: ChatAttachmentKind) => void;
  onSelectVoice: () => void;
}

const FILE_KINDS: { kind: Extract<ChatAttachmentKind, "photo" | "video" | "document">; label: string; icon: typeof Camera }[] = [
  { kind: "photo", label: "Photo", icon: Camera },
  { kind: "video", label: "Video", icon: Video },
  { kind: "document", label: "Document", icon: FileText },
];

/** The restrained "+" attachment control's menu — Photo/Video/Document each
 * open the matching native file picker directly; Voice hands off to the
 * dedicated VoiceRecorder flow instead of a file picker (see
 * components/chat/voice-recorder.tsx). */
export function AttachmentPickerSheet({ open, onClose, onFileSelected, onSelectVoice }: AttachmentPickerSheetProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  function inputRefForKind(kind: Extract<ChatAttachmentKind, "photo" | "video" | "document">) {
    if (kind === "photo") return photoInputRef;
    if (kind === "video") return videoInputRef;
    return documentInputRef;
  }

  function handleChange(kind: ChatAttachmentKind) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      onClose();
      if (!file) return;
      onFileSelected(file, kind);
    };
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add attachment">
      <div className="space-y-2">
        {FILE_KINDS.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => inputRefForKind(kind).current?.click()}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3 text-left text-off-white hover:border-accent/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-off-white/[0.06] text-neutral">
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className="text-[15px] font-medium">{label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onClose();
            onSelectVoice();
          }}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3 text-left text-off-white hover:border-accent/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-off-white/[0.06] text-neutral">
            <Mic size={17} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-medium">Voice message</span>
        </button>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept={ATTACHMENT_LIMITS.photo.inputAccept}
        className="hidden"
        onChange={handleChange("photo")}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={ATTACHMENT_LIMITS.video.inputAccept}
        className="hidden"
        onChange={handleChange("video")}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={ATTACHMENT_LIMITS.document.inputAccept}
        className="hidden"
        onChange={handleChange("document")}
      />
    </Sheet>
  );
}
