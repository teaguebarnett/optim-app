// Cardio Reasoner V1 — what cardio is FOR, decided from the GoalContract before any model reasoning.
//
// SUPPORTED: cardio that supports fat loss, general fitness/health, hypertrophy, strength, recomposition or
//   maintenance; and aerobic BASE development (general endurance without a race/event).
// UNSUPPORTED (never routed into resistance planning, never faked): race/event programming (a named event, an event
//   date, or race vocabulary) and sport-specific conditioning — separately validated capabilities.
// NEEDS_INPUT: a free-text goal that names no recognizable purpose.

import { isKnown } from "../facts.ts";
import type { GoalContract, GoalEntry } from "../goal-contract.ts";

export type CardioPurpose = "fat_loss_support" | "health" | "resistance_support" | "aerobic_base";
export type CardioRouting =
  | { status: "ROUTED"; purpose: CardioPurpose; hybrid: boolean; rationale: string }
  | { status: "UNSUPPORTED"; message: string }
  | { status: "NEEDS_INPUT"; fact: string; why: string };

const RACE_TERMS = /\b(marathon|half[- ]marathon|ultra[- ]?marathon|5k|10k|race|triathlon|ironman|sportive|gran fondo|time trial|parkrun|century ride)\b/i;
const ENDURANCE_TERMS = /\b(endurance|aerobic|cardio|running|run|cycling|cyclist|swim(ming)?|rowing|conditioning|stamina|engine|zone 2)\b/i;

const text = (g: GoalEntry): string | null => (g.class === "other" && isKnown(g.description) ? g.description.value : null);
const isRace = (g: GoalEntry) => (g.class === "endurance" || g.class === "event_performance") && (isKnown(g.event) || isKnown(g.eventDateIso)) || (text(g) ? RACE_TERMS.test(text(g)!) : false);
const isEndurance = (g: GoalEntry) => g.class === "endurance" || g.class === "event_performance" || (text(g) ? ENDURANCE_TERMS.test(text(g)!) : false);

export function routeCardio(goal: GoalContract): CardioRouting {
  const p = goal.primary;
  if (!p) return { status: "NEEDS_INPUT", fact: "onboarding.what_you_want.primaryGoal", why: "The goal decides what cardio is for." };
  const all = [p, ...goal.secondary];
  // The client's own words count too: "finish a half marathon in April" is race preparation whatever the goal class.
  const success = isKnown(goal.successDefinition) ? goal.successDefinition.value : "";
  if (all.some(isRace) || RACE_TERMS.test(success)) return { status: "UNSUPPORTED", message: "This goal involves race or event preparation. Endurance race programming is a separately validated capability; Cardio Reasoner V1 doesn't plan it (and never routes it into resistance planning). The coach plans it directly for now." };
  if (p.class === "sport_performance") return { status: "UNSUPPORTED", message: "Sport-specific conditioning is a separately validated capability; Cardio Reasoner V1 doesn't plan it." };
  const hybrid = !isEndurance(p) && (goal.secondary.some(isEndurance) || ENDURANCE_TERMS.test(success));
  if (isEndurance(p)) return { status: "ROUTED", purpose: "aerobic_base", hybrid: false, rationale: "General endurance without a race or event → aerobic base development." };
  if (p.class === "other") return { status: "NEEDS_INPUT", fact: "goal_contract.primary.class", why: "The written goal doesn't name what cardio should do; a coach should classify it." };
  if (p.class === "fat_loss") return { status: "ROUTED", purpose: "fat_loss_support", hybrid, rationale: "Fat loss → cardio supports the energy deficit and health." };
  if (p.class === "general_fitness" || p.class === "maintenance") return { status: "ROUTED", purpose: "health", hybrid, rationale: "General fitness → cardiovascular health and fitness." };
  if (hybrid) return { status: "ROUTED", purpose: "aerobic_base", hybrid: true, rationale: "Resistance goal with a secondary endurance goal → aerobic development alongside resistance training." };
  return { status: "ROUTED", purpose: "resistance_support", hybrid: false, rationale: `${p.class.replace(/_/g, " ")} goal → cardio supports fitness and recovery without interfering with resistance adaptations.` };
}
