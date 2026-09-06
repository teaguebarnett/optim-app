"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ClipboardList, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
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
import { useCoachBrief } from "@/hooks/use-coach-brief";
import { resolveClientStatusLabel, CLIENT_STATUS_LABELS } from "@/lib/coach/client-status";
import { resolveProgramTiming, describeProgramTimingForCoach } from "@/lib/scheduling/program-timing";
import type { useCoachClientView } from "@/hooks/use-coach-data";
import type { BadgeTone } from "@/components/progress/status-badge";

type CoachClientView = ReturnType<typeof useCoachClientView>;

const STATUS_TONE: Record<string, BadgeTone> = { on_track: "success", monitoring: "warning", needs_attention: "error" };

/**
 * The approved, ongoing Client Workspace (spec §5) for an active client —
 * replaces the activation-heavy layout entirely once a client is active.
 * Progressive disclosure: the overview (header, Coach Brief, active coach
 * actions, Today, trends, recent decisions) loads first; Program/Nutrition/
 * Conversation/AI Authority stay one click away in "More," never
 * competing with the overview for attention.
 */
export function ClientWorkspace({ view, onChanged }: { view: CoachClientView; onChanged: () => void }) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const { client, clientAppState, chatMessages, attentionQueue, coachId, workspaceId, platform } = view;

  // Every hook below must run on every render regardless of whether this
  // client turns out to be renderable (rules of hooks) — computed
  // defensively so the early return can come after them.
  const programWeekLabel = clientAppState
    ? describeProgramTimingForCoach(
        resolveProgramTiming(clientAppState.programEnrollment, clientAppState.dateIso),
        clientAppState.programEnrollment.durationWeeks,
        new Date(`${clientAppState.programEnrollment.startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      )
    : null;
  const { brief, refresh } = useCoachBrief(view, programWeekLabel);

  if (!client || !clientAppState || !coachId) return null;

  const statusLabel = resolveClientStatusLabel(client.id, attentionQueue);

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
            {client.goal || "No goal on file"} &middot; {programWeekLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge label={CLIENT_STATUS_LABELS[statusLabel]} tone={STATUS_TONE[statusLabel]} />
          <Button variant="outline" size="sm" onClick={() => router.push("/coach/messages")}>
            <MessageSquare size={14} aria-hidden="true" /> Message
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/coach/clients/${client.id}/activate`)}>
            <Wand2 size={14} aria-hidden="true" /> Program Composer
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/coach/clients/${client.id}/setup/training`)}>
            <ClipboardList size={14} aria-hidden="true" /> View Program
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

      {/* 4. Today */}
      <ClientTodaySummary clientAppState={clientAppState} monitoredItems={thisClientItems} />

      {/* 5. Key trends */}
      <ClientTrends clientAppState={clientAppState} coachDisplayName={view.activeContext.coachProfile?.displayName ?? "your coach"} recentPerformanceFlags={performanceFlags} />

      {/* 6. Recent decisions */}
      <RecentDecisions resolvedReviews={resolvedReviews} latestPublishedBriefing={latestPublishedBriefing} />

      {/* Deeper sections — never competing with the overview. */}
      <div>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-off-white hover:bg-surface-input"
        >
          More: conversation, meal recommendations, AI authority
          {moreOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {moreOpen ? (
          <div className="mt-3 space-y-4">
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
