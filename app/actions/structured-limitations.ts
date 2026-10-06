"use server";

// Gate 4.0C-2A — server actions for the coach's structured-limitation
// review and the review-only resistance planner preview. Thin wrappers:
// authorization and validation live in lib/production/structured-limitations.ts.

import { revalidatePath } from "next/cache";
import {
  recordExerciseFitDecisions,
  confirmStructuredLimitations,
  previewResistancePlan,
  proposeStructuredLimitations,
  type ConfirmLimitationsInput,
} from "../../lib/production/structured-limitations";
import { MANUAL_FALLBACK_MESSAGE, type InterpretationProposal } from "../../lib/synthesis/limitations/interpret";
import { getAuthenticatedContext } from "../../lib/production/auth";
import { queueRevisionIfMaterial } from "../../lib/production/reasoner-lifecycle";

/** Messages written by our own code that are safe to show as-is; anything else becomes a generic message. */
const SAFE_MESSAGES = new Set(["There's no documented limitation to interpret."]);
const safeMessage = (err: unknown, fallback: string) => (err instanceof Error && SAFE_MESSAGES.has(err.message) ? err.message : fallback);

export async function proposeStructuredLimitationsAction(params: { workspaceId: string; clientProfileId: string }): Promise<{ ok: true; proposal: InterpretationProposal } | { ok: false; message: string }> {
  try {
    return { ok: true, proposal: await proposeStructuredLimitations(params) };
  } catch (err) {
    console.error(`proposeStructuredLimitationsAction failed: ${err instanceof Error ? err.name : "unknown"}`);
    return { ok: false, message: safeMessage(err, MANUAL_FALLBACK_MESSAGE) };
  }
}

export async function confirmStructuredLimitationsAction(input: ConfirmLimitationsInput): Promise<{ ok: true; revision: "queued" | "not_needed" } | { ok: false; errors: string[] }> {
  try {
    const result = await confirmStructuredLimitations(input);
    if (!result.ok) return result;
  } catch (err) {
    console.error(`confirmStructuredLimitationsAction failed: ${err instanceof Error ? err.name : "unknown"}`);
    return { ok: false, errors: ["Couldn't save the confirmation. Nothing was changed — try again."] };
  }
  // Gate 4.0C-5 — the coach's confirmation authorizes ONE Reasoner revision when it supersedes the pending draft
  // (idempotent per planning state; never approves or publishes). A queue problem never undoes the confirmation.
  let revision: "queued" | "not_needed" = "not_needed";
  try {
    const ctx = await getAuthenticatedContext();
    const r = await queueRevisionIfMaterial({ workspaceId: input.workspaceId, clientProfileId: input.clientProfileId, coachId: ctx.userId, trigger: "limitations_confirmed" });
    if (r.queued) revision = "queued";
  } catch (err) {
    console.error(`confirmStructuredLimitationsAction: revision check failed (confirmation saved): ${err instanceof Error ? err.name : "unknown"}`);
  }
  revalidatePath(`/coach/clients/${input.clientProfileId}`);
  revalidatePath(`/coach/clients/${input.clientProfileId}/planner-review`);
  return { ok: true, revision };
}

/** Gate 4.0C-5 — the coach removes one of their exercise decisions (explicit). Revoking a clearance can make a planned
 * exercise uncertain again; if that supersedes the pending draft, ONE revision is prepared. */
export async function revokeExerciseFitDecisionAction(params: { workspaceId: string; clientProfileId: string; exerciseId: string }): Promise<{ ok: true; revision: "queued" | "not_needed" } | { ok: false; errors: string[] }> {
  try {
    const res = await recordExerciseFitDecisions({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, decisions: [{ exerciseId: params.exerciseId, verdict: "revoke", source: { kind: "limitations_card" } }] });
    if (!res.ok) return res;
  } catch (err) {
    console.error(`revokeExerciseFitDecisionAction failed: ${err instanceof Error ? err.name : "unknown"}`);
    return { ok: false, errors: ["Couldn't save that change. Nothing was changed — try again."] };
  }
  let revision: "queued" | "not_needed" = "not_needed";
  try {
    const ctx = await getAuthenticatedContext();
    if ((await queueRevisionIfMaterial({ ...params, coachId: ctx.userId, trigger: "fit_decision" })).queued) revision = "queued";
  } catch (err) {
    console.error(`revokeExerciseFitDecisionAction: revision check failed (change saved): ${err instanceof Error ? err.name : "unknown"}`);
  }
  revalidatePath(`/coach/clients/${params.clientProfileId}`);
  return { ok: true, revision };
}

export async function previewResistancePlanAction(params: { workspaceId: string; clientProfileId: string }) {
  return previewResistancePlan(params);
}

/** Gate 4.0C-3 (internal QA) — Fitness Reasoner v1 preview. In memory only. */
export async function runFitnessReasonerPreviewAction(params: { workspaceId: string; clientProfileId: string }) {
  try {
    const { runFitnessReasonerPreview } = await import("../../lib/production/fitness-reasoner");
    return await runFitnessReasonerPreview(params);
  } catch (err) {
    console.error(`runFitnessReasonerPreviewAction failed: ${err instanceof Error ? err.name : "unknown"}`);
    return { status: "PROVIDER_FAILED" as const, message: "OPTIM's reasoner couldn't produce a plan right now. Nothing was changed — try again, or review the deterministic planner's proposal." };
  }
}
