// Gate 4.0C-3 — the canonical FitnessReasoningInput: everything the
// reasoner may use, normalized through the synthesis layer (never raw
// database rows), plus the allow-lists the validator checks citations
// against.

import { isKnown, type Fact } from "../facts.ts";
import { effectiveConstraints } from "../constraints.ts";
import { FOUNDATION_KNOWLEDGE_VERSION } from "../knowledge/registry.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { availableApparatus, availableEquipment, resolveEquipmentAccess } from "../planners/resistance/equipment-access.ts";
import type { ResistanceMethod } from "../planners/resistance/method.ts";
import type { DomainRouting } from "./domains.ts";
import type { EvidencePacket } from "./retrieval.ts";

export const REASONER_VERSION = "fitness-reasoner-v1.0.0";

export interface ReasoningInput {
  runtime: { reasonerVersion: string; promptVersion: string; knowledgeVersion: string };
  domain: { primary: string; supporting: string[]; resistanceEmphasis: string | null; secondaryEmphasis: string | null; rationale: string };
  coachMethod: { versionId: string; version: number; rules: Array<{ key: string; label: string; value: unknown }> };
  client: { facts: Array<{ ref: string; label: string; value: unknown; basis: string }>; missing: string[] };
  goal: { primary: string | null; secondary: string[]; successDefinition: string | null };
  constraints: Array<{ id: string; enforcement: string; confirmation: string; description: string; tags: unknown[] }>;
  bounds: { frequency: { min: number; max: number; limitedBy: string[] }; availableDays: string[]; sessionMinutesCap: number | null; programWeeks: { min: number; max: number; preferred: number | null } | null };
  equipment: { available: string[]; apparatusAvailable: string[]; apparatusUnknown: string[] };
  evidence: EvidencePacket;
  unresolved: Array<{ fact: string; why: string }>;
}

export interface Allowed {
  coachRuleKeys: Set<string>;
  clientFactRefs: Set<string>;
  knowledgeRefs: Set<string>;
  constraintIds: Set<string>;
  exerciseIds: Set<string>;
}

const fact = (ref: string, label: string, f: Fact<unknown>) => (isKnown(f) ? [{ ref, label, value: f.value, basis: f.basis }] : []);

