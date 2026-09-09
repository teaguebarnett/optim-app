// Phase 6.0A — Production Foundation.
//
// Server-only Supabase client factory (Server Components, Route Handlers,
// Server Actions). Uses @supabase/ssr's current cookies:{getAll,setAll}
// shape — NOT the deprecated get/set/remove trio some older tutorials still
// show — and next/headers' cookies(), which is an ASYNC function in this
// Next.js version (16.2.12; confirmed against
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md
// per this repo's own AGENTS.md instruction to verify rather than assume).
//
// Per that same cookies() doc: "Setting cookies is not supported during
// Server Component rendering." A Server Component calling
// getSupabaseServerClient() can still read the session fine, but a
// same-request token refresh's Set-Cookie write will throw there — caught
// and ignored below, exactly as @supabase/ssr's own docs recommend, because
// proxy.ts (this project's session-refresh boundary — see that file) is
// what actually keeps the session cookie fresh on every navigation. A
// Route Handler or Server Action calling this, by contrast, CAN write
// cookies, and does.

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServerConfig } from "../production/env";

export async function getSupabaseServerClient() {
  const { url, anonKey } = getSupabaseServerConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component during rendering — see this
          // file's own doc above. proxy.ts's session refresh already keeps
          // the cookie current for the next request.
        }
      },
    },
  });
}
