// Phase 5.0A — coach/onboarding/lifecycle domain types.
//
// These extend (never duplicate) the existing tenancy and scheduling models:
// a ClientLifecycleRecord/ClientInvitation/OnboardingProgress is keyed by
// the same ClientProfileId every other client-owned record already uses
// (see lib/tenancy/types.ts's ClientOwned), and ProgramAssignmentRef points
// at a real ProgramEnrollmentId rather than copying enrollment data. See
// lib/coach/platform-store.ts for where these are actually persisted (a
// separate store from the per-client AppState — see that file's doc for
// why) and lib/coach/repository.ts for the read-side that joins them with
// the existing seed roster.

import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { ProgramEnrollmentId } from "../scheduling/types";
import type { MacroValues, MealPeriod, ProgramWeek, ReviewRequestKind, ReviewRequestStatus, ReviewResolutionAction, ReviewSeverity } from "../types";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * A client's coaching lifecycle stage — distinct from ProgramPhase (see
 * lib/scheduling/types.ts), which only describes where a date falls inside
 * an ALREADY-active enrollment. This describes the client relationship
 * itself, from first invitation through to completion:
 *
 * - invited: an invitation exists; the client hasn't opened it yet.
 * - onboarding: the client has started but not finished the intake flow.
 * - coach_setup: intake is complete; the coach hasn't finished preparing
 *   the client for activation yet (assigning a program, confirming
 *   configuration).
 * - ready_to_activate: coach setup is complete; activation just hasn't been
 *   triggered yet.
 * - active: the client uses the real Today/Training/Nutrition/Progress/Chat
 *   interface day to day.
 * - paused: temporarily inactive — must never expose an active daily plan.
 * - completed: the coaching relationship/program has ended.
 */
export type ClientLifecycleStatus =
  | "invited"
  | "onboarding"
  | "coach_setup"
  | "ready_to_activate"
  | "active"
  | "paused"
  | "completed";

export interface ClientLifecycleRecord {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  status: ClientLifecycleStatus;
  updatedAtIso: string;
}

// ---------------------------------------------------------------------------
// Invitation
// ---------------------------------------------------------------------------

/** Local-prototype delivery adapter result — "local_link_only" is the only
 * implementation today. A real email/SMS adapter would add its own variant
 * here without changing anything else about how an invitation is modeled or
 * consumed — see lib/coach/repository.ts's createClientInvitation. */
export type InvitationDeliveryMethod = "local_link_only";

