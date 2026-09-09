// Phase 6.0A — Production Foundation.
//
// Centralized, validated environment access for Supabase mode. Every
// server-only module that needs a Supabase URL/key reads it through here,
// never through a direct process.env access of its own — one place to
// validate, one place to update if a variable is ever renamed.
//
// "server-only" guards this module: importing it from a "use client"
// component fails the build. Client components that need a Supabase
// browser client use lib/supabase/browser.ts instead, which reads the two
// NEXT_PUBLIC_ variables directly (safe — see that file's own doc) and
// never imports this module.

import "server-only";
import { ProductionConfigError } from "./errors";

interface SupabaseServerConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  siteUrl: string;
}

let cached: SupabaseServerConfig | null = null;

/** Validates every Supabase-mode-required variable at once and reports
 * every missing one together — never a single "X is undefined" crash from
 * whichever call site happened to read it first, which is what "missing
 * Supabase config in supabase mode = clear config error not demo content"
 * actually requires: a caller (a page, a route handler) must be able to
 * catch ProductionConfigError once and render one honest message, not
 * chase down N separate undefined-reference crashes one deploy at a time. */
export function getSupabaseServerConfig(): SupabaseServerConfig {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!siteUrl) missing.push("NEXT_PUBLIC_SITE_URL");

  if (missing.length > 0) {
    throw new ProductionConfigError(missing);
  }

  cached = { url: url!, anonKey: anonKey!, serviceRoleKey: serviceRoleKey!, siteUrl: siteUrl! };
  return cached;
}

/** Test-only escape hatch so lib/production/verify-*.mts can exercise
 * missing-config behavior deterministically without mutating the real
 * process.env across test cases. Never called from application code. */
export function __resetSupabaseServerConfigCacheForTests(): void {
  cached = null;
}
