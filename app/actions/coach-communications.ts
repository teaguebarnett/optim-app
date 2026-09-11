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
import { publishCoachNote } from "../../lib/production/coach-notes";
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
import { getAuthenticatedContext } from "../../lib/production/auth";

function revalidateCoachSurfaces(): void {
  revalidatePath("/coach/escalations");
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

/** Resolves the caller's own staff workspace server-side. A coach who
 * somehow holds staff membership in more than one workspace gets the first
 * one deterministically; this surface is scoped to one workspace at a time
 * by design, matching every other coach surface in the app. */
async function resolveOwnStaffWorkspace(): Promise<{ workspaceId: string; coachDisplayName: string }> {
  const ctx = await getAuthenticatedContext();
  const staff = ctx.memberships.find((m) => m.role === "coach" || m.role === "workspace_owner" || m.role === "platform_admin");
  if (!staff) throw new Error("The current session holds no coach/owner membership in any workspace.");
  return { workspaceId: staff.workspaceId, coachDisplayName: ctx.profile.displayName };
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
