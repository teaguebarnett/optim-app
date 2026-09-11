// Phase 6.0A — Production Foundation.
//
// Typed contracts for the "Newly approved communication model." Mirrors
// supabase/migrations/20260909000005_communications.sql's enums exactly —
// any drift between this file and that migration is a bug. Contracts and
// state-machine validity checks ONLY: no chat intelligence, no
// escalation-trigger logic, no campaign personalization. Those are Phase
// 6.0C (or later); this file only defines what a valid state/transition
// IS, so the persistence layer and (eventually) the real logic built on
// top of it can't represent an invalid one.

export type ConversationKind = "optim_default" | "coach_escalation";
export type ConversationStatus = "open" | "resolved";

export interface Conversation {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  kind: ConversationKind;
  status: ConversationStatus;
  escalationId: string | null;
  openedAtIso: string;
  resolvedAtIso: string | null;
  resolvedBy: string | null;
}

/** Immutable, always-attributable authorship. "Never infer coach approval
 * from message text" is enforced by construction: a MessageActorType of
 * "coach" can only ever be produced by code that has independently proven
 * coach/admin authority over the client (see the RLS policies in
 * 20260909000008_rls_policies.sql's conversation_messages_insert_coach) —
 * nothing in this type itself, or in any message body string, is ever
 * trusted as proof of who actually sent it. */
export type MessageActorType = "client" | "assistant" | "coach" | "system";

export interface ConversationMessage {
  id: string;
  conversationId: string;
  workspaceId: string;
  actorType: MessageActorType;
  /** Present for "client"/"coach", null for "assistant"/"system" — matches
   * conversation_messages_actor_user_required's CHECK constraint exactly. */
  actorUserId: string | null;
  body: string;
  createdAtIso: string;
}

export function actorRequiresUserId(actorType: MessageActorType): boolean {
  return actorType === "client" || actorType === "coach";
}

/** The seven approved escalation triggers from the communication model.
 * Routine interactions (greetings, definitions, substitutions within
 * bounds, schedule questions, logging help, motivation, contextual
 * coaching) never produce one of these — there is deliberately no
 * "routine" member here, because a routine interaction never reaches this
 * type at all. */
export type EscalationReason =
  | "pain_or_safety"
  | "plan_change"
  | "out_of_authority"
  | "unresolved_uncertainty"
  | "conflicting_information"
  | "adherence_or_sensitive"
  | "explicit_request";

export type EscalationStatus = "pending" | "proposed" | "approved" | "coach_responded" | "resolved";
export type EscalationCoachAction = "approved" | "edited" | "personal_response";

export interface Escalation {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  sourceMessageId: string | null;
  reasonCategory: EscalationReason;
  status: EscalationStatus;
  proposedResponse: string | null;
  coachAction: EscalationCoachAction | null;
  resolvedBy: string | null;
  resolvedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

/** unopened -> open -> resolved, but expressed against Escalation's own
 * status vocabulary: "pending"/"proposed" is unopened-equivalent (no coach
 * thread exists yet), "approved"/"coach_responded" is open, "resolved" is
 * resolved. Kept as a derived function rather than a fifth stored column so
 * there is exactly one place this mapping can drift. */
export type CoachThreadLifecycle = "unopened" | "open" | "resolved";

export function coachThreadLifecycle(status: EscalationStatus): CoachThreadLifecycle {
  switch (status) {
    case "pending":
    case "proposed":
      return "unopened";
    case "approved":
    case "coach_responded":
      return "open";
    case "resolved":
      return "resolved";
  }
}

const VALID_ESCALATION_TRANSITIONS: Record<EscalationStatus, EscalationStatus[]> = {
  pending: ["proposed"],
  proposed: ["approved", "resolved"],
  approved: ["coach_responded", "resolved"],
  coach_responded: ["resolved"],
  resolved: [],
};

export function isValidEscalationTransition(from: EscalationStatus, to: EscalationStatus): boolean {
  return VALID_ESCALATION_TRANSITIONS[from].includes(to);
}

/** "An assistant message may say something was sent to Teague only after a
 * real persisted escalation/review record is successfully created." This
 * function is that rule made unbypassable in code: it takes the actual
 * Escalation record (or null) and returns null (meaning: do not claim
 * anything was sent) unless the escalation genuinely reached at least
 * "proposed" — a caller literally cannot construct a "sent to Teague"
 * message from a boolean flag or a hopeful guess, only from a real row. */
export function describeEscalationForAssistantMessage(
  escalation: Escalation | null,
  /** Phase 6.0C: the real assigned coach's display name, resolved
   * server-side from the authenticated coach/client relationship — never a
   * hardcoded "Teague" (this product has more than one coach; see
   * lib/tenancy/seed.ts's Teague/Alex isolation fixture and
   * lib/chat/assistant.ts's own interpolateCoachName rule). Defaults to the
   * generic phrasing rather than a wrong name when a caller genuinely has
   * no coach assigned. */
  coachDisplayName?: string
): string | null {
  if (!escalation) return null;
  if (escalation.status === "pending") return null;
  const who = coachDisplayName?.trim() ? coachDisplayName.trim() : "your coach";
  return `I've flagged this for ${who} to take a look.`;
}

/** Personal Coach Note — one-way, no thread. */
export interface CoachNote {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  authorUserId: string;
  body: string;
  publishedAtIso: string;
}

export type CampaignStatus = "draft" | "preview" | "approved" | "published";
export type CampaignDeliveryStatus = "pending" | "sent" | "failed";

export interface Campaign {
  id: string;
  workspaceId: string;
  authorUserId: string;
  title: string;
  bodyTemplate: string;
  status: CampaignStatus;
  approvedBy: string | null;
  approvedAtIso: string | null;
  publishedAtIso: string | null;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  workspaceId: string;
  clientProfileId: string;
  personalizedBody: string | null;
  deliveryStatus: CampaignDeliveryStatus;
  sentAtIso: string | null;
}

const VALID_CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["preview"],
  preview: ["draft", "approved"],
  approved: ["published"],
  published: [],
};

export function isValidCampaignTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return VALID_CAMPAIGN_TRANSITIONS[from].includes(to);
}

/** "Requires coach preview/approval before publication" — mirrors the DB's
 * campaigns_published_requires_approval CHECK constraint so an invalid
 * campaign can be rejected at the application layer before ever reaching
 * the database. */
export function canPublishCampaign(campaign: Pick<Campaign, "status" | "approvedBy" | "approvedAtIso">): boolean {
  return campaign.status === "approved" && campaign.approvedBy !== null && campaign.approvedAtIso !== null;
}
