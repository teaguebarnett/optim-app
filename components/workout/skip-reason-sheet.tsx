"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { ReasonPicker } from "@/components/ui/reason-picker";
import type { SkipReason } from "@/lib/types";

interface SkipReasonSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  onConfirm: (reason: SkipReason, note?: string) => void;
}

export function SkipReasonSheet({ open, onClose, title, description, onConfirm }: SkipReasonSheetProps) {
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [note, setNote] = useState("");

  function handleConfirm() {
    if (!reason) return;
    onConfirm(reason, note.trim() || undefined);
    setReason(null);
    setNote("");
  }

  function handleClose() {
    setReason(null);
    setNote("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={handleClose} title={title} description={description}>
      <div className="space-y-4">
        <ReasonPicker value={reason} onChange={setReason} name="skip-reason" />
        <TextArea id="skip-reason-note" label="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button className="w-full" disabled={!reason} onClick={handleConfirm}>
          Confirm
        </Button>
      </div>
    </Sheet>
  );
}
