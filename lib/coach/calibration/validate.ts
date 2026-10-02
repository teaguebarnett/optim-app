// Gate 3.1 — server-side validation of v2 calibration answers.
//
// Every stored value is checked against its own question: option
// membership, numeric shape, units, ranges, decision-policy structure.
// Wheel bounds (NumberSpec.min/max) are a UI convenience and are NEVER
// enforced here — only definitional limits (hardMin/hardMax) are. Values
// outside the typical bounds are kept and tagged outsideTypical.
//
// A value that is malformed is an error (the UI must not show it as saved).
// A value that is merely stale — an exception key no longer inside the
// coach's own range, a unit that changed because the coach changed their
// unit choice — is dropped, so the question simply becomes unanswered.

import { ALL_CALIBRATION_ITEMS, CALIBRATION_QUESTIONS, answerKeyOf } from "./questions.ts";
import { buildCalibrationContext, controlFor, pruneCalibrationAnswers } from "./engine.ts";
import { validateDecisionPolicy } from "./decision-policy.ts";
import {
  AREA_IDS,
  CALIBRATION_SCHEMA_KEY,
  CALIBRATION_SCHEMA_VERSION,
  NEEDS_CONFIRMATION_KEY,
  STEP0_SUGGESTION_KEY,
  type CalibrationAnswerValue,
  type CalibrationAnswers,
  type CalibrationContext,
  type CalibrationQuestion,
  type ChoiceOption,
  type ControlSpec,
  type NumberSpec,
} from "./types.ts";

export const MAX_TEXT = 2000;
export const MAX_TAGS = 40;
export const MAX_TAG_LENGTH = 160;
export const MAX_OTHER_LENGTH = 80;
const OTHER_PREFIX = "other:";

type Check = { ok: true; value: CalibrationAnswerValue } | { ok: false; message: string } | { ok: "drop" };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function withinHard(n: number, spec: NumberSpec): boolean {
  if (spec.hardMin !== undefined && n < spec.hardMin) return false;
  if (spec.hardMax !== undefined && n > spec.hardMax) return false;
  return true;
}

function outside(n: number, spec: NumberSpec): boolean {
  return n < spec.min || n > spec.max;
}

function cleanOther(v: string): string | null {
  const label = v.slice(OTHER_PREFIX.length).replace(/\s+/g, " ").trim();
  if (!label || label.length > MAX_OTHER_LENGTH) return null;
  return `${OTHER_PREFIX}${label}`;
}

function checkChoices(v: unknown, options: ChoiceOption[], kind: "multi" | "ranked", otherAllowed = false): Check {
  if (!Array.isArray(v)) return { ok: false, message: "Choose from the options." };
  const allowed = new Set(options.map((o) => o.value));
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return { ok: false, message: "Choose from the options." };
    if (allowed.has(item)) out.push(item);
    else if (otherAllowed && item.startsWith(OTHER_PREFIX)) {
      const c = cleanOther(item);
      if (!c) return { ok: false, message: `Keep custom entries under ${MAX_OTHER_LENGTH} characters.` };
      out.push(c);
    } else return { ok: false, message: "That option isn't available." };
  }
  const unique = [...new Set(out)];
  if (kind === "multi") {
    const exclusive = options.filter((o) => o.exclusive).map((o) => o.value);
    if (unique.some((x) => exclusive.includes(x)) && unique.length > 1) return { ok: false, message: "“None” can't be combined with other choices." };
  }
  return { ok: true, value: unique };
}

