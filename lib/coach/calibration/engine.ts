// Gate 3.1 — calibration v2 engine: applicability, progress, readiness.
//
// Scope comes ONLY from the coach's confirmed answers (coaching_areas,
// client_modifiers, nutrition_scope, practice_goals…). The Step 0
// interpreter's suggestion is stored under a metadata key and never read
// here. Pure — no React, no Supabase, no clock reads.

import { ALL_CALIBRATION_ITEMS, CALIBRATION_QUESTIONS, CHAPTER_ORDER, answerKeyOf } from "./questions.ts";
import {
  AREA_IDS,
  NEEDS_CONFIRMATION_KEY,
  type AreaId,
  type CalibrationAnswers,
  type CalibrationChapterId,
  type CalibrationContext,
  type CalibrationQuestion,
  type ControlSpec,
  type ModifierId,
  type NutritionScope,
} from "./types.ts";

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function buildCalibrationContext(answers: CalibrationAnswers): CalibrationContext {
  const areas = arr(answers.coaching_areas).filter((a): a is AreaId => (AREA_IDS as string[]).includes(a));
  const modifiers = arr(answers.client_modifiers).filter((m): m is ModifierId => m !== "none");
  const scopeRaw = answers.nutrition_scope;
  const nutritionScope: NutritionScope | null = scopeRaw === "full" || scopeRaw === "guidance" || scopeRaw === "none" ? scopeRaw : null;
  const goals = arr(answers.practice_goals);
  const programsResistance = answers.programs_resistance === true;
  const training = areas.includes("strength") || areas.includes("physique") || programsResistance;
  return {
    areasConfirmed: areas.length > 0,
    areas,
    modifiers,
    nutritionScope,
    goals,
    experience: arr(answers.experience_levels),
    enduranceSports: arr(answers.endurance_sports),
    sportPerformanceSports: arr(answers.sport_performance_sports),
    programsResistance,
    training,
    weightManagement: areas.includes("weight_management") || goals.includes("lose_fat"),
    answers,
  };
}

/** A question (or group part) applies right now. Before coaching areas are
 * confirmed, only Step 0's first screen exists. */
export function isApplicable(q: CalibrationQuestion, ctx: CalibrationContext): boolean {
  if (!ctx.areasConfirmed && q.id !== "coaching_areas") return false;
  if (q.visibleIf && !q.visibleIf(ctx)) return false;
  if (q.kind === "group") return (q.parts ?? []).some((p) => !p.visibleIf || p.visibleIf(ctx));
  return true;
}

export function visibleParts(q: CalibrationQuestion, ctx: CalibrationContext): CalibrationQuestion[] {
  return (q.parts ?? []).filter((p) => !p.visibleIf || p.visibleIf(ctx));
}

export function controlFor(q: CalibrationQuestion, ctx: CalibrationContext): ControlSpec | undefined {
  return q.dynamicControl ? q.dynamicControl(ctx) : q.control;
}

export function visibleCalibrationQuestions(chapter: CalibrationChapterId, answers: CalibrationAnswers): CalibrationQuestion[] {
  const ctx = buildCalibrationContext(answers);
  return CALIBRATION_QUESTIONS.filter((q) => q.chapter === chapter && isApplicable(q, ctx));
}

/** Chapters that currently apply, in order. AI authority and Review always
 * apply once the coach's areas are confirmed. */
export function applicableCalibrationChapters(answers: CalibrationAnswers): CalibrationChapterId[] {
  const ctx = buildCalibrationContext(answers);
  if (!ctx.areasConfirmed) return ["your_coaching"];
  return CHAPTER_ORDER.filter((c) => c === "ai_authority" || c === "review" || CALIBRATION_QUESTIONS.some((q) => q.chapter === c && isApplicable(q, ctx)));
}

// ---------------------------------------------------------------------------
// Answered / required
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function isNotApplicable(v: unknown): boolean {
  return isObject(v) && v.notApplicable === true;
}

