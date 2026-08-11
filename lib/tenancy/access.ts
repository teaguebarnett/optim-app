// Centralized, workspace-aware access layer.
//
// Every read here requires an ActiveAppContext and derives its filtering
// from ctx.workspace.id / ctx.clientProfile.id / ctx.coachProfile.id —
// callers never pass a raw workspaceId to filter by hand. This is the layer
// that stands between "domain data" and "a component," so no screen can
// leak another workspace's or another client's records by forgetting a
// filter.
//
// IMPORTANT: this is frontend-only enforcement. It stops one workspace's
// UI code from *displaying* another workspace's data inside this prototype,
// but nothing here is a real security boundary — there is no server,
// database, or auth to actually stop a malicious client from bypassing it.
// See the Phase 2 final report for what real backend enforcement requires.

import { TenancyAccessError } from "./context.ts";
import { ALL_ASSIGNMENTS, ALL_CLIENT_PROFILES, ALL_COACH_PROFILES } from "./seed.ts";
import type {
  ActiveAppContext,
  ClientOwned,
  ClientProfile,
  ClientProfileId,
  CoachProfile,
  CoachProfileId,
  Role,
  WorkspaceId,
} from "./types";

export { TenancyAccessError };

// ---------------------------------------------------------------------------
// Permission helpers — use these instead of scattering role-string
// comparisons through components.
// ---------------------------------------------------------------------------

export function hasAnyRole(ctx: ActiveAppContext, roles: Role[]): boolean {
  return roles.includes(ctx.role);
}

export function isPlatformAdmin(ctx: ActiveAppContext): boolean {
  return ctx.role === "platform_admin";
}

export function isWorkspaceOwner(ctx: ActiveAppContext): boolean {
  return ctx.role === "workspace_owner";
}

/** A platform admin may eventually manage OPTIM and its workspaces; a
 * workspace owner may manage everything inside their own workspace. */
export function canManageWorkspace(ctx: ActiveAppContext): boolean {
  return ctx.role === "platform_admin" || ctx.role === "workspace_owner";
}

function assertSameWorkspace(ctx: ActiveAppContext, workspaceId: WorkspaceId): void {
  if (ctx.workspace.id !== workspaceId) {
    throw new TenancyAccessError("Requested record belongs to a different workspace.");
  }
}

/** Generic guard for any workspace-owned record — throws unless the record
 * belongs to the active workspace. Prefer this over ad hoc `=== workspaceId`
 * checks in components. */
export function assertInActiveWorkspace<T extends { workspaceId: WorkspaceId }>(
  ctx: ActiveAppContext,
  record: T
): T {
  assertSameWorkspace(ctx, record.workspaceId);
  return record;
}

/** Filters a list of workspace-owned records down to the active workspace.
 * This is the "don't rely on components remembering to filter" helper —
 * call it instead of writing `.filter(r => r.workspaceId === ...)` inline. */
export function scopeToActiveWorkspace<T extends { workspaceId: WorkspaceId }>(
  ctx: ActiveAppContext,
  records: T[]
): T[] {
  return records.filter((r) => r.workspaceId === ctx.workspace.id);
}

// ---------------------------------------------------------------------------
// Coach / client repository functions
// ---------------------------------------------------------------------------

/** Workspace owners and platform admins may list every client in the
 * workspace. Coaches and clients may not — use listCoachAssignedClients or
 * a client's own profile instead. */
export function listWorkspaceClients(ctx: ActiveAppContext): ClientProfile[] {
  if (!canManageWorkspace(ctx)) {
    throw new TenancyAccessError("Only a workspace owner or platform admin may list all workspace clients.");
  }
  return scopeToActiveWorkspace(ctx, ALL_CLIENT_PROFILES);
}

/** Clients assigned to one coach, scoped to the active workspace. Only that
 * coach (or a workspace owner / platform admin) may call this — a coach can
 * never retrieve another coach's roster, and can never see a client they
 * aren't assigned to. */
