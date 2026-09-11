// Phase 6.0D-A — Unified Production Coach Operations Surface.
//
// The repository/data-access boundary for the coach's "Needs your
// attention" queue, mirroring lib/production/repository.ts's established
// FoundationRepository pattern exactly: one interface, a Demo adapter and a
// Supabase adapter, one factory (getCoachOperationsRepository) that picks
// the right one from resolveAppMode(). Every caller (app/coach/page.tsx,
// app/coach/escalations/page.tsx) holds a CoachOperationsRepository and
// never branches on mode itself.
//
// The shared AttentionItem shape and both pure mapping functions live in
// lib/coach/attention-item.ts, not here — this file is "server-only" (real
// Supabase reads pull in lib/supabase/server.ts's next/headers dependency),
// so keeping the mapping logic in a framework-independent file is what lets
// lib/production/verify-coach-operations.mts unit-test it directly, exactly
// like Phase 6.0C's lib/communications/campaign-personalization.ts split.
//
// This is a READ boundary, matching FoundationRepository's own scope —
// mutations (approve/edit/respond/resolve/propose-playbook-example) stay
// exactly where Phase 6.0C put them (lib/production/chat.ts,
// lib/production/campaigns.ts, lib/production/coach-notes.ts, called
// through app/actions/coach-communications.ts), because those are real,
// already-correct, already-tested Supabase-mode operations with no demo
// equivalent to unify against — Adaptive Campaigns and Personal Coach Notes
// are new Phase 6.0C concepts, not a second implementation of something
// demo mode already has.
//
// Why the Demo adapter can't read the LIVE interactive demo dashboard: the
// demo prototype's actual interactive state (PlatformState, ReviewRequest
// records created by real user actions) lives entirely in the BROWSER's
// localStorage — server code architecturally cannot read it, full stop.
// FoundationRepository's own DemoFoundationRepository already established
// the answer: fall back to the same static, real seed fixtures
// (lib/tenancy/seed.ts) the demo prototype itself boots from, run through
// the SAME real, unmodified attention-queue logic
// (lib/coach/attention-queue.ts's buildReviewQueueItems) the live client
// dashboard uses. That's a genuine adapter, not a stub — it's just scoped
// to the seed data rather than a live browser session, which is the
// honest, architecturally correct answer for demo data reached from
// server-only code. The live, interactive demo dashboard (app/coach/page.tsx
// in demo mode) never calls this repository at all; it keeps reading
// hooks/use-coach-data.ts directly, exactly as before this phase — this
// repository exists so the *shape* of "attention item" is genuinely shared
// and independently testable across both modes, not so demo mode's real UI
// is rewritten to go through it.

import "server-only";
import { resolveAppMode } from "./mode.ts";
import { resolveOwnStaffWorkspace } from "./auth.ts";
import { getWorkspaceEscalations } from "./chat.ts";
import { buildReviewQueueItems } from "../coach/attention-queue.ts";
import { ALL_CLIENT_PROFILES, ALL_SAMPLE_REVIEW_REQUESTS } from "../tenancy/seed.ts";
import { getDemoCoachSession } from "../tenancy/session.ts";
import { resolveActiveContext } from "../tenancy/context.ts";
import { attentionItemFromEscalation, attentionItemFromDemoQueueItem, type CoachAttentionInbox } from "../coach/attention-item.ts";

export type { AttentionItem, AttentionItemStatus, CoachAttentionInbox } from "../coach/attention-item.ts";

export interface CoachOperationsRepository {
  getAttentionInbox(): Promise<CoachAttentionInbox>;
}

/** Demo adapter — real seed fixtures (lib/tenancy/seed.ts) run through the
 * real, unmodified lib/coach/attention-queue.ts logic. See this file's own
 * module doc for why this can't reflect a live browser session, and why
 * that's the same honest tradeoff FoundationRepository's own demo adapter
 * already makes. */
class DemoCoachOperationsRepository implements CoachOperationsRepository {
  async getAttentionInbox(): Promise<CoachAttentionInbox> {
    const ctx = resolveActiveContext(getDemoCoachSession());
    const coachId = ctx.coachProfile?.id ?? ctx.user.id;
    const items = buildReviewQueueItems({
      workspaceId: ctx.workspace.id,
      coachId,
      reviewRequests: ALL_SAMPLE_REVIEW_REQUESTS,
      clients: ALL_CLIENT_PROFILES,
    });
    const mapped = items.map(attentionItemFromDemoQueueItem);
    return {
      workspaceId: ctx.workspace.id,
      coachDisplayName: ctx.user.displayName,
      open: mapped.filter((item) => item.status !== "resolved"),
      resolved: mapped.filter((item) => item.status === "resolved"),
    };
  }
}

/** Supabase adapter — every read goes through lib/production/chat.ts's
 * getWorkspaceEscalations, which itself re-derives and re-checks the
 * caller's own staff authority before returning anything (RLS is the
 * backstop, not the primary gate — see that file's own module doc). */
class SupabaseCoachOperationsRepository implements CoachOperationsRepository {
  async getAttentionInbox(): Promise<CoachAttentionInbox> {
    const { workspaceId, coachDisplayName } = await resolveOwnStaffWorkspace();
    const [open, resolved] = await Promise.all([
      getWorkspaceEscalations(workspaceId, ["pending", "proposed", "approved", "coach_responded"]),
      getWorkspaceEscalations(workspaceId, ["resolved"]),
    ]);
    return {
      workspaceId,
      coachDisplayName,
      open: open.map(attentionItemFromEscalation),
      resolved: resolved.map(attentionItemFromEscalation),
    };
  }
}

let cached: CoachOperationsRepository | null = null;

export function getCoachOperationsRepository(): CoachOperationsRepository {
  if (cached) return cached;
  cached = resolveAppMode() === "supabase" ? new SupabaseCoachOperationsRepository() : new DemoCoachOperationsRepository();
  return cached;
}

/** Test-only: lets verify scripts exercise both adapters deterministically
 * without relying on module-load-order caching — mirrors
 * lib/production/repository.ts's own __resetFoundationRepositoryForTests. */
export function __resetCoachOperationsRepositoryForTests(): void {
  cached = null;
}
