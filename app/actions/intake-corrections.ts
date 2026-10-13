"use server";

// The coach corrects or clears an inaccurate onboarding answer (see lib/production/intake-corrections.ts). Errors are
// returned, never thrown (server-action errors are masked in production).

import { correctClientIntakeAnswer } from "@/lib/production/intake-corrections";

export async function correctClientIntakeAnswerAction(p: { workspaceId: string; clientProfileId: string; step: string; field: string; value: number | null; reason: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await correctClientIntakeAnswer(p);
    return { ok: true };
  } catch (err) {
    console.error("correctClientIntakeAnswerAction failed", err);
    return { ok: false, message: err instanceof Error ? err.message : "The correction wasn't saved — try again." };
  }
}
