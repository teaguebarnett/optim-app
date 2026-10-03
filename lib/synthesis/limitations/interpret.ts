// Gate 4.0C-2A — coach words → a PROPOSED structured interpretation.
//
// The proposal is never planning truth: it only pre-fills what the coach
// reviews and confirms (confirm.ts). The model, when available, may only
// choose from the canonical vocabulary (vocabulary.ts) and must quote the
// coach's own words for every item; output that names anything outside the
// vocabulary, or quotes words the coach didn't write, is rejected whole and
// the coach gets the manual editor instead. Vague words ("heavy", "hard")
// are never silently mapped — they become a clarification the coach answers.

import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { RESTRICTION_OPTIONS, resolveRestrictionOption } from "./vocabulary.ts";

export interface ProposedRestriction {
  optionId: string;
  /** The coach's words this comes from (verbatim substring). */
  quote: string;
}

export interface Clarification {
  quote: string;
  /** Why the words can't be mapped to one restriction. */
  why: string;
  /** One targeted question for the coach. */
  question: string;
  /** Candidate option ids; the coach may also answer "not a restriction". */
  choices: string[];
}

export interface InterpretationProposal {
  sourceText: string;
  interpreter: { kind: "model"; modelId: string } | { kind: "manual"; reason: string };
  restrictions: ProposedRestriction[];
  clarifications: Clarification[];
  /** Words that don't correspond to an exercise-level restriction (shown, never enforced). */
  unsupported: Array<{ quote: string; why: string }>;
}

/** The structured-JSON boundary the interpreter needs (lib/ai provides it). */
export interface StructuredJsonModel {
  modelId: string;
  generateJson(request: { systemPrompt: string; userMessage: string; maxOutputTokens: number }): Promise<unknown>;
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
const quoted = (source: string, quote: unknown) => typeof quote === "string" && quote.trim().length > 0 && norm(source).includes(norm(quote));

/** Words that describe effort or load loosely; never mapped without the coach. */
const VAGUE_TERMS: Array<{ re: RegExp; why: string; question: string; choices: string[] }> = [
  {
    re: /\bheavy\b|\bheavier\b/i,
    why: "“Heavy” could mean load, effort, bracing demand, spinal loading, or specific lifts.",
    question: "What should “heavy” rule out?",
    choices: ["avoid_bracing_high", "avoid_spinal_loading_high", "avoid_lower_compounds"],
  },
  {
    re: /\bhard\b|\bintense\b|\bstrenuous\b|\btoo much\b/i,
    why: "This could describe effort, bracing, or specific movements.",
    question: "Which restriction does this mean?",
    choices: ["avoid_bracing_high", "avoid_bracing_moderate", "avoid_spinal_loading_high"],
  },
  {
    re: /\bcareful\b|\bgentle\b|\blight\b|\beasy\b|\btake it easy\b/i,
    why: "A request to be careful doesn't name a specific exercise restriction.",
    question: "Is there a specific movement or demand to avoid?",
    choices: ["avoid_bracing_high", "avoid_spinal_loading_high", "avoid_impact_high"],
  },
];

export function buildInterpretationPrompt(knowledge: FitnessKnowledgeRegistry): string {
  const options = RESTRICTION_OPTIONS.map((o) => `- ${o.id}: ${o.label} — ${o.help}`).join("\n");
  const exercises = knowledge
    .exercises()
    .map((e) => `- exercise:${e.id}: ${e.name}${e.aliases.length ? ` (${e.aliases.join(", ")})` : ""}`)
    .join("\n");
  return `You translate a fitness coach's written training limitation for one client into proposed structured restrictions. The coach will review your proposal; nothing you return is applied automatically.

Rules:
- Use ONLY these restriction ids:
${options}
- Or a specific exercise id, only when the coach names an exercise that no restriction above covers:
${exercises}
- Every item must include "quote": the exact words from the coach's text it comes from (copied verbatim).
- Never add a restriction the coach's words don't support. Never loosen what the coach wrote. Never infer medical permission or clearance.
- If words are vague (e.g. "heavy", "hard", "be careful") or could mean several restrictions, return a clarification instead of guessing.
- If words describe something that isn't an exercise restriction (e.g. effort level, scheduling, "check in weekly"), list them under "unsupported".

Respond with ONLY one JSON object, no prose:
{"restrictions":[{"optionId":string,"quote":string}],"clarifications":[{"quote":string,"why":string,"question":string,"choices":[optionId,...]}],"unsupported":[{"quote":string,"why":string}]}`;
}

export type ParsedInterpretation = { ok: true; proposal: InterpretationProposal } | { ok: false; reason: string };

/** Validates model output against the canonical vocabulary and the coach's own words. Any violation rejects the whole output. */
export function parseInterpretation(raw: unknown, sourceText: string, knowledge: FitnessKnowledgeRegistry, modelId: string): ParsedInterpretation {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "output is not an object" };
  const o = raw as Record<string, unknown>;
  const list = (k: string) => (o[k] === undefined ? [] : Array.isArray(o[k]) ? (o[k] as unknown[]) : null);
  const restrictions = list("restrictions");
  const clarifications = list("clarifications");
  const unsupported = list("unsupported");
  if (!restrictions || !clarifications || !unsupported) return { ok: false, reason: "restrictions/clarifications/unsupported must be arrays" };

