// Gate 3.2 — Settings as the Coach Brain editor. Pure helpers that let
// Settings edit the SAME canonical calibration answers the interview
// produces: same question bank, same applicability, same validation, same
// formatting. Nothing here defines methodology of its own.
//
// The editor keeps a draft of the active method's answers; these helpers
// say what changed, what newly needs the coach's input (e.g. after adding a
// coaching area), and whether the draft can be confirmed as a new version.

import { ALL_CALIBRATION_ITEMS, CALIBRATION_QUESTIONS, CHAPTER_ORDER, answerKeyOf } from "./questions.ts";
import { applicableCalibrationChapters, buildCalibrationContext, calibrationV2Readiness, isApplicableItem, pruneCalibrationAnswers, visibleCalibrationQuestions } from "./engine.ts";
import { formatCalibrationAnswer } from "./format.ts";
import { validateCalibrationAnswers } from "./validate.ts";
import type { CalibrationAnswers, CalibrationChapterId, CalibrationContext, CalibrationQuestion, OperationalStatus } from "./types.ts";
import type { Provenance } from "../operating-model.ts";

const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x)) ?? "undefined";

/** Methodology answer keys only — metadata ("__…") and the free-text Step 0
 * description are not settings. */
function methodKeys(a: CalibrationAnswers): string[] {
  return Object.keys(a).filter((k) => !k.startsWith("__") && k !== "coach_description");
}

function leafFor(key: string, ctx: CalibrationContext): CalibrationQuestion | undefined {
  const leaves = ALL_CALIBRATION_ITEMS.filter((q) => q.kind !== "group" && answerKeyOf(q) === key);
  return leaves.find((q) => isApplicableItem(q, ctx)) ?? leaves[0];
}

function orderOf(q: CalibrationQuestion | undefined): number {
  if (!q) return Number.MAX_SAFE_INTEGER;
  return CHAPTER_ORDER.indexOf(q.chapter) * 1000 + ALL_CALIBRATION_ITEMS.indexOf(q);
}

export interface MethodChange {
  key: string;
  label: string;
  chapter: CalibrationChapterId;
  status: OperationalStatus;
  before: string;
  after: string;
  /** changed: a new value; added: newly set; removed: no longer part of the
   * method (it stays in earlier versions). */
  kind: "changed" | "added" | "removed";
}

/** Every methodology answer that differs between two answer sets, in
 * interview order, rendered with the same plain-language formatting as
 * Review and Settings. Answers that no longer apply are pruned first, so a
 * removed coaching area shows its answers as "removed". */
export function diffCalibrationAnswers(beforeRaw: CalibrationAnswers, afterRaw: CalibrationAnswers): MethodChange[] {
  const before = pruneCalibrationAnswers(beforeRaw);
  const after = pruneCalibrationAnswers(afterRaw);
  const ctxBefore = buildCalibrationContext(before);
  const ctxAfter = buildCalibrationContext(after);
  const keys = [...new Set([...methodKeys(before), ...methodKeys(after)])];
  const changes: (MethodChange & { order: number })[] = [];
  for (const key of keys) {
    if (canon(before[key]) === canon(after[key])) continue;
    const inAfter = after[key] !== undefined;
    const inBefore = before[key] !== undefined;
    const item = (inAfter ? leafFor(key, ctxAfter) : undefined) ?? leafFor(key, ctxBefore);
    if (!item) continue;
    changes.push({
      key,
      label: item.summaryLabel,
      chapter: item.chapter,
      status: item.status,
      before: inBefore ? formatCalibrationAnswer(leafFor(key, ctxBefore) ?? item, before, ctxBefore) : "Not set",
      after: inAfter ? formatCalibrationAnswer(item, after, ctxAfter) : "No longer part of your method",
      kind: inBefore && inAfter ? "changed" : inAfter ? "added" : "removed",
      order: orderOf(item),
    });
  }
  return changes
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const out: MethodChange & { order?: number } = { ...c };
      delete out.order;
      return out;
    });
}

export interface NeededSetting {
  key: string;
  label: string;
  chapter: CalibrationChapterId;
}

export interface MethodEditState {
  changes: MethodChange[];
  /** Required settings that now apply but have no answer — e.g. after the
   * coach adds a coaching area. Never guessed; the coach answers them. */
  needsInput: NeededSetting[];
  /** The first malformed answer, if any (the draft can't be saved). */
  invalid: { key: string; message: string } | null;
  dirty: boolean;
  /** Something changed, every answer is valid, nothing required is missing. */
  ready: boolean;
}

export function methodEditState(active: CalibrationAnswers, draft: CalibrationAnswers): MethodEditState {
  const v = validateCalibrationAnswers(draft);
  const answers = v.ok ? v.answers : pruneCalibrationAnswers(draft);
  const changes = diffCalibrationAnswers(active, answers);
  const ctx = buildCalibrationContext(answers);
  const needsInput = calibrationV2Readiness({ answers, aiAuthorityConfirmed: true })
    .unansweredKeys.map((key) => {
      const item = leafFor(key, ctx);
      return item ? { key, label: item.summaryLabel, chapter: item.chapter } : null;
    })
    .filter((x): x is NeededSetting => !!x);
  const invalid = v.ok ? null : { key: v.key, message: v.message };
  return { changes, needsInput, invalid, dirty: changes.length > 0, ready: changes.length > 0 && !invalid && needsInput.length === 0 };
}

/** The categories Settings shows for this method: the same chapters the
 * interview would ask, minus Review (authority is rendered by its own
 * control). */
export function editorChapters(answers: CalibrationAnswers): CalibrationChapterId[] {
  return applicableCalibrationChapters(answers).filter((c) => c !== "review" && c !== "ai_authority");
}

/** The questions a category edits — exactly those that apply to this coach
 * right now, in interview order. */
export function editorQuestions(chapter: CalibrationChapterId, answers: CalibrationAnswers): CalibrationQuestion[] {
  return visibleCalibrationQuestions(chapter, answers);
}

/** Answer keys a top-level question owns (a group's parts, or itself). */
export function questionAnswerKeys(q: CalibrationQuestion): string[] {
  return q.kind === "group" ? (q.parts ?? []).map(answerKeyOf) : [answerKeyOf(q)];
}

/**
 * A confirmed edit re-stamps every answered item's provenance. Items whose
 * answer didn't change keep the provenance they already had (when the coach
 * first chose them); only what actually changed gets the new timestamp.
 */
export function carryOverUnchangedProvenance(params: {
  previousProvenance: Record<string, Provenance>;
  previousAnswers: CalibrationAnswers;
  nextProvenance: Record<string, Provenance>;
  nextAnswers: CalibrationAnswers;
}): Record<string, Provenance> {
  const out: Record<string, Provenance> = { ...params.nextProvenance };
  const same = (key: string) => canon(params.previousAnswers[key]) === canon(params.nextAnswers[key]);
  for (const q of CALIBRATION_QUESTIONS.flatMap((x) => (x.kind === "group" ? [x, ...(x.parts ?? [])] : [x]))) {
    const prev = params.previousProvenance[q.id];
    if (!prev || !out[q.id]) continue;
    if (questionAnswerKeys(q).every(same)) out[q.id] = prev;
  }
  return out;
}
