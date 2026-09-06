// Phase 5.4B — repeated-pattern escalation.
//
// The existing reducer (lib/state.ts) already creates one real ReviewRequest
// per individual event: every RPE-flagged completion, every skipped/ended-
// early workout. That per-event logic is deliberately untouched — spec §4:
// "a single routine deviation [is] handled by existing in-session logic."
// This module adds the one thing that logic doesn't do: noticing when
// several of those routine events, taken together, are a real pattern worth
// a coach's attention on their own — and synthesizing exactly one new,
// higher-visibility ReviewRequest for it, deduplicated per trailing window
// so it can never re-fire every single day the pattern remains true.
//
// Pure and deterministic: given the client's own real ReviewRequest history
// and "now," it either returns zero new records or the real ones to persist
// — never a fabricated count, never touched by anything but real prior
// escalations.

import { severityForKind } from "./review-support.ts";
import type { AttentionHistoryEntry, ReviewRequest, ReviewRequestKind } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

const PATTERN_WINDOW_DAYS = 14;
const ADHERENCE_THRESHOLD = 3;
const PERFORMANCE_THRESHOLD = 3;
const MILESTONE_STREAK_THRESHOLD = 5;

function withinTrailingWindow(candidateIso: string, nowIso: string, days: number): boolean {
  const diffMs = new Date(nowIso).getTime() - new Date(candidateIso).getTime();
  return diffMs >= 0 && diffMs <= days * 86_400_000;
}

/** A stable once-per-ISO-week bucket, e.g. "2026-W36" — used as the
 * sourceEventId suffix so a pattern that's still true on day 2 of the same
 * week never creates a second card; a genuinely NEW week of the same
 * pattern recurring does get its own (the coach should see that it didn't
 * resolve). */
