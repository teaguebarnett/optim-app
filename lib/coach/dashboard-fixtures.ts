// Gate 2 — deterministic coach-dashboard fixtures. Used by
// lib/coach/verify-dashboard-zones.mts (state assertions) and by the
// development-only visual preview at /dev/coach-dashboard (which returns
// notFound() in production builds). Fictional people and messages only —
// never real client data. Every record mirrors a real persisted shape that
// lib/production/coach-dashboard.ts reads in Supabase mode.

import { ADJUSTMENT_PROPOSAL_PRIORITY, type AttentionItem } from "./attention-item.ts";
import type { CoachDashboardInput, DashboardRosterClient } from "./dashboard-zones.ts";
import type { EscalationReason, EscalationStatus } from "../communications/types";

export const FIXTURE_NOW_ISO = "2026-09-30T12:00:00.000Z";

const REASON_PRIORITY: Record<EscalationReason, number> = {
  pain_or_safety: 0,
  adherence_or_sensitive: 0.5,
  out_of_authority: 0.75,
  plan_change: 1,
  conflicting_information: 1.5,
  explicit_request: 1.75,
  unresolved_uncertainty: 2,
};

const REASON_LABEL: Record<EscalationReason, string> = {
  pain_or_safety: "Pain / safety",
  plan_change: "Plan change",
  out_of_authority: "Outside OPTIM's authority",
  unresolved_uncertainty: "Unresolved uncertainty",
  conflicting_information: "Conflicting information",
  adherence_or_sensitive: "Adherence / sensitive",
  explicit_request: "Client asked for you",
};

export function rosterClient(partial: Partial<DashboardRosterClient> & { clientId: string; name: string }): DashboardRosterClient {
  return {
    lifecycle: "active",
    archived: false,
    invitedAtIso: "2026-09-20T15:00:00.000Z",
    onboardingUpdatedAtIso: null,
    setup: { hasProgram: false, hasNutrition: false, hasStartDate: false, hasConfirmedTimezone: false },
    programPhase: null,
    programStartDateIso: null,
    ...partial,
  };
}

export function escalation(p: {
  id: string;
  clientId: string;
  clientDisplayName: string;
  reason: EscalationReason;
  status?: EscalationStatus;
  sourceMessageBody: string | null;
  proposedResponse: string | null;
  createdAtIso?: string;
  priority?: number;
}): AttentionItem {
  const status = p.status ?? "proposed";
  return {
    id: p.id,
    clientId: p.clientId,
    clientDisplayName: p.clientDisplayName,
    kindLabel: REASON_LABEL[p.reason],
    summary: p.sourceMessageBody ?? p.proposedResponse ?? REASON_LABEL[p.reason],
    sourceMessageBody: p.sourceMessageBody,
    proposedResponse: p.proposedResponse,
    status: status === "coach_responded" ? "coach_responded" : status === "approved" ? "awaiting_coach" : "open",
    priority: p.priority ?? REASON_PRIORITY[p.reason],
    createdAtIso: p.createdAtIso ?? "2026-09-30T08:15:00.000Z",
    hasOpenCoachThread: status === "coach_responded",
    escalationReason: p.reason,
    escalationStatus: status,
    healthReviewStatus: p.reason === "pain_or_safety" ? "review_needed" : null,
    documentedLimitations: null,
  };
}

function adjustment(p: { versionId: string; clientId: string; clientDisplayName: string; label: string; rationale: string; createdAtIso: string }): AttentionItem {
  return {
    id: `adjustment:${p.versionId}`,
    clientId: p.clientId,
    clientDisplayName: p.clientDisplayName,
    kindLabel: p.label,
    summary: p.rationale,
    sourceMessageBody: null,
    proposedResponse: null,
    status: "open",
    priority: ADJUSTMENT_PROPOSAL_PRIORITY,
    createdAtIso: p.createdAtIso,
    hasOpenCoachThread: false,
    adjustmentProposal: { clientProfileId: p.clientId, versionId: p.versionId },
  };
}

