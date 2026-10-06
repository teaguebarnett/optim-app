// Gate 4.0C-1 / 4.0C-1B — an in-memory, immutable Fitness Knowledge
// registry: validation, deterministic queries, and the shipped knowledge
// set.
//
// validateKnowledge returns every problem it finds; createKnowledgeRegistry
// refuses to build (throws, listing them all) if there are any. Queries are
// pure functions of metadata — never of exercise names, which exist for
// search and display only.

import { ALL_SOURCES } from "./sources.ts";
import { RESISTANCE_CONCEPTS } from "./resistance/concepts.ts";
import { RESISTANCE_EXERCISES } from "./resistance/exercises.ts";
import {
  APPARATUS,
  BODY_POSITIONS,
  DEMANDS,
  EQUIPMENT,
  JOINT_ACTIONS,
  LEVELS,
  MOVEMENT_PATTERNS,
  MUSCLES,
  PROGRESSION_MODES,
  TRAINING_QUALITIES,
  TRUNK_SUPPORT,
  STANDARD_MACHINES,
  SPECIALTY_MACHINES,
  EXERCISE_ROLES,
  GRIPS,
  PULL_PATHS,
  ELBOW_PATHS,
  levelRank,
  type MovementPatternId,
  type MuscleId,
} from "./taxonomy.ts";
import {
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_SOURCE_TYPES,
  type ConceptEntry,
  type Evidence,
  type EvidenceLevel,
  type ExerciseEntry,
  type ExerciseFilter,
  type FitnessKnowledgeRegistry,
  type KnowledgeEntry,
  type KnowledgeSource,
  type KnowledgeSourceType,
  type SourceNeededItem,
  type SubstituteCandidate,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EVIDENCE_LEVEL_SOURCES: Record<EvidenceLevel, KnowledgeSourceType[]> = {
  consensus_guideline: ["position_stand", "guideline", "expert_consensus"],
  meta_analysis: ["meta_analysis"],
  systematic_review: ["systematic_review", "meta_analysis"],
  reference_work: ["textbook", "exercise_database"],
};

const has = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly string[]).includes(v as string);

function validateEvidence(where: string, e: Evidence, sources: Map<string, KnowledgeSource>, issues: string[]) {
  if (e.status === "source_needed") {
    if ((e as { sources?: unknown }).sources) issues.push(`${where}: source_needed evidence must not cite sources`);
    if (!e.notes) issues.push(`${where}: source_needed evidence needs a note`);
    return;
  }
  if (!e.sources?.length) issues.push(`${where}: ${e.status} evidence cites no source`);
  for (const c of e.sources ?? []) {
    const s = sources.get(c.sourceId);
    if (!s) {
      issues.push(`${where}: cites unknown source ${c.sourceId}`);
      continue;
    }
    if (e.status === "internal_curation" && s.type !== "internal_curation") issues.push(`${where}: internal_curation evidence cites external source ${s.id}`);
    if (e.status === "sourced") {
      if (s.type === "internal_curation") issues.push(`${where}: sourced evidence cites internal curation ${s.id}`);
      else if (!EVIDENCE_LEVEL_SOURCES[e.level]?.includes(s.type)) issues.push(`${where}: evidence level ${e.level} doesn't match source type ${s.type} (${s.id})`);
    }
  }
}

