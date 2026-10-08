"use client";

// One specific piece of equipment: Have it / Don't have it / Unknown. The click shows the chosen answer at once
// (optimistic, with "Saving…"); it stays shown until the server has saved it and the page has re-rendered with the
// persisted answer (and updated counts), then confirms "Saved". A failed save reverts and says why.

import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { equipmentAnswerView, type EquipmentAnswer as Answer } from "@/lib/synthesis/equipment-answers";

const TONE = { error: "text-error", pending: "text-neutral", success: "text-success", warning: "text-warning-strong", neutral: "text-neutral" } as const;

export function EquipmentAnswer({ apparatus, label, saved, action }: { apparatus: string; label: string; saved: Answer; action: (apparatus: string, state: Answer) => Promise<{ ok: true } | { ok: false; message: string }> }) {
  const [shown, setShown] = useOptimistic(saved);
  const [saving, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = equipmentAnswerView({ shown, saving, justSaved, error });

  function choose(next: Answer) {
    if (saving || next === shown) return;
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      setShown(next);
      try {
        const res = await action(apparatus, next);
        if (!res.ok) return setError(res.message);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 1500);
      } catch {
        setError("Couldn't save that answer — try again.");
      }
    });
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2" role="group" aria-label={`Does the client have a ${label}?`}>
      {view.options.map((o) => (
        <Button key={o.value} type="button" size="sm" variant={o.pressed ? "primary" : "secondary"} aria-pressed={o.pressed} loading={o.loading} disabled={saving && !o.loading} onClick={() => choose(o.value)}>
          {o.label}
        </Button>
      ))}
      <span role="status" aria-live="polite" className={cn("text-xs", TONE[view.tone])}>
        {view.status}
      </span>
    </div>
  );
}
