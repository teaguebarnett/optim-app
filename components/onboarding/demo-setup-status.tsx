"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PauseCircle, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PhoneCanvas } from "@/components/app-shell/phone-canvas";
import { OnboardingStage } from "@/components/onboarding/onboarding-stage";
import { usePlatformState } from "@/hooks/use-platform-state";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { getActivationGenerationsForClient, getClientLifecycle, getClientProfile, getIntendedProgram } from "@/lib/coach/repository";
import { latestGenerationForClient } from "@/lib/coach/activation-lifecycle";
import { ALL_COACH_PROFILES } from "@/lib/tenancy/seed";

function formatStartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * The polished "you're not in the daily app yet" screen — shown for every
 * lifecycle stage short of "active" (see lib/coach/types.ts's
 * ClientLifecycleStatus). Deliberately calm and specific rather than a bare
 * "please wait": a paused/completed client is told exactly that, never
 * shown anything resembling an active daily plan.
 *
 * Phase 6.0D-B — extracted verbatim from app/setup-status/[clientId]/page.tsx
 * (demo mode's own implementation, byte-for-byte unchanged behavior) so
 * that route can split by mode exactly like app/(client)/chat/page.tsx
 * already does; see components/onboarding/live-setup-status.tsx for the
 * Supabase-mode sibling.
 */
export function DemoSetupStatus({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { platform, isPlatformHydrated } = usePlatformState();
  const { setActiveClientId } = usePrototypeState();

  const client = isPlatformHydrated ? getClientProfile(platform, clientId) : null;
  const lifecycle = isPlatformHydrated && client ? getClientLifecycle(platform, client.id) : null;
  const coach = client ? ALL_COACH_PROFILES.find((c) => c.id === client.primaryCoachId) : null;
  const coachName = coach?.displayName ?? "your coach";
  const intendedProgram = client ? getIntendedProgram(platform, client.id) : null;
  const latestGeneration = client ? latestGenerationForClient(getActivationGenerationsForClient(platform, client.id), client.id) : null;
  const draftReadyForCoach = latestGeneration?.state === "ready_for_review" || latestGeneration?.state === "revision_prepared";

  useEffect(() => {
    if (!isPlatformHydrated || !client) return;
    if (lifecycle === "invited" || lifecycle === "onboarding") {
      router.replace(`/onboarding/${client.id}`);
      return;
    }
    // Recognizes activation the moment it's happened (a coach can activate
    // while this exact screen is open in the client's own browser tab) and
    // routes them into their real daily experience rather than leaving them
    // stranded on a static "you're active" card.
    if (lifecycle === "active") {
      setActiveClientId(client.id);
      router.replace("/today");
    }
  }, [isPlatformHydrated, client, lifecycle, router, setActiveClientId]);

  if (!isPlatformHydrated) return null;

  if (!client) {
    return (
      <PhoneCanvas>
        <div className="flex min-h-screen flex-1 items-center justify-center px-6">
          <Card className="w-full max-w-sm text-center">
            <p className="text-sm text-neutral">No client found for this link.</p>
          </Card>
        </div>
      </PhoneCanvas>
    );
  }

  if (lifecycle === "coach_setup" || lifecycle === "ready_to_activate") {
    // Real, distinct state — never a fabricated "almost there" progress
    // bar. This page also auto-advances to /today the instant a coach
    // activates (see the effect above), so there is deliberately no
    // "Enter OPTIM" button here: nothing on this screen can move a client
    // into the app early, and pretending otherwise would be dishonest
    // about what "ready_to_activate" actually means.
    //
    // Phase 5.6A — for "coach_setup" this used to claim "{coachName} is
    // reviewing your answers and building your program" the instant a
    // client submitted, even though OPTIM's own draft generation hadn't
    // run yet — a real coach hadn't done anything at that moment. This now
    // attributes drafting to OPTIM (honest about what's actually
    // happening) and the coach's role to reviewing/approving it, and
    // distinguishes "still preparing" from "draft ready" using the same
    // real activation-generation record the coach's own client-detail page
    // reads (see lib/coach/plan-status.ts).
    const statusLine =
      lifecycle === "ready_to_activate"
        ? `Your program is built. ${coachName} just needs to start it.`
        : draftReadyForCoach
          ? `OPTIM has prepared your training and nutrition draft — ${coachName} is reviewing it now.`
          : `OPTIM is preparing your training and nutrition draft for ${coachName} to review.`;

    return (
      <OnboardingStage coachName={coachName}>
        <div className="flex min-h-[60vh] flex-col justify-center">
          <div className="mx-auto w-full max-w-sm text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success pc-success-pop">
              <CheckCircle2 size={22} aria-hidden="true" />
            </div>
            <p className="mt-4 text-label text-brass-strong">Sent to {coachName}.</p>
            <h1 className="mt-2 text-display text-off-white">{statusLine}</h1>

            {intendedProgram ? (
              <Card className="mt-6 text-left">
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-neutral">Start date</dt>
                    <dd className="text-off-white">{formatStartDate(intendedProgram.intendedStartDateIso)}</dd>
                  </div>
                </dl>
              </Card>
            ) : null}

            {lifecycle !== "ready_to_activate" ? (
              <p className="mt-4 text-sm text-neutral">Nothing becomes active for you until {coachName} approves it — feel free to close this page.</p>
            ) : null}

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
    if (lifecycle === "paused") {
      return {
        icon: <PauseCircle size={22} className="text-neutral" aria-hidden="true" />,
        title: "Your program is paused",
        body: `Your daily plan isn't active right now. Reach out to ${coachName} if you're ready to pick back up.`,
      };
    }
    if (lifecycle === "completed") {
      return {
        icon: <Flag size={22} className="text-neutral" aria-hidden="true" />,
        title: "Your program has wrapped up",
        body: `Nice work. Reach out to ${coachName} if you'd like to start something new.`,
      };
    }
    return {
      icon: <CheckCircle2 size={22} className="text-success" aria-hidden="true" />,
      title: "You're active",
      body: "Your daily plan is ready in the OPTIM app.",
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