export function validateKnowledge(params: { sources: KnowledgeSource[]; entries: KnowledgeEntry[] }): string[] {
  const issues: string[] = [];
  const sources = new Map<string, KnowledgeSource>();
  for (const s of params.sources) {
    if (sources.has(s.id)) issues.push(`Duplicate source id ${s.id}`);
    sources.set(s.id, s);
    if (!has(KNOWLEDGE_SOURCE_TYPES, s.type)) issues.push(`Source ${s.id}: unknown type ${s.type}`);
    if (s.type !== "internal_curation" && (!s.citation || !(s.doi || s.url || s.pmid))) issues.push(`Source ${s.id}: external sources need a citation and a DOI, PMID or URL`);
    if (s.publishedOn && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s.publishedOn)) issues.push(`Source ${s.id}: malformed publishedOn ${s.publishedOn}`);
    if (s.doi && !/^10\.\d{4,9}\/\S+$/.test(s.doi)) issues.push(`Source ${s.id}: malformed DOI`);
  }

  const ids = new Set<string>();
  for (const e of params.entries) {
    if (ids.has(e.id)) issues.push(`Duplicate entry id ${e.id}`);
    ids.add(e.id);
  }
  const names = new Map<string, string>();
  for (const e of params.entries) {
    if (!has(KNOWLEDGE_DOMAINS, e.domain)) issues.push(`${e.id}: unknown domain ${e.domain}`);
    if (!Number.isInteger(e.version) || e.version < 1) issues.push(`${e.id}: version must be a positive integer`);
    validateEvidence(e.id, e.evidence, sources, issues);
    if (e.kind === "exercise") validateExercise(e, ids, issues, names);
    if (e.kind === "concept") validateConcept(e, sources, issues);
  }
  issues.push(...harderVariantCycles(params.entries.filter((e): e is ExerciseEntry => e.kind === "exercise")));
  return issues;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function validateExercise(e: ExerciseEntry, ids: Set<string>, issues: string[], names: Map<string, string>) {
  const at = (msg: string) => issues.push(`${e.id}: ${msg}`);
  if (!e.id.startsWith("exercise.")) at("exercise ids start with 'exercise.'");
  if (!e.patterns?.length) at("no movement pattern — no meaningful programming taxonomy");
  if (!e.primaryMuscles?.length) at("no primary muscle — no meaningful programming taxonomy");
  for (const p of e.patterns ?? []) if (!has(Object.keys(MOVEMENT_PATTERNS), p)) at(`unknown movement pattern ${p}`);
  for (const p of e.patterns ?? []) if (!ids.has(`pattern.${p}`)) at(`pattern ${p} has no registry entry`);
  for (const m of [...(e.primaryMuscles ?? []), ...(e.secondaryMuscles ?? [])]) {
    if (!has(Object.keys(MUSCLES), m)) at(`unknown muscle ${m}`);
    else if (!ids.has(`muscle.${m}`)) at(`muscle ${m} has no registry entry`);
  }
  for (const m of e.secondaryMuscles ?? []) if (e.primaryMuscles?.includes(m)) at(`${m} is both primary and secondary`);
  for (const a of e.jointActions ?? []) if (!has(Object.keys(JOINT_ACTIONS), a)) at(`unknown joint action ${a}`);
  if (!has(EQUIPMENT, e.equipment)) at(`unknown equipment ${e.equipment}`);
  for (const a of e.apparatus ?? []) if (!has(APPARATUS, a)) at(`unknown apparatus ${a}`);
  if (!e.positions?.length) at("no body position");
  for (const p of e.positions ?? []) if (!has(BODY_POSITIONS, p)) at(`unknown position ${p}`);
  for (const d of DEMANDS) if (!has(LEVELS, e.demands?.[d])) at(`demand ${d} missing or invalid`);
  if (!has(TRUNK_SUPPORT, e.trunkSupport)) at("trunkSupport missing or invalid");
  // Equipment specificity: a machine exercise names the specific machine it needs.
  if (e.equipment === "machine" && !e.apparatus.some((a) => has(STANDARD_MACHINES, a) || has(SPECIALTY_MACHINES, a))) at("machine exercise names no specific machine");
  // V2 metadata.
  if (!has(EXERCISE_ROLES, e.role)) at("role missing or invalid");
  if (!e.emphasis?.length) at("no stimulus emphasis");
  for (const m of e.emphasis ?? []) if (![...e.primaryMuscles, ...e.secondaryMuscles].includes(m)) at(`emphasis ${m} isn't one of its muscles`);
  if (e.path?.grip && !has(GRIPS, e.path.grip)) at(`unknown grip ${e.path.grip}`);
  if (e.path?.plane && !has(PULL_PATHS, e.path.plane)) at(`unknown path ${e.path.plane}`);
  if (e.path?.elbows && !has(ELBOW_PATHS, e.path.elbows)) at(`unknown elbow path ${e.path.elbows}`);
  for (const v of e.setupVariations ?? []) if (!v.label?.trim() || !v.changes?.trim()) at("setup variation needs a label and what it changes");
  for (const sp of e.specificity ?? []) {
    if (sp.exerciseId === e.id) at("lists itself in specificity");
    else if (!ids.has(sp.exerciseId)) at(`specificity target ${sp.exerciseId} doesn't exist`);
    if (!has(LEVELS, sp.level)) at(`specificity level ${sp.level} invalid`);
  }
  if (e.trunkSupport === "external" && !e.positions.some((p) => p === "prone" || p === "seated" || p === "standing")) at("external trunk support needs a prone, seated or standing (chest-pad) position");
  for (const [d, l] of Object.entries(e.loadedDemands ?? {})) if (!has(DEMANDS, d) || !has(LEVELS, l) || levelRank(l) <= levelRank(e.demands[d as keyof typeof e.demands])) at(`loaded demand ${d} must be a higher level than its base demand`);
  if (!has(LEVELS, e.loadingPotential)) at("invalid loadingPotential");
  for (const q of TRAINING_QUALITIES) if (!has(LEVELS, e.suitability?.[q])) at(`suitability ${q} missing or invalid`);
  if (!e.progressionModes?.length) at("no progression mode");
  for (const p of e.progressionModes ?? []) if (!has(PROGRESSION_MODES, p)) at(`unknown progression mode ${p}`);
  if (!e.prescription?.length) at("no prescription mode");
  if (e.contraction === "isometric" && !e.prescription.includes("time")) at("isometric exercises are prescribed by time");
  for (const v of e.harderVariants ?? []) {
    if (v === e.id) at("lists itself as a harder variant");
    else if (!ids.has(v)) at(`harder variant ${v} doesn't exist`);
  }
  for (const n of [e.name, ...(e.aliases ?? [])]) {
    const key = norm(n);
    const owner = names.get(key);
    if (owner && owner !== e.id) at(`name/alias "${n}" collides with ${owner}`);
    names.set(key, e.id);
  }
}

