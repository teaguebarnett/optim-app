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
import { APPARATUS, EQUIPMENT, type ApparatusId, type EquipmentId } from "../../knowledge/taxonomy.ts";

export type AccessState = "available" | "unavailable" | "unknown";

export interface EquipmentAccess {
  equipment: Record<EquipmentId, AccessState>;
  apparatus: Record<ApparatusId, AccessState>;
  /** Apparatus marked available because of an environment baseline (recorded as assumptions). */
  baselineAssumptions: Array<{ apparatus: ApparatusId; environment: string }>;
  sourceRefs: string[];
}

/** Only environments that are a single full gym get a baseline. */
const ENVIRONMENT_APPARATUS_BASELINE: Record<string, ApparatusId[]> = {
  commercial_gym: ["bench", "squat_rack"],
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
  for (const a of APPARATUS) {
    if (baselines.length > 0 && baselines.every((b) => b.has(a))) {
      apparatus[a] = "available";
      baselineAssumptions.push({ apparatus: a, environment: environments.join(" + ") });
    }
  }
  return { equipment, apparatus, baselineAssumptions, sourceRefs: [client.equipment.environments.source.ref, client.equipment.available.source.ref] };
}

export const availableEquipment = (a: EquipmentAccess) => EQUIPMENT.filter((e) => a.equipment[e] === "available");
export const availableApparatus = (a: EquipmentAccess) => APPARATUS.filter((x) => a.apparatus[x] === "available");