export function fixtureInput(partial: Partial<CoachDashboardInput> = {}): CoachDashboardInput {
  return {
    nowIso: FIXTURE_NOW_ISO,
    openAttention: [],
    coachThreads: {},
    roster: [],
    programDrafts: [],
    optimAnswers: [],
    resolvedEscalations: [],
    patternCandidates: [],
    methodConfirmed: true,
    ...partial,
  };
}

// --- Shared fictional people ------------------------------------------------

const MARCUS = rosterClient({ clientId: "c-marcus", name: "Marcus Bell", lifecycle: "active", programPhase: "active_program", setup: { hasProgram: true, hasNutrition: true, hasStartDate: true, hasConfirmedTimezone: true } });
const PRIYA_SETUP = rosterClient({ clientId: "c-priya", name: "Priya Shah", lifecycle: "coach_setup", onboardingUpdatedAtIso: "2026-09-29T18:30:00.000Z" });
const JO = rosterClient({ clientId: "c-jo", name: "Jo Park", lifecycle: "active", programPhase: "active_program", setup: { hasProgram: true, hasNutrition: true, hasStartDate: true, hasConfirmedTimezone: true } });
const ELENA = rosterClient({ clientId: "c-elena", name: "Elena Ruiz", lifecycle: "active", programPhase: "pre_program", programStartDateIso: "2026-10-05", setup: { hasProgram: true, hasNutrition: true, hasStartDate: true, hasConfirmedTimezone: true } });
const SAM_INVITED = rosterClient({ clientId: "c-sam", name: "Sam Okafor", lifecycle: "invited", invitedAtIso: "2026-09-27T16:00:00.000Z" });
const NOOR_ONBOARDING = rosterClient({ clientId: "c-noor", name: "Noor Haddad", lifecycle: "onboarding", invitedAtIso: "2026-09-25T10:00:00.000Z", onboardingUpdatedAtIso: "2026-09-29T21:00:00.000Z" });
const DANA = rosterClient({ clientId: "c-dana", name: "Dana Cole", lifecycle: "active", programPhase: "active_program", setup: { hasProgram: true, hasNutrition: true, hasStartDate: true, hasConfirmedTimezone: true } });

const PLAN_CHANGE = escalation({
  id: "esc-plan",
  clientId: "c-marcus",
  clientDisplayName: "Marcus Bell",
  reason: "plan_change",
  sourceMessageBody: "Can I swap Thursday's session for a long run? My race got moved up.",
  proposedResponse: "Good question — swapping sessions changes your week's structure, so I've passed this to your coach to decide. Keep Thursday as planned for now.",
  createdAtIso: "2026-09-30T07:40:00.000Z",
});

const PAIN = escalation({
  id: "esc-pain",
  clientId: "c-jo",
  clientDisplayName: "Jo Park",
  reason: "pain_or_safety",
  sourceMessageBody: "My lower back tightened up on the second set of deadlifts and it still aches this morning.",
  proposedResponse: "Thanks for telling me. Please skip deadlifts until your coach has looked at this — I've flagged it for them.",
  createdAtIso: "2026-09-30T09:05:00.000Z",
});

const MARCUS_ADJUSTMENT = adjustment({
  versionId: "v-adj-marcus",
  clientId: "c-marcus",
  clientDisplayName: "Marcus Bell",
  label: "Schedule adjustment",
  rationale: "Two missed Thursday sessions in a row — moving lower-body work to Saturday.",
  createdAtIso: "2026-09-29T20:10:00.000Z",
});

const PRIYA_DRAFT = { versionId: "v-priya-1", clientId: "c-priya", title: "Strength Foundations", durationWeeks: 8, createdAtIso: "2026-09-30T06:30:00.000Z", verifiedInputs: true };

