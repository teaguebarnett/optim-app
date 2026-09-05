"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Direction-aware slide+fade for chapter/moment changes — a reusable
 * primitive (see app/globals.css's pc-enter-forward/pc-enter-back), not a
 * one-off. Forces a fresh mount (and therefore a fresh animation) whenever
 * `transitionKey` changes by using it as the child's own React `key` —
 * there's no real "exit" animation (the old screen is simply gone the
 * instant the new one mounts), which keeps forward progress feeling quick
 * rather than waiting out a two-phase transition. `prefers-reduced-motion`
 * is handled globally (see globals.css), so this component never needs to
 * check it itself.
 */
export function ChapterTransition({
  transitionKey,
  direction,
  children,
  className,
}: {
  transitionKey: string | number;
  direction: "forward" | "back";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div key={transitionKey} className={cn(direction === "forward" ? "pc-enter-forward" : "pc-enter-back", className)}>
      {children}
    </div>
  );
}
