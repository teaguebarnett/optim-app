// Demo/seed tenancy data.
//
// This prototype has no real backend or auth provider, so this file plays
// the role a database would: it is the one place platform, workspace,
// membership, coach, and client records are defined. Everything the client
// app displays (OPTIM, Teague, OPTIM Assistant, Client) is resolved from
// here through ./context.ts and ./access.ts — never hardcoded a second time
// in a component.
//
// WORKSPACE_ATLAS and everything under "Internal-only second workspace
// fixture" below exist solely for lib/tenancy/verify-isolation.mts. No UI
// route or component imports them, and no workspace switcher is exposed.

import type {
  ClientProfile,
  CoachClientAssignment,
  CoachProfile,
  Platform,
  PlatformUser,
  SessionPointer,
  Workspace,
  WorkspaceMembership,
} from "./types";
import type { ChatMessage, ReviewRequest } from "../types";

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export const PLATFORM: Platform = { id: "platform-optim", name: "OPTIM" };

// ---------------------------------------------------------------------------
// Workspace 1 — Teague's coaching business (the live demo)
// ---------------------------------------------------------------------------

export const TEAGUE_USER: PlatformUser = { id: "user-teague", displayName: "Teague" };
export const CLIENT_USER: PlatformUser = { id: "user-client-demo", displayName: "Client" };
export const ALEX_USER: PlatformUser = { id: "user-alex", displayName: "Alex" };

export const WORKSPACE_OPTIM_ID = "workspace-optim-demo";

export const WORKSPACE_OPTIM: Workspace = {
  id: WORKSPACE_OPTIM_ID,
  platformId: PLATFORM.id,
  displayName: "OPTIM",
  status: "active",
  ownerUserId: TEAGUE_USER.id,
  branding: {
    businessName: "OPTIM",
    logoUrl: null,
    primaryColor: "#16294a",
    accentColor: "#21396a",
    assistantDisplayName: "OPTIM Assistant",
    // This is OPTIM's own first-party workspace, not a customer running
    // white-label — no "Powered by OPTIM" attribution needed here.
    showPoweredByOptim: false,
  },
  aiPolicy: {
    assistantDisplayName: "OPTIM Assistant",
    tone: "Direct, encouraging, and precise — never vague about what was or wasn't logged.",
    allowImmediateSessionSubstitutions: true,
    requireCoachApprovalForProgramChanges: true,
    requireCoachReviewForPainReports: true,
    requireCoachReviewForRpeAnomalies: true,
    requireCoachReviewForSkippedWork: true,
  },
  createdAtIso: "2026-01-01T00:00:00.000Z",
};

export const COACH_PROFILE_TEAGUE: CoachProfile = {
  id: "coach-teague",
  workspaceId: WORKSPACE_OPTIM_ID,
  userId: TEAGUE_USER.id,
  displayName: "Teague",
  title: "Your Coach",
  avatarInitials: "TB",
};

/** A second coach inside the same OPTIM workspace, used only to prove
 * coach-level scoping within one workspace (not just across workspaces) —
 * see lib/tenancy/verify-isolation.mts. Not surfaced anywhere in the UI. */
export const COACH_PROFILE_ALEX: CoachProfile = {
  id: "coach-alex",
  workspaceId: WORKSPACE_OPTIM_ID,
  userId: ALEX_USER.id,
  displayName: "Alex",
  title: "Coach",
  avatarInitials: "AL",
};

export const CLIENT_PROFILE_DEMO: ClientProfile = {
  id: "client-demo",
  workspaceId: WORKSPACE_OPTIM_ID,
  userId: CLIENT_USER.id,
  name: "Client",
  goal: "Build muscle and improve training consistency",
  programWeek: 8,
  programTotalWeeks: 16,
  avatarInitials: "C",
  previousWeightLb: 191.4,
  primaryCoachId: COACH_PROFILE_TEAGUE.id,
};

/** A second client in the same workspace, assigned to Alex instead of
 * Teague. Used only to verify a coach can't retrieve a client they aren't
 * assigned to, even inside their own workspace. Not surfaced in the UI. */
export const CLIENT_PROFILE_SECONDARY: ClientProfile = {
  id: "client-secondary-fixture",
  workspaceId: WORKSPACE_OPTIM_ID,
  name: "Secondary Fixture Client",
  goal: "Isolation-test fixture only.",
  programWeek: 3,
  programTotalWeeks: 12,
  avatarInitials: "SF",
  previousWeightLb: 165,
  primaryCoachId: COACH_PROFILE_ALEX.id,
};

export const MEMBERSHIP_TEAGUE_OWNER: WorkspaceMembership = {
  id: "membership-teague-optim",
  userId: TEAGUE_USER.id,
  workspaceId: WORKSPACE_OPTIM_ID,
  role: "workspace_owner",
};

