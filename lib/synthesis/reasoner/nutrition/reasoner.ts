// Nutrition Reasoner V1 — the Fitness Reasoner's architecture applied to nutrition.
//
//   readiness (coach method, goal, no open health review) → coach scope (nutrition coached?) → method complete?
//   → SAFETY GATE (escalate before any model call) → deterministic bounds (energy, protein) → evidence + foods
//   → model (shared core: strict JSON, one repair with validator feedback) → deterministic validation
//   → PLANNED (a proposal for coach review) | NEEDS_COACH_REVIEW (a minor's proposal still containing restrictive
//     items after the repair attempt — never presented as a prescription) | NEEDS_INPUT | ESCALATE | NOT_COACHED |
//     REJECTED | PROVIDER_FAILED
//
// Every call returns a NutritionReasonerRun (versions, hashes, snapshots, bounds, attempts, result) that replays
// what was reviewed without another model call. Nothing here persists, approves or publishes; a proposal is never
// the client's plan — the coach approves (and the existing nutrition_plan_versions lifecycle publishes).

import { randomUUID } from "node:crypto";
import { isKnown } from "../../facts.ts";
import type { MissingInput } from "../../readiness.ts";
import { SHARED_REQUIREMENTS } from "../../readiness.ts";
import type { SynthesisInput } from "../../synthesis-input.ts";
import { NUTRITION_KNOWLEDGE } from "../../knowledge/nutrition/registry.ts";
import { readNutritionMethod, type NutritionMethod } from "../../nutrition/method.ts";
import { estimateEnergy, impliedRate, KG_PER_LB, proteinGrams, scheduleConflicts, trainingContextFromClient, type EnergyEstimate, type TrainingContext } from "../../nutrition/energy.ts";
import { nutritionSafety, type NutritionSafety, type SafetyEscalation } from "../../nutrition/safety.ts";
import { runModelAttempts, type ReasonerModel } from "../core.ts";
import { sha256, type ReasonerAttempt, type ReasonerRunTotals } from "../run.ts";
import { NUTRITION_PROMPT_VERSION, NUTRITION_SYSTEM_PROMPT, parseNutritionOutput, type NutritionPlan } from "./contract.ts";
import { buildNutritionInput, NUTRITION_REASONER_VERSION, type NutritionReasoningInput } from "./input.ts";
import { adjustmentSummary, validateNutritionPlan, type NutritionQualityFinding } from "./validate.ts";

export const NUTRITION_RUN_SCHEMA = "optim.nutrition-reasoner-run.v1";
/** Repair feedback for a minor's restrictive item: remove it, and route the concern to the coach instead. */
export const MINOR_RESTRICTION_FEEDBACK = "OPTIM doesn't prescribe this for a client under 18 — remove it and, if a decrease might be warranted, raise it in coachQuestions for the coach and a qualified professional to decide.";
export const NUTRITION_MAX_OUTPUT_TOKENS = 12000;
export const NUTRITION_PROVIDER_FAILED_MESSAGE = "OPTIM's reasoner couldn't prepare a nutrition strategy right now. Nothing was changed — try again.";

/** What the coach reviews alongside the model's strategy — computed by OPTIM, never by the model. */
export interface NutritionReviewItems {
  /** Confirmations before approval (intake doesn't ask these). */
  screening: string[];
  warnings: string[];
  /** Questions OPTIM itself needs answered (e.g. a restriction it couldn't interpret). */
  questions: string[];
  /** How OPTIM computed the bounds, including which parts are internal heuristics. */
  basis: string[];
  /** V1.1 — OPTIM's own calculation of the weekly change the energy target implies (never the model's arithmetic). */
  rate: { centralPct: [number, number]; plausiblePct: [number, number]; statement: string } | null;
  /** V1.1 — each adjustment's meaning, rendered from its structure (direction, kcal), not its wording. */
  adjustments: string[];
  quality: NutritionQualityFinding[];
}

export type NutritionStatus = "PLANNED" | "NEEDS_COACH_REVIEW" | "NEEDS_INPUT" | "ESCALATE" | "NOT_COACHED" | "REJECTED" | "PROVIDER_FAILED";

