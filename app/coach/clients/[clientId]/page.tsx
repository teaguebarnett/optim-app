"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Wrench, MessageSquare, CalendarClock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { MessageBubble } from "@/components/chat/message-bubble";
import { InvitationLinkCard } from "@/components/coach/invitation-link-card";
import { CoachBrief } from "@/components/coach/coach-brief";
import { HealthReviewCard } from "@/components/coach/health-review-card";
import { MealRecommendationAssignmentCard } from "@/components/coach/meal-recommendation-assignment";
import { AiAuthorityClientOverrideCard } from "@/components/coach/ai-authority-client-override-card";
import { ActivationChecklist } from "@/components/coach/activation-checklist";
import { ActivateConfirmationSheet } from "@/components/coach/activate-confirmation-sheet";
import { useCoachClientView } from "@/hooks/use-coach-data";
import { getActiveCoachOperatingModel } from "@/lib/coach/repository";
import { REVIEW_KIND_LABELS } from "@/lib/coach/labels";
import { ONBOARDING_STEPS } from "@/lib/coach/onboarding-steps";
import { resolveProgramTiming, describeProgramTimingForCoach } from "@/lib/scheduling/program-timing";
import type { HealthReviewStatus } from "@/lib/coach/types";

const SETUP_EDITABLE_STATUSES = new Set(["coach_setup", "ready_to_activate"]);

