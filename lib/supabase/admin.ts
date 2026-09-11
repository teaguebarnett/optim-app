// Phase 6.0A — Production Foundation.
//
// Privileged Supabase client using the service-role key, which bypasses RLS
// entirely. "server-only" guarded, and further: this module must only ever
// be imported from lib/production/invite.ts and other narrowly-scoped
// server-only admin operations — never from a route handler or Server
// Component that also handles ordinary request data, so a privileged
// operation is never one accidental extra call away from an unprivileged
// code path. No cookie handling at all: this client is never tied to an
// end user's session, only used for specific, narrowly-defined admin ops
// (creating an invited user, sending an invitation) explicitly authorized
// by a caller who has already been proven (via getSupabaseServerClient) to
// hold workspace-admin authority.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerConfig } from "../production/env";

// Typed via the exported `SupabaseClient` rather than `ReturnType<typeof
// createClient>` — the latter resolves its default generics in a way that
// makes `.from(table).select(...)` collapse to `never` on this SDK version
// once the client is cached in a reassigned `let` (see lib/production/
// chat.ts, the first caller to actually run `.from()` queries through this
// admin client rather than only `.auth.admin.*`).
let client: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (client) return client;
  const { url, serviceRoleKey } = getSupabaseServerConfig();
  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
