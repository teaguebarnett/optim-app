"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ClipboardList, ChevronDown, ChevronUp, ChevronRight, Wand2, Eye } from "lucide-react";
import Link from "next/link";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/progress/status-badge";
import { MessageBubble } from "@/components/chat/message-bubble";
import { CoachBriefCard } from "@/components/coach/coach-brief-card";
import { ActiveCoachActions } from "@/components/coach/active-coach-actions";
import { ClientTodaySummary } from "@/components/coach/client-today-summary";
import { ClientTrends } from "@/components/coach/client-trends";
import { RecentDecisions } from "@/components/coach/recent-decisions";
import { DailyBriefingCard } from "@/components/coach/daily-briefing-card";
import { AiAuthorityClientOverrideCard } from "@/components/coach/ai-authority-client-override-card";
import { MealRecommendationAssignmentCard } from "@/components/coach/meal-recommendation-assignment";
import { CoachMealPlanCard } from "@/components/coach/coach-meal-plan-card";
import { useCoachBrief } from "@/hooks/use-coach-brief";
import { resolveClientStatusLabel, CLIENT_STATUS_LABELS } from "@/lib/coach/client-status";
import { resolveProgramTiming, describeProgramTimingForCoach } from "@/lib/scheduling/program-timing";
import { formatLongDateLabel } from "@/lib/shared/local-date";
import { ONBOARDING_STEPS } from "@/lib/coach/onboarding-steps";
import { describePrimaryGoal, NOT_PROVIDED } from "@/lib/coach/onboarding-format";
import type { useCoachClientView } from "@/hooks/use-coach-data";
import type { BadgeTone } from "@/components/progress/status-badge";

type CoachClientView = ReturnType<typeof useCoachClientView>;

const STATUS_TONE: Record<string, BadgeTone> = { scheduled: "brass", on_track: "success", monitoring: "warning", needs_attention: "error" };

/**
 * The approved, ongoing Client Workspace (spec §5) for an active client —
 * replaces the activation-heavy layout entirely once a client is active.
 *
 * Gate 4B — three tiers of hierarchy, not one flat stack of equally-weighted
 * cards: (1) identity + what's happening + anything to do right now (header,
 * Coach Brief, Active coach actions, Daily Briefing) is the first thing a
 * coach sees; (2) "Snapshot" groups Today/Trends/Recent decisions as one
 * quieter, still-always-visible answer to "what should I inspect next";
 * (3) Program/Nutrition/Conversation/AI Authority stay one click away in
 * "More," never competing with either tier above. Nothing in tiers 2-3 is
 * hidden by default logic — only visual weight and grouping changed; every
 * card here is the exact same component reading the exact same real data as
 * before this pass.
 */
