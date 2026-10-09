// Unified Program U1 — offline fixtures. Reuses each domain's own fixtures and scripted models: a ROUTER model
// dispatches each domain's call (by its system prompt) to that domain's rail-respecting scripted model, so the unified
// layer is exercised end to end without a provider. Scripted models test rails and coordination, not coaching quality.

import type { ConfirmedCoachMethod } from "../../../coach/coach-brain.ts";
import type { ReasonerModel } from "../../reasoner/core.ts";
import { REASONER_SYSTEM_PROMPT } from "../../reasoner/contract.ts";
import { CARDIO_SYSTEM_PROMPT } from "../../reasoner/cardio/contract.ts";
import { NUTRITION_SYSTEM_PROMPT } from "../../reasoner/nutrition/contract.ts";
import { scriptedOutput, range } from "../../reasoner/eval/fixtures.ts";
import { scriptedCardio } from "../../reasoner/cardio/eval/fixtures.ts";
import { nutritionCoach, scriptedNutrition } from "../../reasoner/nutrition/eval/fixtures.ts";
import type { DomainId } from "../contract.ts";

export { NOW, scenarioInput, restrict, layer, range, coachMethod } from "../../reasoner/eval/fixtures.ts";
export { programContent, LOWER, UPPER } from "../../reasoner/cardio/eval/fixtures.ts";

/** The cardio part of a training coach's method (health / conditioning / fat loss, talk test + RPE). */
export const CARDIO_METHOD = {
  t_cardio_roles: ["health", "conditioning", "fat_loss"],
  t_cardio_health_minutes: range(90, 150, "min/week"),
  t_conditioning_minutes: range(60, 120, "min/week"),
  t_cardio_fat_loss_minutes: range(120, 250, "min/week"),
  g_intensity_guide: ["talk_test", "rpe"],
};

/** A coach who programs resistance, prescribes cardio and coaches nutrition (full scope). */
export function fullCoach(over: Record<string, unknown> = {}): ConfirmedCoachMethod {
  return nutritionCoach({ practice_goals: ["get_stronger", "build_muscle", "lose_fat", "recomposition", "general_health"], ...CARDIO_METHOD, ...over });
}

type Respond = (ri: never, attempt: number) => unknown;
/** One model for the whole program; each domain's call goes to that domain's scripted model (or an override). */
export function routerModel(over: Partial<Record<DomainId, Respond>> = {}): ReasonerModel & { calls: Record<DomainId, number> } {
  const calls: Record<DomainId, number> = { resistance: 0, cardio: 0, nutrition: 0 };
  return {
    provider: "scripted",
    modelId: "scripted-router",
    calls,
    async generate(req) {
      const domain: DomainId | null = req.systemPrompt === REASONER_SYSTEM_PROMPT ? "resistance" : req.systemPrompt === CARDIO_SYSTEM_PROMPT ? "cardio" : req.systemPrompt === NUTRITION_SYSTEM_PROMPT ? "nutrition" : null;
      if (!domain) throw new Error("unknown domain prompt");
      calls[domain]++;
      const ri = JSON.parse(req.userMessage.split("\n\nYour previous output was rejected")[0]) as never;
      const json = over[domain] ? over[domain]!(ri, calls[domain]) : domain === "resistance" ? scriptedOutput(ri) : domain === "cardio" ? scriptedCardio(ri) : scriptedNutrition(ri);
      return { json, usage: { inputTokens: Math.ceil(req.userMessage.length / 4), outputTokens: 1000 }, latencyMs: 1, requestId: `req_router_${domain}_${calls[domain]}` };
    },
  };
}
