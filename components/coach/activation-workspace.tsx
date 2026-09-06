"use client";

import { useRouter } from "next/navigation";
import { Wrench, Sparkles } from "lucide-react";
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
import { getActiveCoachOperatingModel } from "@/lib/coach/repository";
import type { useCoachClientView } from "@/hooks/use-coach-data";
import type { HealthReviewStatus } from "@/lib/coach/types";

type CoachClientView = ReturnType<typeof useCoachClientView>;

/**
 * The focused pre-activation Activation Workspace (spec §4) — replaces the
 * old page's "everything visible at once" layout. Initial viewport answers:
 * who is this client, when do they start, what's ready, what's blocking,
 * what should the coach do next. Reuses every existing service/component
 * (checkActivationReadiness, HealthReviewCard's status transitions via
 * BlockerList, CoachBrief, InvitationLinkCard, ActivationChecklist) — no
 * parallel client system.
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
    coachId,
    platform,
  } = view;

  // useCoachBrief must run on every render regardless of `client` (rules of
  // hooks) — it's already null-safe internally (see its own doc), so
  // calling it before the early return below is always correct.
  const { brief, refresh } = useCoachBrief(view, null);

  if (!client) return null;

  const requirementActions: Partial<Record<string, { href: string; label: string }>> = {
    start_date_exists: { href: `/coach/clients/${client.id}/setup`, label: "Set start date" },
    week1_program_assigned: { href: `/coach/clients/${client.id}/setup/training`, label: "Build training protocol" },
    nutrition_configuration_exists: { href: `/coach/clients/${client.id}/setup`, label: "Set nutrition targets" },
  };

  const startDateIso = clientAppState?.programEnrollment.startDateIso ?? intendedProgram?.intendedStartDateIso;
  const startDateLabel = startDateIso ? new Date(`${startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set";

  function handleHealthReviewStatus(status: HealthReviewStatus) {
    dispatchPlatform({ type: "SET_HEALTH_REVIEW_STATUS", clientId: client!.id, workspaceId, status, nowIso: new Date().toISOString() });
  }

  const canGeneratePlan = coachId && getActiveCoachOperatingModel(platform, coachId) && onboarding?.completedAtIso;

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

      {/* 2. Dominant Activation Brief */}
      <CoachBriefCard brief={brief} kicker="Activation Brief" onRefresh={refresh} />

      {/* 3. Required before activation */}
      <section className="space-y-2">
        <p className="text-subheading text-off-white">Required before activation</p>
        <BlockerList readiness={readiness} healthReview={healthReview} onChangeHealthReviewStatus={handleHealthReviewStatus} requirementActions={requirementActions} />
      </section>

      {/* 4. Setup essentials */}
      <Card>
        <p className="text-subheading text-off-white">Setup essentials</p>
        <div className="mt-2.5">
          <SetupEssentials onboarding={onboarding} intendedProgram={intendedProgram} programEnrollment={clientAppState?.programEnrollment ?? null} />
        </div>
      </Card>

      {/* 5. Full intake */}
      <FullIntakeDisclosure onboarding={onboarding} healthReview={healthReview} />

      {/* 6. Activation readiness */}
      <ActivationChecklist readiness={readiness} alreadyActive={false} onActivate={onActivateClick} checkInAssigned={hasClientAppState ? !!clientAppState?.checkInSchedule : undefined} compact />

      {/* 7. Secondary utilities — never competing primaries. */}
      <Card className="space-y-3">
        <p className="text-subheading text-off-white">Setup &amp; invitation</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/coach/clients/${client.id}/setup`)}>
            <Wrench size={14} aria-hidden="true" /> {hasClientAppState ? "Edit setup" : "Complete setup"}
          </Button>
          {canGeneratePlan ? (
            <Button variant="outline" size="sm" onClick={() => router.push(`/coach/clients/${client.id}/activate`)}>
              <Sparkles size={14} aria-hidden="true" /> Open Program Composer
            </Button>
          ) : null}
        </div>
        {invitation ? <InvitationLinkCard invitation={invitation} /> : null}
      </Card>
    </div>
  );
}
