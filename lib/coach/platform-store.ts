// Phase 5.0A — the workspace/platform store.
//
// Kept entirely separate from lib/state.ts's AppState: AppState is one
// client's live day-to-day record (today's meals, workout, chat, ...) and
// stays exactly as it was — nothing here touches its shape, its version, or
// its migration chain. This store instead holds the coach-side roster data
// that doesn't belong to any one client's daily state: clients created
// through the coach's "Add client" flow, their lifecycle status,
// invitations, and onboarding progress. Persisted under its own
// localStorage key (see lib/storage.ts, generalized to accept one) with its
// own versioned migration, following the exact same discipline as
// lib/tenancy/migrate.ts so it can be extended the same safe way later.
//
// The existing seeded clients (CLIENT_PROFILE_DEMO and friends — see
// lib/tenancy/seed.ts) are NEVER stored here; they're already real,
// already-active clients defined at compile time. lib/coach/repository.ts
// is the one place that merges this store's data with that seed roster for
// every read — nothing else should read PlatformState directly.

import { WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import type { ClientProfile, ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import { computeHealthReviewRequired, computeLegacyHealthReviewRequired } from "./health-review.ts";
import { sanitizeOnboardingAnswers } from "./onboarding-steps.ts";
import { defaultCoachAiAuthoritySettings, type AiAuthorityConfig, type CoachAiAuthoritySettings } from "./ai-authority.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { CoachOnboardingProgress } from "./coach-onboarding-engine.ts";
import type { ActivationGenerationRecord } from "./activation-lifecycle.ts";
import type { ClientCommunicationPolicy } from "./communication-policy.ts";
import { defaultCoachBriefingSettings, type BriefingAutomationSetting, type CoachBriefingSettings, type DailyBriefingRecord } from "./daily-briefing.ts";
import type { CoachBriefRecord } from "./coach-brief-record.ts";
import type { ProgramAdaptationProposal } from "./program-adaptation.ts";
import type {
  ClientIntendedProgram,
  ClientInvitation,
  ClientLifecycleRecord,
  ClientLifecycleStatus,
  CoachProgramTemplate,
  HealthReviewRecord,
  HealthReviewStatus,
  MealRecommendation,
  OnboardingProgress,
  OnboardingStepAnswers,
  OnboardingStepId,
} from "./types";

export interface PlatformState {
  version: 9;
  clients: ClientProfile[];
  lifecycles: ClientLifecycleRecord[];
  invitations: ClientInvitation[];
  onboarding: OnboardingProgress[];
  intendedPrograms: ClientIntendedProgram[];
  /** Phase 5.1 — see lib/coach/health-review.ts for what creates one and
   * lib/coach/types.ts's HealthReviewStatus for the coach-controlled
   * statuses that resolve it. Never created, cleared, or resolved by
   * anything other than an explicit coach action or a submitted intake's
   * own positive safety answer. */
  healthReviews: HealthReviewRecord[];
  /** Phase 5.2 — each coach's own reusable training-protocol library (see
   * lib/coach/training.ts). Owned and isolated by coachId; a coach's
   * templates are never visible in another coach's library — see
   * lib/coach/repository.ts's scoping. Assigning a client's program never
   * reads or writes this list — see lib/coach/program-assignment.ts, which
   * writes the resulting independent copy directly into the client's own
   * AppState instead. */
  programTemplates: CoachProgramTemplate[];
  /** Phase 5.2 — each coach's own reusable meal-recommendation library (see
   * lib/coach/types.ts's MealRecommendation doc). Owned and isolated by
   * coachId; a client sees only the ones explicitly assigned to them via
   * that record's own assignedClientIds. */
  mealRecommendations: MealRecommendation[];
  /** Phase 5.3B — each coach's own AI Coaching Authority configuration (see
   * lib/coach/ai-authority.ts): a global default plus a sparse per-client
   * override map. Owned and isolated by coachId, exactly like
   * programTemplates/mealRecommendations above — one coach's authority
   * settings are never read or written through another coach's id. */
  aiAuthoritySettings: CoachAiAuthoritySettings[];
  /** Phase 5.4A — every version of every coach's Coach Operating Model,
   * append-only (see operating-model.ts's module doc: an edit creates a new
   * version rather than mutating the previous one). Owned/isolated by
   * coachId exactly like aiAuthoritySettings. */
  coachOperatingModels: CoachOperatingModel[];
  /** Phase 5.4A — one save/resume record per coach for the dedicated coach
   * onboarding wizard (see coach-onboarding-engine.ts), mirroring
   * `onboarding: OnboardingProgress[]` for the client intake. */
  coachOnboardingProgress: CoachOnboardingProgress[];
  /** Phase 5.4A — every activation-generation run for every client, kept
   * (never deleted) so regeneration history and approval provenance stay
   * fully auditable — see activation-lifecycle.ts. */
  activationGenerations: ActivationGenerationRecord[];
  /** Phase 5.4A — one real, honest communication-policy record per client
   * (see communication-policy.ts) — internal scheduled-action intent only;
   * no real delivery provider exists in this prototype (see this phase's
   * final report §16). */
  communicationPolicies: ClientCommunicationPolicy[];
  /** Phase 5.4B — every Daily Briefing ever generated, one per
   * client+forDateIso (see daily-briefing.ts), kept (never deleted) so a
   * client's "recent decisions" history stays real and auditable. */
  dailyBriefings: DailyBriefingRecord[];
  /** Phase 5.4B — each coach's own Daily Briefing automation configuration,
   * owned/isolated by coachId exactly like aiAuthoritySettings. */
  briefingSettings: CoachBriefingSettings[];
  /** Phase 5.4B completion pass — the real, stored/refreshed OPTIM Coach
   * Brief (see coach-brief-record.ts), one per client, overwritten in place
   * on each real regeneration (never append-only — a brief is a current
   * snapshot, not a history log; resolution receipts/history already cover
   * the audit trail). */
  coachBriefs: CoachBriefRecord[];
  /** Phase 5.5 — every real adaptation proposal ever generated for every
   * client (see program-adaptation.ts), kept (never deleted) so approval/
   * dismissal history stays fully auditable, exactly like
   * activationGenerations above. */
  adaptationProposals: ProgramAdaptationProposal[];
}

export function createInitialPlatformState(): PlatformState {
  return {
    version: 9,
    clients: [],
    lifecycles: [],
    invitations: [],
    onboarding: [],
    intendedPrograms: [],
    healthReviews: [],
    programTemplates: [],
    mealRecommendations: [],
    aiAuthoritySettings: [],
    coachOperatingModels: [],
    coachOnboardingProgress: [],
    activationGenerations: [],
    communicationPolicies: [],
    dailyBriefings: [],
    briefingSettings: [],
    coachBriefs: [],
    adaptationProposals: [],
  };
}

let idCounter = 0;
export function nextPlatformId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

/** Random enough for a local-prototype invitation token — this is never a
 * real security boundary (see the module doc's "local adapter" framing),
 * just an opaque id so the /invite/[token] URL doesn't expose a raw
 * clientId. */
export function generateInvitationToken(): string {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export type PlatformAction =
  | { type: "HYDRATE"; payload: PlatformState }
  | {
      type: "CREATE_CLIENT";
      workspaceId: WorkspaceId;
      client: ClientProfile;
      intendedStartDateIso: string;
      intendedDurationWeeks: number;
      intendedWeeklyCheckIn: boolean;
      nowIso: string;
    }
  | { type: "ACCEPT_INVITATION"; token: string; nowIso: string }
  | {
      type: "SAVE_ONBOARDING_STEP";
      clientId: string;
      workspaceId: WorkspaceId;
      stepId: OnboardingStepId;
      answers: OnboardingStepAnswers;
      nextStepIndex: number;
      nowIso: string;
    }
  | { type: "COMPLETE_ONBOARDING"; clientId: string; workspaceId: WorkspaceId; nowIso: string }
  | { type: "SET_CLIENT_LIFECYCLE"; clientId: string; workspaceId: WorkspaceId; status: ClientLifecycleStatus; nowIso: string }
  | { type: "SET_HEALTH_REVIEW_STATUS"; clientId: string; workspaceId: WorkspaceId; status: HealthReviewStatus; nowIso: string }
  | { type: "SAVE_PROGRAM_TEMPLATE"; template: CoachProgramTemplate }
  | { type: "DELETE_PROGRAM_TEMPLATE"; templateId: string; coachId: string }
  | { type: "SAVE_MEAL_RECOMMENDATION"; recommendation: MealRecommendation }
  | { type: "DELETE_MEAL_RECOMMENDATION"; recommendationId: string; coachId: string }
  | { type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT"; recommendationId: string; coachId: string; clientId: string; assigned: boolean }
  | { type: "SET_AI_AUTHORITY_GLOBAL"; coachId: CoachProfileId; workspaceId: WorkspaceId; config: AiAuthorityConfig; nowIso: string }
  | { type: "SET_AI_AUTHORITY_CLIENT_OVERRIDE"; coachId: CoachProfileId; workspaceId: WorkspaceId; clientId: ClientProfileId; config: AiAuthorityConfig | null; nowIso: string }
  | { type: "SAVE_COACH_ONBOARDING_PROGRESS"; progress: CoachOnboardingProgress }
  | { type: "SAVE_COACH_OPERATING_MODEL"; model: CoachOperatingModel }
  | { type: "SAVE_ACTIVATION_GENERATION"; record: ActivationGenerationRecord }
  | { type: "SAVE_COMMUNICATION_POLICY"; policy: ClientCommunicationPolicy }
  | { type: "SAVE_DAILY_BRIEFING"; record: DailyBriefingRecord }
  | { type: "SET_BRIEFING_GLOBAL_AUTOMATION"; coachId: CoachProfileId; workspaceId: WorkspaceId; automation: BriefingAutomationSetting; nowIso: string }
  | { type: "SET_BRIEFING_CLIENT_OVERRIDE"; coachId: CoachProfileId; workspaceId: WorkspaceId; clientId: ClientProfileId; automation: BriefingAutomationSetting | null; nowIso: string }
  | { type: "SAVE_COACH_BRIEF"; record: CoachBriefRecord }
  | { type: "SAVE_ADAPTATION_PROPOSAL"; proposal: ProgramAdaptationProposal };

function upsertLifecycle(
  lifecycles: ClientLifecycleRecord[],
  clientId: string,
  workspaceId: WorkspaceId,
  status: ClientLifecycleStatus,
  nowIso: string
): ClientLifecycleRecord[] {
  const existingIndex = lifecycles.findIndex((l) => l.clientId === clientId);
  const record: ClientLifecycleRecord = { clientId, workspaceId, status, updatedAtIso: nowIso };
  if (existingIndex === -1) return [...lifecycles, record];
  return lifecycles.map((l, i) => (i === existingIndex ? record : l));
}

/** Only ever moves lifecycle FORWARD along the normal onboarding path when
 * an onboarding-flow action fires — never regresses a client a coach has
 * already paused/completed/activated by dispatching a routine "you started
 * typing" step-save. */
const PRE_ONBOARDING_STATUSES = new Set<ClientLifecycleStatus>(["invited", "onboarding"]);

export function platformReducer(state: PlatformState, action: PlatformAction): PlatformState {
  switch (action.type) {
    case "HYDRATE":
      return action.payload;

    case "CREATE_CLIENT": {
      const invitation: ClientInvitation = {
        id: nextPlatformId("invitation"),
        workspaceId: action.workspaceId,
        clientId: action.client.id,
        token: generateInvitationToken(),
        delivery: "local_link_only",
        createdAtIso: action.nowIso,
      };
      const intendedProgram: ClientIntendedProgram = {
        clientId: action.client.id,
        workspaceId: action.workspaceId,
        intendedStartDateIso: action.intendedStartDateIso,
        intendedDurationWeeks: action.intendedDurationWeeks,
        intendedWeeklyCheckIn: action.intendedWeeklyCheckIn,
      };
      return {
        ...state,
        clients: [...state.clients, action.client],
        lifecycles: upsertLifecycle(state.lifecycles, action.client.id, action.workspaceId, "invited", action.nowIso),
        invitations: [...state.invitations, invitation],
        intendedPrograms: [...state.intendedPrograms, intendedProgram],
      };
    }

    case "ACCEPT_INVITATION": {
      const invitation = state.invitations.find((i) => i.token === action.token);
      if (!invitation) return state;
      const invitations = state.invitations.map((i) =>
        i.token === action.token ? { ...i, acceptedAtIso: i.acceptedAtIso ?? action.nowIso } : i
      );
      const currentStatus = state.lifecycles.find((l) => l.clientId === invitation.clientId)?.status ?? "invited";
      const lifecycles =
        currentStatus === "invited"
          ? upsertLifecycle(state.lifecycles, invitation.clientId, invitation.workspaceId, "onboarding", action.nowIso)
          : state.lifecycles;
      return { ...state, invitations, lifecycles };
    }

    case "SAVE_ONBOARDING_STEP": {
      // The real, independent floor against an invalid answer ever being
      // persisted — never trusts the UI alone (see
      // lib/coach/onboarding-steps.ts's sanitizeOnboardingAnswers doc).
      const sanitizedAnswers = sanitizeOnboardingAnswers(action.stepId, action.answers);
      const existingIndex = state.onboarding.findIndex((o) => o.clientId === action.clientId);
      const existing = state.onboarding[existingIndex];
      const progress: OnboardingProgress = {
        clientId: action.clientId,
        workspaceId: action.workspaceId,
        currentStepIndex: action.nextStepIndex,
        answers: { ...(existing?.answers ?? {}), [action.stepId]: sanitizedAnswers },
        completedAtIso: existing?.completedAtIso,
        updatedAtIso: action.nowIso,
      };
      const onboarding =
        existingIndex === -1 ? [...state.onboarding, progress] : state.onboarding.map((o, i) => (i === existingIndex ? progress : o));

      const currentStatus = state.lifecycles.find((l) => l.clientId === action.clientId)?.status ?? "invited";
      const lifecycles = PRE_ONBOARDING_STATUSES.has(currentStatus)
        ? upsertLifecycle(state.lifecycles, action.clientId, action.workspaceId, "onboarding", action.nowIso)
        : state.lifecycles;

      // The client's own edit of their name during the "basics" step is
      // the one moment a name a coach already sees (the invitation/roster
      // name, set at "Add client" time) can go stale — keep the two in
      // sync here rather than letting them silently diverge. Only ever
      // touches a coach-created client (present in state.clients); the
      // seeded demo client never goes through this onboarding system.
      const editedName = action.stepId === "basics" ? action.answers.fullName : undefined;
      const clients =
        typeof editedName === "string" && editedName.trim().length > 0
          ? state.clients.map((c) => (c.id === action.clientId && c.name !== editedName.trim() ? { ...c, name: editedName.trim() } : c))
          : state.clients;

      return { ...state, onboarding, lifecycles, clients };
    }

    case "COMPLETE_ONBOARDING": {
      const existingIndex = state.onboarding.findIndex((o) => o.clientId === action.clientId);
      if (existingIndex === -1) return state;
      const existing = state.onboarding[existingIndex];
      const onboarding = state.onboarding.map((o, i) =>
        i === existingIndex ? { ...o, completedAtIso: o.completedAtIso ?? action.nowIso, updatedAtIso: action.nowIso } : o
      );
      const lifecycles = upsertLifecycle(state.lifecycles, action.clientId, action.workspaceId, "coach_setup", action.nowIso);

      // A health review is created here, at submission, from the client's
      // own answers — never re-evaluated later, and never cleared by
      // anything other than an explicit SET_HEALTH_REVIEW_STATUS from the
      // coach. A client who already has a review record (e.g. this ever
      // ran twice) never gets a second one.
      // "health_finish" is the live (Phase 5.2) chapter; a record still on
      // an older shape (no health_finish answers at all) is checked against
      // whichever earlier bag it actually has instead.
      const trigger = existing.answers.health_finish
        ? computeHealthReviewRequired(existing.answers.health_finish)
        : computeLegacyHealthReviewRequired(existing.answers.health ?? existing.answers.health_readiness);
      const alreadyHasReview = state.healthReviews.some((r) => r.clientId === action.clientId);
      const healthReviews =
        trigger.required && !alreadyHasReview
          ? [
              ...state.healthReviews,
              {
                clientId: action.clientId,
                workspaceId: action.workspaceId,
                status: "review_needed" as const,
                reasons: trigger.reasons,
                createdAtIso: action.nowIso,
                updatedAtIso: action.nowIso,
              },
            ]
          : state.healthReviews;

      return { ...state, onboarding, lifecycles, healthReviews };
    }

    case "SET_CLIENT_LIFECYCLE": {
      return {
        ...state,
        lifecycles: upsertLifecycle(state.lifecycles, action.clientId, action.workspaceId, action.status, action.nowIso),
      };
    }

    case "SET_HEALTH_REVIEW_STATUS": {
      const existingIndex = state.healthReviews.findIndex((r) => r.clientId === action.clientId);
      if (existingIndex === -1) return state;
      const healthReviews = state.healthReviews.map((r, i) =>
        i === existingIndex ? { ...r, status: action.status, updatedAtIso: action.nowIso } : r
      );
      return { ...state, healthReviews };
    }

    case "SAVE_PROGRAM_TEMPLATE": {
      const existingIndex = state.programTemplates.findIndex((t) => t.id === action.template.id);
      const programTemplates =
        existingIndex === -1
          ? [...state.programTemplates, action.template]
          : state.programTemplates.map((t, i) => (i === existingIndex ? action.template : t));
      return { ...state, programTemplates };
    }

    case "DELETE_PROGRAM_TEMPLATE": {
      // Scoped to the acting coach's own id — a coach can never delete
      // another coach's template even by guessing its id, the same
      // isolation discipline every other coach-owned record in this store
      // follows.
      return { ...state, programTemplates: state.programTemplates.filter((t) => !(t.id === action.templateId && t.coachId === action.coachId)) };
    }

    case "SAVE_MEAL_RECOMMENDATION": {
      const existingIndex = state.mealRecommendations.findIndex((r) => r.id === action.recommendation.id);
      const mealRecommendations =
        existingIndex === -1
          ? [...state.mealRecommendations, action.recommendation]
          : state.mealRecommendations.map((r, i) => (i === existingIndex ? action.recommendation : r));
      return { ...state, mealRecommendations };
    }

    case "DELETE_MEAL_RECOMMENDATION": {
      return {
        ...state,
        mealRecommendations: state.mealRecommendations.filter((r) => !(r.id === action.recommendationId && r.coachId === action.coachId)),
      };
    }

    case "SET_MEAL_RECOMMENDATION_ASSIGNMENT": {
      return {
        ...state,
        mealRecommendations: state.mealRecommendations.map((r) => {
          if (r.id !== action.recommendationId || r.coachId !== action.coachId) return r;
          const assignedClientIds = action.assigned
            ? r.assignedClientIds.includes(action.clientId)
              ? r.assignedClientIds
              : [...r.assignedClientIds, action.clientId]
            : r.assignedClientIds.filter((id) => id !== action.clientId);
          return { ...r, assignedClientIds, updatedAtIso: new Date().toISOString() };
        }),
      };
    }

    case "SET_AI_AUTHORITY_GLOBAL": {
      const existingIndex = state.aiAuthoritySettings.findIndex((s) => s.coachId === action.coachId);
      const existing = state.aiAuthoritySettings[existingIndex];
      const next: CoachAiAuthoritySettings = {
        coachId: action.coachId,
        workspaceId: action.workspaceId,
        global: action.config,
        clientOverrides: existing?.clientOverrides ?? {},
        updatedAtIso: action.nowIso,
      };
      const aiAuthoritySettings =
        existingIndex === -1 ? [...state.aiAuthoritySettings, next] : state.aiAuthoritySettings.map((s, i) => (i === existingIndex ? next : s));
      return { ...state, aiAuthoritySettings };
    }

    case "SET_AI_AUTHORITY_CLIENT_OVERRIDE": {
      const existingIndex = state.aiAuthoritySettings.findIndex((s) => s.coachId === action.coachId);
      const existing = existingIndex === -1 ? defaultCoachAiAuthoritySettings(action.coachId, action.workspaceId, action.nowIso) : state.aiAuthoritySettings[existingIndex];
      const clientOverrides = { ...existing.clientOverrides };
      if (action.config === null) {
        delete clientOverrides[action.clientId];
      } else {
        clientOverrides[action.clientId] = action.config;
      }
      const next: CoachAiAuthoritySettings = { ...existing, clientOverrides, updatedAtIso: action.nowIso };
      const aiAuthoritySettings =
        existingIndex === -1 ? [...state.aiAuthoritySettings, next] : state.aiAuthoritySettings.map((s, i) => (i === existingIndex ? next : s));
      return { ...state, aiAuthoritySettings };
    }

    case "SAVE_COACH_ONBOARDING_PROGRESS": {
      const existingIndex = state.coachOnboardingProgress.findIndex((p) => p.coachId === action.progress.coachId);
      const coachOnboardingProgress =
        existingIndex === -1
          ? [...state.coachOnboardingProgress, action.progress]
          : state.coachOnboardingProgress.map((p, i) => (i === existingIndex ? action.progress : p));
      return { ...state, coachOnboardingProgress };
    }

    case "SAVE_COACH_OPERATING_MODEL": {
      // Activating a new version supersedes whichever version was
      // previously active for this coach — never more than one "active"
      // version per coach at a time (see operating-model.ts's module doc).
      // A "draft" save (still being calibrated) never touches another
      // version's status.
      const coachOperatingModels =
        action.model.status === "active"
          ? [
              ...state.coachOperatingModels.map((m) =>
                m.coachId === action.model.coachId && m.status === "active" && m.version !== action.model.version
                  ? { ...m, status: "superseded" as const, supersededByVersion: action.model.version }
                  : m
              ),
            ]
          : [...state.coachOperatingModels];
      const existingIndex = coachOperatingModels.findIndex((m) => m.coachId === action.model.coachId && m.version === action.model.version);
      const next = existingIndex === -1 ? [...coachOperatingModels, action.model] : coachOperatingModels.map((m, i) => (i === existingIndex ? action.model : m));
      return { ...state, coachOperatingModels: next };
    }

    case "SAVE_ACTIVATION_GENERATION": {
      const existingIndex = state.activationGenerations.findIndex((r) => r.id === action.record.id);
      const activationGenerations =
        existingIndex === -1 ? [...state.activationGenerations, action.record] : state.activationGenerations.map((r, i) => (i === existingIndex ? action.record : r));
      return { ...state, activationGenerations };
    }

    case "SAVE_COMMUNICATION_POLICY": {
      const existingIndex = state.communicationPolicies.findIndex((p) => p.clientId === action.policy.clientId);
      const communicationPolicies =
        existingIndex === -1 ? [...state.communicationPolicies, action.policy] : state.communicationPolicies.map((p, i) => (i === existingIndex ? action.policy : p));
      return { ...state, communicationPolicies };
    }

    case "SAVE_DAILY_BRIEFING": {
      const existingIndex = state.dailyBriefings.findIndex((b) => b.id === action.record.id);
      const dailyBriefings =
        existingIndex === -1 ? [...state.dailyBriefings, action.record] : state.dailyBriefings.map((b, i) => (i === existingIndex ? action.record : b));
      return { ...state, dailyBriefings };
    }

    case "SET_BRIEFING_GLOBAL_AUTOMATION": {
      const existingIndex = state.briefingSettings.findIndex((s) => s.coachId === action.coachId);
      const existing = state.briefingSettings[existingIndex];
      const next: CoachBriefingSettings = {
        coachId: action.coachId,
        workspaceId: action.workspaceId,
        globalAutomation: action.automation,
        clientOverrides: existing?.clientOverrides ?? {},
        updatedAtIso: action.nowIso,
      };
      const briefingSettings = existingIndex === -1 ? [...state.briefingSettings, next] : state.briefingSettings.map((s, i) => (i === existingIndex ? next : s));
      return { ...state, briefingSettings };
    }

    case "SET_BRIEFING_CLIENT_OVERRIDE": {
      const existingIndex = state.briefingSettings.findIndex((s) => s.coachId === action.coachId);
      const existing = existingIndex === -1 ? defaultCoachBriefingSettings(action.coachId, action.workspaceId, action.nowIso) : state.briefingSettings[existingIndex];
      const clientOverrides = { ...existing.clientOverrides };
      if (action.automation === null) {
        delete clientOverrides[action.clientId];
      } else {
        clientOverrides[action.clientId] = action.automation;
      }
      const next: CoachBriefingSettings = { ...existing, clientOverrides, updatedAtIso: action.nowIso };
      const briefingSettings = existingIndex === -1 ? [...state.briefingSettings, next] : state.briefingSettings.map((s, i) => (i === existingIndex ? next : s));
      return { ...state, briefingSettings };
    }

    case "SAVE_COACH_BRIEF": {
      const existingIndex = state.coachBriefs.findIndex((b) => b.clientId === action.record.clientId);
      const coachBriefs = existingIndex === -1 ? [...state.coachBriefs, action.record] : state.coachBriefs.map((b, i) => (i === existingIndex ? action.record : b));
      return { ...state, coachBriefs };
    }

    case "SAVE_ADAPTATION_PROPOSAL": {
      const existingIndex = state.adaptationProposals.findIndex((p) => p.id === action.proposal.id);
      const adaptationProposals =
        existingIndex === -1 ? [...state.adaptationProposals, action.proposal] : state.adaptationProposals.map((p, i) => (i === existingIndex ? action.proposal : p));
      return { ...state, adaptationProposals };
    }

    default:
      return state;
  }
}

function isV1Shape(w: Record<string, unknown>): boolean {
  return (
    w.version === 1 &&
    Array.isArray(w.clients) &&
    Array.isArray(w.lifecycles) &&
    Array.isArray(w.invitations) &&
    Array.isArray(w.onboarding) &&
    Array.isArray(w.intendedPrograms)
  );
}

function isV2Shape(w: Record<string, unknown>): boolean {
  return (
    w.version === 2 &&
    Array.isArray(w.clients) &&
    Array.isArray(w.lifecycles) &&
    Array.isArray(w.invitations) &&
    Array.isArray(w.onboarding) &&
    Array.isArray(w.intendedPrograms) &&
    Array.isArray(w.healthReviews)
  );
}

function isV3Shape(w: Record<string, unknown>): boolean {
  return (
    w.version === 3 &&
    Array.isArray(w.clients) &&
    Array.isArray(w.lifecycles) &&
    Array.isArray(w.invitations) &&
    Array.isArray(w.onboarding) &&
    Array.isArray(w.intendedPrograms) &&
    Array.isArray(w.healthReviews) &&
    Array.isArray(w.programTemplates)
  );
}

function isV4Shape(w: Record<string, unknown>): boolean {
  return isV3Shape({ ...w, version: 3 }) && w.version === 4 && Array.isArray(w.mealRecommendations);
}

function isV5Shape(w: Record<string, unknown>): boolean {
  return isV4Shape({ ...w, version: 4 }) && w.version === 5 && Array.isArray(w.aiAuthoritySettings);
}

function isV6Shape(w: Record<string, unknown>): boolean {
  return (
    isV5Shape({ ...w, version: 5 }) &&
    w.version === 6 &&
    Array.isArray(w.coachOperatingModels) &&
    Array.isArray(w.coachOnboardingProgress) &&
    Array.isArray(w.activationGenerations) &&
    Array.isArray(w.communicationPolicies)
  );
}

function isV7Shape(w: Record<string, unknown>): boolean {
  return isV6Shape({ ...w, version: 6 }) && w.version === 7 && Array.isArray(w.dailyBriefings) && Array.isArray(w.briefingSettings);
}

function isV8Shape(w: Record<string, unknown>): boolean {
  return isV7Shape({ ...w, version: 7 }) && w.version === 8 && Array.isArray(w.coachBriefs);
}

function isV9Shape(w: Record<string, unknown>): boolean {
  return isV8Shape({ ...w, version: 8 }) && w.version === 9 && Array.isArray(w.adaptationProposals);
}

/**
 * Version-gated migration chain (same discipline as
 * lib/tenancy/migrate.ts's migrateStoredState) — a v1 store (the only
 * shape that ever existed before Phase 5.1's health-review feature) is
 * upgraded in place by adding the one new field it never had rather than
 * being discarded; every existing client, lifecycle, invitation, and
 * onboarding answer survives untouched. Anything that matches neither
 * shape returns null so the caller falls back to a fresh state instead of
 * crashing on it.
 */
export function migratePlatformState(stored: unknown): PlatformState | null {
  if (!stored || typeof stored !== "object") return null;
  let working = stored as Record<string, unknown>;

  if (isV1Shape(working)) {
    working = { ...working, version: 2, healthReviews: [] };
  }

  if (isV2Shape(working)) {
    working = { ...working, version: 3, programTemplates: [] };
  }

  if (isV3Shape(working)) {
    working = { ...working, version: 4, mealRecommendations: [] };
  }

  if (isV4Shape(working)) {
    working = { ...working, version: 5, aiAuthoritySettings: [] };
  }

  if (isV5Shape(working)) {
    working = { ...working, version: 6, coachOperatingModels: [], coachOnboardingProgress: [], activationGenerations: [], communicationPolicies: [] };
  }

  if (isV6Shape(working)) {
    working = { ...working, version: 7, dailyBriefings: [], briefingSettings: [] };
  }

  if (isV7Shape(working)) {
    working = { ...working, version: 8, coachBriefs: [] };
  }

  if (isV8Shape(working)) {
    working = { ...working, version: 9, adaptationProposals: [] };
  }

  if (isV9Shape(working)) {
    return working as unknown as PlatformState;
  }
  return null;
}

export const PLATFORM_STORAGE_KEY = "peak-coaching:platform:v1";
export const DEFAULT_WORKSPACE_ID = WORKSPACE_OPTIM_ID;
