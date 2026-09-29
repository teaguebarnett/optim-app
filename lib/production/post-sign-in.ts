// Server-side half of lib/auth/post-sign-in.ts: resolves the caller's real
// access from their own RLS-governed session, using the same three checks
// the /admin, /coach and (client) layouts gate on. Read-only; a failed
// lookup counts as "no access" for that area (fail closed), never as access.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getAuthenticatedContext, isWorkspaceStaffRole } from "./auth.ts";
import type { SignInAccess } from "../auth/post-sign-in.ts";

/** Throws UnauthenticatedError (from getAuthenticatedContext) with no session. */
export async function resolveSignInAccess(): Promise<SignInAccess> {
  const ctx = await getAuthenticatedContext();
  const supabase = await getSupabaseServerClient();

  const [platformRow, clientRow] = await Promise.all([
    supabase.from("platform_administrators").select("user_id").eq("user_id", ctx.userId).eq("status", "active").maybeSingle(),
    supabase.from("client_profiles").select("id").eq("user_id", ctx.userId).maybeSingle(),
  ]);

  return {
    isPlatformStaff: !platformRow.error && !!platformRow.data,
    isWorkspaceStaff: ctx.memberships.some((m) => isWorkspaceStaffRole(m.role)),
    isClient: !clientRow.error && !!clientRow.data,
  };
}
