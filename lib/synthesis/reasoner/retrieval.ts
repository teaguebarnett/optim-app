// Gate 4.0C-3 — Fitness Knowledge retrieval: a bounded evidence packet for
// one reasoning call, never the whole corpus. Selection is by domain,
// goal emphasis and the client's eligible exercise pool (hard constraints,
// equipment categories and the coach's avoided exercises already applied;
// specific apparatus is marked on each row, never filtered). Every entry handed to the model is recorded so the validator
// can reject citations of anything not supplied.

import type { ExerciseEntry, FitnessKnowledgeRegistry, KnowledgeClaim } from "../knowledge/types.ts";
import type { ReasoningDomain } from "./domains.ts";

export interface EvidenceClaim {
  /** "concept.resistance.volume#volume.dose_response_hypertrophy" */
  ref: string;
  concept: string;
  statement: string;
  /** Plain description of what the claim rests on. */
  support: string;
  parameters?: KnowledgeClaim["parameters"];
  coachMethodDimension: string | null;
}

export interface EvidenceExercise {
  id: string;
  name: string;
  patterns: string[];
  primary: string[];
  secondary: string[];
  mechanics: string;
  laterality: string;
  equipment: string;
  demands: Record<string, string>;
  suitability: Record<string, string>;
  ordering: string;
  /** Fitness Knowledge V2 — what distinguishes candidates under constraints. */
  apparatus: string[];
  positions: string[];
  trunkSupport: string;
  role: string;
  emphasis: string[];
  path: { grip?: string; plane?: string; elbows?: string } | null;
  specificity: Array<{ exerciseId: string; level: string }>;
}

export interface EvidencePacket {
  domain: ReasoningDomain;
  claims: EvidenceClaim[];
  exercises: EvidenceExercise[];
  /** Every knowledge entry id / claim ref included above. */
  retrievedRefs: string[];
}

/** Concepts relevant to resistance planning; claims filtered by goal quality. */
const RESISTANCE_TOPICS = ["training_frequency", "volume", "repetition_range", "load", "effort", "rest_intervals", "exercise_order", "progression", "deload", "weekly_distribution", "stimulus_fatigue", "specificity", "exercise_variation", "session_duration"];

/** "Schoenfeld 2017", "ACSM 2009" — the full citation stays in the knowledge registry and provenance. */
function shortSource(src: { citation?: string; title: string; publishedOn?: string } | undefined): string {
  if (!src) return "unknown source";
  const year = src.publishedOn?.slice(0, 4) ?? "";
  const lead = src.citation?.startsWith("American College of Sports Medicine") ? "ACSM position stand" : (src.citation?.split(/[ ,]/)[0] ?? src.title.split(" ")[0]);
  return `${lead} ${year}`.trim();
}

/**
 * Evidence claims from a knowledge registry's concepts — shared by every Reasoner domain. Definitions are vocabulary,
 * not evidence (v1.1 token audit). Open questions (source_needed) are coach decisions, not planning evidence: the
 * v1.1 live evaluation showed the model citing them as support in 17 of 20 plans despite the label, so they are never
 * retrieved (Gate 4.0C-3A retrieval fix — not a prompt rule). `keep` applies the domain's own relevance filter.
 */
export function conceptClaims(knowledge: FitnessKnowledgeRegistry, topics: readonly string[], keep: (claim: KnowledgeClaim) => boolean = () => true): { claims: EvidenceClaim[]; refs: Set<string> } {
  const claims: EvidenceClaim[] = [];
  const refs = new Set<string>();
  for (const topic of topics) {
    const c = knowledge.concept(topic);
    if (!c) continue;
    for (const claim of c.claims) {
      if (claim.kind === "definition" || claim.evidence.status === "source_needed" || !keep(claim)) continue;
      const support =
        claim.evidence.status === "sourced"
          ? `${claim.evidence.sources.map((s) => shortSource(knowledge.source(s.sourceId))).join("; ")} (${claim.evidence.level.replace(/_/g, " ")})`
          : "OPTIM vocabulary";
      claims.push({ ref: `${c.id}#${claim.id}`, concept: c.name, statement: claim.statement, support, ...(claim.parameters ? { parameters: claim.parameters } : {}), coachMethodDimension: c.coachMethodDimension });
      refs.add(`${c.id}#${claim.id}`);
      refs.add(c.id);
    }
  }
  return { claims, refs };
}

export function retrieveEvidence(params: { knowledge: FitnessKnowledgeRegistry; domain: ReasoningDomain; emphasis: "strength" | "hypertrophy" | "general"; secondary: "strength" | "hypertrophy" | null; candidates: ExerciseEntry[] }): EvidencePacket {
  const { knowledge } = params;
  if (params.domain !== "resistance" && params.domain !== "general_fitness") return { domain: params.domain, claims: [], exercises: [], retrievedRefs: [] };
  const qualities = new Set<string>([params.emphasis, ...(params.secondary ? [params.secondary] : [])]);
  // "general" support keeps quality-agnostic claims plus definitions; strength/hypertrophy keep their own.
  const { claims, refs } = conceptClaims(knowledge, RESISTANCE_TOPICS, (claim) => {
    const q = claim.appliesTo?.qualities;
    return !(q && q.length && !q.some((x) => qualities.has(x)));
  });
  const exercises = params.candidates.map((e) => {
    refs.add(e.id);
    return {
      id: e.id,
      name: e.name,
      patterns: e.patterns,
      primary: e.primaryMuscles,
      secondary: e.secondaryMuscles,
      mechanics: e.mechanics,
      laterality: e.laterality,
      equipment: e.equipment,
      demands: { skill: e.demands.skill, stability: e.demands.stability, bracing: e.demands.bracing, spinal_loading: e.demands.spinal_loading, grip: e.demands.grip, systemic_fatigue: e.demands.systemic_fatigue },
      suitability: e.suitability,
      ordering: e.ordering,
      apparatus: e.apparatus,
      positions: e.positions,
      trunkSupport: e.trunkSupport,
      role: e.role,
      emphasis: e.emphasis,
      path: e.path ?? null,
      specificity: e.specificity,
    };
  });
  return { domain: params.domain, claims, exercises, retrievedRefs: [...refs] };
}
