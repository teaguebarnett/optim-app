// Phase 7A — Persist Client Health Reviews and Coach Escalation.
//
// The Supabase-mode persistence path for a real, acute live-workout pain
// report — the "acute training event" concept, distinct from the baseline
// onboarding-limitation trigger in lib/production/onboarding.ts (see this
// phase's completion report, section 3). The existing client-side safety
// gate (lib/state.ts's REPORT_PAIN reducer case — phase: "pain-review",
// activePainInterruption) is untouched and fires synchronously, in memory,
// regardless of what happens here: this module's ONLY job is making sure
// the report also reaches the real coach review/attention system in
// Supabase mode, exactly as it already does in demo mode via
// lib/state.ts's own reviewRequests append. Never replaces or delays the
// safety gate — see hooks/use-prototype-state.tsx for where this is
// called, always AFTER the gate is already active.
//
// Reuses lib/workout/pain-policy.ts's real classifySeverity (never a second,
// independently-drifting severity rule) and the same
// create_health_safety_escalation SECURITY DEFINER RPC the baseline
// onboarding trigger uses — see that migration's own doc
// (20260912000018_health_safety_escalations.sql) for why no new table
// exists for this.

import { ownerMatches, type ClientOwner } from "./client-ownership";
import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";
import { resolveOwnClientIdentity } from "./identity.ts";
import { buildPainSummary, type AcutePainReportInput } from "../coach/pain-safety-summary.ts";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "../coach/types";
import type { HealthReviewRecord, HealthReviewStatus } from "../coach/types";
import { projectAcutePainObservations } from "../signals/project-pain-report.ts";
import { recordObservations } from "./signals.ts";
import { projectHealthReviewDecision } from "../decisions/project-health-review-decision.ts";
import { recordDecisionEvidence } from "./decision-evidence.ts";

/** Decision states that mean "still needs coach action" for programming
 * purposes — the exact complement of RESOLVED_HEALTH_REVIEW_STATUSES (see
 * lib/coach/types.ts), reused rather than re-derived so this file can never
 * silently disagree with the real domain vocabulary about which states
 * count as resolved. */
function isPendingHealthReviewStatus(status: HealthReviewStatus): boolean {
  return !RESOLVED_HEALTH_REVIEW_STATUSES.has(status);
}

export type { AcutePainReportInput } from "../coach/pain-safety-summary.ts";

export interface AcutePainReportResult {
  /** Only ever true when the escalation row was actually, durably
   * persisted — see lib/production/pain-safety.ts's own doc and this
   * phase's spec section 10: the client must never be told their coach was
   * notified unless this is true. */
  escalationCreated: boolean;
  escalationId: string | null;
  /** Cross-client integrity — the report came from another client's retained state; nothing was created. */
  ownerMismatch?: true;
}

/** The one real Supabase-mode write for an acute pain report. Always
 * resolves the caller's OWN client identity (never a client-supplied id),
 * matching every other client-authored write in this codebase. Never
 * throws for a failed escalation write — that must not surface as a client-
 * facing error over and above the report itself (the safety gate already
 * fired client-side regardless) — instead returns an honest
 * escalationCreated: false so the caller can render truthful copy. */
export async function reportAcutePainForClient(input: AcutePainReportInput, owner: ClientOwner): Promise<AcutePainReportResult> {
  const identity = await resolveOwnClientIdentity();
  // Never file one client's pain report under another client (see lib/production/client-ownership.ts).
  if (!ownerMatches(owner, identity)) return { escalationCreated: false, escalationId: null, ownerMismatch: true };
  const supabase = await getSupabaseServerClient();
  const summary = buildPainSummary(input);

  const { data, error } = await supabase.rpc("create_health_safety_escalation", {
    p_client_profile_id: identity.clientProfileId,
    p_summary: summary,
    p_dedupe_existing: false,
  });

  if (error) {
    console.error(`reportAcutePainForClient: create_health_safety_escalation failed: ${error.message}`);
    return { escalationCreated: false, escalationId: null };
  }

  const escalationId = (data as string | null) ?? null;
  // Phase 8A — best-effort observation projection, strictly AFTER the real
  // canonical escalation write above already succeeded (spec section 26).
  // A failure here must never turn an already-successful safety report
  // into an apparent failure for the client.
  if (escalationId) {
    try {
      await recordObservations(
        projectAcutePainObservations({
          clientProfileId: identity.clientProfileId,
          workspaceId: identity.workspaceId,
          escalationId,
          location: input.location,
          ratingZeroToTen: input.ratingZeroToTen,
          observedAtIso: new Date().toISOString(),
        })
      );
    } catch (projectionError) {
      console.error(`reportAcutePainForClient: observation projection failed (canonical escalation already created): ${projectionError instanceof Error ? projectionError.message : String(projectionError)}`);
    }
  }

  return { escalationCreated: true, escalationId };
}

