"use client";

// Phase 6.0A — Production Foundation.
//
// Passwordless sign-in: request an email sign-in link. signInWithOtp is
// called with shouldCreateUser: false — a generic sign-in attempt against
// an email with no invited account must fail, not silently create one.
// Only lib/production/invite.ts's inviteToWorkspace (and the manual
// scripts/bootstrap-workspace.mts) are allowed to create a new Supabase
// Auth user. Matches OPTIM's existing dark visual system
// (bg-near-black/text-off-white/bg-surface tokens — see app/layout.tsx and
// docs/design/OPTIM_VISUAL_CONSTITUTION.md) without importing any of the
// demo-mode providers this route must work independently of.
//
// Link-only, not a 6-digit code: hosted optim-beta has no custom SMTP
// configured, so Supabase's Email Templates are locked to the stock
// defaults — and the stock magic-link template only ever renders a
// clickable link, never the underlying one-time code (see
// app/auth/confirm/page.tsx's own doc for the full story, including why
// that link must be clicked from this same browser). Asking the user to
// type a code that hosted mail never actually shows them would be actively
// wrong, not just imprecise — this screen says exactly what will happen:
// a link, sent to their email, that they click.
// emailRedirectTo is set explicitly (rather than left to Supabase's Site
// URL default) so this always lands on app/auth/confirm/page.tsx, the one
// place that can actually establish the session — omitting it previously
// sent the link to whatever bare Site URL was configured, landing on
// /today with an unexchanged code and no session at all. The trailing
// `?source=sign-in` is a harmless placeholder — supabase/templates/
// magic_link.html's local-dev-only template appends `&token_hash=...` onto
// `.RedirectTo` (mirroring invite.html/bootstrap-workspace.mts's own
// established pattern), which needs a `?query` already present to land on
// or the resulting link is malformed (no `?` at all). app/auth/confirm/
// page.tsx ignores this param entirely.
//
// Resend cooldown: see lib/auth/signin-cooldown.ts's own doc for the full
// live-reproduced root cause. It cannot protect against a second request
// from another tab or device (GoTrue's one-pending-flow-per-email design
// makes that unavoidable), but it closes the exact reported case: a user
// re-submitting this same form before their first link arrived.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DEFAULT_COOLDOWN_SECONDS, parseRetryAfterSeconds, readCooldownMs, writeCooldown } from "@/lib/auth/signin-cooldown";

type Step = "request" | "sent";

/** `next` (already sanitized by the page) is carried through the email link
 * to app/auth/confirm/page.tsx, which honors it only when the signed-in role
 * may enter it — otherwise the role's own home. */
export function SignInForm({ next = null }: { next?: string | null }) {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Not stored: cooldownSeconds is read fresh from sessionStorage on every
  // render (see below), so it's always in sync with the current email with
  // no separate state to fall out of sync. This tick counter's only job is
  // to force a re-render once a second so the countdown display advances —
  // the actual value is never computed inside the effect itself.
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const normalizedEmail = email.trim().toLowerCase();
  const cooldownSeconds =
    typeof window === "undefined" ? 0 : Math.ceil(readCooldownMs(window.sessionStorage, normalizedEmail) / 1000);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();

    // Enforce the cooldown ourselves before ever calling signInWithOtp --
    // see the header doc: it's this request's mere arrival at GoTrue, not
    // just a successful send, that invalidates a still-outstanding link.
    if (readCooldownMs(window.sessionStorage, normalizedEmail) > 0) {
      setTick((t) => t + 1);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/confirm?source=sign-in${next ? `&next=${encodeURIComponent(next)}` : ""}`,
        },
      });
      if (otpError) throw otpError;
      writeCooldown(window.sessionStorage, normalizedEmail, DEFAULT_COOLDOWN_SECONDS);
      setStep("sent");
    } catch (err) {
      if (err instanceof Error && "status" in err && (err as { status?: number }).status === 429) {
        writeCooldown(window.sessionStorage, normalizedEmail, parseRetryAfterSeconds(err.message));
      }
      setError(err instanceof Error ? err.message : "Could not send a sign-in link to that email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-off-white">Sign in to OPTIM</h1>
        <p className="mt-1.5 text-sm text-neutral">
          {step === "request"
            ? "Enter the email address you were invited with — we'll send you a sign-in link."
            : `Check ${email} for a sign-in link. Open it in this same browser.`}
        </p>

        {step === "request" ? (
          <form className="mt-6 space-y-4" onSubmit={requestLink}>
            <TextField
              id="email"
              type="email"
              label="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error ? <p className="text-sm text-error">{error}</p> : null}
            {cooldownSeconds > 0 && !error ? (
              <p className="text-sm text-neutral">
                You can request another link in {cooldownSeconds} second{cooldownSeconds === 1 ? "" : "s"}.
              </p>
            ) : null}
            <Button type="submit" className="w-full" loading={loading} disabled={cooldownSeconds > 0}>
              Send sign-in link
            </Button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-neutral">The link expires shortly and can only be used once.</p>
            <button
              type="button"
              className="w-full text-center text-sm text-neutral hover:text-off-white"
              onClick={() => {
                setStep("request");
                setError(null);
              }}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
