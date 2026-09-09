// Phase 6.0A — Production Foundation.
//
// Session-refresh boundary. Named proxy.ts / exports `proxy()` rather than
// the classic middleware.ts / `middleware()` — Next.js 16 renamed the
// convention (confirmed against
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md and
// .../03-file-conventions/proxy.md, per this repo's own AGENTS.md
// instruction to verify rather than assume trained-on Next.js conventions
// still apply). Proxy runs on the Node.js runtime only in this version — no
// edge-runtime constraint to work around, unlike older Supabase/Next.js SSR
// guides written before that changed.
//
// A complete no-op in demo mode — this file must never affect the existing
// localStorage-driven prototype's behavior. Only does anything at all when
// APP_MODE=supabase.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  if (process.env.APP_MODE !== "supabase") return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Config error, never a silent demo-content fallback — Part 1's
    // explicit "missing Supabase config in supabase mode = clear config
    // error not demo content" requirement, enforced at the very first
    // point every request passes through.
    return new NextResponse(
      "Supabase configuration is missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). See .env.example.",
      { status: 500 }
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // A real network round-trip to Supabase Auth, not a local-only JWT
  // decode — this is what catches a revoked/expired session instead of
  // trusting a stale cookie, and writes a refreshed Set-Cookie when needed.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Excludes static assets and common image extensions — proxy running on
  // every request is fine cost-wise for a session refresh, but there is no
  // reason to hit Supabase Auth for a favicon or a stylesheet.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
