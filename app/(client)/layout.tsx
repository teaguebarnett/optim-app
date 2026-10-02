import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell/shell";
import { resolveAppMode } from "@/lib/production/mode";
import { getOwnLifecycleStatus } from "@/lib/production/roster";
import { clientOnboardingRedirect } from "@/lib/coach/routing";
import { UnauthenticatedError } from "@/lib/production/errors";

// Route group only — excluded from the URL (still /today, /training, etc.).
// Isolates the existing mobile client chrome (Header + bottom nav) from the
// coach workspace's own shell (see app/coach/layout.tsx), without changing
// any client route's actual path. See lib/coach/routing.ts for the
// role/lifecycle rules that decide who's allowed to land here.
//
// Security fix: this layout previously rendered <AppShell> unconditionally.
// AppShell/usePrototypeState() is a Client Component — in Supabase mode it
// bootstraps via a Server Action (getMySupabaseAppStateAction), but an
// unauthenticated caller made that action's identity lookup fail and get
// silently treated the same as "not_provisioned," after which the hook fell
// back to createInitialState()'s demo fixture data and a demo activeContext.
// The result: any anonymous visitor could reach /today (and every other
// (client) route) and see fully-rendered demo content with no session.
// Fixed at the same layer app/coach/layout.tsx and app/admin/layout.tsx
// already use — a real, awaited, server-side identity check that must
// succeed before AppShell (or any child page) ever renders. See
// lib/production/identity.ts's resolveOwnClientIdentity, which — unlike
// this action surface's own separate copy in
// app/actions/production-programs.ts — already propagates
// UnauthenticatedError instead of swallowing it.
export default async function ClientRouteGroupLayout({ children }: { children: ReactNode }) {
  const appMode = resolveAppMode();

  if (appMode !== "supabase") {
    return <AppShell>{children}</AppShell>;
  }

  // Gate 4.0B — the same identity check, plus the client's real lifecycle
  // (from client_onboarding_progress / client_enrollments): a client who
  // hasn't finished onboarding is sent to it, never into the daily app's
  // "setup in progress" state. Re-evaluated on every request, so a refresh
  // or a reopened app always lands on the client's actual current state.
  let onboardingRoute: string | null = null;
  try {
    const status = await getOwnLifecycleStatus();
    onboardingRoute = clientOnboardingRedirect(status.lifecycle, status.clientId);
  } catch (err) {
    return <ClientAccessDenied error={err} />;
  }
  // Outside the try: redirect() works by throwing.
  if (onboardingRoute) redirect(onboardingRoute);

  // Appearance is chosen later in Settings — never a gate in front of a
  // real client's app.
  return <AppShell themeDefault="light">{children}</AppShell>;
}

function ClientAccessDenied({ error }: { error: unknown }) {
  const isUnauthenticated = error instanceof UnauthenticatedError;
  const title = isUnauthenticated ? "Sign in required" : "Not authorized";
  const description = isUnauthenticated
    ? "You need to sign in as a client to view this."
    : "Your account doesn't hold a client role in any workspace.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-near-black px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-charcoal p-8 text-center shadow-[var(--shadow-subtle)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-neutral">
          <ShieldAlert size={20} aria-hidden="true" />
        </span>
        <p className="text-subheading text-off-white">{title}</p>
        <p className="text-meta text-neutral">{description}</p>
        <Link
          href="/auth/sign-in"
          className="mt-2 inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-strong"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}
