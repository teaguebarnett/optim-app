"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Rendered outside the scrollable body, pinned to the bottom of the
   * panel — the shared "sticky action area" every sheet with a primary
   * action (Add client, Complete setup's mobile flow, etc.) can opt into
   * without each one reimplementing scroll/footer layout. Omit for a
   * sheet whose content already fits without scrolling — every existing
   * caller that doesn't pass this keeps its exact prior single-scroll-
   * region behavior. */
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, description, children, className, footer }: SheetProps) {
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

  // Phase 4.4B-2.1 correction — `position: fixed` only ever escapes to the
  // real viewport when NO ancestor establishes its own containing block.
  // `.pc-animate-in` (used throughout the live workout panels this sheet
  // can now be opened from) applies `transform: translateY(0)` via
  // `animation-fill-mode: both` — a non-"none" transform, which per the CSS
  // spec makes that ancestor a containing block forever, not just during
  // the brief animation. A Sheet opened from inside one was silently
  // getting sized/positioned relative to that small card instead of the
  // viewport (clipped header/footer, dark "side rails" from the card's own
  // background showing around it) rather than the full-screen overlay this
  // component's own `fixed inset-0` was always meant to produce. Portaling
  // to `document.body` sidesteps the ancestor chain entirely, so this is
  // correct and inert everywhere else in the app that never had the bug.
  // `open` is always false during any server render (it's driven by
  // client-only interactive state that starts closed), so checking
  // `document` directly here — rather than an effect+state "mounted" flag —
  // can never cause a hydration mismatch, and avoids a synchronous
  // setState-in-effect.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
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
          "relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-[var(--radius-lg)] border border-border-strong bg-charcoal pc-animate-in sm:rounded-[var(--radius-lg)] sm:m-4",
          !footer && "pc-safe-bottom",
          className
        )}
      >
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-5", footer ? "pb-3" : null)}>
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
        {footer ? <div className="shrink-0 border-t border-border bg-charcoal px-5 pb-5 pt-3 pc-safe-bottom">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
