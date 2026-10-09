// Unified Program Intelligence — Gate U1 orchestration. ONE coordinated program from the three existing domain
// reasoners, in dependency order, through the same shared core (no new model, no new brain):
//
//   program readiness → domain scope (the coach's method decides which domains exist) → SAFETY GATE across domains
//   → DETERMINISTIC PREFLIGHT of every coached domain (each reasoner run without a model reaches all of its pre-model
//   gates: readiness, coach method, routing, safety, restrictions, bounds) — any blocker stops the program with every
//   open input listed at once and NO model call → RESISTANCE (a coach-approved program is fixed input; otherwise the
//   Fitness Reasoner proposes) → CARDIO around that lifting week → NUTRITION for the combined training → assemble →
//   cross-domain validation → prepared coach decisions → UnifiedProgramProposal (for coach review; nothing persists)
//
// A coached domain that can't be produced is reported as such, and the domains that depend on it are HELD (no model
// call) unless the coach has decided to proceed without it. Nothing is invented to fill the gap.

import { randomUUID } from "node:crypto";
import { isKnown } from "../facts.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { SHARED_REQUIREMENTS } from "../readiness.ts";
import { buildCalibrationContext } from "../../coach/calibration/engine.ts";
import type { CalibrationAnswers } from "../../coach/calibration/types.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";
import { FOUNDATION_KNOWLEDGE } from "../knowledge/registry.ts";
import { runFitnessReasoner, type ReasonerResult } from "../reasoner/reasoner.ts";
import { runCardioReasoner, type CardioReasonerResult } from "../reasoner/cardio/reasoner.ts";
import { runNutritionReasoner, type NutritionReasonerResult } from "../reasoner/nutrition/reasoner.ts";
import type { ReasonerModel } from "../reasoner/core.ts";
import { sha256 } from "../reasoner/run.ts";
import { readCardioMethod } from "../cardio/method.ts";
import { cardioSafety } from "../cardio/safety.ts";
import { resistanceWeekFromContent, resistanceWeekFromSpec, type ResistanceWeek } from "../cardio/schedule.ts";
import { readNutritionMethod } from "../nutrition/method.ts";
import { nutritionSafety } from "../nutrition/safety.ts";
import type { TrainingContext } from "../nutrition/energy.ts";
import { UNIFIED_SCHEMA, UNIFIED_VERSION, type DomainId, type DomainOutcome, type DomainRunRef, type UnifiedDecision, type UnifiedProgramProposal } from "./contract.ts";
import { assembleUnified } from "./assemble.ts";

export interface UnifiedParams {
  input: SynthesisInput;
  model: ReasonerModel | null;
  nowIso: string;
  /** A coach-approved resistance program: fixed input, never regenerated or changed. */
  approvedResistance?: { versionId: string; content: UniversalTrainingProgramContent } | null;
  /** The coach's answer to "resistance can't be produced — proceed with cardio and nutrition around the client's
   * current training?" (a prepared decision on an earlier run). Never assumed. */
  proceedWithoutResistance?: boolean;
  maxAttempts?: number;
  runId?: string;
}

export interface DomainResults {
  resistance: ReasonerResult | null;
  cardio: CardioReasonerResult | null;
  nutrition: NutritionReasonerResult | null;
  resistanceWeek: ResistanceWeek | null;
  training: TrainingContext | null;
}

/** Which domains this coach's confirmed method includes — read from the same calibration answers each domain uses. */
export function domainScope(input: SynthesisInput): Record<DomainId, boolean> {
  const method = input.coach!.method;
  const answers = (method.operatingModel.calibration?.answers ?? {}) as CalibrationAnswers;
  const cardio = readCardioMethod(method);
  const nutrition = readNutritionMethod(method, input.goal.primary?.class ?? "general_fitness");
  return {
    resistance: buildCalibrationContext(answers).training,
    cardio: !(!cardio.ok && cardio.reason === "not_coached"),
    nutrition: !(!nutrition.ok && nutrition.reason === "not_coached"),
  };
}

