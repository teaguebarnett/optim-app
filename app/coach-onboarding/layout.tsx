import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut, ShieldAlert } from "lucide-react";
import { OptimWordmark } from "@/components/brand/optim-wordmark";
import { signOutAction } from "@/app/actions/sign-out";
import { resolveAppMode } from "@/lib/production/mode";
import { resolveOwnStaffWorkspace } from "@/lib/production/auth";
import { UnauthenticatedError } from "@/lib/production/errors";

// /coach-onboarding sits outside /coach/* (see lib/coach/routing.ts's
// explicit carve-out and app/coach-onboarding/page.tsx's own doc) so it
// never had a layout of its own, and therefore never had the real
// server-side auth gate app/coach/layout.tsx and app/admin/layout.tsx both
// have. It has no Supabase-mode persistence path yet (the wizard only
// dispatches to the local demo reducer), but the page itself — a "use
// client" component reading usePrototypeState() — still rendered
// unconditionally for an anonymous visitor, the same class of gap
// app/(client)/layout.tsx just closed for /today. Fixed the same way: a
// real, awaited, server-side check that must succeed before this route's
// child page ever renders.
export default async function CoachOnboardingLayout({ children }: { children: ReactNode }) {
  const appMode = resolveAppMode();

  if (appMode !== "supabase") {
    return <>{children}</>;
  }

  try {
    await resolveOwnStaffWorkspace();
  } catch (err) {
    return <CoachOnboardingAccessDenied error={err} />;
  }

  // Gate 3 — calibration is the only workspace step an uncalibrated coach
  // can reach, so leaving (signing out) must always be one tap away.
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-border bg-charcoal px-4 py-2 pc-safe-top sm:px-6">
        <OptimWordmark size={18} className="text-off-white" />
        <form action={signOutAction}>
          <button type="submit" className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-neutral hover:text-off-white">
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}

function CoachOnboardingAccessDenied({ error }: { error: unknown }) {
  const isUnauthenticated = error instanceof UnauthenticatedError;
  const title = isUnauthenticated ? "Sign in required" : "Not authorized";
  const description = isUnauthenticated
    ? "You need to sign in as a coach to view this."
    : "Your account doesn't hold a coach/owner role in any workspace.";

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
