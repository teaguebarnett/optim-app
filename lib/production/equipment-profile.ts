// Equipment specificity — the coach-confirmed specific equipment for one client (client_equipment_profiles).
//
// "Machine access" from intake never implies a particular machine. A specific apparatus counts as available only
// from the gym-type baseline (standard machines in a commercial gym) or from a confirmation here; everything else
// stays unknown and is never planned around. A database without the table (migration 033 not yet applied) reads
// as "nothing confirmed" and refuses writes with a plain message — planning stays conservative either way.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { APPARATUS } from "../synthesis/knowledge/taxonomy.ts";

export type ConfirmedApparatus = Record<string, "available" | "unavailable">;
const missingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /client_equipment_profiles/.test(e.message ?? ""));

/** Validated confirmations (unknown ids / states dropped). Null when none or when the table doesn't exist yet. */
export async function getEquipmentProfile(clientProfileId: string): Promise<{ apparatus: ConfirmedApparatus; confirmedAtIso: string } | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("client_equipment_profiles").select("apparatus, confirmed_at").eq("client_profile_id", clientProfileId).maybeSingle();
  if (missingTable(error)) return null;
  if (error) throw new Error(`getEquipmentProfile failed: ${error.code ?? "query_error"}`);
  if (!data) return null;
  return { apparatus: sanitize(data.apparatus), confirmedAtIso: data.confirmed_at as string };
}

function sanitize(raw: unknown): ConfirmedApparatus {
  const out: ConfirmedApparatus = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if ((APPARATUS as readonly string[]).includes(k) && (v === "available" || v === "unavailable")) out[k] = v;
  return out;
}

/** The coach's explicit confirmation for specific apparatus ("unknown" removes a confirmation). Caller authorizes. */
export async function setConfirmedApparatus(params: { workspaceId: string; clientProfileId: string; coachUserId: string; changes: Record<string, "available" | "unavailable" | "unknown"> }): Promise<{ ok: true; apparatus: ConfirmedApparatus } | { ok: false; message: string }> {
  for (const k of Object.keys(params.changes)) if (!(APPARATUS as readonly string[]).includes(k)) return { ok: false, message: "That isn't equipment OPTIM knows about." };
  const current = (await getEquipmentProfile(params.clientProfileId))?.apparatus ?? {};
  const next: ConfirmedApparatus = { ...current };
  for (const [k, v] of Object.entries(params.changes)) {
    if (v === "unknown") delete next[k];
    else next[k] = v;
  }
  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("client_equipment_profiles").upsert({ client_profile_id: params.clientProfileId, workspace_id: params.workspaceId, apparatus: next, confirmed_by: params.coachUserId, confirmed_at: nowIso, updated_at: nowIso }, { onConflict: "client_profile_id" });
  if (missingTable(error)) return { ok: false, message: "Saving client equipment isn't enabled on this server yet. Nothing was saved." };
  if (error) throw new Error(`setConfirmedApparatus failed: ${error.code ?? "write_error"}`);
  return { ok: true, apparatus: next };
}
