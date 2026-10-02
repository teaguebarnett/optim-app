// Gate 3.1 — test fixtures: an explicit, valid answer for every required
// question that applies to a given scope. Used by the verify suites only
// (never by product code paths), so tests track the real question bank.

import { ALL_CALIBRATION_ITEMS, answerKeyOf } from "./questions.ts";
import { buildCalibrationContext, controlFor, isApplicableItem, requiredCalibrationKeys } from "./engine.ts";
import { scenarioActionsFor } from "./validate.ts";
import { CALIBRATION_SCHEMA_KEY, CALIBRATION_SCHEMA_VERSION, type CalibrationAnswers, type CalibrationAnswerValue, type CalibrationQuestion, type ControlSpec } from "./types.ts";

export function sampleControlValue(control: ControlSpec): CalibrationAnswerValue {
  switch (control.kind) {
    case "single":
      return control.options[0].value;
    case "multi":
      return [control.options.find((o) => !o.exclusive)?.value ?? control.options[0].value];
    case "ranked":
      return [control.options[0].value];
    case "boolean":
      return true;
    case "scale":
      return Math.round((control.min + control.max) / 2);
    case "text":
      return "Explicit answer.";
    case "tags":
      return ["Explicit entry"];
    case "number":
      return { value: control.spec.min, unit: control.spec.unit };
    case "range":
      return { min: control.spec.min, max: control.spec.max, unit: control.spec.unit };
  }
}

function sampleFor(q: CalibrationQuestion, answers: CalibrationAnswers): CalibrationAnswerValue {
  const ctx = buildCalibrationContext(answers);
  const control = controlFor(q, ctx);
  switch (q.kind) {
    case "description":
      return ["strength"];
    case "control":
      return control ? sampleControlValue(control) : undefined;
    case "layered":
      return control ? { base: sampleControlValue(control) as never, varies: "no" } : undefined;
    case "scenario": {
      const actions = scenarioActionsFor(q, ctx);
      return actions.length ? { mode: "single", actions: [actions[0].value] } : undefined;
    }
    case "policy":
      return { stricter: [] };
    default:
      return undefined;
  }
}

/** Starting from `seed` (scope answers), explicitly answers every required
 * question that applies, until nothing required is left. */
export function answerAllRequired(seed: CalibrationAnswers): CalibrationAnswers {
  let answers: CalibrationAnswers = { [CALIBRATION_SCHEMA_KEY]: CALIBRATION_SCHEMA_VERSION, ...seed };
  for (let round = 0; round < 12; round++) {
    const ctx = buildCalibrationContext(answers);
    const missing = requiredCalibrationKeys(answers).filter((k) => answers[k] === undefined);
    if (missing.length === 0) return answers;
    for (const key of missing) {
      const item = ALL_CALIBRATION_ITEMS.find((q) => q.kind !== "group" && answerKeyOf(q) === key && isApplicableItem(q, ctx));
      if (!item) continue;
      const value = sampleFor(item, answers);
      if (value !== undefined) answers = { ...answers, [key]: value };
    }
  }
  return answers;
}
