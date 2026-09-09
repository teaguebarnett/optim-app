"use client";

// Phase 6.0A — Production Foundation.
//
// Minimal passwordless sign-in: request a six-digit email OTP, then verify
// it. signInWithOtp is called with shouldCreateUser: false — a generic
// sign-in attempt against an email with no invited account must fail, not
// silently create one. Only lib/production/invite.ts's inviteToWorkspace
// (and the manual scripts/bootstrap-workspace.mts) are allowed to create a
// new Supabase Auth user. Matches OPTIM's existing dark visual system
// (bg-near-black/text-off-white/bg-surface tokens — see app/layout.tsx and
// docs/design/OPTIM_VISUAL_CONSTITUTION.md) without importing any of the
// demo-mode providers this route must work independently of.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = "request" | "verify";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code to that email.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (verifyError) throw verifyError;
      router.push("/auth/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work — check it and try again.");
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
            ? "Enter the email address you were invited with."
            : `Enter the 6-digit code sent to ${email}.`}
        </p>

        {step === "request" ? (
          <form className="mt-6 space-y-4" onSubmit={requestCode}>
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
              Send code
            </Button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={verifyCode}>
            <TextField
              id="code"
              inputMode="numeric"
              label="Code"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <Button type="submit" className="w-full" loading={loading}>
              Verify and sign in
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-neutral hover:text-off-white"
              onClick={() => {
                setStep("request");
                setCode("");
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
