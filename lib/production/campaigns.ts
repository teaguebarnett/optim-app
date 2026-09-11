// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// Adaptive Campaign: one coach-authored message, sent to a selected group
// of that coach's own clients, with each recipient's copy tailored to their
// real goal / program phase / next step — previewed and explicitly approved
// by the coach before anything is published.
//
// Three product rules are enforced structurally here:
//
// 1. PUBLICATION NEVER CREATES A DM. Publishing writes campaign_recipients
//    rows only. It never inserts a conversation, never inserts a
//    conversation_message, and therefore can never leave a standing
//    coach-client DM thread behind. A client who wants to talk about the
//    message simply messages OPTIM in their normal default conversation
//    (lib/production/chat.ts), which escalates only if genuinely required.
//
// 2. THE COACH IS ALWAYS THE TRUTHFUL AUTHOR. campaigns.author_user_id is
//    pinned to the authenticated caller by RLS (campaigns_insert_staff's
//    `author_user_id = auth.uid()`), and nothing here ever attributes a
//    campaign to OPTIM.
//
// 3. RETRY NEVER DUPLICATES A SUCCESSFUL DELIVERY. Per-recipient delivery
//    state is real (pending/sent/failed) and retryPublish only ever touches
//    rows that are NOT already 'sent', so a partial failure is visible and
//    safely retryable.
//
// Personalization here is deliberately DETERMINISTIC template
// interpolation over each recipient's own real data — not a model call.
// A generative per-recipient rewrite is a real feature, but it would put
// unreviewed model text in front of many clients at once, and this phase's
// whole thesis is that only a coach-approved artifact reaches a client. The
// coach can still hand-edit any recipient's draft during preview, which is
// the actual "tailorable" requirement; the seam for a future generative
// draft is buildPersonalizedBody, nothing else. That function (and its
// RecipientContext type) lives in ../communications/campaign-personalization.ts
// — a framework-independent module with no "server-only"/Supabase/Next
// dependency, re-exported from here — so scripts/e2e-chat-intelligence.mts
// and lib/ai/verify-chat-intelligence.mts can exercise the exact same
// interpolation logic production uses without needing a Next.js request
// context to even import it.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";
import { getClientProgramContext } from "./programs.ts";
import { deriveProgramWeek } from "../scheduling/enrollment.ts";
import { resolveClientLocalDateIso } from "../shared/local-date.ts";
import { canPublishCampaign, isValidCampaignTransition } from "../communications/types.ts";
import type { CampaignDeliveryStatus, CampaignStatus } from "../communications/types.ts";
import { buildPersonalizedBody, type RecipientContext } from "../communications/campaign-personalization.ts";

export { buildPersonalizedBody, type RecipientContext };

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

export interface CampaignView {
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

export interface CampaignRecipientView {
  id: string;
  clientProfileId: string;
  clientDisplayName: string;
  personalizedBody: string | null;
  deliveryStatus: CampaignDeliveryStatus;
  sentAtIso: string | null;
}

interface CampaignRow {
  id: string;
  workspace_id: string;
  author_user_id: string;
  title: string;
  body_template: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
}

function rowToCampaign(row: CampaignRow): CampaignView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    authorUserId: row.author_user_id,
    title: row.title,
    bodyTemplate: row.body_template,
    status: row.status as CampaignStatus,
    approvedBy: row.approved_by,
    approvedAtIso: row.approved_at,
    publishedAtIso: row.published_at,
  };
}

const CAMPAIGN_SELECT = "id, workspace_id, author_user_id, title, body_template, status, approved_by, approved_at, published_at";

export async function createCampaignDraft(params: { workspaceId: string; title: string; bodyTemplate: string }): Promise<CampaignView> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ workspace_id: params.workspaceId, author_user_id: ctx.userId, title: params.title.trim(), body_template: params.bodyTemplate, status: "draft" })
    .select(CAMPAIGN_SELECT)
    .single();
  if (error) throw new Error(`createCampaignDraft failed: ${error.message}`);
  return rowToCampaign(data as CampaignRow);
}

async function getCampaign(workspaceId: string, campaignId: string): Promise<CampaignView> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_SELECT).eq("id", campaignId).eq("workspace_id", workspaceId).single();
  if (error) throw new Error(`getCampaign failed: ${error.message}`);
  return rowToCampaign(data as CampaignRow);
}

async function loadRecipientContext(workspaceId: string, clientProfileId: string, displayName: string, goal: string | null): Promise<RecipientContext> {
  const programContext = await getClientProgramContext({ workspaceId, clientProfileId });
  const timeZone = programContext.enrollment?.timeZone ?? "UTC";
  const todayIso = resolveClientLocalDateIso(new Date(), timeZone);
  const week = programContext.enrollment ? deriveProgramWeek(programContext.enrollment, todayIso) : null;
  return {
    displayName,
    goal,
    programName: programContext.assignedProgram?.name ?? null,
    programWeekLabel: week !== null && programContext.assignedProgram ? `week ${week} of ${programContext.assignedProgram.durationWeeks}` : null,
    nextStep: programContext.assignedProgram ? "your next scheduled session" : "getting your first program assigned",
  };
}

