// Gate 4.0C-3 — Fitness Reasoner v1.
//
//   route domain → (unsupported? DOMAIN_NOT_YET_SUPPORTED)
//   → readiness (shared + resistance requirements) → NEEDS_INPUT?
//   → retrieve bounded evidence → canonical input
//   → model (strict JSON; one repair attempt with validator feedback)
//   → deterministic expansion → authoritative validation
//   → PLANNED (for coach review) | NEEDS_INPUT | REJECTED | PROVIDER_FAILED
//
// Nothing here persists, approves or publishes. The model never sees raw
// database rows, and it never gets to override validation.

import type { MissingInput } from "../readiness.ts";
import { evaluatePlanningReadiness } from "../readiness.ts";
import type { PlanSpecification, QualityFinding } from "../plan-spec.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { buildPool, methodFor, RESISTANCE_PLANNER } from "../planners/resistance/planner.ts";
import { interpretGoal } from "../planners/resistance/architecture.ts";
import type { StructuredJsonModel } from "../limitations/interpret.ts";
import { routeDomains, type DomainRouting } from "./domains.ts";
import { retrieveEvidence, type EvidencePacket } from "./retrieval.ts";
import { buildReasoningInput, type ReasoningInput } from "./input.ts";
import { parseReasonerOutput, REASONER_PROMPT_VERSION, REASONER_SYSTEM_PROMPT, type ReasonerOutput, type ReasonerPlan } from "./contract.ts";
import { expandReasonerPlan, validateReasonerPlan } from "./expand.ts";

export type ReasonerResult =
  | { status: "DOMAIN_NOT_YET_SUPPORTED"; routing: Extract<DomainRouting, { status: "ROUTED" }>; message: string }
  | { status: "NEEDS_INPUT"; source: "routing" | "readiness" | "planning" | "model"; missing: MissingInput[]; routing?: DomainRouting; summary?: string }
  | { status: "PROVIDER_FAILED"; message: string; attempts: number }
  | { status: "REJECTED"; errors: string[]; attempts: number; evidence: EvidencePacket; output: ReasonerOutput | null }
  | { status: "PLANNED"; spec: PlanSpecification; plan: ReasonerPlan; quality: QualityFinding[]; evidence: EvidencePacket; reasoning: ReasoningInput; attempts: number; modelId: string };

export const PROVIDER_FAILED_MESSAGE = "OPTIM's reasoner couldn't produce a plan right now. Nothing was changed — try again, or review the deterministic planner's proposal.";

