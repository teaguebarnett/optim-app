"use client";

import type { ReactNode } from "react";
import { Header } from "@/components/app-shell/header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { PhoneCanvas } from "@/components/app-shell/phone-canvas";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import { usePrototypeState } from "@/hooks/use-prototype-state";

// WorkspaceTheme is mounted once in the root layout (app/layout.tsx) so its
// runtime branding override applies globally, not just to the client shell
// — see that file and components/app-shell/workspace-theme.tsx.
export function AppShell({ children, themeDefault }: { children: ReactNode; themeDefault?: "light" | "dark" }) {
  const { activeContext, isHydrated } = usePrototypeState();
  const clientId = activeContext.clientProfile?.id;

  // Waits for the real active client id to be resolved before gating on
  // appearance — never briefly shows the selector for the wrong (stale
  // default) account. Matches every other hydration-gated render in this
  // app (see hooks/use-prototype-state.tsx's isHydrated).
  if (!isHydrated || !clientId) return null;

  return (
    <RequireThemeChoice accountKind="client" accountId={clientId} defaultMode={themeDefault}>
      <PhoneCanvas>
        <div className="flex min-h-screen flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">
          <Header />
          <main className="mx-auto w-full max-w-lg flex-1 pb-28">{children}</main>
        </div>
        <BottomNav />
      </PhoneCanvas>
    </RequireThemeChoice>
  );
}