export default function CoachClientWorkspacePage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const view = useCoachClientView(params.clientId);
  const [confirmingActivation, setConfirmingActivation] = useState(false);

  if (!view.client) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/coach/clients")} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} /> Back to clients
        </button>
        <Card>
          <p className="text-sm text-neutral">No client found for this id.</p>
        </Card>
      </div>
    );
  }

  const { client, lifecycle, hasClientAppState, clientAppState, intendedProgram, invitation, readiness, healthReview, clientReviewRequests, chatMessages, dispatchPlatform, workspaceId, coachId } = view;

  // Every unmet requirement gets a direct action rather than leaving the
  // coach staring at a disabled "Activate" button with nowhere to go — see
  // components/coach/activation-checklist.tsx and lib/coach/types.ts's
  // ActivationRequirementResult doc. health_review_resolved carries no
  // action link since its own card already sits directly on this page.
  const REQUIREMENT_ACTIONS: Partial<Record<string, { href: string; label: string }>> = {
    start_date_exists: { href: `/coach/clients/${client.id}/setup`, label: "Set start date" },
    week1_program_assigned: { href: `/coach/clients/${client.id}/setup/training`, label: "Build training protocol" },
    nutrition_configuration_exists: { href: `/coach/clients/${client.id}/setup`, label: "Set nutrition targets" },
  };
  const readinessWithActions = {
    ...readiness,
    requirements: readiness.requirements.map((r) =>
      r.met
        ? r
        : {
            ...r,
            actionHref: REQUIREMENT_ACTIONS[r.id]?.href,
            actionLabel: REQUIREMENT_ACTIONS[r.id]?.label,
          }
    ),
  };

  function handleHealthReviewStatus(status: HealthReviewStatus) {
    dispatchPlatform({
      type: "SET_HEALTH_REVIEW_STATUS",
      clientId: client!.id,
      workspaceId,
      status,
      nowIso: new Date().toISOString(),
    });
  }

  const startDateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const programTiming = hasClientAppState && clientAppState ? resolveProgramTiming(clientAppState.programEnrollment, clientAppState.dateIso) : null;
  const programWeekLabel =
    hasClientAppState && clientAppState && programTiming
      ? describeProgramTimingForCoach(programTiming, clientAppState.programEnrollment.durationWeeks, startDateLabel(clientAppState.programEnrollment.startDateIso))
      : null;
  const isFutureStart = programTiming?.phase === "pre_program";
  const onboardingProgressFraction = view.onboarding
    ? `${Math.min(view.onboarding.currentStepIndex + 1, ONBOARDING_STEPS.length)} of ${ONBOARDING_STEPS.length} steps`
    : null;

  function handleActivate() {
    dispatchPlatform({
      type: "SET_CLIENT_LIFECYCLE",
      clientId: client!.id,
      workspaceId,
      status: "active",
      nowIso: new Date().toISOString(),
    });
    setConfirmingActivation(false);
  }

  const coachOverride = view.activeContext.coachProfile
    ? { displayName: view.activeContext.coachProfile.displayName, avatarInitials: view.activeContext.coachProfile.avatarInitials }
    : null;

  const primaryMobileAction =
    lifecycle === "ready_to_activate" && readiness.ready
      ? { label: "Activate", onClick: () => setConfirmingActivation(true) }
      : SETUP_EDITABLE_STATUSES.has(lifecycle)
        ? { label: hasClientAppState ? "Edit setup" : "Setup", onClick: () => router.push(`/coach/clients/${client.id}/setup`) }
        : null;

  return (
    <div className="space-y-5">
      {/* Mobile sticky header — back, identity, status, one primary action.
          `-top-5` cancels CoachShell main's own pt-5 so this sticks flush
          against the viewport top instead of leaving a gap above it. */}
      <div className="sticky -top-5 z-20 -mx-4 flex items-center justify-between gap-2 border-b border-border bg-near-black/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <button onClick={() => router.push("/coach/clients")} aria-label="Back to clients" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-raised">
          <ChevronLeft size={18} className="text-off-white" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-off-white">{client.name}</p>
          <LifecycleBadge lifecycle={lifecycle} programPhase={programTiming?.phase} className="mt-0.5" />
        </div>
        {primaryMobileAction ? (
          <Button size="sm" onClick={primaryMobileAction.onClick}>
            {primaryMobileAction.label}
          </Button>
        ) : null}
      </div>

      {/* Desktop header */}
      <div className="hidden items-center justify-between gap-3 md:flex">
        <button onClick={() => router.push("/coach/clients")} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} /> Back to clients
        </button>
      </div>
      <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
        <div>
          <h1 className="text-display text-off-white">{client.name}</h1>
          <p className="mt-1 text-sm text-neutral">{client.email ?? "No email on file"}</p>
        </div>
        <LifecycleBadge lifecycle={lifecycle} programPhase={programTiming?.phase} />
      </div>

      {isFutureStart ? (
        <Card className="border-l-2 border-l-brass">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
              <CalendarClock size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-subheading text-off-white">{programWeekLabel}</p>
              <p className="mt-0.5 text-meta text-neutral">
                {client.name} is active and sees a pre-start screen until {startDateLabel(clientAppState!.programEnrollment.startDateIso)}, then their daily
                plan opens automatically at Week 1.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {healthReview ? <HealthReviewCard healthReview={healthReview} onChangeStatus={handleHealthReviewStatus} /> : null}

          {clientReviewRequests.length > 0 ? (
            <Card className="border-l-2 border-l-error">
              <p className="text-subheading text-off-white">Needs attention</p>
              <ul className="mt-3 space-y-2">
                {clientReviewRequests.map((r) => (
                  <li key={r.id} className="rounded-[var(--radius-sm)] bg-error-soft px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-error">{REVIEW_KIND_LABELS[r.kind]}</p>
                    <p className="mt-1 text-sm text-off-white">{r.summary}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <p className="text-subheading text-off-white">Overview</p>
            <dl className="mt-3 grid grid-cols-2 gap-y-2.5 text-sm">
              <dt className="text-neutral">Assigned coach</dt>
              <dd className="text-right text-off-white">{view.activeContext.coachProfile?.displayName ?? "—"}</dd>
              <dt className="text-neutral">Program</dt>
              <dd className="text-right text-off-white">
                {programWeekLabel ?? (intendedProgram ? `Intended: ${intendedProgram.intendedDurationWeeks} weeks from ${intendedProgram.intendedStartDateIso}` : "Not set")}
              </dd>
              {lifecycle === "onboarding" && onboardingProgressFraction ? (
                <>
                  <dt className="text-neutral">Onboarding progress</dt>
                  <dd className="text-right text-off-white">{onboardingProgressFraction}</dd>
                </>
              ) : null}
              <dt className="text-neutral">Weekly check-in</dt>
              <dd className="text-right text-off-white">
                {hasClientAppState
                  ? clientAppState?.checkInSchedule
                    ? "Assigned"
                    : "None for now"
                  : intendedProgram?.intendedWeeklyCheckIn
                    ? "Requested at invite"
                    : "None requested"}
              </dd>
            </dl>
          </Card>

          <CoachBrief onboarding={view.onboarding} healthReview={healthReview} />

          {coachId ? (
            <MealRecommendationAssignmentCard
              clientId={client.id}
              clientFirstName={client.name.split(" ")[0]}
              recommendations={view.platform.mealRecommendations.filter((r) => r.coachId === coachId && r.status === "active")}
              onToggle={(recommendationId, assigned) =>
                dispatchPlatform({ type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId, coachId, clientId: client.id, assigned })
              }
            />
          ) : null}

          <AiAuthorityClientOverrideCard clientId={client.id} />

          <Card>
            <p className="text-subheading text-off-white">Chat</p>
            <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto rounded-[var(--radius-md)] bg-surface-input p-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-neutral">No messages yet.</p>
              ) : (
                chatMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} coachOverride={coachOverride} clientAvatarInitialsOverride={client.avatarInitials} />
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {SETUP_EDITABLE_STATUSES.has(lifecycle) ? (
            <Button className="hidden w-full md:flex" onClick={() => router.push(`/coach/clients/${client.id}/setup`)}>
              <Wrench size={16} /> {hasClientAppState ? "Edit setup" : "Complete setup"}
            </Button>
          ) : null}

          {invitation ? <InvitationLinkCard invitation={invitation} /> : null}

          {lifecycle !== "active" && coachId && getActiveCoachOperatingModel(view.platform, coachId) && view.onboarding?.completedAtIso ? (
            <Card className="border-l-2 border-l-accent">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                  <Sparkles size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-off-white">Generate this client&apos;s plan</p>
                  <p className="mt-1 text-meta text-neutral">OPTIM can generate ranked training and nutrition options in your style, ready for your review.</p>
                  <Button size="sm" className="mt-3" onClick={() => router.push(`/coach/clients/${client.id}/activate`)}>
                    Open Activation Studio
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {lifecycle !== "active" ? (
            <ActivationChecklist
              readiness={readinessWithActions}
              alreadyActive={false}
              onActivate={() => setConfirmingActivation(true)}
              checkInAssigned={hasClientAppState ? !!clientAppState?.checkInSchedule : undefined}
            />
          ) : (
            <Card className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <MessageSquare size={16} aria-hidden="true" />
              </span>
              <p className="text-sm text-neutral">
                {client.name} is active {isFutureStart ? "and will use the full client experience once their program starts." : "and using the full client experience."}
              </p>
            </Card>
          )}
        </div>
      </div>

      <ActivateConfirmationSheet
        open={confirmingActivation}
        onClose={() => setConfirmingActivation(false)}
        onConfirm={handleActivate}
        clientName={client.name}
        clientAppState={clientAppState}
      />
    </div>
  );
}