/**
 * The real Supabase-mode equivalent of demo mode's HealthReviewRecord, read
 * back from the SAME escalations rows create_health_safety_escalation
 * writes and lib/production/pain-safety.ts's own recordHealthReviewDecision
 * updates (never a second, parallel "health review" store — see this
 * module's own doc and the Phase 7B migration's header for why
 * health_review_status/documented_limitations live as columns on
 * escalations rather than a new table). Feeds directly into the existing,
 * unchanged lib/coach/programming-profile.ts's extractClientProgrammingProfile.
 *
 * Phase 7B — reads the REAL, explicit coach decision (health_review_status)
 * rather than Phase 7A's coarse approximation from the generic escalation
 * `status` column. Deliberately does NOT treat `status = 'resolved'` (the
 * coach dismissing the item from their queue) as equivalent to a real
 * health decision — an escalation can be resolved-from-the-queue with
 * health_review_status still null, and that must still read as
 * "review_needed" here (spec section 6: acknowledgement is not the same as
 * a coaching decision).
 *
 * Policy, in order:
 *   1. Any pain_or_safety report with NO decision recorded yet
 *      (health_review_status is null) forces the whole client to read as
 *      unresolved — conservative and safe: a real concern is still fully
 *      unaddressed.
 *   2. Any report whose real decision is itself still a pending state
 *      (review_needed / discuss_with_client / professional_guidance_requested)
 *      also forces unresolved — matching sections 10/11's explicit
 *      requirement that these states never get silently treated as safe to
 *      proceed.
 *   3. Only once EVERY pain_or_safety report for this client has a real,
 *      resolved decision does this resolve — using whichever decision was
 *      made MOST RECENTLY (by decided-at, not report-created-at), since a
 *      coach's later decision on any report — old or new — is their
 *      current, authoritative word on this client's training boundary
 *      (this is also how a limitation is later changed or cleared: the
 *      coach records a new decision, which becomes the most recent one).
 *
 * Caller must already be authorized to read this client's data — this
 * function relies on the caller's own RLS-bound session
 * (escalations_select's app_private.can_access_client) as the real
 * backstop, matching getOnboardingProgressForClient's identical posture.
 */
export async function resolveHealthReviewRecordForClient(clientProfileId: string, workspaceId: string): Promise<HealthReviewRecord | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("escalations")
    .select("id, proposed_response, health_review_status, documented_limitations, health_review_decided_at, created_at, updated_at")
    .eq("client_profile_id", clientProfileId)
    .eq("reason_category", "pain_or_safety")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`resolveHealthReviewRecordForClient failed: ${error.message}`);
  if (!data || data.length === 0) return null;

  const reasons = data.map((row) => row.proposed_response as string).filter((r): r is string => !!r);
  const mostRecentReport = data[0];
  const nowIso = new Date().toISOString();

  const undecided = data.some((row) => !row.health_review_status);
  const stillPending = data.some((row) => row.health_review_status && isPendingHealthReviewStatus(row.health_review_status as HealthReviewStatus));
  if (undecided || stillPending) {
    return {
      clientId: clientProfileId,
      workspaceId,
      status: "review_needed",
      reasons,
      createdAtIso: mostRecentReport.created_at as string,
      updatedAtIso: mostRecentReport.updated_at as string,
    };
  }

  const decided = data.filter((row) => row.health_review_decided_at);
  const mostRecentDecision = decided.sort((a, b) => (b.health_review_decided_at as string).localeCompare(a.health_review_decided_at as string))[0];
  const structuredLimitations = await readStructuredLimitations(supabase, mostRecentDecision.id as string);
  return {
    clientId: clientProfileId,
    workspaceId,
    status: mostRecentDecision.health_review_status as HealthReviewStatus,
    reasons,
    documentedLimitations: (mostRecentDecision.documented_limitations as string | null) ?? undefined,
    createdAtIso: mostRecentReport.created_at as string,
    updatedAtIso: (mostRecentDecision.health_review_decided_at as string) ?? nowIso,
    decisionEscalationId: mostRecentDecision.id as string,
    ...(structuredLimitations ? { structuredLimitations } : {}),
  };
}