export async function runFitnessReasoner(params: { input: SynthesisInput; model: StructuredJsonModel | null; nowIso: string; maxAttempts?: number; onDiagnostic?: (d: { stage: string; detail: string }) => void }): Promise<ReasonerResult> {
  const { input } = params;
  // 1. Domain routing — before anything else.
  const routing = routeDomains(input.goal);
  if (routing.status === "NEEDS_INPUT") return { status: "NEEDS_INPUT", source: "routing", missing: [{ fact: routing.fact, why: routing.why, blockedDecision: "Which kind of plan to build.", providedBy: "coach" }], routing };
  if (!routing.supported) return { status: "DOMAIN_NOT_YET_SUPPORTED", routing, message: `This goal routes to ${routing.primary.replace(/_/g, " ")} planning, which Fitness Reasoner v1 doesn't support yet. No plan was generated — it will not fall back to a resistance template.` };

  // 2. Readiness — the same shared + resistance requirements the deterministic planner uses.
  const readiness = evaluatePlanningReadiness(input, RESISTANCE_PLANNER.requirements);
  if (readiness.status === "NEEDS_INPUT") return { status: "NEEDS_INPUT", source: "readiness", missing: readiness.missing, routing };
  const read = methodFor(input)!;
  if (!read.ok) return { status: "NEEDS_INPUT", source: "readiness", missing: read.missing.map((m) => ({ fact: `coach_brain.${m.key}`, why: m.why, blockedDecision: "Resistance programming.", providedBy: "coach" })), routing };
  const method = read.method;

  // 3. Retrieval over the eligible pool only.
  const pool = buildPool(input, method)!;
  const emphasis = interpretGoal(input.goal);
  const evidence = retrieveEvidence({ knowledge: input.knowledge, domain: routing.primary, emphasis: routing.resistanceEmphasis ?? "general", secondary: emphasis?.secondary ?? null, candidates: pool.pool });
  if (evidence.exercises.length < 2) return { status: "NEEDS_INPUT", source: "planning", missing: [{ fact: "coach_decision.eligible_exercises", why: "Constraints, equipment and known apparatus leave fewer than two eligible exercises.", blockedDecision: "Exercise selection.", providedBy: "coach" }], routing };
  const unresolved = [...pool.unknownApparatus.entries()].map(([a, ids]) => ({ fact: `client.apparatus.${a}`, why: `Unknown whether a ${a.replace(/_/g, " ")} is available; ${ids.length} exercise(s) needing it were left out.` }));
  const { reasoning, allowed } = buildReasoningInput({ input, method, routing, secondary: emphasis?.secondary ?? null, evidence, promptVersion: REASONER_PROMPT_VERSION, unresolved });

  // 4. Model + 5. deterministic validation (one repair attempt).
  if (!params.model) return { status: "PROVIDER_FAILED", message: PROVIDER_FAILED_MESSAGE, attempts: 0 };
  const maxAttempts = params.maxAttempts ?? 2;
  let feedback: string[] = [];
  let lastOutput: ReasonerOutput | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: unknown;
    try {
      raw = await params.model.generateJson({
        systemPrompt: REASONER_SYSTEM_PROMPT,
        userMessage: JSON.stringify(reasoning) + (feedback.length ? `\n\nYour previous output was rejected by OPTIM's validators:\n- ${feedback.join("\n- ")}\nReturn a corrected JSON object.` : ""),
        maxOutputTokens: 20000,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "unknown";
      params.onDiagnostic?.({ stage: "provider", detail: name });
      // Unreadable/truncated JSON is an output problem worth one repair; anything else is a provider failure.
      if (name === "AiProviderInvalidOutputError" || name === "SyntaxError") {
        feedback = ["Your output was not one complete, valid JSON object. Keep every text field to one short sentence and return only the JSON."];
        continue;
      }
      return { status: "PROVIDER_FAILED", message: PROVIDER_FAILED_MESSAGE, attempts: attempt };
    }
    const parsed = parseReasonerOutput(raw);
    if (!parsed.ok) {
      feedback = parsed.errors;
      params.onDiagnostic?.({ stage: "schema", detail: parsed.errors.join("; ").slice(0, 300) });
      continue;
    }
    lastOutput = parsed.output;
    if (parsed.output.status === "NEEDS_INPUT") return { status: "NEEDS_INPUT", source: "model", missing: parsed.output.needsInput, routing, summary: parsed.output.summary };
    const plan = parsed.output.plan;
    const spec = expandReasonerPlan({ plan, reasoning, method, input, model: { provider: "anthropic", modelId: params.model.modelId, promptVersion: REASONER_PROMPT_VERSION, attempts: attempt }, nowIso: params.nowIso });
    const v = validateReasonerPlan({ plan, spec, reasoning, allowed, method, input });
    if (v.ok) {
      const unattributed = (["frequency", "schedule", "weeklyStructure", "progression"] as const).filter((k) => spec[k]?.inputs.includes("reasoner:unattributed"));
      const quality = [...v.quality, ...unattributed.map((k): QualityFinding => ({ code: "unattributed_decision", severity: "warning", message: `The ${k} decision didn't cite the coach rules, client facts or evidence it used.` }))];
      spec.quality = quality;
      return { status: "PLANNED", spec, plan, quality, evidence, reasoning, attempts: attempt, modelId: params.model.modelId };
    }
    feedback = v.errors;
    params.onDiagnostic?.({ stage: "validation", detail: v.errors.join("; ").slice(0, 300) });
  }
  return { status: "REJECTED", errors: feedback, attempts: maxAttempts, evidence, output: lastOutput };
}
