// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// Mirrors app/(client)/chat/page.tsx's own mode split exactly: a Server
// Component resolves resolveAppMode() (server-only, never client-inferable
// — see lib/production/mode.ts) and renders either the existing demo-mode
// OnboardingWizard (unchanged — no `live` prop, reads/writes through
// usePlatformState()'s platform-store dispatch) or LiveOnboardingWizard,
// which bootstraps this authenticated client's real Supabase identity/
// progress and hands it to that SAME OnboardingWizard component through its
// `live` prop — see that component's own OnboardingWizardLiveSource doc for
// why this is "reuse the strongest existing demo UI," never a second
// competing implementation.

import { redirect } from "next/navigation";
import { resolveAppMode } from "@/lib/production/mode";
import { getOwnLifecycleStatus } from "@/lib/production/roster";
import { clientOnboardingRedirect, resolveHomeRoute } from "@/lib/coach/routing";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { LiveOnboardingWizard } from "@/components/onboarding/live-onboarding-wizard";

export default async function OnboardingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (resolveAppMode() === "supabase") {
    // Gate 4.0B — decided server-side from the client's real lifecycle: a
    // client who has finished onboarding is never sent through it again,
    // and a link carrying someone else's id lands on the caller's own
    // onboarding. (A caller who isn't a client falls through to the wizard,
    // which shows its own honest error.)
    let destination: string | null = null;
    try {
      const status = await getOwnLifecycleStatus();
      if (!clientOnboardingRedirect(status.lifecycle, status.clientId)) destination = resolveHomeRoute("client", status.lifecycle, status.clientId);
      else if (status.clientId !== clientId) destination = `/onboarding/${status.clientId}`;
    } catch {
      destination = null;
    }
    if (destination) redirect(destination);
    return <LiveOnboardingWizard clientId={clientId} />;
  }
  return <OnboardingWizard clientId={clientId} />;
}
