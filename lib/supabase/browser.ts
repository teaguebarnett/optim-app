// Phase 6.0A — Production Foundation.
//
// Browser-side Supabase client factory. Safe to import from "use client"
// components: reads only the two NEXT_PUBLIC_ variables Next.js already
// inlines into the client bundle at build time (the anon key is designed to
// be public — every table it can touch is still gated by RLS, see the
// supabase/migrations/*_rls_policies.sql files). Never imports
// lib/production/env.ts (server-only, would fail the build) and never
// touches SUPABASE_SERVICE_ROLE_KEY, which has no NEXT_PUBLIC_ counterpart
// and so is architecturally unreachable from this file.

import { createBrowserClient } from "@supabase/ssr";
import { ProductionConfigError } from "../production/errors";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) throw new ProductionConfigError(missing);

  client = createBrowserClient(url!, anonKey!, {
    // @supabase/ssr hardcodes flowType: "pkce" for this client (confirmed in
    // its own source — not overridable), which app/auth/confirm/page.tsx's
    // exchangeCodeForSession(code) call depends on. Without this flag, the
    // ONLY way exchangeCodeForSession can find the right code_verifier when
    // no flowId is passed is a single "most recent flow" cookie every
    // signInWithOtp call overwrites — auth-js's own type docs say plainly
    // that email OTP "can only be correlated via this flag," since (unlike
    // OAuth) signInWithOtp never returns a flowId a caller could carry
    // through and pass to exchangeCodeForSession itself. Confirmed live:
    // requesting a sign-in link more than once (a real, ordinary thing to
    // do — impatience, a second device, an email client's own link
    // prescanner) left that single fallback cookie pointing at the WRONG
    // flow, and the real link's own exchange failed with
    // AuthPKCECodeVerifierMissingError. This flag makes GoTrue round-trip
    // the specific flow id through the callback URL as `sb_flow_id`, which
    // exchangeCodeForSession reads automatically — see that file's own doc.
    //
    // Requires the Supabase Auth "Redirect URLs" allow-list entry for this
    // site to be a wildcard (e.g. "https://<host>/**"), not an exact-path
    // entry — the allow-list matches the full URL including the query
    // string, and this flag appends `&sb_flow_id=...` to every PKCE
    // redirect. See docs/production/FOUNDATION.md's setup checklist.
    //
    // detectSessionInUrl: false — this client's default (true) makes the
    // SDK automatically try to consume any code/token in the current URL
    // the instant this client is constructed, racing app/auth/confirm/
    // page.tsx's own explicit, deterministic exchange (which must run
    // anyway, since detection alone never handles the token_hash+type
    // case). Confirmed live: with detection on, the exchange every
    // confirm-page load explicitly makes failed with
    // AuthPKCECodeVerifierMissingError 100% of the time — the automatic
    // detection had already removed the one-time-use verifier (every code
    // path in _exchangeCodeForSession removes it, success or failure)
    // before the explicit call ran. No page in this app is ever loaded
    // with a foreign auth callback URL it doesn't already handle itself,
    // so disabling automatic detection has no effect anywhere else.
    //
    // skipAutoInitialize: true — this is the fix for the actual production
    // hang (permanently stuck on "Signing you in…", no error, real
    // fresh link, clicked immediately). auth-js's constructor, unless told
    // not to, automatically fires an internal initialize() ->
    // _recoverAndRefresh() the instant this client is created — entirely
    // unawaited by our own code, running concurrently with whatever we
    // call next. Confirmed live with a real Mailpit sign-in: with a STALE
    // session cookie already present on this origin (the exact situation a
    // real user retrying a broken sign-in flow — the reported scenario —
    // ends up in) that concurrent _recoverAndRefresh() raced this page's
    // own explicit verifyOtp()/exchangeCodeForSession()/setSession() call.
    // GoTrue's own /verify endpoint logged a real 200 within a second, and
    // the browser's raw fetch() to the same endpoint resolved instantly
    // when tested in isolation — so nothing was hanging at the network
    // layer. The hang was this unrelated, unrequested background
    // initialization work. Neither of this client's only two call sites
    // (app/auth/sign-in/page.tsx, this file's own confirm page) reads an
    // existing session on load — both establish a session explicitly and
    // deliberately — so skipping the SDK's own automatic recovery here has
    // no effect on either.
    auth: { experimental: { appendPkceFlowIdToRedirects: true }, detectSessionInUrl: false, skipAutoInitialize: true },
  });
  return client;
}
