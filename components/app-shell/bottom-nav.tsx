"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sunrise, Dumbbell, UtensilsCrossed, LineChart, MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/today", label: "Today", icon: Sunrise },
  { href: "/training", label: "Training", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: UtensilsCrossed },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/chat", label: "Chat", icon: MessageCircle },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-near-black/90 pc-safe-bottom backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
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
                  "flex h-8 w-11 items-center justify-center rounded-full transition-colors",
                  isActive && "bg-accent-soft"
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className={cn(isActive ? "text-accent-strong" : "text-neutral")}
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
