"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, UserRound, Bot, Activity } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { initialsFromDisplayName } from "@/lib/shared/initials";
import type { AppMode } from "@/lib/production/mode";
import type { PlatformRole } from "@/lib/production/platform-auth";

// Phase 6.1A — a genuinely dedicated shell for platform administration,
// deliberately NOT CoachShell reused with an extra nav item: the Command
// Center is a different product surface (platform-wide, not workspace-
// scoped), and reusing coach chrome here would blur exactly the distinction
// the spec calls for ("do not simply reuse the coach dashboard as if
// platform administration were another coach page"). Never rendered for an
// ordinary coach/client session — app/admin/layout.tsx is the only place
// this is ever mounted, and it fails closed before this component is
// reached at all in Supabase mode.

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/coaches", label: "Coaches", icon: Users, exact: false },
  { href: "/admin/clients", label: "Clients", icon: UserRound, exact: false },
  { href: "/admin/ai", label: "AI Operations", icon: Bot, exact: false },
  { href: "/admin/system", label: "System", icon: Activity, exact: false },
] as const;

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

const ROLE_LABELS: Record<PlatformRole, string> = {
  platform_owner: "Platform Owner",
  platform_admin: "Platform Admin",
  platform_analyst: "Platform Analyst (read-only)",
};

export function AdminShell({
  children,
  appMode,
  identity,
}: {
  children: ReactNode;
  appMode: AppMode;
  identity: { displayName: string; role: PlatformRole | "demo" };
}) {
  const pathname = usePathname();
  const roleLabel = identity.role === "demo" ? "Demo preview" : ROLE_LABELS[identity.role];

  return (
    <div className="flex min-h-screen flex-col bg-near-black">
      <header className="sticky top-0 z-30 border-b border-border bg-charcoal/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-6 px-4 md:px-8">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong bg-navy text-sm font-semibold tracking-tight text-navy-ink">
              O
            </span>
            <span className="hidden text-subheading text-off-white sm:inline">OPTIM Command Center</span>
          </Link>

          {appMode === "demo" ? (
            <span className="hidden items-center rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-warning md:inline-flex">
              Demo fixtures
            </span>
          ) : null}

          <nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto" aria-label="Command Center navigation">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition-all active:scale-[0.97] md:px-4",
                    active ? "bg-accent text-on-accent shadow-[var(--shadow-subtle)]" : "text-neutral hover:bg-surface-raised hover:text-off-white"
                  )}
                  style={{ transitionDuration: "var(--motion-fast)" }}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 border-l border-border pl-3">
            <Avatar initials={initialsFromDisplayName(identity.displayName)} size="sm" />
            <div className="hidden xl:block">
              <p className="text-xs font-medium text-off-white">{identity.displayName}</p>
              <p className="text-[11px] text-neutral">{roleLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
