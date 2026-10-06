// Gate 4.0C-3 / 3A — Fitness Reasoner v1.1.
//
//   route domain → (unsupported? DOMAIN_NOT_YET_SUPPORTED)
//   → readiness (shared + resistance requirements) → NEEDS_INPUT?
//   → retrieve bounded evidence → compact canonical input
//     (confirmed structured constraints only — raw wording is context-only)
//   → model (strict JSON; one repair attempt with validator feedback)
//   → deterministic expansion → authoritative validation
//   → PLANNED (for coach review) | NEEDS_INPUT | REJECTED | PROVIDER_FAILED
//
// Every call returns a ReasonerRun artifact that can re-render exactly
// what was reviewed without another model call. Nothing here persists,
// approves or publishes.

import { randomUUID } from "node:crypto";
import type { MissingInput } from "../readiness.ts";
import { evaluatePlanningReadiness } from "../readiness.ts";
import type { PlanSpecification, QualityFinding } from "../plan-spec.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { isKnown } from "../facts.ts";
import { FOUNDATION_KNOWLEDGE_VERSION } from "../knowledge/registry.ts";
import { buildPool, methodFor, RESISTANCE_PLANNER } from "../planners/resistance/planner.ts";
import { interpretGoal } from "../planners/resistance/architecture.ts";
import { routeDomains, type DomainRouting } from "./domains.ts";
import { retrieveEvidence, type EvidencePacket } from "./retrieval.ts";
import { buildReasoningInput, REASONER_VERSION, type ReasoningInput } from "./input.ts";
import { parseReasonerOutput, REASONER_PROMPT_VERSION, REASONER_SYSTEM_PROMPT, type ReasonerPlan } from "./contract.ts";
import { expandReasonerPlan, validateReasonerPlan } from "./expand.ts";
import { REASONER_RUN_SCHEMA, sha256, type ReasonerAttempt, type ReasonerRun, type RunPreflight } from "./run.ts";
import { evaluateAdequacy, fitOf, functionAvailability, goalRequiredTargets, type AdequacyResult, type FunctionAvailability, type WeekSession } from "./adequacy.ts";
import { planningState } from "../planning-state.ts";

/** The model boundary the reasoner needs (lib/ai's provider implements it). */
export interface ReasonerModel {
  provider: string;
  modelId: string;
  generate(request: { systemPrompt: string; userMessage: string; maxOutputTokens: number }): Promise<{ json: unknown; usage?: { inputTokens: number; outputTokens: number }; requestId?: string; latencyMs?: number }>;
}

export type ReasonerResult = { run: ReasonerRun } & (
  | { status: "DOMAIN_NOT_YET_SUPPORTED"; routing: Extract<DomainRouting, { status: "ROUTED" }>; message: string }
  | { status: "NEEDS_INPUT"; source: "routing" | "readiness" | "planning" | "model" | "preflight"; missing: MissingInput[]; routing?: DomainRouting; summary?: string }
  | { status: "PROVIDER_FAILED"; message: string; attempts: number }
  | { status: "REJECTED"; errors: string[]; attempts: number; evidence: EvidencePacket }
  | { status: "PLANNED"; spec: PlanSpecification; plan: ReasonerPlan; quality: QualityFinding[]; evidence: EvidencePacket; reasoning: ReasoningInput; attempts: number; modelId: string; adequacy?: AdequacyResult }
);

type ResultBody = ReasonerResult extends infer R ? (R extends unknown ? Omit<R, "run"> : never) : never;

export const PROVIDER_FAILED_MESSAGE = "OPTIM's reasoner couldn't produce a plan right now. Nothing was changed — try again, or review the deterministic planner's proposal.";
export const MAX_OUTPUT_TOKENS = 16000;

/**
 * uncertainFit (Gate 4.0C-5): "withhold" (default) — exercises whose constraint fit OPTIM can't establish never enter
 * synthesis; if one is the ONLY way to train a required target (or is a goal target's exercise), the run stops BEFORE
 * any model call and asks the coach (preflight). "legacy_allow" reproduces pre-4.0C-5 runs (U offered, coach decides
 * after generation) — tests and replays of historical drafts only.
 */
