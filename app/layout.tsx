import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { PrototypeStateProvider } from "@/hooks/use-prototype-state";
import { PlatformStateProvider } from "@/hooks/use-platform-state";
import { WorkspaceTheme } from "@/components/app-shell/workspace-theme";
import { RoleRouteBoundary } from "@/components/app-shell/role-route-boundary";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM } from "@/lib/tenancy/seed";
import { resolveAppMode } from "@/lib/production/mode";

// OPTIM's one typeface. Per the Visual Constitution §10, hierarchy comes
// from scale, weight, line-height, tracking, and spatial placement — never
// from switching font families. See the text-* semantic tokens in
// globals.css.
const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Static route metadata is resolved at build/module-load time, outside the
// React tree, so it can't go through useActiveContext() — it still reads
// from the same centralized tenancy seed data rather than a separate
// hardcoded string.
export const metadata: Metadata = {
  title: WORKSPACE_OPTIM.branding.businessName,
  description: `Your daily coaching plan from ${COACH_PROFILE_TEAGUE.displayName} — training, nutrition, and progress in one place.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4efe3",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Server-resolved once, here, and passed down as a plain prop — never
  // computed/inferred client-side. See lib/production/mode.ts's module doc:
  // a "use client" component that tried to read APP_MODE itself would just
  // get undefined, by design.
  const appMode = resolveAppMode();
  return (
    <html lang="en" className={`${manrope.variable} h-full`}>
      <body className="min-h-full bg-near-black text-off-white antialiased">
        {/* PlatformStateProvider wraps PrototypeStateProvider (not the
            reverse, as before Phase 5.0B) so the client-app session can
            resolve a coach-created client's identity from the platform
            store — see hooks/use-prototype-state.tsx's activeContext.
            Irrelevant in Supabase mode (PrototypeStateProvider's own
            Supabase bootstrap never reads from it), kept wrapping anyway
            so demo mode's behavior stays byte-for-byte unchanged. */}
        <PlatformStateProvider>
          <PrototypeStateProvider appMode={appMode}>
            <WorkspaceTheme />
            <RoleRouteBoundary>{children}</RoleRouteBoundary>
          </PrototypeStateProvider>
        </PlatformStateProvider>
      </body>
    </html>
  );
}
