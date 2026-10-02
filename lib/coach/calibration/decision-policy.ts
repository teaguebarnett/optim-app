// Gate 3.1 — structured "it depends".
//
// A DecisionPolicy is coach-readable and UI-buildable: ordered rules, each a
// set of conditions (all of these, plus optionally at least one of these),
// first match wins, with a required fallback. Not a programming language.
//
// Nothing in production evaluates these yet (status C): OPTIM records what
// the coach would do. evaluateDecisionPolicy exists so the contract is
// tested now and a future adjustment engine can't reinterpret it — any
// future evaluator must still run safety first, then the authority resolver.

import type { ChoiceOption, ConditionOp, DecisionCondition, DecisionPolicy, DecisionRule, FactorDef, ScenarioSpec } from "./types.ts";

/** Server limits (abuse protection). The UI suggests far fewer. */
export const MAX_RULES = 20;
export const MAX_CONDITIONS_PER_RULE = 10;
export const MAX_NOTE_LENGTH = 1000;

const ENUM_OPS: ConditionOp[] = ["is", "is_not", "is_one_of"];
const NUMBER_OPS: ConditionOp[] = ["gte", "lte", "between"];
const BOOLEAN_OPS: ConditionOp[] = ["is"];

export function opsForFactor(f: FactorDef): ConditionOp[] {
  return f.type === "enum" ? ENUM_OPS : f.type === "number" ? NUMBER_OPS : BOOLEAN_OPS;
}

function enumValues(f: FactorDef): Set<string> {
  return new Set([...(f.options ?? []).map((o) => o.value), "unknown"]);
}

function validCondition(c: unknown, factors: Map<string, FactorDef>): DecisionCondition | null {
  if (!c || typeof c !== "object") return null;
  const { factor, op, value } = c as DecisionCondition;
  const f = typeof factor === "string" ? factors.get(factor) : undefined;
  if (!f || !opsForFactor(f).includes(op)) return null;
  if (f.type === "enum") {
    const allowed = enumValues(f);
    if (op === "is_one_of") return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && allowed.has(v)) ? { factor, op, value } : null;
    return typeof value === "string" && allowed.has(value) ? { factor, op, value } : null;
  }
  if (f.type === "number") {
    if (op === "between") {
      return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number" && Number.isFinite(v)) && (value[0] as number) <= (value[1] as number) ? { factor, op, value: [value[0] as number, value[1] as number] } : null;
    }
    return typeof value === "number" && Number.isFinite(value) ? { factor, op, value } : null;
  }
  return typeof value === "boolean" ? { factor, op, value } : null;
}

function validActions(list: unknown, allowed: Set<string>): string[] | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const out = list.filter((a): a is string => typeof a === "string" && allowed.has(a));
  return out.length === list.length ? [...new Set(out)] : null;
}

function cleanNote(note: unknown): string | undefined {
  if (typeof note !== "string") return undefined;
  const trimmed = note.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed ? trimmed : undefined;
}

export type DecisionPolicyValidation = { ok: true; policy: DecisionPolicy } | { ok: false; message: string };

/** Validates a coach-built policy against its scenario: known actions,
 * known factors, operators that fit each factor's type, ordered rules, and a
 * required fallback for conditional policies. */
export function validateDecisionPolicy(raw: unknown, spec: ScenarioSpec, actionOptions: ChoiceOption[] = spec.actions): DecisionPolicyValidation {
  if (!raw || typeof raw !== "object") return { ok: false, message: "That answer isn't a valid decision." };
  const p = raw as DecisionPolicy;
  const allowed = new Set(actionOptions.map((a) => a.value));
  const note = cleanNote(p.note);
  if (p.mode === "single") {
    const actions = validActions(p.actions, allowed);
    if (!actions) return { ok: false, message: "Choose what OPTIM should do." };
    if (!spec.allowFallbacks && actions.length > 1) return { ok: false, message: "Choose one action." };
    return { ok: true, policy: { mode: "single", actions, ...(note ? { note } : {}) } };
  }
  if (p.mode !== "conditional") return { ok: false, message: "That answer isn't a valid decision." };
  if (!spec.allowDepends) return { ok: false, message: "This situation doesn't take conditions." };
  if (!Array.isArray(p.rules) || p.rules.length === 0) return { ok: false, message: "Add at least one rule." };
  if (p.rules.length > MAX_RULES) return { ok: false, message: `Use at most ${MAX_RULES} rules.` };
  const factors = new Map(spec.factors.map((f) => [f.id, f]));
  const rules: DecisionRule[] = [];
  for (const [i, r] of p.rules.entries()) {
    const all = Array.isArray(r?.when?.all) ? r.when.all : [];
    const any = Array.isArray(r?.when?.any) ? r.when.any : [];
    if (all.length + any.length === 0) return { ok: false, message: `Rule ${i + 1} needs at least one condition.` };
    if (all.length + any.length > MAX_CONDITIONS_PER_RULE) return { ok: false, message: `Rule ${i + 1} has too many conditions.` };
    const cleanAll = all.map((c) => validCondition(c, factors));
    const cleanAny = any.map((c) => validCondition(c, factors));
    if (cleanAll.some((c) => !c) || cleanAny.some((c) => !c)) return { ok: false, message: `Rule ${i + 1} has a condition that isn't complete.` };
    const then = validActions(r.then, allowed);
    if (!then) return { ok: false, message: `Choose what happens in rule ${i + 1}.` };
    const ruleNote = cleanNote(r.note);
    rules.push({ when: { ...(cleanAll.length ? { all: cleanAll as DecisionCondition[] } : {}), ...(cleanAny.length ? { any: cleanAny as DecisionCondition[] } : {}) }, then, ...(ruleNote ? { note: ruleNote } : {}) });
  }
  const otherwise = validActions(p.otherwise, allowed);
  if (!otherwise) return { ok: false, message: "Choose what happens otherwise." };
  return { ok: true, policy: { mode: "conditional", rules, otherwise, ...(note ? { note } : {}) } };
}

