// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The Supabase-mode coach outbound-communication surface: Personal Coach
// Notes (one-way, no thread) and Adaptive Campaigns (tailored per
// recipient, coach-previewed and explicitly approved before publication).
// Deliberately minimal and focused — Part 7 forbids a broad messaging
// redesign in this phase — and 404s in demo mode rather than existing as a
// dead surface, matching Phase 6.0B's assign-live precedent.
//
// The distinction this page exists to preserve, in the UI as well as the
// data: neither a Note nor a Campaign ever opens a coach DM thread. Only a
// real escalation the coach chooses to answer personally does that (see
// app/coach/escalations/page.tsx).

import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  publishCoachNoteAction,
} from "@/app/actions/coach-communications";

const DEFAULT_TEMPLATE =
  "Hey {{name}} — checking in on {{goal}}. You're in {{week}} of {{program}}; {{next}} is the one that matters this week.";

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

  async function sendNote(formData: FormData) {
    "use server";
    const clientProfileId = String(formData.get("clientProfileId") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    if (!clientProfileId || !body) return;
    await publishCoachNoteAction({ clientProfileId, body });
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <Link href="/coach" className="text-sm text-off-white/60 hover:text-off-white">
        ← Coach
      </Link>
      <h1 className="text-xl font-semibold text-off-white">Outbound communication</h1>

      <Card>
        <h2 className="mb-1 text-sm font-medium text-off-white">Personal Coach Note</h2>
        <p className="mb-3 text-xs text-off-white/60">
          One-way and clearly from you. It does not open a thread — if they reply, it goes to OPTIM like any other message and only reaches you if
          it genuinely needs to.
        </p>
        <form action={sendNote} className="flex flex-col gap-2">
          <select name="clientProfileId" className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white" required>
            <option value="">Select a client…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id} className="text-black">
                {client.displayName}
              </option>
            ))}
          </select>
          <textarea name="body" rows={2} placeholder="Your note…" className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white" />
          <Button type="submit" variant="secondary" size="sm">
            Send note
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-medium text-off-white">New Adaptive Campaign</h2>
        <p className="mb-3 text-xs text-off-white/60">
          Tokens available: <code>{"{{name}} {{goal}} {{program}} {{week}} {{next}}"}</code>. Each recipient&apos;s copy is built from their own real
          data, and you can edit any one of them before publishing.
        </p>
        <form action={createDraft} className="flex flex-col gap-2">
          <input type="text" name="title" placeholder="Campaign title" className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white" required />
          <textarea
            name="bodyTemplate"
            rows={3}
            defaultValue={DEFAULT_TEMPLATE}
            className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white"
          />
          <Button type="submit" variant="primary" size="sm">
            Create draft
          </Button>
        </form>
      </Card>

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
              <h2 className="text-sm font-medium text-off-white">{campaign.title}</h2>
              <span className="ml-auto text-[11px] uppercase tracking-wide text-off-white/50">{campaign.status}</span>
            </div>
            <p className="mb-3 whitespace-pre-wrap text-xs text-off-white/60">{campaign.bodyTemplate}</p>

            {campaign.status !== "published" && (
              <form action={prepare} className="mb-3 flex flex-col gap-2">
                <p className="text-[11px] uppercase tracking-wide text-off-white/50">Recipients</p>
                {clients.map((client) => (
                  <label key={client.id} className="flex items-center gap-2 text-sm text-off-white/80">
                    <input type="checkbox" name="clientProfileIds" value={client.id} />
                    {client.displayName}
                  </label>
                ))}
                <Button type="submit" variant="secondary" size="sm">
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
                    <div key={recipient.id} className="rounded border border-border-strong p-2">
                      <p className="text-[11px] uppercase tracking-wide text-off-white/50">
                        {recipient.clientDisplayName} · {recipient.deliveryStatus}
                        {recipient.sentAtIso ? ` · ${new Date(recipient.sentAtIso).toLocaleString()}` : ""}
                      </p>
                      {recipient.deliveryStatus === "sent" ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-off-white/80">{recipient.personalizedBody}</p>
                      ) : (
                        <form action={editDraft} className="mt-1 flex flex-col gap-1">
                          <textarea
                            name="body"
                            rows={2}
                            defaultValue={recipient.personalizedBody ?? ""}
                            className="rounded border border-border-strong bg-transparent px-2 py-1 text-sm text-off-white"
                          />
                          <Button type="submit" variant="secondary" size="sm">
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
    </main>
  );
}
