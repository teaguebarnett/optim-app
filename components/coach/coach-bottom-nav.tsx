"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { CoachMoreSheet } from "@/components/coach/coach-more-sheet";

export interface CoachNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
}

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The coach workspace's true mobile navigation — a persistent bottom bar,
 * never the client's own bottom nav (different items, different route
 * space) and never the old horizontal-scrolling pill strip it replaces.
 *
 * Phase 6.0D-A: `items` and `badgeCounts` are now props rather than this
 * component reading the demo-only useCoachWorkspace() hook itself — the one
 * shared bottom-nav shell, driven by either mode's own real data
 * (CoachShell computes badgeCounts from workspace.attentionQueue.length in
 * demo mode, or from the real Supabase attention inbox's open.length in
 * Supabase mode) instead of two separate nav implementations. `showMore`
 * defaults to true (demo keeps its Library/Settings "More" sheet exactly as
 * before); Supabase mode passes false since neither of those surfaces exist
 * there yet — never a dead-end "More" button.
 *
 * Hidden on Complete Setup specifically — that page owns the bottom of the
 * screen for its own sticky Save/Cancel action (mirroring
 * components/app-shell/bottom-nav.tsx's identical hide-for-active-workout
 * rule on the client side), so a coach's thumb never has to choose between
 * two competing fixed bottom bars.
 */
export function CoachBottomNav({
  items,
  badgeCounts = {},
  showMore = true,
}: {
  items: readonly CoachNavItem[];
  badgeCounts?: Partial<Record<string, number>>;
  showMore?: boolean;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
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
          {items.map((item) => {
            const active = isActivePath(pathname, item.href, item.exact);
            const Icon = item.icon;
            const badge = badgeCounts[item.href] ?? 0;
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
                  <Icon size={19} strokeWidth={active ? 2.25 : 1.75} className={active ? "text-accent-fg" : "text-neutral"} />
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
          {showMore ? (
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex min-w-[60px] flex-1 flex-col items-center justify-center gap-1 py-2.5"
            >
              <span className={cn("flex h-8 w-11 items-center justify-center rounded-full", moreActive && "bg-accent-soft")}>
                <MoreHorizontal size={19} strokeWidth={moreActive ? 2.25 : 1.75} className={moreActive ? "text-accent-fg" : "text-neutral"} />
              </span>
              <span className={cn("text-[11px] font-medium", moreActive ? "text-off-white" : "text-neutral")}>More</span>
            </button>
          ) : null}
        </div>
      </nav>

      {showMore ? <CoachMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} /> : null}
    </>
  );
}