export interface NutritionReasonerRun {
  schema: typeof NUTRITION_RUN_SCHEMA;
  runId: string;
  createdAtIso: string;
  status: NutritionStatus;
  versions: { reasoner: string; prompt: string; knowledge: string; coachMethod: { versionId: string; version: number } | null; model: { provider: string; modelId: string } | null };
  hashes: { clientState: string; goalContract: string; input: string | null; systemPrompt: string };
  snapshots: { clientState: SynthesisInput["client"]; goalContract: SynthesisInput["goal"] };
  safety: NutritionSafety | null;
  energy: EnergyEstimate | null;
  training: TrainingContext | null;
  input: NutritionReasoningInput | null;
  attempts: ReasonerAttempt[];
  totals: ReasonerRunTotals;
  result: { plan?: NutritionPlan; review?: NutritionReviewItems; restrictions?: string[]; missing?: MissingInput[]; escalations?: SafetyEscalation[]; message?: string; errors?: string[]; summary?: string };
}

export type NutritionReasonerResult = { run: NutritionReasonerRun } & (
  | { status: "PLANNED"; plan: NutritionPlan; review: NutritionReviewItems; attempts: number }
  /** Under 18: the proposal still contains restrictive items OPTIM won't prescribe autonomously. A qualified human
   * decides; it is not a plan the coach can approve as-is. */
  | { status: "NEEDS_COACH_REVIEW"; plan: NutritionPlan; review: NutritionReviewItems; restrictions: string[]; attempts: number }
  | { status: "NEEDS_INPUT"; source: "readiness" | "method" | "bounds" | "model"; missing: MissingInput[]; summary?: string }
  | { status: "ESCALATE"; escalations: SafetyEscalation[] }
  | { status: "NOT_COACHED"; message: string }
  | { status: "REJECTED"; errors: string[]; attempts: number }
  | { status: "PROVIDER_FAILED"; message: string; attempts: number }
);
type Body = NutritionReasonerResult extends infer R ? (R extends unknown ? Omit<R, "run"> : never) : never;

const READINESS_IDS = new Set(["coach_method_confirmed", "primary_goal", "no_open_health_review"]);

