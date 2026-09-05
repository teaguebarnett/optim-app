import { FileText, Mic, Video, X } from "lucide-react";
import type { ChatAttachment } from "@/lib/types";

function formatDuration(seconds: number | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The composer's pre-send preview strip — one removable chip per draft
 * attachment (photo/video/document only; a voice message sends immediately
 * on its own, see components/chat/voice-recorder.tsx, so it never appears
 * here). */
export function AttachmentPreview({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="relative shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border-strong bg-surface"
        >
          {attachment.kind === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, never a remote/optimizable asset
            <img src={attachment.url} alt={attachment.fileName} className="h-16 w-16 object-cover" />
          ) : attachment.kind === "video" ? (
            <div className="flex h-16 w-16 flex-col items-center justify-center gap-1 text-neutral">
              <Video size={16} aria-hidden="true" />
              <span className="text-[10px]">Video</span>
            </div>
          ) : attachment.kind === "voice" ? (
            <div className="flex h-16 w-24 flex-col items-center justify-center gap-1 text-neutral">
              <Mic size={16} aria-hidden="true" />
              <span className="text-[10px] tabular-nums">{formatDuration(attachment.durationSeconds)}</span>
            </div>
          ) : (
            <div className="flex h-16 w-24 flex-col items-center justify-center gap-1 px-2 text-neutral">
              <FileText size={16} aria-hidden="true" />
              <span className="w-full truncate text-center text-[10px]">{attachment.fileName}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.fileName}`}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-near-black/80 text-off-white"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
