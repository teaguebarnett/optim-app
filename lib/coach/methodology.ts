// The coach methodology that program generation actually reads, and whether
// the coach has genuinely confirmed it.
//
// Supabase mode bootstraps a coach_playbooks row from
// createDefaultCoachOperatingModel's hardcoded defaults and stores it with
// row status "approved" (lib/production/playbooks.ts's
// getOrBootstrapApprovedPlaybook) — so the row status alone is NOT evidence
// the coach chose anything. This module decides confirmation from the model
// itself: status "active" with an activatedAtIso, AND a coach_selected /
// coach_confirmed provenance entry (lib/coach/operating-model.ts) for every
// question whose answer generation reads. A bootstrapped default model has
// status "draft" and empty provenance, so it always reads as unconfirmed.
//
// The editable fields, their options, and their plain-language labels are
// the existing coach-onboarding question definitions
// (coach-onboarding-questions.ts) — never a second, drifting copy — and
// answers are applied through the existing applyCoachAnswersToModel, which
// is what records the coach_selected provenance. Pure; tested by
// lib/coach/verify-methodology.mts.

import { COACH_ONBOARDING_QUESTIONS, type CoachOnboardingQuestionDef } from "./coach-onboarding-questions.ts";
import { applyCoachAnswersToModel } from "./coach-onboarding-engine.ts";
import { isCoachOperatingModelConfirmed, type CoachOperatingModel } from "./operating-model.ts";

/** Every coach-onboarding question whose answer the training generator
 * (program-directions.ts, universal-program-generation.ts,
 * program-periodization.ts) reads — verified against their `com.*` reads.
 * practice_common_goals is included because "athletic_performance" there
 * adds power work (universal-program-generation.ts usesAthleticPowerTraining). */
export const GENERATION_METHOD_QUESTION_IDS = [
  "program_splits",
  "program_frequency",
  "program_sets_reps",
  "program_rep_philosophy",
  "program_rpe_rir",
  "program_proximity_to_failure",
  "program_progression",
  "program_deload",
  "program_warmup",
  "program_cardio",
  "program_exercises_avoided",
  "practice_common_goals",
] as const;

export type MethodQuestionId = (typeof GENERATION_METHOD_QUESTION_IDS)[number];
export type MethodAnswers = Partial<Record<MethodQuestionId, string | string[]>>;

export function methodQuestion(id: MethodQuestionId): CoachOnboardingQuestionDef {
  const q = COACH_ONBOARDING_QUESTIONS.find((question) => question.id === id);
  if (!q) throw new Error(`methodQuestion: unknown question ${id}`);
  return q;
}

/** Proximity to failure only applies when the coach uses RPE or RIR —
 * mirrors the onboarding question's own visibleIf. */
export function requiredMethodQuestionIds(usesRpeOrRir: string): MethodQuestionId[] {
  return GENERATION_METHOD_QUESTION_IDS.filter((id) => id !== "program_proximity_to_failure" || usesRpeOrRir !== "neither");
}

// ---------------------------------------------------------------------------
// Confirmation state
// ---------------------------------------------------------------------------

export interface MethodologyConfirmation {
  confirmed: boolean;
  /** When the coach confirmed this method (operatingModel.activatedAtIso). */
  confirmedAtIso: string | null;
  operatingModelVersion: number;
  /** Plain-language names of generation fields not yet coach-confirmed. */
  unconfirmedFields: string[];
}

