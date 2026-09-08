"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Wand2, HeartPulse, Mail, AlertTriangle, RotateCw, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/progress/status-badge";
import { OptimClientBrief } from "@/components/coach/optim-client-brief";
import { HealthReviewDecisionCard } from "@/components/coach/health-review-decision-card";
import { FullIntakeDisclosure } from "@/components/coach/full-intake-disclosure";
import { SetupDetailsDisclosure } from "@/components/coach/setup-details-disclosure";
import { InvitationLinkCard } from "@/components/coach/invitation-link-card";
import { getActivationGenerationsForClient } from "@/lib/coach/repository";
import { latestGenerationForClient, healthReviewPermitsActivation } from "@/lib/coach/activation-lifecycle";
import { resolveClientJourneyStage, CLIENT_JOURNEY_STAGE_LABELS, type ClientJourneyStage } from "@/lib/coach/plan-status";
import { buildOptimClientBrief } from "@/lib/coach/activation-brief";
import type { useProgramComposer } from "@/hooks/use-program-composer";
import type { HealthReviewStatus } from "@/lib/coach/types";

type CoachClientView = ReturnType<typeof useProgramComposer>;

const STAGE_BADGE_TONE: Record<ClientJourneyStage, BadgeTone> = {
  awaiting_onboarding: "steel",
  blocked_by_health_review: "warning",
  not_started: "brass",
  recommendations_ready: "brass",
  coach_approval_needed: "accent",
  generation_failed: "error",
  approved: "success",
};

/**
 * Phase 5.6A.1 — the redesigned post-intake decision workspace for a
 * not-yet-active client (spec Part 1). Replaces the old stack of competing
 * status cards (Activation brief, Setup essentials, a six-item Activation
 * readiness checklist, all visible at once, sometimes contradicting each
 * other) with: one honest header, one synthesized OPTIM Client Brief, one
 * dominant next-action, a dedicated health-review decision when relevant,
 * and everything else — the full intake, the internal readiness checklist —
 * folded behind small secondary disclosures.
 */
export function ActivationWorkspace({ view, onActivateClick }: { view: CoachClientView; onActivateClick: () => void }) {
  const router = useRouter();
  const { client, hasClientAppState, clientAppState, intendedProgram, invitation, readiness, healthReview, onboarding, dispatchPlatform, workspaceId, platform, runAutoGeneration } = view;

  if (!client) return null;

  const generations = getActivationGenerationsForClient(platform, client.id);
  const latestGeneration = latestGenerationForClient(generations, client.id);
  const healthReviewResolved = healthReviewPermitsActivation(platform, client.id);
  const stage = resolveClientJourneyStage({ onboardingCompleted: !!onboarding?.completedAtIso, latestGeneration, healthReviewResolved });

  const startDateIso = clientAppState?.programEnrollment.startDateIso ?? intendedProgram?.intendedStartDateIso;
  const startDateLabel = startDateIso ? new Date(`${startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set";

  const brief = buildOptimClientBrief({ onboarding, intendedProgram, programEnrollment: clientAppState?.programEnrollment ?? null, healthReview });
  const clientReportedDetail = typeof onboarding?.answers.health_finish?.injuryRestrictions === "string" ? onboarding.answers.health_finish.injuryRestrictions : null;

  function handleHealthReviewStatus(status: HealthReviewStatus, documentedLimitations?: string) {
    dispatchPlatform({ type: "SET_HEALTH_REVIEW_STATUS", clientId: client!.id, workspaceId, status, nowIso: new Date().toISOString(), documentedLimitations });
  }

  return (
    <div className="space-y-5">
      {/* 1. Header — who, when, one honest stage badge. */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-heading text-off-white">{client.name}</h1>
          <p className="mt-0.5 text-meta text-neutral">
            {client.email ?? "No email on file"} &middot; Start {startDateLabel}
          </p>
        </div>
        <StatusBadge label={CLIENT_JOURNEY_STAGE_LABELS[stage]} tone={STAGE_BADGE_TONE[stage]} />
      </Card>

      {/* 2. The single, dominant next action — spec's State 1-6. Leads the
       * page (ahead of the Brief) so a coach never has to read supporting
       * context before finding out what OPTIM needs from them right now. */}
      <ClientJourneyCard stage={stage} clientName={client.name} failureReason={latestGeneration?.failureReason ?? latestGeneration?.blockedReasons?.join(" ")} invitation={invitation} onReviewPlan={() => router.push(`/coach/clients/${client.id}/activate`)} onRetry={() => runAutoGeneration()} />

      {/* 3. One coherent OPTIM Client Brief — synthesis, not a repeat of raw fields. */}
      {brief ? <OptimClientBrief brief={brief} /> : null}

      {/* 4. Health review — its own clear decision, never a generic dropdown. */}
      {healthReview ? <HealthReviewDecisionCard clientFirstName={client.name.split(" ")[0]} healthReview={healthReview} clientReportedDetail={clientReportedDetail} onResolve={handleHealthReviewStatus} /> : null}

      {/* 5. Secondary disclosures — never dominant, never contradicting section 2. */}
      <div className="space-y-2.5">
        <SetupDetailsDisclosure readiness={readiness} requirementActions={{ start_date_exists: { href: `/coach/clients/${client.id}/setup`, label: "Set start date" } }} onActivateManually={onActivateClick} checkInAssigned={hasClientAppState ? !!clientAppState?.checkInSchedule : undefined} />
        <FullIntakeDisclosure onboarding={onboarding} healthReview={healthReview} />
        {stage === "awaiting_onboarding" ? (
          <Card className="space-y-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/coach/clients/${client.id}/setup`)}>
              <Wrench size={14} aria-hidden="true" /> Complete setup
            </Button>
          </Card>
        ) : (
          <SetupAndInvitationDisclosure invitation={invitation} hasClientAppState={hasClientAppState} onEditSetup={() => router.push(`/coach/clients/${client.id}/setup`)} />
        )}
      </div>
    </div>
  );
}

