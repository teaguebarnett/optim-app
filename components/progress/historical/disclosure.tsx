"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface DisclosureProps {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Phase 4.3 — the reusable progressive-disclosure primitive the new OPTIM
 * visual standard calls for: a plain, no-surprises toggle (no navigation,
 * no state mutation) for secondary detail within a SectionCard. Pure
 * presentation — safe to reuse anywhere a section has more detail than
 * belongs in the default view, including outside Historical Day Review.
 */
export function Disclosure({ label, defaultOpen = false, children, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-sm font-medium text-accent-fg"
      >
        {label}
        <ChevronDown size={16} className={cn("shrink-0 transition-transform", open ? "rotate-180" : "")} aria-hidden="true" />
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
