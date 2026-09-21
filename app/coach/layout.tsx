import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { resolveAppMode } from "@/lib/production/mode";
import { getCoachOperationsRepository } from "@/lib/production/coach-operations";
import { UnauthenticatedError, UnauthorizedError } from "@/lib/production/errors";

// Phase 6.0C: appMode is resolved server-side here (this layout is a
// Server Component) and passed down, so CoachShell can tell a real
// Supabase-mode page apart from the demo prototype it otherwise renders
// chrome for — see coach-shell.tsx's own doc.
//
// Phase 6.0D-A: in Supabase mode, this layout ALSO resolves the real
// authenticated coach's identity and open-attention count once here (via
// the same CoachOperationsRepository every coach page reads from — see
// lib/production/coach-operations.ts) and passes it down as a plain prop,
// exactly the same "resolve server-side, pass down, never infer
// client-side" discipline lib/production/mode.ts's own doc requires for
// appMode.
//
// Errors are caught HERE rather than left to app/error.tsx: Next.js's
// error.js boundary for a segment does not wrap that same segment's own
// layout.js (only its page.js and nested child layouts — see
// node_modules/next/dist/docs/.../file-conventions/error.md), so a throw
// from THIS layout would only be caught by a boundary one level up (the
// root), which has no coach-specific context to give an honest, useful
// message. Catching directly here also means the real error instance
// (UnauthenticatedError vs UnauthorizedError) survives intact — an
// error.tsx Client Component only ever receives a redacted generic message
// in production, by design (see that doc's own "avoid leaking potentially
// sensitive details" note). Direct URL access with no session, or a client
// session, renders this fail-closed prompt instead of ever reaching any
// coach data or child page.
export default async function CoachLayout({ children }: { children: ReactNode }) {
  const appMode = resolveAppMode();

  if (appMode !== "supabase") {
    return <CoachShell appMode={appMode}>{children}</CoachShell>;
  }

  // JSX construction is deliberately kept OUT of the try block — React
  // renders JSX lazily, so an error thrown while actually rendering
  // <CoachShell> here would never be caught by a try/catch wrapping its
  // construction anyway (see the react-hooks/error-boundaries rule this
  // avoids). Only the real awaited async call below needs catching.
  let identity: { coachDisplayName: string; openAttentionCount: number; coachUserId: string } | null = null;
  let accessError: unknown = null;
  try {
    const inbox = await getCoachOperationsRepository().getAttentionInbox();
    identity = { coachDisplayName: inbox.coachDisplayName, openAttentionCount: inbox.open.length, coachUserId: inbox.coachUserId };
  } catch (err) {
    accessError = err;
  }

  if (accessError) return <CoachAccessDenied error={accessError} />;
  return (
    <CoachShell appMode={appMode} supabaseIdentity={identity ?? undefined}>
      {children}
    </CoachShell>
  );
}

function CoachAccessDenied({ error }: { error: unknown }) {
  const isUnauthenticated = error instanceof UnauthenticatedError;
  const isUnauthorized = error instanceof UnauthorizedError;
  const title = isUnauthenticated ? "Sign in required" : isUnauthorized ? "Not authorized" : "Something went wrong";
  const description = isUnauthenticated
    ? "You need to sign in as a coach to view this workspace."
    : isUnauthorized
      ? "Your account doesn't hold a coach role in any workspace."
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