const ANSWERS = [
  { messageId: "m1", clientId: "c-priya", answeredAtIso: "2026-09-29T19:20:00.000Z", question: "Is it fine to have my protein shake after dinner instead of after training?" },
  { messageId: "m2", clientId: "c-priya", answeredAtIso: "2026-09-27T08:00:00.000Z", question: "What does RPE 7 mean again?" },
];

const RESOLVED = [
  { id: "esc-old", clientId: "c-marcus", reason: "plan_change" as const, coachAction: "approved" as const, resolvedAtIso: "2026-09-29T11:00:00.000Z", sourceMessageBody: "Can I move Monday's session to Tuesday this week?" },
];

export interface DashboardFixture {
  label: string;
  input: CoachDashboardInput;
}

export const DASHBOARD_FIXTURES = {
  quiet: { label: "Quiet — nothing needs the coach", input: fixtureInput() },
  quietWithClients: { label: "Quiet — active clients on track", input: fixtureInput({ roster: [MARCUS, DANA] }) },
  invitedAndSetup: { label: "Invited, onboarding, and setup clients", input: fixtureInput({ roster: [SAM_INVITED, NOOR_ONBOARDING, PRIYA_SETUP] }) },
  firstProgram: { label: "First program awaiting approval", input: fixtureInput({ roster: [PRIYA_SETUP], programDrafts: [PRIYA_DRAFT] }) },
  escalation: { label: "Escalation needs the coach", input: fixtureInput({ roster: [MARCUS], openAttention: [PLAN_CHANGE] }) },
  waitingOnClient: {
    label: "Escalation waiting on the client",
    input: fixtureInput({
      roster: [MARCUS],
      openAttention: [escalation({ id: "esc-thread", clientId: "c-marcus", clientDisplayName: "Marcus Bell", reason: "plan_change", status: "coach_responded", sourceMessageBody: "Can I train Saturday instead of Friday?", proposedResponse: null, createdAtIso: "2026-09-29T09:00:00.000Z" })],
      coachThreads: { "esc-thread": { lastActor: "coach", lastMessageAtIso: "2026-09-30T08:00:00.000Z", lastClientMessage: null } },
    }),
  },
  adjustment: { label: "Pending adjustment proposal", input: fixtureInput({ roster: [MARCUS], openAttention: [MARCUS_ADJUSTMENT] }) },
  handled: { label: "OPTIM answered questions and a resolved escalation", input: fixtureInput({ roster: [MARCUS, rosterClient({ ...PRIYA_SETUP, lifecycle: "active", programPhase: "active_program", setup: { hasProgram: true, hasNutrition: true, hasStartDate: true, hasConfirmedTimezone: true } })], optimAnswers: ANSWERS, resolvedEscalations: RESOLVED }) },
  mixed: {
    label: "Mixed — safety report, decisions, context, and handled work",
    input: fixtureInput({
      roster: [JO, MARCUS, PRIYA_SETUP, ELENA, SAM_INVITED, DANA],
      openAttention: [PAIN, PLAN_CHANGE, MARCUS_ADJUSTMENT, escalation({ id: "esc-dana", clientId: "c-dana", clientDisplayName: "Dana Cole", reason: "explicit_request", status: "coach_responded", sourceMessageBody: "Can we talk about my nutrition targets?", proposedResponse: null, createdAtIso: "2026-09-28T10:00:00.000Z" })],
      coachThreads: { "esc-dana": { lastActor: "coach", lastMessageAtIso: "2026-09-29T17:45:00.000Z", lastClientMessage: null } },
      programDrafts: [PRIYA_DRAFT],
      optimAnswers: ANSWERS,
      resolvedEscalations: RESOLVED,
    }),
  },
  uncalibrated: { label: "Coaching method not yet confirmed", input: fixtureInput({ methodConfirmed: false }) },
} satisfies Record<string, DashboardFixture>;

export type DashboardFixtureId = keyof typeof DASHBOARD_FIXTURES;
