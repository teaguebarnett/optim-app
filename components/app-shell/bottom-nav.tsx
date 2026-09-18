"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sunrise, Dumbbell, LineChart, MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePrototypeState } from "@/hooks/use-prototype-state";

// Phase 13B (Gate 2A) — the permanent four-destination client shell. "Plan"
// is the single parent destination for Training and Nutrition (see
// app/(client)/plan/page.tsx); matchPrefixes lets it stay active across the
// standalone /training and /nutrition deep links too, not just /plan
// itself. "Coach" is this shell's label for the existing /chat route — see
// this phase's spec for why no client-facing /coach route is created
// (that path already belongs to the coach application's own shell).
const NAV_ITEMS = [
  { href: "/today", label: "Today", icon: Sunrise, matchPrefixes: ["/today"] },
  { href: "/plan", label: "Plan", icon: Dumbbell, matchPrefixes: ["/plan", "/training", "/nutrition"] },
  { href: "/progress", label: "Progress", icon: LineChart, matchPrefixes: ["/progress"] },
  { href: "/chat", label: "Coach", icon: MessageCircle, matchPrefixes: ["/chat"] },
];

/** Phase 4.4B-2 — hidden only while the live workout route is showing an
 * actually in-progress session (see app/training/workout/page.tsx's
 * ActiveSessionShell). Every other route, and this same route once the
 * session is resolved (completed/skipped/ended-early) or not yet started,
 * shows the normal global nav exactly as before — this is the one, narrow
 * condition, not a redesign of navigation elsewhere. */
export function BottomNav() {
  const pathname = usePathname();
  const { isHydrated, state } = usePrototypeState();
  const hideForActiveWorkout =
    isHydrated && pathname === "/training/workout" && state.workoutSession.status === "in-progress";

  if (hideForActiveWorkout) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-near-black/90 pc-safe-bottom backdrop-blur-md lg:absolute"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.matchPrefixes.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className="flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2.5"
            >
              <span
                className={cn(
                  "flex h-8 w-11 items-center justify-center rounded-full transition-colors duration-200",
                  isActive && "bg-accent-soft"
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className={cn(isActive ? "text-accent-fg" : "text-neutral")}
                />
              </span>
              <span className={cn("text-[11px] font-medium", isActive ? "text-off-white" : "text-neutral")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