/** Whether a stored value counts as an explicit answer for this item. */
export function isItemAnswered(q: CalibrationQuestion, answers: CalibrationAnswers): boolean {
  const v = answers[answerKeyOf(q)];
  if (v === undefined || v === null) return false;
  if (isNotApplicable(v)) return true;
  switch (q.kind) {
    case "description":
      return arr(v).length > 0;
    case "policy":
      return isObject(v) && Array.isArray(v.stricter);
    case "scenario":
      return isObject(v) && (v.mode === "single" ? arr(v.actions).length > 0 : v.mode === "conditional" && Array.isArray(v.rules) && arr(v.otherwise).length > 0);
    case "layered":
      return isObject(v) && v.base !== undefined && v.base !== null && !(Array.isArray(v.base) && v.base.length === 0) && typeof v.varies === "string";
    case "control": {
      const c = q.control;
      if (!c) return false;
      if (c.kind === "multi" || c.kind === "ranked" || c.kind === "tags") return arr(v).length > 0;
      if (c.kind === "boolean") return typeof v === "boolean";
      if (c.kind === "scale") return typeof v === "number";
      if (c.kind === "number") return isObject(v) && typeof v.value === "number";
      if (c.kind === "range") return isObject(v) && typeof v.min === "number";
      if (c.kind === "text") return typeof v === "string" && v.trim() !== "";
      return typeof v === "string" && v !== "";
    }
    default:
      return false;
  }
}

/** Group screens are answered when every visible required part is. */
export function isQuestionAnswered(q: CalibrationQuestion, answers: CalibrationAnswers, ctx = buildCalibrationContext(answers)): boolean {
  if (q.kind === "group") return visibleParts(q, ctx).every((p) => !p.required || isItemAnswered(p, answers));
  return isItemAnswered(q, answers);
}

/** Every required, currently-applicable item key (group parts listed
 * individually). */
export function requiredCalibrationKeys(answers: CalibrationAnswers): string[] {
  const ctx = buildCalibrationContext(answers);
  const keys: string[] = [];
  for (const q of CALIBRATION_QUESTIONS) {
    if (!isApplicable(q, ctx) || !q.required) continue;
    if (q.kind === "group") {
      for (const p of visibleParts(q, ctx)) if (p.required) keys.push(answerKeyOf(p));
    } else keys.push(answerKeyOf(q));
  }
  return [...new Set(keys)];
}

export function needsConfirmationIds(answers: CalibrationAnswers): string[] {
  return arr(answers[NEEDS_CONFIRMATION_KEY]);
}

export interface CalibrationV2Readiness {
  ready: boolean;
  unansweredKeys: string[];
  /** Mapped-from-v1 answers the coach still has to look at. */
  needsConfirmation: string[];
  authorityUnconfirmed: boolean;
}

export function calibrationV2Readiness(input: { answers: CalibrationAnswers; aiAuthorityConfirmed: boolean }): CalibrationV2Readiness {
  const answers = pruneCalibrationAnswers(input.answers);
  const ctx = buildCalibrationContext(answers);
  const unansweredKeys = requiredCalibrationKeys(answers).filter((key) => {
    const item = ALL_CALIBRATION_ITEMS.find((q) => answerKeyOf(q) === key && q.kind !== "group" && isApplicableItem(q, ctx));
    return item ? !isItemAnswered(item, answers) : false;
  });
  const visibleKeys = new Set(applicableItemKeys(answers));
  const needsConfirmation = needsConfirmationIds(answers).filter((k) => visibleKeys.has(k));
  return {
    ready: ctx.areasConfirmed && unansweredKeys.length === 0 && needsConfirmation.length === 0 && input.aiAuthorityConfirmed,
    unansweredKeys,
    needsConfirmation,
    authorityUnconfirmed: !input.aiAuthorityConfirmed,
  };
}

function parentOf(item: CalibrationQuestion): CalibrationQuestion | undefined {
  return CALIBRATION_QUESTIONS.find((q) => q.kind === "group" && (q.parts ?? []).some((p) => p.id === item.id));
}

/** A leaf item (question or group part) applies right now. */
export function isApplicableItem(item: CalibrationQuestion, ctx: CalibrationContext): boolean {
  const parent = parentOf(item);
  if (parent) return isApplicable(parent, ctx) && (!item.visibleIf || item.visibleIf(ctx));
  return isApplicable(item, ctx);
}

