"use server";

// Phase 7A — Persist Client Health Reviews and Coach Escalation.
//
// The client-callable surface over lib/production/pain-safety.ts — same
// discipline as every other file in app/actions/: re-derives the caller's
// own identity server-side (via resolveOwnClientIdentity), never trusts a
// client-supplied id.

import { reportAcutePainForClient, type AcutePainReportInput, type AcutePainReportResult } from "../../lib/production/pain-safety";

export async function reportAcutePainAction(input: AcutePainReportInput): Promise<AcutePainReportResult> {
  return reportAcutePainForClient(input);
}
