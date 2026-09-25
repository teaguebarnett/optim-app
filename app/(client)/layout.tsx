import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell/shell";
import { resolveAppMode } from "@/lib/production/mode";
import { resolveOwnClientIdentity } from "@/lib/production/identity";
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

  try {
    await resolveOwnClientIdentity();
  } catch (err) {
    return <ClientAccessDenied error={err} />;
  }

  return <AppShell>{children}</AppShell>;
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
