"use server";

// Gate 3 — server actions for the live Coach Calibration survey and the
// coach's own method/authority. Thin wrappers over lib/production/coach-brain.ts:
// identity is always re-derived server-side there (never a browser-supplied
// coach id). Every action returns an explicit ok/error result so the survey
// can refuse to advance on a save that didn't happen.

import { revalidatePath } from "next/cache";
import {
  confirmOwnCalibration,
  confirmOwnMethodEdit,
  discardOwnMethodReview,
  saveOwnCalibrationProgress,
  startOwnMethodReview,
  updateOwnAuthority,
  type SaveCalibrationInput,
} from "@/lib/production/coach-brain";
import type { AiAuthorityConfig, CoachAiAuthoritySettings } from "@/lib/coach/ai-authority";
import type { CalibrationAnswers } from "@/lib/coach/calibration/types";

export type CalibrationActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

function failure(err: unknown, fallback: string): { ok: false; message: string } {
  return { ok: false, message: err instanceof Error && err.message ? err.message : fallback };
}

export async function saveCalibrationProgressAction(input: SaveCalibrationInput): Promise<CalibrationActionResult<{ updatedAtIso: string }>> {
  try {
    const { updatedAtIso } = await saveOwnCalibrationProgress(input);
    return { ok: true, updatedAtIso };
  } catch (err) {
    return failure(err, "Couldn't save your answer.");
  }
}

export async function confirmCalibrationAction(): Promise<CalibrationActionResult<{ version: number }>> {
  try {
    const { version } = await confirmOwnCalibration();
    revalidatePath("/coach", "layout");
    revalidatePath("/coach-onboarding");
    return { ok: true, version };
  } catch (err) {
    return failure(err, "Couldn't confirm your coaching method.");
  }
}

export async function startMethodReviewAction(): Promise<CalibrationActionResult> {
  try {
    await startOwnMethodReview();
    revalidatePath("/coach-onboarding");
    return { ok: true };
  } catch (err) {
    return failure(err, "Couldn't open your method for review.");
  }
}

export async function discardMethodReviewAction(): Promise<CalibrationActionResult> {
  try {
    await discardOwnMethodReview();
    revalidatePath("/coach-onboarding");
    revalidatePath("/coach/settings");
    return { ok: true };
  } catch (err) {
    return failure(err, "Couldn't discard your changes.");
  }
}

/** Gate 3.2 — Settings → confirm the coach's edited method as one new
 * version (see confirmOwnMethodEdit). */
export async function confirmMethodEditAction(input: { answers: CalibrationAnswers; baseVersionId: string }): Promise<CalibrationActionResult<{ version: number; changed: number }>> {
  try {
    const { version, changed } = await confirmOwnMethodEdit(input);
    revalidatePath("/coach", "layout");
    revalidatePath("/coach/settings");
    return { ok: true, version, changed };
  } catch (err) {
    return failure(err, "Couldn't save your method.");
  }
}

/** Settings → OPTIM authority, for a calibrated coach: a new confirmed
 * version with the explicit new authority. Throws on failure (the panel
 * reverts its optimistic state, matching LiveAiAuthorityPanel's contract). */
export async function updateMyCoachAuthorityAction(config: AiAuthorityConfig): Promise<CoachAiAuthoritySettings> {
  const settings = await updateOwnAuthority(config);
  revalidatePath("/coach/settings");
  return settings;
}
