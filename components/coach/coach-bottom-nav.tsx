"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, AlertCircle, MessageSquare, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { CoachMoreSheet } from "@/components/coach/coach-more-sheet";

const TAB_ITEMS = [
  { href: "/coach", label: "Center", icon: LayoutGrid, exact: true },
  { href: "/coach/clients", label: "Clients", icon: Users, exact: false },
  { href: "/coach/reviews", label: "Decisions", icon: AlertCircle, exact: false },
  { href: "/coach/messages", label: "Messages", icon: MessageSquare, exact: false },
] as const;

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The coach workspace's true mobile navigation — a persistent bottom bar,
 * never the client's own bottom nav (different items, different route
 * space) and never the old horizontal-scrolling pill strip it replaces.
 * "Reviews" carries a real, restrained count of unresolved attention items
 * — see lib/coach/attention-queue.ts — and only ever appears when that
 * count is genuinely nonzero; there's no real "unread messages" concept in
 * this prototype's data model yet, so Messages intentionally carries no
 * fabricated badge (see this file's own note, and the module doc on
 * hooks/use-coach-data.ts for where a real one would eventually come from).
 *
 * Hidden on Complete Setup specifically — that page owns the bottom of the
 * screen for its own sticky Save/Cancel action (mirroring
 * components/app-shell/bottom-nav.tsx's identical hide-for-active-workout
 * rule on the client side), so a coach's thumb never has to choose between
 * two competing fixed bottom bars.
 */
export function CoachBottomNav() {
  const pathname = usePathname();
  const { attentionQueue } = useCoachWorkspace();
  const [moreOpen, setMoreOpen] = useState(false);
  const reviewCount = attentionQueue.length;
  const moreActive = pathname.startsWith("/coach/settings");
  const hideForSetupFlow = pathname.startsWith("/coach/clients/") && pathname.endsWith("/setup");

  if (hideForSetupFlow) return null;

  return (
    <>
      <nav
        aria-label="Coach navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-charcoal/95 pc-safe-bottom backdrop-blur-md md:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
          {TAB_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href, item.exact);
            const Icon = item.icon;
            const badge = item.href === "/coach/reviews" ? reviewCount : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative flex min-w-[60px] flex-1 flex-col items-center justify-center gap-1 py-2.5"
              >
                <span
                  className={cn(
                    "relative flex h-8 w-11 items-center justify-center rounded-full transition-colors",
                    active && "bg-accent-soft"
                  )}
                  style={{ transitionDuration: "var(--motion-base)" }}
                >
                  <Icon size={19} strokeWidth={active ? 2.25 : 1.75} className={active ? "text-accent-strong" : "text-neutral"} />
                  {badge > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-on-accent">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                <span className={cn("text-[11px] font-medium", active ? "text-off-white" : "text-neutral")}>{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="flex min-w-[60px] flex-1 flex-col items-center justify-center gap-1 py-2.5"
          >
            <span className={cn("flex h-8 w-11 items-center justify-center rounded-full", moreActive && "bg-accent-soft")}>
              <MoreHorizontal size={19} strokeWidth={moreActive ? 2.25 : 1.75} className={moreActive ? "text-accent-strong" : "text-neutral"} />
            </span>
            <span className={cn("text-[11px] font-medium", moreActive ? "text-off-white" : "text-neutral")}>More</span>
          </button>
        </div>
      </nav>

      <CoachMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
