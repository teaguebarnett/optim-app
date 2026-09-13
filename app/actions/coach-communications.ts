"use server";

// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The coach-callable surface over lib/production/chat.ts,
// lib/production/coach-notes.ts, lib/production/campaigns.ts and
// lib/production/playbooks.ts. Every underlying function re-checks staff
// authority in the target workspace itself (requireCoachAuthority), so a
// workspaceId arriving here as an argument is never trusted as proof of
// anything — it only says which workspace the caller is CLAIMING to act in,
// and the check either passes for that caller or throws.

import { revalidatePath } from "next/cache";
import {
  getWorkspaceEscalations,
  approveEscalationResponse,
  editAndSendEscalationResponse,
  openPersonalResponseThread,
  resolveCoachThread,
  resolveEscalationWithoutMessaging,
  getCoachThreadMessagesForEscalation,
  getClientChatHistoryForCoach,
  type EscalationView,
  type ConversationMessageView,
} from "../../lib/production/chat";
import { publishCoachNote, getClientCoachNotes, type CoachNoteView } from "../../lib/production/coach-notes";
import {
  createCampaignDraft,
  prepareCampaignPreview,
  editRecipientDraft,
  approveCampaign,
  publishCampaign,
  retryFailedCampaignDeliveries,
  getWorkspaceCampaigns,
  getCampaignRecipients,
  type CampaignView,
  type CampaignRecipientView,
  type CampaignPublishResult,
} from "../../lib/production/campaigns";
import { proposePlaybookExampleFromEscalation, getApprovedPlaybook, approvePlaybookVersion, listPlaybookVersions } from "../../lib/production/playbooks";
import { resolveClientWorkspaceId } from "../../lib/production/identity";
import { resolveOwnStaffWorkspace } from "../../lib/production/auth";
import { recordHealthReviewDecision, type HealthReviewDecisionInput } from "../../lib/production/pain-safety";

// Phase 6.0D-A: the unified coach dashboard (app/coach/page.tsx) now shows
// the same escalation/campaign data these actions mutate, so every mutation
// must revalidate it too — never just the standalone escalations/campaigns
// pages, or the dashboard would show stale state until an unrelated
// navigation happened to refetch it.
function revalidateCoachSurfaces(): void {
  revalidatePath("/coach");
  revalidatePath("/coach/escalations");
  revalidatePath("/coach/campaigns");
}

// ---------------------------------------------------------------------------
// Escalations — the Supabase-mode "Needs your attention" queue
// ---------------------------------------------------------------------------

export interface CoachEscalationInbox {
  workspaceId: string;
  coachDisplayName: string;
  open: EscalationView[];
  resolved: EscalationView[];
}

export async function getCoachEscalationInboxAction(): Promise<CoachEscalationInbox> {
  const { workspaceId, coachDisplayName } = await resolveOwnStaffWorkspace();
  const [open, resolved] = await Promise.all([
    getWorkspaceEscalations(workspaceId, ["pending", "proposed", "approved", "coach_responded"]),
    getWorkspaceEscalations(workspaceId, ["resolved"]),
  ]);
  return { workspaceId, coachDisplayName, open, resolved };
}

export async function approveEscalationResponseAction(params: { workspaceId: string; escalationId: string }): Promise<void> {
  await approveEscalationResponse(params);
  revalidateCoachSurfaces();
}

export async function editAndSendEscalationResponseAction(params: { workspaceId: string; escalationId: string; editedBody: string }): Promise<void> {
  await editAndSendEscalationResponse(params);
  revalidateCoachSurfaces();
}

export async function respondPersonallyAction(params: { workspaceId: string; escalationId: string; body: string }): Promise<{ conversationId: string }> {
  const result = await openPersonalResponseThread(params);
  revalidateCoachSurfaces();
  return result;
}

export async function resolveCoachThreadAction(params: { workspaceId: string; escalationId: string }): Promise<void> {
  await resolveCoachThread(params);
  revalidateCoachSurfaces();
}

export async function resolveEscalationWithoutMessagingAction(params: { workspaceId: string; escalationId: string }): Promise<void> {
  await resolveEscalationWithoutMessaging(params);
  revalidateCoachSurfaces();
}

