"use server";

// Gate 6D — the client-callable surface over lib/production/daily-activity.ts,
// mirroring app/actions/coach-roster.ts's own "thin pass-through, no logic
// here" discipline.

import { getRecentActivityForClient, type RecentActivityDay } from "@/lib/production/daily-activity";

export async function getRecentActivityAction(clientProfileId: string): Promise<RecentActivityDay[]> {
  return getRecentActivityForClient(clientProfileId);
}
