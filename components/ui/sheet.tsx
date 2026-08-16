"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Sheet({ open, onClose, title, description, children, className }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Phase 3.1.1 §5 — most callers pass an inline `onClose` (a new function
  // reference every render of the parent). Keeping that in this effect's
  // dependency array meant the effect — including the focus-stealing
  // panelRef.current?.focus() call below — re-ran on every keystroke inside
  // any input this sheet contains (typing updates the parent's state,
  // re-rendering the parent, recreating onClose), yanking focus off the
  // field after each character. Reading the latest onClose from a ref lets
  // the effect depend on `open` alone, so it only (re)runs when the sheet
  // actually opens or closes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pc-animate-in"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        aria-describedby={description ? "sheet-description" : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-lg)] border border-border-strong bg-charcoal p-5 pc-safe-bottom pc-animate-in sm:rounded-[var(--radius-lg)] sm:m-4",
          className
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="sheet-title" className="text-lg font-semibold text-off-white">
              {title}
            </h2>
            {description ? (
              <p id="sheet-description" className="mt-1 text-sm text-neutral">
                {description}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
