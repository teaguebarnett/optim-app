"use client";

import { TodaySessionCard } from "@/components/training/today-session-card";
import { FutureSessionCard } from "@/components/training/future-session-card";
import { PastSessionCard } from "@/components/training/past-session-card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { compareLocalDates } from "@/lib/shared/local-date";

/**
 * Training's one dominant, intelligent session surface — Phase 4.4B-1.
 * Switches on how `selectedDateIso` compares to the client's real current
 * local date (never a route, never duplicated state): today gets the full
 * training-intent-aware live surface, a later day in the week gets a
 * read-only preview, an earlier day gets a read-only historical review.
 */
export function SessionSurface({ selectedDateIso }: { selectedDateIso: string }) {
  const { state } = usePrototypeState();
  const comparison = compareLocalDates(selectedDateIso, state.dateIso);

  if (comparison === 0) return <TodaySessionCard />;
  if (comparison > 0) return <FutureSessionCard dateIso={selectedDateIso} />;
  return <PastSessionCard dateIso={selectedDateIso} />;
}
