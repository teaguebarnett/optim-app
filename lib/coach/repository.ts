// Phase 5.0A — the one read-side layer that joins lib/coach/platform-store.ts
// (coach-created clients, lifecycle, invitations, onboarding) with the
// existing static seed roster (lib/tenancy/seed.ts). Every coach-facing
// screen reads through here rather than touching either source directly, so
// "all clients," "this coach's clients," and "this client's lifecycle" can
// never be computed two different ways in two different components.
//
// The pre-existing seed clients (CLIENT_PROFILE_DEMO and friends) are
// already-real, already-active product clients — they never appear in
// PlatformState.lifecycles, so getClientLifecycle defaults an unrecorded
// client to "active" rather than treating "no record" as "not onboarded."
// Only a client actually created through CREATE_CLIENT ever starts anywhere
// earlier in the lifecycle.

import { ALL_CLIENT_PROFILES, ALL_COACH_PROFILES, ALL_WORKSPACES } from "../tenancy/seed.ts";
import type { ActiveAppContext, ClientProfile, ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { AppState } from "../state";
import type { PlatformState } from "./platform-store";
import type {
  ClientIntendedProgram,
  ClientInvitation,
  ClientLifecycleStatus,
  HealthReviewRecord,
  OnboardingProgress,
  ProgramAssignmentRef,
} from "./types";
import { defaultCoachAiAuthoritySettings, type CoachAiAuthoritySettings } from "./ai-authority.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { CoachOnboardingProgress } from "./coach-onboarding-engine.ts";
import type { ActivationGenerationRecord } from "./activation-lifecycle.ts";
import type { ClientCommunicationPolicy } from "./communication-policy.ts";
import { defaultCoachBriefingSettings, type CoachBriefingSettings, type DailyBriefingRecord } from "./daily-briefing.ts";

/** Every client this workspace/prototype knows about — the compile-time
 * seed roster plus any coach-created clients from the platform store.
 * Coach-created clients are appended (never replace/shadow a seed id —
 * ids are namespaced distinctly by nextPlatformId/nextId prefixes). */
export function getAllClientProfiles(platform: PlatformState): ClientProfile[] {
  return [...ALL_CLIENT_PROFILES, ...platform.clients];
}

export function getClientProfile(platform: PlatformState, clientId: ClientProfileId): ClientProfile | null {
  return getAllClientProfiles(platform).find((c) => c.id === clientId) ?? null;
}

/** The one coach-ownership gate every coach-facing, clientId-keyed screen
 * must go through (see hooks/use-coach-data.ts's useCoachClientView) —
 * returns null for a client that exists but belongs to a DIFFERENT coach,
 * identically to a client that doesn't exist at all. Every other lookup in
 * this file is keyed only by clientId against one shared PlatformState
 * blob, so without this gate a coach who learns or guesses another coach's
 * client id could read (or, through the Activation Studio, write) that
 * client's real data. See lib/coach/verify-coach.mts for the regression
 * test. */
export function getClientProfileForCoach(platform: PlatformState, clientId: ClientProfileId, coachId: CoachProfileId): ClientProfile | null {
  const client = getClientProfile(platform, clientId);
  return client && client.primaryCoachId === coachId ? client : null;
}

/** Clients assigned to a given coach, scoped to a workspace. Reads
 * client.primaryCoachId directly rather than going through
 * lib/tenancy/seed.ts's resolveAssignedCoachId — that resolver only knows
 * the compile-time seed roster and throws for a coach-created client (see
 * this file's module doc); every ClientProfile, seed or coach-created,
 * already carries its own real primaryCoachId, so reading it directly here
 * is both simpler and correct for both sources. */
export function getClientsForCoach(platform: PlatformState, workspaceId: WorkspaceId, coachId: CoachProfileId): ClientProfile[] {
  return getAllClientProfiles(platform).filter((c) => c.workspaceId === workspaceId && c.primaryCoachId === coachId);
}

export function getClientLifecycle(platform: PlatformState, clientId: ClientProfileId): ClientLifecycleStatus {
  return platform.lifecycles.find((l) => l.clientId === clientId)?.status ?? "active";
}

export function getOnboardingProgress(platform: PlatformState, clientId: ClientProfileId): OnboardingProgress | null {
  return platform.onboarding.find((o) => o.clientId === clientId) ?? null;
}

export function getIntendedProgram(platform: PlatformState, clientId: ClientProfileId): ClientIntendedProgram | null {
  return platform.intendedPrograms.find((p) => p.clientId === clientId) ?? null;
}

export function getInvitationByToken(platform: PlatformState, token: string): ClientInvitation | null {
  return platform.invitations.find((i) => i.token === token) ?? null;
}

export function getInvitationForClient(platform: PlatformState, clientId: ClientProfileId): ClientInvitation | null {
  return platform.invitations.find((i) => i.clientId === clientId) ?? null;
}

export function getHealthReview(platform: PlatformState, clientId: ClientProfileId): HealthReviewRecord | null {
  return platform.healthReviews.find((r) => r.clientId === clientId) ?? null;
}

/** Always returns a real, complete settings record — a coach who has never
 * touched AI Coaching Authority gets the honest, documented default (see
 * lib/coach/ai-authority.ts's defaultCoachAiAuthoritySettings) rather than
 * null/undefined, so every read site can resolve an effective level without
 * its own fallback branch. */
export function getAiAuthoritySettings(platform: PlatformState, coachId: CoachProfileId, workspaceId: WorkspaceId): CoachAiAuthoritySettings {
  return platform.aiAuthoritySettings.find((s) => s.coachId === coachId) ?? defaultCoachAiAuthoritySettings(coachId, workspaceId, "1970-01-01T00:00:00.000Z");
}

/** Every version of this coach's Coach Operating Model, newest first —
 * never filtered to just "active," since the Review chapter and history
 * views both need the full chain. */
export function getCoachOperatingModelVersions(platform: PlatformState, coachId: CoachProfileId): CoachOperatingModel[] {
  return platform.coachOperatingModels.filter((m) => m.coachId === coachId).sort((a, b) => b.version - a.version);
}

/** The one active model for this coach, or null for a coach who has never
 * completed (or never started) coach onboarding — see
 * lib/coach/activation-lifecycle.ts's determinePreGenerationState, which
 * treats null here as "awaiting_coach_calibration," never as a silent
 * fallback to some default methodology. */
export function getActiveCoachOperatingModel(platform: PlatformState, coachId: CoachProfileId): CoachOperatingModel | null {
  return platform.coachOperatingModels.find((m) => m.coachId === coachId && m.status === "active") ?? null;
}

export function getCoachOnboardingProgress(platform: PlatformState, coachId: CoachProfileId): CoachOnboardingProgress | null {
  return platform.coachOnboardingProgress.find((p) => p.coachId === coachId) ?? null;
}

/** Every activation-generation record ever produced for this client,
 * newest first — includes superseded/regenerated history (never deleted),
 * see activation-lifecycle.ts's module doc. */
export function getActivationGenerationsForClient(platform: PlatformState, clientId: ClientProfileId): ActivationGenerationRecord[] {
  return platform.activationGenerations.filter((r) => r.clientId === clientId).sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));
}

