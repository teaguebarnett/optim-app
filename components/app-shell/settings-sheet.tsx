"use client";

import { useState } from "react";
import { RotateCcw, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { clearState } from "@/lib/storage";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { resetToday, loadPreset } = usePrototypeState();
  const [confirmClear, setConfirmClear] = useState(false);

  function handleResetToday() {
    resetToday();
    onClose();
  }

  function handleClearAll() {
    clearState();
    resetToday();
    setConfirmClear(false);
    onClose();
  }

  function handleLoadPreset(preset: "completed-day" | "awaiting-review") {
    loadPreset(preset);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Prototype settings"
      description="These controls exist only to demo different app states — they won't appear in the production experience."
    >
      <div className="space-y-2">
        <button
          onClick={handleResetToday}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <RotateCcw size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Reset today</span>
            <span className="block text-xs text-neutral">Clear all of today&apos;s progress and start over.</span>
          </span>
        </button>

        <button
          onClick={() => handleLoadPreset("completed-day")}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <CheckCircle2 size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Load completed-day example</span>
            <span className="block text-xs text-neutral">See what a fully finished Monday looks like.</span>
          </span>
        </button>

        <button
          onClick={() => handleLoadPreset("awaiting-review")}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <AlertTriangle size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Load awaiting-review example</span>
            <span className="block text-xs text-neutral">See a day with a pain report flagged for Teague.</span>
          </span>
        </button>

        <div className="pt-2">
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-error/30 bg-error-soft px-4 py-3.5 text-left"
            >
              <Trash2 size={18} className="shrink-0 text-error" />
              <span className="text-sm font-medium text-off-white">Clear all prototype data</span>
            </button>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-error/30 bg-error-soft p-4">
              <p className="text-sm text-off-white">
                This will permanently erase all local prototype data. Continue?
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" size="sm" onClick={handleClearAll}>
                  Yes, clear everything
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
