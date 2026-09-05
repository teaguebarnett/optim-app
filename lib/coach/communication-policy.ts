// Phase 5.4A — the initial per-client communication policy (Part VIII of
// the phase brief). Honest and internal-only: no real SMS/email/push
// provider exists in this repository (see the final report), so this is a
// real, persisted RECORD of intent — a previewable, inspectable queue —
// never a claim that a message was actually delivered. Architected so a
// future real provider only needs to read this same shape and a future
// "send a morning check-in to all active clients" campaign feature only
// needs to iterate these records, not invent a new one per client.

import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { CoachOperatingModel } from "./operating-model.ts";

export type ScheduledMessageKind = "welcome" | "morning_message" | "workout_reminder" | "weekly_progress_prompt" | "missed_workout_follow_up" | "hydration_reminder";

export interface ScheduledActionRecord {
  id: string;
  kind: ScheduledMessageKind;
  /** Plain-language description of when this would actually fire — this
   * prototype never runs a real scheduler, so this is descriptive intent,
   * not a cron expression. */
  cadenceDescription: string;
  /** The real, personalized draft text — built from real client/coach
   * fields (name, tone, quiet hours), never a placeholder. */
  draftText: string;
  /** Whether this specific kind may ever be sent without a coach reviewing
   * it first, per the coach's communication AI Authority — see
   * resolveCommunicationDisposition below. */
  requiresCoachApproval: boolean;
}

export interface ClientCommunicationPolicy {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  timeZone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  scheduledActions: ScheduledActionRecord[];
  createdAtIso: string;
  updatedAtIso: string;
}

function buildWelcomeDraft(clientFirstName: string, coachName: string, businessName: string, tone: string): string {
  const warm = tone === "warm" || tone === "encouraging_direct";
  if (warm) return `Hey ${clientFirstName} — welcome to ${businessName}! ${coachName} has your plan ready. Excited to get started with you.`;
  return `${clientFirstName}, welcome to ${businessName}. Your plan from ${coachName} is ready — let's get to work.`;
}

function buildMissedWorkoutDraft(clientFirstName: string, style: string): string {
  if (style === "same_day_firm_check_in") return `${clientFirstName}, that's your second missed session — check in with me before you skip a third.`;
  if (style === "same_day_direct_check_in") return `${clientFirstName} — noticed you missed today's session. What's going on? Let's get back on track.`;
  if (style === "same_day_explain_impact") return `${clientFirstName}, missing sessions this week will push your progress back — let's figure out what happened.`;
  return `Hey ${clientFirstName}! Haven't seen you log a session — everything okay? No judgment, just checking in.`;
}

/**
 * Builds this client's real, honest initial communication policy from the
 * active Coach Operating Model — every draft is a real, personalized
 * string (never a placeholder), and `requiresCoachApproval` on each
 * scheduled kind is derived from the coach's own communication AI
 * Authority resolution (see resolveCommunicationDisposition), not
 * hardcoded.
 */
export function buildInitialCommunicationPolicy(input: {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  clientFirstName: string;
  coachName: string;
  businessName: string;
  com: CoachOperatingModel;
  aiMayRespondDirectlyForRoutine: boolean;
  nowIso: string;
}): ClientCommunicationPolicy {
  const actions: ScheduledActionRecord[] = [
    {
      id: "welcome",
      kind: "welcome",
      cadenceDescription: "Once, immediately after activation.",
      draftText: buildWelcomeDraft(input.clientFirstName, input.coachName, input.businessName, input.com.communication.tone),
      requiresCoachApproval: !input.aiMayRespondDirectlyForRoutine,
    },
  ];

  if (input.com.communication.morningMessageEnabled) {
    actions.push({
      id: "morning_message",
      kind: "morning_message",
      cadenceDescription: "Every scheduled training day, in the morning (outside quiet hours).",
      draftText: `Good morning, ${input.clientFirstName}! Today's a training day — you've got this.`,
      requiresCoachApproval: !input.aiMayRespondDirectlyForRoutine,
    });
  }

  if (input.com.communication.workoutReminderEnabled) {
    actions.push({
      id: "workout_reminder",
      kind: "workout_reminder",
      cadenceDescription: "Before each scheduled workout, outside quiet hours.",
      draftText: `Reminder: today's session is on the calendar, ${input.clientFirstName}.`,
      requiresCoachApproval: !input.aiMayRespondDirectlyForRoutine,
    });
  }

  actions.push({
    id: "weekly_progress_prompt",
    kind: "weekly_progress_prompt",
    cadenceDescription: `${input.com.communication.checkInCadence.replace(/_/g, " ")}, per your check-in cadence.`,
    draftText: `Weekly check-in time, ${input.clientFirstName} — how did this week feel?`,
    requiresCoachApproval: true,
  });

  actions.push({
    id: "missed_workout_follow_up",
    kind: "missed_workout_follow_up",
    cadenceDescription: "The same day a scheduled workout is missed.",
    draftText: buildMissedWorkoutDraft(input.clientFirstName, input.com.communication.missedWorkoutFollowUp),
    requiresCoachApproval: true,
  });

  return {
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    timeZone: input.com.operationalContext.timeZone,
    quietHoursStart: input.com.communication.quietHoursStart,
    quietHoursEnd: input.com.communication.quietHoursEnd,
    scheduledActions: actions,
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}