export function ClientWorkspace({ view, onChanged }: { view: CoachClientView; onChanged: () => void }) {
  const router = useRouter();
  const { setActiveClientId } = usePrototypeState();
  const [moreOpen, setMoreOpen] = useState(false);
  const { client, clientAppState, chatMessages, attentionQueue, coachId, workspaceId, platform } = view;

  // Every hook below must run on every render regardless of whether this
  // client turns out to be renderable (rules of hooks) — computed
  // defensively so the early return can come after them.
  //
  // Phase 5.6A.4 — computed once here and reused for the status badge and
  // the coach brief below, rather than each re-deriving its own timing
  // check — the exact "one shared source of truth" pattern the client-side
  // pre-start pages also follow (see lib/scheduling/program-timing.ts).
  const timing = clientAppState ? resolveProgramTiming(clientAppState.programEnrollment, clientAppState.dateIso) : null;
  const programWeekLabel =
    clientAppState && timing
      ? describeProgramTimingForCoach(timing, clientAppState.programEnrollment.durationWeeks, new Date(`${clientAppState.programEnrollment.startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }))
      : null;
  const startDateFullLabel = clientAppState ? formatLongDateLabel(clientAppState.programEnrollment.startDateIso) : null;
  const { brief, refresh } = useCoachBrief(view, programWeekLabel, timing, startDateFullLabel);

  if (!client || !clientAppState || !coachId) return null;

  const statusLabel = resolveClientStatusLabel(client.id, attentionQueue, timing?.phase === "pre_program");
  // Phase 5.6A.4 — the real submitted primary goal (see
  // lib/coach/activation-generation.ts's extractClientSnapshot, which reads
  // this exact same source for plan generation), never the stale
  // `client.goal` field — that field is only ever initialized to "" at
  // "Add client" time (see add-client-sheet.tsx) and nothing ever writes
  // it again after onboarding, so it can never reflect the client's real
  // answer.
  const goals = view.onboarding?.answers.what_you_want;
  const goalLabel = goals ? describePrimaryGoal(ONBOARDING_STEPS, goals) : NOT_PROVIDED;

  const thisClientItems = attentionQueue.filter((i) => i.clientId === client.id && i.status !== "resolved");
  const resolvedReviews = clientAppState.reviewRequests.filter((r) => r.status === "resolved");
  const performanceFlags = clientAppState.reviewRequests.filter((r) => r.kind === "rpe-anomaly" || r.kind === "performance-pattern");
  const latestPublishedBriefing = view.dailyBriefing && (view.dailyBriefing.status === "published" || view.dailyBriefing.status === "auto_published") ? view.dailyBriefing : null;

  const coachOverride = view.activeContext.coachProfile
    ? { displayName: view.activeContext.coachProfile.displayName, avatarInitials: view.activeContext.coachProfile.avatarInitials }
    : null;

  return (
    <div className="space-y-5">
      {/* 1. Client header */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-heading text-off-white">{client.name}</h1>
          <p className="mt-0.5 text-meta text-neutral">
            {goalLabel} &middot; {programWeekLabel}
          </p>
        </div>
        {/* Gate 4B fix — min-w-0 lets this block actually shrink below its
            own unwrapped content width (the flex default is min-width:auto,
            which otherwise refuses to go below that and overflows the card);
            flex-wrap lets the badge/buttons drop onto additional rows once
            it does. Without both together, removing shrink-0 alone has no
            effect: a row of buttons has no compressible content, so the
            block still couldn't shrink to fit. Same actions, same order,
            same destinations — only how they lay out at narrow widths. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge label={CLIENT_STATUS_LABELS[statusLabel]} tone={STATUS_TONE[statusLabel]} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Acceptance-recovery pass — the one explicit, deterministic
              // way a coach previews THIS exact client's real /today, tied
              // to this client's own real id (never a silent fallback to
              // whichever client this browser happened to be "acting as"
              // before). setActiveClientId hydrates that client's own real
              // AppState synchronously before we navigate, so /today never
              // has a stale/wrong client's data to render.
              setActiveClientId(client.id);
              router.push("/today");
            }}
          >
            <Eye size={14} aria-hidden="true" /> Preview Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              // Gate 4B — preselects this exact client on arrival (see
              // app/coach/messages/page.tsx's own `client` query param
              // handling) instead of dropping the coach on an empty
              // "Select a conversation" state they'd have to re-find this
              // same client from.
              router.push(`/coach/messages?client=${client.id}`)
            }
          >
            <MessageSquare size={14} aria-hidden="true" /> Message
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/coach/clients/${client.id}/activate`)}>
            <Wand2 size={14} aria-hidden="true" /> OPTIM Plan
          </Button>
        </div>
      </Card>

      {/* 2. OPTIM Coach Brief */}
      <CoachBriefCard
        brief={brief}
        kicker="OPTIM Coach Brief"
        linkedHref={`/coach/reviews`}
        linkedLabel="Open the flagged item"
        onRefresh={refresh}
      />

      {/* 3. Active coach actions */}
      <section className="space-y-2">
        <p className="text-subheading text-off-white">Active coach actions</p>
        <ActiveCoachActions items={thisClientItems} coachId={coachId} coachName={view.activeContext.coachProfile?.displayName ?? "Your coach"} workspaceId={workspaceId} onChanged={onChanged} />
      </section>

      <DailyBriefingCard
        clientAppState={clientAppState}
        briefing={view.dailyBriefing}
        coachId={coachId}
        coachName={view.activeContext.coachProfile?.displayName ?? "Your coach"}
        automation={view.effectiveBriefingAutomation}
        onSave={(record) => view.dispatchPlatform({ type: "SAVE_DAILY_BRIEFING", record })}
      />

      {/* 4-6. Snapshot — Today, trends, and recent decisions read together as
          one quieter answer to "what should I inspect next," never three
          unrelated top-level cards competing with what's actionable above. */}
      <section className="space-y-3">
        <p className="text-label text-neutral">Snapshot</p>
        <ClientTodaySummary clientAppState={clientAppState} monitoredItems={thisClientItems} />
        <ClientTrends clientAppState={clientAppState} coachDisplayName={view.activeContext.coachProfile?.displayName ?? "your coach"} recentPerformanceFlags={performanceFlags} />
        <RecentDecisions resolvedReviews={resolvedReviews} latestPublishedBriefing={latestPublishedBriefing} />
      </section>

      {/* Deeper sections — never competing with the overview. */}
      <div>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-off-white hover:bg-surface-input"
        >
          More: conversation, training program, nutrition plan, meal recommendations, AI authority
          {moreOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {moreOpen ? (
          <div className="mt-3 space-y-4">
            {/* Gate 4B — the manual week-by-week editor (distinct from the
                real "OPTIM Plan" generation/approval system linked above);
                kept discoverable but no longer an equally-weighted header
                button, since it edits the same assignedProgram field through
                a separate, uncoordinated path (see Gate 4A's own finding) —
                a deeper Gate 4D concern, not something this pass resolves. */}
            <Link
              href={`/coach/clients/${client.id}/setup/training`}
              className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm text-off-white hover:bg-surface-input"
            >
              <span className="flex items-center gap-2">
                <ClipboardList size={14} className="text-neutral" aria-hidden="true" /> Manually edit training program
              </span>
              <ChevronRight size={14} className="text-neutral" aria-hidden="true" />
            </Link>

            <Card>
              <p className="text-subheading text-off-white">Conversation</p>
              <div className="mt-3 max-h-[360px] space-y-1 overflow-y-auto rounded-[var(--radius-md)] bg-surface-input p-3">
                {chatMessages.length === 0 ? (
                  <p className="text-sm text-neutral">No messages yet.</p>
                ) : (
                  chatMessages.map((message) => (
                    <MessageBubble key={message.id} message={message} coachOverride={coachOverride} clientAvatarInitialsOverride={client.avatarInitials} />
                  ))
                )}
              </div>
            </Card>

            {coachId ? (
              <CoachMealPlanCard
                clientId={client.id}
                clientAppState={clientAppState}
                coachId={coachId}
                coachName={view.activeContext.coachProfile?.displayName ?? "Coach"}
                onChanged={onChanged}
              />
            ) : null}

            {coachId ? (
              <MealRecommendationAssignmentCard
                clientId={client.id}
                clientFirstName={client.name.split(" ")[0]}
                recommendations={platform.mealRecommendations.filter((r) => r.coachId === coachId && r.status === "active")}
                onToggle={(recommendationId, assigned) => view.dispatchPlatform({ type: "SET_MEAL_RECOMMENDATION_ASSIGNMENT", recommendationId, coachId, clientId: client.id, assigned })}
              />
            ) : null}

            <AiAuthorityClientOverrideCard clientId={client.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
