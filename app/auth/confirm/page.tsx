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
//
// Navigation here always uses a hard window.location assignment, never
// next/navigation's router.replace()/router.refresh(). Traced live: with a
// stale pre-existing session cookie already on this origin (exactly the
// state a user retrying a broken sign-in flow — the real reported
// scenario — is in), the whole exchange completed correctly in well under
// 100ms (confirmed with an in-page timestamped trace) and router.replace()
// was reached and called — but no client-side navigation ever visibly
// happened; the page sat on "Signing you in…" indefinitely regardless. The
// most likely cause is app/layout.tsx's own globally-mounted
// PrototypeStateProvider (present on every route, this one included)
// racing this page's own router-driven transition — but a full root-cause
// wasn't required once a strictly more reliable alternative was available:
// a hard navigation is a real browser-level document load, immune to any
// client-side router/RSC-cache state whatever else on the page is doing,
// and is arguably the more correct choice for a page whose entire job ends
// the moment it leaves — the next page should read the just-written
// session cookie via a genuinely fresh server render, not whatever the
// client router already had cached from before the session existed.

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { acceptInvitationAction, resolvePostSignInDestinationAction } from "@/app/actions/auth";

export default function AuthConfirmPage() {
  return (
    <Suspense>
      <AuthConfirmPageInner />
    </Suspense>
  );
}

function goTo(path: string) {
  window.location.href = path;
}

function AuthConfirmPageInner() {
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
    // Never navigated to as-is: resolvePostSignInDestinationAction only
    // honors it when it's a same-origin path the signed-in role may enter,
    // else routes to that role's home. (This used to default straight to
    // /auth/account — a dead end for every real coach/client sign-in.)
    const next = searchParams.get("next");
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
    // instead (an earlier bug here) means every real cause looks identical
    // and undiagnosable from the outside.
    const errorDescription = searchParams.get("error_description") ?? hashParams.get("error_description");
    const errorCode = searchParams.get("error_code") ?? hashParams.get("error_code");

    async function run() {
      // getSupabaseBrowserClient() lives INSIDE this function, not outside
      // it — a throw here (or in anything before the first await) must
      // still reach the single .catch() this is always driven from below;
      // see that call site for why a plain try/catch in here wouldn't be
      // enough on its own.
      const supabase = getSupabaseBrowserClient();

      if (errorDescription || errorCode) {
        goTo(`/auth/error?reason=${encodeURIComponent(errorDescription ?? errorCode ?? "Sign-in link error.")}`);
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
        goTo("/auth/error?reason=missing_token");
        return;
      }

      if (invitationId) {
        setMessage("Joining your workspace…");
        await acceptInvitationAction(invitationId);
      }

      goTo(await resolvePostSignInDestinationAction(next));
    }

    // A thrown/rejected error from run() is only half of "never stuck
    // forever" — the Supabase client calls above have no built-in timeout,
    // so a request that never settles (hangs, rather than erroring) would
    // satisfy neither the success path nor a catch, leaving this page on
    // "Signing you in…" indefinitely. Racing run() against a bounded
    // timeout turns that failure mode into the same visible error every
    // other rejection already gets, and the single top-level .catch() here
    // is what makes that guarantee unconditional: it fires for a throw
    // from run() itself (including from getSupabaseBrowserClient(), which
    // lives inside run() for exactly this reason), a rejected Supabase
    // call, or the timeout — there is no remaining path through this
    // effect that reaches neither a goTo() call above nor this .catch().
    const TIMEOUT_MS = 15_000;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Sign-in is taking longer than expected. Please try again.")), TIMEOUT_MS);
    });

    Promise.race([run(), timeout]).catch((err) => {
      const reason = err instanceof Error ? err.message : "Failed to complete sign-in.";
      goTo(`/auth/error?reason=${encodeURIComponent(reason)}`);
    });
  }, [searchParams]);

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <p className="text-sm text-neutral">{message}</p>
    </main>
  );
}
