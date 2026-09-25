"use client";

// Replaces the old route.ts Route Handler (see git history) — a plain
// server-side GET handler can only ever see `token_hash`/`type` as ordinary
// query params, which is exactly the one format this app's own custom
// local-dev email templates (supabase/templates/invite.html,
// magic_link.html) were built to produce. Hosted optim-beta has no custom
// SMTP configured, so Supabase's Email Templates are locked to the stock
// defaults, and those stock templates don't use that format at all:
//
// - The stock invite template's link routes through GoTrue's own hosted
//   /auth/v1/verify endpoint and redirects back with the session as
//   `#access_token=...&refresh_token=...` in the URL FRAGMENT (implicit
//   flow) — confirmed live. A fragment never reaches any server; only
//   client-side JS reading window.location.hash can ever see it.
// - The stock magic-link template's link goes through the same verify
//   endpoint, but @supabase/ssr's browser client hardcodes
//   `flowType: "pkce"` (confirmed in node_modules/@supabase/ssr's own
//   source — not overridable via options), so THAT redirect instead
//   carries `?code=...` — a PKCE authorization code that must be exchanged
//   via exchangeCodeForSession, using the code_verifier @supabase/ssr
//   already stored in a cookie on this same browser when signInWithOtp was
//   called. This is why testing a magic link must happen in the same
//   browser that requested it — a cross-device click has no verifier to
//   exchange against.
//
// So this page — not a Route Handler — is the only place that can
// correctly handle any of these. It checks, in order: GoTrue's own
// error/error_code/error_description (an expired or already-used link —
// see below), implicit fragment tokens, a PKCE `code`, then explicit
// `token_hash`+`type` (kept for local dev's own custom templates, and
// forward-compatible if hosted ever gets custom SMTP later). Whichever one
// actually has data wins; the others are simply absent.

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { acceptInvitationAction } from "@/app/actions/auth";

export default function AuthConfirmPage() {
  return (
    <Suspense>
      <AuthConfirmPageInner />
    </Suspense>
  );
}

function AuthConfirmPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ran = useRef(false);
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    // Effects run twice in dev under StrictMode, and this does
    // one-time-use work (a token/code that's already been consumed errors
    // on a second attempt) — guard against a real double-run, not just
    // against re-subscribing to something idempotent.
    if (ran.current) return;
    ran.current = true;

    // Captured before anything else touches the URL — @supabase/ssr's
    // browser client (created just below) may itself react to a hash it
    // finds on creation; reading it first here means this page's own
    // handling is never racing that.
    const rawHash = window.location.hash;
    const hashParams = new URLSearchParams(rawHash.replace(/^#/, ""));
    const invitationId = searchParams.get("invitation");
    const next = searchParams.get("next") ?? "/auth/account";
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;

    // GoTrue's own /verify endpoint redirects a rejected link (expired,
    // already used, or otherwise invalid) here with `error`/`error_code`/
    // `error_description` — present in BOTH the query string and the hash
    // (confirmed live against a real expired/invalid token: GoTrue puts the
    // identical error trio in each). Checked first, before any of the
    // success-path branches below: none of those ever have real data when
    // this is present, and surfacing GoTrue's own real reason (e.g. "Email
    // link is invalid or has expired") is the whole point of this check —
    // silently falling through to this page's own generic "missing_token"
    // instead (the previous bug here) means every real cause looks
    // identical and undiagnosable from the outside.
    const errorDescription = searchParams.get("error_description") ?? hashParams.get("error_description");
    const errorCode = searchParams.get("error_code") ?? hashParams.get("error_code");

    (async () => {
      const supabase = getSupabaseBrowserClient();

      try {
        if (errorDescription || errorCode) {
          router.replace(`/auth/error?reason=${encodeURIComponent(errorDescription ?? errorCode ?? "Sign-in link error.")}`);
          return;
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
        } else {
          router.replace("/auth/error?reason=missing_token");
          return;
        }

        if (invitationId) {
          setMessage("Joining your workspace…");
          await acceptInvitationAction(invitationId);
        }

        router.replace(next);
        router.refresh();
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Failed to complete sign-in.";
        router.replace(`/auth/error?reason=${encodeURIComponent(reason)}`);
      }
    })();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <p className="text-sm text-neutral">{message}</p>
    </main>
  );
}