/** Once onboarding is behind this client, the invitation link and manual
 * setup are historical/reference actions, not the current task — folded
 * behind the same collapsed-by-default disclosure pattern as Setup
 * details/Full intake above, so they stay reachable without competing with
 * the real dominant action (the ClientJourneyCard above). */
function SetupAndInvitationDisclosure({
  invitation,
  hasClientAppState,
  onEditSetup,
}: {
  invitation: CoachClientView["invitation"];
  hasClientAppState: boolean;
  onEditSetup: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-off-white hover:bg-surface-input"
      >
        Setup &amp; invitation
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open ? (
        <Card className="mt-3 space-y-3">
          <Button variant="outline" size="sm" onClick={onEditSetup}>
            <Wrench size={14} aria-hidden="true" /> {hasClientAppState ? "Edit setup" : "Complete setup"}
          </Button>
          {invitation ? <InvitationLinkCard invitation={invitation} /> : null}
        </Card>
      ) : null}
    </div>
  );
}

function ClientJourneyCard({
  stage,
  clientName,
  failureReason,
  invitation,
  onReviewPlan,
  onRetry,
}: {
  stage: ClientJourneyStage;
  clientName: string;
  failureReason?: string;
  invitation: CoachClientView["invitation"];
  onReviewPlan: () => void;
  onRetry: () => void;
}) {
  if (stage === "awaiting_onboarding") {
    return (
      <Card className="border-l-4 border-l-brass">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
            <Mail size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-heading text-off-white">Awaiting client onboarding</p>
            <p className="mt-0.5 text-meta text-neutral">{clientName} hasn&apos;t completed their intake yet — OPTIM needs it before it can prepare a plan.</p>
            {invitation ? (
              <div className="mt-3">
                <InvitationLinkCard invitation={invitation} />
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  if (stage === "blocked_by_health_review") {
    return (
      <Card className="border-l-4 border-l-warning">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <HeartPulse size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-heading text-off-white">Your review is next</p>
            <p className="mt-0.5 text-meta text-neutral">A reported concern needs your decision before OPTIM can generate a plan around it safely — see below.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (stage === "generation_failed") {
    return (
      <Card className="border-l-4 border-l-error">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-soft text-error-strong">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-heading text-off-white">OPTIM couldn&apos;t prepare a draft</p>
              <p className="mt-0.5 text-meta text-neutral">{failureReason ?? "Something went wrong while generating this client's plan."}</p>
            </div>
          </div>
          <Button onClick={onRetry}>
            <RotateCw size={16} aria-hidden="true" /> Retry generation
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "coach_approval_needed") {
    return (
      <Card className="border-l-4 border-l-brass">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
              <Wand2 size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-heading text-off-white">OPTIM plan ready for review</p>
              <p className="mt-0.5 text-meta text-neutral">Review OPTIM&apos;s recommended training and nutrition direction and approve or adjust before it goes live for {clientName}.</p>
            </div>
          </div>
          <Button onClick={onReviewPlan}>
            <Wand2 size={16} aria-hidden="true" /> Review OPTIM Plan
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "approved") {
    return (
      <Card className="border-l-4 border-l-success">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-heading text-off-white">Training plan — approved</p>
            <p className="mt-0.5 text-meta text-neutral">This client&apos;s plan is live.</p>
          </div>
        </div>
      </Card>
    );
  }

  // "not_started" | "recommendations_ready" — both are transient, mid-
  // pipeline instants under automatic generation (see the client-detail
  // page's auto-generation effect): honest "preparing" language, never a
  // fake percentage or time estimate.
  return (
    <Card className="border-l-4 border-l-brass">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Wand2 size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-heading text-off-white">OPTIM is preparing the training and nutrition draft</p>
          <p className="mt-0.5 flex items-center gap-2 text-meta text-neutral">
            <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-brass-strong pc-pulse" aria-hidden="true" />
            Onboarding is complete — OPTIM is generating recommendations for your review.
          </p>
        </div>
      </div>
    </Card>
  );
}