/** Builds one tailored draft per selected recipient and moves the campaign
 * to "preview" — the state the coach reviews. Nothing is delivered here:
 * every recipient row starts at delivery_status 'pending', which is exactly
 * what "requires coach preview/approval before publication" means in data.
 * Re-running it refreshes drafts for recipients that have not been sent. */
export async function prepareCampaignPreview(params: { workspaceId: string; campaignId: string; clientProfileIds: string[] }): Promise<CampaignRecipientView[]> {
  await requireCoachAuthority(params.workspaceId);
  const campaign = await getCampaign(params.workspaceId, params.campaignId);
  if (campaign.status === "published") throw new Error("A published campaign can no longer be edited.");
  const supabase = await getSupabaseServerClient();

  // Only clients this coach may actually manage. RLS on client_profiles
  // independently enforces the same thing, so a clientProfileId smuggled in
  // for another workspace's client simply returns no row and is skipped —
  // it can never become a recipient.
  const { data: clientRows, error: clientError } = await supabase
    .from("client_profiles")
    .select("id, display_name, goal")
    .eq("workspace_id", params.workspaceId)
    .in("id", params.clientProfileIds);
  if (clientError) throw new Error(`prepareCampaignPreview (clients) failed: ${clientError.message}`);

  for (const client of clientRows ?? []) {
    const context = await loadRecipientContext(params.workspaceId, client.id as string, client.display_name as string, (client.goal as string | null) ?? null);
    const personalizedBody = buildPersonalizedBody(campaign.bodyTemplate, context);
    const { error } = await supabase
      .from("campaign_recipients")
      .upsert(
        {
          campaign_id: params.campaignId,
          workspace_id: params.workspaceId,
          client_profile_id: client.id,
          personalized_body: personalizedBody,
          delivery_status: "pending",
        },
        { onConflict: "campaign_id,client_profile_id" }
      );
    if (error) throw new Error(`prepareCampaignPreview (recipient) failed: ${error.message}`);
  }

  if (campaign.status === "draft") {
    await transitionCampaign(params.workspaceId, params.campaignId, "draft", "preview", {});
  }
  return getCampaignRecipients(params.workspaceId, params.campaignId);
}

/** The coach hand-edits one recipient's tailored draft during preview —
 * the actual "each recipient's draft must be tailorable" affordance. */
export async function editRecipientDraft(params: { workspaceId: string; campaignId: string; recipientId: string; body: string }): Promise<void> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("campaign_recipients")
    .update({ personalized_body: params.body })
    .eq("id", params.recipientId)
    .eq("campaign_id", params.campaignId)
    .eq("workspace_id", params.workspaceId)
    .neq("delivery_status", "sent"); // an already-delivered message is immutable
  if (error) throw new Error(`editRecipientDraft failed: ${error.message}`);
}

async function transitionCampaign(workspaceId: string, campaignId: string, from: CampaignStatus, to: CampaignStatus, patch: Record<string, unknown>) {
  if (!isValidCampaignTransition(from, to)) throw new Error(`Invalid campaign transition: ${from} -> ${to}`);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: to, ...patch })
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId)
    .eq("status", from);
  if (error) throw new Error(`transitionCampaign failed: ${error.message}`);
}

/** Explicit coach approval. Separate from publish on purpose: the DB's own
 * campaigns_published_requires_approval CHECK makes an unapproved publish
 * impossible at the storage layer too. */
