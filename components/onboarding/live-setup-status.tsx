"use client";

// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The Supabase-mode sibling of components/onboarding/demo-setup-status.tsx
// — the same "you're not in the daily app yet" framing, real data source.
// Simpler than the demo version by construction: this vertical slice's
// Supabase lifecycle has no separate "ready_to_activate" state (see
// lib/production/roster.ts's own deriveLifecycle doc — a coach activates a
// client the moment their program/nutrition/start-date are all in place, in
// one action), and no ClientIntendedProgram concept (that's a demo-only
// pre-activation-intent record with no Supabase analog — the real start
// date, once set, is shown directly instead).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PauseCircle, Flag, Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PhoneCanvas } from "@/components/app-shell/phone-canvas";
import { OnboardingStage } from "@/components/onboarding/onboarding-stage";
import { getMyLifecycleStatusAction } from "@/app/actions/onboarding";
import type { OwnLifecycleStatus } from "@/lib/production/roster";

function formatStartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function LiveSetupStatus({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<OwnLifecycleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      getMyLifecycleStatusAction()
        .then((result) => {
          if (!cancelled) setStatus(result);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load your status.");
        });
    }
    load();
    // A coach can activate this exact client while this page is open in the
    // client's own browser tab — re-check on focus/visibility, mirroring
    // hooks/use-platform-state.tsx's own storage/focus resync discipline
    // for the same reason (there is no server push channel in this vertical
    // slice, so polling on the moments a user is likely looking again is
    // the honest, minimal equivalent).
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, []);

  useEffect(() => {
    if (!status) return;
    if (status.lifecycle === "invited" || status.lifecycle === "onboarding") {
      router.replace(`/onboarding/${clientId}`);
      return;
    }
    if (status.lifecycle === "active") {
      router.replace("/today");
    }
  }, [status, clientId, router]);

  if (error) {
    return (
      <PhoneCanvas>
        <div className="flex min-h-screen flex-1 items-center justify-center px-6">
          <Card className="w-full max-w-sm text-center">
            <p className="text-sm text-neutral">{error}</p>
          </Card>
        </div>
      </PhoneCanvas>
    );
  }

  if (!status) return null;
  const coachName = status.coachDisplayName;

  if (status.lifecycle === "coach_setup") {
    return (
      <OnboardingStage coachName={coachName}>
        <div className="flex min-h-[60vh] flex-col justify-center">
          <div className="mx-auto w-full max-w-sm text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success pc-success-pop">
              <CheckCircle2 size={22} aria-hidden="true" />
            </div>
            <p className="mt-4 text-label text-brass-strong">Sent to {coachName}.</p>
            <h1 className="mt-2 text-display text-off-white">
              {status.hasActiveProgram ? `${coachName} is finishing your setup.` : `${coachName} is reviewing your answers and building your program.`}
            </h1>

            {status.startDateIso ? (
              <Card className="mt-6 text-left">
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-neutral">Start date</dt>
                    <dd className="text-off-white">{formatStartDate(status.startDateIso)}</dd>
                  </div>
                </dl>
              </Card>
            ) : null}

            <p className="mt-4 text-sm text-neutral">Nothing becomes active for you until {coachName} approves it — feel free to close this page.</p>

            <p className="mt-6 flex items-center justify-center gap-2 text-meta text-neutral">
              <span className="flex h-1.5 w-1.5 rounded-full bg-brass-strong pc-pulse" aria-hidden="true" />
              Waiting on {coachName} — this page updates itself the moment you&apos;re activated.
            </p>
          </div>
        </div>
      </OnboardingStage>
    );
  }

  const content = (() => {
    if (status.lifecycle === "paused") {
      return {
        icon: <PauseCircle size={22} className="text-neutral" aria-hidden="true" />,
        title: "Your program is paused",
        body: `Your daily plan isn't active right now. Reach out to ${coachName} if you're ready to pick back up.`,
      };
    }
    if (status.lifecycle === "completed") {
      return {
        icon: <Flag size={22} className="text-neutral" aria-hidden="true" />,
        title: "Your program has wrapped up",
        body: `Nice work. Reach out to ${coachName} if you'd like to start something new.`,
      };
    }
    return {
      icon: <Hourglass size={22} className="text-neutral" aria-hidden="true" />,
      title: "One moment",
      body: "Checking your status...",
    };
  })();

  return (
    <PhoneCanvas>
      <div className="flex min-h-screen flex-1 items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised">{content.icon}</div>
          <h1 className="mt-4 text-heading text-off-white">{content.title}</h1>
          <p className="mt-2 text-sm text-neutral">{content.body}</p>
        </Card>
      </div>
    </PhoneCanvas>
  );
}
