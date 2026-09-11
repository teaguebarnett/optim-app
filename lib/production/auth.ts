// Phase 6.0A — Production Foundation.
//
// The Supabase-mode analog of lib/tenancy/context.ts's resolveActiveContext
// — except identity and role are resolved ONLY from a server-verified
// Supabase session plus a real database membership query, never from
// localStorage, a URL param, a demo persona selector, or a client-supplied
// workspace id. This is what Part 2's "in Supabase mode active
// identity/workspace derive from authenticated user + DB membership only"
// requirement actually means in code: there is no code path here that
// trusts anything the browser merely claims about who it is.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { UnauthenticatedError, UnauthorizedError } from "./errors.ts";

export type ProductionRole = "platform_admin" | "workspace_owner" | "coach" | "client";

export interface ProductionProfile {
  id: string;
  displayName: string;
  email: string | null;
  avatarInitials: string | null;
}

export interface ProductionWorkspaceMembership {
  workspaceId: string;
  role: ProductionRole;
  status: "active" | "revoked";
}

export interface ProductionAuthContext {
  userId: string;
  profile: ProductionProfile;
  memberships: ProductionWorkspaceMembership[];
}

/** Resolves the current caller's identity and every active workspace
 * membership they hold, entirely server-side. Throws UnauthenticatedError
 * — never returns a "guest"/demo stand-in — when there is no verified
 * Supabase session. A profiles row not existing yet for a real,
 * authenticated auth.users id would mean handle_new_user's trigger (see
 * supabase/migrations/20260909000002_core_identity.sql) failed to run,
 * which is a real data-integrity fault, not something to paper over with a
 * placeholder profile — so that case also throws, rather than silently
 * fabricating one. */
export async function getAuthenticatedContext(): Promise<ProductionAuthContext> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new UnauthenticatedError();
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_initials")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new UnauthenticatedError(`Authenticated Supabase user ${user.id} has no profiles row.`);
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("workspace_memberships")
    .select("workspace_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipsError) {
    throw new UnauthenticatedError(`Failed to resolve workspace memberships: ${membershipsError.message}`);
  }

  return {
    userId: user.id,
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      email: profile.email,
      avatarInitials: profile.avatar_initials,
    },
    memberships: (memberships ?? []).map((m) => ({
      workspaceId: m.workspace_id,
      role: m.role as ProductionRole,
      status: m.status as "active" | "revoked",
    })),
  };
}

/** Throws UnauthorizedError unless the current context holds one of
 * allowedRoles in the given workspace. Route handlers and Server Actions
 * that perform a privileged write call this before doing anything else —
 * never rely on RLS alone to be the only backstop for a server-side
 * decision, per Part 2's "protect ... privileged actions with
 * server-verified claims, never authorize from an unvalidated client
 * session object." RLS remains the backstop of last resort if this check
 * is ever skipped, not the primary gate. */
export function requireWorkspaceRole(
  context: ProductionAuthContext,
  workspaceId: string,
  allowedRoles: ProductionRole[]
): ProductionWorkspaceMembership {
  const membership = context.memberships.find((m) => m.workspaceId === workspaceId);
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new UnauthorizedError(
      `User ${context.userId} does not hold one of [${allowedRoles.join(", ")}] in workspace ${workspaceId}.`
    );
  }
  return membership;
}

export function isWorkspaceStaffRole(role: ProductionRole): boolean {
  return role === "platform_admin" || role === "workspace_owner" || role === "coach";
}

/** Resolves the caller's own staff workspace server-side — the one place
 * this lookup exists (Phase 6.0D-A: previously duplicated between
 * app/actions/coach-communications.ts and lib/production/coach-operations.ts,
 * now shared here since both need exactly the same "which workspace, as
 * which coach" answer). A coach who somehow holds staff membership in more
 * than one workspace gets the first one deterministically; every coach
 * surface in the app is scoped to one workspace at a time by design. */
export async function resolveOwnStaffWorkspace(): Promise<{ workspaceId: string; coachDisplayName: string }> {
  const ctx = await getAuthenticatedContext();
  const staff = ctx.memberships.find((m) => isWorkspaceStaffRole(m.role));
  if (!staff) throw new UnauthorizedError("The current session holds no coach/owner membership in any workspace.");
  return { workspaceId: staff.workspaceId, coachDisplayName: ctx.profile.displayName };
}
