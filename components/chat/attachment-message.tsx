import { FileText, Mic } from "lucide-react";
import type { ChatAttachment } from "@/lib/types";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Renders one attachment inside a chat bubble — image, playable video,
 * document card, or voice player, per its `kind`. Purely presentational;
 * every attachment is already a fully-built ChatAttachment by the time it
 * reaches here (see lib/chat/attachments.ts). */
export function AttachmentMessage({ attachment }: { attachment: ChatAttachment }) {
  if (attachment.kind === "photo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local object-URL/prototype asset, never a remote/optimizable one
      <img
        src={attachment.url}
        alt={attachment.fileName}
        className="max-h-64 w-full rounded-[var(--radius-sm)] object-cover"
      />
    );
  }

  if (attachment.kind === "video") {
    return (
      <video
        src={attachment.url}
        controls
        playsInline
        className="max-h-64 w-full rounded-[var(--radius-sm)] bg-near-black"
      />
    );
  }

  if (attachment.kind === "voice") {
    return (
      <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-off-white/[0.04] px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-off-white/[0.06] text-neutral">
          <Mic size={14} aria-hidden="true" />
        </span>
        <audio src={attachment.url} controls className="h-8 min-w-0 flex-1" />
        <span className="shrink-0 text-[11px] tabular-nums text-neutral">{formatDuration(attachment.durationSeconds)}</span>
      </div>
    );
  }

  // document
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-off-white/[0.04] px-3 py-2.5 hover:bg-off-white/[0.07]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-off-white/[0.06] text-neutral">
        <FileText size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-off-white">{attachment.fileName}</span>
        <span className="block text-[11px] text-neutral">{formatSize(attachment.sizeBytes)}</span>
      </span>
    </a>
  );
}
