// Phase 6.0D-A — Unified Production Coach Operations Surface.
//
// The one entry point for both coach experiences — a Server Component that
// resolves resolveAppMode() (server-only, never client-inferable — see
// lib/production/mode.ts's own doc) and renders either the demo dashboard
// (unchanged since before this phase) or the real Supabase-mode dashboard
// below, exactly mirroring Phase 6.0C's app/(client)/chat/page.tsx split.
//
// Phase 6.0C's escalations/campaigns pages were intentionally minimal
// standalone proof surfaces ("There must not be a separate 'real backend
// proof page' competing with the actual coach dashboard" — this phase's own
// brief). This page is what makes /coach the real operational home in
// Supabase mode too: real escalations render here, inline, with the same
// respond/resolve actions the full /coach/escalations list offers, using
// the shared EscalationCard component and CoachOperationsRepository so
// there is exactly one presentation and one data source, never two.

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/coach/section-header";
import { EmptyState } from "@/components/coach/empty-state";
import { EscalationCard, type EscalationHealthReview } from "@/components/coach/escalation-card";
import { AdjustmentAttentionCard } from "@/components/coach/adjustment-attention-card";
import { DemoCoachDashboard } from "@/components/coach/demo-coach-dashboard";
import { PatternCandidateSection } from "@/components/coach/pattern-candidate-section";
import { LearnedRulesList } from "@/components/coach/learned-rules-list";
import { resolveAppMode } from "@/lib/production/mode";
import { getCoachOperationsRepository } from "@/lib/production/coach-operations";
import { getOnboardingProgressForClient } from "@/lib/production/onboarding";
import {
  getCoachThreadMessagesAction,
  approveEscalationResponseAction,
  editAndSendEscalationResponseAction,
  respondPersonallyAction,
  resolveCoachThreadAction,
  resolveEscalationWithoutMessagingAction,
  proposePlaybookExampleAction,
  recordHealthReviewDecisionAction,
  getCampaignsAction,
} from "@/app/actions/coach-communications";
import { getEligibleCandidatesForReviewAction, getMyLearnedRulesAction } from "@/app/actions/coach-learned-rules";
import type { AttentionItem } from "@/lib/production/coach-operations";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

export default function CoachOverviewPage() {
  if (resolveAppMode() !== "supabase") return <DemoCoachDashboard />;
  return <LiveCoachDashboard />;
}

