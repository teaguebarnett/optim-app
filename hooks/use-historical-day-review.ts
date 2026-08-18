"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePrototypeState } from "./use-prototype-state";
import { buildHistoricalDayReview, buildHistoryDayPickerEntries } from "@/lib/progress/build-historical-day";
import { getFixtureHistoryStore, getLiveHistoryStore } from "@/lib/history/local-storage-history-store";
import type { HistoricalDayLookupResult, HistoryDayPickerEntryModel } from "@/lib/progress/types";

/**
 * Resolves the same live-vs-demo source as useProgressDashboard (the
 * ?demo=1 query param, ignored outside dev) so a day picked from the demo
 * Progress preview opens the matching demo day here, never accidentally
 * looking up (or leaking into) the client's real live history.
 */
function useHistorySource() {
  const { state } = usePrototypeState();
  const searchParams = useSearchParams();
  const isDemoAvailable = process.env.NODE_ENV !== "production";
  const requestedDemo = searchParams.get("demo") === "1";
  const source = isDemoAvailable && requestedDemo ? ("fixture" as const) : ("live" as const);
  return { state, source };
}

export function useHistoricalDayReview(requestedDateIso: string): HistoricalDayLookupResult {
  const { state, source } = useHistorySource();

  return useMemo(() => {
    const store = source === "fixture" ? getFixtureHistoryStore() : getLiveHistoryStore();
    const scope = { workspaceId: state.workspaceId, clientId: state.clientId, enrollmentId: state.programEnrollment.id };
    return buildHistoricalDayReview({
      store,
      scope,
      source,
      effectiveDateIso: state.dateIso,
      enrollment: state.programEnrollment,
      liveState: source === "live" ? state : null,
      requestedDateIso,
    });
  }, [state, source, requestedDateIso]);
}

export interface UseHistoryDayPickerResult {
  entries: HistoryDayPickerEntryModel[];
  /** Query string to append when navigating into a review, so demo mode
   * carries through (e.g. "?demo=1", or "" in live mode). */
  demoQuery: string;
}

export function useHistoryDayPicker(windowDays?: number): UseHistoryDayPickerResult {
  const { state, source } = useHistorySource();

  const entries = useMemo(() => {
    const store = source === "fixture" ? getFixtureHistoryStore() : getLiveHistoryStore();
    const scope = { workspaceId: state.workspaceId, clientId: state.clientId, enrollmentId: state.programEnrollment.id };
    return buildHistoryDayPickerEntries(
      {
        store,
        scope,
        source,
        effectiveDateIso: state.dateIso,
        enrollment: state.programEnrollment,
        liveState: source === "live" ? state : null,
      },
      windowDays
    );
  }, [state, source, windowDays]);

  return { entries, demoQuery: source === "fixture" ? "?demo=1" : "" };
}
