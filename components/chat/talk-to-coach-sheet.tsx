"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";

interface TalkToCoachSheetProps {
  open: boolean;
  onClose: () => void;
  coachName: string;
  /** Optional note, trimmed to undefined when blank — the caller decides
   * whether an empty note still creates a request (it does: "just talk to
   * them" is a real, complete ask on its own). */
  onConfirm: (note?: string) => void;
}

/**
 * Gate 2C — the one explicit, deliberate "request the real human" action.
 * Mirrors components/workout/skip-reason-sheet.tsx's shape (a focused
 * sheet, one optional field, one primary action) rather than inventing a
 * new interaction pattern. This is never a mode switch: confirming closes
 * the sheet and hands off through the exact same CREATE_CHAT_REVIEW_REQUEST
 * path every other chat escalation already uses (see
 * components/chat/demo-chat-screen.tsx) — a one-time request, not a
 * persistent OPTIM/coach toggle.
 */
export function TalkToCoachSheet({ open, onClose, coachName, onConfirm }: TalkToCoachSheetProps) {
  const [note, setNote] = useState("");

  function handleConfirm() {
    onConfirm(note.trim() || undefined);
    setNote("");
  }

  function handleClose() {
    setNote("");
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={`Talk to ${coachName}`}
      description={`This goes straight to ${coachName}, not OPTIM. They'll reply here as soon as they can.`}
    >
      <div className="space-y-4">
        <TextArea
          id="talk-to-coach-note"
          label="What's this about? (optional)"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add context if it helps — or send as-is."
        />
        <div className="border-t border-border pt-4">
          <Button className="w-full" onClick={handleConfirm}>
            Send to {coachName}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
