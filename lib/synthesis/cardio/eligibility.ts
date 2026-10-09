// Cardio Reasoner V1 — which modalities fit the client: their CONFIRMED restrictions (the same structured tags the
// resistance planner uses) and what equipment they can actually use. Unknown equipment is planned as a dependency the
// coach confirms (the equipment model's ideal-first rule) — never assumed available, never silently excluded.

import { isKnown } from "../facts.ts";
import type { ClientState } from "../client-state.ts";
import { hardConstraints, type ConstraintSet } from "../constraints.ts";
import { LEVELS, LIMB_REGIONS, type LimbRegion } from "../knowledge/taxonomy.ts";
import { CARDIO_EQUIPMENT, CARDIO_MODALITIES, type CardioEquipment, type CardioModality } from "../knowledge/cardio/modalities.ts";

export type ModalityFit = { state: "compatible" } | { state: "uncertain" | "incompatible"; why: string };
const rank = (l: string) => LEVELS.indexOf(l as (typeof LEVELS)[number]);
const covers = (restricted: LimbRegion, loaded: LimbRegion) => restricted === loaded || (LIMB_REGIONS[restricted].joints as readonly string[]).some((j) => (LIMB_REGIONS[loaded].joints as readonly string[]).includes(j));

export function modalityFit(m: CardioModality, constraints: ConstraintSet): ModalityFit {
  let uncertain: string | null = null;
  for (const c of hardConstraints(constraints)) {
    if (c.confirmation !== "coach_confirmed" && c.confirmation !== "system_derived") continue;
    for (const t of c.tags) {
      if (t.kind === "avoid_demand" && rank(m.demands[t.demand] ?? "none") >= rank(t.atOrAbove)) return { state: "incompatible", why: `${t.demand.replace(/_/g, " ")} at ${m.demands[t.demand]} — restricted at ${t.atOrAbove} or above` };
      if (t.kind === "avoid_position" && m.positions.includes(t.position)) return { state: "incompatible", why: `${t.position.replace(/_/g, " ")} position is restricted` };
      if (t.kind === "avoid_movement_pattern" && m.patterns.includes(t.pattern)) return { state: "incompatible", why: `involves the restricted ${t.pattern.replace(/_/g, " ")} pattern` };
      if (t.kind === "avoid_limb_loading") {
        const hit = m.loads.find((r) => covers(t.region, r));
        if (hit && t.side === "both") return { state: "incompatible", why: `loads the ${LIMB_REGIONS[hit].label} (restricted on both sides)` };
        if (hit) uncertain ??= `loads both ${LIMB_REGIONS[hit].label}s; the ${t.side} side is restricted — the coach decides`;
      }
    }
  }
  return uncertain ? { state: "uncertain", why: uncertain } : { state: "compatible" };
}

export type CardioEquipmentState = "available" | "assumed" | "unknown";
/** A commercial gym is taken to have the standard cardio machines (recorded as an assumption); elsewhere unknown. */
const COMMERCIAL_BASELINE: CardioEquipment[] = ["treadmill", "stationary_bike", "elliptical", "rower"];

export function cardioEquipment(c: ClientState): Record<CardioEquipment, CardioEquipmentState> {
  const envs = isKnown(c.equipment.environments) ? c.equipment.environments.value : [];
  const out = Object.fromEntries(CARDIO_EQUIPMENT.map((e) => [e, "unknown"])) as Record<CardioEquipment, CardioEquipmentState>;
  out.none = "available";
  if (envs.length && envs.every((e) => e === "commercial_gym")) for (const e of COMMERCIAL_BASELINE) out[e] = "assumed";
  return out;
}

export interface ModalityOption {
  modality: CardioModality;
  fit: ModalityFit;
  equipment: CardioEquipmentState;
}

export function modalityOptions(c: ClientState, constraints: ConstraintSet): ModalityOption[] {
  const eq = cardioEquipment(c);
  const rankEq: Record<CardioEquipmentState, number> = { available: 0, assumed: 1, unknown: 2 };
  return CARDIO_MODALITIES.map((m) => ({ modality: m, fit: modalityFit(m, constraints), equipment: m.equipmentAnyOf.map((e) => eq[e]).sort((a, b) => rankEq[a] - rankEq[b])[0] }));
}