// ---------------------------------------------------------------------------
// Evaluation (contract only — not wired to production)
// ---------------------------------------------------------------------------

export type Facts = Record<string, string | number | boolean | undefined>;

function holds(c: DecisionCondition, facts: Facts): boolean {
  const v = facts[c.factor];
  if (c.op === "is" && c.value === "unknown") return v === undefined || v === "unknown";
  if (v === undefined || v === "unknown") return false; // an unknown fact never satisfies a condition
  switch (c.op) {
    case "is":
      return v === c.value;
    case "is_not":
      return v !== c.value;
    case "is_one_of":
      return Array.isArray(c.value) && (c.value as string[]).includes(String(v));
    case "gte":
      return typeof v === "number" && v >= (c.value as number);
    case "lte":
      return typeof v === "number" && v <= (c.value as number);
    case "between":
      return typeof v === "number" && v >= (c.value as [number, number])[0] && v <= (c.value as [number, number])[1];
  }
}

/** The coach's chosen actions for these facts: first matching rule, else
 * the fallback. */
export function evaluateDecisionPolicy(policy: DecisionPolicy, facts: Facts): { actions: string[]; matchedRule: number | null } {
  if (policy.mode === "single") return { actions: policy.actions ?? [], matchedRule: null };
  for (const [i, rule] of (policy.rules ?? []).entries()) {
    const allOk = (rule.when.all ?? []).every((c) => holds(c, facts));
    const anyOk = !rule.when.any || rule.when.any.length === 0 || rule.when.any.some((c) => holds(c, facts));
    if (allOk && anyOk) return { actions: rule.then, matchedRule: i };
  }
  return { actions: policy.otherwise ?? [], matchedRule: null };
}

// ---------------------------------------------------------------------------
// Coach-readable rendering
// ---------------------------------------------------------------------------

function labelOf(options: ChoiceOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

function describeCondition(c: DecisionCondition, factors: Map<string, FactorDef>): string {
  const f = factors.get(c.factor);
  const name = (f?.label ?? c.factor).toLowerCase();
  const unit = f?.unit ? ` ${f.unit}` : "";
  const enumLabel = (v: string) => (v === "unknown" ? "unknown" : labelOf(f?.options ?? [], v).toLowerCase());
  switch (c.op) {
    case "is":
      return typeof c.value === "boolean" ? `${name} is ${c.value ? "yes" : "no"}` : `${name} is ${enumLabel(String(c.value))}`;
    case "is_not":
      return `${name} is not ${enumLabel(String(c.value))}`;
    case "is_one_of":
      return `${name} is ${(c.value as string[]).map(enumLabel).join(" or ")}`;
    case "gte":
      return `${name} ≥ ${c.value}${unit}`;
    case "lte":
      return `${name} ≤ ${c.value}${unit}`;
    case "between":
      return `${name} is ${(c.value as [number, number])[0]}–${(c.value as [number, number])[1]}${unit}`;
  }
}

/** e.g. "If stall ≥ 2 weeks and adherence is high → reduce calories slightly.
 * Else if adherence is low → address adherence first. Otherwise → hold." */
export function describeDecisionPolicy(policy: DecisionPolicy, spec: ScenarioSpec, actionOptions: ChoiceOption[] = spec.actions): string {
  const actions = (list: string[] | undefined) => (list ?? []).map((a) => labelOf(actionOptions, a)).join(", then ");
  if (policy.mode === "single") return actions(policy.actions);
  const factors = new Map(spec.factors.map((f) => [f.id, f]));
  const parts = (policy.rules ?? []).map((r, i) => {
    const all = (r.when.all ?? []).map((c) => describeCondition(c, factors));
    const any = (r.when.any ?? []).map((c) => describeCondition(c, factors));
    const clause = [all.join(" and "), any.length ? `(${any.join(" or ")})` : ""].filter(Boolean).join(" and ");
    return `${i === 0 ? "If" : "Else if"} ${clause} → ${actions(r.then)}.`;
  });
  parts.push(`Otherwise → ${actions(policy.otherwise)}.`);
  return parts.join(" ");
}