export function listCoachAssignedClients(ctx: ActiveAppContext, coachId: CoachProfileId): ClientProfile[] {
  if (!hasAnyRole(ctx, ["coach", "workspace_owner", "platform_admin"])) {
    throw new TenancyAccessError("Only a coach, workspace owner, or platform admin may list assigned clients.");
  }
  const coach = ALL_COACH_PROFILES.find((c) => c.id === coachId);
  if (!coach) throw new TenancyAccessError(`No coach found for id "${coachId}".`);
  assertSameWorkspace(ctx, coach.workspaceId);

  if (ctx.role === "coach" && ctx.coachProfile?.id !== coachId) {
    throw new TenancyAccessError("A coach may only list their own assigned clients.");
  }

  const assignedClientIds = new Set(
    ALL_ASSIGNMENTS.filter((a) => a.workspaceId === ctx.workspace.id && a.coachId === coachId).map(
      (a) => a.clientId
    )
  );
  return scopeToActiveWorkspace(ctx, ALL_CLIENT_PROFILES).filter((c) => assignedClientIds.has(c.id));
}

/**
 * Resolves one client profile under the active context's permissions:
 * - client role: only their own profile
 * - coach role: only a client they are assigned to
 * - workspace_owner / platform_admin: any client in the active workspace
 * Always throws (never returns undefined/partial data) when the boundary
 * is violated — this is the default-deny access check acceptance tests 7–9
 * exercise.
 */
export function getClientProfile(ctx: ActiveAppContext, clientId: ClientProfileId): ClientProfile {
  const client = ALL_CLIENT_PROFILES.find((c) => c.id === clientId);
  if (!client) throw new TenancyAccessError(`No client found for id "${clientId}".`);
  assertSameWorkspace(ctx, client.workspaceId);

  if (ctx.role === "client") {
    if (ctx.clientProfile?.id !== client.id) {
      throw new TenancyAccessError("A client may only access their own client-facing records.");
    }
    return client;
  }

  if (ctx.role === "coach") {
    if (!ctx.coachProfile) {
      throw new TenancyAccessError("This membership has no coach profile in the active workspace.");
    }
    const isAssigned = ALL_ASSIGNMENTS.some(
      (a) => a.workspaceId === ctx.workspace.id && a.coachId === ctx.coachProfile!.id && a.clientId === client.id
    );
    if (!isAssigned) {
      throw new TenancyAccessError("Coach is not assigned to this client.");
    }
    return client;
  }

  // workspace_owner / platform_admin: full workspace access.
  return client;
}

export function getPrimaryCoachForClient(ctx: ActiveAppContext, clientId: ClientProfileId): CoachProfile | null {
  const client = getClientProfile(ctx, clientId);
  return ALL_COACH_PROFILES.find((c) => c.id === client.primaryCoachId) ?? null;
}

// ---------------------------------------------------------------------------
// Generic client-owned record scoping (messages, review requests, pain
// reports, and anything else shaped like { workspaceId, clientId }).
// ---------------------------------------------------------------------------

/**
 * Scopes a list of client-owned records (messages, review requests, pain
 * reports, ...) to what the active context is allowed to see:
 * - client role: only their own records
 * - coach role: only records belonging to clients they're assigned to
 * - workspace_owner / platform_admin: every record in the active workspace
 *
 * The records array stands in for a future backend query — in this
 * prototype it's an in-memory/fixture array (see lib/tenancy/seed.ts), but
 * the filtering rule is the same rule a real query would need to apply.
 */
export function scopeClientOwnedRecords<T extends ClientOwned>(ctx: ActiveAppContext, records: T[]): T[] {
  const inWorkspace = scopeToActiveWorkspace(ctx, records);

  if (ctx.role === "client") {
    if (!ctx.clientProfile) {
      throw new TenancyAccessError("This membership has no client profile in the active workspace.");
    }
    const ownClientId = ctx.clientProfile.id;
    return inWorkspace.filter((r) => r.clientId === ownClientId);
  }

  if (ctx.role === "coach") {
    if (!ctx.coachProfile) {
      throw new TenancyAccessError("This membership has no coach profile in the active workspace.");
    }
    const assignedClientIds = new Set(listCoachAssignedClients(ctx, ctx.coachProfile.id).map((c) => c.id));
    return inWorkspace.filter((r) => assignedClientIds.has(r.clientId));
  }

  // workspace_owner / platform_admin
  return inWorkspace;
}