export function getCommunicationPolicy(platform: PlatformState, clientId: ClientProfileId): ClientCommunicationPolicy | null {
  return platform.communicationPolicies.find((p) => p.clientId === clientId) ?? null;
}

/** This coach's Daily Briefing automation settings — always a real,
 * complete record (see defaultCoachBriefingSettings), never
 * null/undefined, exactly like getAiAuthoritySettings above. */
export function getBriefingSettings(platform: PlatformState, coachId: CoachProfileId, workspaceId: WorkspaceId): CoachBriefingSettings {
  return platform.briefingSettings.find((s) => s.coachId === coachId) ?? defaultCoachBriefingSettings(coachId, workspaceId, "1970-01-01T00:00:00.000Z");
}

/** The one Daily Briefing record for this client on this exact local date,
 * or null if none has been generated yet. */
export function getDailyBriefing(platform: PlatformState, clientId: ClientProfileId, forDateIso: string): DailyBriefingRecord | null {
  return platform.dailyBriefings.find((b) => b.clientId === clientId && b.forDateIso === forDateIso) ?? null;
}

/** Every briefing this coach owns across every client, newest first — used
 * by the Command Center's Daily Briefings section (spec §2). */
export function getBriefingsForCoach(platform: PlatformState, coachId: CoachProfileId): DailyBriefingRecord[] {
  return platform.dailyBriefings.filter((b) => b.coachId === coachId).sort((a, b) => (a.forDateIso < b.forDateIso ? 1 : -1));
}

/**
 * A real program assignment reference — never fabricated, never a copy of
 * enrollment data. Only resolves for the one client whose live AppState is
 * currently loaded (in this prototype, that's always the single seeded
 * demo client the browser is running as — see lib/state.ts's module doc).
 * A newly onboarded client has no AppState yet (no program-authoring flow
 * exists to create one for them in this phase), so this honestly returns
 * null for them — see lib/coach/activation.ts for how that surfaces as a
 * named, actionable gap rather than a silent block.
 */
export function resolveProgramAssignmentRef(clientId: ClientProfileId, liveAppState: AppState | null): ProgramAssignmentRef | null {
  if (!liveAppState || liveAppState.clientId !== clientId) return null;
  return {
    clientId,
    workspaceId: liveAppState.workspaceId,
    enrollmentId: liveAppState.programEnrollment.id,
    assignedAtIso: liveAppState.programEnrollment.createdAtIso,
  };
}

/**
 * Phase 5.0B — an ActiveAppContext for a client created through the coach's
 * "Add client" flow (see platform.clients), built directly from platform-
 * store + seed data rather than through lib/tenancy/context.ts's
 * resolveActiveContext — that resolver only ever knows the compile-time
 * ALL_USERS/ALL_MEMBERSHIPS/ALL_CLIENT_PROFILES arrays and throws for any
 * id outside them (see this file's own module doc), which a coach-created
 * client always is. `user`/`membership` are synthesized placeholders: no
 * component reads them for a client context (every screen reads
 * `clientProfile`/`primaryCoach`/`branding`/`assistantDisplayName`/
 * `aiPolicy`, all real here), they exist only to satisfy ActiveAppContext's
 * shape. Returns null (never throws) for an unknown id or workspace, so a
 * stale/invalid activeClientId pointer degrades to the caller's own
 * fallback instead of crashing render.
 */
export function resolveCoachCreatedClientContext(clientId: ClientProfileId, platform: PlatformState): ActiveAppContext | null {
  const client = platform.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const workspace = ALL_WORKSPACES.find((w) => w.id === client.workspaceId);
  if (!workspace) return null;
  const primaryCoach = ALL_COACH_PROFILES.find((c) => c.id === client.primaryCoachId) ?? null;
  const syntheticUserId = `user-${client.id}`;

  return {
    user: { id: syntheticUserId, displayName: client.name, email: client.email },
    workspace,
    membership: { id: `membership-${client.id}`, userId: syntheticUserId, workspaceId: workspace.id, role: "client" },
    role: "client",
    coachProfile: null,
    clientProfile: client,
    primaryCoach,
    branding: workspace.branding,
    assistantDisplayName: workspace.branding.assistantDisplayName,
    aiPolicy: workspace.aiPolicy,
  };
}
