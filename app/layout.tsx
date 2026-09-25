import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { PrototypeStateProvider } from "@/hooks/use-prototype-state";
import { PlatformStateProvider } from "@/hooks/use-platform-state";
import { WorkspaceTheme } from "@/components/app-shell/workspace-theme";
import { RoleRouteBoundary } from "@/components/app-shell/role-route-boundary";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM } from "@/lib/tenancy/seed";
import { resolveAppMode } from "@/lib/production/mode";

// Security fix (Sept 2026 Netlify incident): forces every route in this app
// to render fresh, per request — never statically prerendered and cached.
// Without this, `next build` bakes resolveAppMode()'s result (and every
// auth check downstream of it, including app/coach/layout.tsx and
// app/admin/layout.tsx's own real getAuthenticatedContext() calls) into a
// static HTML file the instant Next.js's build-time dynamic-API detection
// doesn't happen to execute a cookies()/headers() call — which it won't
// whenever a route's `if (appMode !== "supabase") { ...demo path with no
// auth call... }` branch is the one actually taken during that particular
// build. Confirmed directly: building with APP_MODE unset (demo) marked
// /today, /coach, /admin, and /coach-onboarding "○ (Static)"; the exact
// same code, built with APP_MODE=supabase, marked them "ƒ (Dynamic)". A
// production deploy built without APP_MODE=supabase present in the BUILD
// environment (as opposed to whatever's configured for the deployed
// runtime) would silently freeze every one of those pages as demo-mode,
// no-auth HTML forever — regardless of any runtime env var, and regardless
// of how correct the per-request auth logic itself is. See
// node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md's
// `dynamic` route segment config doc (Cache Components is off in this
// project's next.config.ts, so this option is still live in this Next.js
// version — AGENTS.md's "verify, don't assume" applies here too, since
// v16.0.0 removed it when Cache Components is enabled).
export const dynamic = "force-dynamic";

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
            <RoleRouteBoundary appMode={appMode}>{children}</RoleRouteBoundary>
          </PrototypeStateProvider>
        </PlatformStateProvider>
      </body>
    </html>
  );
}