/** Gate 4.0C-2A — the coach-confirmed structured limitation on the decision
 * row. Read separately so a database without migration 030 yet still
 * resolves the health review exactly as before (no structure = planning
 * asks for it); any other error is real and surfaces. */
async function readStructuredLimitations(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, escalationId: string): Promise<unknown> {
  const { data, error } = await supabase.from("escalations").select("structured_limitations").eq("id", escalationId).maybeSingle();
  if (error) {
    if (error.code === "42703" || /structured_limitations/.test(error.message)) return undefined;
    throw new Error(`resolveHealthReviewRecordForClient (structured limitations) failed: ${error.message}`);
  }
  return (data?.structured_limitations as unknown) ?? undefined;
}

export interface HealthReviewDecisionInput {
  escalationId: string;
  workspaceId: string;
  status: HealthReviewStatus;
  /** Required, non-blank, whenever status is "proceed_with_limitations" —
   * enforced here, not just in the UI, so no caller can ever persist that
   * status with no real boundary attached (spec section 7). */
  documentedLimitations?: string;
}

/** The one real write path for a coach's structured health-review decision
 * — a normal authenticated `.update()` on the existing escalations row,
 * exactly like lib/production/chat.ts's own resolveEscalationWithoutMessaging
 * already does for the same table (no new RPC needed — escalations_update_staff's
 * existing RLS policy already authorizes this). Deliberately independent of
 * the escalation's own `status`/resolved_by/resolved_at (the QUEUE
 * lifecycle) — a coach may record a real decision without also dismissing
 * the item from their attention queue, or vice versa (spec section 6). */
export async function recordHealthReviewDecision(input: HealthReviewDecisionInput): Promise<void> {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, input.workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();

  if (input.status === "proceed_with_limitations" && !input.documentedLimitations?.trim()) {
    throw new Error("recordHealthReviewDecision: documentedLimitations is required when status is proceed_with_limitations");
  }

  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("escalations")
    .update({
      health_review_status: input.status,
      // Only ever set when the coach actually typed one — never carries
      // over a PRIOR decision's limitation text onto a status that
      // doesn't call for one (e.g. switching to "reviewed_by_coach").
      documented_limitations: input.status === "proceed_with_limitations" ? input.documentedLimitations!.trim() : null,
      health_review_decided_by: ctx.userId,
      health_review_decided_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", input.escalationId)
    .eq("workspace_id", input.workspaceId)
    .eq("reason_category", "pain_or_safety")
    .select("client_profile_id");
  if (error) throw new Error(`recordHealthReviewDecision failed: ${error.message}`);
  // A zero-row update (wrong workspace, wrong id, or not actually a
  // pain_or_safety row) must surface as a real error, never a silent no-op
  // that looks like success to the caller.
  if (!data || data.length === 0) throw new Error(`recordHealthReviewDecision: no matching pain_or_safety escalation ${input.escalationId} in workspace ${input.workspaceId}`);

  // Phase 8B — best-effort decision-evidence projection, strictly AFTER
  // the real canonical update above already succeeded. A failure here must
  // never turn an already-successful health-review decision into an
  // apparent failure for the coach. References the canonical escalation by
  // id rather than duplicating its lifecycle (spec section 27).
  try {
    await recordDecisionEvidence(
      projectHealthReviewDecision({
        workspaceId: input.workspaceId,
        coachUserId: ctx.userId,
        clientProfileId: data[0].client_profile_id as string,
        escalationId: input.escalationId,
        status: input.status,
        documentedLimitations: input.status === "proceed_with_limitations" ? input.documentedLimitations!.trim() : undefined,
        decidedAtIso: nowIso,
      })
    );
  } catch (evidenceError) {
    console.error(`recordHealthReviewDecision: decision evidence projection failed (canonical decision already recorded): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
  }
}