/** Every answer key that currently applies (leaf items only). */
export function applicableItemKeys(answers: CalibrationAnswers): string[] {
  const ctx = buildCalibrationContext(answers);
  return [...new Set(ALL_CALIBRATION_ITEMS.filter((q) => q.kind !== "group" && isApplicableItem(q, ctx)).map(answerKeyOf))];
}

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

/**
 * Drops answers for questions that no longer apply after an earlier answer
 * changed (e.g. a removed coaching area). Metadata keys ("__…") and the
 * coach's own description survive. Repeated until stable, since removing one
 * answer can make another question inapplicable.
 */
export function pruneCalibrationAnswers(answers: CalibrationAnswers): CalibrationAnswers {
  let current: CalibrationAnswers = { ...answers };
  for (let i = 0; i < 5; i++) {
    const keep = new Set(applicableItemKeys(current));
    const next: CalibrationAnswers = {};
    for (const [key, value] of Object.entries(current)) {
      if (key.startsWith("__") || key === "coach_description" || keep.has(key)) next[key] = value;
    }
    if (Object.keys(next).length === Object.keys(current).length) return next;
    current = next;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface CalibrationV2Progress {
  totalApplicable: number;
  answered: number;
  percentComplete: number;
}

/** Progress over the questions that apply to THIS coach right now (required
 * and optional screens), recomputed from current answers every time. */
export function computeCalibrationProgress(answers: CalibrationAnswers): CalibrationV2Progress {
  const ctx = buildCalibrationContext(answers);
  const visible = CALIBRATION_QUESTIONS.filter((q) => isApplicable(q, ctx) && (q.required || q.chapter !== "situations"));
  const answered = visible.filter((q) => isQuestionAnswered(q, answers, ctx)).length;
  const total = visible.length;
  return { totalApplicable: total, answered, percentComplete: total === 0 ? 0 : Math.round((answered / total) * 100) };
}

// ---------------------------------------------------------------------------
// Chapter status + unresolved-only navigation (UX helpers, read-only)
// ---------------------------------------------------------------------------

export type ChapterStatus = "complete" | "needs_review" | "incomplete" | "optional";

/**
 * A chapter's real state — never inferred from where the coach is:
 *   incomplete   — a required question that applies is unanswered;
 *   needs_review — everything required is answered, but a carried-over
 *                  answer still needs the coach's look;
 *   complete     — everything required is answered and looked at;
 *   optional     — nothing required here and nothing answered yet.
 */
export function chapterStatus(chapter: CalibrationChapterId, answers: CalibrationAnswers, opts: { aiAuthorityConfirmed?: boolean } = {}): ChapterStatus {
  if (chapter === "review") return "optional";
  if (chapter === "ai_authority") return opts.aiAuthorityConfirmed ? "complete" : "incomplete";
  const ctx = buildCalibrationContext(answers);
  const items = ALL_CALIBRATION_ITEMS.filter((q) => q.kind !== "group" && q.chapter === chapter && isApplicableItem(q, ctx));
  const needs = new Set(needsConfirmationIds(answers));
  if (items.some((q) => q.required && !isItemAnswered(q, answers))) return "incomplete";
  if (items.some((q) => needs.has(answerKeyOf(q)))) return "needs_review";
  if (items.some((q) => q.required) || items.some((q) => isItemAnswered(q, answers))) return "complete";
  return "optional";
}

/** Unresolved answer keys in interview order: required-but-unanswered, or
 * carried-over-and-not-yet-looked-at. */
export function unresolvedKeysInOrder(answers: CalibrationAnswers, kind: "required" | "needs_review"): string[] {
  const ctx = buildCalibrationContext(answers);
  const needs = new Set(needsConfirmationIds(answers));
  const out: string[] = [];
  for (const chapter of CHAPTER_ORDER) {
    for (const q of ALL_CALIBRATION_ITEMS) {
      if (q.kind === "group" || q.chapter !== chapter || !isApplicableItem(q, ctx)) continue;
      const key = answerKeyOf(q);
      const unresolved = kind === "required" ? q.required && !isItemAnswered(q, answers) : needs.has(key);
      if (unresolved && !out.includes(key)) out.push(key);
    }
  }
  return out;
}
