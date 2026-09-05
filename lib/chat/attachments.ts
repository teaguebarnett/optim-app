// Chat attachment validation and the storage boundary.
//
// ChatAttachmentStorage is the one seam a future secure-upload
// implementation replaces — everything else (validation limits, the
// ChatAttachment shape itself) stays the same. The default
// localObjectUrlStorage adapter never leaves the browser: it wraps
// URL.createObjectURL, so nothing is ever "uploaded" anywhere in this
// prototype. See the MVP-scope note in the module doc for why that's
// intentional here.

import { nextId } from "../state.ts";
import type { ChatAttachment, ChatAttachmentKind } from "../types";

export interface AttachmentValidationResult {
  ok: boolean;
  reason?: string;
}

interface AttachmentLimit {
  maxSizeBytes: number;
  acceptedMimePrefixes?: string[];
  acceptedMimeTypes?: string[];
  /** Passed straight through to <input accept="..."> — kept alongside the
   * limit so the picker and the validator can never silently drift apart. */
  inputAccept: string;
}

export const ATTACHMENT_LIMITS: Record<ChatAttachmentKind, AttachmentLimit> = {
  photo: { maxSizeBytes: 15 * 1024 * 1024, acceptedMimePrefixes: ["image/"], inputAccept: "image/*" },
  // Form/technique videos are the one attachment kind clients realistically
  // record on-device at some length — a generous cap relative to the others.
  video: { maxSizeBytes: 100 * 1024 * 1024, acceptedMimePrefixes: ["video/"], inputAccept: "video/*" },
  document: {
    maxSizeBytes: 20 * 1024 * 1024,
    acceptedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    inputAccept: ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain",
  },
  voice: { maxSizeBytes: 25 * 1024 * 1024, acceptedMimePrefixes: ["audio/"], inputAccept: "audio/*" },
};

export function validateAttachmentFile(file: File, kind: ChatAttachmentKind): AttachmentValidationResult {
  const limit = ATTACHMENT_LIMITS[kind];

  if (limit.acceptedMimePrefixes && !limit.acceptedMimePrefixes.some((p) => file.type.startsWith(p))) {
    return { ok: false, reason: `That file type isn't supported for a ${kind}.` };
  }
  if (limit.acceptedMimeTypes && !limit.acceptedMimeTypes.includes(file.type)) {
    return { ok: false, reason: `That file type isn't supported for a ${kind}.` };
  }
  if (file.size > limit.maxSizeBytes) {
    return { ok: false, reason: `That file is too large (max ${Math.round(limit.maxSizeBytes / (1024 * 1024))} MB).` };
  }
  if (file.size === 0) {
    return { ok: false, reason: "That file appears to be empty." };
  }
  return { ok: true };
}

/** The one seam a future secure-storage implementation replaces — see the
 * module doc. Every adapter just needs to return a URL the rest of the app
 * can render the attachment from. */
export interface ChatAttachmentStorage {
  store(file: File | Blob, fileName: string): Promise<string>;
}

/** Local-only prototype adapter: never leaves the browser, never persisted
 * to localStorage (an object URL is only valid for the current page's
 * lifetime — see components/chat that revoke these on unmount/removal). */
export const localObjectUrlStorage: ChatAttachmentStorage = {
  async store(file) {
    return URL.createObjectURL(file);
  },
};

export async function buildChatAttachment(
  file: File | Blob,
  kind: ChatAttachmentKind,
  fileName: string,
  durationSeconds?: number,
  storage: ChatAttachmentStorage = localObjectUrlStorage
): Promise<ChatAttachment> {
  const url = await storage.store(file, fileName);
  return {
    id: nextId("attachment"),
    kind,
    fileName,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    url,
    durationSeconds,
  };
}
