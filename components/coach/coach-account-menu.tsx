"use client";

// Gate 2 — the live coach's account menu: Settings and Sign out, both
// previously unreachable from any live coach screen. A native <details>
// disclosure (keyboard- and screen-reader-accessible without extra state);
// closes on outside click or Escape.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { signOutAction } from "@/app/actions/sign-out";
import { initialsFromDisplayName } from "@/lib/shared/initials";
import { cn } from "@/lib/cn";

export function CoachAccountMenu({ coachDisplayName, showName = false }: { coachDisplayName: string; showName?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close(e: MouseEvent | KeyboardEvent) {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
        aria-label={`Account menu for ${coachDisplayName}`}
      >
        <Avatar initials={initialsFromDisplayName(coachDisplayName)} size="sm" />
        {showName ? <span className="hidden text-xs font-medium text-off-white xl:inline">{coachDisplayName}</span> : null}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-[var(--radius-md)] border border-border bg-charcoal p-1 shadow-[var(--shadow-subtle)]">
        <p className="truncate px-3 pb-1.5 pt-2 text-meta text-neutral">{coachDisplayName}</p>
        <Link
          href="/coach/settings"
          onClick={() => ref.current?.removeAttribute("open")}
          className={cn("flex min-h-11 items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-off-white hover:bg-surface-raised")}
        >
          <Settings size={16} aria-hidden="true" />
          Settings
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-left text-sm font-medium text-off-white hover:bg-surface-raised">
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
