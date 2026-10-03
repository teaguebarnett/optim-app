// Gate 4.0C-3 — domain routing, BEFORE any model reasoning.
//
// The goal decides the planning domain(s). A domain the reasoner can't
// genuinely plan yet returns DOMAIN_NOT_YET_SUPPORTED — it is never handed
// to the resistance reasoner (a marathon goal must not get Upper A /
// Lower A; a fat-loss goal is not a hypertrophy problem). Free-text goals
// are classified conservatively; anything unrecognized asks for the goal
// class instead of guessing.

import { isKnown, type Fact } from "../facts.ts";
import type { GoalContract, GoalEntry } from "../goal-contract.ts";

export type ReasoningDomain = "resistance" | "endurance" | "hybrid" | "weight_management" | "general_fitness" | "sport_performance";

/** Domains Fitness Reasoner v1 can actually plan. */
export const SUPPORTED_DOMAINS: ReadonlySet<ReasoningDomain> = new Set(["resistance", "general_fitness"]);

export type DomainRouting =
  | { status: "ROUTED"; primary: ReasoningDomain; supporting: ReasoningDomain[]; rationale: string; supported: boolean; resistanceEmphasis: "strength" | "hypertrophy" | "general" | null }
  | { status: "NEEDS_INPUT"; fact: string; why: string };

/** Free-text goal → domain. Conservative: only clear endurance / sport language routes; the rest asks. */
const ENDURANCE_TERMS = /\b(marathon|half[- ]marathon|ultra|5k|10k|run(ning|ner)?|race|triathlon|ironman|cycling|cyclist|swim(ming)?|rowing|endurance)\b/i;
const SPORT_TERMS = /\b(soccer|football|basketball|baseball|hockey|tennis|volleyball|rugby|lacrosse|golf|wrestling|bjj|jiu[- ]jitsu|mma|boxing|sport|season|athlete)\b/i;
const WEIGHT_TERMS = /\b(lose weight|weight loss|fat loss|lean out|cut|bulk|gain weight)\b/i;
const RESISTANCE_TERMS = /\b(strength|stronger|powerlifting|bodybuilding|muscle|hypertrophy|bench|squat|deadlift)\b/i;

export function routeDomains(goal: GoalContract): DomainRouting {
  const primary = goal.primary;
  if (!primary) return { status: "NEEDS_INPUT", fact: "onboarding.what_you_want.primaryGoal", why: "The goal decides which kind of plan to build." };
  const r = classify(primary);
  if (!r) return { status: "NEEDS_INPUT", fact: "goal_contract.primary.class", why: "The written goal doesn't clearly name a planning domain (e.g. strength, muscle, endurance event, sport, weight change); a coach should classify it." };
  return r;
}

function classify(g: GoalEntry): Extract<DomainRouting, { status: "ROUTED" }> | null {
  const routed = (primary: ReasoningDomain, supporting: ReasoningDomain[], rationale: string, resistanceEmphasis: "strength" | "hypertrophy" | "general" | null = null) => ({ status: "ROUTED" as const, primary, supporting, rationale, supported: SUPPORTED_DOMAINS.has(primary), resistanceEmphasis });
  switch (g.class) {
    case "strength":
      return routed("resistance", [], "Strength goal → resistance training.", "strength");
    case "hypertrophy":
      return routed("resistance", [], "Muscle-gain goal → resistance training.", "hypertrophy");
    case "fat_loss":
    case "weight_gain":
    case "maintenance":
      return routed("weight_management", ["resistance"], `${g.class.replace(/_/g, " ")} is a weight-management problem (energy balance) with resistance training in support — not a hypertrophy plan.`);
    case "recomposition":
      return routed("hybrid", ["resistance", "weight_management"], "Recomposition combines resistance training with weight management.");
    case "endurance":
    case "event_performance":
      return routed("endurance", [], "Endurance / event goal → endurance training.");
    case "sport_performance":
      return routed("sport_performance", ["resistance"], "Sport performance needs sport-specific planning, with resistance in support.");
    case "general_fitness":
      return routed("general_fitness", [], "General health / consistency → general fitness (v1 plans its resistance component as general support).", "general");
    case "other": {
      const text = isKnownText(g.description);
      if (!text) return null;
      if (ENDURANCE_TERMS.test(text)) return routed("endurance", [], `Written goal (“${text.slice(0, 60)}”) names an endurance event or activity.`);
      if (SPORT_TERMS.test(text)) return routed("sport_performance", ["resistance"], `Written goal (“${text.slice(0, 60)}”) names a sport.`);
      if (WEIGHT_TERMS.test(text)) return routed("weight_management", ["resistance"], `Written goal (“${text.slice(0, 60)}”) is about weight change.`);
      if (RESISTANCE_TERMS.test(text)) return null; // ambiguous between strength and hypertrophy → coach classifies
      return null;
    }
  }
}

const isKnownText = (f: Fact<string>): string | null => (isKnown(f) && f.value.trim() ? f.value.trim() : null);
