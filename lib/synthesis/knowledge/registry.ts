// Gate 4.0C-1 — an in-memory, immutable Fitness Knowledge registry, plus the
// foundation knowledge set.
//
// The foundation set is deliberately thin: the movement patterns and
// exercises OPTIM's current library already uses, adapted with exactly the
// facts that library states (pattern, equipment, compound/isolation,
// substitute group). Everything it doesn't state — target muscles,
// demands, skill, prescription mode — is left undefined ("not yet curated"),
// never guessed. Richer, sourced knowledge is added later through the same
// createKnowledgeRegistry contract.

import { EXERCISE_LIBRARY } from "../../coach/exercise-library.ts";
import { KNOWLEDGE_DOMAINS, type ExerciseEntry, type ExerciseQuery, type FitnessKnowledgeRegistry, type KnowledgeEntry, type KnowledgeSource, type MovementPatternEntry } from "./types.ts";

export function createKnowledgeRegistry(params: { version: string; sources: KnowledgeSource[]; entries: KnowledgeEntry[] }): FitnessKnowledgeRegistry {
  const sources = new Map<string, KnowledgeSource>();
  for (const s of params.sources) {
    if (sources.has(s.id)) throw new Error(`Duplicate knowledge source id: ${s.id}`);
    sources.set(s.id, Object.freeze({ ...s }));
  }
  const entries = new Map<string, KnowledgeEntry>();
  for (const e of params.entries) {
    if (entries.has(e.id)) throw new Error(`Duplicate knowledge entry id: ${e.id}`);
    if (!(KNOWLEDGE_DOMAINS as readonly string[]).includes(e.domain)) throw new Error(`Unknown knowledge domain on ${e.id}: ${e.domain}`);
    for (const src of e.support.sources) if (!sources.has(src)) throw new Error(`Knowledge entry ${e.id} cites unknown source ${src}`);
    entries.set(e.id, deepFreeze(structuredClone(e)));
  }
  for (const e of entries.values()) {
    if (e.kind === "exercise") {
      if (!entries.has(e.pattern)) throw new Error(`Exercise ${e.id} references unknown movement pattern ${e.pattern}`);
      for (const sub of e.substitutes ?? []) if (!entries.has(sub)) throw new Error(`Exercise ${e.id} references unknown substitute ${sub}`);
    }
  }

  const all = [...entries.values()];
  return Object.freeze({
    version: params.version,
    get: (id: string) => entries.get(id),
    byDomain: (domain) => all.filter((e) => e.domain === domain),
    exercises: (query: ExerciseQuery = {}) =>
      all.filter((e): e is ExerciseEntry => {
        if (e.kind !== "exercise") return false;
        if (query.pattern && e.pattern !== query.pattern) return false;
        if (query.equipmentAnyOf && !e.equipment.some((x) => query.equipmentAnyOf!.includes(x))) return false;
        if (query.excludeRestrictionTags && (e.restrictionTags ?? []).some((t) => query.excludeRestrictionTags!.includes(t))) return false;
        return true;
      }),
    source: (id: string) => sources.get(id),
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
// Foundation knowledge set (v0.1.0)
// ---------------------------------------------------------------------------

export const LEGACY_LIBRARY_SOURCE: KnowledgeSource = {
  id: "src.optim_exercise_library_v1",
  type: "internal_curation",
  title: "OPTIM exercise library (lib/coach/exercise-library.ts)",
};

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const patternId = (pattern: string) => `pattern.${pattern}`;
export const exerciseId = (name: string) => `exercise.${slug(name)}`;

function foundationEntries(): KnowledgeEntry[] {
  const support = { sources: [LEGACY_LIBRARY_SOURCE.id], strength: "unrated" as const };
  const patterns = [...new Set(EXERCISE_LIBRARY.map((e) => e.pattern))].map(
    (p): MovementPatternEntry => ({ id: patternId(p), kind: "movement_pattern", name: p.replace(/_/g, " "), domain: "biomechanics", version: 1, scope: "coaching", support })
  );
  const exercises = EXERCISE_LIBRARY.map(
    (e): ExerciseEntry => ({
      id: exerciseId(e.name),
      kind: "exercise",
      name: e.name,
      domain: "exercise",
      version: 1,
      scope: "coaching",
      support,
      pattern: patternId(e.pattern),
      equipment: [e.equipment],
      mechanics: e.isCompound ? "compound" : "isolation",
      substitutes: EXERCISE_LIBRARY.filter((o) => o.substituteGroup === e.substituteGroup && o.name !== e.name).map((o) => exerciseId(o.name)),
      // Not stated by the source library → not curated yet (undefined),
      // never inferred from the name.
    })
  );
  return [...patterns, ...exercises];
}

export const FOUNDATION_KNOWLEDGE_VERSION = "0.1.0";

/** The knowledge set OPTIM ships today. */
export const FOUNDATION_KNOWLEDGE: FitnessKnowledgeRegistry = createKnowledgeRegistry({
  version: FOUNDATION_KNOWLEDGE_VERSION,
  sources: [LEGACY_LIBRARY_SOURCE],
  entries: foundationEntries(),
});