const runRef = (run: { runId: string; versions: DomainRunRef["versions"]; hashes: { clientState: string; goalContract: string; input: string | null }; totals?: { calls: number }; attempts?: unknown[] }): DomainRunRef => ({
  runId: run.runId,
  versions: { reasoner: run.versions.reasoner, prompt: run.versions.prompt, knowledge: run.versions.knowledge, coachMethod: run.versions.coachMethod },
  hashes: { clientState: run.hashes.clientState, goalContract: run.hashes.goalContract, input: run.hashes.input },
  calls: run.totals?.calls ?? run.attempts?.length ?? 0,
});

/** The nutrition training context for the coordinated week: the lifting component only (cardio's energy cost is stated
 * as excluded rather than blended into a falsely precise figure — see validate.ts X8). */
export function trainingContextFor(week: ResistanceWeek): TrainingContext | null {
  if (!week.days.length) return null;
  return { sessionsPerWeek: week.days.length, minutesPerSession: Math.round(week.days.reduce((t, d) => t + d.minutes, 0) / week.days.length), kind: "resistance", source: week.source };
}

const outcome = (domain: DomainId, status: DomainOutcome["status"], summary: string, reasons: string[] = [], run: DomainRunRef | null = null): DomainOutcome => ({ domain, status, summary, reasons, run });

function resistanceOutcome(r: ReasonerResult): DomainOutcome {
  const ref = runRef(r.run as never);
  if (r.status === "PLANNED") return outcome("resistance", "PROPOSED", `${r.spec.frequency.value} lifting sessions a week (${r.spec.schedule.value.join(", ")}).`, [], ref);
  if (r.status === "DOMAIN_NOT_YET_SUPPORTED") return outcome("resistance", "UNSUPPORTED", r.message, [r.routing.rationale], ref);
  if (r.status === "NEEDS_INPUT") return outcome("resistance", "NEEDS_INPUT", "The Fitness Reasoner needs more information.", r.missing.map((m) => `${m.fact}: ${m.why}`), ref);
  if (r.status === "REJECTED") return outcome("resistance", "REJECTED", "The resistance proposal failed validation; nothing is shown in its place.", r.errors, ref);
  return outcome("resistance", "PROVIDER_FAILED", r.message, [], ref);
}
function cardioOutcome(c: CardioReasonerResult): DomainOutcome {
  const ref = runRef(c.run as never);
  if (c.status === "PLANNED") return c.plan.warranted ? outcome("cardio", "PROPOSED", `${c.review.workload.weeklyMinutes.total} min of cardio in week 1 (${c.plan.role.replace(/_/g, " ")}).`, [], ref) : outcome("cardio", "NO_ADDITIONAL", "No additional cardio for now.", [c.plan.objective.rationale], ref);
  if (c.status === "NOT_COACHED") return outcome("cardio", "NOT_COACHED", c.message, [], ref);
  if (c.status === "UNSUPPORTED") return outcome("cardio", "UNSUPPORTED", c.message, [], ref);
  if (c.status === "NEEDS_INPUT") return outcome("cardio", "NEEDS_INPUT", "The Cardio Reasoner needs more information.", c.missing.map((m) => `${m.fact}: ${m.why}`), ref);
  if (c.status === "ESCALATE") return outcome("cardio", "ESCALATE", "Escalated.", c.escalations.map((e) => e.why), ref);
  if (c.status === "REJECTED") return outcome("cardio", "REJECTED", "The cardio proposal failed validation; nothing is shown in its place.", c.errors, ref);
  return outcome("cardio", "PROVIDER_FAILED", c.message, [], ref);
}
function nutritionOutcome(n: NutritionReasonerResult): DomainOutcome {
  const ref = runRef(n.run as never);
  if (n.status === "PLANNED") return outcome("nutrition", "PROPOSED", n.plan.objective.summary, [], ref);
  if (n.status === "NEEDS_COACH_REVIEW") return outcome("nutrition", "NEEDS_COACH_REVIEW", "A qualified human must decide on restrictive items before this strategy can be used.", n.restrictions, ref);
  if (n.status === "NOT_COACHED") return outcome("nutrition", "NOT_COACHED", n.message, [], ref);
  if (n.status === "NEEDS_INPUT") return outcome("nutrition", "NEEDS_INPUT", "The Nutrition Reasoner needs more information.", n.missing.map((m) => `${m.fact}: ${m.why}`), ref);
  if (n.status === "ESCALATE") return outcome("nutrition", "ESCALATE", "Escalated.", n.escalations.map((e) => e.why), ref);
  if (n.status === "REJECTED") return outcome("nutrition", "REJECTED", "The nutrition proposal failed validation; nothing is shown in its place.", n.errors, ref);
  return outcome("nutrition", "PROVIDER_FAILED", n.message, [], ref);
}
/** A preflight (no-model) result that ended before the model call — i.e. a deterministic outcome, not a failure. */
const decided = (status: string, attempts?: number) => !(status === "PROVIDER_FAILED" && !attempts);

