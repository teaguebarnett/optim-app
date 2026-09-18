"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecorderPhase =
  | "idle"
  | "unsupported"
  | "requesting"
  | "denied"
  | "recording"
  | "reviewing"
  | "error";

interface RecorderState {
  phase: RecorderPhase;
  seconds: number;
  blob?: Blob;
  previewUrl?: string;
  message?: string;
}

const MAX_RECORDING_SECONDS = 5 * 60;

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Explicit start -> requesting -> recording -> (stop ->) reviewing -> send
 * flow over the browser MediaRecorder API, with an explicit cancel at every
 * stage and graceful handling for denied permission / an unsupported
 * browser. Recording is never started except in direct response to the
 * client tapping the mic button (startRecording is only ever called from
 * that onClick) — never automatically, never on mount.
 */
export function VoiceRecorder({
  onSend,
  onCancel,
}: {
  onSend: (blob: Blob, seconds: number) => void;
  onCancel: () => void;
}) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  // Derived directly from a synchronous, stable-for-the-component's-lifetime
  // check — no effect needed to "discover" support after the fact.
  const [state, setState] = useState<RecorderState>(() =>
    supported ? { phase: "idle", seconds: 0 } : { phase: "unsupported", seconds: 0 }
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function stopStream() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setState({ phase: "requesting", seconds: 0 });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        stopStream();
        if (blob.size === 0) {
          setState({ phase: "idle", seconds: 0 });
          onCancel();
          return;
        }
        const previewUrl = URL.createObjectURL(blob);
        previewUrlRef.current = previewUrl;
        setState({ phase: "reviewing", seconds, blob, previewUrl });
      };

      recorder.start();
      startedAtRef.current = Date.now();
      setState({ phase: "recording", seconds: 0 });
      timerRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.phase !== "recording") return prev;
          const nextSeconds = prev.seconds + 1;
          if (nextSeconds >= MAX_RECORDING_SECONDS) {
            recorder.stop();
          }
          return { ...prev, seconds: nextSeconds };
        });
      }, 1000);
    } catch (err) {
      stopStream();
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState({ phase: "denied", seconds: 0 });
      } else {
        setState({ phase: "error", seconds: 0, message: "Couldn't access the microphone." });
      }
    }
  }

  function stopAndReview() {
    mediaRecorderRef.current?.stop();
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Discard: detach onstop before stopping so a cancel never produces a
      // reviewable clip.
      recorder.onstop = null;
      recorder.stop();
    }
    stopStream();
    setState({ phase: "idle", seconds: 0 });
    onCancel();
  }

  function discardReview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setState({ phase: "idle", seconds: 0 });
    onCancel();
  }

  function confirmSend() {
    if (state.phase !== "reviewing" || !state.blob) return;
    onSend(state.blob, state.seconds);
  }

  if (state.phase === "unsupported") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border-strong bg-surface px-3.5 py-2.5">
        <p className="text-sm text-neutral">Voice messages aren&apos;t supported in this browser.</p>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-accent-fg">
          Close
        </button>
      </div>
    );
  }

  if (state.phase === "denied") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft px-3.5 py-2.5">
        <p className="text-sm text-off-white">
          Microphone access was denied. Allow it in your browser settings to send a voice message.
        </p>
        <button type="button" onClick={onCancel} className="shrink-0 text-sm font-medium text-accent-fg">
          Close
        </button>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-error/40 bg-error-soft px-3.5 py-2.5">
        <p className="text-sm text-off-white">{state.message}</p>
        <button type="button" onClick={onCancel} className="shrink-0 text-sm font-medium text-accent-fg">
          Close
        </button>
      </div>
    );
  }

  if (state.phase === "requesting") {
    return (
      <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border-strong bg-surface px-3.5 py-2.5">
        <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brass border-t-transparent" />
        <p className="text-sm text-neutral">Requesting microphone access…</p>
      </div>
    );
  }

  if (state.phase === "recording") {
    return (
      <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-error/40 bg-surface px-3.5 py-2.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-error" />
        <p className="flex-1 text-sm tabular-nums text-off-white" role="status">
          Recording… {formatSeconds(state.seconds)}
        </p>
        <button
          type="button"
          onClick={cancelRecording}
          aria-label="Cancel recording"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-off-white/5"
        >
          <Trash2 size={16} />
        </button>
        <Button type="button" size="icon" onClick={stopAndReview} aria-label="Stop recording">
          <Square size={15} />
        </Button>
      </div>
    );
  }

  if (state.phase === "reviewing" && state.previewUrl) {
    return (
      <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border-strong bg-surface px-3.5 py-2.5">
        <audio src={state.previewUrl} controls className="h-9 min-w-0 flex-1" />
        <span className="shrink-0 text-[11px] tabular-nums text-neutral">{formatSeconds(state.seconds)}</span>
        <button
          type="button"
          onClick={discardReview}
          aria-label="Discard voice message"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-off-white/5"
        >
          <Trash2 size={16} />
        </button>
        <Button type="button" size="icon" onClick={confirmSend} aria-label="Send voice message">
          <Send size={15} />
        </Button>
      </div>
    );
  }

  // idle
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border-strong bg-surface px-3.5 py-2.5">
      <p className="text-sm text-neutral">Record a voice message</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-sm font-medium text-neutral hover:text-off-white">
          Cancel
        </button>
        <Button type="button" size="icon" onClick={startRecording} aria-label="Start recording">
          <Mic size={16} />
        </Button>
      </div>
    </div>
  );
}
