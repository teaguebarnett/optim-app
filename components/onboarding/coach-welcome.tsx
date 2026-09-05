"use client";

import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CoachProfile } from "@/lib/tenancy/types";

function formatStartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * The client's very first moment inside OPTIM — a real coach expecting
 * them, not a generic signup screen. Fully driven by the current
 * workspace/coach data (never a hardcoded "Teague"): reads whichever
 * `coach` the invitation actually resolved to, and falls back to neutral
 * "your coach" language only when that identity is genuinely unavailable.
 *
 * `coach.welcomeMessage` — a coach-authored replacement for the generated
 * line below — is read here but has no editor anywhere yet (see
 * lib/tenancy/types.ts's CoachProfile doc); this component is the one
 * place a future white-label onboarding editor needs to wire up, without
 * touching the invite page itself.
 */
export function CoachWelcome({
  coach,
  firstName,
  intendedStartDateIso,
  onContinue,
}: {
  coach: CoachProfile | undefined;
  firstName: string;
  intendedStartDateIso?: string;
  onContinue: () => void;
}) {
  const coachName = coach?.displayName ?? "your coach";
  const message =
    coach?.welcomeMessage ??
    `${coachName} is building your training, nutrition, and support around your real life — starting with a few focused questions.`;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Avatar initials={coach?.avatarInitials ?? "?"} size="lg" variant="accent" className="pc-success-pop" />
      <p className="mt-6 text-label text-brass-strong pc-animate-in">Welcome to OPTIM, {firstName}.</p>
      <h1 className="mt-2 text-display text-off-white pc-animate-in" style={{ animationDelay: "60ms" }}>
        {coachName} has your place ready.
      </h1>
      <p className="mt-3 max-w-sm text-body text-neutral pc-animate-in" style={{ animationDelay: "120ms" }}>
        {message}
      </p>

      {intendedStartDateIso ? (
        <Card className="mt-6 w-full max-w-xs text-left pc-animate-in" style={{ animationDelay: "180ms" }}>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral">Start date</dt>
              <dd className="text-off-white">{formatStartDate(intendedStartDateIso)}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <Button className="mt-8 w-full max-w-xs pc-animate-in" size="lg" onClick={onContinue} style={{ animationDelay: "240ms" }}>
        Let&apos;s begin
        <ArrowRight size={17} aria-hidden="true" />
      </Button>
    </div>
  );
}