export async function runUnifiedProgram(params: UnifiedParams): Promise<UnifiedProgramProposal> {
  const { input } = params;
  const runId = params.runId ?? randomUUID();
  const approvedHashBefore = params.approvedResistance ? sha256(params.approvedResistance.content) : null;
  const base = { schema: UNIFIED_SCHEMA, version: UNIFIED_VERSION, runId, createdAtIso: params.nowIso } as const;
  const none: DomainResults = { resistance: null, cardio: null, nutrition: null, resistanceWeek: null, training: null };
  const approved = params.approvedResistance ?? null;

  // 1. Program readiness: a confirmed coach method, a goal and availability — without them no domain can plan.
  const missing = SHARED_REQUIREMENTS.filter((r) => ["coach_method_confirmed", "primary_goal", "available_days"].includes(r.id)).flatMap((r) => {
    const res = r.check(input);
    return res === true ? [] : [`${res} — ${r.why}`];
  });
  if (isKnown(input.client.schedule.availableDays) && !input.client.schedule.availableDays.value.length) missing.push("onboarding.your_week.availableDays — no available days are recorded, so no training can be scheduled.");
  if (missing.length) {
    const held = (d: DomainId) => outcome(d, "HELD", "Not run — program-level facts are missing.", missing);
    return assembleUnified({ ...base, status: "NEEDS_INPUT", input, scope: null, domains: { resistance: held("resistance"), cardio: held("cardio"), nutrition: held("nutrition") }, results: none, programDecisions: [], escalations: [], approved: null, approvedHashBefore });
  }

  // 2. Scope: only the domains this coach's method includes.
  const scope = domainScope(input);
  const notCoached = (d: DomainId) => outcome(d, "NOT_COACHED", d === "resistance" ? "This coach doesn't program resistance training." : d === "cardio" ? "This coach doesn't prescribe cardio — none is proposed." : "This coach doesn't coach nutrition — no strategy is proposed.");

  // 3. Safety gate across domains: a screen that stops one domain stops the program.
  const cs = cardioSafety(input.client, input.goal);
  const ns = scope.nutrition ? nutritionSafety(input.client, input.goal) : { escalations: [] };
  const escalations = [...cs.escalations.map((e) => ({ source: "cardio" as DomainId, code: e.code, why: e.why })), ...ns.escalations.map((e) => ({ source: "nutrition" as DomainId, code: e.code, why: e.why }))];
  if (escalations.length) {
    const st = (d: DomainId): DomainOutcome => (!scope[d] ? notCoached(d) : escalations.some((e) => e.source === d) ? outcome(d, "ESCALATE", "Escalated to the coach before any model call.", escalations.filter((e) => e.source === d).map((e) => e.why)) : outcome(d, "HELD", "Not run — a safety screen stopped the program before any model call.", escalations.map((e) => e.why)));
    return assembleUnified({ ...base, status: "ESCALATE", input, scope, domains: { resistance: st("resistance"), cardio: st("cardio"), nutrition: st("nutrition") }, results: none, programDecisions: [], escalations, approved: null, approvedHashBefore });
  }

  // 4. Deterministic preflight: every coached domain run WITHOUT a model reaches all its pre-model gates.
  const pre: Partial<Record<DomainId, DomainOutcome>> = {};
  if (scope.resistance && !approved) {
    const r0 = await runFitnessReasoner({ input, model: null, nowIso: params.nowIso, runId: `${runId}:resistance:preflight` });
    if (decided(r0.status, (r0 as { attempts?: number }).attempts)) pre.resistance = resistanceOutcome(r0);
  }
  if (scope.cardio) {
    const c0 = await runCardioReasoner({ input, model: null, nowIso: params.nowIso, runId: `${runId}:cardio:preflight` });
    if (decided(c0.status, (c0 as { attempts?: number }).attempts)) pre.cardio = cardioOutcome(c0);
  }
  if (scope.nutrition) {
    const n0 = await runNutritionReasoner({ input, model: null, nowIso: params.nowIso, runId: `${runId}:nutrition:preflight` });
    if (decided(n0.status, (n0 as { attempts?: number }).attempts)) pre.nutrition = nutritionOutcome(n0);
  }
  const resistanceUnavailable = pre.resistance && pre.resistance.status !== "PROPOSED";
  const blockers = (Object.values(pre) as DomainOutcome[]).filter((d) => ["NEEDS_INPUT", "ESCALATE"].includes(d.status) || (d.domain === "resistance" && d.status === "UNSUPPORTED" && !params.proceedWithoutResistance));
  const programDecisions: UnifiedDecision[] = [];
  const resistanceDecision = (status: DomainOutcome["status"]): UnifiedDecision => ({
    source: "program",
    about: "resistance_unavailable",
    question: status === "UNSUPPORTED" ? "OPTIM can't generate a resistance program for this goal yet. How should the program proceed?" : "The resistance program couldn't be produced. How should the program proceed?",
    options: ["Approve or write the resistance program, then rerun (cardio and nutrition plan around it)", "Proceed now: cardio and nutrition around the client's current training habit", ...(status === "NEEDS_INPUT" ? ["Provide the missing information first"] : [])],
    recommended: "Approve or write the resistance program, then rerun (cardio and nutrition plan around it)",
    why: "Planning cardio and nutrition without the lifting week would guess at schedule and training load.",
  });
  if (blockers.length) {
    const blocked = new Set(blockers.map((d) => d.domain));
    const waits = blockers.map((d) => `${d.domain}: ${d.status.toLowerCase().replace(/_/g, " ")}`).join("; ");
    const st = (d: DomainId): DomainOutcome => (!scope[d] ? notCoached(d) : blocked.has(d) ? pre[d]! : pre[d] && pre[d]!.status === "NOT_COACHED" ? pre[d]! : d === "resistance" && approved ? outcome("resistance", "APPROVED_EXISTING", "The coach-approved program is kept as-is.") : outcome(d, "HELD", "Not run — the program waits for open inputs first (no model call was made).", [waits]));
    if (blocked.has("resistance") && pre.resistance!.status === "UNSUPPORTED") programDecisions.push(resistanceDecision("UNSUPPORTED"));
    const anyEsc = blockers.some((d) => d.status === "ESCALATE");
    const domEsc = blockers.filter((d) => d.status === "ESCALATE").flatMap((d) => d.reasons.map((why) => ({ source: d.domain, code: "domain_escalation", why })));
    return assembleUnified({ ...base, status: anyEsc ? "ESCALATE" : "INCOMPLETE", input, scope, domains: { resistance: st("resistance"), cardio: st("cardio"), nutrition: st("nutrition") }, results: none, programDecisions, escalations: domEsc, approved, approvedHashBefore });
  }

  const results: DomainResults = { ...none };
  const domains = {} as Record<DomainId, DomainOutcome>;

  // 5. Resistance: approved program (fixed) → else the Fitness Reasoner's proposal.
  if (!scope.resistance) domains.resistance = notCoached("resistance");
  else if (approved) {
    results.resistanceWeek = resistanceWeekFromContent(approved.content, FOUNDATION_KNOWLEDGE, "approved_program");
    domains.resistance = outcome("resistance", "APPROVED_EXISTING", `The coach-approved program (${results.resistanceWeek.days.length} lifting day${results.resistanceWeek.days.length === 1 ? "" : "s"}) is used as-is; nothing in this proposal changes it.`);
  } else if (resistanceUnavailable) domains.resistance = pre.resistance!;
  else {
    const r = await runFitnessReasoner({ input, model: params.model, nowIso: params.nowIso, maxAttempts: params.maxAttempts, runId: `${runId}:resistance` });
    results.resistance = r;
    domains.resistance = resistanceOutcome(r);
    if (r.status === "PLANNED") results.resistanceWeek = resistanceWeekFromSpec(r.spec, FOUNDATION_KNOWLEDGE);
  }

  // 6. Dependents wait for a lifting week the coach expects — unless the coach chose to proceed without one.
  const resistanceMissing = scope.resistance && !results.resistanceWeek;
  if (resistanceMissing && !params.proceedWithoutResistance) {
    const why = `Waits for the resistance program (${domains.resistance.status.toLowerCase().replace(/_/g, " ")}) — cardio placement and nutrition's training demands depend on it.`;
    domains.cardio = scope.cardio ? outcome("cardio", "HELD", "Not run — no lifting week to plan around.", [why]) : notCoached("cardio");
    domains.nutrition = scope.nutrition ? outcome("nutrition", "HELD", "Not run — the training demands it must support aren't known.", [why]) : notCoached("nutrition");
    programDecisions.push(resistanceDecision(domains.resistance.status));
  } else {
    // 7. Cardio around the lifting week (approved or proposed).
    if (!scope.cardio) domains.cardio = notCoached("cardio");
    else {
      const c = await runCardioReasoner({ input, model: params.model, nowIso: params.nowIso, resistance: results.resistanceWeek, maxAttempts: params.maxAttempts, runId: `${runId}:cardio` });
      results.cardio = c;
      domains.cardio = cardioOutcome(c);
    }
    // 8. Nutrition for the combined training (lifting component as the energy context; cardio stated, not blended).
    results.training = results.resistanceWeek ? trainingContextFor(results.resistanceWeek) : null;
    if (!scope.nutrition) domains.nutrition = notCoached("nutrition");
    else {
      const n = await runNutritionReasoner({ input, model: params.model, nowIso: params.nowIso, training: results.training, maxAttempts: params.maxAttempts, runId: `${runId}:nutrition` });
      results.nutrition = n;
      domains.nutrition = nutritionOutcome(n);
    }
    if (resistanceMissing && params.proceedWithoutResistance) domains.resistance.reasons.push("The coach chose to proceed without it: cardio was planned with no lifting week, and nutrition used the client's current training habit.");
  }

  const domainEscalations = [...(results.cardio?.status === "ESCALATE" ? results.cardio.escalations.map((e) => ({ source: "cardio" as DomainId, code: e.code, why: e.why })) : []), ...(results.nutrition?.status === "ESCALATE" ? results.nutrition.escalations.map((e) => ({ source: "nutrition" as DomainId, code: e.code, why: e.why })) : [])];
  return assembleUnified({ ...base, status: null, input, scope, domains, results, programDecisions, escalations: domainEscalations, approved, approvedHashBefore });
}
