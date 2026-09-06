// Phase 5.4B — Daily Briefings (spec §7): a real, persisted per-client,
// per-day record powering the client's short "Today's Edge" first-open
// experience (spec §8) and the coach's prepare/preview/edit/approve/publish
// workflow. Mirrors lib/coach/ai-authority.ts's exact global-default +
// sparse-per-client-override pattern for automation settings — a coach who
// has never touched this setting gets an honest, documented default
// (review-first) rather than a silent no-op.
//
// No generative AI provider exists in this repository (see
// lib/coach/activation-generation.ts's own module doc for the same
// honesty). generateDailyBriefing is a pure, deterministic function over
// real client state — the exact same "real deterministic generation, safe
// failure handling" discipline the rest of this codebase already follows —
// never a simulated/fabricated AI call.

import { resolveWorkoutAvailabilityForDay } from "../mock-data.ts";
import { deriveProgramWeek } from "../scheduling/enrollment.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import type { AppState } from "../state";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

export type BriefingAutomationSetting = "review_first" | "auto_publish";

export interface CoachBriefingSettings {
  coachId: CoachProfileId;
  workspaceId: WorkspaceId;
  globalAutomation: BriefingAutomationSetting;
  /** Sparse — a client only appears here once a coach has explicitly set an
   * override for them. Absence means "use the global default." */
  clientOverrides: Record<ClientProfileId, BriefingAutomationSetting>;
  updatedAtIso: string;
}

export const DEFAULT_BRIEFING_AUTOMATION: BriefingAutomationSetting = "review_first";

export function defaultCoachBriefingSettings(coachId: CoachProfileId, workspaceId: WorkspaceId, nowIso: string): CoachBriefingSettings {
  return { coachId, workspaceId, globalAutomation: DEFAULT_BRIEFING_AUTOMATION, clientOverrides: {}, updatedAtIso: nowIso };
}

export function resolveEffectiveBriefingAutomation(settings: CoachBriefingSettings, clientId: ClientProfileId | null): BriefingAutomationSetting {
  const override = clientId ? settings.clientOverrides[clientId] : undefined;
  return override ?? settings.globalAutomation;
}

/** Every draft/approved/scheduled/sent-published/auto-published state the
 * spec's §7 explicitly asks for, plus "held_for_review" (spec §7's
 * sensitive-content override, which applies regardless of the automation
 * setting). "scheduled" is reserved for a future real send-time scheduler —
 * this prototype has none, so generateDailyBriefing never produces it on
 * its own; it exists so a coach-driven "Schedule for later" action (should
 * one be added) has a real, already-modeled status to land on. */
export type DailyBriefingStatus = "draft" | "held_for_review" | "approved" | "scheduled" | "published" | "auto_published";

export interface DailyBriefingRecord {
  id: string;
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  /** The client's own local calendar date this briefing is for — one record
   * per client per date, matching AppState.dateIso's own convention. */
  forDateIso: string;
  isTrainingDay: boolean;
  status: DailyBriefingStatus;
  /** The one clear focus for today — a short phrase, never a paragraph. */
  focusLine: string;
  /** The one actionable step — never a checklist. */
  actionStep: string;
  /** focusLine + actionStep, composed into the ~1-2 line client-facing
   * "Today's Edge" text — the single field the client screen renders. */
  todaysEdgeText: string;
  /** Present only when status is "held_for_review" — why (spec §7: a
   * sensitive flag, pain issue, unapproved program change, or low-
   * confidence output holds a briefing regardless of the automation
   * setting). */
  heldForReviewReason?: string;
  approvedByCoachId?: CoachProfileId;
  approvedByCoachName?: string;
  approvedAtIso?: string;
  publishedAtIso?: string;
  generationSource: "generated" | "coach_edited";
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ShouldHoldBriefingInput {
  hasPainFlag: boolean;
  hasUnapprovedProgramChange: boolean;
  hasLowConfidenceSignal: boolean;
}

/** Spec §7: "If the day contains a sensitive flag, pain issue, unapproved
 * program change, or low-confidence output, hold the briefing for review
 * regardless of automation setting." Pure and total — every input
 * combination returns a real, deterministic decision. */
export function shouldHoldBriefingForReview(input: ShouldHoldBriefingInput): { hold: boolean; reason?: string } {
  if (input.hasPainFlag) return { hold: true, reason: "A pain or injury item is open for this client." };
  if (input.hasUnapprovedProgramChange) return { hold: true, reason: "A program or exercise change is still awaiting your approval." };
  if (input.hasLowConfidenceSignal) return { hold: true, reason: "OPTIM's generated content needs your confirmation before it reaches the client." };
  return { hold: false };
}

export interface GenerateDailyBriefingInput extends ShouldHoldBriefingInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  forDateIso: string;
  isTrainingDay: boolean;
  workoutDisplayName?: string;
  workoutFocus?: string;
  automation: BriefingAutomationSetting;
  nowIso: string;
}

/**
 * Deterministic Today's Edge generation — real fields in, a short real
 * client-facing line out. Never invents a coaching decision: a training
 * day names the actual assigned workout/focus already resolved elsewhere
 * (see lib/mock-data.ts's resolveWorkoutAvailabilityForDay); a rest day
 * gets honest recovery-oriented copy. Deliberately short — one focus, one
 * actionable step, no checklist, no generic motivational filler (spec §7).
 */
