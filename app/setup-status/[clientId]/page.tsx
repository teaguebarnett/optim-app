// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// Mirrors app/(client)/chat/page.tsx's own mode split: demo mode's existing
// behavior (components/onboarding/demo-setup-status.tsx, extracted verbatim
// — see that file's own doc) is untouched; Supabase mode renders the real
// sibling (components/onboarding/live-setup-status.tsx).

import { resolveAppMode } from "@/lib/production/mode";
import { DemoSetupStatus } from "@/components/onboarding/demo-setup-status";
import { LiveSetupStatus } from "@/components/onboarding/live-setup-status";

export default async function SetupStatusPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (resolveAppMode() === "supabase") return <LiveSetupStatus clientId={clientId} />;
  return <DemoSetupStatus clientId={clientId} />;
}
