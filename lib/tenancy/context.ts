// Central active application context.
//
// This is the one place that resolves "who is acting, in which workspace,
// with what role, and what identity/config applies" — components consume
// the result instead of importing CLIENT/COACH mock constants or hardcoding
// business/coach/assistant names. Resolution is default-deny: if the user,
// workspace, or membership can't all be found together, nothing is
// returned/thrown silently succeeds with partial data.

import {
  ALL_CLIENT_PROFILES,
  ALL_COACH_PROFILES,
  ALL_MEMBERSHIPS,
  ALL_USERS,
  ALL_WORKSPACES,
  DEMO_CLIENT_SESSION,
} from "./seed.ts";
import type { ActiveAppContext, SessionPointer, Workspace } from "./types";

export class TenancyAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenancyAccessError";
  }
}

function findWorkspace(workspaceId: string): Workspace | null {
  return ALL_WORKSPACES.find((w) => w.id === workspaceId) ?? null;
}

/**
 * Resolves the full active context for a session pointer. Throws
 * TenancyAccessError — never returns a partially-filled context — if the
 * user, workspace, or the user's membership in that workspace is missing.
 * This is the default-deny boundary required by Phase 2: a missing
 * workspace/membership/role must fail safely rather than silently falling
 * back to some default identity.
 */
export function resolveActiveContext(session: SessionPointer): ActiveAppContext {
  const user = ALL_USERS.find((u) => u.id === session.userId);
  if (!user) {
    throw new TenancyAccessError(`No user found for id "${session.userId}".`);
  }

  const workspace = findWorkspace(session.workspaceId);
  if (!workspace) {
    throw new TenancyAccessError(`No workspace found for id "${session.workspaceId}".`);
  }

  const membership = ALL_MEMBERSHIPS.find(
    (m) => m.userId === session.userId && m.workspaceId === session.workspaceId
  );
  if (!membership) {
    throw new TenancyAccessError(
      `User "${session.userId}" has no membership in workspace "${session.workspaceId}".`
    );
  }

  const coachProfile =
    ALL_COACH_PROFILES.find((c) => c.workspaceId === workspace.id && c.userId === user.id) ?? null;

  const clientProfile =
    membership.role === "client"
      ? ALL_CLIENT_PROFILES.find((c) => c.workspaceId === workspace.id && c.userId === user.id) ?? null
      : null;

  const primaryCoach = clientProfile
    ? ALL_COACH_PROFILES.find((c) => c.id === clientProfile.primaryCoachId) ?? null
    : null;

  return {
    user,
    workspace,
    membership,
    role: membership.role,
    coachProfile,
    clientProfile,
    primaryCoach,
    branding: workspace.branding,
    assistantDisplayName: workspace.branding.assistantDisplayName,
    aiPolicy: workspace.aiPolicy,
  };
}

/** Same as resolveActiveContext but returns null instead of throwing, for
 * call sites that want to degrade gracefully (e.g. a future route guard)
 * rather than crash render. */
export function tryResolveActiveContext(session: SessionPointer): ActiveAppContext | null {
  try {
    return resolveActiveContext(session);
  } catch {
    return null;
  }
}

/** The only session this client-facing prototype ever resolves. A future
 * coach dashboard or platform-admin surface would build its own
 * SessionPointer (from real auth) and call resolveActiveContext directly —
 * the resolver itself has no notion of "the client app" baked in. */
export function getDemoClientSession(): SessionPointer {
  return DEMO_CLIENT_SESSION;
}

export function getActiveAppContext(): ActiveAppContext {
  return resolveActiveContext(getDemoClientSession());
}
