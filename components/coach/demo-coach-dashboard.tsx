"use client";

// Phase 6.0D-A — moved verbatim from app/coach/page.tsx (byte-for-byte
// unchanged behavior) so /coach can branch on resolveAppMode() and render
// this demo dashboard or the real Supabase-mode one
// (components/coach/live-coach-dashboard.tsx) from a single Server
// Component entry point, exactly like Phase 6.0C's app/(client)/chat/page.tsx
// split. Every hook and helper below still reads only the demo prototype's
// localStorage-backed state (usePrototypeState/usePlatformState via
// useCoachWorkspace/useAiAuthority) — nothing here was touched.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Sparkles, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/coach/section-header";
import { DecisionFocusSurface } from "@/components/coach/decision-focus-surface";
import { DecisionQueueRows } from "@/components/coach/decision-queue-rows";
import { PersonalTouchList } from "@/components/coach/personal-touch-list";
import { WaitingList } from "@/components/coach/waiting-list";
import { ReviewDetailSheet } from "@/components/coach/review-detail-sheet";
import { DailyBriefingsSummaryList } from "@/components/coach/daily-briefings-summary-list";
import { RosterPulseCard } from "@/components/coach/roster-pulse-card";
import { AiAuthorityRailCard } from "@/components/coach/ai-authority-rail-card";
import { CalibrateOptimBanner } from "@/components/coach/calibrate-optim-banner";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { AddClientSheet } from "@/components/coach/add-client-sheet";
import { Button } from "@/components/ui/button";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { useAiAuthority } from "@/hooks/use-ai-authority";
import { getClientLifecycle } from "@/lib/coach/repository";
import { resolveProgramTiming, describeProgramTimingForCoach } from "@/lib/scheduling/program-timing";
import { buildRosterPulse, buildUpcomingWork, timeOfDayForHour, SECONDARY_SECTION_ORDER } from "@/lib/coach/command-center";
import { attentionBucketForItem } from "@/lib/coach/attention-queue";
import { resolveEffectiveAiAuthorityLevel, AI_AUTHORITY_LEVEL_LABELS } from "@/lib/coach/ai-authority";
import { resolveClientLocalDateIso, formatLongDateLabel } from "@/lib/shared/local-date";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { ProgramPhase } from "@/lib/scheduling/types";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DemoCoachDashboard() {
  const workspace = useCoachWorkspace();
  const { settings: aiSettings, setGlobal } = useAiAuthority();
  const coachFirstName = workspace.activeContext.coachProfile?.displayName?.split(" ")[0] ?? "there";
  const coachName = workspace.activeContext.coachProfile?.displayName ?? "Your coach";
  const today = new Date();
  const nowIso = today.toISOString();
  const timeOfDay = timeOfDayForHour(today.getHours());
  const [addClientOpen, setAddClientOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [waitingSelectedId, setWaitingSelectedId] = useState<string | null>(null);
  const [, forceRerender] = useState(0);
  const onChanged = () => forceRerender((n) => n + 1);

  // Spec §2/§3 — the same real attentionQueue, split into the buckets the
  // five-section hierarchy needs. A "waiting" item whose own resurface time
  // has arrived reads as needs_attention here automatically (see
  // attentionBucketForItem) — no separate resurfacing job required.
  const buckets = new Map<string, AttentionQueueItem[]>([
    ["needs_attention", []],
    ["worth_personal_touch", []],
    ["waiting", []],
  ]);
  for (const item of workspace.attentionQueue) {
    buckets.get(attentionBucketForItem(item, nowIso))!.push(item);
  }
  const queue = buckets.get("needs_attention")!;
  const personalTouchItems = buckets.get("worth_personal_touch")!;
  const waitingItems = buckets.get("waiting")!;
  const waitingSelected = waitingSelectedId ? (workspace.reviewQueueItems.find((i) => i.reviewRequestId === waitingSelectedId) ?? null) : null;

  const focusItem = queue.find((i) => i.reviewRequestId === selectedId) ?? queue[0] ?? null;
  const remainingItems = focusItem ? queue.filter((i) => i.reviewRequestId !== focusItem.reviewRequestId) : [];

  const focusClient = focusItem ? workspace.clients.find((c) => c.id === focusItem.clientId) : undefined;
  const focusProgramLabel = useMemo(() => {
    if (!focusItem) return null;
    const appState = workspace.clientAppStates.get(focusItem.clientId);
    if (!appState) return null;
    const todayIsoForClient = resolveClientLocalDateIso(new Date(), appState.programEnrollment.timeZone);
    const timing = resolveProgramTiming(appState.programEnrollment, todayIsoForClient);
    const startLabel = new Date(`${appState.programEnrollment.startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return describeProgramTimingForCoach(timing, appState.programEnrollment.durationWeeks, startLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItem?.clientId, workspace.clientAppStates]);

  const clientsWithLifecycle = workspace.clients.map((client) => ({ client, lifecycle: getClientLifecycle(workspace.platform, client.id) }));
  const lifecycleByClientId = new Map(clientsWithLifecycle.map(({ client, lifecycle }) => [client.id, lifecycle]));
  const needsCoachClientIds = new Set(workspace.attentionQueue.map((i) => i.clientId));
  // Phase 5.6A.4 — the one shared program-timing derivation, computed once
  // per client here and reused for both the roster pulse (so a scheduled
  // launch never inflates "On track") and "Next up" (so it never claims
  // the pipeline is clear while a scheduled launch is still coming).
  const programPhaseByClientId = new Map<string, ProgramPhase | null>();
  const scheduledStartLabelByClientId = new Map<string, string>();
  for (const client of workspace.clients) {
    const appState = workspace.clientAppStates.get(client.id);
    if (!appState) continue;
    const timing = resolveProgramTiming(appState.programEnrollment, appState.dateIso);
    programPhaseByClientId.set(client.id, timing.phase);
    if (timing.phase === "pre_program") {
      scheduledStartLabelByClientId.set(client.id, formatLongDateLabel(appState.programEnrollment.startDateIso));
    }
  }
  const rosterPulse = buildRosterPulse(
    workspace.clients.map((c) => c.id),
    lifecycleByClientId,
    needsCoachClientIds,
    programPhaseByClientId
  );
  const upcomingWork = buildUpcomingWork(workspace.clients, lifecycleByClientId, scheduledStartLabelByClientId).slice(0, 5);
  const globalAiLevel = resolveEffectiveAiAuthorityLevel(aiSettings, null);
  const clientNameById = new Map(workspace.clients.map((c) => [c.id, c.name]));

  const briefingsNeedingAction = workspace.briefings.filter((b) => b.status === "draft" || b.status === "held_for_review").length;
  const worthKnowingCount = personalTouchItems.length + briefingsNeedingAction;
  const summaryParts = [
    `${workspace.clients.length} active client${workspace.clients.length === 1 ? "" : "s"}`,
    queue.length > 0 ? `${queue.length} need${queue.length === 1 ? "s" : ""} you` : null,
    worthKnowingCount > 0 ? `${worthKnowingCount} worth knowing` : null,
  ].filter(Boolean);
  const summaryLine = `${summaryParts.join(". ")}. Everything else is on track.`;

  // Worth Knowing keeps only the two zones that carry real informational
  // content ("briefings", "personal_touch"); "Waiting" moves to the
  // recessive Handled zone below (already-acted-on, dormant work), but its
  // relative time-of-day ordering against the other two is preserved.
  const worthKnowingOrder = SECONDARY_SECTION_ORDER[timeOfDay].filter((id) => id !== "waiting");

  const sections = {
    briefings: (
      <section key="briefings" className="space-y-3">
        <SectionHeader
          title="Daily Briefings"
          action={
            <Link href="/coach/settings" className="flex items-center gap-1 text-action text-accent-strong hover:underline">
              Automation settings <ArrowRight size={13} />
            </Link>
          }
        />
        <DailyBriefingsSummaryList briefings={workspace.briefings} clientNameById={clientNameById} />
        {workspace.briefings.filter((b) => b.status === "draft" || b.status === "held_for_review").length === 0 ? (
          <p className="px-1 text-meta text-neutral">No briefings currently need your review.</p>
        ) : null}
      </section>
    ),
    personal_touch: (
      <section key="personal_touch" className="space-y-3">
        <SectionHeader title="Worth a Personal Touch" />
        {personalTouchItems.length === 0 ? (
          <p className="px-1 text-meta text-neutral">Nothing to celebrate yet today — check back after training windows close.</p>
        ) : (
          <PersonalTouchList items={personalTouchItems} coachId={workspace.coachId ?? ""} coachName={coachName} workspaceId={workspace.workspaceId} onChanged={onChanged} />
        )}
      </section>
    ),
    waiting: (
      <section key="waiting" className="space-y-3">
        <SectionHeader title="Waiting" />
        {waitingItems.length === 0 ? (
          <p className="px-1 text-meta text-neutral">Nothing waiting on someone else right now.</p>
        ) : (
          <WaitingList items={waitingItems} onSelect={(item) => setWaitingSelectedId(item.reviewRequestId)} />
        )}
      </section>
    ),
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-8">
      {/* System row — honest operational state, never a fabricated automation count. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-charcoal px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2 text-neutral">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            Workspace operating normally
          </span>
          <span className="text-neutral">
            AI Authority: <span className="font-semibold text-off-white">{AI_AUTHORITY_LEVEL_LABELS[globalAiLevel]}</span>
          </span>
          <span className="text-neutral">No automated actions logged yet</span>
        </div>
        <Button size="sm" onClick={() => setAddClientOpen(true)}>
          <UserPlus size={15} aria-hidden="true" />
          Add client
        </Button>
      </div>

      <CalibrateOptimBanner />

      {/* Greeting + roster-state sentence — the one restrained orientation
          line; no giant hero section. */}
      <div>
        <p className="text-label text-accent-strong">{today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="mt-1 text-display text-off-white">
          {greetingForHour(today.getHours())}, {coachFirstName}.
        </h1>
        <p className="mt-1.5 text-body text-neutral">{summaryLine}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* NEEDS YOU — the dominant working surface (spec §2): the one
            genuinely expanded decision, plus the rest of the queue as
            compact rows. A calm, compact all-clear otherwise, never a
            giant empty alert container. */}
        <section className="min-w-0 space-y-4">
          <SectionHeader title="Needs You" />
          {focusItem ? (
            <>
              <div key={focusItem.reviewRequestId} className="pc-row-promote">
                <DecisionFocusSurface
                  item={focusItem}
                  client={focusClient}
                  coachId={workspace.coachId ?? ""}
                  coachName={coachName}
                  workspaceId={workspace.workspaceId}
                  programContextLabel={focusProgramLabel}
                  onChanged={onChanged}
                />
              </div>
              <DecisionQueueRows items={remainingItems} selectedId={selectedId} onSelect={setSelectedId} />
            </>
          ) : (
            <Card className="flex items-center gap-2.5 py-4">
              <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden="true" />
              <p className="text-sm text-neutral">All clear. No clients currently require your decision.</p>
            </Card>
          )}
        </section>

        {/* Right rail — WORTH KNOWING (quiet secondary intelligence,
            reordered by real time of day) above HANDLED (recessive, calm
            confirmation of what OPTIM already has under control). */}
        <div className="space-y-6">
          <section className="space-y-6">
            <SectionHeader title="Worth Knowing" />
            {worthKnowingOrder.map((id) => sections[id])}
          </section>

          <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface-raised p-4">
            <div>
              <p className="text-label text-neutral">Handled</p>
              <div className="mt-3">
                <RosterPulseCard pulse={rosterPulse} />
              </div>
            </div>

            {waitingItems.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-label text-neutral">Waiting</p>
                <WaitingList items={waitingItems} onSelect={(item) => setWaitingSelectedId(item.reviewRequestId)} />
              </div>
            )}

            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-label text-neutral">Pipeline</p>
                <Link href="/coach/clients" className="flex items-center gap-1 text-action text-accent-strong hover:underline">
                  All clients <ArrowRight size={13} />
                </Link>
              </div>
              {upcomingWork.length === 0 ? (
                <p className="text-meta text-neutral">Nothing in onboarding, setup, or awaiting activation.</p>
              ) : (
                <div className="space-y-0.5">
                  {upcomingWork.map((row) => (
                    <Link key={row.clientId} href={`/coach/clients/${row.clientId}`} className="flex items-center gap-3 rounded-[var(--radius-sm)] px-1.5 py-2 transition-colors hover:bg-charcoal" style={{ transitionDuration: "var(--motion-fast)" }}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${row.readyToActivate ? "bg-warning-soft text-warning" : row.startsLabel ? "bg-brass-soft text-brass-strong" : "bg-accent-soft text-accent-strong"}`}>
                        {row.readyToActivate ? <Sparkles size={13} aria-hidden="true" /> : row.startsLabel ? <CalendarClock size={13} aria-hidden="true" /> : <ClipboardCheck size={13} aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-off-white">{row.clientName}</p>
                        {row.startsLabel ? <p className="truncate text-meta text-neutral">Starts {row.startsLabel}</p> : null}
                      </div>
                      <LifecycleBadge lifecycle={row.lifecycle} programPhase={row.startsLabel ? "pre_program" : undefined} className="shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-label text-neutral">AI Coaching Authority</p>
              <AiAuthorityRailCard level={globalAiLevel} onChange={(level) => setGlobal({ level, domainOverrides: aiSettings.global.domainOverrides })} />
            </div>
          </section>
        </div>
      </div>

      <AddClientSheet open={addClientOpen} onClose={() => setAddClientOpen(false)} />

      {workspace.coachId ? (
        <ReviewDetailSheet item={waitingSelected} coachId={workspace.coachId} coachName={coachName} onClose={() => setWaitingSelectedId(null)} onChanged={onChanged} />
      ) : null}
    </div>
  );
}