/** Phase 7B — the one write path for a coach's real, explicit health-review
 * decision (see lib/production/pain-safety.ts's own doc for why this is
 * independent of the escalation's queue status). Revalidates the same
 * coach surfaces as every other escalation mutation here, plus the client's
 * own program-relevant reads aren't revalidated from this action — the
 * decision only takes effect for the CLIENT the next time a program is
 * generated, never retroactively rewriting a program already in progress. */
export async function recordHealthReviewDecisionAction(params: HealthReviewDecisionInput): Promise<void> {
  await recordHealthReviewDecision(params);
  revalidateCoachSurfaces();
}

/** Reads the temporary coach thread bound to one escalation, so the coach
 * side of the two-way conversation is visible in the same place they opened
 * it — "the active human thread must be clear on both sides." */
export async function getCoachThreadMessagesAction(params: { workspaceId: string; escalationId: string }): Promise<ConversationMessageView[]> {
  return getCoachThreadMessagesForEscalation(params);
}

export async function getClientChatHistoryForCoachAction(clientProfileId: string) {
  const workspaceId = await resolveClientWorkspaceId(clientProfileId);
  return getClientChatHistoryForCoach({ workspaceId, clientProfileId });
}

// ---------------------------------------------------------------------------
// Personal Coach Note — one-way, no thread
// ---------------------------------------------------------------------------

export async function publishCoachNoteAction(params: { clientProfileId: string; body: string }): Promise<void> {
  const workspaceId = await resolveClientWorkspaceId(params.clientProfileId);
  await publishCoachNote({ workspaceId, clientProfileId: params.clientProfileId, body: params.body });
  revalidateCoachSurfaces();
}

export async function getClientCoachNotesAction(clientProfileId: string): Promise<CoachNoteView[]> {
  return getClientCoachNotes(clientProfileId);
}

// ---------------------------------------------------------------------------
// Adaptive Campaign
// ---------------------------------------------------------------------------

export async function createCampaignDraftAction(params: { title: string; bodyTemplate: string }): Promise<CampaignView> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const campaign = await createCampaignDraft({ workspaceId, ...params });
  revalidateCoachSurfaces();
  return campaign;
}

export async function prepareCampaignPreviewAction(params: { campaignId: string; clientProfileIds: string[] }): Promise<CampaignRecipientView[]> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const recipients = await prepareCampaignPreview({ workspaceId, ...params });
  revalidateCoachSurfaces();
  return recipients;
}

export async function editRecipientDraftAction(params: { campaignId: string; recipientId: string; body: string }): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await editRecipientDraft({ workspaceId, ...params });
  revalidateCoachSurfaces();
}

export async function approveCampaignAction(campaignId: string): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await approveCampaign({ workspaceId, campaignId });
  revalidateCoachSurfaces();
}

export async function publishCampaignAction(campaignId: string): Promise<CampaignPublishResult> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const result = await publishCampaign({ workspaceId, campaignId });
  revalidateCoachSurfaces();
  return result;
}

export async function retryCampaignDeliveriesAction(campaignId: string): Promise<CampaignPublishResult> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const result = await retryFailedCampaignDeliveries({ workspaceId, campaignId });
  revalidateCoachSurfaces();
  return result;
}

export async function getCampaignsAction(): Promise<{ workspaceId: string; campaigns: CampaignView[] }> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  return { workspaceId, campaigns: await getWorkspaceCampaigns(workspaceId) };
}

export async function getCampaignRecipientsAction(campaignId: string): Promise<CampaignRecipientView[]> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  return getCampaignRecipients(workspaceId, campaignId);
}

// ---------------------------------------------------------------------------
// Coach Playbook — the coach-feedback learning loop
// ---------------------------------------------------------------------------

/** Turns one resolved coach decision into a PROPOSED Playbook example. This
 * only ever creates a new DRAFT version; the active approved Playbook is
 * never edited in place, so a single resolution can never silently change
 * the workspace's methodology. */
export async function proposePlaybookExampleAction(params: { escalationId: string; situation: string; resolution: string }): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await proposePlaybookExampleFromEscalation({ workspaceId, ...params });
  revalidateCoachSurfaces();
}

export async function getPlaybookVersionsAction() {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const [current, versions] = await Promise.all([getApprovedPlaybook(workspaceId), listPlaybookVersions(workspaceId)]);
  return { workspaceId, current, versions };
}

export async function approvePlaybookVersionAction(versionId: string): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await approvePlaybookVersion({ workspaceId, versionId });
  revalidateCoachSurfaces();
}
