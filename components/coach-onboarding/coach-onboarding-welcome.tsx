"use client";

import { ArrowRight, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The premium first-run introduction this phase's brief §III.8 calls for —
 * concrete examples of value rather than inflated AI marketing language,
 * and explicit about what stays the coach's own call.
 */
export function CoachOnboardingWelcome({ businessName, onContinue }: { businessName: string; onContinue: () => void }) {
  // A workspace without its own business name falls back to "OPTIM" — never show it twice.
  const showBusinessName = businessName.trim() !== "" && businessName.trim().toLowerCase() !== "optim";
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-2xl">
        <p className="text-label text-accent-fg">{showBusinessName ? `OPTIM · ${businessName}` : "OPTIM"}</p>
        <h1 className="mt-2 text-display text-off-white">Let&apos;s teach OPTIM how you coach.</h1>
        <p className="mt-4 text-body text-neutral">
          Answer a focused set of questions about how you actually program, adjust, and communicate — most of it multiple choice, built from real
          scenarios rather than abstract labels. OPTIM turns your answers into a real coaching model it uses every time it builds or adjusts a
          client&apos;s plan.
        </p>

        <div className="mt-8 space-y-4">
          <PrincipleRow icon={Sparkles} title="Real generated work, in your style" body="A new client's training and nutrition options are ranked and explained using your own methodology — not a generic template." />
          <PrincipleRow icon={Wrench} title="You stay in control" body="Every level of AI authority — from Advisor to Autonomous — is something you configure, and can change any time in Settings." />
          <PrincipleRow icon={ShieldCheck} title="Safety always wins" body="Pain, injury, and out-of-bounds situations always come to you, no matter how much autonomy you've granted elsewhere." />
        </div>

        <Button size="lg" className="mt-10" onClick={onContinue}>
          Begin calibration <ArrowRight size={16} aria-hidden="true" />
        </Button>
        <p className="mt-3 text-meta text-neutral">Takes about 15–20 minutes. Saves as you go — you can pick up right where you left off.</p>
      </div>
    </div>
  );
}

function PrincipleRow({ icon: Icon, title, body }: { icon: typeof Sparkles; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
        <Icon size={16} aria-hidden="true" />
      </div>
      <div>
        <p className="text-body font-semibold text-off-white">{title}</p>
        <p className="text-meta text-neutral">{body}</p>
      </div>
    </div>
  );
}
