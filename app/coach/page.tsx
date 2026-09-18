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
import { EscalationCard, type EscalationHealthReview } from "@/components/coach/escalation-card";
import { AdjustmentAttentionCard } from "@/components/coach/adjustment-attention-card";
import { DemoCoachDashboard } from "@/components/coach/demo-coach-dashboard";
import { PatternCandidateSection } from "@/components/coach/pattern-candidate-section";
import { LearnedRulesList } from "@/components/coach/learned-rules-list";
import { resolveAppMode } from "@/lib/production/mode";
import { getCoachOperationsRepository } from "@/lib/production/coach-operations";
import { getOnboardingProgressForClient } from "@/lib/production/onboarding";
import { listRosterForOwnWorkspace } from "@/lib/production/roster";
import { buildRosterPulse } from "@/lib/coach/command-center";
import {
  getCoachThreadMessagesAction,
  approveEscalationResponseAction,
  editAndSendEscalationResponseAction,
  respondPersonallyAction,
  resolveCoachThreadAction,
  resolveEscalationWithoutMessagingAction,
  proposePlaybookExampleAction,
  recordHealthReviewDecisionAction,
} from "@/app/actions/coach-communications";
import { getEligibleCandidatesForReviewAction, getMyLearnedRulesAction } from "@/app/actions/coach-learned-rules";
import type { AttentionItem } from "@/lib/production/coach-operations";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";
import type { ClientProfileId } from "@/lib/tenancy/types";

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

  // Phase 9B — a light-touch, easily-ignored reflective section; belongs to
  // the quieter "Worth Knowing" zone below, never competing with real
  // attention items in "Needs You".
  const patternCandidates = await getEligibleCandidatesForReviewAction({ workspaceId });
  const learnedRules = await getMyLearnedRulesAction({ workspaceId });
  const activeLearnedRuleCount = learnedRules.filter((r) => r.status === "active").length;

  // Phase 13A — real roster counts for the "Handled" zone's quiet summary
  // (never a fabricated automation count). Reuses the same
  // listRosterForOwnWorkspace + buildRosterPulse the Clients page and the
  // demo Command Center already use — no new backend logic, just the
  // existing read applied in a new place.
  const { rows: rosterRows } = await listRosterForOwnWorkspace();
  const visibleRosterRows = rosterRows.filter((r) => !r.archived);
  const lifecycleByClientId = new Map(visibleRosterRows.map((r) => [r.clientId, r.lifecycle]));
  const programPhaseByClientId = new Map(visibleRosterRows.map((r) => [r.clientId, r.programPhase]));
  const needsCoachClientIds = new Set<ClientProfileId>(inbox.open.map((i) => i.clientId as ClientProfileId));
  const rosterPulse = buildRosterPulse(
    visibleRosterRows.map((r) => r.clientId),
    lifecycleByClientId,
    needsCoachClientIds,
    programPhaseByClientId
  );

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

  const worthKnowingCount = patternCandidates.length;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-12">
      <div>
        <p className="text-label text-accent-strong">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1 text-display text-off-white">Good {timeOfDayGreeting()}, {inbox.coachDisplayName.split(" ")[0]}.</h1>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* NEEDS YOU — the dominant working surface. Zero is a complete
            state on its own; a real item is the one expanded object plus
            compact rows for the rest — actions only ever live on the
            focused item. /coach/escalations already carries the full
            open+resolved history, so nothing here duplicates it. */}
        <section className="min-w-0">
          <p className="text-label text-neutral">Needs You</p>
          {focus ? (
            <div className="mt-4 space-y-4">
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
            </div>
          ) : (
            <p className="mt-3 text-metric text-off-white">0</p>
          )}
        </section>

        {/* Right rail — WORTH KNOWING (quieter secondary territory) above
            HANDLED (recessive/ambient). No borders, no equal-weight stat
            cards, no repeated category headers — position, scale, and
            color carry the hierarchy. */}
        <div className="space-y-10">
          <section>
            <p className="text-label text-neutral">Worth Knowing</p>
            <p className="mt-2 text-heading text-off-white">{worthKnowingCount}</p>
            {worthKnowingCount > 0 ? (
              <div className="mt-3">
                <PatternCandidateSection workspaceId={workspaceId} candidates={patternCandidates.slice(0, 1)} />
              </div>
            ) : null}
          </section>

          <section>
            <p className="text-label text-neutral">Handled</p>
            <Link href="/coach/clients" className="mt-2 inline-block text-subheading text-neutral hover:text-off-white">
              {rosterPulse.onTrack}
            </Link>
            {activeLearnedRuleCount > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-meta text-neutral hover:text-off-white">
                  {activeLearnedRuleCount} confirmed pattern{activeLearnedRuleCount === 1 ? "" : "s"}
                </summary>
                <div className="mt-2">
                  <LearnedRulesList workspaceId={workspaceId} rules={learnedRules} />
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
