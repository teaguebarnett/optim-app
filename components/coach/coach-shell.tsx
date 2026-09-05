"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Users, AlertCircle, MessageSquare, Settings, ClipboardList, UtensilsCrossed } from "lucide-react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { resolveCoachCalibrationStatus } from "@/lib/coach/coach-onboarding-engine";
import { isGenuinelyNewCoach as computeIsGenuinelyNewCoach } from "@/lib/coach/routing";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { CoachBottomNav } from "@/components/coach/coach-bottom-nav";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";

const NAV_ITEMS = [
  { href: "/coach", label: "Command Center", icon: LayoutGrid, exact: true },
  { href: "/coach/clients", label: "Clients", icon: Users, exact: false },
  { href: "/coach/reviews", label: "Decisions", icon: AlertCircle, exact: false },
  { href: "/coach/programs", label: "Programming", icon: ClipboardList, exact: false },
  { href: "/coach/meals", label: "Nutrition", icon: UtensilsCrossed, exact: false },
  { href: "/coach/messages", label: "Messages", icon: MessageSquare, exact: false },
] as const;

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The coach workspace's chrome — Phase 5.3C replaces the permanent narrow
 * sidebar with a full-width horizontal top navigation on desktop, matching
 * the approved reference composition. Mobile keeps its own real bottom
 * navigation (see coach-bottom-nav.tsx) untouched — this is a desktop-only
 * structural change.
 */
export function CoachShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeContext } = usePrototypeState();
  const workspace = useCoachWorkspace();
  const com = useCoachOperatingModel();
  const { attentionQueue } = workspace;
  const businessName = activeContext.branding.businessName;
  const coachName = activeContext.coachProfile?.displayName ?? "Coach";
  const initials = activeContext.coachProfile?.avatarInitials ?? "C";
  const reviewCount = attentionQueue.length;
  const coachAccountId = activeContext.coachProfile?.userId ?? activeContext.coachProfile?.id;

  // Phase 5.4A corrective pass — new-coach first-run lifecycle. A coach who
  // has never confirmed a Coach Operating Model AND has no clients yet
  // (i.e. this is genuinely their first real session, not an existing
  // workspace that simply hasn't calibrated) is routed through Coach
  // Calibration before ever landing on an empty Command Center. An
  // EXISTING coach with real clients/programs already (including the
  // seeded Teague account) is deliberately exempt — see
  // CalibrateOptimBanner, which prompts them instead of gating them.
  const calibrationStatus = workspace.isPlatformHydrated ? resolveCoachCalibrationStatus({ activeModel: com.activeModel, progress: com.progress }) : null;
  const isGenuinelyNewCoach = workspace.isPlatformHydrated && calibrationStatus !== null && computeIsGenuinelyNewCoach({ calibrationStatus, clientCount: workspace.clients.length });

  useEffect(() => {
    if (isGenuinelyNewCoach) router.replace("/coach-onboarding");
  }, [isGenuinelyNewCoach, router]);

  if (!coachAccountId) return null;
  if (isGenuinelyNewCoach) return null;

  return (
    <RequireThemeChoice accountKind="coach" accountId={coachAccountId}>
      <div className="flex min-h-screen flex-col bg-near-black">
        {/* Desktop — full-width horizontal navigation. */}
        <header className="sticky top-0 z-30 hidden border-b border-border bg-charcoal/95 backdrop-blur-md md:block">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-6 px-8">
            <Link href="/coach" className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-sm font-semibold tracking-tight text-on-accent">
                {businessName.slice(0, 1)}
              </span>
              <span className="text-subheading text-off-white">{businessName}</span>
            </Link>

            <nav className="flex flex-1 items-center justify-center gap-1" aria-label="Coach navigation">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href, item.exact);
                const Icon = item.icon;
                const badge = item.href === "/coach/reviews" ? reviewCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97]",
                      active ? "bg-accent text-on-accent shadow-[var(--shadow-subtle)]" : "text-neutral hover:bg-surface-raised hover:text-off-white"
                    )}
                    style={{ transitionDuration: "var(--motion-fast)" }}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="hidden lg:inline">{item.label}</span>
                    {badge > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[11px] font-semibold leading-none text-on-accent">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/coach/settings"
                title="Playbook & Settings"
                aria-label="Playbook & Settings"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  pathname.startsWith("/coach/settings") ? "bg-accent-soft text-accent-strong" : "text-neutral hover:bg-surface-raised hover:text-off-white"
                )}
                style={{ transitionDuration: "var(--motion-fast)" }}
              >
                <Settings size={17} aria-hidden="true" />
              </Link>
              <div className="flex items-center gap-2 border-l border-border pl-3">
                <Avatar initials={initials} size="sm" />
                <p className="hidden text-xs text-neutral xl:block">
                  <span className="font-medium text-off-white">{coachName}</span>
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile header. */}
        <header className="flex items-center justify-between border-b border-border bg-charcoal px-4 py-3 pc-safe-top md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] bg-accent text-xs font-semibold text-on-accent">
              {businessName.slice(0, 1)}
            </span>
            <span className="text-sm font-semibold text-off-white">{businessName}</span>
          </div>
          <Avatar initials={initials} size="sm" />
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 lg:px-12">{children}</main>

        <CoachBottomNav />
      </div>
    </RequireThemeChoice>
  );
}