function isoWeekBucket(iso: string): string {
  const date = new Date(iso);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface EscalationContext {
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  assignedCoachId: CoachProfileId;
  /** This client's full, real review-request history, already including
   * whatever event just triggered this check. */
  reviewRequests: ReviewRequest[];
  nowIso: string;
  nextId: () => string;
}

function buildHistoryEntry(nowIso: string, action: string): AttentionHistoryEntry {
  return { id: `${nowIso}-created`, atIso: nowIso, actorType: "optim", actorLabel: "OPTIM", action };
}

function buildPatternReview(
  ctx: EscalationContext,
  kind: ReviewRequestKind,
  sourceEventId: string,
  summary: string,
  escalationReason: string,
  recommendedNextAction: string
): ReviewRequest {
  const nowIso = ctx.nowIso;
  return {
    id: ctx.nextId(),
    workspaceId: ctx.workspaceId,
    clientId: ctx.clientId,
    assignedCoachId: ctx.assignedCoachId,
    kind,
    severity: severityForKind(kind),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    summary,
    status: "needs_review",
    resolved: false,
    sourceEventId,
    escalationReason,
    optimActionsTaken: ["Logged each individual occurrence for your review.", "Made no programming or scheduling change on its own."],
    recommendedNextAction,
    clientNotificationRequired: true,
    responseRequiredFromClient: false,
    history: [buildHistoryEntry(nowIso, "Escalated a repeated pattern for coach review.")],
  };
}

/**
 * Scans this client's real review-request history for the two repeated
 * patterns spec §4 calls out (repeated non-adherence, repeated RPE/
 * performance mismatch), and — only when BOTH are true in the same window —
 * synthesizes one combined "recovery-deterioration" item instead of two
 * separate ones, per §4's "meaningful multi-signal deterioration" framing.
 * Returns only genuinely NEW records; the caller appends them alongside
 * whatever event-level review it just created.
 */
export function detectPatternEscalations(ctx: EscalationContext): ReviewRequest[] {
  const own = ctx.reviewRequests.filter((r) => r.workspaceId === ctx.workspaceId && r.clientId === ctx.clientId);
  const recentSkips = own.filter((r) => r.kind === "workout-skipped" && withinTrailingWindow(r.createdAtIso, ctx.nowIso, PATTERN_WINDOW_DAYS));
  const recentRpe = own.filter((r) => r.kind === "rpe-anomaly" && withinTrailingWindow(r.createdAtIso, ctx.nowIso, PATTERN_WINDOW_DAYS));

  const adherencePattern = recentSkips.length >= ADHERENCE_THRESHOLD;
  const performancePattern = recentRpe.length >= PERFORMANCE_THRESHOLD;
  if (!adherencePattern && !performancePattern) return [];

  const weekBucket = isoWeekBucket(ctx.nowIso);
  const alreadyExists = (kind: ReviewRequestKind, sourceEventId: string) => own.some((r) => r.kind === kind && r.sourceEventId === sourceEventId);
  const created: ReviewRequest[] = [];

  if (adherencePattern && performancePattern) {
    const sourceEventId = `recovery-deterioration-${weekBucket}`;
    if (!alreadyExists("recovery-deterioration", sourceEventId)) {
      created.push(
        buildPatternReview(
          ctx,
          "recovery-deterioration",
          sourceEventId,
          `${recentSkips.length} missed/ended-early sessions and ${recentRpe.length} abnormal RPE flags in the last ${PATTERN_WINDOW_DAYS} days.`,
          "Two independent signals — adherence and effort/RPE — deteriorated together in the same window. That's a pattern, not a single off day.",
          "A direct check-in; consider whether the current plan still fits their real capacity right now."
        )
      );
    }
    return created;
  }

  if (adherencePattern) {
    const sourceEventId = `adherence-pattern-${weekBucket}`;
    if (!alreadyExists("adherence-pattern", sourceEventId)) {
      created.push(
        buildPatternReview(
          ctx,
          "adherence-pattern",
          sourceEventId,
          `${recentSkips.length} missed or ended-early sessions in the last ${PATTERN_WINDOW_DAYS} days.`,
          "Repeated missed/ended-early sessions — not an isolated skip that a routine follow-up already covers.",
          "A supportive check-in about consistency, not a programming change."
        )
      );
    }
  }

  if (performancePattern) {
    const sourceEventId = `performance-pattern-${weekBucket}`;
    if (!alreadyExists("performance-pattern", sourceEventId)) {
      created.push(
        buildPatternReview(
          ctx,
          "performance-pattern",
          sourceEventId,
          `${recentRpe.length} sessions flagged with abnormal RPE in the last ${PATTERN_WINDOW_DAYS} days.`,
          "Repeated RPE mismatches suggest the prescribed load may no longer be right, not routine day-to-day variance.",
          "Review recent loads; consider whether a progression adjustment is due."
        )
      );
    }
  }

  return created;
}

/**
 * A real, non-punitive positive signal: N consecutive fully-completed
 * workouts with no skipped work and nothing needing review. Fires at most
 * once per streak length crossed (deduplicated the same way pattern items
 * are) so it can never spam the coach every single day the streak
 * continues.
 */
export function detectMilestoneEscalation(ctx: EscalationContext, input: { consecutiveCleanWorkouts: number }): ReviewRequest | null {
  if (input.consecutiveCleanWorkouts < MILESTONE_STREAK_THRESHOLD || input.consecutiveCleanWorkouts % MILESTONE_STREAK_THRESHOLD !== 0) return null;
  const own = ctx.reviewRequests.filter((r) => r.workspaceId === ctx.workspaceId && r.clientId === ctx.clientId);
  const sourceEventId = `milestone-streak-${input.consecutiveCleanWorkouts}`;
  if (own.some((r) => r.kind === "milestone" && r.sourceEventId === sourceEventId)) return null;

  const nowIso = ctx.nowIso;
  return {
    id: ctx.nextId(),
    workspaceId: ctx.workspaceId,
    clientId: ctx.clientId,
    assignedCoachId: ctx.assignedCoachId,
    kind: "milestone",
    severity: severityForKind("milestone"),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    summary: `${input.consecutiveCleanWorkouts} clean sessions in a row — no skipped work, nothing flagged.`,
    status: "needs_review",
    resolved: false,
    sourceEventId,
    escalationReason: "A genuine consistency streak — worth a personal note, not a routine summary.",
    recommendedNextAction: "Send a short congrats.",
    preparedClientMessage: `${input.consecutiveCleanWorkouts} sessions in a row without missing a beat — that's real consistency. Keep it up.`,
    clientNotificationRequired: false,
    responseRequiredFromClient: false,
    history: [buildHistoryEntry(nowIso, "Flagged a consistency streak worth a personal touch.")],
  };
}
