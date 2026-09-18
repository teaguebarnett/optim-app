"use client";

// Phase 6.0D-A — moved verbatim from app/coach/page.tsx (byte-for-byte
// unchanged behavior) so /coach can branch on resolveAppMode() and render
// this demo dashboard or the real Supabase-mode one
// (components/coach/live-coach-dashboard.tsx) from a single Server
// Component entry point, exactly like Phase 6.0C's app/(client)/chat/page.tsx
// split. Every hook and helper below still reads only the demo prototype's
// localStorage-backed state (usePrototypeState/usePlatformState via
// useCoachWorkspace/useAiAuthority) — nothing here was touched.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { DecisionFocusSurface } from "@/components/coach/decision-focus-surface";
import { DecisionQueueRows } from "@/components/coach/decision-queue-rows";
import { PersonalTouchList } from "@/components/coach/personal-touch-list";
import { DailyBriefingsSummaryList } from "@/components/coach/daily-briefings-summary-list";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { getClientLifecycle } from "@/lib/coach/repository";
import { resolveProgramTiming, describeProgramTimingForCoach } from "@/lib/scheduling/program-timing";
import { buildRosterPulse, timeOfDayForHour, SECONDARY_SECTION_ORDER } from "@/lib/coach/command-center";
import { attentionBucketForItem } from "@/lib/coach/attention-queue";
import { resolveClientLocalDateIso } from "@/lib/shared/local-date";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { ProgramPhase } from "@/lib/scheduling/types";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DemoCoachDashboard() {
  const workspace = useCoachWorkspace();
  const coachFirstName = workspace.activeContext.coachProfile?.displayName?.split(" ")[0] ?? "there";
  const coachName = workspace.activeContext.coachProfile?.displayName ?? "Your coach";
  const today = new Date();
  const nowIso = today.toISOString();
  const timeOfDay = timeOfDayForHour(today.getHours());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, forceRerender] = useState(0);
  const onChanged = () => forceRerender((n) => n + 1);

  // Spec §2/§3 — the same real attentionQueue, split into the buckets the
  // command center's zones need. A "waiting" item whose own resurface time
  // has arrived reads as needs_attention here automatically (see
  // attentionBucketForItem) — no separate resurfacing job required. The
  // "waiting" bucket itself has its own full surface at /coach/reviews
  // (Waiting tab) — Phase 13A.1 stops duplicating it here.
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
  // Phase 5.6A.4 — an "active" lifecycle client whose approved program
  // hasn't reached its own start date yet is never counted "on track" (see
  // buildRosterPulse's own doc); still the one shared derivation the
  // Clients page filters use.
  const programPhaseByClientId = new Map<string, ProgramPhase | null>();
  for (const client of workspace.clients) {
    const appState = workspace.clientAppStates.get(client.id);
    if (!appState) continue;
    programPhaseByClientId.set(client.id, resolveProgramTiming(appState.programEnrollment, appState.dateIso).phase);
  }
  const rosterPulse = buildRosterPulse(
    workspace.clients.map((c) => c.id),
    lifecycleByClientId,
    needsCoachClientIds,
    programPhaseByClientId
  );
  const clientNameById = new Map(workspace.clients.map((c) => [c.id, c.name]));

  const briefingsNeedingAction = workspace.briefings.filter((b) => b.status === "draft" || b.status === "held_for_review");
  const worthKnowingCount = personalTouchItems.length + briefingsNeedingAction.length;

  // Phase 13A.1 — conceptual sufficiency: the default surface shows only
  // the single highest-priority "worth knowing" object (never a feed of
  // every observation), chosen by the same real time-of-day ordering the
  // command center already used ("briefings" leads in the morning,
  // "personal_touch" leads midday/evening — see SECONDARY_SECTION_ORDER).
  let topWorthKnowing: ReactNode = null;
  for (const id of SECONDARY_SECTION_ORDER[timeOfDay]) {
    if (id === "briefings" && briefingsNeedingAction.length > 0) {
      topWorthKnowing = <DailyBriefingsSummaryList briefings={[briefingsNeedingAction[0]]} clientNameById={clientNameById} />;
      break;
    }
    if (id === "personal_touch" && personalTouchItems.length > 0) {
      topWorthKnowing = (
        <PersonalTouchList items={[personalTouchItems[0]]} coachId={workspace.coachId ?? ""} coachName={coachName} workspaceId={workspace.workspaceId} onChanged={onChanged} />
      );
      break;
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] space-y-10">
      <div>
        <p className="text-label text-accent-strong">{today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="mt-1 text-display text-off-white">
          {greetingForHour(today.getHours())}, {coachFirstName}.
        </h1>
      </div>

      {/* One composition, three zones on the same baseline — never a wide
          dominant column with a narrow leftover rail beside it. Needs You
          still owns most of the width (and, with a real decision, the only
          real height), but Worth Knowing and Handled sit at the same top
          edge as genuine siblings, not stacked afterthoughts, so the row
          reads as one deliberate group even when every count is small. */}
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_200px_200px] lg:items-start">
        {/* NEEDS YOU — the dominant working surface. Zero is a complete,
            self-sufficient state (conceptual sufficiency); a real decision
            is the one genuinely expanded object, the rest compact rows —
            actions only ever appear on the focused item. */}
        <section className="min-w-0">
          <p className="text-label text-neutral">Needs You</p>
          {focusItem ? (
            <div className="mt-2 space-y-4">
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
            </div>
          ) : (
            <p className="mt-2 text-metric text-off-white">0</p>
          )}
        </section>

        {/* WORTH KNOWING — quieter secondary territory: a smaller number,
            plain body text, at most one real object beneath it. */}
        <section className="min-w-0">
          <p className="text-label text-neutral">Worth Knowing</p>
          <p className="mt-2 text-heading text-off-white">{worthKnowingCount}</p>
          {topWorthKnowing ? <div className="mt-3">{topWorthKnowing}</div> : null}
        </section>

        {/* HANDLED — recessive/ambient: smaller still, muted color. A
            nonzero count is a real link into the roster it's counting
            (a quiet underline, not a button), so "what got handled" stays
            one click away without ever becoming a list here. */}
        <section className="min-w-0">
          <p className="text-label text-neutral">Handled</p>
          <Link
            href="/coach/clients"
            className="mt-2 inline-block text-subheading text-neutral underline decoration-border-strong underline-offset-4 transition-colors hover:text-off-white hover:decoration-off-white"
          >
            {rosterPulse.onTrack}
          </Link>
        </section>
      </div>
    </div>
  );
}
