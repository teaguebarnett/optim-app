import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Smooth expand/collapse for content whose height isn't known up front
 * (conditional onboarding fields, any future "reveal more" panel) — the
 * CSS grid-template-rows technique (see app/globals.css's .pc-collapse),
 * the one reliable way to animate to/from an unknown height without
 * measuring in JS or hardcoding a max-height guess. `open` fully unmounts
 * nothing — content stays in the DOM (so its own state/focus survives a
 * close+reopen) and is just visually/interactively hidden via height 0 and
 * `inert`-equivalent overflow clipping.
 */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("pc-collapse", open && "pc-collapse-open", className)} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}
