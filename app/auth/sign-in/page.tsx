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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = "request" | "sent";

export default function SignInPage() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/confirm?source=sign-in`,
        },
      });
      if (otpError) throw otpError;
      setStep("sent");
    } catch (err) {
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
            <Button type="submit" className="w-full" loading={loading}>
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