  const out: InterpretationProposal = { sourceText, interpreter: { kind: "model", modelId }, restrictions: [], clarifications: [], unsupported: [] };
  for (const r of restrictions as Array<Record<string, unknown>>) {
    if (typeof r?.optionId !== "string" || !resolveRestrictionOption(r.optionId, knowledge)) return { ok: false, reason: `unknown restriction id ${String(r?.optionId)}` };
    if (!quoted(sourceText, r.quote)) return { ok: false, reason: `quote for ${r.optionId} isn't in the coach's text` };
    if (!out.restrictions.some((x) => x.optionId === r.optionId)) out.restrictions.push({ optionId: r.optionId, quote: String(r.quote) });
  }
  for (const c of clarifications as Array<Record<string, unknown>>) {
    if (!quoted(sourceText, c?.quote)) return { ok: false, reason: "clarification quote isn't in the coach's text" };
    if (!Array.isArray(c.choices) || c.choices.some((x) => typeof x !== "string" || !resolveRestrictionOption(x, knowledge))) return { ok: false, reason: "clarification names an unknown restriction id" };
    if (typeof c.question !== "string" || !c.question.trim()) return { ok: false, reason: "clarification needs a question" };
    out.clarifications.push({ quote: String(c.quote), why: typeof c.why === "string" ? c.why : "", question: c.question, choices: c.choices as string[] });
  }
  for (const u of unsupported as Array<Record<string, unknown>>) {
    if (!quoted(sourceText, u?.quote)) return { ok: false, reason: "unsupported quote isn't in the coach's text" };
    out.unsupported.push({ quote: String(u.quote), why: typeof u.why === "string" ? u.why : "" });
  }
  return { ok: true, proposal: applyVagueGuard(out) };
}

/**
 * Deterministic guard on top of any interpretation: a vague term the
 * proposal doesn't already treat as a clarification becomes one, and a
 * proposed restriction whose ONLY support is a vague phrase is withdrawn
 * into that clarification (offered as a choice, not pre-selected).
 */
export function applyVagueGuard(p: InterpretationProposal): InterpretationProposal {
  const clarifications = [...p.clarifications];
  let restrictions = [...p.restrictions];
  for (const v of VAGUE_TERMS) {
    const m = p.sourceText.match(v.re);
    if (!m) continue;
    const phrase = sentenceAround(p.sourceText, m.index ?? 0);
    const vagueOnly = restrictions.filter((r) => v.re.test(r.quote) && norm(r.quote).split(" ").length <= 4);
    restrictions = restrictions.filter((r) => !vagueOnly.includes(r));
    // The vague word is part of a longer, concrete phrase a kept restriction quotes (e.g. "hard bracing") — already addressed.
    const covered = clarifications.some((c) => v.re.test(c.quote)) || restrictions.some((r) => v.re.test(r.quote));
    if (!covered) clarifications.push({ quote: phrase, why: v.why, question: v.question, choices: [...new Set([...vagueOnly.map((r) => r.optionId), ...v.choices])] });
    else if (vagueOnly.length) {
      const c = clarifications.find((x) => v.re.test(x.quote))!;
      c.choices = [...new Set([...c.choices, ...vagueOnly.map((r) => r.optionId)])];
    }
  }
  return { ...p, restrictions, clarifications };
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index - 1), text.lastIndexOf(",", index - 1), text.lastIndexOf(";", index - 1)) + 1;
  const ends = [".", ",", ";"].map((c) => text.indexOf(c, index)).filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end).trim() || text.trim();
}

/** The coach's editor with nothing pre-selected (model unavailable or rejected). */
export function manualProposal(sourceText: string, reason: string): InterpretationProposal {
  return applyVagueGuard({ sourceText, interpreter: { kind: "manual", reason }, restrictions: [], clarifications: [], unsupported: [] });
}

export async function interpretLimitationText(params: { sourceText: string; knowledge: FitnessKnowledgeRegistry; model: StructuredJsonModel | null; unavailableReason?: string }): Promise<InterpretationProposal> {
  const text = params.sourceText.trim();
  if (!text) return manualProposal(text, "There's no limitation text to interpret.");
  if (!params.model) return manualProposal(text, params.unavailableReason ?? "OPTIM's interpreter isn't available right now.");
  let raw: unknown;
  try {
    raw = await params.model.generateJson({ systemPrompt: buildInterpretationPrompt(params.knowledge), userMessage: `Coach's limitation text:\n"""${text}"""`, maxOutputTokens: 1500 });
  } catch (err) {
    return manualProposal(text, `OPTIM's interpreter didn't respond (${err instanceof Error ? err.message : "error"}).`);
  }
  const parsed = parseInterpretation(raw, text, params.knowledge, params.model.modelId);
  return parsed.ok ? parsed.proposal : manualProposal(text, `OPTIM's interpretation was discarded because it didn't validate (${parsed.reason}).`);
}