export async function runFitnessReasoner(params: { input: SynthesisInput; model: ReasonerModel | null; nowIso: string; maxAttempts?: number; runId?: string; uncertainFit?: "withhold" | "legacy_allow"; onDiagnostic?: (d: { stage: string; detail: string }) => void }): Promise<ReasonerResult> {
  const { input } = params;
  const run: ReasonerRun = {
    schema: REASONER_RUN_SCHEMA,
    runId: params.runId ?? randomUUID(),
    createdAtIso: params.nowIso,
    status: "PROVIDER_FAILED",
    versions: { reasoner: REASONER_VERSION, prompt: REASONER_PROMPT_VERSION, knowledge: FOUNDATION_KNOWLEDGE_VERSION, coachMethod: input.coach ? { versionId: input.coach.versionId, version: input.coach.version } : null, model: params.model ? { provider: params.model.provider, modelId: params.model.modelId } : null },
    hashes: { clientState: sha256(input.client), goalContract: sha256(input.goal), constraintSet: sha256(input.constraints), input: null, systemPrompt: sha256(REASONER_SYSTEM_PROMPT) },
    snapshots: { clientState: input.client, goalContract: input.goal, constraintSet: input.constraints },
    routing: { status: "NEEDS_INPUT", fact: "", why: "" },
    retrievedKnowledge: [],
    evidence: null,
    input: null,
    attempts: [],
    result: {},
    totals: { calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 },
    planningState: planningState({ client: input.client, goal: input.goal, constraints: input.constraints, coachMethodVersionId: input.coach?.versionId ?? null, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION, exerciseName: (id) => input.knowledge.getExercise(id)?.name ?? id }),
  };
  const finish = (r: ResultBody, result: ReasonerRun["result"]): ReasonerResult => {
    run.status = r.status;
    run.result = result;
    return { ...r, run } as ReasonerResult;
  };

  // 1. Domain routing — before anything else.
  const routing = routeDomains(input.goal);
  run.routing = routing;
  if (routing.status === "NEEDS_INPUT") {
    const missing = [{ fact: routing.fact, why: routing.why, blockedDecision: "Which kind of plan to build.", providedBy: "coach" as const }];
    return finish({ status: "NEEDS_INPUT", source: "routing", missing, routing }, { missing, needsInputSource: "routing" });
  }
  if (!routing.supported) {
    const message = `This goal routes to ${routing.primary.replace(/_/g, " ")} planning, which Fitness Reasoner v1 doesn't support yet. No plan was generated — it will not fall back to a resistance template.`;
    return finish({ status: "DOMAIN_NOT_YET_SUPPORTED", routing, message }, { message });
  }

  // 2. Readiness — the same shared + resistance requirements the deterministic planner uses.
  const readiness = evaluatePlanningReadiness(input, RESISTANCE_PLANNER.requirements);
  if (readiness.status === "NEEDS_INPUT") return finish({ status: "NEEDS_INPUT", source: "readiness", missing: readiness.missing, routing }, { missing: readiness.missing, needsInputSource: "readiness" });
  const read = methodFor(input)!;
  if (!read.ok) {
    const missing = read.missing.map((m) => ({ fact: `coach_brain.${m.key}`, why: m.why, blockedDecision: "Resistance programming.", providedBy: "coach" as const }));
    return finish({ status: "NEEDS_INPUT", source: "readiness", missing, routing }, { missing, needsInputSource: "readiness" });
  }
  const method = read.method;
  // A client session cap below the coach's minimum is a coach decision, not something to plan around silently.
  const len = isKnown(input.client.schedule.maxSessionLength) ? input.client.schedule.maxSessionLength.value : null;
  if (len && !len.openEnded && method.sessionLength && len.minutes < method.sessionLength.value.min) {
    const missing = [{ fact: "coach_decision.session_length_below_minimum", why: `The client has ${len.minutes} min per session; the coach's sessions run ${method.sessionLength.value.min}–${method.sessionLength.value.max} min.`, blockedDecision: "Session contents.", providedBy: "coach" as const }];
    return finish({ status: "NEEDS_INPUT", source: "readiness", missing, routing }, { missing, needsInputSource: "readiness" });
  }

  // 3. Material-uncertainty preflight (Gate 4.0C-5) — deterministic, before any paid call.
  const pool = buildPool(input, method)!;
  const legacy = params.uncertainFit === "legacy_allow";
  const fit = (id: string) => fitOf(pool.loadConditions.get(id));
  const availability: FunctionAvailability[] = functionAvailability(pool.pool, pool.loadConditions).map((f) => (legacy && f.state === "uncertain_only" ? { ...f, state: "available" } : f));
  const withheld = legacy ? [] : pool.pool.filter((e) => fit(e.id) === "U");
  const preflight: RunPreflight = { policy: legacy ? "legacy_allow" : "withhold", functions: availability, withheld: withheld.map((e) => e.id), questions: [] };
  run.preflight = preflight;
  if (!legacy) {
    // Only what the GOAL requires can block planning: a goal-priority muscle whose only options are uncertain.
    const required = new Set<string>(goalRequiredTargets(input.goal));
    const ask = new Map<string, Set<string>>();
    for (const f of availability) if (f.state === "uncertain_only" && required.has(f.target)) for (const id of f.uncertain) ask.set(id, (ask.get(id) ?? new Set()).add(f.target));
    // A structured goal target whose own exercise is uncertain: the goal names it, so the coach decides before planning.
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const t of input.goal.performanceTargets) {
      const ex = input.knowledge.getExercise(t.exercise) ?? input.knowledge.exercises().find((e) => [e.name, ...e.aliases].some((n) => norm(n) === norm(t.exercise)));
      if (ex && pool.pool.some((p) => p.id === ex.id) && fit(ex.id) === "U") ask.set(ex.id, (ask.get(ex.id) ?? new Set()).add(`goal target ${t.exercise}`));
    }
    if (ask.size) {
      preflight.questions = [...ask].map(([id, serves]) => {
        const lc = pool.loadConditions.get(id)!.find((c) => c.certainty === "uncertain")!;
        return { exerciseId: id, exerciseName: input.knowledge.getExercise(id)?.name ?? id, serves: [...serves], restriction: `nothing needing ${lc.demand.replace(/_/g, " ")} at ${lc.limit} or above`, conditions: lc.conditions };
      });
      const missing: MissingInput[] = preflight.questions.map((q) => ({ fact: `exercise_fit.${q.exerciseId}`, why: `OPTIM can't confirm ${q.exerciseName} stays within the client's confirmed restriction (${q.restriction}), and it's the only way left to train ${q.serves.map((x) => x.replace(/_/g, " ")).join(", ")}. Decide whether it fits under these conditions — ${q.conditions.join("; ")} — or exclude it.`, blockedDecision: `Exercise selection for ${q.serves.map((x) => x.replace(/_/g, " ")).join(", ")}.`, providedBy: "coach" }));
      return finish({ status: "NEEDS_INPUT", source: "preflight", missing, routing, summary: "Before OPTIM plans, confirm whether these exercises fit the client's restrictions." }, { missing, needsInputSource: "preflight" });
    }
  }
  const offered = pool.pool.filter((e) => !withheld.includes(e));
  const requiredTargets = goalRequiredTargets(input.goal);
  const functions = {
    considered: availability.map((f) => f.target),
    required: requiredTargets,
    unavailable: availability.filter((f) => f.state !== "available").map((f) => ({ target: f.target, why: f.state === "uncertain_only" ? "Only exercises whose fit with the restrictions is unconfirmed train it; they are withheld until the coach decides." : "No eligible exercise trains it under the current restrictions and equipment." })),
  };

  // 4. Retrieval over the offered pool only.
  const emphasis = interpretGoal(input.goal);
  const evidence = retrieveEvidence({ knowledge: input.knowledge, domain: routing.primary, emphasis: routing.resistanceEmphasis ?? "general", secondary: emphasis?.secondary ?? null, candidates: offered });
  run.evidence = evidence;
  run.retrievedKnowledge = evidence.retrievedRefs.map((ref) => ({ ref, version: input.knowledge.ref(ref.split("#")[0])?.version ?? null }));
  if (evidence.exercises.length < 2) {
    const missing = [{ fact: "coach_decision.eligible_exercises", why: "Constraints, equipment and known apparatus leave fewer than two eligible exercises.", blockedDecision: "Exercise selection.", providedBy: "coach" as const }];
    return finish({ status: "NEEDS_INPUT", source: "planning", missing, routing }, { missing, needsInputSource: "planning" });
  }
  const unresolved = [...pool.unknownApparatus.entries()].map(([a, ids]) => ({ fact: `client.apparatus.${a}`, why: `Unknown whether a ${a.replace(/_/g, " ")} is available; ${ids.length} exercise(s) needing it were left out.` }));
  const { reasoning, allowed, contextOnly, constraintIdMap } = buildReasoningInput({ input, method, routing, secondary: emphasis?.secondary ?? null, evidence, promptVersion: REASONER_PROMPT_VERSION, unresolved, pool, functions });
  run.input = reasoning;
  run.hashes.input = sha256(reasoning);

  // 5. Model + 6. deterministic validation and current-state adequacy (one repair attempt).
  if (!params.model) return finish({ status: "PROVIDER_FAILED", message: PROVIDER_FAILED_MESSAGE, attempts: 0 }, { message: PROVIDER_FAILED_MESSAGE });
  const maxAttempts = params.maxAttempts ?? 2;
  let feedback: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rec: ReasonerAttempt = { attempt, raw: null, parseErrors: [], validationErrors: [], usage: null, latencyMs: null, requestId: null, providerError: null };
    run.attempts.push(rec);
    run.totals.calls++;
    let raw: unknown;
    try {
      const res = await params.model.generate({
        systemPrompt: REASONER_SYSTEM_PROMPT,
        userMessage: JSON.stringify(reasoning) + (feedback.length ? `\n\nYour previous output was rejected by OPTIM's validators:\n- ${feedback.join("\n- ")}\nReturn a corrected JSON object.` : ""),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      raw = res.json;
      rec.usage = res.usage ?? null;
      rec.latencyMs = res.latencyMs ?? null;
      rec.requestId = res.requestId && /^[A-Za-z0-9_\-]{6,80}$/.test(res.requestId) ? res.requestId : null;
      run.totals.inputTokens += res.usage?.inputTokens ?? 0;
      run.totals.outputTokens += res.usage?.outputTokens ?? 0;
      run.totals.latencyMs += res.latencyMs ?? 0;
    } catch (err) {
      const name = err instanceof Error ? err.name : "unknown";
      // Gate 4.0C-3A: an executed-but-unusable call (e.g. truncated at max_tokens) still consumed tokens — record them.
      const meta = err as { usage?: { inputTokens: number; outputTokens: number }; truncated?: boolean };
      const truncated = meta.truncated === true;
      rec.providerError = truncated ? `${name}:max_tokens` : name;
      if (meta.usage && Number.isFinite(meta.usage.inputTokens) && Number.isFinite(meta.usage.outputTokens)) {
        rec.usage = { inputTokens: meta.usage.inputTokens, outputTokens: meta.usage.outputTokens };
        run.totals.inputTokens += meta.usage.inputTokens;
        run.totals.outputTokens += meta.usage.outputTokens;
      }
      params.onDiagnostic?.({ stage: "provider", detail: name });
      // Unreadable/truncated JSON is an output problem worth one repair; anything else is a provider failure.
      if (name === "AiProviderInvalidOutputError" || name === "SyntaxError") {
        feedback = ["Your output was not one complete, valid JSON object. Keep text fields short and return only the JSON."];
        continue;
      }
      return finish({ status: "PROVIDER_FAILED", message: PROVIDER_FAILED_MESSAGE, attempts: attempt }, { message: PROVIDER_FAILED_MESSAGE });
    }
    rec.raw = raw;
    const parsed = parseReasonerOutput(raw);
    if (!parsed.ok) {
      rec.parseErrors = parsed.errors;
      feedback = parsed.errors;
      params.onDiagnostic?.({ stage: "schema", detail: parsed.errors.join("; ").slice(0, 300) });
      continue;
    }
    if (parsed.output.status === "NEEDS_INPUT") return finish({ status: "NEEDS_INPUT", source: "model", missing: parsed.output.needsInput, routing, summary: parsed.output.summary }, { missing: parsed.output.needsInput, needsInputSource: "model", summary: parsed.output.summary });
    const plan = parsed.output.plan;
    const spec = expandReasonerPlan({ plan, reasoning, contextOnly, constraintIdMap, method, input, model: { provider: params.model.provider, modelId: params.model.modelId, promptVersion: REASONER_PROMPT_VERSION, attempts: attempt }, nowIso: params.nowIso, allowed });
    const v = validateReasonerPlan({ plan, spec, reasoning, allowed, method, input });
    // Gate 4.0C-5 — current-state adequacy: deficiencies are validator feedback while attempts remain; on the last
    // attempt they are recorded and block approval in review (never presented as review-ready).
    const adequacy = v.ok ? evaluateAdequacy({ week: weekFromPlan(plan), knowledge: input.knowledge, functions: availability, required: requiredTargets, declared: plan.coverage ?? null, checkSessions: true }) : null;
    const deficiencies = adequacy?.findings.filter((f) => f.kind === "deficiency").map((f) => f.message) ?? [];
    if (v.ok && (!deficiencies.length || attempt === maxAttempts)) {
      const unattributed = (["frequency", "schedule", "weeklyStructure", "progression"] as const).filter((k) => spec[k]?.inputs.includes("reasoner:unattributed"));
      const quality = [...v.quality, ...unattributed.map((k): QualityFinding => ({ code: "unattributed_decision", severity: "warning", message: `The ${k} decision didn't cite the coach rules, client facts or evidence it used.` }))];
      spec.quality = quality;
      if (deficiencies.length) rec.validationErrors = deficiencies;
      return finish({ status: "PLANNED", spec, plan, quality, evidence, reasoning, attempts: attempt, modelId: params.model.modelId, adequacy: adequacy! }, { plan, spec, quality, adequacy: adequacy! });
    }
    rec.validationErrors = v.ok ? deficiencies : v.errors;
    feedback = v.ok ? deficiencies : v.errors;
    params.onDiagnostic?.({ stage: "validation", detail: v.errors.join("; ").slice(0, 300) });
  }
  return finish({ status: "REJECTED", errors: feedback, attempts: maxAttempts, evidence }, { errors: feedback });
}

