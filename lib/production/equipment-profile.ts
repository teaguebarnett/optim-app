// Equipment specificity — the coach-confirmed specific equipment for one client (client_equipment_profiles).
//
// "Machine access" from intake never implies a particular machine. A specific apparatus counts as available only
// from the gym-type baseline (standard machines in a commercial gym) or from a confirmation here; everything else
// stays unknown — never treated as available. Unknown doesn't narrow the ideal plan: an exercise needing it is an
// execution dependency the review asks the coach to confirm. A confirmed absence is resolved by substitution. A
// database without the table (migration 033 not yet applied) reads as "nothing confirmed" and refuses writes.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { applyApparatusAnswers, sanitizeApparatus, type ConfirmedApparatus, type EquipmentAnswer } from "../synthesis/equipment-answers.ts";

export type { ConfirmedApparatus };

const missingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /client_equipment_profiles/.test(e.message ?? ""));

/** Validated confirmations (unknown ids / states dropped). Null when none or when the table doesn't exist yet. */
export async function getEquipmentProfile(clientProfileId: string): Promise<{ apparatus: ConfirmedApparatus; confirmedAtIso: string } | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("client_equipment_profiles").select("apparatus, confirmed_at").eq("client_profile_id", clientProfileId).maybeSingle();
  if (missingTable(error)) return null;
  if (error) throw new Error(`getEquipmentProfile failed: ${error.code ?? "query_error"}`);
  if (!data) return null;
  return { apparatus: sanitizeApparatus(data.apparatus), confirmedAtIso: data.confirmed_at as string };
}

/** The coach's explicit confirmation for specific apparatus ("unknown" removes a confirmation). Caller authorizes. */
export async function setConfirmedApparatus(params: { workspaceId: string; clientProfileId: string; coachUserId: string; changes: Record<string, EquipmentAnswer> }): Promise<{ ok: true; apparatus: ConfirmedApparatus } | { ok: false; message: string }> {
  const next = applyApparatusAnswers((await getEquipmentProfile(params.clientProfileId))?.apparatus ?? {}, params.changes);
  if (!next) return { ok: false, message: "That isn't equipment OPTIM knows about." };
  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("client_equipment_profiles").upsert({ client_profile_id: params.clientProfileId, workspace_id: params.workspaceId, apparatus: next, confirmed_by: params.coachUserId, confirmed_at: nowIso, updated_at: nowIso }, { onConflict: "client_profile_id" });
  if (missingTable(error)) return { ok: false, message: "Saving client equipment isn't enabled on this server yet. Nothing was saved." };
  if (error) throw new Error(`setConfirmedApparatus failed: ${error.code ?? "write_error"}`);
  return { ok: true, apparatus: next };
}
