"use server";

// Public beta-request (waitlist) submission. Success is reported only after
// the database confirms the lead was saved. Nothing here creates an account,
// profile, or access of any kind.

import { parseBetaRequest, type BetaRequestErrors } from "../../lib/marketing/beta-request";
import { saveBetaLead } from "../../lib/marketing/lead-store";

export type BetaRequestResult =
  | { status: "idle" }
  | { status: "invalid"; errors: BetaRequestErrors }
  | { status: "duplicate"; email: string }
  | { status: "error" }
  | { status: "success"; email: string; planInterest: string | null };

export async function submitBetaRequestAction(_prev: BetaRequestResult, formData: FormData): Promise<BetaRequestResult> {
  // Honeypot: a hidden field people never see or fill. Bots that fill it get
  // a neutral response and nothing is stored.
  if (typeof formData.get("company") === "string" && (formData.get("company") as string).trim() !== "") {
    return { status: "error" };
  }
  const parsed = parseBetaRequest(Object.fromEntries(formData.entries()));
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
  const saved = await saveBetaLead(parsed.request);
  if (saved === "duplicate") return { status: "duplicate", email: parsed.request.email };
  if (saved === "error") return { status: "error" };
  return { status: "success", email: parsed.request.email, planInterest: parsed.request.planInterest };
}