export function getMethodologyConfirmation(model: CoachOperatingModel | null): MethodologyConfirmation {
  if (!model) return { confirmed: false, confirmedAtIso: null, operatingModelVersion: 0, unconfirmedFields: GENERATION_METHOD_QUESTION_IDS.map(fieldLabel) };
  const required = requiredMethodQuestionIds(model.programArchitecture.usesRpeOrRir);
  const unconfirmed = required.filter((id) => !isCoachOperatingModelConfirmed(model, [id]));
  const statusOk = model.status === "active" && !!model.activatedAtIso;
  return {
    confirmed: statusOk && unconfirmed.length === 0,
    confirmedAtIso: statusOk ? (model.activatedAtIso ?? null) : null,
    operatingModelVersion: model.version,
    unconfirmedFields: (statusOk ? unconfirmed : required).map(fieldLabel),
  };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<MethodQuestionId, string> = {
  program_splits: "Training splits",
  program_frequency: "Training frequency",
  program_sets_reps: "Working sets per exercise",
  program_rep_philosophy: "Rep ranges",
  program_rpe_rir: "Effort scale (RPE / RIR)",
  program_proximity_to_failure: "Proximity to failure",
  program_progression: "Progression",
  program_deload: "Deloads",
  program_warmup: "Warm-up",
  program_cardio: "Cardio",
  program_exercises_avoided: "Exercises you avoid",
  practice_common_goals: "Goals you support",
};

export function fieldLabel(id: MethodQuestionId): string {
  return FIELD_LABELS[id];
}

/** The question's own option label for a stored value, e.g.
 * "moderate_8_12" -> "Mostly moderate reps (8–12)". Unknown values fall back
 * to a de-snake-cased string, never the raw enum. */
export function optionLabel(id: MethodQuestionId, value: string): string {
  const option = methodQuestion(id).options?.find((o) => o.value === value);
  return option ? option.label : humanize(value);
}

export function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------------------------------------------------------------------------
// Model <-> answers
// ---------------------------------------------------------------------------

/** Current model values expressed as question answers — pre-fills the
 * Settings review form. Values are shown for review, never treated as
 * confirmed until submitted. */
export function methodAnswersFromModel(model: CoachOperatingModel): Required<MethodAnswers> {
  const a = model.programArchitecture;
  return {
    program_splits: [...a.preferredSplits],
    program_frequency: `${a.typicalFrequencyDaysMin}_${a.typicalFrequencyDaysMax}`,
    program_sets_reps: `${a.setsPerExerciseMin}_${a.setsPerExerciseMax}`,
    program_rep_philosophy: a.repRangePhilosophy,
    program_rpe_rir: a.usesRpeOrRir,
    program_proximity_to_failure: a.proximityToFailure,
    program_progression: a.progressionMethod,
    program_deload: a.deloadFrequencyWeeks === null ? "as_needed" : String(a.deloadFrequencyWeeks),
    program_warmup: a.warmupPhilosophy,
    program_cardio: a.cardioPhilosophy,
    program_exercises_avoided: a.exercisesAvoided.join(", "),
    practice_common_goals: [...model.practice.commonGoals],
  };
}

/** A readable one-line value per generation field, for Settings and the
 * proposal "Inputs used" summary. */
export function describeMethodField(model: CoachOperatingModel, id: MethodQuestionId): string {
  const answers = methodAnswersFromModel(model);
  const raw = answers[id];
  if (id === "program_exercises_avoided") return typeof raw === "string" && raw.trim() ? raw : "None";
  if (Array.isArray(raw)) return raw.length > 0 ? raw.map((v) => optionLabel(id, v)).join(", ") : "None selected";
  return optionLabel(id, raw);
}

export type ParseMethodAnswersResult = { ok: true; answers: Required<MethodAnswers> } | { ok: false; message: string };

/** Validates submitted answers against each question's own option list.
 * Every required field must be explicitly present — nothing is filled from
 * the current model or a default. */
export function parseMethodAnswers(raw: MethodAnswers): ParseMethodAnswersResult {
  const errors: string[] = [];
  const out: Partial<Record<MethodQuestionId, string | string[]>> = {};
  const rpeRir = typeof raw.program_rpe_rir === "string" ? raw.program_rpe_rir : "";

  for (const id of GENERATION_METHOD_QUESTION_IDS) {
    const q = methodQuestion(id);
    const value = raw[id];
    if (id === "program_exercises_avoided") {
      out[id] = typeof value === "string" ? value.trim() : "";
      continue;
    }
    if (id === "program_proximity_to_failure" && rpeRir === "neither") {
      // Not applicable; keep whatever is submitted (validated if present).
      if (typeof value === "string" && value && !q.options?.some((o) => o.value === value)) errors.push(`${fieldLabel(id)} has an unknown value.`);
      out[id] = typeof value === "string" && value ? value : "2_4_reps_in_reserve";
      continue;
    }
    const allowed = new Set((q.options ?? []).map((o) => o.value));
    if (q.type === "multi_select") {
      const values = Array.isArray(value) ? value : [];
      if (values.length === 0) errors.push(`Choose at least one option for ${fieldLabel(id)}.`);
      else if (values.some((v) => !allowed.has(v))) errors.push(`${fieldLabel(id)} has an unknown value.`);
      out[id] = values;
    } else {
      if (typeof value !== "string" || !value) errors.push(`Choose ${fieldLabel(id)}.`);
      else if (!allowed.has(value)) errors.push(`${fieldLabel(id)} has an unknown value.`);
      out[id] = typeof value === "string" ? value : "";
    }
  }

  if (errors.length > 0) return { ok: false, message: errors.join(" ") };
  return { ok: true, answers: out as Required<MethodAnswers> };
}

/** The confirmed model: explicit answers applied through the existing
 * onboarding mapper (which records coach_selected provenance per question),
 * then activated. Always a new model version. */
export function confirmMethodology(base: CoachOperatingModel, answers: Required<MethodAnswers>, nowIso: string): CoachOperatingModel {
  const applied = applyCoachAnswersToModel(base, answers, nowIso);
  return { ...applied, version: base.version + 1, status: "active", createdAtIso: nowIso, activatedAtIso: nowIso, supersededByVersion: undefined };
}
