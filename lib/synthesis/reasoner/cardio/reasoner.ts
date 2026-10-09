// Cardio Reasoner V1.1 — the Fitness Reasoner's architecture applied to cardiovascular training.
//
//   readiness (coach method, goal, no open health review) → routing (race/event & sport conditioning UNSUPPORTED —
//   never routed into resistance planning) → coach scope (does this coach prescribe cardio?) → method complete?
//   → SAFETY GATE (escalate before any model call) → restrictions OPTIM can match (uninterpreted wording → NEEDS_INPUT)
//   → modality eligibility + equipment → the resistance week cardio must fit around → deterministic bounds
//   → model (shared core: strict JSON, one repair with validator feedback) → deterministic validation
//   → PLANNED (a proposal for coach review) | NEEDS_INPUT | ESCALATE | NOT_COACHED | UNSUPPORTED | REJECTED |
//     PROVIDER_FAILED
//
// Every call returns a CardioReasonerRun that replays what was reviewed without another model call. Nothing here
// persists, approves or publishes, and nothing reads or changes resistance or nutrition prescriptions.

import { randomUUID } from "node:crypto";
import { isKnown } from "../../facts.ts";
import type { MissingInput } from "../../readiness.ts";
import { SHARED_REQUIREMENTS } from "../../readiness.ts";
import type { SynthesisInput } from "../../synthesis-input.ts";
import { effectiveConstraints } from "../../constraints.ts";
import { CARDIO_KNOWLEDGE } from "../../knowledge/cardio/registry.ts";
import { readCardioMethod } from "../../cardio/method.ts";
import { routeCardio } from "../../cardio/routing.ts";
import { cardioSafety, type CardioSafety } from "../../cardio/safety.ts";
import { modalityOptions, type ModalityOption } from "../../cardio/eligibility.ts";
import { cardioCapacity, scheduleConflicts, type ResistanceWeek } from "../../cardio/schedule.ts";
import { runModelAttempts, type ReasonerModel } from "../core.ts";
import { sha256, type ReasonerAttempt, type ReasonerRunTotals } from "../run.ts";
import { CARDIO_PROMPT_VERSION, CARDIO_SYSTEM_PROMPT, parseCardioOutput, type CardioPlan } from "./contract.ts";
import { buildCardioInput, CARDIO_REASONER_VERSION, type CardioReasoningInput } from "./input.ts";
import { validateCardioPlan, type CardioQualityFinding, type CardioWorkload } from "./validate.ts";

export const CARDIO_RUN_SCHEMA = "optim.cardio-reasoner-run.v1";
export const CARDIO_MAX_OUTPUT_TOKENS = 10000;
export const CARDIO_PROVIDER_FAILED_MESSAGE = "OPTIM's reasoner couldn't prepare a cardio proposal right now. Nothing was changed — try again.";

export type CardioEscalation = { code: string; why: string };

/** What the coach reviews alongside the model's proposal — computed by OPTIM, never by the model. */
export interface CardioReviewItems {
  screening: string[];
  warnings: string[];
  questions: string[];
  /** Each schedule conflict with the model's prepared decision (options + recommendation) — never applied silently. */
  conflictDecisions: Array<{ conflict: string; text: string; question: string | null; options: string[]; recommended: string | null; why: string | null }>;
  /** OPTIM's week-by-week reading of the progression, rendered from its structure (not the model's wording). */
  progression: string[];
  /** OPTIM's own accounting of the proposed week across cardio and resistance. */
  workload: CardioWorkload & { statement: string };
  basis: string[];
  /** Modalities OPTIM withheld, and why (restrictions OPTIM could match; uncertain fits go to the coach). */
  withheld: Array<{ modality: string; why: string }>;
  quality: CardioQualityFinding[];
}

export type CardioStatus = "PLANNED" | "NEEDS_INPUT" | "ESCALATE" | "NOT_COACHED" | "UNSUPPORTED" | "REJECTED" | "PROVIDER_FAILED";

