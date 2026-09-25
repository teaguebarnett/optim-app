// Phase 6.0A — Production Foundation.
//
// The one centralized demo-vs-Supabase runtime mode boundary. Every other
// production/auth/tenancy module in lib/production and lib/supabase treats
// resolveAppMode() as the single source of truth for which mode is active —
// never a second, independent env read of APP_MODE anywhere else in the
// codebase.
//
// Security posture: APP_MODE is deliberately NOT prefixed NEXT_PUBLIC_, so
// Next.js never inlines it into a client bundle — a "use client" component
// that tries to read it gets undefined, full stop, not a stale or
// spoofable copy of the server's decision. That is what "security must
// never depend on a browser-controlled NEXT_PUBLIC_* switch" actually
// means here: the switch that matters is architecturally unreachable from
// the browser, not just conventionally trusted not to be read there. This
// module itself is guarded with the `server-only` package, so an accidental
// import from a client component fails the build instead of silently
// shipping this logic (and the trust decision it represents) into the
// bundle.
//
// A client component that needs to know the active mode for cosmetic
// purposes (which sign-in screen to render, for example) must receive it
// as a prop passed down from a Server Component that called
// resolveAppMode() itself — never compute or infer it client-side.

import "server-only";

export type AppMode = "demo" | "supabase";

/** True for a real production deployment, on either host this app has
 * actually been deployed to. VERCEL_ENV="production" is Vercel's own
 * system env var (not user-editable, unset outside Vercel); CONTEXT="production"
 * is Netlify's equivalent, injected into both the build and the deployed
 * Next.js runtime by @netlify/plugin-nextjs ("deploy-preview"/"branch-deploy"
 * are Netlify's own non-production contexts and never match here). This
 * used to check VERCEL_ENV only — on the Netlify production deploy, that
 * was always false, so the "production must be supabase" gate below never
 * fired and a misconfigured/missing APP_MODE silently ran full demo mode
 * in production. Local `next build`/`next dev` set neither var, so this
 * stays false there. */
function isRealProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.CONTEXT === "production";
}

/** Resolves which runtime mode is active. Defaults to "demo" everywhere
 * except a real Vercel Production deploy, where APP_MODE must be exactly
 * "supabase" or this throws — Part 1's "production build must reject demo
 * mode" requirement, enforced here rather than left to be remembered at
 * deploy-config time. A Preview deployment MAY run APP_MODE=demo (useful
 * for QA/design review against fixture data) or APP_MODE=supabase (to
 * rehearse the real thing against a staging project) — both are legitimate
 * choices for Preview, so only Production is hard-gated. */
export function resolveAppMode(): AppMode {
  const raw = process.env.APP_MODE;
  const mode: AppMode = raw === "supabase" ? "supabase" : "demo";

  if (isRealProductionDeploy() && mode !== "supabase") {
    throw new Error(
      `Refusing to start: this is a Vercel Production deployment (VERCEL_ENV=production) but APP_MODE is "${raw ?? "unset"}", not "supabase". ` +
        `Set APP_MODE=supabase in the Production environment's variables. Demo mode is not a valid Production configuration.`
    );
  }

  return mode;
}

export function isSupabaseMode(): boolean {
  return resolveAppMode() === "supabase";
}

export function isDemoMode(): boolean {
  return resolveAppMode() === "demo";
}
