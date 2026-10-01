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

import type { EscalationHealthReview } from "@/components/coach/escalation-card";
import { EscalationDecisionPanel } from "@/components/coach/escalation-decision-panel";
import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { DemoCoachDashboard } from "@/components/coach/demo-coach-dashboard";
import { PatternCandidateSection } from "@/components/coach/pattern-candidate-section";
import { LearnedRulesList } from "@/components/coach/learned-rules-list";
import { resolveAppMode } from "@/lib/production/mode";
import { getCoachDashboardData } from "@/lib/production/coach-dashboard";
import { getOnboardingProgressForClient } from "@/lib/production/onboarding";
import { buildCoachDashboard, firstNameOf } from "@/lib/coach/dashboard-zones";
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
import type { AttentionItem } from "@/lib/production/coach-operations";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

export default function CoachOverviewPage() {
  if (resolveAppMode() !== "supabase") return <DemoCoachDashboard />;
  return <LiveCoachDashboard />;
}

async function LiveCoachDashboard() {
  // Gate 2 — every real record the dashboard uses is gathered in one place
  // (lib/production/coach-dashboard.ts), and every decision about what
  // belongs in NEEDS YOU / WORTH KNOWING / HANDLED is made by the pure,
  // unit-tested buildCoachDashboard (lib/coach/dashboard-zones.ts). This
  // page only wires the existing escalation actions to the focus item and
  // renders the result.
  const nowIso = new Date().toISOString();
  const { inbox, input, patternCandidates, learnedRules } = await getCoachDashboardData(nowIso);
  const { workspaceId } = inbox;
  const dashboard = buildCoachDashboard(input);

  // When the focus item is an escalation, its decision opens inline: the
  // same bound approve/edit/respond/resolve/teach actions and health-review
  // decision EscalationCard uses (still the presentation on
  // /coach/escalations), laid out as one ordered decision without repeating
  // what the navy briefing above already shows.
  const focusItem = dashboard.needsYou[0] ?? null;
  const focusEscalation: AttentionItem | null =
    focusItem?.attentionItemId && (focusItem.kind === "escalation" || focusItem.kind === "client_replied")
      ? (inbox.open.find((i) => i.id === focusItem.attentionItemId && !i.adjustmentProposal) ?? null)
      : null;
  const focusThreadMessages = focusEscalation?.hasOpenCoachThread ? await getCoachThreadMessagesAction({ workspaceId, escalationId: focusEscalation.id }) : [];

  // Phase 7B — unchanged: a pain_or_safety focus item carries its real
  // health-review record and decision action.
  async function healthReviewFor(item: AttentionItem): Promise<EscalationHealthReview | undefined> {
    if (item.escalationReason !== "pain_or_safety") return undefined;
    const onboarding = await getOnboardingProgressForClient(item.clientId);
    const clientReportedDetail = typeof onboarding?.answers.health_finish?.injuryRestrictions === "string" ? (onboarding.answers.health_finish.injuryRestrictions as string) : null;
    const escalationId = item.id;
    const record: HealthReviewRecord = {
      clientId: item.clientId,
      workspaceId,
      status: item.healthReviewStatus ?? "review_needed",
      // The client's own words when the report came through chat; otherwise
      // the recorded report summary. Never OPTIM's drafted reply.
      reasons: item.sourceMessageBody ? [item.sourceMessageBody] : item.proposedResponse ? [item.proposedResponse] : [],
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
  const focusHealthReview = focusEscalation ? await healthReviewFor(focusEscalation) : undefined;

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
      const item = inbox.open.find((i) => i.id === escalationId);
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

  const activeLearnedRuleCount = learnedRules.filter((r) => r.status === "active").length;

  return (
    <CoachDashboardView
      dashboard={dashboard}
      coachFirstName={firstNameOf(inbox.coachDisplayName) || "Coach"}
      nowIso={nowIso}
      focusEscalation={
        focusEscalation ? (
          <EscalationDecisionPanel
            item={focusEscalation}
            threadMessages={focusThreadMessages}
            actions={actionsFor(focusEscalation.id, focusEscalation.sourceMessageBody !== null)}
            healthReview={focusHealthReview}
          />
        ) : undefined
      }
      patternSlot={(signature) => (
        <PatternCandidateSection workspaceId={workspaceId} candidates={patternCandidates.filter((c) => c.candidateSignature === signature)} />
      )}
      learnedRules={activeLearnedRuleCount > 0 ? { count: activeLearnedRuleCount, content: <LearnedRulesList workspaceId={workspaceId} rules={learnedRules} /> } : null}
    />
  );
}
