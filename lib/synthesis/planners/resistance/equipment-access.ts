// Gate 4.0C-2 — what the client can train with, in three honest states.
//
// Implements come from ClientState's derived equipment (the training-
// environment answer). Apparatus (bench, rack, pull-up bar, ...) isn't asked
// at intake, so it is UNKNOWN unless an environment baseline below states
// it. The baseline is deliberately small — a full gym is taken to have a
// bench and a rack, nothing specialized — and every use of it is recorded
// as an assumption on the plan. Unknown is never treated as available.

import { isKnown } from "../../facts.ts";
import type { ClientState } from "../../client-state.ts";
import { APPARATUS, EQUIPMENT, STANDARD_MACHINES, type ApparatusId, type EquipmentId } from "../../knowledge/taxonomy.ts";

export type AccessState = "available" | "unavailable" | "unknown";

export interface EquipmentAccess {
  equipment: Record<EquipmentId, AccessState>;
  apparatus: Record<ApparatusId, AccessState>;
  /** Why each apparatus has its state: an environment baseline (assumption), the coach's confirmation, or unknown. */
  apparatusBasis: Record<ApparatusId, "baseline" | "coach_confirmed" | "unknown">;
  /** Apparatus marked available because of an environment baseline (recorded as assumptions). */
  baselineAssumptions: Array<{ apparatus: ApparatusId; environment: string }>;
  sourceRefs: string[];
}

/** Only environments that are a single full gym get a baseline. A commercial gym is also taken to have the STANDARD
 * machines (leg press, chest press, …) — never specialty machines. A private gym varies too much to assume any
 * machine: "machine access" there only means machine exercises are possible once the specific machine is known. */
const ENVIRONMENT_APPARATUS_BASELINE: Record<string, ApparatusId[]> = {
  commercial_gym: ["bench", "squat_rack", ...STANDARD_MACHINES],
  private_gym: ["bench", "squat_rack"],
};

export function resolveEquipmentAccess(client: ClientState): EquipmentAccess | null {
  if (!isKnown(client.equipment.available) || !isKnown(client.equipment.environments)) return null;
  const available = new Set(client.equipment.available.value);
  const environments = client.equipment.environments.value;
  const equipment = Object.fromEntries(EQUIPMENT.map((e) => [e, available.has(e) ? "available" : "unavailable"])) as Record<EquipmentId, AccessState>;
  const apparatus = Object.fromEntries(APPARATUS.map((a) => [a, "unknown"])) as Record<ApparatusId, AccessState>;
  const baselineAssumptions: EquipmentAccess["baselineAssumptions"] = [];
  // A baseline applies only when EVERY place the client trains has it.
  const baselines = environments.map((env) => new Set(ENVIRONMENT_APPARATUS_BASELINE[env] ?? []));
  const apparatusBasis = Object.fromEntries(APPARATUS.map((a) => [a, "unknown"])) as EquipmentAccess["apparatusBasis"];
  for (const a of APPARATUS) {
    if (baselines.length > 0 && baselines.every((b) => b.has(a))) {
      apparatus[a] = "available";
      apparatusBasis[a] = "baseline";
      baselineAssumptions.push({ apparatus: a, environment: environments.join(" + ") });
    }
  }
  // The coach's confirmation of specific equipment outranks any baseline (present or absent).
  const confirmed = client.equipment.confirmedApparatus && isKnown(client.equipment.confirmedApparatus) ? client.equipment.confirmedApparatus.value : {};
  for (const [a, state] of Object.entries(confirmed)) {
    if (!(APPARATUS as readonly string[]).includes(a)) continue;
    apparatus[a as ApparatusId] = state;
    apparatusBasis[a as ApparatusId] = "coach_confirmed";
    const i = baselineAssumptions.findIndex((x) => x.apparatus === a);
    if (i >= 0) baselineAssumptions.splice(i, 1);
  }
  const refs = [client.equipment.environments.source.ref, client.equipment.available.source.ref, ...(client.equipment.confirmedApparatus && isKnown(client.equipment.confirmedApparatus) ? [client.equipment.confirmedApparatus.source.ref] : [])];
  return { equipment, apparatus, apparatusBasis, baselineAssumptions, sourceRefs: refs };
}

export const availableEquipment = (a: EquipmentAccess) => EQUIPMENT.filter((e) => a.equipment[e] === "available");
export const availableApparatus = (a: EquipmentAccess) => APPARATUS.filter((x) => a.apparatus[x] === "available");
