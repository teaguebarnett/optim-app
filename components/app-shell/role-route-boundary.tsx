"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { getClientLifecycle } from "@/lib/coach/repository";
import { classifyPathname, isRouteAllowed, resolveHomeRoute } from "@/lib/coach/routing";
import type { AppMode } from "@/lib/production/mode";

/**
 * The one centralized session/role-routing boundary — mounted once in the
 * root layout (app/layout.tsx), wrapping every route. No other component
 * should re-implement a role/lifecycle check; see lib/coach/routing.ts for
 * the actual (pure, tested) decision logic this just applies.
 *
 * A "public" route (invite/onboarding/setup-status/dev — see
 * classifyPathname) never needs the per-client AppState at all, only the
 * platform store (to resolve the invitation/client itself), so it renders
 * as soon as THAT hydrates rather than also waiting on the heavier, wholly
 * irrelevant client AppState — Phase 5.2's explicit "must not wait for the
 * complete client state to hydrate before showing a meaningful welcome"
 * requirement. A coach/client-app route still waits on both, since only
 * those actually need role/lifecycle to gate correctly.
 *
 * Phase 6.0C fix: this whole gate is demo-only — `activeContext.role` and
 * `lifecycle` come entirely from the localStorage-backed demo prototype
 * (usePrototypeState/usePlatformState), which has no concept of a real
 * Supabase session at all. Before this fix, a genuinely authenticated
 * Supabase-mode coach (e.g. visiting /coach/escalations or /coach/campaigns)
 * was bounced to whatever demo persona happened to be selected in that
 * browser's localStorage — completely disconnected from who they actually
 * are — because this boundary ran unconditionally on every route
 * regardless of resolveAppMode(). Supabase-mode pages already enforce their
 * own real authorization server-side on every request (every
 * lib/production/*.ts entry point calls getAuthenticatedContext() /
 * requireWorkspaceRole() itself — see lib/production/chat.ts's own module
 * doc), so this client-side demo-role gate was never a real security
 * boundary there; it only ever needs to run in demo mode, where it's the
 * only thing simulating one. `appMode` is resolved server-side once (see
 * app/layout.tsx) and passed down here rather than inferred client-side —
 * same discipline lib/production/mode.ts's own doc requires everywhere
 * else.
 */
export function RoleRouteBoundary({ children, appMode }: { children: React.ReactNode; appMode: AppMode }) {
  const { isHydrated, activeContext } = usePrototypeState();
  const { platform, isPlatformHydrated } = usePlatformState();
  const pathname = usePathname();
  const router = useRouter();

  const isDemoMode = appMode !== "supabase";
  const isPublicRoute = classifyPathname(pathname) === "public";
  const ready = isPublicRoute ? isPlatformHydrated : isHydrated && isPlatformHydrated;
  const clientId = activeContext.clientProfile?.id ?? null;
  const lifecycle = ready && clientId ? getClientLifecycle(platform, clientId) : null;
  const allowed = !isDemoMode || (ready && isRouteAllowed(pathname, activeContext.role, lifecycle));

  useEffect(() => {
    if (!isDemoMode || !ready || allowed) return;
    router.replace(resolveHomeRoute(activeContext.role, lifecycle, clientId));
  }, [isDemoMode, ready, allowed, activeContext.role, lifecycle, clientId, pathname, router]);

  if (isDemoMode && (!ready || !allowed)) return <ScreenSkeleton />;

  return <>{children}</>;
}
