// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// Mirrors app/coach/page.tsx's own demo/Supabase split exactly: a Server
// Component resolves resolveAppMode() and renders either the existing demo
// roster (components/coach/demo-clients-page.tsx, extracted verbatim — no
// behavior change) or the real Supabase-mode roster
// (components/coach/live-clients-page.tsx).

import { resolveAppMode } from "@/lib/production/mode";
import { DemoClientsPage } from "@/components/coach/demo-clients-page";
import { LiveClientsPage } from "@/components/coach/live-clients-page";

export default function CoachClientsPage() {
  if (resolveAppMode() !== "supabase") return <DemoClientsPage />;
  return <LiveClientsPage />;
}