export async function approveCampaign(params: { workspaceId: string; campaignId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const campaign = await getCampaign(params.workspaceId, params.campaignId);
  await transitionCampaign(params.workspaceId, params.campaignId, campaign.status, "approved", {
    approved_by: ctx.userId,
    approved_at: new Date().toISOString(),
  });
}

export interface CampaignPublishResult {
  sent: number;
  failed: number;
  skippedAlreadySent: number;
}

/** Publishes to every not-yet-sent recipient. A recipient with no tailored
 * body is a real generation failure: it is marked 'failed' and left visible
 * for retry rather than silently delivered blank or silently dropped. */
export async function publishCampaign(params: { workspaceId: string; campaignId: string }): Promise<CampaignPublishResult> {
  await requireCoachAuthority(params.workspaceId);
  const campaign = await getCampaign(params.workspaceId, params.campaignId);
  if (!canPublishCampaign(campaign)) {
    throw new Error("Campaign must be explicitly approved by a coach before it can be published.");
  }
  const result = await deliverPendingRecipients(params.workspaceId, params.campaignId);
  await transitionCampaign(params.workspaceId, params.campaignId, "approved", "published", { published_at: new Date().toISOString() });
  return result;
}

/** Retries only the recipients that did not succeed. Rows already at 'sent'
 * are never touched, so a retry can never duplicate a delivery. */
export async function retryFailedCampaignDeliveries(params: { workspaceId: string; campaignId: string }): Promise<CampaignPublishResult> {
  await requireCoachAuthority(params.workspaceId);
  const campaign = await getCampaign(params.workspaceId, params.campaignId);
  if (campaign.status !== "published") throw new Error("Only a published campaign has deliveries to retry.");
  return deliverPendingRecipients(params.workspaceId, params.campaignId);
}

async function deliverPendingRecipients(workspaceId: string, campaignId: string): Promise<CampaignPublishResult> {
  const supabase = await getSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("campaign_recipients")
    .select("id, personalized_body, delivery_status")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`deliverPendingRecipients failed: ${error.message}`);

  let sent = 0;
  let failed = 0;
  let skippedAlreadySent = 0;
  const nowIso = new Date().toISOString();

  for (const row of rows ?? []) {
    if (row.delivery_status === "sent") {
      skippedAlreadySent += 1;
      continue;
    }
    const body = (row.personalized_body as string | null)?.trim();
    if (!body) {
      failed += 1;
      const { error: failError } = await supabase.from("campaign_recipients").update({ delivery_status: "failed" }).eq("id", row.id).neq("delivery_status", "sent");
      if (failError) throw new Error(`deliverPendingRecipients (mark failed) failed: ${failError.message}`);
      continue;
    }
    // Delivery in this phase means "the client can now read their own
    // tailored copy" (campaign_recipients_select already lets them read
    // exactly their own row, and nobody else's). No conversation and no
    // message row is written — see rule 1 in this file's module doc.
    const { error: sendError } = await supabase
      .from("campaign_recipients")
      .update({ delivery_status: "sent", sent_at: nowIso })
      .eq("id", row.id)
      .neq("delivery_status", "sent");
    if (sendError) throw new Error(`deliverPendingRecipients (mark sent) failed: ${sendError.message}`);
    sent += 1;
  }

  return { sent, failed, skippedAlreadySent };
}

export async function getCampaignRecipients(workspaceId: string, campaignId: string): Promise<CampaignRecipientView[]> {
  await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("id, client_profile_id, personalized_body, delivery_status, sent_at, client_profiles!inner(display_name)")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`getCampaignRecipients failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const profile = r.client_profiles as unknown as { display_name: string } | null;
    return {
      id: r.id as string,
      clientProfileId: r.client_profile_id as string,
      clientDisplayName: profile?.display_name ?? "Client",
      personalizedBody: (r.personalized_body as string | null) ?? null,
      deliveryStatus: r.delivery_status as CampaignDeliveryStatus,
      sentAtIso: (r.sent_at as string | null) ?? null,
    };
  });
}

export async function getWorkspaceCampaigns(workspaceId: string): Promise<CampaignView[]> {
  await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_SELECT).eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw new Error(`getWorkspaceCampaigns failed: ${error.message}`);
  return (data ?? []).map((r) => rowToCampaign(r as CampaignRow));
}

export interface ClientCampaignMessageView {
  id: string;
  title: string;
  body: string;
  coachDisplayName: string;
  sentAtIso: string | null;
}

/** What a CLIENT sees: only their own delivered copies. A client can never
 * read the campaigns table itself (no client-facing policy exists on it),
 * never another recipient's variant, and never an unpublished draft — the
 * `delivery_status = 'sent'` filter plus campaign_recipients_select's own
 * can_access_client predicate are two independent reasons for that. */
export async function getMyCampaignMessages(clientProfileId: string): Promise<ClientCampaignMessageView[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("id, personalized_body, sent_at, campaigns!inner(title, status, author_user_id, profiles:author_user_id(display_name))")
    .eq("client_profile_id", clientProfileId)
    .eq("delivery_status", "sent")
    .order("sent_at", { ascending: false });
  if (error) throw new Error(`getMyCampaignMessages failed: ${error.message}`);

  return (data ?? [])
    .map((r) => {
      const campaign = r.campaigns as unknown as { title: string; status: string; profiles: { display_name: string } | null } | null;
      if (!campaign || campaign.status !== "published") return null;
      return {
        id: r.id as string,
        title: campaign.title,
        body: (r.personalized_body as string | null) ?? "",
        coachDisplayName: campaign.profiles?.display_name ?? "Your coach",
        sentAtIso: (r.sent_at as string | null) ?? null,
      };
    })
    .filter((m): m is ClientCampaignMessageView => m !== null);
}
