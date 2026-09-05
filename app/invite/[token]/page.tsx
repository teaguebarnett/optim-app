"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PhoneCanvas } from "@/components/app-shell/phone-canvas";
import { OnboardingStage } from "@/components/onboarding/onboarding-stage";
import { CoachWelcome } from "@/components/onboarding/coach-welcome";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import { usePlatformState } from "@/hooks/use-platform-state";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { getClientLifecycle, getClientProfile, getInvitationByToken, getIntendedProgram } from "@/lib/coach/repository";
import { resolveHomeRoute } from "@/lib/coach/routing";
import { ALL_COACH_PROFILES } from "@/lib/tenancy/seed";

/**
 * Public invitation acceptance — deliberately outside the role/lifecycle
 * routing boundary (see lib/coach/routing.ts's module doc): a brand-new
 * client has no session of their own in this no-auth prototype, so this
 * page resolves everything directly from the token instead. Accepting just
 * marks the invitation opened and moves the client into onboarding — see
 * lib/coach/platform-store.ts's ACCEPT_INVITATION.
 *
 * Phase 5.2 — the "arrival" moment: renders the instant the platform store
 * hydrates (see components/app-shell/role-route-boundary.tsx — a public
 * route like this one no longer also waits on the unrelated, heavier
 * per-client AppState), a white-glove welcome rather than administrative
 * intake framing. Never mentions an AI assistant — onboarding is
 * deliberately coach-led start to finish.
 *
 * This is also the ONE link a coach reuses for the rest of that client's
 * lifecycle ("Open as client" in the coach workspace always opens this same
 * URL): re-opening it never restarts or re-shows the welcome once the
 * client has moved past "invited". An already-active client is switched
 * into and routed straight to their own /today.
 */
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { platform, dispatch, isPlatformHydrated } = usePlatformState();
  const { setActiveClientId } = usePrototypeState();

  const invitation = isPlatformHydrated ? getInvitationByToken(platform, params.token) : null;
  const client = invitation ? getClientProfile(platform, invitation.clientId) : null;
  const lifecycle = client ? getClientLifecycle(platform, client.id) : null;
  const intendedProgram = client ? getIntendedProgram(platform, client.id) : null;

  useEffect(() => {
    if (!isPlatformHydrated || !client || !lifecycle) return;
    if (lifecycle === "invited") return;
    if (lifecycle === "active") setActiveClientId(client.id);
    router.replace(resolveHomeRoute("client", lifecycle, client.id));
  }, [isPlatformHydrated, client, lifecycle, router, setActiveClientId]);

  if (!isPlatformHydrated) return null;

  if (!invitation || !client) {
    return (
      <PhoneCanvas>
        <div className="flex min-h-screen flex-1 items-center justify-center px-6">
          <Card className="w-full max-w-sm text-center">
            <p className="text-sm font-medium text-off-white">This invitation link isn&apos;t valid.</p>
            <p className="mt-2 text-sm text-neutral">It may have been created for a different environment, or the link was mistyped.</p>
          </Card>
        </div>
      </PhoneCanvas>
    );
  }

  if (lifecycle !== "invited") {
    // The effect above is already redirecting — render nothing rather than
    // flashing the welcome for a client who's already past it.
    return null;
  }

  const coach = ALL_COACH_PROFILES.find((c) => c.id === client.primaryCoachId);
  const firstName = client.name.split(" ")[0];

  function handleAccept() {
    dispatch({ type: "ACCEPT_INVITATION", token: params.token, nowIso: new Date().toISOString() });
    router.push(`/onboarding/${client!.id}`);
  }

  return (
    <RequireThemeChoice accountKind="client" accountId={client.id}>
      <OnboardingStage coachName={coach?.displayName} coachInitials={coach?.avatarInitials}>
        <CoachWelcome coach={coach} firstName={firstName} intendedStartDateIso={intendedProgram?.intendedStartDateIso} onContinue={handleAccept} />
      </OnboardingStage>
    </RequireThemeChoice>
  );
}
