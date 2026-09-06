"use client";

import { useRouter } from "next/navigation";
import { Wrench, Wand2, HeartPulse } from "lucide-react";
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
import { resolveTrainingPlanStatus } from "@/lib/coach/plan-status";
import type { useCoachClientView } from "@/hooks/use-coach-data";
import type { HealthReviewStatus } from "@/lib/coach/types";

type CoachClientView = ReturnType<typeof useCoachClientView>;

/**
 * The focused pre-activation Activation Workspace (spec §4, corrected by
 * Phase 5.5A Part 2) — who is this client, when do they start, and — above
 * everything else — a single, unmistakable path into OPTIM's own
 * recommendations. A coach must never need to hunt under "Setup &
 * invitation" to find them (spec: "the coach must never need to search...
 * to find OPTIM's recommendations").
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
  } = view;

  // useCoachBrief must run on every render regardless of `client` (rules of
  // hooks) — it's already null-safe internally (see its own doc), so
  // calling it before the early return below is always correct.
  const { brief, refresh } = useCoachBrief(view, null);

  if (!client) return null;

  const generations = getActivationGenerationsForClient(platform, client.id);
  const latestGeneration = latestGenerationForClient(generations, client.id);
  const healthReviewResolved = healthReviewPermitsActivation(platform, client.id);
  const planStatus = resolveTrainingPlanStatus({ latestGeneration, healthReviewResolved });

  const requirementActions: Partial<Record<string, { href: string; label: string }>> = {
    start_date_exists: { href: `/coach/clients/${client.id}/setup`, label: "Set start date" },
    // Phase 5.5A — this used to send a coach straight into the manual
    // week-by-week builder the instant training wasn't ready yet, which is
    // exactly the "no visible AI feature" problem this phase corrects.
    // Every path into a training decision now goes through the real,
    // unified OPTIM Plan; the manual builder stays reachable from inside
    // it as "Fine-tune manually," never as the first stop.
    week1_program_assigned: { href: `/coach/clients/${client.id}/activate`, label: planStatus.label },
    nutrition_configuration_exists: { href: `/coach/clients/${client.id}/activate`, label: "Review OPTIM's nutrition recommendations" },
  };

  const startDateIso = clientAppState?.programEnrollment.startDateIso ?? intendedProgram?.intendedStartDateIso;
  const startDateLabel = startDateIso ? new Date(`${startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set";

  function handleHealthReviewStatus(status: HealthReviewStatus) {
    dispatchPlatform({ type: "SET_HEALTH_REVIEW_STATUS", clientId: client!.id, workspaceId, status, nowIso: new Date().toISOString() });
  }

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

      {/* 2. The one obvious primary action (spec Part 2) — always visible,
          always opens, regardless of coach calibration or health-review
          state; the plan itself explains any blocker (Part 3). */}
      <Card className="border-l-2 border-l-brass">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
              {planStatus.status === "blocked_by_health_review" ? <HeartPulse size={18} aria-hidden="true" /> : <Wand2 size={18} aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="text-subheading text-off-white">{planStatus.label}</p>
              <p className="mt-0.5 text-meta text-neutral">
                {planStatus.status === "not_started"
                  ? "OPTIM hasn't reviewed this client's training and nutrition yet."
                  : planStatus.status === "blocked_by_health_review"
                    ? "A reported concern needs your review before OPTIM can generate around it safely."
                    : planStatus.status === "recommendations_ready"
                      ? "Three ranked training directions are ready to compare."
                      : planStatus.status === "coach_approval_needed"
                        ? "A complete plan is ready for your review and approval."
                        : "This client's plan is live."}
              </p>
            </div>
          </div>
          <Button onClick={() => router.push(`/coach/clients/${client.id}/activate`)}>
            <Wand2 size={16} aria-hidden="true" /> Review OPTIM Plan
          </Button>
        </div>
      </Card>

      {/* 3. Dominant Activation Brief */}
      <CoachBriefCard brief={brief} kicker="Activation Brief" onRefresh={refresh} />

      {/* 4. Required before activation */}
      <section className="space-y-2">
        <p className="text-subheading text-off-white">Required before activation</p>
        <BlockerList readiness={readiness} healthReview={healthReview} onChangeHealthReviewStatus={handleHealthReviewStatus} requirementActions={requirementActions} />
      </section>

      {/* 5. Setup essentials */}
      <Card>
        <p className="text-subheading text-off-white">Setup essentials</p>
        <div className="mt-2.5">
          <SetupEssentials onboarding={onboarding} intendedProgram={intendedProgram} programEnrollment={clientAppState?.programEnrollment ?? null} />
        </div>
      </Card>

      {/* 6. Full intake */}
      <FullIntakeDisclosure onboarding={onboarding} healthReview={healthReview} />

      {/* 7. Activation readiness */}
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
        {invitation ? <InvitationLinkCard invitation={invitation} /> : null}
      </Card>
    </div>
  );
}
