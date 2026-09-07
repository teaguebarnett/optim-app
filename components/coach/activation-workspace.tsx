"use client";

import { useRouter } from "next/navigation";
import { Wrench, Wand2, HeartPulse, Mail, AlertTriangle, RotateCw, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { CoachBriefCard } from "@/components/coach/coach-brief-card";
import { BlockerList } from "@/components/coach/blocker-list";
import { SetupEssentials } from "@/components/coach/setup-essentials";
import { FullIntakeDisclosure } from "@/components/coach/full-intake-disclosure";
import { ActivationChecklist } from "@/components/coach/activation-checklist";
import { InvitationLinkCard } from "@/components/coach/invitation-link-card";
import { useCoachBrief } from "@/hooks/use-coach-brief";
import { getActivationGenerationsForClient } from "@/lib/coach/repository";
import { latestGenerationForClient, healthReviewPermitsActivation } from "@/lib/coach/activation-lifecycle";
import { resolveClientJourneyStage } from "@/lib/coach/plan-status";
import type { useProgramComposer } from "@/hooks/use-program-composer";
import type { ActivationReadiness, HealthReviewStatus } from "@/lib/coach/types";

type CoachClientView = ReturnType<typeof useProgramComposer>;

// Phase 5.6A — these two requirements are now represented entirely by the
// unified plan-status card below (section 2): a coach following that one
// card into /activate sees the real training AND nutrition state directly,
// so surfacing them a second time here as red "Blocking" rows — often
// BEFORE onboarding is even done, when there's nothing to review yet at all
// — was exactly the "competing status cards" problem this phase's brief
// documents. `onboarding_complete` is excluded the same way: it IS the
// dominant "Awaiting client onboarding" state below, never a second,
// separate blocker about the same fact. Every other real requirement
// (assigned coach, start date, health review) still belongs here — they're
// genuinely independent of the plan itself.
const REQUIREMENTS_FOLDED_INTO_PLAN_STATUS = new Set(["onboarding_complete", "week1_program_assigned", "nutrition_configuration_exists"]);

function blockersForRequiredSection(readiness: ActivationReadiness): ActivationReadiness {
  return { ...readiness, requirements: readiness.requirements.filter((r) => !REQUIREMENTS_FOLDED_INTO_PLAN_STATUS.has(r.id)) };
}

/**
 * The focused pre-activation Activation Workspace (spec §4, corrected by
 * Phase 5.5A Part 2, restructured by Phase 5.6A around the one honest
 * client-journey stage — spec's "State 1..4") — who is this client, when do
 * they start, and — above everything else — a single, truthful primary
 * action that matches what's actually available right now. A coach must
 * never need to hunt under "Setup & invitation" to find OPTIM's
 * recommendations, and must never be shown a CTA for a plan that doesn't
 * exist yet.
 */
export function ActivationWorkspace({ view, onActivateClick }: { view: CoachClientView; onActivateClick: () => void }) {
  const router = useRouter();
  const {
    client,
    lifecycle,
    hasClientAppState,
    clientAppState,
    intendedProgram,
    invitation,
    readiness,
    healthReview,
    onboarding,
    dispatchPlatform,
    workspaceId,
    platform,
    runAutoGeneration,
  } = view;

  // useCoachBrief must run on every render regardless of `client` (rules of
  // hooks) — it's already null-safe internally (see its own doc), so
  // calling it before the early return below is always correct.
  const { brief, refresh } = useCoachBrief(view, null);

  if (!client) return null;

  const generations = getActivationGenerationsForClient(platform, client.id);
  const latestGeneration = latestGenerationForClient(generations, client.id);
  const healthReviewResolved = healthReviewPermitsActivation(platform, client.id);
  const stage = resolveClientJourneyStage({ onboardingCompleted: !!onboarding?.completedAtIso, latestGeneration, healthReviewResolved });

  const startDateIso = clientAppState?.programEnrollment.startDateIso ?? intendedProgram?.intendedStartDateIso;
  const startDateLabel = startDateIso ? new Date(`${startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set";

  function handleHealthReviewStatus(status: HealthReviewStatus) {
    dispatchPlatform({ type: "SET_HEALTH_REVIEW_STATUS", clientId: client!.id, workspaceId, status, nowIso: new Date().toISOString() });
  }

  const requiredBlockers = blockersForRequiredSection(readiness);

  return (
    <div className="space-y-5">
      {/* 1. Compact client header */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-heading text-off-white">{client.name}</h1>
          <p className="mt-0.5 text-meta text-neutral">
            {client.email ?? "No email on file"} &middot; Start {startDateLabel}
          </p>
        </div>
        <LifecycleBadge lifecycle={lifecycle} />
      </Card>

      {/* 2. The single, truthful status + next action — spec's State 1-4. */}
      <ClientJourneyCard
        stage={stage}
        clientName={client.name}
        failureReason={latestGeneration?.failureReason ?? latestGeneration?.blockedReasons?.join(" ")}
        invitation={invitation}
        onReviewPlan={() => router.push(`/coach/clients/${client.id}/activate`)}
        onRetry={() => runAutoGeneration()}
      />

      {/* 3. Dominant Activation Brief */}
      <CoachBriefCard brief={brief} kicker="Activation Brief" onRefresh={refresh} />

      {/* 4. Required before activation — only genuinely independent
          blockers; training/nutrition status lives in section 2 above. */}
      {requiredBlockers.requirements.some((r) => !r.met) ? (
        <section className="space-y-2">
          <p className="text-subheading text-off-white">Required before activation</p>
          <BlockerList readiness={requiredBlockers} healthReview={healthReview} onChangeHealthReviewStatus={handleHealthReviewStatus} requirementActions={{ start_date_exists: { href: `/coach/clients/${client.id}/setup`, label: "Set start date" } }} />
        </section>
      ) : null}

      {/* 5. Setup essentials */}
      <Card>
        <p className="text-subheading text-off-white">Setup essentials</p>
        <div className="mt-2.5">
          <SetupEssentials onboarding={onboarding} intendedProgram={intendedProgram} programEnrollment={clientAppState?.programEnrollment ?? null} />
        </div>
      </Card>

      {/* 6. Full intake */}
      <FullIntakeDisclosure onboarding={onboarding} healthReview={healthReview} />

      {/* 7. Activation readiness — still the real gate for a manually-built
          (non-AI) program; a client approved through the OPTIM Plan above
          is already active by the time every row here would read
          "Complete," so this never competes with section 2 in practice. */}
      <ActivationChecklist readiness={readiness} alreadyActive={false} onActivate={onActivateClick} checkInAssigned={hasClientAppState ? !!clientAppState?.checkInSchedule : undefined} compact />

      {/* 8. Secondary utilities — setup details and invitation, never a
          path into manual programming. */}
      <Card className="space-y-3">
        <p className="text-subheading text-off-white">Setup &amp; invitation</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/coach/clients/${client.id}/setup`)}>
            <Wrench size={14} aria-hidden="true" /> {hasClientAppState ? "Edit setup" : "Complete setup"}
          </Button>
        </div>
        {invitation && stage !== "awaiting_onboarding" ? <InvitationLinkCard invitation={invitation} /> : null}
      </Card>
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
  stage: ReturnType<typeof resolveClientJourneyStage>;
  clientName: string;
  failureReason?: string;
  invitation: CoachClientView["invitation"];
  onReviewPlan: () => void;
  onRetry: () => void;
}) {
  if (stage === "awaiting_onboarding") {
    return (
      <Card className="border-l-2 border-l-brass">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
            <Mail size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-subheading text-off-white">Awaiting client onboarding</p>
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
      <Card className="border-l-2 border-l-warning">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <HeartPulse size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-subheading text-off-white">Blocked by health review</p>
            <p className="mt-0.5 text-meta text-neutral">A reported concern needs your review before OPTIM can generate a plan around it safely — resolve it below.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (stage === "generation_failed") {
    return (
      <Card className="border-l-2 border-l-error">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-soft text-error-strong">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-subheading text-off-white">OPTIM couldn&apos;t prepare a draft</p>
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
      <Card className="border-l-2 border-l-brass">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
              <Wand2 size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-subheading text-off-white">OPTIM plan ready for review</p>
              <p className="mt-0.5 text-meta text-neutral">Compare OPTIM&apos;s ranked training and nutrition directions and approve or adjust before it goes live for {clientName}.</p>
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
      <Card className="border-l-2 border-l-success">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-subheading text-off-white">Training plan — approved</p>
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
    <Card className="border-l-2 border-l-brass">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Wand2 size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-subheading text-off-white">OPTIM is preparing the training and nutrition draft</p>
          <p className="mt-0.5 flex items-center gap-2 text-meta text-neutral">
            <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-brass-strong pc-pulse" aria-hidden="true" />
            Onboarding is complete — OPTIM is generating recommendations for your review.
          </p>
        </div>
      </div>
    </Card>
  );
}
