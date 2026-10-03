"use server";

// Gate 4.0C-2A — server actions for the coach's structured-limitation
// review and the review-only resistance planner preview. Thin wrappers:
// authorization and validation live in lib/production/structured-limitations.ts.

import { revalidatePath } from "next/cache";
import {
  confirmStructuredLimitations,
  previewResistancePlan,
  proposeStructuredLimitations,
  type ConfirmLimitationsInput,
} from "../../lib/production/structured-limitations";
import { MANUAL_FALLBACK_MESSAGE, type InterpretationProposal } from "../../lib/synthesis/limitations/interpret";

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

export async function confirmStructuredLimitationsAction(input: ConfirmLimitationsInput): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  try {
    const result = await confirmStructuredLimitations(input);
    if (!result.ok) return result;
  } catch (err) {
    console.error(`confirmStructuredLimitationsAction failed: ${err instanceof Error ? err.name : "unknown"}`);
    return { ok: false, errors: ["Couldn't save the confirmation. Nothing was changed — try again."] };
  }
  revalidatePath(`/coach/clients/${input.clientProfileId}`);
  revalidatePath(`/coach/clients/${input.clientProfileId}/planner-review`);
  return { ok: true };
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
