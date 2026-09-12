// Phase 6.1A — Secure Founder Command Center.
//
// The platform-role analog of lib/production/auth.ts's getAuthenticatedContext
// / requireWorkspaceRole — except scoped to public.platform_administrators
// (see supabase/migrations/20260911000017_platform_roles.sql), a table with
// NO relationship to workspace_memberships at all. A platform_owner may hold
// zero workspace memberships and still administer the whole platform; an
// ordinary coach/workspace_owner holds no platform_administrators row and
// must never be treated as one no matter which workspace role they carry.
//
// IMPORTANT NAMING NOTE (same one that file's own migration documents):
// public.app_role already has a value literally spelled 'platform_admin'
// that means "full admin authority inside one workspace"
// (ProductionRole/app_private.is_workspace_admin). PlatformRole below is a
// completely separate namespace — cross-workspace platform authority — and
// the two must never be confused. Every export in this file is named
// Platform* specifically to keep that visually distinct at every call site.
//
// This module only ever resolves the check through the caller's own
// RLS-governed session (getSupabaseServerClient) — never the service-role
// admin client. That is deliberate: "who am I, and do I hold a platform
// role" must be answerable the same fail-closed way every other identity
// check in this codebase is, before anything privileged is ever attempted.
// lib/production/platform-operations.ts is the one place that, AFTER this
// check has already passed, uses the admin client for the actual privileged
// cross-workspace reads — see that file's own threat-model doc.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { UnauthenticatedError, UnauthorizedError } from "./errors.ts";

export type PlatformRole = "platform_owner" | "platform_admin" | "platform_analyst";

export interface PlatformAuthContext {
  userId: string;
  displayName: string;
  role: PlatformRole;
  status: "active" | "revoked";
}

/** Thrown when the caller is authenticated but holds no ACTIVE
 * platform_administrators row. Distinct from UnauthorizedError so callers
 * can render "you don't hold a platform role" rather than a generic
 * workspace-authorization message. */
export class PlatformAccessDeniedError extends Error {
  constructor(message = "The current session does not hold an active platform administration role.") {
    super(message);
    this.name = "PlatformAccessDeniedError";
  }
}

/** Resolves the current caller's platform role, entirely from their own
 * RLS-governed session — platform_administrators_select's own policy (see
 * the migration) already limits a plain user to reading only their own row,
 * which is exactly the one row this function needs. Throws
 * UnauthenticatedError with no session, PlatformAccessDeniedError for an
 * authenticated user with no active platform role — never returns a
 * "guest"/demo stand-in for either case. */
export async function getPlatformAuthContext(): Promise<PlatformAuthContext> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new UnauthenticatedError();

  const { data: adminRow, error: adminError } = await supabase
    .from("platform_administrators")
    .select("role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (adminError) throw new Error(`getPlatformAuthContext failed: ${adminError.message}`);
  if (!adminRow) throw new PlatformAccessDeniedError();

  const { data: profile, error: profileError } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
  if (profileError || !profile) throw new UnauthenticatedError(`Authenticated Supabase user ${user.id} has no profiles row.`);

  return {
    userId: user.id,
    displayName: profile.display_name as string,
    role: adminRow.role as PlatformRole,
    status: adminRow.status as "active" | "revoked",
  };
}

/** Throws PlatformAccessDeniedError unless the context's role is one of
 * allowedRoles. Every /admin page, server action, and repository method that
 * performs a privileged platform-wide read calls this (via
 * getPlatformAuthContext + requirePlatformRole together) before touching any
 * data — RLS's own self-select policy remains the backstop, never the
 * primary gate, mirroring lib/production/auth.ts's requireWorkspaceRole
 * doc exactly. */
export function requirePlatformRole(context: PlatformAuthContext, allowedRoles: PlatformRole[]): PlatformAuthContext {
  if (!allowedRoles.includes(context.role)) {
    throw new UnauthorizedError(`Platform user ${context.userId} does not hold one of [${allowedRoles.join(", ")}] (has: ${context.role}).`);
  }
  return context;
}

/** Convenience combining both steps — the one call every admin page/repo
 * method actually needs. */
export async function requirePlatformAuth(allowedRoles: PlatformRole[]): Promise<PlatformAuthContext> {
  const ctx = await getPlatformAuthContext();
  return requirePlatformRole(ctx, allowedRoles);
}

export const PLATFORM_STAFF_ROLES: PlatformRole[] = ["platform_owner", "platform_admin", "platform_analyst"];
export const PLATFORM_ADMIN_ROLES: PlatformRole[] = ["platform_owner", "platform_admin"];
