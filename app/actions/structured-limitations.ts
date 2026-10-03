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
import type { InterpretationProposal } from "../../lib/synthesis/limitations/interpret";

export async function proposeStructuredLimitationsAction(params: { workspaceId: string; clientProfileId: string }): Promise<{ ok: true; proposal: InterpretationProposal } | { ok: false; message: string }> {
  try {
    return { ok: true, proposal: await proposeStructuredLimitations(params) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't interpret the limitation." };
  }
}

export async function confirmStructuredLimitationsAction(input: ConfirmLimitationsInput): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  try {
    const result = await confirmStructuredLimitations(input);
    if (!result.ok) return result;
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : "Couldn't save the confirmation."] };
  }
  revalidatePath(`/coach/clients/${input.clientProfileId}`);
  revalidatePath(`/coach/clients/${input.clientProfileId}/planner-review`);
  return { ok: true };
}

export async function previewResistancePlanAction(params: { workspaceId: string; clientProfileId: string }) {
  return previewResistancePlan(params);
}
