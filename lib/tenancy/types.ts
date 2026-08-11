// Phase 2 — B2B multi-workspace domain model.
//
// OPTIM is the underlying software platform. Each independent coaching
// business operates inside its own Workspace, with its own branding,
// assigned coaches, clients, and AI policy. This file is the single
// vocabulary every workspace-scoped record and access check builds on.
//
// This is architecture only: no dashboards, billing, or onboarding consume
// these types yet. The current client app resolves to exactly one workspace
// (see ./seed.ts) through the same resolver a future multi-workspace app
// would use (see ./context.ts and ./access.ts).

export type PlatformId = string;
export type WorkspaceId = string;
export type UserId = string;
export type CoachProfileId = string;
export type ClientProfileId = string;
export type MembershipId = string;
export type AssignmentId = string;

export interface Platform {
  id: PlatformId;
  name: string;
}

export type WorkspaceStatus = "active" | "suspended" | "trial";

/** Centralized, per-workspace values the client interface renders instead of
 * hardcoding a business's name, colors, or assistant name. */
export interface WorkspaceBranding {
  businessName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  assistantDisplayName: string;
  /** Whether the client experience should show subtle "Powered by OPTIM"
   * attribution. False for OPTIM's own first-party workspace. */
  showPoweredByOptim: boolean;
}

/** Coach-specific AI rules for a workspace. Configuration only in Phase 2 —
 * no AI system reads this yet, and it must not encode medical-diagnosis
 * behavior or a substitution engine. */
export interface WorkspaceAiPolicy {
  assistantDisplayName: string;
  tone: string;
  allowImmediateSessionSubstitutions: boolean;
  requireCoachApprovalForProgramChanges: boolean;
  requireCoachReviewForPainReports: boolean;
  requireCoachReviewForRpeAnomalies: boolean;
  requireCoachReviewForSkippedWork: boolean;
}

export interface Workspace {
  id: WorkspaceId;
  platformId: PlatformId;
  /** Internal/display name for the workspace record itself. UI copy should
   * prefer branding.businessName, which may differ (e.g. a DBA name). */
  displayName: string;
  status: WorkspaceStatus;
  ownerUserId: UserId;
  branding: WorkspaceBranding;
  aiPolicy: WorkspaceAiPolicy;
  createdAtIso: string;
}

/** The four roles required by Phase 2. Naming mirrors the product hierarchy:
 * a platform_admin operates OPTIM itself; a workspace_owner runs one
 * coaching business; a coach serves the clients assigned to them; a client
 * sees only their own records. */
export type Role = "platform_admin" | "workspace_owner" | "coach" | "client";

/** A user's role inside one specific workspace. A user with no membership
 * row for a workspace has no access to it — see resolveActiveContext's
 * default-deny behavior in ./context.ts. A user may hold separate
 * memberships (and thus separate roles) in more than one workspace without
 * those workspaces' data mixing. */
export interface WorkspaceMembership {
  id: MembershipId;
  userId: UserId;
  workspaceId: WorkspaceId;
  role: Role;
}

/** A platform-level identity, independent of any workspace. Stands in for
 * what a real auth provider would issue — this prototype has no auth, so
 * ./seed.ts defines a small fixed set of demo users. */
export interface PlatformUser {
  id: UserId;
  displayName: string;
  email?: string;
}

export interface CoachProfile {
  id: CoachProfileId;
  workspaceId: WorkspaceId;
  userId: UserId;
  displayName: string;
  title: string;
  avatarInitials: string;
}

/** The client-facing identity used throughout the app. Every screen must
 * read this dynamically through the active context rather than hardcoding a
 * name — see components consuming useActiveContext(). */
export interface ClientProfile {
  id: ClientProfileId;
  workspaceId: WorkspaceId;
  userId?: UserId;
  name: string;
  goal: string;
  programWeek: number;
  programTotalWeeks: number;
  avatarInitials: string;
  previousWeightLb: number;
  primaryCoachId: CoachProfileId;
}

/** Which coach is assigned to which client. Modeled as its own record (not a
 * single field on ClientProfile) so a workspace can support multiple
 * assigned coaches per client later — only `isPrimary` is required today. */
export interface CoachClientAssignment {
  id: AssignmentId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  clientId: ClientProfileId;
  isPrimary: boolean;
}

/** Stand-in for what a real session/auth token would carry: which user is
 * acting, inside which workspace. Everything else (role, profiles, branding,
 * AI policy) is derived from this by resolveActiveContext. */
export interface SessionPointer {
  userId: UserId;
  workspaceId: WorkspaceId;
}

/** The single resolved source of truth for "who is acting, where, and with
 * what identity/config" — components consume this instead of importing
 * unrelated hardcoded identity values. */
export interface ActiveAppContext {
  user: PlatformUser;
  workspace: Workspace;
  membership: WorkspaceMembership;
  role: Role;
  /** Populated when this user is also a coach in this workspace (coach or
   * workspace_owner roles that run their own client list). */
  coachProfile: CoachProfile | null;
  /** Populated only for role === "client". */
  clientProfile: ClientProfile | null;
  /** The active client's assigned primary coach, when applicable. */
  primaryCoach: CoachProfile | null;
  branding: WorkspaceBranding;
  assistantDisplayName: string;
  aiPolicy: WorkspaceAiPolicy;
}

// ---------------------------------------------------------------------------
// Shared "owned by" shapes for tenant-attributed domain records
// ---------------------------------------------------------------------------

/** Mixin for any record that must be attributable to a workspace. */
export interface WorkspaceOwned {
  workspaceId: WorkspaceId;
}

/** Mixin for any record that belongs to one client inside a workspace. */
export interface ClientOwned extends WorkspaceOwned {
  clientId: ClientProfileId;
}
