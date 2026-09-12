import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { resolveAppMode } from "@/lib/production/mode";
import { getPlatformAuthContext } from "@/lib/production/platform-auth";
import { UnauthenticatedError, UnauthorizedError } from "@/lib/production/errors";
import { PlatformAccessDeniedError } from "@/lib/production/platform-auth";

// Phase 6.1A — the fail-closed gate for the ENTIRE /admin route tree. Every
// page under app/admin/* renders behind this layout; no page itself repeats
// this check for "can I render at all" (each page/repository method below
// still independently re-verifies via requirePlatformAuth before touching
// any data — this layout is what makes a bare, unauthenticated GET to any
// /admin/* URL fail closed before any child page/query ever runs, mirroring
// app/coach/layout.tsx's own established doc on why this must live in the
// layout rather than a page-level error boundary: Next.js's error.js for a
// segment does not wrap that same segment's own layout.js.
//
// Demo mode is intentionally open here — exactly like /coach's own demo
// branch (see components/coach/coach-shell.tsx), the interactive demo
// prototype has no login system at all; this is a design/data preview
// behind deterministic fixtures (lib/production/platform-operations.ts's
// DemoPlatformOperationsRepository), never real platform data. The REAL
// security guarantees this phase is about — server-verified platform role,
// fail-closed for every non-platform-role session — apply in Supabase mode,
// enforced below and independently re-verified by every repository method
// in lib/production/platform-operations.ts.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const appMode = resolveAppMode();

  if (appMode !== "supabase") {
    return (
      <AdminShell appMode={appMode} identity={{ displayName: "Demo Preview", role: "demo" }}>
        {children}
      </AdminShell>
    );
  }

  let identity: { displayName: string; role: "platform_owner" | "platform_admin" | "platform_analyst" } | null = null;
  let accessError: unknown = null;
  try {
    const ctx = await getPlatformAuthContext();
    identity = { displayName: ctx.displayName, role: ctx.role };
  } catch (err) {
    accessError = err;
  }

  if (accessError) return <AdminAccessDenied error={accessError} />;
  return (
    <AdminShell appMode={appMode} identity={identity!}>
      {children}
    </AdminShell>
  );
}

function AdminAccessDenied({ error }: { error: unknown }) {
  const isUnauthenticated = error instanceof UnauthenticatedError;
  const isPlatformDenied = error instanceof PlatformAccessDeniedError;
  const isUnauthorized = error instanceof UnauthorizedError;
  const title = isUnauthenticated ? "Sign in required" : isPlatformDenied || isUnauthorized ? "Not authorized" : "Something went wrong";
  const description = isUnauthenticated
    ? "You need to sign in to view the OPTIM Command Center."
    : isPlatformDenied
      ? "Your account doesn't hold a platform administration role. This area is restricted to platform_owner, platform_admin, and platform_analyst accounts."
      : isUnauthorized
        ? "Your account doesn't have permission to view this."
        : "This page couldn't load right now.";

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