export interface CardioReasonerRun {
  schema: typeof CARDIO_RUN_SCHEMA;
  runId: string;
  createdAtIso: string;
  status: CardioStatus;
  versions: { reasoner: string; prompt: string; knowledge: string; coachMethod: { versionId: string; version: number } | null; model: { provider: string; modelId: string } | null };
  hashes: { clientState: string; goalContract: string; resistance: string | null; input: string | null; systemPrompt: string };
  snapshots: { clientState: SynthesisInput["client"]; goalContract: SynthesisInput["goal"]; resistance: ResistanceWeek | null };
  safety: CardioSafety | null;
  input: CardioReasoningInput | null;
  attempts: ReasonerAttempt[];
  totals: ReasonerRunTotals;
  result: { plan?: CardioPlan; review?: CardioReviewItems; missing?: MissingInput[]; escalations?: CardioEscalation[]; message?: string; errors?: string[]; summary?: string };
}

export type CardioReasonerResult = { run: CardioReasonerRun } & (
  | { status: "PLANNED"; plan: CardioPlan; review: CardioReviewItems; attempts: number }
  | { status: "NEEDS_INPUT"; source: "readiness" | "method" | "restrictions" | "model"; missing: MissingInput[]; summary?: string }
  | { status: "ESCALATE"; escalations: CardioEscalation[] }
  | { status: "NOT_COACHED"; message: string }
  | { status: "UNSUPPORTED"; message: string }
  | { status: "REJECTED"; errors: string[]; attempts: number }
  | { status: "PROVIDER_FAILED"; message: string; attempts: number }
);
type Body = CardioReasonerResult extends infer R ? (R extends unknown ? Omit<R, "run"> : never) : never;

const READINESS_IDS = new Set(["coach_method_confirmed", "primary_goal", "available_days", "no_open_health_review"]);

/** Limitations OPTIM can't match against modalities: free text no coach-confirmed structured restriction expresses. */
function uninterpretedLimitations(input: SynthesisInput): string[] {
  const structured = input.client.health.review.coachStructuredLimitations;
  if (isKnown(structured) && structured.value.noExerciseRestrictions) return [];
  return effectiveConstraints(input.constraints)
    .filter((c) => (c.category === "injury_or_pain" || c.category === "movement_restriction") && !c.interpretedBy && c.tags.some((t) => t.kind === "free_text" || t.kind === "body_area"))
    .map((c) => c.description);
}

