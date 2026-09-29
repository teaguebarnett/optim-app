// Phase 6.0A — Production Foundation.
//
// The one page that proves the entire foundation end-to-end: a real
// Supabase session, resolved server-side, joined against a real
// workspace_memberships row, with no localStorage/URL param/demo selector
// anywhere in the chain. Deliberately minimal — this is verification
// surface for Phase 6.0A, not a redesign of the existing coach/client
// dashboards (those stay on the demo/localStorage path until Phase 6.0B).

import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAppMode } from "@/lib/production/mode";
import { getAuthenticatedContext } from "@/lib/production/auth";
import { resolveSignInAccess } from "@/lib/production/post-sign-in";
import { resolveRoleHome } from "@/lib/auth/post-sign-in";
import { ProductionConfigError, UnauthenticatedError } from "@/lib/production/errors";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

async function signOutAction() {
  "use server";
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}

// Keyed by lib/auth/post-sign-in.ts's resolveRoleHome — the same
// destination a fresh sign-in lands on, so this page is never a dead end.
const HOME_LABELS: Record<string, string> = {
  "/coach": "Go to coach dashboard",
  "/admin": "Go to Command Center",
  "/today": "Go to Today",
};

export default async function AccountPage() {
  if (resolveAppMode() !== "supabase") {
    return (
      <main className="flex min-h-full items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-off-white">Supabase mode is not active</h1>
          <p className="mt-2 text-sm text-neutral">
            This app is currently running in demo mode. Set <code className="text-off-white">APP_MODE=supabase</code> and the
            required Supabase environment variables to use real authentication. See .env.example.
          </p>
        </div>
      </main>
    );
  }

  let context;
  let home: string | null;
  try {
    context = await getAuthenticatedContext();
    home = resolveRoleHome(await resolveSignInAccess());
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      redirect("/auth/sign-in");
    }
    if (err instanceof ProductionConfigError) {
      return (
        <main className="flex min-h-full items-center justify-center px-6 py-16">
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-semibold text-error">Configuration error</h1>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral">{err.message}</p>
          </div>
        </main>
      );
    }
    throw err;
  }

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-off-white">Signed in</h1>
        <div className="mt-6 space-y-1 rounded-[var(--radius-md)] border border-border-strong bg-surface p-5">
          <p className="text-sm text-neutral">Name</p>
          <p className="text-base text-off-white">{context.profile.displayName}</p>
          <p className="mt-3 text-sm text-neutral">Email</p>
          <p className="text-base text-off-white">{context.profile.email ?? "—"}</p>
          <p className="mt-3 text-sm text-neutral">User ID</p>
          <p className="font-mono text-xs text-off-white">{context.userId}</p>
        </div>

        <div className="mt-4 rounded-[var(--radius-md)] border border-border-strong bg-surface p-5">
          <p className="mb-2 text-sm text-neutral">Workspace memberships</p>
          {context.memberships.length === 0 ? (
            <p className="text-sm text-off-white">No active workspace membership.</p>
          ) : (
            <ul className="space-y-2">
              {context.memberships.map((m) => (
                <li key={m.workspaceId} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-neutral">{m.workspaceId}</span>
                  <span className="text-off-white">{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {home ? (
          <Link
            href={home}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-accent px-4 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-strong"
          >
            {HOME_LABELS[home] ?? "Go to home"}
          </Link>
        ) : null}

        <form action={signOutAction} className={home ? "mt-3" : "mt-6"}>
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