export const MEMBERSHIP_ALEX_COACH: WorkspaceMembership = {
  id: "membership-alex-optim",
  userId: ALEX_USER.id,
  workspaceId: WORKSPACE_OPTIM_ID,
  role: "coach",
};

export const MEMBERSHIP_CLIENT: WorkspaceMembership = {
  id: "membership-client-optim",
  userId: CLIENT_USER.id,
  workspaceId: WORKSPACE_OPTIM_ID,
  role: "client",
};

export const ASSIGNMENT_TEAGUE_CLIENT: CoachClientAssignment = {
  id: "assignment-teague-client",
  workspaceId: WORKSPACE_OPTIM_ID,
  coachId: COACH_PROFILE_TEAGUE.id,
  clientId: CLIENT_PROFILE_DEMO.id,
  isPrimary: true,
};

export const ASSIGNMENT_ALEX_SECONDARY: CoachClientAssignment = {
  id: "assignment-alex-secondary",
  workspaceId: WORKSPACE_OPTIM_ID,
  coachId: COACH_PROFILE_ALEX.id,
  clientId: CLIENT_PROFILE_SECONDARY.id,
  isPrimary: true,
};

/** The one session this prototype ever resolves — the client-facing demo,
 * signed in as the OPTIM workspace's client. A future coach dashboard would
 * resolve a different SessionPointer (e.g. { userId: TEAGUE_USER.id,
 * workspaceId: WORKSPACE_OPTIM_ID }) through the exact same resolver. */
export const DEMO_CLIENT_SESSION: SessionPointer = {
  userId: CLIENT_USER.id,
  workspaceId: WORKSPACE_OPTIM_ID,
};

// ---------------------------------------------------------------------------
// Internal-only second workspace fixture — isolation verification only.
// Never imported by UI, routes, or a workspace switcher.
// ---------------------------------------------------------------------------

export const WORKSPACE_ATLAS_ID = "workspace-atlas-fixture";

export const PRIYA_USER: PlatformUser = { id: "user-priya", displayName: "Priya" };
export const JORDAN_USER: PlatformUser = { id: "user-jordan", displayName: "Jordan" };

export const WORKSPACE_ATLAS: Workspace = {
  id: WORKSPACE_ATLAS_ID,
  platformId: PLATFORM.id,
  displayName: "Atlas Performance Coaching",
  status: "active",
  ownerUserId: PRIYA_USER.id,
  branding: {
    businessName: "Atlas Performance Coaching",
    logoUrl: null,
    primaryColor: "#2f6f4f",
    accentColor: "#3f8f66",
    assistantDisplayName: "Atlas Coach Assistant",
    showPoweredByOptim: true,
  },
  aiPolicy: {
    assistantDisplayName: "Atlas Coach Assistant",
    tone: "Calm and data-forward.",
    allowImmediateSessionSubstitutions: false,
    requireCoachApprovalForProgramChanges: true,
    requireCoachReviewForPainReports: true,
    requireCoachReviewForRpeAnomalies: true,
    requireCoachReviewForSkippedWork: true,
  },
  createdAtIso: "2026-02-01T00:00:00.000Z",
};

export const COACH_PROFILE_PRIYA: CoachProfile = {
  id: "coach-priya",
  workspaceId: WORKSPACE_ATLAS_ID,
  userId: PRIYA_USER.id,
  displayName: "Priya",
  title: "Head Coach",
  avatarInitials: "PR",
};

export const CLIENT_PROFILE_JORDAN: ClientProfile = {
  id: "client-jordan",
  workspaceId: WORKSPACE_ATLAS_ID,
  userId: JORDAN_USER.id,
  name: "Jordan",
  goal: "Marathon base-building.",
  programWeek: 4,
  programTotalWeeks: 20,
  avatarInitials: "J",
  previousWeightLb: 148,
  primaryCoachId: COACH_PROFILE_PRIYA.id,
};

export const MEMBERSHIP_PRIYA_OWNER: WorkspaceMembership = {
  id: "membership-priya-atlas",
  userId: PRIYA_USER.id,
  workspaceId: WORKSPACE_ATLAS_ID,
  role: "workspace_owner",
};

export const MEMBERSHIP_JORDAN_CLIENT: WorkspaceMembership = {
  id: "membership-jordan-atlas",
  userId: JORDAN_USER.id,
  workspaceId: WORKSPACE_ATLAS_ID,
  role: "client",
};

export const ASSIGNMENT_PRIYA_JORDAN: CoachClientAssignment = {
  id: "assignment-priya-jordan",
  workspaceId: WORKSPACE_ATLAS_ID,
  coachId: COACH_PROFILE_PRIYA.id,
  clientId: CLIENT_PROFILE_JORDAN.id,
  isPrimary: true,
};

export const ATLAS_CLIENT_SESSION: SessionPointer = {
  userId: JORDAN_USER.id,
  workspaceId: WORKSPACE_ATLAS_ID,
};

