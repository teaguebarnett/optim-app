"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePrototypeState } from "./use-prototype-state";
import { buildProgressDashboard } from "@/lib/progress/build-dashboard";
import { buildDemoCheckInScheduleConfig } from "@/lib/scheduling/check-in";
import { getFixtureHistoryStore, getLiveHistoryStore } from "@/lib/history/local-storage-history-store";
import type { ProgressDashboardModel, ProgressSource } from "@/lib/progress/types";

export interface UseProgressDashboardResult {
  dashboard: ProgressDashboardModel;
  source: ProgressSource;
  /** True only outside a production build — the ?demo=1 query param is
   * ignored entirely in production, so demo mode can never reach real
   * clients. */
  isDemoAvailable: boolean;
}

/**
 * Resolves live-vs-demo source (see the Settings "Preview demo progress"
 * control) and assembles the one ProgressDashboardModel the page renders.
 * The only place app/progress/page.tsx touches a HistoryStore — every card
 * component downstream receives an already-derived view model.
 */
export function useProgressDashboard(): UseProgressDashboardResult {
  const { state, activeContext } = usePrototypeState();
  const searchParams = useSearchParams();
  const isDemoAvailable = process.env.NODE_ENV !== "production";
  const requestedDemo = searchParams.get("demo") === "1";
  const source: ProgressSource = isDemoAvailable && requestedDemo ? "fixture" : "live";

  const dashboard = useMemo(() => {
    const store = source === "fixture" ? getFixtureHistoryStore() : getLiveHistoryStore();
    const scope = {
      workspaceId: state.workspaceId,
      clientId: state.clientId,
      enrollmentId: state.programEnrollment.id,
    };
    // Fixture/demo mode keeps demonstrating the full check-in card
    // lifecycle with an example weekly schedule; live mode reflects the
    // client's real (currently unassigned) checkInSchedule — see
    // AppState.checkInSchedule's doc and lib/progress/build-dashboard.ts.
    const checkInSchedule =
      source === "fixture"
        ? buildDemoCheckInScheduleConfig({
            workspaceId: state.workspaceId,
            clientId: state.clientId,
            enrollmentId: state.programEnrollment.id,
            timeZone: state.programEnrollment.timeZone,
            now: new Date(),
          })
        : state.checkInSchedule;

    return buildProgressDashboard({
      store,
      scope,
      source,
      effectiveDateIso: state.dateIso,
      enrollment: state.programEnrollment,
      checkInSchedule,
      liveState: source === "live" ? state : null,
      coachDisplayName: activeContext.primaryCoach?.displayName ?? "your coach",
      chatMessages: source === "live" ? state.chatMessages : [],
      now: new Date(),
    });
  }, [state, source, activeContext.primaryCoach?.displayName]);

  return { dashboard, source, isDemoAvailable };
}
