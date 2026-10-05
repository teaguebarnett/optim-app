// Gate 4.0C-2A — the coach's confirmation: the only way a structured
// limitation becomes planning truth. Builds and validates the record stored
// on the health-review escalations row (structured_limitations), and
// re-validates it on every read. The raw coach text is kept verbatim
// inside the record (sourceText); a record only applies while it still
// matches the current documented limitation.

import type { ConstraintTag } from "../constraints.ts";
import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import type { InterpretationProposal } from "./interpret.ts";
import { dimensionOf, resolveRestrictionOption, subsumes } from "./vocabulary.ts";

export interface ConfirmedRestriction {
  optionId: string;
  label: string;
  tags: ConstraintTag[];
  origin: "proposed" | "coach_added" | "clarified";
  /** Gate 4.0C-4 — the coach's words this fact came from (its own provenance), when known. */
  quote?: string;
}

export interface StoredStructuredLimitations {
  schema: 1;
  /** The coach's documented limitation exactly as confirmed against. */
  sourceText: string;
  restrictions: ConfirmedRestriction[];
  /** The coach confirmed the text contains no exercise-level restriction. */
  noExerciseRestrictions: boolean;
  interpretation: {
    interpreter: InterpretationProposal["interpreter"];
    proposedOptionIds: string[];
    removedOptionIds: string[];
    addedOptionIds: string[];
    /** answer: one option id, "none", or (Gate 4.0C-4) several independent option ids. */
    clarifications: Array<{ quote: string; answer: string | string[] }>;
    /** Gate 4.0C-4 — options dropped because a stricter selected option already implies them. */
    subsumedOptionIds?: string[];
  };
  confirmedAtIso: string;
  confirmedBy: string;
}

export interface ConfirmationInput {
  sourceText: string;
  proposal: InterpretationProposal | null;
  /** Every option id the coach left checked or added. */
  selectedOptionIds: string[];
  /** quote → chosen option id(s), or "none" (not a restriction). Several ids when the words state
   * several independent facts; at most one per dimension (dimensionOf). */
  clarificationAnswers: Record<string, string | string[]>;
  noExerciseRestrictions: boolean;
  coachUserId: string;
  nowIso: string;
}

export type ConfirmationResult = { ok: true; record: StoredStructuredLimitations } | { ok: false; errors: string[] };

const normText = (s: string) => s.replace(/\s+/g, " ").trim();