export async function runCardioReasoner(params: { input: SynthesisInput; model: ReasonerModel | null; nowIso: string; resistance?: ResistanceWeek | null; maxAttempts?: number; runId?: string; onDiagnostic?: (d: { stage: string; detail: string }) => void }): Promise<CardioReasonerResult> {
  const { input } = params;
  const resistance = params.resistance ?? null;
  const run: CardioReasonerRun = {
    schema: CARDIO_RUN_SCHEMA,
    runId: params.runId ?? randomUUID(),
    createdAtIso: params.nowIso,
    status: "PROVIDER_FAILED",
    versions: { reasoner: CARDIO_REASONER_VERSION, prompt: CARDIO_PROMPT_VERSION, knowledge: CARDIO_KNOWLEDGE.version, coachMethod: input.coach ? { versionId: input.coach.versionId, version: input.coach.version } : null, model: params.model ? { provider: params.model.provider, modelId: params.model.modelId } : null },
    hashes: { clientState: sha256(input.client), goalContract: sha256(input.goal), resistance: resistance ? sha256(resistance) : null, input: null, systemPrompt: sha256(CARDIO_SYSTEM_PROMPT) },
    snapshots: { clientState: input.client, goalContract: input.goal, resistance },
    safety: null,
    input: null,
    attempts: [],
    totals: { calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 },
    result: {},
  };
  const finish = (body: Body, result: CardioReasonerRun["result"]): CardioReasonerResult => {
    run.status = body.status;
    run.result = result;
    return { ...body, run } as CardioReasonerResult;
  };
  const needs = (source: "readiness" | "method" | "restrictions", missing: MissingInput[], summary?: string) => finish({ status: "NEEDS_INPUT", source, missing, ...(summary ? { summary } : {}) }, { missing, ...(summary ? { summary } : {}) });

  // 1. Readiness.
  const missingReady = SHARED_REQUIREMENTS.filter((r) => READINESS_IDS.has(r.id)).flatMap((r) => {
    const res = r.check(input);
    return res === true ? [] : [{ fact: res, why: r.why, blockedDecision: "The cardio proposal.", providedBy: r.providedBy }];
  });
  if (missingReady.length) return needs("readiness", missingReady);
  if (isKnown(input.client.schedule.availableDays) && !input.client.schedule.availableDays.value.length) return needs("readiness", [{ fact: "onboarding.your_week.availableDays", why: "No available days are recorded, so there's nowhere to place cardio.", blockedDecision: "The cardio schedule.", providedBy: "client" }]);

  // 2. Routing — unsupported endurance capabilities stop here, before the coach's method or any model call.
  const route = routeCardio(input.goal);
  if (route.status === "UNSUPPORTED") return finish({ status: "UNSUPPORTED", message: route.message }, { message: route.message });
  if (route.status === "NEEDS_INPUT") return needs("readiness", [{ fact: route.fact, why: route.why, blockedDecision: "What cardio is for.", providedBy: "coach" }]);

  // 3. Coach scope and method.
  const read = readCardioMethod(input.coach!.method);
  if (!read.ok && read.reason === "not_coached") return finish({ status: "NOT_COACHED", message: read.message }, { message: read.message });
  if (!read.ok) return needs("method", read.missing.map((m) => ({ fact: `coach_brain.${m.key}`, why: m.why, blockedDecision: "The cardio proposal.", providedBy: "coach" as const })), "The coach's cardio method is incomplete.");
  const method = read.method;

  // 4. Safety gate — before any paid call.
  const safety = cardioSafety(input.client, input.goal);
  run.safety = safety;
  if (safety.escalations.length) return finish({ status: "ESCALATE", escalations: safety.escalations }, { escalations: safety.escalations });

  // 5. Restrictions OPTIM can't match → the coach structures them first (never guessed from wording).
  const unread = uninterpretedLimitations(input);
  if (unread.length) return needs("restrictions", unread.map((d) => ({ fact: "health_review.structuredLimitations", why: `${d} OPTIM can't tell which cardio modalities this rules out until the coach records it as structured restrictions (or confirms it doesn't restrict exercise).`, blockedDecision: "Which cardio modalities are safe.", providedBy: "coach" as const })));

  // 6. Modalities, schedule, bounds.
  const options: ModalityOption[] = modalityOptions(input.client, input.constraints);
  const usable = options.filter((o) => o.fit.state === "compatible");
  if (!usable.length) return needs("restrictions", [{ fact: "health_review.structuredLimitations", why: "The confirmed restrictions rule out every cardio modality OPTIM knows; the coach decides what's appropriate.", blockedDecision: "Which cardio modality to use.", providedBy: "coach" }]);
  const conflicts = scheduleConflicts(input.client, resistance);
  const capacity = cardioCapacity(input.client, resistance);
  const { reasoning, allowed } = buildCardioInput({ input, knowledge: CARDIO_KNOWLEDGE, method, purpose: route.purpose, hybrid: route.hybrid, resistance, capacity, options, safety, conflicts, promptVersion: CARDIO_PROMPT_VERSION });
  if (!reasoning.coach.allowedRoles.length) return finish({ status: "NOT_COACHED", message: `This coach's cardio roles (${method.roles.value.join(", ")}) don't cover what cardio would be for here (${route.purpose.replace(/_/g, " ")}); OPTIM proposes none rather than stretch the method.` }, { message: "No allowed role." });
  run.input = reasoning;
  run.hashes.input = sha256(reasoning);
  if (!params.model) return finish({ status: "PROVIDER_FAILED", message: CARDIO_PROVIDER_FAILED_MESSAGE, attempts: 0 }, { message: CARDIO_PROVIDER_FAILED_MESSAGE });

  // 7. Model (shared core) + 8. deterministic validation.
  type Done = { kind: "plan"; plan: CardioPlan; quality: CardioQualityFinding[]; workload: CardioWorkload } | { kind: "needs"; missing: MissingInput[]; summary: string };
  const outcome = await runModelAttempts<Done>({
    model: params.model,
    systemPrompt: CARDIO_SYSTEM_PROMPT,
    userMessage: JSON.stringify(reasoning),
    maxAttempts: params.maxAttempts ?? 2,
    maxOutputTokens: CARDIO_MAX_OUTPUT_TOKENS,
    record: run,
    onDiagnostic: params.onDiagnostic,
    evaluate: (raw) => {
      const parsed = parseCardioOutput(raw);
      if (!parsed.ok) return { kind: "retry", stage: "schema", errors: parsed.errors };
      if (parsed.output.status === "NEEDS_INPUT") return { kind: "done", value: { kind: "needs", missing: parsed.output.needsInput, summary: parsed.output.summary } };
      const v = validateCardioPlan({ plan: parsed.output.plan, reasoning, allowed });
      if (!v.ok) return { kind: "retry", stage: "validation", errors: v.errors };
      return { kind: "done", value: { kind: "plan", plan: parsed.output.plan, quality: v.quality, workload: v.workload } };
    },
  });
  if (outcome.kind === "provider_failed") return finish({ status: "PROVIDER_FAILED", message: CARDIO_PROVIDER_FAILED_MESSAGE, attempts: outcome.attempt }, { message: CARDIO_PROVIDER_FAILED_MESSAGE });
  if (outcome.kind === "rejected") return finish({ status: "REJECTED", errors: outcome.errors, attempts: outcome.attempts }, { errors: outcome.errors });
  const done = outcome.value;
  if (done.kind === "needs") return finish({ status: "NEEDS_INPUT", source: "model", missing: done.missing, summary: done.summary }, { missing: done.missing, summary: done.summary });

  const w = done.workload;
  const review: CardioReviewItems = {
    screening: safety.screening,
    warnings: safety.warnings,
    questions: conflicts.map((c) => c.text),
    conflictDecisions: conflicts.map((c) => {
      const d = done.plan.coachDecisions.find((x) => x.conflict === c.id);
      return { conflict: c.id, text: c.text, question: d?.question ?? null, options: d?.options ?? [], recommended: d ? d.options[d.recommended] : null, why: d?.why ?? null };
    }),
    progression: w.weeks.map((x) => `Week ${x.week}: ${x.minutes.total} min over ${x.sessions} session${x.sessions === 1 ? "" : "s"} (${x.minutes.easy} easy / ${x.minutes.moderate} moderate / ${x.minutes.vigorous} vigorous), ${x.hardSessions} hard${x.optionalMinutes ? `, ${x.optionalMinutes} min optional` : ""}.`),
    workload: { ...w, statement: `${done.plan.warranted ? "" : "No additional cardio proposed. "}Week 1: ${w.weeklyMinutes.total} min of cardio (${w.weeklyMinutes.easy} easy, ${w.weeklyMinutes.moderate} moderate, ${w.weeklyMinutes.vigorous} vigorous; ≈${w.moderateEquivalent} moderate-equivalent min), ${w.hardSessions} hard session${w.hardSessions === 1 ? "" : "s"}, ${w.trainingDays} training day${w.trainingDays === 1 ? "" : "s"} counting resistance${resistance ? ` (${resistance.source === "approved_program" ? "approved" : "proposed"} program)` : " (no resistance program supplied)"}.` },
    basis: [
      `Weekly minutes: the coach's ${Object.entries(reasoning.bounds.minutesByRole).map(([r, [a, b]]) => `${r.replace(/_/g, " ")} ${a}–${b}`).join(", ") || "method (no minute range stated)"} min/week.`,
      `Hard sessions ≤ ${reasoning.bounds.maxHardSessions}/week${method.endurance?.hardSessions ? " (coach)" : " (OPTIM default — internal heuristic)"}; weekly increase ≤ ${reasoning.bounds.maxWeeklyIncreasePct}%${method.endurance?.weeklyIncreasePct ? " (coach)" : " (OPTIM pacing default — not an injury-prevention rule)"}${reasoning.bounds.easyStartWeeks ? `; no hard sessions in the first ${reasoning.bounds.easyStartWeeks} weeks (new or returning client)` : ""}${reasoning.bounds.recoveryLimited ? "; no hard sessions while sleep or stress limits recovery (OPTIM heuristic)" : ""}.`,
      "Effort bands (easy 1–3, moderate 4–6, vigorous 7–9 of 10) are OPTIM curation; the talk test is the sourced anchor for steady work.",
      ...(reasoning.zones ? [`Heart-rate zones are estimates from age-predicted HRmax ≈ ${reasoning.zones.hrMaxEstimate} bpm (208 − 0.7 × age).`] : []),
    ],
    withheld: options.filter((o) => o.fit.state !== "compatible").map((o) => ({ modality: o.modality.name, why: (o.fit as { why: string }).why })),
    quality: done.quality,
  };
  return finish({ status: "PLANNED", plan: done.plan, review, attempts: outcome.attempt }, { plan: done.plan, review });
}
