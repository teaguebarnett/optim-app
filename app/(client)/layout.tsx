import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/shell";

// Route group only — excluded from the URL (still /today, /training, etc.).
// Isolates the existing mobile client chrome (Header + bottom nav) from the
// coach workspace's own shell (see app/coach/layout.tsx), without changing
// any client route's actual path. See lib/coach/routing.ts for the
// role/lifecycle rules that decide who's allowed to land here.
export default function ClientRouteGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
