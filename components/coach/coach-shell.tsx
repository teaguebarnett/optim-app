"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Users, AlertCircle, MessageSquare, Settings, BookOpen, Megaphone } from "lucide-react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { resolveCoachCalibrationStatus } from "@/lib/coach/coach-onboarding-engine";
import { isGenuinelyNewCoach as computeIsGenuinelyNewCoach } from "@/lib/coach/routing";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { CoachBottomNav, type CoachNavItem } from "@/components/coach/coach-bottom-nav";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import type { AppMode } from "@/lib/production/mode";
import { initialsFromDisplayName } from "@/lib/shared/initials";

// Phase 5.5A — OPTIM is AI-first: training and nutrition are no longer
// standalone top-level departments here. Each client's real
// recommendations/plan live inside their own unified OPTIM Plan (see
// app/coach/clients/[clientId]/activate/page.tsx); the reusable
// template/food-source LIBRARIES those engines draw from (still real,
// still fully functional) moved to the "Library" entry point below,
// exactly mirroring how CoachMoreSheet already treats them as secondary on
// mobile — see coach-more-sheet.tsx.
const DEMO_NAV_ITEMS: readonly CoachNavItem[] = [
  { href: "/coach", label: "Command Center", icon: LayoutGrid, exact: true },
  { href: "/coach/clients", label: "Clients", icon: Users, exact: false },
  { href: "/coach/reviews", label: "Decisions", icon: AlertCircle, exact: false },
  { href: "/coach/messages", label: "Messages", icon: MessageSquare, exact: false },
];

// Phase 6.0D-A — the Supabase-mode nav's own real item list: only routes
// that actually exist and do something real in this mode (no Clients
// roster, Library, or Settings surface yet in Supabase mode — never a
// dead-end nav link). "Escalations" carries the real open-attention badge;
// "Campaigns" has no badge concept yet.
const SUPABASE_NAV_ITEMS: readonly CoachNavItem[] = [
  { href: "/coach", label: "Command Center", icon: LayoutGrid, exact: true },
  { href: "/coach/escalations", label: "Escalations", icon: AlertCircle, exact: false },
  { href: "/coach/campaigns", label: "Campaigns", icon: Megaphone, exact: false },
];

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The coach workspace's chrome — Phase 5.3C replaces the permanent narrow
 * sidebar with a full-width horizontal top navigation on desktop, matching
 * the approved reference composition. Mobile keeps its own real bottom
 * navigation (see coach-bottom-nav.tsx) untouched — this is a desktop-only
 * structural change.
 *
 * Phase 6.0D-A: Supabase mode now gets its OWN real chrome — the same
 * header/nav/bottom-nav shell, driven by real server-resolved identity
 * (`supabaseIdentity`, passed down from app/coach/layout.tsx, a Server
 * Component that calls getAuthenticatedContext()/getCoachOperationsRepository()
 * itself) instead of the demo prototype's localStorage state. This is what
 * makes /coach, /coach/escalations, and /coach/campaigns read as one
 * product with consistent navigation in Supabase mode, rather than the
 * Phase 6.0C fix's bare, chrome-less passthrough. The demo branch below is
 * completely unchanged from before that fix.
 */
export function CoachShell({
  children,
  appMode,
  supabaseIdentity,
}: {
  children: ReactNode;
  appMode: AppMode;
  /** Only meaningful (and only ever passed) in Supabase mode — real
   * identity resolved server-side by app/coach/layout.tsx. Undefined in
   * demo mode, where this component reads the demo hooks below instead. */
  supabaseIdentity?: { coachDisplayName: string; openAttentionCount: number };
}) {
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
    if (appMode === "supabase" || !isGenuinelyNewCoach) return;
    router.replace("/coach-onboarding");
  }, [appMode, isGenuinelyNewCoach, router]);

  if (appMode === "supabase") {
    const identity = supabaseIdentity ?? { coachDisplayName: "Coach", openAttentionCount: 0 };
    const supabaseBadges = { "/coach/escalations": identity.openAttentionCount };
    return (
      <div className="flex min-h-screen flex-col bg-near-black">
        <header className="sticky top-0 z-30 hidden border-b border-border bg-charcoal/95 backdrop-blur-md md:block">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-6 px-8">
            <Link href="/coach" className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-sm font-semibold tracking-tight text-on-accent">
                O
              </span>
              <span className="text-subheading text-off-white">OPTIM</span>
            </Link>

            <nav className="flex flex-1 items-center justify-center gap-1" aria-label="Coach navigation">
              {SUPABASE_NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href, item.exact);
                const Icon = item.icon;
                const badge = supabaseBadges[item.href as keyof typeof supabaseBadges] ?? 0;
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

            <div className="flex shrink-0 items-center gap-2 border-l border-border pl-3">
              <Avatar initials={initialsFromDisplayName(identity.coachDisplayName)} size="sm" />
              <p className="hidden text-xs text-neutral xl:block">
                <span className="font-medium text-off-white">{identity.coachDisplayName}</span>
              </p>
            </div>
          </div>
        </header>

        <header className="flex items-center justify-between border-b border-border bg-charcoal px-4 py-3 pc-safe-top md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] bg-accent text-xs font-semibold text-on-accent">O</span>
            <span className="text-sm font-semibold text-off-white">OPTIM</span>
          </div>
          <Avatar initials={initialsFromDisplayName(identity.coachDisplayName)} size="sm" />
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 lg:px-12">{children}</main>

        <CoachBottomNav items={SUPABASE_NAV_ITEMS} badgeCounts={supabaseBadges} showMore={false} />
      </div>
    );
  }

  if (!coachAccountId) return null;
  if (isGenuinelyNewCoach) return null;

  const demoBadges = { "/coach/reviews": reviewCount };

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
              {DEMO_NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href, item.exact);
                const Icon = item.icon;
                const badge = demoBadges[item.href as keyof typeof demoBadges] ?? 0;
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
                href="/coach/library"
                title="Coach Library — training templates &amp; meal recommendations"
                aria-label="Coach Library"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  pathname.startsWith("/coach/library") || pathname.startsWith("/coach/programs") || pathname.startsWith("/coach/meals")
                    ? "bg-accent-soft text-accent-strong"
                    : "text-neutral hover:bg-surface-raised hover:text-off-white"
                )}
                style={{ transitionDuration: "var(--motion-fast)" }}
              >
                <BookOpen size={17} aria-hidden="true" />
              </Link>
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

        <CoachBottomNav items={DEMO_NAV_ITEMS} badgeCounts={demoBadges} />
      </div>
    </RequireThemeChoice>
  );
}