export function checkControl(v: unknown, control: ControlSpec): Check {
  switch (control.kind) {
    case "single":
      return typeof v === "string" && control.options.some((o) => o.value === v) ? { ok: true, value: v } : { ok: false, message: "Choose one of the options." };
    case "multi":
      return checkChoices(v, control.options, "multi", control.otherAllowed);
    case "ranked": {
      const r = checkChoices(v, control.options, "ranked");
      if (r.ok === true && control.maxSelections && (r.value as string[]).length > control.maxSelections) return { ok: false, message: `Choose up to ${control.maxSelections}.` };
      return r;
    }
    case "boolean":
      return typeof v === "boolean" ? { ok: true, value: v } : { ok: false, message: "Choose yes or no." };
    case "scale":
      return finite(v) && Number.isInteger(v) && v >= control.min && v <= control.max ? { ok: true, value: v } : { ok: false, message: "Choose a point on the scale." };
    case "text": {
      if (typeof v !== "string") return { ok: false, message: "That answer isn't text." };
      const t = v.slice(0, MAX_TEXT);
      return t.trim() ? { ok: true, value: t } : { ok: "drop" };
    }
    case "tags": {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return { ok: false, message: "That answer isn't a list." };
      const tags = [...new Set((v as string[]).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
      if (tags.length > MAX_TAGS) return { ok: false, message: `Use at most ${MAX_TAGS} entries.` };
      if (tags.some((x) => x.length > MAX_TAG_LENGTH)) return { ok: false, message: `Keep each entry under ${MAX_TAG_LENGTH} characters.` };
      return tags.length ? { ok: true, value: tags } : { ok: "drop" };
    }
    case "number": {
      if (!isObj(v) || !finite(v.value)) return { ok: false, message: "Enter a number." };
      if (v.unit !== control.spec.unit) return { ok: "drop" };
      if (!withinHard(v.value, control.spec)) return { ok: false, message: "That number isn't possible here." };
      return { ok: true, value: { value: v.value, unit: control.spec.unit, ...(outside(v.value, control.spec) ? { outsideTypical: true } : {}) } };
    }
    case "range": {
      if (!isObj(v) || !finite(v.min)) return { ok: false, message: "Enter a range." };
      if (v.unit !== control.spec.unit) return { ok: "drop" };
      const max = v.max === null ? null : v.max;
      if (max === null && !control.spec.allowOpenMax) return { ok: false, message: "Enter both ends of the range." };
      if (max !== null && !finite(max)) return { ok: false, message: "Enter both ends of the range." };
      if (!withinHard(v.min, control.spec) || (max !== null && !withinHard(max, control.spec))) return { ok: false, message: "That number isn't possible here." };
      if (max !== null && v.min > max) return { ok: false, message: "The first number can't be higher than the second." };
      let preferred: number | undefined;
      if (v.preferred !== undefined) {
        if (!control.spec.allowPreferred || !finite(v.preferred)) return { ok: false, message: "A preferred value isn't available here." };
        if (v.preferred < v.min || (max !== null && v.preferred > max)) return { ok: false, message: "The preferred value has to be inside your range." };
        preferred = v.preferred;
      }
      const out = outside(v.min, control.spec) || (max !== null && outside(max, control.spec));
      return { ok: true, value: { min: v.min, max, unit: control.spec.unit, ...(preferred !== undefined ? { preferred } : {}), ...(out ? { outsideTypical: true } : {}) } };
    }
  }
}

function checkLayered(v: unknown, q: CalibrationQuestion, ctx: CalibrationContext): Check {
  const control = controlFor(q, ctx);
  if (!control || !isObj(v)) return { ok: false, message: "That answer isn't complete." };
  const base = checkControl(v.base, control);
  if (base.ok === false) return base;
  if (base.ok === "drop") return { ok: "drop" };
  const dims = q.variesBy ? q.variesBy(ctx) : [];
  const varies = typeof v.varies === "string" ? v.varies : "no";
  const dimension = dims.find((d) => d.id === varies);
  if (varies !== "no" && !dimension) return { ok: true, value: { base: base.value, varies: "no" } };
  const exceptions: Record<string, unknown> = {};
  if (dimension && isObj(v.exceptions)) {
    const keys = new Set(dimension.keys.map((k) => k.value));
    for (const [key, val] of Object.entries(v.exceptions)) {
      if (!keys.has(key)) continue; // stale key (e.g. outside the coach's own day range) — dropped
      const c = checkControl(val, control);
      if (c.ok === false) return c;
      if (c.ok === true) exceptions[key] = c.value;
    }
  }
  const note = typeof v.note === "string" && v.note.trim() ? v.note.trim().slice(0, MAX_TEXT) : undefined;
  return { ok: true, value: { base: base.value, varies, ...(Object.keys(exceptions).length ? { exceptions } : {}), ...(note ? { note } : {}) } as CalibrationAnswerValue };
}

export function scenarioActionsFor(q: CalibrationQuestion, ctx: CalibrationContext): ChoiceOption[] {
  return q.dynamicActions ? q.dynamicActions(ctx) : (q.scenario?.actions ?? []);
}

function checkItem(q: CalibrationQuestion, v: unknown, ctx: CalibrationContext): Check {
  if (isObj(v) && v.notApplicable === true) return q.allowNotApplicable ? { ok: true, value: { notApplicable: true } } : { ok: false, message: "This question needs an answer." };
  switch (q.kind) {
    case "description": {
      const r = checkChoices(v, q.control?.kind === "multi" ? q.control.options : [], "multi");
      if (r.ok === true && ((r.value as string[]).length === 0 || (r.value as string[]).some((a) => !(AREA_IDS as string[]).includes(a)))) return { ok: false, message: "Choose at least one coaching area." };
      return r;
    }
    case "control": {
      const control = controlFor(q, ctx);
      if (!control) return { ok: false, message: "Unknown question." };
      // Options computed from earlier answers (e.g. no "Cardio" lever once the
      // coach says they don't prescribe cardio): a choice that's no longer
      // offered is stale, not malformed — drop it, and the whole answer if
      // nothing is left.
      if (q.dynamicControl && (control.kind === "multi" || control.kind === "ranked") && Array.isArray(v)) {
        const offered = new Set(control.options.map((o) => o.value));
        const kept = v.filter((x) => typeof x !== "string" || offered.has(x) || (control.kind === "multi" && control.otherAllowed && x.startsWith(OTHER_PREFIX)));
        if (kept.length === 0 && v.length > 0) return { ok: "drop" };
        return checkControl(kept, control);
      }
      return checkControl(v, control);
    }
    case "layered":
      return checkLayered(v, q, ctx);
    case "scenario": {
      if (!q.scenario) return { ok: false, message: "Unknown question." };
      const r = validateDecisionPolicy(v, q.scenario, scenarioActionsFor(q, ctx));
      return r.ok ? { ok: true, value: r.policy } : { ok: false, message: r.message };
    }
    case "policy": {
      if (!isObj(v) || !Array.isArray(v.stricter)) return { ok: false, message: "Confirm the safety minimums." };
      const allowed = new Set((q.policy?.stricter ?? []).map((o) => o.value));
      if (v.stricter.some((s) => typeof s !== "string" || !allowed.has(s))) return { ok: false, message: "That rule isn't available." };
      return { ok: true, value: { stricter: [...new Set(v.stricter as string[])] } };
    }
    default:
      return { ok: false, message: "Unknown question." };
  }
}

export type CalibrationValidation = { ok: true; answers: CalibrationAnswers } | { ok: false; message: string; key: string };

/**
 * Validates a whole v2 answer bag. Unknown keys are dropped, metadata is
 * reduced to its known shape, and answers for questions that no longer
 * apply are pruned. Returns the first malformed answer as an error.
 */
export function validateCalibrationAnswers(raw: CalibrationAnswers): CalibrationValidation {
  const input = isObj(raw) ? raw : {};
  const out: CalibrationAnswers = { [CALIBRATION_SCHEMA_KEY]: CALIBRATION_SCHEMA_VERSION };

  if (typeof input.coach_description === "string") out.coach_description = input.coach_description.slice(0, MAX_TEXT);
  const itemsByKey = new Map<string, CalibrationQuestion[]>();
  for (const q of ALL_CALIBRATION_ITEMS) {
    if (q.kind === "group") continue;
    const key = answerKeyOf(q);
    itemsByKey.set(key, [...(itemsByKey.get(key) ?? []), q]);
  }
  if (Array.isArray(input[NEEDS_CONFIRMATION_KEY])) {
    out[NEEDS_CONFIRMATION_KEY] = [...new Set((input[NEEDS_CONFIRMATION_KEY] as unknown[]).filter((k): k is string => typeof k === "string" && itemsByKey.has(k)))];
  }
  if (isObj(input.__v1Notes)) {
    const notes: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.__v1Notes as Record<string, unknown>)) if (itemsByKey.has(k) && typeof v === "string") notes[k] = v.slice(0, MAX_TEXT);
    if (Object.keys(notes).length) out.__v1Notes = notes;
  }
  if (isObj(input[STEP0_SUGGESTION_KEY])) {
    const s = input[STEP0_SUGGESTION_KEY] as Record<string, unknown>;
    const strs = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").slice(0, 20) : []);
    out[STEP0_SUGGESTION_KEY] = { areas: strs(s.areas), sports: strs(s.sports), uncertain: s.uncertain === true };
  }

  // Validate scope questions first so later visibility is computed from
  // already-validated scope.
  const order = [...itemsByKey.keys()].sort((a, b) => (SCOPE_KEYS.includes(a) ? 0 : 1) - (SCOPE_KEYS.includes(b) ? 0 : 1));
  for (const key of order) {
    if (!(key in input) || input[key] === undefined || input[key] === null) continue;
    const ctx = buildCalibrationContext(out);
    const candidates = itemsByKey.get(key)!;
    const q = candidates.find((c) => !c.visibleIf || c.visibleIf(ctx)) ?? candidates[0];
    const result = checkItem(q, input[key], ctx);
    if (result.ok === false) return { ok: false, message: result.message, key };
    if (result.ok === true) out[key] = result.value;
  }
  return { ok: true, answers: pruneCalibrationAnswers(out) };
}

const SCOPE_KEYS = ["coaching_areas", "client_modifiers", "experience_levels", "nutrition_scope", "practice_goals", "programs_resistance", "endurance_sports", "sport_performance_sports", "t_days", "t_effort_metric", "n_approach", "n_protein_basis", "e_volume_unit", "t_deload_approach", "s_peaking"];

/** Top-level questions, in bank order — used by callers that need a stable
 * question list without group parts. */
export const TOP_LEVEL_QUESTIONS = CALIBRATION_QUESTIONS;
