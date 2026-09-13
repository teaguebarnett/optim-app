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

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { resolveOwnClientIdentity } from "./identity.ts";
import { buildPainSummary, type AcutePainReportInput } from "../coach/pain-safety-summary.ts";
import type { HealthReviewRecord } from "../coach/types";

export type { AcutePainReportInput } from "../coach/pain-safety-summary.ts";

export interface AcutePainReportResult {
  /** Only ever true when the escalation row was actually, durably
   * persisted — see lib/production/pain-safety.ts's own doc and this
   * phase's spec section 10: the client must never be told their coach was
   * notified unless this is true. */
  escalationCreated: boolean;
  escalationId: string | null;
}

/** The one real Supabase-mode write for an acute pain report. Always
 * resolves the caller's OWN client identity (never a client-supplied id),
 * matching every other client-authored write in this codebase. Never
 * throws for a failed escalation write — that must not surface as a client-
 * facing error over and above the report itself (the safety gate already
 * fired client-side regardless) — instead returns an honest
 * escalationCreated: false so the caller can render truthful copy. */
export async function reportAcutePainForClient(input: AcutePainReportInput): Promise<AcutePainReportResult> {
  const identity = await resolveOwnClientIdentity();
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
  return { escalationCreated: true, escalationId: (data as string | null) ?? null };
}

/**
 * The real Supabase-mode equivalent of demo mode's HealthReviewRecord, read
 * back from the SAME escalations rows create_health_safety_escalation
 * writes (never a second, parallel "health review" store — see this
 * module's own doc). Feeds directly into the existing, unchanged
 * lib/coach/programming-profile.ts's extractClientProgrammingProfile /
 * resolveProgrammingProfileReadiness — this is what actually closes the
 * safety gap Phase 6B identified: a real client's unresolved pain_or_safety
 * escalation now genuinely blocks generation exactly like demo mode's
 * unresolved HealthReviewRecord always has.
 *
 * If this client has ANY unresolved pain_or_safety escalation, the whole
 * record reads as unresolved ("review_needed") — the conservative, safe
 * reading: generation must not treat a client as cleared while even one
 * real safety concern is still open. Only when every pain_or_safety
 * escalation for this client is resolved does it read as resolved.
 * `documentedLimitations`/the richer HealthReviewStatus vocabulary
 * (discuss_with_client, proceed_with_limitations, etc.) has no Supabase-mode
 * equivalent yet — a real, documented remaining gap (see this phase's
 * completion report) — every real escalation here reads as the coarser
 * "review_needed" / "reviewed_by_coach" pair, which is exactly what
 * resolveProgrammingProfileReadiness's own gate actually checks.
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
    .select("status, proposed_response, created_at, updated_at")
    .eq("client_profile_id", clientProfileId)
    .eq("reason_category", "pain_or_safety")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`resolveHealthReviewRecordForClient failed: ${error.message}`);
  if (!data || data.length === 0) return null;

  const hasUnresolved = data.some((row) => row.status !== "resolved");
  const mostRecent = data[0];
  return {
    clientId: clientProfileId,
    workspaceId,
    status: hasUnresolved ? "review_needed" : "reviewed_by_coach",
    reasons: data.map((row) => row.proposed_response as string).filter((r): r is string => !!r),
    createdAtIso: mostRecent.created_at as string,
    updatedAtIso: mostRecent.updated_at as string,
  };
}