export function generateDailyBriefing(input: GenerateDailyBriefingInput): DailyBriefingRecord {
  const focusLine = input.isTrainingDay
    ? input.workoutFocus
      ? `Today's focus: ${input.workoutFocus}.`
      : `Today's session: ${input.workoutDisplayName ?? "your scheduled workout"}.`
    : "Recovery day — no training scheduled.";
  const actionStep = input.isTrainingDay
    ? "Show up and get your first working set in — everything else follows from there."
    : "Prioritize sleep and hit your protein target.";
  const todaysEdgeText = `${focusLine} ${actionStep}`;

  const hold = shouldHoldBriefingForReview(input);
  const status: DailyBriefingStatus = hold.hold ? "held_for_review" : input.automation === "auto_publish" ? "auto_published" : "draft";

  return {
    id: `briefing-${input.clientId}-${input.forDateIso}`,
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    forDateIso: input.forDateIso,
    isTrainingDay: input.isTrainingDay,
    status,
    focusLine,
    actionStep,
    todaysEdgeText,
    heldForReviewReason: hold.reason,
    publishedAtIso: status === "auto_published" ? input.nowIso : undefined,
    generationSource: "generated",
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

/** draft/held_for_review -> approved. A coach editing the text first (see
 * editDailyBriefingText) then approving is the normal review-first path;
 * approving directly is also valid (spec §7's "preview, approve" without a
 * mandatory edit step). */
export function approveDailyBriefing(record: DailyBriefingRecord, coachId: CoachProfileId, coachName: string, nowIso: string): DailyBriefingRecord {
  return { ...record, status: "approved", approvedByCoachId: coachId, approvedByCoachName: coachName, approvedAtIso: nowIso, updatedAtIso: nowIso };
}

/** approved -> published (or auto_published -> published if a coach chooses
 * to explicitly publish anyway; both are valid "the client can see it now"
 * states). */
export function publishDailyBriefing(record: DailyBriefingRecord, nowIso: string): DailyBriefingRecord {
  return { ...record, status: "published", publishedAtIso: nowIso, updatedAtIso: nowIso };
}

/** A coach's own edit to the client-facing text — never regenerates the
 * whole record, and marks generationSource so the distinction between
 * "OPTIM wrote this" and "the coach rewrote this" is never lost. */
export function editDailyBriefingText(record: DailyBriefingRecord, todaysEdgeText: string, nowIso: string): DailyBriefingRecord {
  return { ...record, todaysEdgeText, generationSource: "coach_edited", updatedAtIso: nowIso };
}

/**
 * Bridges a client's own real, live AppState into generateDailyBriefing's
 * input — the one place that decides "is today a training day" and "what's
 * the real workout" for this purpose, reusing the exact same
 * resolveWorkoutAvailabilityForDay/deriveProgramWeek combination
 * lib/calculations.ts's Today derivation already uses (see that file's
 * WORKOUT_STATE case), so a briefing can never disagree with what Today
 * itself shows for the same day. `hasPainFlag`/`hasUnapprovedProgramChange`
 * are read directly from this client's own real, unresolved
 * ReviewRequests — never inferred. `hasLowConfidenceSignal` is currently
 * always false: no generative AI provider exists in this repository (see
 * this file's module doc), so nothing here can genuinely produce a
 * low-confidence signal yet — an honest false, not a fabricated one.
 */
export function resolveBriefingGenerationInput(
  clientAppState: AppState,
  coachId: CoachProfileId,
  automation: BriefingAutomationSetting,
  nowIso: string
): GenerateDailyBriefingInput {
  const clientDeclaredRest = clientAppState.dailyTrainingPlan?.status === "rest_day";
  const dayOfWeek = localDateDayOfWeek(clientAppState.dateIso);
  const weekNumber = deriveProgramWeek(clientAppState.programEnrollment, clientAppState.dateIso);
  const availability = resolveWorkoutAvailabilityForDay(dayOfWeek, clientDeclaredRest, clientAppState.assignedProgram, weekNumber);
  const isTrainingDay = !clientDeclaredRest && availability.scheduleEntry?.type === "training";

  const unresolvedReviews = clientAppState.reviewRequests.filter((r) => r.status !== "resolved");
  const hasPainFlag = unresolvedReviews.some((r) => r.kind === "pain-report");
  const hasUnapprovedProgramChange = unresolvedReviews.some((r) => r.kind === "program-change-request");

  return {
    clientId: clientAppState.clientId,
    workspaceId: clientAppState.workspaceId,
    coachId,
    forDateIso: clientAppState.dateIso,
    isTrainingDay,
    workoutDisplayName: isTrainingDay ? availability.displayName : undefined,
    workoutFocus: isTrainingDay ? availability.focus : undefined,
    automation,
    hasPainFlag,
    hasUnapprovedProgramChange,
    hasLowConfidenceSignal: false,
    nowIso,
  };
}

/** True once a briefing is actually visible to the client — used by the
 * client-side Today's Edge screen to decide between the coach-reviewed
 * text and its own honest, always-available fallback (spec §7's "safe
 * failure handling, deterministic fallback so UI never shows broken or
 * fabricated content"). */
export function isBriefingVisibleToClient(status: DailyBriefingStatus): boolean {
  return status === "published" || status === "auto_published";
}
