"use client";

import { useEffect } from "react";
import { getCoachBrief } from "@/lib/coach/repository";
import { resolveActivationBrief, resolveOperatingBrief, type CoachBriefRecord } from "@/lib/coach/coach-brief-record";
import type { useCoachClientView } from "./use-coach-data";
import type { ReviewRequestKind } from "@/lib/types";

type CoachClientView = ReturnType<typeof useCoachClientView>;

/**
 * Resolves, displays, and persists the real OPTIM Coach Brief for one
 * client (spec §6) — branches on lifecycle: a pre-activation client gets
 * the Activation Brief (built from onboarding + readiness), an active
 * client gets the Operating Brief (built from what changed since the last
 * stored checkpoint). Computing a candidate record is cheap and pure (see
 * lib/coach/coach-brief-record.ts) and safe to do on every render; only the
 * ACT of persisting a genuinely changed one happens in an effect, never
 * mid-render, and never on a render where nothing real changed.
 */
export function useCoachBrief(view: CoachClientView, programWeekLabel: string | null): { brief: CoachBriefRecord | null; refresh: () => void } {
  const { client, workspaceId, coachId, platform, dispatchPlatform, lifecycle, clientAppState, onboarding, intendedProgram, readiness, attentionQueue } = view;

  const stored = client ? getCoachBrief(platform, client.id) : null;
  const nowIso = new Date().toISOString();

  let resolved: { record: CoachBriefRecord; changed: boolean } | null = null;

  if (client && coachId) {
    if (lifecycle === "active") {
      const clientFirstName = client.name.split(" ")[0];
      const unresolvedReviews = attentionQueue
        .filter((i) => i.clientId === client.id && i.status !== "resolved" && i.kind !== "milestone" && i.kind !== "health_review")
        .map((i) => ({ id: i.reviewRequestId, kind: i.kind as ReviewRequestKind, summary: i.summary }));
      const resolvedReviews = (clientAppState?.reviewRequests ?? [])
        .filter((r) => r.status === "resolved" && r.resolvedAtIso)
        .sort((a, b) => (a.resolvedAtIso! < b.resolvedAtIso! ? 1 : -1));
      const latestResolvedReview = resolvedReviews[0] ? { id: resolvedReviews[0].id, kind: resolvedReviews[0].kind, resolvedAtIso: resolvedReviews[0].resolvedAtIso! } : null;
      const clientMessages = (clientAppState?.chatMessages ?? []).filter((m) => m.sender === "client").sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));

      resolved = resolveOperatingBrief(stored, {
        clientId: client.id,
        workspaceId,
        coachId,
        clientFirstName,
        lifecycle,
        programWeekLabel,
        unresolvedReviews,
        latestResolvedReview,
        latestClientChatMessageAtIso: clientMessages[0]?.createdAtIso ?? null,
        latestWorkoutCompletedAtIso: clientAppState?.workoutSession.completedAtIso ?? null,
        latestWorkoutNeedsReview: clientAppState?.workoutSession.summary?.needsReview ?? false,
        nowIso,
      });
    } else {
      resolved = resolveActivationBrief(stored, {
        clientId: client.id,
        workspaceId,
        coachId,
        clientFirstName: client.name.split(" ")[0],
        onboarding,
        intendedProgram,
        programEnrollment: clientAppState?.programEnrollment ?? null,
        readiness,
        nowIso,
      });
    }
  }

  const changed = resolved?.changed ?? false;
  const resolvedRecordKey = resolved ? `${resolved.record.id}:${resolved.record.updatedAtIso}` : null;

  useEffect(() => {
    if (changed && resolved) dispatchPlatform({ type: "SAVE_COACH_BRIEF", record: resolved.record });
    // resolvedRecordKey changing is exactly "there's a new candidate to
    // persist" — re-running only then (never on every unrelated render)
    // keeps this a real refresh-on-change effect, not a render-time
    // regeneration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, resolvedRecordKey]);

  function refresh() {
    if (resolved) dispatchPlatform({ type: "SAVE_COACH_BRIEF", record: { ...resolved.record, updatedAtIso: new Date().toISOString() } });
  }

  return { brief: resolved?.record ?? stored, refresh };
}
