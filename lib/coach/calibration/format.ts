// Gate 3.1 — plain-language rendering of v2 answers (Review, Settings,
// proposal "inputs used", chat prompt). Ranges render as ranges; a preferred
// value is shown only when the coach set one.

import { ALL_CALIBRATION_ITEMS, answerKeyOf } from "./questions.ts";
import { buildCalibrationContext, controlFor } from "./engine.ts";
import { describeDecisionPolicy } from "./decision-policy.ts";
import { scenarioActionsFor } from "./validate.ts";
import type { CalibrationAnswers, CalibrationContext, CalibrationQuestion, ChoiceOption, ControlSpec, DecisionPolicy, RangeAnswer } from "./types.ts";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function formatRange(r: RangeAnswer): string {
  const unit = r.unit ? ` ${r.unit}` : "";
  const core = r.max === null ? `${trimNumber(r.min)}+` : r.min === r.max ? trimNumber(r.min) : `${trimNumber(r.min)}–${trimNumber(r.max)}`;
  return `${core}${unit}${r.preferred !== undefined ? ` (usually ${trimNumber(r.preferred)})` : ""}`;
}

function optionLabel(options: ChoiceOption[], value: string): string {
  if (value.startsWith("other:")) return value.slice(6);
  return options.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

export function formatControlValue(control: ControlSpec | undefined, v: unknown): string {
  if (v === undefined || v === null) return "Not set";
  if (isObj(v) && v.notApplicable === true) return "Doesn't apply";
  if (!control) return String(v);
  switch (control.kind) {
    case "single":
      return typeof v === "string" ? optionLabel(control.options, v) : "Not set";
    case "multi":
      return Array.isArray(v) && v.length ? v.map((x) => optionLabel(control.options, String(x))).join(", ") : "None";
    case "ranked":
      return Array.isArray(v) && v.length ? v.map((x) => optionLabel(control.options, String(x))).join(" → ") : "None";
    case "boolean":
      return v === true ? (control.yesLabel ?? "Yes") : v === false ? (control.noLabel ?? "No") : "Not set";
    case "scale":
      return typeof v === "number" ? `${v}/${control.max}` : "Not set";
    case "text":
      return typeof v === "string" ? v : "Not set";
    case "tags":
      return Array.isArray(v) && v.length ? v.join("; ") : "None";
    case "number":
      return isObj(v) && typeof v.value === "number" ? `${trimNumber(v.value)} ${control.spec.unit}` : "Not set";
    case "range":
      return isObj(v) && typeof v.min === "number" ? formatRange(v as unknown as RangeAnswer) : "Not set";
  }
}

/** One answer, in plain language. */
export function formatCalibrationAnswer(q: CalibrationQuestion, answers: CalibrationAnswers, ctx: CalibrationContext = buildCalibrationContext(answers)): string {
  const v = answers[answerKeyOf(q)];
  if (v === undefined) return "Not set — OPTIM will ask you";
  if (isObj(v) && v.notApplicable === true) return "Doesn't apply";
  const control = controlFor(q, ctx);
  switch (q.kind) {
    case "description":
    case "control":
      return formatControlValue(control, v);
    case "layered": {
      if (!isObj(v)) return "Not set";
      const base = formatControlValue(control, v.base);
      const dims = q.variesBy ? q.variesBy(ctx) : [];
      const dim = dims.find((d) => d.id === v.varies);
      if (!dim) return base;
      if (dim.keys.length === 0) return `${base} — ${dim.label.toLowerCase()}`;
      const ex = isObj(v.exceptions) ? Object.entries(v.exceptions) : [];
      if (ex.length === 0) return base;
      return `${base}; ${ex.map(([k, val]) => `${optionLabel(dim.keys, k)}: ${formatControlValue(control, val)}`).join("; ")}`;
    }
    case "scenario":
      return q.scenario ? describeDecisionPolicy(v as DecisionPolicy, q.scenario, scenarioActionsFor(q, ctx)) : "Not set";
    case "policy": {
      const stricter = isObj(v) && Array.isArray(v.stricter) ? (v.stricter as string[]) : [];
      return stricter.length ? stricter.map((s) => optionLabel(q.policy?.stricter ?? [], s)).join("; ") : "OPTIM's safety minimums";
    }
    default:
      return "Not set";
  }
}

export function formatByKey(key: string, answers: CalibrationAnswers): string {
  const q = ALL_CALIBRATION_ITEMS.find((x) => x.kind !== "group" && answerKeyOf(x) === key);
  return q ? formatCalibrationAnswer(q, answers) : "Not set";
}
