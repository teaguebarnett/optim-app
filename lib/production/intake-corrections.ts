// Coach intake corrections — the write path (migration 038's correct_client_intake_answer). The assigned coach (or a
// workspace admin) corrects or clears one onboarding answer without the client repeating onboarding; the client's
// own answer is preserved and the correction (original, value, who, when, why) is recorded. Planning reads the
// corrected answers through lib/production/onboarding.ts → lib/coach/intake-corrections.ts.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { requireAssignedCoach } from "./reasoner-lifecycle.ts";
import { recordDecisionEvidence } from "./decision-evidence.ts";
import { CORRECTABLE_INTAKE_FIELDS, type IntakeCorrection } from "../coach/intake-corrections.ts";

export async function correctClientIntakeAnswer(p: { workspaceId: string; clientProfileId: string; step: string; field: string; value: number | null; reason: string }): Promise<IntakeCorrection> {
  const ctx = await requireAssignedCoach(p.workspaceId, p.clientProfileId);
  const def = CORRECTABLE_INTAKE_FIELDS.find((f) => f.step === p.step && f.field === p.field);
  if (!def) throw new Error("That answer can't be corrected here.");
  if (p.value !== null && (!Number.isFinite(p.value) || p.value < def.min || p.value > def.max)) throw new Error(`${def.label} must be between ${def.min} and ${def.max} ${def.unit} — or clear it.`);
  const reason = p.reason.trim();
  if (!reason) throw new Error("Say why you're correcting it — it's recorded with the change.");

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("correct_client_intake_answer", { p_client_profile_id: p.clientProfileId, p_step: p.step, p_field: p.field, p_value: p.value, p_reason: reason });
  if (error) throw new Error(/not authorized/.test(error.message) ? "You can only correct your own clients' answers." : `The correction wasn't saved: ${error.message}`);
  const correction = data as IntakeCorrection;

  // History (best-effort, after the canonical write).
  try {
    await recordDecisionEvidence({
      workspaceId: p.workspaceId,
      coachUserId: ctx.userId,
      clientProfileId: p.clientProfileId,
      decisionDomain: "other",
      decisionType: "intake_answer_correction",
      outcome: "overridden",
      proposedValue: { field: `${p.step}.${p.field}`, value: correction.original ?? null },
      chosenValue: { field: `${p.step}.${p.field}`, value: correction.value, cleared: correction.cleared, reason },
      sourceRef: `intake-correction:${p.clientProfileId}:${p.step}.${p.field}:${correction.correctedAtIso}`,
      decidedAtIso: correction.correctedAtIso,
    });
  } catch (err) {
    console.error(`correctClientIntakeAnswer: decision evidence failed (correction already saved): ${err instanceof Error ? err.message : String(err)}`);
  }
  return correction;
}