/** Platform admin — belongs to no single workspace's roster; membership is
 * modeled separately per workspace only when a platform admin needs
 * workspace-level access. Included for role-resolution completeness. */
export const PLATFORM_ADMIN_USER: PlatformUser = { id: "user-platform-admin", displayName: "OPTIM Platform Admin" };

// ---------------------------------------------------------------------------
// Aggregate collections — what a real backend's tables would hold.
// ---------------------------------------------------------------------------

export const ALL_USERS: PlatformUser[] = [
  TEAGUE_USER,
  CLIENT_USER,
  ALEX_USER,
  PRIYA_USER,
  JORDAN_USER,
  PLATFORM_ADMIN_USER,
];

export const ALL_WORKSPACES: Workspace[] = [WORKSPACE_OPTIM, WORKSPACE_ATLAS];

export const ALL_COACH_PROFILES: CoachProfile[] = [
  COACH_PROFILE_TEAGUE,
  COACH_PROFILE_ALEX,
  COACH_PROFILE_PRIYA,
];

export const ALL_CLIENT_PROFILES: ClientProfile[] = [
  CLIENT_PROFILE_DEMO,
  CLIENT_PROFILE_SECONDARY,
  CLIENT_PROFILE_JORDAN,
];

export const ALL_MEMBERSHIPS: WorkspaceMembership[] = [
  MEMBERSHIP_TEAGUE_OWNER,
  MEMBERSHIP_ALEX_COACH,
  MEMBERSHIP_CLIENT,
  MEMBERSHIP_PRIYA_OWNER,
  MEMBERSHIP_JORDAN_CLIENT,
];

export const ALL_ASSIGNMENTS: CoachClientAssignment[] = [
  ASSIGNMENT_TEAGUE_CLIENT,
  ASSIGNMENT_ALEX_SECONDARY,
  ASSIGNMENT_PRIYA_JORDAN,
];

// ---------------------------------------------------------------------------
// Sample workspace-scoped chat/review records — isolation verification only.
//
// The live app's real chat/review records live inside one client's
// localStorage-persisted AppState (see lib/state.ts), which only ever holds
// one workspace's data at a time and so can't demonstrate cross-workspace
// leakage by itself. These small fixture lists stand in for what a real
// backend's messages/review-requests tables would hold across *multiple*
// workspaces, so the access layer's filtering can be exercised directly.
// ---------------------------------------------------------------------------

export const OPTIM_SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: "msg-optim-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    sender: "client",
    text: "Can I use turkey instead of chicken?",
    createdAtIso: "2026-07-27T16:00:00.000Z",
  },
  {
    id: "msg-optim-2",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    sender: "assistant",
    text: "Yes — keep the meal's protein and total calories close to the original.",
    createdAtIso: "2026-07-27T16:00:05.000Z",
  },
  {
    id: "msg-optim-3",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    sender: "coach",
    text: "Nice work last week — 100% consistency.",
    createdAtIso: "2026-07-27T09:00:00.000Z",
  },
];

export const ATLAS_SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: "msg-atlas-1",
    workspaceId: WORKSPACE_ATLAS_ID,
    clientId: CLIENT_PROFILE_JORDAN.id,
    sender: "client",
    text: "Can I move my long run to Friday?",
    createdAtIso: "2026-07-27T16:00:00.000Z",
  },
  {
    id: "msg-atlas-2",
    workspaceId: WORKSPACE_ATLAS_ID,
    clientId: CLIENT_PROFILE_JORDAN.id,
    sender: "coach",
    text: "Yes, that works — I'll adjust the plan.",
    createdAtIso: "2026-07-27T16:05:00.000Z",
  },
];

export const ALL_SAMPLE_MESSAGES: ChatMessage[] = [...OPTIM_SAMPLE_MESSAGES, ...ATLAS_SAMPLE_MESSAGES];

export const OPTIM_SAMPLE_REVIEW_REQUESTS: ReviewRequest[] = [
  {
    id: "review-optim-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    kind: "rpe-anomaly",
    createdAtIso: "2026-07-27T18:00:00.000Z",
    summary: "Today's push workout has RPE values worth a second look.",
    resolved: false,
  },
];

export const ATLAS_SAMPLE_REVIEW_REQUESTS: ReviewRequest[] = [
  {
    id: "review-atlas-1",
    workspaceId: WORKSPACE_ATLAS_ID,
    clientId: CLIENT_PROFILE_JORDAN.id,
    kind: "schedule-change",
    createdAtIso: "2026-07-27T18:00:00.000Z",
    summary: "Long run moved to Friday.",
    resolved: false,
  },
];

export const ALL_SAMPLE_REVIEW_REQUESTS: ReviewRequest[] = [
  ...OPTIM_SAMPLE_REVIEW_REQUESTS,
  ...ATLAS_SAMPLE_REVIEW_REQUESTS,
];
