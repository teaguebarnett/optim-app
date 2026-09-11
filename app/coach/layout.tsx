import type { ReactNode } from "react";
import { CoachShell } from "@/components/coach/coach-shell";
import { resolveAppMode } from "@/lib/production/mode";

// Phase 6.0C fix: appMode is resolved server-side here (this layout is a
// Server Component) and passed down, so CoachShell can tell a real
// Supabase-mode proof page (app/coach/escalations, app/coach/campaigns,
// app/coach/clients/[clientId]/assign-live) apart from the demo prototype
// it otherwise renders chrome for — see coach-shell.tsx's own doc.
export default function CoachLayout({ children }: { children: ReactNode }) {
  return <CoachShell appMode={resolveAppMode()}>{children}</CoachShell>;
}
