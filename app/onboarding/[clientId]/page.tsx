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

import { resolveAppMode } from "@/lib/production/mode";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { LiveOnboardingWizard } from "@/components/onboarding/live-onboarding-wizard";

export default async function OnboardingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (resolveAppMode() === "supabase") return <LiveOnboardingWizard clientId={clientId} />;
  return <OnboardingWizard clientId={clientId} />;
}
