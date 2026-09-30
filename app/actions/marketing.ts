"use server";

// Public beta-request submission. Success is reported only when an approved
// receiver confirms the request was stored. With no receiver configured
// (LEAD_RECEIVER is null) this always returns "closed" — it never pretends a
// request was received, and nothing is logged or sent anywhere.

import { LEAD_RECEIVER } from "../../lib/marketing/config";
import { parseBetaRequest, type BetaRequestErrors } from "../../lib/marketing/beta-request";

export type BetaRequestResult =
  | { status: "idle" }
  | { status: "invalid"; errors: BetaRequestErrors }
  | { status: "closed" }
  | { status: "error" }
  | { status: "success"; email: string; planInterest: string | null };

export async function submitBetaRequestAction(_prev: BetaRequestResult, formData: FormData): Promise<BetaRequestResult> {
  const parsed = parseBetaRequest(Object.fromEntries(formData.entries()));
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
  if (!LEAD_RECEIVER) return { status: "closed" };
  try {
    const result = await LEAD_RECEIVER.submit(parsed.request);
    if (!result.ok) return { status: "error" };
  } catch {
    return { status: "error" };
  }
  return { status: "success", email: parsed.request.email, planInterest: parsed.request.planInterest };
}
