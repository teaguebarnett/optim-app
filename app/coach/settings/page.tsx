// Gate 6C — this used to be a single "use client" component that called
// usePrototypeState()/useCoachWorkspace() unconditionally, with no
// resolveAppMode() branch at all — unlike every other coach route (see
// app/coach/page.tsx, app/coach/clients/page.tsx). In Supabase mode those
// hooks resolve identity through a CLIENT bootstrap action
// (getMySupabaseAppStateAction), which a coach's own session either
// returns "not_provisioned" from or leaves silently pointed at demo
// fallback data — never this coach's real workspace. Splitting this the
// same way every other coach route already is fixes that: demo mode is
// byte-for-byte unchanged (components/coach/demo-coach-settings-page.tsx
// is the old body, untouched), Supabase mode gets its own real,
// workspace-scoped data path (components/coach/live-coach-settings-page.tsx).

import { resolveAppMode } from "@/lib/production/mode";
import { DemoCoachSettingsPage } from "@/components/coach/demo-coach-settings-page";
import { LiveCoachSettingsPage } from "@/components/coach/live-coach-settings-page";

export default function CoachSettingsPage() {
  if (resolveAppMode() !== "supabase") return <DemoCoachSettingsPage />;
  return <LiveCoachSettingsPage />;
}
