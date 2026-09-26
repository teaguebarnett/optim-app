// Phase 6.0A — Production Foundation.
//
// Minimal auth error display — reached when a sign-in/confirmation link is
// invalid, expired, or already used. Never silently redirects into demo
// content; always shows a real, honest error and a way back to sign-in.

// GoTrue keeps exactly one pending magic-link challenge per email — live
// reproduction (see app/auth/sign-in/page.tsx's own doc) proved requesting
// a second link before clicking a first invalidates that first link
// server-side, surfacing as this exact raw message. Rewritten here into
// something a user can actually act on; the underlying GoTrue text is
// otherwise correct but reads as an internal error, not a next step.
function friendlyReason(reason: string): string {
  if (reason.toLowerCase().includes("code challenge does not match")) {
    return "This link is no longer valid because a newer sign-in link was requested for this email. Use the most recent email, or request a new link below.";
  }
  return reason;
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-off-white">Sign-in link didn&apos;t work</h1>
        <p className="mt-2 text-sm text-neutral">
          {reason ? friendlyReason(decodeURIComponent(reason)) : "This link may have expired or already been used."}
        </p>
        <a href="/auth/sign-in" className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-fg">
          Back to sign in
        </a>
      </div>
    </main>
  );
}