export interface ClientInvitation {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  /** Opaque token used in the /invite/[token] URL — never the raw clientId,
   * so an invitation link doesn't itself expose internal ids. */
  token: string;
  delivery: InvitationDeliveryMethod;
  createdAtIso: string;
  acceptedAtIso?: string;
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

/**
 * The full lineage of onboarding step ids this app has ever used. Only
 * "about_you" through "health_finish" plus "review" (Phase 5.2) are ever
 * written by the LIVE wizard today — every other id here is kept purely so
 * an already-completed older client's OnboardingProgress.answers (keyed by
 * that era's step ids) stays type-valid and readable. See
 * components/coach/coach-brief.tsx for the one place that reads the older
 * ids, and lib/coach/onboarding-steps.ts's own module doc for why each era
 * still has its field definitions available for that lookup:
 *   - "schedule_lifestyle" / "health_readiness": the original 7-step intake.
 *   - "basics" / "goals" / "availability" / "training_background" /
 *     "nutrition" / "recovery" / "health" / "coaching": Phase 5.1's
 *     nine-section expanded intake.
 *   - "about_you" / "what_you_want" / "your_week" / "starting_point" /
 *     "fuel_recovery" / "health_finish": Phase 5.2's live six-chapter
 *     intake.
 */
export type OnboardingStepId =
  | "about_you"
  | "what_you_want"
  | "your_week"
  | "starting_point"
  | "fuel_recovery"
  | "health_finish"
  | "review"
  | "basics"
  | "goals"
  | "availability"
  | "training_background"
  | "nutrition"
  | "recovery"
  | "health"
  | "coaching"
  | "schedule_lifestyle"
  | "health_readiness";

/**
 * Deliberately loose (per-step shape lives in lib/coach/onboarding-steps.ts
 * field definitions, not in this type) — data-driven framework, not a
 * hardcoded field list. Widened in Phase 5.1 to also allow string arrays
 * (multi-select tiles, day-of-week selection) and repeatable structured
 * entries (InjuryEntry[], the only non-primitive/non-array-of-primitive
 * shape the intake needs — see lib/coach/onboarding-steps.ts's
 * "injury_list" field type).
 */
export type OnboardingAnswerValue = string | number | boolean | string[] | InjuryEntry[] | undefined;
export type OnboardingStepAnswers = Record<string, OnboardingAnswerValue>;

/**
 * One structured pain/injury entry (Phase 5.1's Health & readiness step).
 * Multiple entries are supported — see components/onboarding/
 * injury-list-editor.tsx — because a client with more than one relevant
 * issue must never be forced to compress them into one free-text field.
 * Every field here is something Teague would otherwise have to ask for
 * manually before programming around it.
 */
export interface InjuryEntry {
  id: string;
  bodyArea: string;
  side: "left" | "right" | "both" | "not_applicable";
  onset: string;
  status: "present_not_limiting" | "requires_modification" | "significantly_limits" | "prevents_training";
  aggravatingFactors: string;
  currentImpact: string;
  evaluatedProfessionally: boolean;
  diagnosis: string;
  currentGuidance: string;
  rehab: string;
}

// ---------------------------------------------------------------------------
// Health review — separate from, and never satisfied by, onboarding
// completion. See lib/coach/health-review.ts for the pure trigger logic.
// ---------------------------------------------------------------------------

/**
 * Coach-controlled only — OPTIM/the client never sets or clears this.
 * Deliberately none of these read as "medically cleared": Teague is always
 * recording what THEY did (reviewed, asked the client to discuss, asked
 * for professional guidance), never a determination OPTIM made about the
 * client's safety.
 */
export type HealthReviewStatus =
  | "review_needed"
  | "discuss_with_client"
  | "professional_guidance_requested"
  | "professional_guidance_confirmed"
  | "reviewed_by_coach";

/** Statuses that unblock activation — both represent Teague having
 * actually completed their part, not OPTIM deciding anything. */
export const RESOLVED_HEALTH_REVIEW_STATUSES: ReadonlySet<HealthReviewStatus> = new Set([
  "professional_guidance_confirmed",
  "reviewed_by_coach",
]);

export interface HealthReviewRecord {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  status: HealthReviewStatus;
  /** Plain-language reasons the review was created (e.g. "Reported a
   * current pain/injury", "Positive pre-participation safety response") —
   * never a diagnosis, always traceable to a real submitted answer. */
  reasons: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OnboardingProgress {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  currentStepIndex: number;
  answers: Partial<Record<OnboardingStepId, OnboardingStepAnswers>>;
  completedAtIso?: string;
  updatedAtIso: string;
}

// ---------------------------------------------------------------------------
// Program assignment (reference only — never a copy of enrollment data)
// ---------------------------------------------------------------------------

/** What the coach captured as intent at "Add client" time — a start date
 * and duration to invite the client toward, NOT yet a binding program
 * assignment. No program-authoring/assignment UI exists in this phase (see
 * the Phase 5.0A brief's explicit scope limits), so this alone can never
 * satisfy the activation-readiness "program assignment exists" check — see
 * lib/coach/activation.ts. */
export interface ClientIntendedProgram {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  intendedStartDateIso: string;
  intendedDurationWeeks: number;
  /** Whether the coach wants a weekly check-in assigned once this client is
   * activated — recorded here as intent only; the real
   * CheckInScheduleConfig (see lib/scheduling/types.ts) isn't created until
   * an enrollment exists to attach it to. Configurable per client, never a
   * workspace-wide default. */
  intendedWeeklyCheckIn: boolean;
}

/** A REAL program assignment — points at an existing ProgramEnrollment
 * (see lib/scheduling/types.ts) rather than duplicating its data. Only the
 * pre-seeded demo client resolves one today (from its live AppState.
 * programEnrollment — see lib/coach/repository.ts's
 * resolveProgramAssignmentRef), since no program-authoring flow exists yet
 * to create one for a newly onboarded client. */
export interface ProgramAssignmentRef {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  enrollmentId: ProgramEnrollmentId;
  assignedAtIso: string;
}

// ---------------------------------------------------------------------------
// Activation readiness
// ---------------------------------------------------------------------------

export type ActivationRequirementId =
  | "onboarding_complete"
  | "assigned_coach_exists"
  | "start_date_exists"
  | "week1_program_assigned"
  | "nutrition_configuration_exists"
  | "health_review_resolved";

export interface ActivationRequirementResult {
  id: ActivationRequirementId;
  label: string;
  met: boolean;
  /** Present only when not met — the exact, honest reason shown to the
   * coach (never a vague "not ready"). */
  reason?: string;
  /** Present only when not met — where the coach can go to directly
   * complete this specific requirement, so an unmet row is never left as a
   * dead end (see components/coach/activation-checklist.tsx). Filled in by
   * the page that has real route context (see
   * app/coach/clients/[clientId]/page.tsx), never by
   * lib/coach/activation.ts itself. */
  actionHref?: string;
  actionLabel?: string;
}

export interface ActivationReadiness {
  ready: boolean;
  requirements: ActivationRequirementResult[];
}

// ---------------------------------------------------------------------------
// Coach attention queue
// ---------------------------------------------------------------------------

/** "health_review" is the one AttentionItemKind not backed by a real
 * ReviewRequest (see lib/types.ts) — it's synthesized directly from a
 * HealthReviewRecord by lib/coach/attention-queue.ts, still only ever for
 * this coach's own client in this coach's own workspace. */
export type AttentionItemKind = ReviewRequestKind | "health_review";

/** One item in the coach's "Needs attention" queue — always traces back to
 * a real ReviewRequest (see lib/types.ts) already created by existing
 * client-side flows (workout pain reports, Chat escalations, ...). Never a
 * fabricated notification. */
export interface AttentionQueueItem {
  reviewRequestId: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  clientName: string;
  assignedCoachId: CoachProfileId;
  kind: AttentionItemKind;
  summary: string;
  createdAtIso: string;
  updatedAtIso: string;
  /** Lower sorts first — pain/injury is always most urgent regardless of
   * recency; see lib/coach/attention-queue.ts's ATTENTION_PRIORITY. */
  priority: number;
  severity: ReviewSeverity;
  /** A synthesized "health_review" item (see lib/coach/attention-queue.ts)
   * is only ever surfaced while unresolved, so it always reads
   * "needs_review" here — its own real lifecycle lives on the
   * HealthReviewRecord itself, resolved through the client detail page. */
  status: ReviewRequestStatus;
  resolutionAction?: ReviewResolutionAction;
  resolutionNote?: string;
  resolvedAtIso?: string;
  resolvedByCoachId?: CoachProfileId;
  /** health_review only: the full HealthReviewRecord.reasons list (summary
   * carries only reasons[0]) — every discrete, real reason the intake
   * flagged this client, rendered as individual evidence chips rather than
   * folded into one sentence. Undefined for every other kind. */
  reasons?: string[];
}

// ---------------------------------------------------------------------------
// Coach-owned training-protocol templates (Phase 5.2)
// ---------------------------------------------------------------------------

/** A coach's own reusable program template — owned and isolated by coach
 * account, never visible in another coach's library (see
 * lib/coach/platform-store.ts's PlatformState.programTemplates and
 * lib/coach/repository.ts's scoping). Assigning one to a client always
 * produces an independent copy (see lib/coach/training.ts's
 * assignTemplateToClient) — editing this template later never rewrites an
 * already-assigned client's program. */
export interface CoachProgramTemplate {
  id: string;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  name: string;
  durationWeeks: number;
  weeks: ProgramWeek[];
  createdAtIso: string;
  updatedAtIso: string;
}

// ---------------------------------------------------------------------------
// Coach-owned meal recommendations (Phase 5.2)
// ---------------------------------------------------------------------------

export type MealRecommendationTag =
  | "quick"
  | "pre_workout"
  | "post_workout"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack";

/**
 * A coach's own reusable meal recommendation — owned and isolated by coach
 * account, exactly like CoachProgramTemplate above; never visible in
 * another coach's library, and a client sees only recommendations this
 * coach has explicitly assigned to them (see assignedClientIds below).
 * Deliberately distinct from lib/types.ts's MealOption (the client's own
 * loggable catalog): a recommendation is coach guidance shown alongside
 * nutrition targets, never a generic loggable meal, and its macros are
 * optional — never fabricated when the coach hasn't supplied them (see
 * lib/coach/meal-recommendations.ts).
 */
export interface MealRecommendation {
  id: string;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  name: string;
  /** Intended timing/category — organizes the coach's own library; this
   * never becomes a loggable MealOption. */
  category: MealPeriod;
  ingredients: string;
  instructions?: string;
  /** Only ever present when the coach actually supplied real values. */
  macros?: Partial<MacroValues>;
  tags: MealRecommendationTag[];
  status: "active" | "archived";
  /** Which of this coach's own clients currently see this recommendation —
   * a client only ever appears here through an explicit coach "Assign"
   * action (see lib/coach/meal-recommendations.ts's
   * toggleMealRecommendationAssignment). */
  assignedClientIds: ClientProfileId[];
  createdAtIso: string;
  updatedAtIso: string;
}
