"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { getClientLifecycle } from "@/lib/coach/repository";
import { classifyPathname, isRouteAllowed, resolveHomeRoute } from "@/lib/coach/routing";

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
 */
export function RoleRouteBoundary({ children }: { children: React.ReactNode }) {
  const { isHydrated, activeContext } = usePrototypeState();
  const { platform, isPlatformHydrated } = usePlatformState();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = classifyPathname(pathname) === "public";
  const ready = isPublicRoute ? isPlatformHydrated : isHydrated && isPlatformHydrated;
  const clientId = activeContext.clientProfile?.id ?? null;
  const lifecycle = ready && clientId ? getClientLifecycle(platform, clientId) : null;
  const allowed = ready && isRouteAllowed(pathname, activeContext.role, lifecycle);

  useEffect(() => {
    if (!ready || allowed) return;
    router.replace(resolveHomeRoute(activeContext.role, lifecycle, clientId));
  }, [ready, allowed, activeContext.role, lifecycle, clientId, pathname, router]);

  if (!ready || !allowed) return <ScreenSkeleton />;

  return <>{children}</>;
}