export function buildConfirmation(input: ConfirmationInput, knowledge: FitnessKnowledgeRegistry): ConfirmationResult {
  const errors: string[] = [];
  const sourceText = input.sourceText.trim();
  if (!sourceText) errors.push("There's no documented limitation to confirm.");
  if (input.proposal && normText(input.proposal.sourceText) !== normText(sourceText)) errors.push("The limitation text changed since OPTIM interpreted it — interpret it again.");

  const answerList = (a: string | string[] | undefined) => (a === undefined ? [] : Array.isArray(a) ? a : [a]);
  const quoteOf = new Map<string, string>();
  for (const c of input.proposal?.clarifications ?? []) {
    const answer = answerList(input.clarificationAnswers[c.quote]);
    if (!answer.length) {
      errors.push(`Answer the clarification for “${c.quote}”.`);
      continue;
    }
    if (answer.includes("none") && answer.length > 1) {
      errors.push(`For “${c.quote}”, choose restrictions or “not an exercise restriction”, not both.`);
      continue;
    }
    const unknown = answer.filter((a) => a !== "none" && !resolveRestrictionOption(a, knowledge));
    if (unknown.length) errors.push(`Unknown answer for “${c.quote}”.`);
    // Single select only within ONE dimension (e.g. two bracing levels contradict each other).
    const perDim = new Map<string, string[]>();
    for (const a of answer.filter((x) => x !== "none")) perDim.set(dimensionOf(a, knowledge).key, [...(perDim.get(dimensionOf(a, knowledge).key) ?? []), a]);
    for (const [, ids] of perDim) if (ids.length > 1) errors.push(`For “${c.quote}”, choose one level of ${dimensionOf(ids[0], knowledge).label.toLowerCase()} — ${ids.map((i) => resolveRestrictionOption(i, knowledge)?.label ?? i).join(" vs ")} contradict each other.`);
    for (const a of answer) if (a !== "none" && !quoteOf.has(a)) quoteOf.set(a, c.quote);
  }
  const clarified = [...quoteOf.keys()];
  const proposedQuotes = new Map((input.proposal?.restrictions ?? []).map((r) => [r.optionId, r.quote]));
  let ids = [...new Set([...input.selectedOptionIds, ...clarified])];
  const chosen = [...ids]; // what the coach selected, before implied duplicates are folded away
  // Equivalent / weaker duplicates: keep the strictest; record what was implied (never silently lost).
  const subsumed = ids.filter((a) => ids.some((b) => b !== a && resolveRestrictionOption(a, knowledge) && resolveRestrictionOption(b, knowledge) && subsumes(resolveRestrictionOption(b, knowledge)!.tags, resolveRestrictionOption(a, knowledge)!.tags) && !(subsumes(resolveRestrictionOption(a, knowledge)!.tags, resolveRestrictionOption(b, knowledge)!.tags) && a < b)));
  ids = ids.filter((a) => !subsumed.includes(a));
  const restrictions: ConfirmedRestriction[] = [];
  const proposed = new Set(input.proposal?.restrictions.map((r) => r.optionId) ?? []);
  for (const id of ids) {
    const opt = resolveRestrictionOption(id, knowledge);
    if (!opt) {
      errors.push(`Unknown restriction “${id}”.`);
      continue;
    }
    const quote = proposedQuotes.get(id) ?? quoteOf.get(id);
    restrictions.push({ optionId: id, label: opt.label, tags: opt.tags, origin: proposed.has(id) ? "proposed" : clarified.includes(id) && !input.selectedOptionIds.includes(id) ? "clarified" : "coach_added", ...(quote ? { quote } : {}) });
  }
  if (input.noExerciseRestrictions && restrictions.length) errors.push("Choose either restrictions or “no exercise restrictions”, not both.");
  if (!input.noExerciseRestrictions && restrictions.length === 0) errors.push("Choose at least one restriction, or confirm that this limitation doesn't restrict exercises.");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    record: {
      schema: 1,
      sourceText,
      restrictions,
      noExerciseRestrictions: input.noExerciseRestrictions,
      interpretation: {
        interpreter: input.proposal?.interpreter ?? { kind: "manual", reason: "Coach entered restrictions directly." },
        proposedOptionIds: [...proposed],
        removedOptionIds: [...proposed].filter((id) => !chosen.includes(id)),
        addedOptionIds: ids.filter((id) => !proposed.has(id)),
        clarifications: Object.entries(input.clarificationAnswers).map(([quote, answer]) => ({ quote, answer })),
        ...(subsumed.length ? { subsumedOptionIds: subsumed } : {}),
      },
      confirmedAtIso: input.nowIso,
      confirmedBy: input.coachUserId,
    },
  };
}

/** Strictly re-validates a stored record; anything malformed reads as "not confirmed". */
export function parseStoredLimitations(raw: unknown, knowledge: FitnessKnowledgeRegistry): StoredStructuredLimitations | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StoredStructuredLimitations>;
  if (r.schema !== 1 || typeof r.sourceText !== "string" || !r.sourceText.trim() || !Array.isArray(r.restrictions) || typeof r.noExerciseRestrictions !== "boolean") return null;
  if (typeof r.confirmedAtIso !== "string" || typeof r.confirmedBy !== "string" || !r.interpretation) return null;
  for (const x of r.restrictions) {
    const opt = resolveRestrictionOption(x?.optionId, knowledge);
    // Tags come from the canonical vocabulary, never from the stored blob.
    if (!opt || JSON.stringify(opt.tags) !== JSON.stringify(x.tags)) return null;
  }
  if (!r.noExerciseRestrictions && r.restrictions.length === 0) return null;
  return r as StoredStructuredLimitations;
}

/** A record applies only while it matches the coach's current documented text. */
export function isCurrentFor(record: StoredStructuredLimitations, documentedText: string | null | undefined): boolean {
  return !!documentedText && normText(record.sourceText) === normText(documentedText);
}
