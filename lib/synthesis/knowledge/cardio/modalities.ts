// Cardio Knowledge V1 — the modality catalog (internal curation, pending qualified review). Each modality carries
// the metadata the client's CONFIRMED restrictions are matched against — the same vocabulary as Fitness Knowledge
// (limb regions, demands, positions, movement patterns) — plus what it needs to be done (equipment) and how much it
// interferes with lower-body strength work. No energy values.

import type { BodyPosition, Demand, Level, LimbRegion, MovementPatternId } from "../taxonomy.ts";

export const CARDIO_EQUIPMENT = ["none", "treadmill", "stationary_bike", "outdoor_bike", "rower", "elliptical", "stair_climber", "pool", "air_bike"] as const;
export type CardioEquipment = (typeof CARDIO_EQUIPMENT)[number];
export const CARDIO_EQUIPMENT_LABEL: Record<CardioEquipment, string> = { none: "no equipment", treadmill: "treadmill", stationary_bike: "stationary bike", outdoor_bike: "bike", rower: "rowing machine", elliptical: "elliptical", stair_climber: "stair climber", pool: "pool", air_bike: "air bike" };

export interface CardioModality {
  id: string;
  name: string;
  /** Any ONE of these makes it doable (e.g. walking outdoors needs nothing; on a treadmill it needs one). */
  equipmentAnyOf: CardioEquipment[];
  /** Limb regions it loads (both sides). */
  loads: LimbRegion[];
  demands: Partial<Record<Demand, Level>>;
  positions: BodyPosition[];
  /** Movement patterns it genuinely involves (restrictions on these exclude it). */
  patterns: MovementPatternId[];
  supports: Array<"steady" | "intervals">;
  /** How much it competes with lower-body strength adaptations (running > cycling — concurrent_training). */
  lowerBodyInterference: Level;
  skill: Level;
}

const m = (x: CardioModality) => x;
export const CARDIO_MODALITIES: CardioModality[] = [
  m({ id: "cardio.walking", name: "Walking", equipmentAnyOf: ["none", "treadmill"], loads: ["hip", "knee", "ankle"], demands: { impact: "low", bracing: "none", spinal_loading: "low", systemic_fatigue: "low" }, positions: ["standing"], patterns: [], supports: ["steady"], lowerBodyInterference: "low", skill: "none" }),
  m({ id: "cardio.incline_walking", name: "Incline treadmill walking", equipmentAnyOf: ["treadmill"], loads: ["hip", "knee", "ankle"], demands: { impact: "low", bracing: "none", spinal_loading: "low", systemic_fatigue: "moderate" }, positions: ["standing"], patterns: [], supports: ["steady", "intervals"], lowerBodyInterference: "low", skill: "none" }),
  m({ id: "cardio.running", name: "Running", equipmentAnyOf: ["none", "treadmill"], loads: ["hip", "knee", "ankle"], demands: { impact: "high", bracing: "low", spinal_loading: "low", systemic_fatigue: "high" }, positions: ["standing", "single_leg_stance"], patterns: ["single_leg"], supports: ["steady", "intervals"], lowerBodyInterference: "high", skill: "low" }),
  m({ id: "cardio.cycling_stationary", name: "Stationary cycling", equipmentAnyOf: ["stationary_bike"], loads: ["hip", "knee"], demands: { impact: "none", bracing: "none", spinal_loading: "none", systemic_fatigue: "moderate" }, positions: ["seated"], patterns: [], supports: ["steady", "intervals"], lowerBodyInterference: "low", skill: "none" }),
  m({ id: "cardio.cycling_outdoor", name: "Outdoor cycling", equipmentAnyOf: ["outdoor_bike"], loads: ["hip", "knee"], demands: { impact: "none", bracing: "low", spinal_loading: "low", systemic_fatigue: "moderate" }, positions: ["seated"], patterns: [], supports: ["steady", "intervals"], lowerBodyInterference: "low", skill: "moderate" }),
  m({ id: "cardio.rowing", name: "Rowing machine", equipmentAnyOf: ["rower"], loads: ["hip", "knee", "shoulder", "elbow", "wrist_hand"], demands: { impact: "none", bracing: "moderate", spinal_loading: "moderate", grip: "moderate", systemic_fatigue: "high" }, positions: ["seated", "hip_hinged"], patterns: ["hinge", "horizontal_pull"], supports: ["steady", "intervals"], lowerBodyInterference: "moderate", skill: "moderate" }),
  m({ id: "cardio.elliptical", name: "Elliptical", equipmentAnyOf: ["elliptical"], loads: ["hip", "knee", "ankle"], demands: { impact: "none", bracing: "none", spinal_loading: "low", systemic_fatigue: "moderate" }, positions: ["standing"], patterns: [], supports: ["steady", "intervals"], lowerBodyInterference: "low", skill: "none" }),
  m({ id: "cardio.stair_climber", name: "Stair climber", equipmentAnyOf: ["stair_climber"], loads: ["hip", "knee", "ankle"], demands: { impact: "low", bracing: "low", spinal_loading: "low", systemic_fatigue: "high" }, positions: ["standing", "single_leg_stance"], patterns: ["single_leg"], supports: ["steady", "intervals"], lowerBodyInterference: "moderate", skill: "low" }),
  m({ id: "cardio.swimming", name: "Swimming", equipmentAnyOf: ["pool"], loads: ["shoulder", "elbow", "hip", "knee"], demands: { impact: "none", bracing: "low", spinal_loading: "none", systemic_fatigue: "moderate" }, positions: ["prone"], patterns: [], supports: ["steady", "intervals"], lowerBodyInterference: "none", skill: "high" }),
  m({ id: "cardio.air_bike", name: "Air bike", equipmentAnyOf: ["air_bike"], loads: ["hip", "knee", "shoulder", "elbow"], demands: { impact: "none", bracing: "low", spinal_loading: "none", grip: "low", systemic_fatigue: "high" }, positions: ["seated"], patterns: [], supports: ["steady", "intervals"], lowerBodyInterference: "moderate", skill: "none" }),
];

const BY_ID = new Map(CARDIO_MODALITIES.map((x) => [x.id, x]));
export const cardioModality = (id: string) => BY_ID.get(id);
