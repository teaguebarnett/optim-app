// Phase 6.0A — Production Foundation.
//
// Browser-side Supabase client factory. Safe to import from "use client"
// components: reads only the two NEXT_PUBLIC_ variables Next.js already
// inlines into the client bundle at build time (the anon key is designed to
// be public — every table it can touch is still gated by RLS, see the
// supabase/migrations/*_rls_policies.sql files). Never imports
// lib/production/env.ts (server-only, would fail the build) and never
// touches SUPABASE_SERVICE_ROLE_KEY, which has no NEXT_PUBLIC_ counterpart
// and so is architecturally unreachable from this file.

import { createBrowserClient } from "@supabase/ssr";
import { ProductionConfigError } from "../production/errors";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) throw new ProductionConfigError(missing);

  client = createBrowserClient(url!, anonKey!);
  return client;
}
