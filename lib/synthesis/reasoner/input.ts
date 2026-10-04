// Gate 4.0C-3 / 3A — the canonical FitnessReasoningInput: everything the
// reasoner may use, normalized through the synthesis layer (never raw
// database rows), in a compact form (v1.1 token audit), plus the
// allow-lists the validator checks citations against.
//
// CONSTRAINT AUTHORITY (Gate 4.0C-3A): the model sees only the boundary it
// must enforce — coach-confirmed STRUCTURED restrictions as plain rules.
// Raw limitation wording (the coach's original text, the client's own
// words) is never sent once a confirmed structure expresses it; those
// constraints are "context-only" and OPTIM accounts for them itself.
// Availability, session length and equipment arrive as bounds and as the
// eligible candidate list, so the model can't reinterpret them either.

import { isKnown, type Fact } from "../facts.ts";
import { effectiveConstraints, type Constraint, type ConstraintTag } from "../constraints.ts";
import { FOUNDATION_KNOWLEDGE_VERSION } from "../knowledge/registry.ts";
import { LOADED_DEMAND_CONDITION, type FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import type { PoolResult } from "../planners/resistance/planner.ts";
import type { LoadCondition } from "../exercise-eligibility.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { availableApparatus, availableEquipment, resolveEquipmentAccess } from "../planners/resistance/equipment-access.ts";
import type { ResistanceMethod } from "../planners/resistance/method.ts";
import type { DomainRouting } from "./domains.ts";
import type { EvidencePacket } from "./retrieval.ts";

export const REASONER_VERSION = "fitness-reasoner-v1.3.0";

export const EXERCISE_ROW_LEGEND = `id|name|patterns|primary muscles|secondary muscles|mechanics C/I|laterality B/U/A|equipment|demands skill,stability,bracing,spine,fatigue (N/L/M/H)|suitability strength,hypertrophy,power (N/L/M/H)|constraint fit: - compatible; K conditional (within the constraints only with reps min ≥ ${LOADED_DEMAND_CONDITION.minReps}, rir min ≥ ${LOADED_DEMAND_CONDITION.minRir} and the trunk kept against the pad/bench); U uncertain (same minimums, but OPTIM can't establish it stays within the constraints — coach review)`;

export interface ReasoningInput {
  v: { reasoner: string; prompt: string; knowledge: string };
  domain: { primary: string; supporting: string[]; emphasis: string | null; secondary: string | null };
  coach: { method: string; rules: Array<[key: string, label: string, value: unknown]> };
  client: { facts: Record<string, unknown>; missing: string[] };
  goal: { primary: string | null; secondary: string[]; success: string | null; targets: GoalTarget[] };
  /** The complete client-specific boundary the model must enforce. */
  constraints: Array<{ id: string; rules: string[] }>;
  bounds: { days: [number, number]; available: string[]; minutes: number | null; weeks: [number, number] | null; preferredWeeks: number | null };
  /** Gate 4.0C-3B — OPTIM's deterministic defaults for the major structural decisions; deviating needs a client- or coach-specific reason. */
  anchors: { days: { value: number; basis: string }; weeks: { value: number; basis: string } | null };
  /** Gate 4.0C-3B — exercises excluded ONLY by a constraint (alias) or the coach's avoided list: shows what a goal may be blocked from. */
  blocked: Record<string, string[]>;
  equipment: { available: string[]; apparatus: string[]; apparatusUnknown: string[] };
  evidence: Array<{ ref: string; claim: string; source: string; params?: unknown }>;
  exerciseLegend: string;
  exercises: string[];
  unresolved: Array<{ fact: string; why: string }>;
}

/** A goal-specific exercise OPTIM resolved from structured goal data (e.g. strength priority lifts). */
export interface GoalTarget {
  target: string;
  exercise: string | null;
  status: "direct" | "blocked" | "unavailable" | "unknown_exercise";
  blockedBy: string | null;
  /** Gate 4.0C-3C — "performance_target" (structured GoalContract target, preferred) or "priority_lift". */
  source: "performance_target" | "priority_lift";
  /** The structured target itself, when it has one (e.g. load 405 lb × 1). */
  metric?: { kind: string; value: number; unit: string; atReps: number | null; timeframe: { weeks?: number; byDateIso?: string } | null };
}

export interface Allowed {
  coachRuleKeys: Set<string>;
  clientFactRefs: Set<string>;
  knowledgeRefs: Set<string>;
  constraintIds: Set<string>;
  exerciseIds: Set<string>;
  /** Eligible only when prescribed submaximally (LOADED_DEMAND_CONDITION) — conditional or uncertain. */
  submaximalOnly: Set<string>;
  /** Compatibility knowledge can't establish (Gate 4.0C-3C): use needs a rationale and goes to coach review. */
  uncertain: Set<string>;
  /** Exercise id → its load conditions (constraint, demand, limit, stated conditions, certainty). */
  loadConditions: Map<string, LoadCondition[]>;
  /** Exercise id → what blocks it (constraint alias or "t_exercises_avoided"). */
  blockedBy: Map<string, string>;
}

/** Constraints the model never sees, with how OPTIM accounted for them. */
export type ContextOnlyConstraint = { constraintId: string; how: string };

/** Exercise-row constraint-fit code (Gate 4.0C-3C). */
const fitCode = (conds: Array<{ certainty: "conditional" | "uncertain" }> | undefined) => (!conds?.length ? "-" : conds.some((c) => c.certainty === "uncertain") ? "U" : "K");
const L = (l: string) => ({ none: "N", low: "L", moderate: "M", high: "H" })[l] ?? "?";
const factRef = (f: Fact<unknown>) => (isKnown(f) ? f.source.ref : (f as { ref: string }).ref);

export function tagRule(t: ConstraintTag, knowledge: FitnessKnowledgeRegistry): string | null {
  switch (t.kind) {
    case "avoid_movement_pattern":
      return `no ${t.pattern.replace(/_/g, " ")} pattern`;
    case "avoid_demand":
      return `no ${t.demand.replace(/_/g, " ")} demand at ${t.atOrAbove} or above`;
    case "avoid_position":
      return `no ${t.position.replace(/_/g, " ")} position`;
    case "avoid_exercise":
      return `not ${knowledge.getExercise(t.exerciseId)?.name ?? t.exerciseId}`;
    case "avoid_equipment":
      return `no ${t.equipment}`;
    default:
      return null; // free text, literal terms, scheduling and review tags are never sent
  }
}

/** Splits effective constraints into what the model must enforce and what OPTIM accounts for itself. */
export function partitionConstraints(input: SynthesisInput): { enforced: Array<{ id: string; rules: string[] }>; contextOnly: ContextOnlyConstraint[] } {
  const enforced: Array<{ id: string; rules: string[] }> = [];
  const contextOnly: ContextOnlyConstraint[] = [];
  for (const c of effectiveConstraints(input.constraints)) {
    const rules = c.tags.map((t) => tagRule(t, input.knowledge)).filter((r): r is string => !!r);
    if (c.interpretedBy) contextOnly.push({ constraintId: c.id, how: `expressed by the coach-confirmed restrictions (${c.interpretedBy}); original wording kept for history only` });
    else if (c.category === "availability") contextOnly.push({ constraintId: c.id, how: "enforced as the scheduling ceiling (bounds.available / bounds.days)" });
    else if (c.category === "session_length") contextOnly.push({ constraintId: c.id, how: "enforced as the session time cap (bounds.minutes)" });
    else if (c.category === "equipment") contextOnly.push({ constraintId: c.id, how: "enforced by offering only exercises that use available equipment" });
    else if (rules.length) enforced.push({ id: c.id, rules });
    else if (c.enforcement === "hard") contextOnly.push({ constraintId: c.id, how: reviewedHow(c) });
  }
  return { enforced, contextOnly };
}

function reviewedHow(c: Constraint): string {
  if (c.review.status === "resolved") return "reviewed by the coach; the coach-confirmed restrictions are the planning boundary";
  return "no exercise-level effect";
}

export function buildReasoningInput(params: { input: SynthesisInput; method: ResistanceMethod; routing: Extract<DomainRouting, { status: "ROUTED" }>; secondary: "strength" | "hypertrophy" | null; evidence: EvidencePacket; promptVersion: string; unresolved: Array<{ fact: string; why: string }>; pool: PoolResult }): { reasoning: ReasoningInput; allowed: Allowed; contextOnly: ContextOnlyConstraint[]; constraintIdMap: Record<string, string> } {
  const { input, method } = params;
  const c = input.client;
  const rules: ReasoningInput["coach"]["rules"] = [];
  const rule = (key: string, label: string, value: unknown) => value !== undefined && value !== null && rules.push([key, label, value]);
  const rng = (r: { min: number; max: number }) => [r.min, r.max];
  const b = input.bounds.frequency;
  rule(method.days.keys[0], "days/week", rng(method.days.value));
  if (method.sessionLength) rule(method.sessionLength.keys[0], "session minutes", rng(method.sessionLength.value));
  for (let d = b.min ?? 1; d <= (b.max ?? 0); d++) {
    const s = method.splitsFor(d);
    rule(s.keys[0], `splits allowed at ${d} days`, s.value);
  }
  rule(method.sets.main.keys[0], "sets main", rng(method.sets.main.value));
  rule(method.sets.accessory.keys[0], "sets accessory", rng(method.sets.accessory.value));
  rule(method.reps.main.keys[0], "reps main", rng(method.reps.main.value));
  rule(method.reps.accessory.keys[0], "reps accessory", rng(method.reps.accessory.value));
  if (method.reps.variesByPhase) rule("t_reps.varies", "reps shift across phases", true);
  rule("t_effort_metric", "effort expressed as", method.effort.metrics);
  if (method.effort.rir) {
    rule(method.effort.rir.main.keys[0], "RIR main", rng(method.effort.rir.main.value));
    rule(method.effort.rir.accessory.keys[0], "RIR accessory", rng(method.effort.rir.accessory.value));
  }
  if (method.effort.plain) rule(method.effort.plain.keys[0], "how hard sets feel", method.effort.plain.value);
  if (method.rest) {
    rule(method.rest.main.keys[0], "rest min main", rng(method.rest.main.value));
    rule(method.rest.accessory.keys[0], "rest min accessory", rng(method.rest.accessory.value));
  }
  rule(method.progression.main.keys[0], "progression order main", method.progression.main.value);
  if (method.progression.accessory.keys[0] !== method.progression.main.keys[0]) rule(method.progression.accessory.keys[0], "progression order accessory", method.progression.accessory.value);
  if (method.longTermStructure) rule(method.longTermStructure.keys[0], "long-term structure", method.longTermStructure.value);
  const d = method.deload.value;
  rule("t_deload_approach", "deloads", d.approach === "fixed" && d.every ? `fixed every ${d.every.min}-${d.every.max} weeks` : d.approach);
  if (method.warmup) rule(method.warmup.keys[0], "warm-up", method.warmup.value);
  if (method.whenShort) rule(method.whenShort.keys[0], "when short on time", method.whenShort.value);
  if (method.programLengthWeeks) rule(method.programLengthWeeks.keys[0], "program weeks", rng(method.programLengthWeeks.value));
  if (method.exercisesAvoided.value.length) rule("t_exercises_avoided", "exercises avoided", method.exercisesAvoided.value);

  const factList: Array<[Fact<unknown>]> = [
    [c.schedule.availableDays], [c.schedule.maxSessionLength], [c.schedule.preferredTimes], [c.schedule.predictability],
    [c.training.experience], [c.training.recentConsistency], [c.training.currentSessionsPerWeek], [c.training.notes],
    [c.equipment.environments], [c.body.age], [c.body.sex], [c.recovery.sleep], [c.recovery.obstacles],
    [c.goals.primary], [c.goals.secondary], [c.goals.successDefinition],
  ] as Array<[Fact<unknown>]>;
  const facts: Record<string, unknown> = {};
  for (const [f] of factList) if (isKnown(f)) facts[f.source.ref] = f.value;
  const missing = ([c.schedule.availableDays, c.schedule.maxSessionLength, c.training.experience, c.training.currentSessionsPerWeek, c.equipment.environments] as Fact<unknown>[]).filter((f) => !isKnown(f)).map(factRef);

  const access = resolveEquipmentAccess(c);
  const { enforced: enforcedReal, contextOnly } = partitionConstraints(input);
  // Short aliases keep client identifiers (constraint ids embed the client id) out of the model payload.
  const constraintIdMap: Record<string, string> = {};
  const enforced = enforcedReal.map((c, i) => {
    constraintIdMap[`C${i + 1}`] = c.id;
    return { id: `C${i + 1}`, rules: c.rules };
  });
  const sessionLen = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value : null;
  const coachLen = method.sessionLength?.value ?? null;
  const cap = sessionLen ? (sessionLen.openEnded ? (coachLen?.max ?? sessionLen.minutes) : Math.min(sessionLen.minutes, coachLen?.max ?? Infinity)) : (coachLen?.max ?? null);
  const pw = method.programLengthWeeks?.value;

  // What a constraint (or the coach's avoided list) alone removes — anything also failing equipment/apparatus is just unavailable.
  const aliasOf = new Map(Object.entries(constraintIdMap).map(([alias, id]) => [id, alias]));
  const blockedBy = new Map<string, string>();
  for (const x of params.pool.excluded) {
    const by = x.reasons.map((r) => (r.startsWith("coach avoids") ? "t_exercises_avoided" : (aliasOf.get(r.slice(0, r.indexOf(": "))) ?? null)));
    if (by.every((b): b is string => !!b)) blockedBy.set(x.exerciseId, by[0]);
  }
  const blocked: Record<string, string[]> = {};
  for (const [id, by] of [...blockedBy].sort(([a], [b]) => a.localeCompare(b))) (blocked[by] ??= []).push(id);

  // Structured goal targets (strength priority lifts) resolved against knowledge — never from free text.
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const poolIds = new Set(params.pool.pool.map((e) => e.id));
  // Gate 4.0C-3C: structured performance targets first; priority lifts only for lifts they don't already cover.
  const resolve = (name: string, source: GoalTarget["source"], target: string, metric?: GoalTarget["metric"]): GoalTarget => {
    const ex = input.knowledge.getExercise(name) ?? input.knowledge.exercises().find((e) => [e.name, ...e.aliases].some((n) => norm(n) === norm(name)));
    const base = { target, source, ...(metric ? { metric } : {}) };
    if (!ex) return { ...base, exercise: null, status: "unknown_exercise", blockedBy: null };
    if (poolIds.has(ex.id)) return { ...base, exercise: ex.id, status: "direct", blockedBy: null };
    const by = blockedBy.get(ex.id);
    return { ...base, exercise: ex.id, status: by ? "blocked" : "unavailable", blockedBy: by ?? null };
  };
  const fromTargets = input.goal.performanceTargets.map((t) =>
    resolve(t.exercise, "performance_target", `${t.exercise}: ${t.value} ${t.unit}${t.atReps ? ` × ${t.atReps}` : ""}${t.timeframe?.weeks ? ` in ${t.timeframe.weeks} weeks` : t.timeframe?.byDateIso ? ` by ${t.timeframe.byDateIso}` : ""}`, { kind: t.metric, value: t.value, unit: t.unit, atReps: t.atReps, timeframe: t.timeframe })
  );
  const fromLifts = [input.goal.primary, ...input.goal.secondary].flatMap((g) => (g?.class === "strength" && isKnown(g.priorityLifts) ? g.priorityLifts.value : [])).map((lift) => resolve(lift, "priority_lift", lift));
  const targets: GoalTarget[] = [...fromTargets, ...fromLifts.filter((l) => !l.exercise || !fromTargets.some((t) => t.exercise === l.exercise))];

  // Anchors: the client's current habit inside the coach's range and availability; the coach's preferred (else shortest) block.
  const availCount = isKnown(c.schedule.availableDays) ? c.schedule.availableDays.value.length : b.max!;
  const hiDays = Math.min(b.max!, availCount);
  const current = isKnown(c.training.currentSessionsPerWeek) ? Number(c.training.currentSessionsPerWeek.value) : null;
  const anchorDays = Math.max(b.min!, Math.min(hiDays, current ?? b.min!));
  const daysBasis = current === null ? "no current training frequency known: the coach's minimum" : current === anchorDays ? "the client's current weekly frequency, inside the coach's range and availability" : `the client's current ${current}×/week, brought inside the coach's ${b.min}–${hiDays} days`;
  const anchors: ReasoningInput["anchors"] = {
    days: { value: anchorDays, basis: daysBasis },
    weeks: pw ? { value: pw.preferred ?? pw.min, basis: pw.preferred ? "the coach's preferred program length" : "the coach set no preferred length: the shortest allowed block, so progress is reviewed soonest" } : null,
  };

  const reasoning: ReasoningInput = {
    v: { reasoner: REASONER_VERSION, prompt: params.promptVersion, knowledge: FOUNDATION_KNOWLEDGE_VERSION },
    domain: { primary: params.routing.primary, supporting: params.routing.supporting, emphasis: params.routing.resistanceEmphasis, secondary: params.secondary },
    coach: { method: `v${method.version}`, rules },
    client: { facts, missing },
    goal: { primary: input.goal.primary?.class ?? null, secondary: input.goal.secondary.map((g) => g.class), success: isKnown(input.goal.successDefinition) ? input.goal.successDefinition.value : null, targets },
    constraints: enforced,
    bounds: { days: [b.min!, b.max!], available: isKnown(c.schedule.availableDays) ? c.schedule.availableDays.value : [], minutes: cap, weeks: pw ? [pw.min, pw.max] : null, preferredWeeks: pw?.preferred ?? null },
    anchors,
    blocked,
    equipment: { available: access ? availableEquipment(access) : [], apparatus: access ? availableApparatus(access) : [], apparatusUnknown: access ? Object.entries(access.apparatus).filter(([, s]) => s === "unknown").map(([a]) => a) : [] },
    evidence: params.evidence.claims.map((x) => ({ ref: x.ref, claim: x.statement, source: x.support, ...(x.parameters ? { params: x.parameters } : {}) })),
    exerciseLegend: EXERCISE_ROW_LEGEND,
    exercises: params.evidence.exercises.map((e) =>
      [e.id, e.name, e.patterns.join(","), e.primary.join(","), e.secondary.join(","), e.mechanics === "compound" ? "C" : "I", e.laterality[0].toUpperCase(), e.equipment, [e.demands.skill, e.demands.stability, e.demands.bracing, e.demands.spinal_loading, e.demands.systemic_fatigue].map(L).join(""), [e.suitability.strength, e.suitability.hypertrophy, e.suitability.power].map(L).join(""), e.ordering[0].toUpperCase(), fitCode(params.pool.loadConditions.get(e.id))].join("|")
    ),
    unresolved: params.unresolved,
  };
  return {
    reasoning,
    contextOnly,
    constraintIdMap,
    allowed: {
      coachRuleKeys: new Set(rules.map((r) => r[0])),
      clientFactRefs: new Set(Object.keys(facts)),
      knowledgeRefs: new Set(params.evidence.claims.map((x) => x.ref)),
      constraintIds: new Set(enforced.map((x) => x.id)),
      exerciseIds: new Set(params.evidence.exercises.map((e) => e.id)),
      submaximalOnly: new Set(params.evidence.exercises.map((e) => e.id).filter((id) => params.pool.loadConditions.has(id))),
      loadConditions: new Map([...params.pool.loadConditions].map(([id, conds]) => [id, conds.map((c) => ({ ...c, constraintId: aliasOf.get(c.constraintId) ?? c.constraintId }))])),
      uncertain: new Set(params.evidence.exercises.map((e) => e.id).filter((id) => fitCode(params.pool.loadConditions.get(id)) === "U")),
      blockedBy,
    },
  };
}