async function LiveCoachDashboard() {
  const inbox = await getCoachOperationsRepository().getAttentionInbox();
  const { workspaceId } = inbox;

  // Only the top-priority open item needs its temporary-thread messages
  // fetched inline (the focus card is the only one rendered expanded) — the
  // remaining open items render compactly below, matching the demo
  // dashboard's own focus-item + compact-rows pattern.
  const focus = inbox.open[0] ?? null;
  const rest = inbox.open.slice(1);
  const focusThreadMessages = focus?.hasOpenCoachThread ? await getCoachThreadMessagesAction({ workspaceId, escalationId: focus.id }) : [];

  // Phase 7B — pain_or_safety always sorts first (ESCALATION_PRIORITY,
  // lib/production/chat.ts), so whenever one is open it IS the focus item;
  // this never needs to look inside `rest`.
  async function healthReviewFor(item: AttentionItem): Promise<EscalationHealthReview | undefined> {
    if (item.escalationReason !== "pain_or_safety") return undefined;
    const onboarding = await getOnboardingProgressForClient(item.clientId);
    const clientReportedDetail = typeof onboarding?.answers.health_finish?.injuryRestrictions === "string" ? (onboarding.answers.health_finish.injuryRestrictions as string) : null;
    const escalationId = item.id;
    const record: HealthReviewRecord = {
      clientId: item.clientId,
      workspaceId,
      status: item.healthReviewStatus ?? "review_needed",
      reasons: item.proposedResponse ? [item.proposedResponse] : [],
      createdAtIso: item.createdAtIso,
      updatedAtIso: item.createdAtIso,
      documentedLimitations: item.documentedLimitations ?? undefined,
    };
    async function onResolve(status: HealthReviewStatus, documentedLimitations?: string) {
      "use server";
      await recordHealthReviewDecisionAction({ workspaceId, escalationId, status, documentedLimitations });
    }
    return { clientFirstName: item.clientDisplayName.split(" ")[0], record, clientReportedDetail, onResolve };
  }
  const focusHealthReview = focus ? await healthReviewFor(focus) : undefined;

  const { campaigns } = await getCampaignsAction();
  const activeCampaigns = campaigns.filter((c) => c.status !== "published").length;
  const publishedCampaigns = campaigns.filter((c) => c.status === "published").length;

  // Phase 9B — a light-touch, easily-ignored reflective section; never
  // allowed to compete with real attention items above, so it renders
  // after Campaigns rather than at the top of the page.
  const patternCandidates = await getEligibleCandidatesForReviewAction({ workspaceId });
  const learnedRules = await getMyLearnedRulesAction({ workspaceId });

  // Phase 7A — approve/editAndSend/respondPersonally all send an actual
  // message to the client (approving/editing/replacing "what OPTIM
  // proposed"). That only ever makes sense when there was a real client
  // chat message to respond to in the first place — a pain_or_safety
  // escalation created directly from onboarding or a live workout pain
  // report (see lib/production/onboarding.ts, app/actions/production-safety.ts)
  // has no such message, only a real recorded summary shown for context
  // (see components/coach/escalation-card.tsx's "What OPTIM said / proposes"
  // section). Gating these three actions on hasSourceMessage prevents a
  // coach from ever "sending" that summary text to the client as if it were
  // a chat reply.
  function actionsFor(escalationId: string, hasSourceMessage: boolean) {
    async function approve() {
      "use server";
      await approveEscalationResponseAction({ workspaceId, escalationId });
    }
    async function editAndSend(formData: FormData) {
      "use server";
      const editedBody = String(formData.get("editedBody") ?? "").trim();
      if (!editedBody) return;
      await editAndSendEscalationResponseAction({ workspaceId, escalationId, editedBody });
    }
    async function respondPersonally(formData: FormData) {
      "use server";
      const body = String(formData.get("personalBody") ?? "").trim();
      if (!body) return;
      await respondPersonallyAction({ workspaceId, escalationId, body });
    }
    async function resolveThread() {
      "use server";
      await resolveCoachThreadAction({ workspaceId, escalationId });
    }
    async function resolveSilently() {
      "use server";
      await resolveEscalationWithoutMessagingAction({ workspaceId, escalationId });
    }
    async function proposeExample(formData: FormData) {
      "use server";
      const resolution = String(formData.get("resolution") ?? "").trim();
      if (!resolution) return;
      const item = [focus, ...rest].find((i) => i?.id === escalationId);
      await proposePlaybookExampleAction({ escalationId, situation: item?.summary ?? "Client message", resolution });
    }
    return {
      approve: hasSourceMessage ? approve : undefined,
      editAndSend: hasSourceMessage ? editAndSend : undefined,
      respondPersonally: hasSourceMessage ? respondPersonally : undefined,
      resolveThread,
      resolveSilently,
      proposeExample,
    };
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-8">
      <div>
        <p className="text-label text-accent-strong">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1 text-display text-off-white">Good {timeOfDayGreeting()}, {inbox.coachDisplayName.split(" ")[0]}.</h1>
        <p className="mt-1.5 text-body text-neutral">
          {inbox.open.length === 0 ? "Everything's on track." : `${inbox.open.length} item${inbox.open.length === 1 ? "" : "s"} need${inbox.open.length === 1 ? "s" : ""} you.`}
        </p>
      </div>

      <section className="space-y-4">
        <SectionHeader
          title="Needs Your Attention"
          action={
            inbox.open.length > 0 || inbox.resolved.length > 0 ? (
              <Link href="/coach/escalations" className="text-action text-accent-strong hover:underline">
                View all
              </Link>
            ) : undefined
          }
        />
        {focus ? (
          <>
            {focus.adjustmentProposal ? <AdjustmentAttentionCard item={focus} /> : <EscalationCard item={focus} threadMessages={focusThreadMessages} actions={actionsFor(focus.id, focus.sourceMessageBody !== null)} healthReview={focusHealthReview} />}
            {rest.length > 0 && (
              <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
                {rest.map((item) =>
                  item.adjustmentProposal ? (
                    <Link key={item.id} href={`/coach/clients/${item.adjustmentProposal.clientProfileId}#proposal-review`} className="flex items-center gap-3 bg-charcoal px-4 py-3 hover:bg-surface-raised">
                      <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-label text-neutral">{item.kindLabel}</span>
                      <p className="min-w-0 flex-1 truncate text-body text-off-white">{item.clientDisplayName}</p>
                      <span className="shrink-0 text-meta text-neutral">{new Date(item.createdAtIso).toLocaleDateString()}</span>
                    </Link>
                  ) : (
                    <div key={item.id} className="flex items-center gap-3 bg-charcoal px-4 py-3">
                      <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-label text-neutral">{item.kindLabel}</span>
                      <p className="min-w-0 flex-1 truncate text-body text-off-white">{item.clientDisplayName}</p>
                      <span className="shrink-0 text-meta text-neutral">{new Date(item.createdAtIso).toLocaleDateString()}</span>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        ) : (
          <Card className="flex items-center gap-2.5 py-4">
            <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden="true" />
            <p className="text-body text-neutral">All clear — OPTIM is handling routine conversation. Nothing needs you right now.</p>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Campaigns" action={<Link href="/coach/campaigns" className="text-action text-accent-strong hover:underline">Open</Link>} />
        {campaigns.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Send a tailored, coach-approved message to a group of clients." />
        ) : (
          <Card className="flex items-center gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              <Megaphone size={16} aria-hidden="true" />
            </span>
            <p className="text-body text-neutral">
              <span className="font-medium text-off-white">{publishedCampaigns}</span> published
              {activeCampaigns > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium text-off-white">{activeCampaigns}</span> in progress
                </>
              ) : null}
            </p>
          </Card>
        )}
      </section>

      <PatternCandidateSection workspaceId={workspaceId} candidates={patternCandidates} />
      <LearnedRulesList workspaceId={workspaceId} rules={learnedRules} />

      {inbox.resolved.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Recently resolved" />
          <Card className="divide-y divide-border p-0">
            {inbox.resolved.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <AlertTriangle size={14} className="shrink-0 text-neutral" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-body text-off-white">
                  {item.clientDisplayName} — {item.kindLabel}
                </p>
                <span className="shrink-0 text-meta text-neutral">{new Date(item.createdAtIso).toLocaleDateString()}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
