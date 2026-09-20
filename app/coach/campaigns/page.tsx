// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
// Phase 6.0D-A — restyled onto the established design tokens and reached
// through the real coach nav (see components/coach/coach-shell.tsx) and a
// summary card on /coach, instead of a standalone, hidden URL-only proof
// page — see app/coach/page.tsx's own doc. Functionality unchanged: Part 7
// forbids a broad messaging redesign in this phase.
//
// Gate 5C — the "Personal Coach Note" form that used to live on this page
// was removed: sending a note is a per-client action (who, exactly, are you
// noting?) and belongs where the coach already has that client in context —
// components/coach/live-client-workspace.tsx's "Personal coach notes"
// section, which calls the exact same publishCoachNoteAction this page
// used. Two entry points for one action (a generic dropdown here, a
// contextual one there) was the "collapsed distinct jobs" problem this
// phase's brief called out — not the coach-DM-thread problem this file's
// own doc already guarded against. This page is now Adaptive Campaigns
// only, and reuses the existing Supabase draft/preview/approve/publish/
// retry pipeline unchanged (lib/production/campaigns.ts) — no rebuild.
//
// The distinction this page exists to preserve, in the UI as well as the
// data: neither a Note nor a Campaign ever opens a coach DM thread. Only a
// real escalation the coach chooses to answer personally does that (see
// app/coach/escalations/page.tsx).

import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/coach/section-header";
import { resolveAppMode } from "@/lib/production/mode";
import { getFoundationRepository } from "@/lib/production/repository";
import {
  getCampaignsAction,
  getCampaignRecipientsAction,
  createCampaignDraftAction,
  prepareCampaignPreviewAction,
  editRecipientDraftAction,
  approveCampaignAction,
  publishCampaignAction,
  retryCampaignDeliveriesAction,
} from "@/app/actions/coach-communications";

const DEFAULT_TEMPLATE =
  "Hey {{name}} — checking in on {{goal}}. You're in {{week}} of {{program}}; {{next}} is the one that matters this week.";

const fieldClass =
  "rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-body text-off-white outline-none focus-visible:border-accent";

export default async function CoachCampaignsPage() {
  if (resolveAppMode() !== "supabase") notFound();

  const { workspaceId, campaigns } = await getCampaignsAction();
  const clients = await getFoundationRepository().listClientsForWorkspace(workspaceId);
  const recipientsByCampaign = await Promise.all(
    campaigns.map(async (c) => ({ campaignId: c.id, recipients: await getCampaignRecipientsAction(c.id) }))
  );
  const recipientsFor = (id: string) => recipientsByCampaign.find((r) => r.campaignId === id)?.recipients ?? [];

  async function createDraft(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const bodyTemplate = String(formData.get("bodyTemplate") ?? "").trim();
    if (!title || !bodyTemplate) return;
    await createCampaignDraftAction({ title, bodyTemplate });
  }

  return (
    <div className="mx-auto w-full max-w-[800px] space-y-6">
      <div>
        <h1 className="text-heading text-off-white">Campaigns</h1>
        <p className="mt-1 text-body text-neutral">
          Coach-authored outbound communication to a group of clients at once — always attributed to you, never to OPTIM. Looking to send one
          client a personal note instead? Do that from their own client page.
        </p>
      </div>

      <Card>
        <SectionHeader title="New Adaptive Campaign" />
        <p className="mb-3 text-meta text-neutral">
          Tokens available: <code>{"{{name}} {{goal}} {{program}} {{week}} {{next}}"}</code>. Each recipient&apos;s copy is built from their own real
          data, and you can edit any one of them before publishing.
        </p>
        <form action={createDraft} className="flex flex-col gap-2">
          <input type="text" name="title" placeholder="Campaign title" className={fieldClass} required />
          <textarea name="bodyTemplate" rows={3} defaultValue={DEFAULT_TEMPLATE} className={fieldClass} />
          <Button type="submit" variant="primary" size="sm" className="self-start">
            Create draft
          </Button>
        </form>
      </Card>

      {campaigns.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="Your campaigns" />
          {campaigns.map((campaign) => {
            const recipients = recipientsFor(campaign.id);
            const failed = recipients.filter((r) => r.deliveryStatus === "failed").length;

            async function prepare(formData: FormData) {
              "use server";
              const clientProfileIds = formData.getAll("clientProfileIds").map(String).filter(Boolean);
              if (clientProfileIds.length === 0) return;
              await prepareCampaignPreviewAction({ campaignId: campaign.id, clientProfileIds });
            }
            async function approve() {
              "use server";
              await approveCampaignAction(campaign.id);
            }
            async function publish() {
              "use server";
              await publishCampaignAction(campaign.id);
            }
            async function retry() {
              "use server";
              await retryCampaignDeliveriesAction(campaign.id);
            }

            return (
              <Card key={campaign.id}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-subheading text-off-white">{campaign.title}</h2>
                  <span className="ml-auto text-label text-neutral">{campaign.status}</span>
                </div>
                <p className="mb-3 whitespace-pre-wrap text-meta text-neutral">{campaign.bodyTemplate}</p>

                {campaign.status !== "published" && (
                  <form action={prepare} className="mb-3 flex flex-col gap-2">
                    <p className="text-label text-neutral">Recipients</p>
                    {clients.map((client) => (
                      <label key={client.id} className="flex items-center gap-2 text-body text-off-white">
                        <input type="checkbox" name="clientProfileIds" value={client.id} />
                        {client.displayName}
                      </label>
                    ))}
                    <Button type="submit" variant="secondary" size="sm" className="self-start">
                      Build tailored previews
                    </Button>
                  </form>
                )}

                {recipients.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {recipients.map((recipient) => {
                      async function editDraft(formData: FormData) {
                        "use server";
                        const body = String(formData.get("body") ?? "").trim();
                        if (!body) return;
                        await editRecipientDraftAction({ campaignId: campaign.id, recipientId: recipient.id, body });
                      }
                      return (
                        <div key={recipient.id} className="rounded-[var(--radius-md)] border border-border-strong p-3">
                          <p className="text-label text-neutral">
                            {recipient.clientDisplayName} · {recipient.deliveryStatus}
                            {recipient.sentAtIso ? ` · ${new Date(recipient.sentAtIso).toLocaleString()}` : ""}
                          </p>
                          {recipient.deliveryStatus === "sent" ? (
                            <p className="mt-1 whitespace-pre-wrap text-body text-neutral">{recipient.personalizedBody}</p>
                          ) : (
                            <form action={editDraft} className="mt-1 flex flex-col gap-1">
                              <textarea name="body" rows={2} defaultValue={recipient.personalizedBody ?? ""} className={fieldClass} />
                              <Button type="submit" variant="secondary" size="sm" className="self-start">
                                Save this recipient&apos;s copy
                              </Button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {campaign.status === "preview" && (
                    <form action={approve}>
                      <Button type="submit" variant="secondary" size="sm">
                        Approve
                      </Button>
                    </form>
                  )}
                  {campaign.status === "approved" && (
                    <form action={publish}>
                      <Button type="submit" variant="primary" size="sm">
                        Publish to {recipients.length} client{recipients.length === 1 ? "" : "s"}
                      </Button>
                    </form>
                  )}
                  {campaign.status === "published" && failed > 0 && (
                    <form action={retry}>
                      <Button type="submit" variant="secondary" size="sm">
                        Retry {failed} failed deliver{failed === 1 ? "y" : "ies"}
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