function validateConcept(e: ConceptEntry, sources: Map<string, KnowledgeSource>, issues: string[]) {
  const seen = new Set<string>();
  if (!e.claims.some((c) => c.kind === "definition")) issues.push(`${e.id}: concept has no definition`);
  for (const c of e.claims) {
    if (seen.has(c.id)) issues.push(`${e.id}: duplicate claim ${c.id}`);
    seen.add(c.id);
    validateEvidence(`${e.id}#${c.id}`, c.evidence, sources, issues);
    if (c.kind !== "definition" && c.evidence.status === "internal_curation") issues.push(`${e.id}#${c.id}: guidance/relationship claims must be sourced or marked source_needed — not internal curation`);
    for (const [k, r] of Object.entries(c.parameters ?? {})) {
      if (r.min === undefined && r.max === undefined) issues.push(`${e.id}#${c.id}: parameter ${k} has no bound`);
      if (r.min !== undefined && r.max !== undefined && r.min > r.max) issues.push(`${e.id}#${c.id}: parameter ${k} min > max`);
    }
    if (c.parameters && c.evidence.status !== "sourced") issues.push(`${e.id}#${c.id}: numeric parameters require a sourced claim`);
  }
}

function harderVariantCycles(exercises: ExerciseEntry[]): string[] {
  const graph = new Map(exercises.map((e) => [e.id, e.harderVariants ?? []]));
  const issues: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      issues.push(`Harder-variant cycle: ${[...path.slice(path.indexOf(id)), id].join(" → ")}`);
      return;
    }
    state.set(id, "visiting");
    for (const next of graph.get(id) ?? []) visit(next, [...path, id]);
    state.set(id, "done");
  };
  for (const id of graph.keys()) visit(id, []);
  return issues;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export function createKnowledgeRegistry(params: { version: string; sources: KnowledgeSource[]; entries: KnowledgeEntry[] }): FitnessKnowledgeRegistry {
  const issues = validateKnowledge(params);
  if (issues.length) throw new Error(`Invalid knowledge (${issues.length}):\n- ${issues.join("\n- ")}`);

  const sources = new Map(params.sources.map((s) => [s.id, deepFreeze(structuredClone(s))]));
  const entries = new Map(params.entries.map((e) => [e.id, deepFreeze(structuredClone(e))]));
  const all = [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
  const exercises = all.filter((e): e is ExerciseEntry => e.kind === "exercise");
  const concepts = all.filter((e): e is ConceptEntry => e.kind === "concept");

  const matches = (e: ExerciseEntry, f: ExerciseFilter): boolean => {
    if (f.patternsAnyOf && !e.patterns.some((p) => f.patternsAnyOf!.includes(p))) return false;
    if (f.excludePatterns && e.patterns.some((p) => f.excludePatterns!.includes(p))) return false;
    if (f.primaryMusclesAnyOf && !e.primaryMuscles.some((m) => f.primaryMusclesAnyOf!.includes(m))) return false;
    if (f.musclesAnyOf && ![...e.primaryMuscles, ...e.secondaryMuscles].some((m) => f.musclesAnyOf!.includes(m))) return false;
    if (f.equipmentAnyOf && !f.equipmentAnyOf.includes(e.equipment)) return false;
    if (f.apparatusAvailable && !e.apparatus.every((a) => f.apparatusAvailable!.includes(a))) return false;
    if (f.excludePositions && e.positions.some((p) => f.excludePositions!.includes(p))) return false;
    if (f.maxDemands) for (const [d, max] of Object.entries(f.maxDemands)) if (levelRank(e.demands[d as keyof typeof e.demands]) > levelRank(max!)) return false;
    if (f.mechanics && e.mechanics !== f.mechanics) return false;
    if (f.laterality && !f.laterality.includes(e.laterality)) return false;
    if (f.contraction && e.contraction !== f.contraction) return false;
    if (f.suitableFor && levelRank(e.suitability[f.suitableFor.quality]) < levelRank(f.suitableFor.atLeast)) return false;
    return true;
  };

  const claimEvidence = (entryId: string, claimId?: string): Evidence | undefined => {
    const e = entries.get(entryId);
    if (!e) return undefined;
    if (!claimId) return e.evidence;
    return e.kind === "concept" ? e.claims.find((c) => c.id === claimId)?.evidence : undefined;
  };

  return Object.freeze({
    version: params.version,
    get: (id: string) => entries.get(id),
    byDomain: (domain) => all.filter((e) => e.domain === domain),
    getExercise: (id: string) => exercises.find((e) => e.id === id),
    exercises: () => exercises,
    findExercises: (filter: ExerciseFilter = {}) => exercises.filter((e) => matches(e, filter)),
    exercisesForMuscle: (muscle: MuscleId, role: "primary" | "any" = "primary") => exercises.filter((e) => e.primaryMuscles.includes(muscle) || (role === "any" && e.secondaryMuscles.includes(muscle))),
    exercisesForPattern: (pattern: MovementPatternId) => exercises.filter((e) => e.patterns.includes(pattern)),
    substitutesFor(exerciseId, context = {}) {
      const target = exercises.find((e) => e.id === exerciseId);
      if (!target) throw new Error(`Unknown exercise ${exerciseId}`);
      const preserve = context.preserve ?? "target_and_pattern";
      const out: SubstituteCandidate[] = [];
      for (const e of exercises) {
        if (e.id === target.id || !matches(e, context)) continue;
        const sharedPrimaryMuscles = e.primaryMuscles.filter((m) => target.primaryMuscles.includes(m));
        const sharedPatterns = e.patterns.filter((p) => target.patterns.includes(p));
        const sameMechanics = e.mechanics === target.mechanics;
        const targetOk = sharedPrimaryMuscles.length > 0;
        const patternOk = sharedPatterns.includes(target.patterns[0]);
        const valid = preserve === "target" ? targetOk : preserve === "pattern" ? patternOk : targetOk && patternOk && sameMechanics;
        if (valid) out.push({ exercise: e, sharedPrimaryMuscles, sharedPatterns, sameMechanics });
      }
      return out;
    },
    easierVariants: (id: string) => exercises.filter((e) => e.harderVariants.includes(id)),
    concepts: () => concepts,
    concept: (topic: string) => concepts.find((c) => c.topic === topic),
    source: (id: string) => sources.get(id),
    sourcesFor(entryId: string, claimId?: string) {
      const ev = claimEvidence(entryId, claimId);
      if (!ev || ev.status === "source_needed") return [];
      return ev.sources.map((c) => sources.get(c.sourceId)!).filter(Boolean);
    },
    sourceNeeded(): SourceNeededItem[] {
      const out: SourceNeededItem[] = [];
      for (const e of all) {
        if (e.evidence.status === "source_needed") out.push({ entryId: e.id, statement: e.id, notes: e.evidence.notes });
        if (e.kind === "concept") for (const c of e.claims) if (c.evidence.status === "source_needed") out.push({ entryId: e.id, claimId: c.id, statement: c.statement, notes: c.evidence.notes });
      }
      return out;
    },
    ref: (id: string) => {
      const e = entries.get(id);
      return e ? { entryId: e.id, version: e.version } : undefined;
    },
  } satisfies FitnessKnowledgeRegistry);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Shipped knowledge set
// ---------------------------------------------------------------------------

const taxonomyEvidence: Evidence = { status: "internal_curation", sources: [{ sourceId: "src.optim_resistance_taxonomy_v1" }], reviewedByQualifiedExpert: false };

function taxonomyEntries(): KnowledgeEntry[] {
  const base = { version: 1, scope: "coaching" as const, evidence: taxonomyEvidence };
  return [
    ...Object.entries(MUSCLES).map(([muscle, m]): KnowledgeEntry => ({ ...base, id: `muscle.${muscle}`, kind: "muscle", domain: "anatomy", muscle: muscle as MuscleId, name: m.name, region: m.region })),
    ...Object.entries(JOINT_ACTIONS).map(([action, a]): KnowledgeEntry => ({ ...base, id: `joint_action.${action}`, kind: "joint_action", domain: "biomechanics", action: action as keyof typeof JOINT_ACTIONS, joint: a.joint })),
    ...Object.entries(MOVEMENT_PATTERNS).map(([pattern, p]): KnowledgeEntry => ({ ...base, id: `pattern.${pattern}`, kind: "movement_pattern", domain: "biomechanics", pattern: pattern as MovementPatternId, name: p.name, category: p.category })),
  ];
}

/** 0.5.0 — Fitness Knowledge V2: richer exercise metadata (trunk support incl. thigh-anchored, role, stimulus
 * emphasis, grip/arm path, setup variations, strength specificity) and broader coverage (supported and lat-focused
 * pulling, supported pressing, machine/isolation options). Changing it changes every planning-state fingerprint. */
export const FOUNDATION_KNOWLEDGE_VERSION = "0.5.0";

/** The knowledge set OPTIM ships today. */
export const FOUNDATION_KNOWLEDGE: FitnessKnowledgeRegistry = createKnowledgeRegistry({
  version: FOUNDATION_KNOWLEDGE_VERSION,
  sources: ALL_SOURCES,
  entries: [...taxonomyEntries(), ...RESISTANCE_EXERCISES, ...RESISTANCE_CONCEPTS],
});