/** One training week as planned (listed sets), for adequacy. */
function weekFromPlan(plan: ReasonerPlan): WeekSession[] {
  return plan.sessions.map((s) => ({ day: s.day, title: s.title, targets: s.targets ?? null, items: s.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.exerciseId, sets: e.sets })) }));
}

/** Re-renders a saved run exactly as reviewed — never calls a model. */
export function replayRun(run: ReasonerRun): ReasonerResult {
  const r = run.result;
  switch (run.status) {
    case "PLANNED":
      return { run, status: "PLANNED", spec: r.spec!, plan: r.plan!, quality: r.quality ?? [], evidence: run.evidence!, reasoning: run.input!, attempts: run.attempts.length, modelId: run.versions.model?.modelId ?? "", ...(r.adequacy ? { adequacy: r.adequacy } : {}) };
    case "NEEDS_INPUT":
      return { run, status: "NEEDS_INPUT", source: (r.needsInputSource as "routing" | "readiness" | "planning" | "model" | "preflight") ?? "readiness", missing: r.missing ?? [], routing: run.routing, summary: r.summary };
    case "DOMAIN_NOT_YET_SUPPORTED":
      return { run, status: "DOMAIN_NOT_YET_SUPPORTED", routing: run.routing as Extract<DomainRouting, { status: "ROUTED" }>, message: r.message ?? "" };
    case "REJECTED":
      return { run, status: "REJECTED", errors: r.errors ?? [], attempts: run.attempts.length, evidence: run.evidence! };
    case "PROVIDER_FAILED":
      return { run, status: "PROVIDER_FAILED", message: r.message ?? PROVIDER_FAILED_MESSAGE, attempts: run.attempts.length };
  }
}