export async function runNutritionReasoner(params: { input: SynthesisInput; model: ReasonerModel | null; nowIso: string; training?: TrainingContext | null; maxAttempts?: number; runId?: string; onDiagnostic?: (d: { stage: string; detail: string }) => void }): Promise<NutritionReasonerResult> {
  const { input } = params;
  const run: NutritionReasonerRun = {
    schema: NUTRITION_RUN_SCHEMA,
    runId: params.runId ?? randomUUID(),
    createdAtIso: params.nowIso,
    status: "PROVIDER_FAILED",
    versions: { reasoner: NUTRITION_REASONER_VERSION, prompt: NUTRITION_PROMPT_VERSION, knowledge: NUTRITION_KNOWLEDGE.version, coachMethod: input.coach ? { versionId: input.coach.versionId, version: input.coach.version } : null, model: params.model ? { provider: params.model.provider, modelId: params.model.modelId } : null },
    hashes: { clientState: sha256(input.client), goalContract: sha256(input.goal), input: null, systemPrompt: sha256(NUTRITION_SYSTEM_PROMPT) },
    snapshots: { clientState: input.client, goalContract: input.goal },
    safety: null,
    energy: null,
    training: null,
    input: null,
    attempts: [],
    totals: { calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 },
    result: {},
  };
  const finish = (body: Body, result: NutritionReasonerRun["result"]): NutritionReasonerResult => {
    run.status = body.status;
    run.result = result;
    return { ...body, run } as NutritionReasonerResult;
  };
  const needs = (source: "readiness" | "method" | "bounds", missing: MissingInput[], summary?: string) => finish({ status: "NEEDS_INPUT", source, missing, ...(summary ? { summary } : {}) }, { missing, ...(summary ? { summary } : {}) });

  // 1. Readiness — the shared requirements that apply to nutrition.
  const missingReady = SHARED_REQUIREMENTS.filter((r) => READINESS_IDS.has(r.id)).flatMap((r) => {
    const res = r.check(input);
    return res === true ? [] : [{ fact: res, why: r.why, blockedDecision: "The nutrition strategy.", providedBy: r.providedBy }];
  });
  if (missingReady.length) return needs("readiness", missingReady);
  const goal = input.goal.primary!.class;
  if (goal === "other") return needs("readiness", [{ fact: "goal_contract.primary.class", why: "The written goal doesn't name a nutrition objective (fat loss, muscle gain, maintenance, performance…); the coach should classify it.", blockedDecision: "The nutrition objective.", providedBy: "coach" }]);
  // Contradictory goal facts: ask, never pick one.
  const nowLb = isKnown(input.client.body.weightLb) ? input.client.body.weightLb.value : null;
  const targetLb = isKnown(input.client.goals.targetWeightLb) ? input.client.goals.targetWeightLb.value : null;
  if (nowLb !== null && targetLb !== null && ((goal === "fat_loss" && targetLb >= nowLb) || (goal === "weight_gain" && targetLb <= nowLb))) return needs("readiness", [{ fact: "onboarding.what_you_want.targetWeight", why: `The goal is ${goal.replace(/_/g, " ")} but the target weight (${targetLb} lb) is ${targetLb >= nowLb ? "at or above" : "at or below"} the current weight (${nowLb} lb) — which is right decides the energy direction.`, blockedDecision: "The nutrition objective and energy target.", providedBy: "either" }]);

  // 2. Coach scope and method.
  const read = readNutritionMethod(input.coach!.method, goal);
  if (!read.ok && read.reason === "not_coached") return finish({ status: "NOT_COACHED", message: read.message }, { message: read.message });
  if (!read.ok) return needs("method", read.missing.map((m) => ({ fact: `coach_brain.${m.key}`, why: m.why, blockedDecision: "The nutrition strategy.", providedBy: "coach" as const })), "The coach's nutrition method is incomplete.");
  const method: NutritionMethod = read.method;

  // 3. Safety gate — before any paid call.
  const safety = nutritionSafety(input.client, input.goal);
  run.safety = safety;
  if (safety.escalations.length) return finish({ status: "ESCALATE", escalations: safety.escalations }, { escalations: safety.escalations });

  // 4. Deterministic bounds.
  const training = params.training ?? trainingContextFromClient(input.client);
  run.training = training;
  const energyRead = estimateEnergy({ client: input.client, goal, method, training, minor: safety.minor });
  const usesCalories = method.approaches.value.some((a) => a === "calories_protein" || a === "full_macros" || a === "meal_plan") && (method.calorieMethod?.value === "formula" || method.calorieMethod?.value === "adaptive_trend");
  if (!energyRead.ok && usesCalories && !method.approaches.value.some((a) => a === "habit_based" || a === "portion_guides")) return needs("bounds", energyRead.missing.map((m) => ({ ...m, blockedDecision: "The energy target.", providedBy: "client" as const })));
  const energy = energyRead.ok ? energyRead.estimate : null;
  run.energy = energy;
  const protein = proteinGrams({ client: input.client, method });
  const questions: string[] = [];
  const notes: string[] = [];
  if (protein && !protein.ok) {
    questions.push(`${protein.why} Confirm it so protein can be set.`);
    notes.push(protein.why);
  }
  const restrictionDetail = isKnown(input.client.nutrition.dietaryRestrictions) && input.client.nutrition.dietaryRestrictions.value.has ? input.client.nutrition.dietaryRestrictions.value.detail : null;

  const conflicts = scheduleConflicts(input.client, training);
  questions.push(...conflicts);
  const { reasoning, allowed } = buildNutritionInput({ input, knowledge: NUTRITION_KNOWLEDGE, method, energy, protein: protein && protein.ok ? protein : null, training, safety, conflicts, promptVersion: NUTRITION_PROMPT_VERSION, notes });
  if (reasoning.restrictions.uninterpreted) questions.push(`OPTIM couldn't map the client's restriction (“${restrictionDetail}”) to specific foods — confirm what it excludes; the food list wasn't narrowed for it.`);
  else if (restrictionDetail === null && isKnown(input.client.nutrition.dietaryRestrictions) && input.client.nutrition.dietaryRestrictions.value.has) questions.push("The client reported a dietary restriction without details — confirm it before approving food choices.");
  run.input = reasoning;
  run.hashes.input = sha256(reasoning);
  if (!params.model) return finish({ status: "PROVIDER_FAILED", message: NUTRITION_PROVIDER_FAILED_MESSAGE, attempts: 0 }, { message: NUTRITION_PROVIDER_FAILED_MESSAGE });

  // 5. Model (shared core) + 6. deterministic validation.
  const weightKg = isKnown(input.client.body.weightLb) ? input.client.body.weightLb.value * KG_PER_LB : null;
  type Done = { kind: "plan"; plan: NutritionPlan; quality: NutritionQualityFinding[]; restrictions: string[] } | { kind: "needs"; missing: MissingInput[]; summary: string };
  const outcome = await runModelAttempts<Done>({
    model: params.model,
    systemPrompt: NUTRITION_SYSTEM_PROMPT,
    userMessage: JSON.stringify(reasoning),
    maxAttempts: params.maxAttempts ?? 2,
    maxOutputTokens: NUTRITION_MAX_OUTPUT_TOKENS,
    record: run,
    onDiagnostic: params.onDiagnostic,
    evaluate: (raw, _attempt, isLast) => {
      const parsed = parseNutritionOutput(raw);
      if (!parsed.ok) return { kind: "retry", stage: "schema", errors: parsed.errors };
      if (parsed.output.status === "NEEDS_INPUT") return { kind: "done", value: { kind: "needs", missing: parsed.output.needsInput, summary: parsed.output.summary } };
      const v = validateNutritionPlan({ plan: parsed.output.plan, reasoning, allowed, method, weightKg, goal });
      if (!v.ok) return { kind: "retry", stage: "validation", errors: [...v.errors, ...v.restrictions.map((r) => `${r} ${MINOR_RESTRICTION_FEEDBACK}`)] };
      // A minor's restrictive items: repair feedback while an attempt remains; afterwards, routed to human review.
      if (v.restrictions.length && !isLast) return { kind: "retry", stage: "validation", errors: v.restrictions.map((r) => `${r} ${MINOR_RESTRICTION_FEEDBACK}`) };
      return { kind: "done", recordErrors: v.restrictions, value: { kind: "plan", plan: parsed.output.plan, quality: v.quality, restrictions: v.restrictions } };
    },
  });
  if (outcome.kind === "provider_failed") return finish({ status: "PROVIDER_FAILED", message: NUTRITION_PROVIDER_FAILED_MESSAGE, attempts: outcome.attempt }, { message: NUTRITION_PROVIDER_FAILED_MESSAGE });
  if (outcome.kind === "rejected") return finish({ status: "REJECTED", errors: outcome.errors, attempts: outcome.attempts }, { errors: outcome.errors });
  const done = outcome.value;
  if (done.kind === "needs") return finish({ status: "NEEDS_INPUT", source: "model", missing: done.missing, summary: done.summary }, { missing: done.missing, summary: done.summary });
  const review: NutritionReviewItems = {
    screening: safety.screening,
    warnings: safety.warnings,
    questions,
    basis: energy ? [`Resting expenditure ${energy.restingKcal.low}–${energy.restingKcal.high} kcal (Mifflin–St Jeor, with its error range).`, `Maintenance ${energy.maintenanceKcal.low}–${energy.maintenanceKcal.high} kcal (× ${energy.activityFactor.low}–${energy.activityFactor.high}: ${energy.activityFactor.basis.join("; ")}).`, ...(energy.targetBand ? [`Target band ${energy.targetBand.low}–${energy.targetBand.high} kcal: ${energy.targetBand.rule}.`] : []), ...energy.heuristics, ...(protein && protein.ok ? [`Protein ${protein.grams.low}–${protein.grams.high} g/day from the coach's ${protein.basis}.`] : [])] : ["No energy estimate (the coach's method doesn't use one, or body measurements are missing)."],
    rate: (() => {
      const k = done.plan.energy.kcal;
      if (!energy || !k || done.plan.energy.mode !== "target") return null;
      const r = impliedRate(energy, k);
      const f = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(2)}`;
      return { centralPct: [r.central.low, r.central.high], plausiblePct: [r.plausible.low, r.plausible.high], statement: `Calculated: ${k.min}–${k.max} kcal against central maintenance ~${Math.round((energy.maintenanceKcal.low + energy.maintenanceKcal.high) / 2)} kcal is about ${f(r.central.low)} to ${f(r.central.high)}% bodyweight/week; with the maintenance uncertainty, anywhere from ${f(r.plausible.low)} to ${f(r.plausible.high)}%. An estimate from a static approximation, not a guarantee — the weekly trend decides.` };
    })(),
    adjustments: done.plan.adjustments.map((a) => `If ${a.signal} (${a.afterWeeks} wk): ${adjustmentSummary(a, done.plan.energy.kcal)}`),
    quality: done.quality,
  };
  if (done.restrictions.length) return finish({ status: "NEEDS_COACH_REVIEW", plan: done.plan, review, restrictions: done.restrictions, attempts: outcome.attempt }, { plan: done.plan, review, restrictions: done.restrictions });
  return finish({ status: "PLANNED", plan: done.plan, review, attempts: outcome.attempt }, { plan: done.plan, review });
}