export function buildReasoningInput(params: { input: SynthesisInput; method: ResistanceMethod; routing: Extract<DomainRouting, { status: "ROUTED" }>; secondary: "strength" | "hypertrophy" | null; evidence: EvidencePacket; promptVersion: string; unresolved: Array<{ fact: string; why: string }> }): { reasoning: ReasoningInput; allowed: Allowed } {
  const { input, method } = params;
  const c = input.client;
  const rules: ReasoningInput["coachMethod"]["rules"] = [];
  const rule = (key: string, label: string, value: unknown) => value !== undefined && value !== null && rules.push({ key, label, value });
  const b = input.bounds.frequency;
  rule(method.days.keys[0], "Training days per week (range)", method.days.value);
  if (method.sessionLength) rule(method.sessionLength.keys[0], "Session length (minutes)", method.sessionLength.value);
  for (let d = b.min ?? 1; d <= (b.max ?? 0); d++) {
    const s = method.splitsFor(d);
    rule(s.keys[0], `Splits allowed for ${d} days/week`, s.value);
  }
  rule(method.sets.main.keys[0], "Working sets per exercise — main lifts", method.sets.main.value);
  rule(method.sets.accessory.keys[0], "Working sets per exercise — accessories", method.sets.accessory.value);
  rule(method.reps.main.keys[0], "Rep range — main lifts", method.reps.main.value);
  rule(method.reps.accessory.keys[0], "Rep range — accessories", method.reps.accessory.value);
  if (method.reps.variesByPhase) rule("t_reps.varies", "Rep range shifts across program phases", true);
  rule("t_effort_metric", "How effort is expressed", method.effort.metrics);
  if (method.effort.rir) {
    rule(method.effort.rir.main.keys[0], "Effort (reps in reserve) — main lifts", method.effort.rir.main.value);
    rule(method.effort.rir.accessory.keys[0], "Effort (reps in reserve) — accessories", method.effort.rir.accessory.value);
  }
  if (method.effort.plain) rule(method.effort.plain.keys[0], "How hard sets should feel", method.effort.plain.value);
  if (method.rest) {
    rule(method.rest.main.keys[0], "Rest between sets (min) — main lifts", method.rest.main.value);
    rule(method.rest.accessory.keys[0], "Rest between sets (min) — accessories", method.rest.accessory.value);
  }
  rule(method.progression.main.keys[0], "Week-to-week progression (ranked) — main lifts", method.progression.main.value);
  rule(method.progression.accessory.keys[0], "Week-to-week progression (ranked) — accessories", method.progression.accessory.value);
  if (method.longTermStructure) rule(method.longTermStructure.keys[0], "Long-term structure", method.longTermStructure.value);
  rule("t_deload_approach", "Deloads", method.deload.value);
  if (method.warmup) rule(method.warmup.keys[0], "Warm-ups", method.warmup.value);
  if (method.whenShort) rule(method.whenShort.keys[0], "When short on time", method.whenShort.value);
  if (method.programLengthWeeks) rule(method.programLengthWeeks.keys[0], "Program length (weeks)", method.programLengthWeeks.value);
  if (method.exercisesAvoided.value.length) rule("t_exercises_avoided", "Exercises the coach avoids", method.exercisesAvoided.value);

  const facts = [
    ...fact(refOf(c.schedule.availableDays), "Available days", c.schedule.availableDays),
    ...fact(refOf(c.schedule.maxSessionLength), "Max session length", c.schedule.maxSessionLength),
    ...fact(refOf(c.schedule.preferredTimes), "Preferred training times", c.schedule.preferredTimes),
    ...fact(refOf(c.schedule.predictability), "Schedule predictability", c.schedule.predictability),
    ...fact(refOf(c.training.experience), "Training experience", c.training.experience),
    ...fact(refOf(c.training.recentConsistency), "Recent consistency", c.training.recentConsistency),
    ...fact(refOf(c.training.currentSessionsPerWeek), "Current sessions per week", c.training.currentSessionsPerWeek),
    ...fact(refOf(c.training.notes), "Training notes", c.training.notes),
    ...fact(refOf(c.equipment.environments), "Training environment", c.equipment.environments),
    ...fact(refOf(c.body.age), "Age", c.body.age),
    ...fact(refOf(c.body.sex), "Sex", c.body.sex),
    ...fact(refOf(c.recovery.sleep), "Typical sleep", c.recovery.sleep),
    ...fact(refOf(c.recovery.obstacles), "Consistency obstacles", c.recovery.obstacles),
    ...fact(refOf(c.goals.primary), "Primary goal (intake)", c.goals.primary),
    ...fact(refOf(c.goals.secondary), "Secondary goals (intake)", c.goals.secondary),
    ...fact(refOf(c.goals.successDefinition), "Success definition", c.goals.successDefinition),
  ];
  const missing = ([c.schedule.availableDays, c.schedule.maxSessionLength, c.training.experience, c.training.currentSessionsPerWeek, c.equipment.environments] as Fact<unknown>[]).filter((f) => !isKnown(f)).map((f) => (f as { ref: string }).ref);

  const access = resolveEquipmentAccess(c);
  const constraints = effectiveConstraints(input.constraints)
    .filter((x) => x.enforcement === "hard" || x.tags.length)
    .map((x) => ({ id: x.id, enforcement: x.enforcement, confirmation: x.confirmation, description: x.description, tags: x.tags.filter((t) => t.kind !== "free_text" && t.kind !== "avoid_exercise_term") }));
  const sessionLen = isKnown(c.schedule.maxSessionLength) ? c.schedule.maxSessionLength.value : null;
  const coachLen = method.sessionLength?.value ?? null;
  const cap = sessionLen ? (sessionLen.openEnded ? (coachLen?.max ?? sessionLen.minutes) : Math.min(sessionLen.minutes, coachLen?.max ?? Infinity)) : (coachLen?.max ?? null);

  const reasoning: ReasoningInput = {
    runtime: { reasonerVersion: REASONER_VERSION, promptVersion: params.promptVersion, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION },
    domain: { primary: params.routing.primary, supporting: params.routing.supporting, resistanceEmphasis: params.routing.resistanceEmphasis, secondaryEmphasis: params.secondary, rationale: params.routing.rationale },
    coachMethod: { versionId: method.versionId, version: method.version, rules },
    client: { facts, missing },
    goal: { primary: input.goal.primary?.class ?? null, secondary: input.goal.secondary.map((g) => g.class), successDefinition: isKnown(input.goal.successDefinition) ? input.goal.successDefinition.value : null },
    constraints,
    bounds: {
      frequency: { min: b.min!, max: b.max!, limitedBy: b.limitedBy },
      availableDays: isKnown(c.schedule.availableDays) ? c.schedule.availableDays.value : [],
      sessionMinutesCap: cap,
      programWeeks: method.programLengthWeeks ? { min: method.programLengthWeeks.value.min, max: method.programLengthWeeks.value.max, preferred: method.programLengthWeeks.value.preferred ?? null } : null,
    },
    equipment: { available: access ? availableEquipment(access) : [], apparatusAvailable: access ? availableApparatus(access) : [], apparatusUnknown: access ? Object.entries(access.apparatus).filter(([, s]) => s === "unknown").map(([a]) => a) : [] },
    evidence: params.evidence,
    unresolved: params.unresolved,
  };
  return {
    reasoning,
    allowed: {
      coachRuleKeys: new Set(rules.map((r) => r.key)),
      clientFactRefs: new Set(facts.map((f) => f.ref)),
      knowledgeRefs: new Set(params.evidence.retrievedRefs),
      constraintIds: new Set(constraints.map((x) => x.id)),
      exerciseIds: new Set(params.evidence.exercises.map((e) => e.id)),
    },
  };
}

const refOf = (f: Fact<unknown>) => (isKnown(f) ? f.source.ref : (f as { ref: string }).ref);
