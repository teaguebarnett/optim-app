// Phase 6.0A — Production Foundation.
//
// Minimal auth error display — reached when a sign-in/confirmation link is
// invalid, expired, or already used. Never silently redirects into demo
// content; always shows a real, honest error and a way back to sign-in.

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
          {reason ? decodeURIComponent(reason) : "This link may have expired or already been used."}
        </p>
        <a href="/auth/sign-in" className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-strong">
          Back to sign in
        </a>
      </div>
    </main>
  );
}
