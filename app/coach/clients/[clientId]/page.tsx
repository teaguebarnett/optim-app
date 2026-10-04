// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// Mirrors app/coach/page.tsx's own demo/Supabase split: a Server Component
// resolves resolveAppMode() and renders either the existing demo client
// workspace (components/coach/demo-client-workspace-page.tsx, extracted
// verbatim — no behavior change) or the real Supabase-mode client detail
// (components/coach/live-client-workspace.tsx).

import { resolveAppMode } from "@/lib/production/mode";
import { DemoClientWorkspacePage } from "@/components/coach/demo-client-workspace-page";
import { LiveClientWorkspace } from "@/components/coach/live-client-workspace";

// Gate 4.0C-4 — the Fitness Reasoner prepares proposals in the background
// (after()) on this route's server actions; a real run takes ~90–120 s, so the
// route's function limit must cover it. The coach's request itself returns
// immediately.
export const maxDuration = 300;

export default async function CoachClientWorkspaceRoute({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (resolveAppMode() !== "supabase") return <DemoClientWorkspacePage />;
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  // Only a known notice key is passed through; it selects a fixed message.
  const notice = query.notice === "proposal-rejected" ? "proposal-rejected" : null;
  return <LiveClientWorkspace clientId={clientId} notice={notice} />;
}
