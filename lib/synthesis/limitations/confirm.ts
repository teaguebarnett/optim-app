// Gate 4.0C-2A — the coach's confirmation: the only way a structured
// limitation becomes planning truth. Builds and validates the record stored
// on the health-review escalations row (structured_limitations), and
// re-validates it on every read. The raw coach text is kept verbatim
// inside the record (sourceText); a record only applies while it still
// matches the current documented limitation.

import type { ConstraintTag } from "../constraints.ts";
import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import type { InterpretationProposal } from "./interpret.ts";
import { resolveRestrictionOption } from "./vocabulary.ts";

export interface ConfirmedRestriction {
  optionId: string;
  label: string;
  tags: ConstraintTag[];
  origin: "proposed" | "coach_added" | "clarified";
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
    clarifications: Array<{ quote: string; answer: string }>;
  };
  confirmedAtIso: string;
  confirmedBy: string;
}

export interface ConfirmationInput {
  sourceText: string;
  proposal: InterpretationProposal | null;
  /** Every option id the coach left checked or added. */
  selectedOptionIds: string[];
  /** quote → chosen option id, or "none" (not a restriction). */
  clarificationAnswers: Record<string, string>;
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

  for (const c of input.proposal?.clarifications ?? []) {
    const answer = input.clarificationAnswers[c.quote];
    if (!answer) errors.push(`Answer the clarification for “${c.quote}”.`);
    else if (answer !== "none" && !resolveRestrictionOption(answer, knowledge)) errors.push(`Unknown answer for “${c.quote}”.`);
  }
  const clarified = Object.values(input.clarificationAnswers).filter((a) => a !== "none");
  const ids = [...new Set([...input.selectedOptionIds, ...clarified])];
  const restrictions: ConfirmedRestriction[] = [];
  const proposed = new Set(input.proposal?.restrictions.map((r) => r.optionId) ?? []);
  for (const id of ids) {
    const opt = resolveRestrictionOption(id, knowledge);
    if (!opt) {
      errors.push(`Unknown restriction “${id}”.`);
      continue;
    }
    restrictions.push({ optionId: id, label: opt.label, tags: opt.tags, origin: proposed.has(id) ? "proposed" : clarified.includes(id) && !input.selectedOptionIds.includes(id) ? "clarified" : "coach_added" });
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
        removedOptionIds: [...proposed].filter((id) => !ids.includes(id)),
        addedOptionIds: ids.filter((id) => !proposed.has(id)),
        clarifications: Object.entries(input.clarificationAnswers).map(([quote, answer]) => ({ quote, answer })),
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
