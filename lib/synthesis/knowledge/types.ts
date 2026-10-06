// Gate 4.0C-1 / 4.0C-1B — the canonical OPTIM Fitness Knowledge layer:
// what is generally true or supported about training, independent of any
// coach or client.
//
// It is NOT the Coach Brain (how one coach chooses to coach) and never
// overrides it: guidance claims describe what sources support; where valid
// coaching choices differ, the coach's method decides. It never contains
// client facts. Planners query it through FitnessKnowledgeRegistry.
//
// Every entry is versioned and carries Evidence that says honestly what it
// rests on: an external source, OPTIM's own curation, or nothing yet
// (source_needed).

import type { ExerciseRole, TrunkSupport, GRIPS, PULL_PATHS, ELBOW_PATHS } from "./taxonomy.ts";
import type { GoalClass } from "../goal-contract.ts";
import type { ApparatusId, BodyPosition, Demand, EquipmentId, JointActionId, Level, MovementPatternId, MuscleId, ProgressionMode, TrainingQuality } from "./taxonomy.ts";

export type { Demand, Level } from "./taxonomy.ts";

export const KNOWLEDGE_DOMAINS = [
  "anatomy",
  "biomechanics",
  "exercise",
  "resistance_training",
  "endurance",
  "hybrid",
  "weight_management",
  "nutrition",
  "recovery",
  "general_fitness",
  "sport_performance",
  "population_modifiers",
] as const;
export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

// ---------------------------------------------------------------------------
// Sources and evidence
// ---------------------------------------------------------------------------

export const KNOWLEDGE_SOURCE_TYPES = ["position_stand", "guideline", "meta_analysis", "systematic_review", "textbook", "exercise_database", "expert_consensus", "internal_curation"] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  title: string;
  /** Full citation for external sources (required for them). */
  citation?: string;
  doi?: string;
  url?: string;
  pmid?: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD. */
  publishedOn?: string;
  /** How this record was checked (e.g. "PubMed record + abstract, 2026-10-02"). */
  verifiedVia?: string;
}

export interface SourceCitation {
  sourceId: string;
  /** Where in the source (e.g. "abstract"). */
  locator?: string;
}

/** The kind of evidence — derived from the cited sources' types, never a
 * free judgement. */
export type EvidenceLevel = "consensus_guideline" | "meta_analysis" | "systematic_review" | "reference_work";

export type Evidence =
  | { status: "sourced"; level: EvidenceLevel; sources: SourceCitation[]; notes?: string }
  /** OPTIM's own curation (taxonomy, exercise ratings). Honest, not science. */
  | { status: "internal_curation"; sources: SourceCitation[]; reviewedByQualifiedExpert: boolean; notes?: string }
  /** A claim worth having, with no source yet. Never presented as evidence. */
  | { status: "source_needed"; notes: string };

export type KnowledgeScope = "coaching" | "requires_clinical_judgment";

export interface KnowledgeEntryBase {
  id: string;
  domain: KnowledgeDomain;
  /** Bumped whenever the entry's meaning changes. */
  version: number;
  scope: KnowledgeScope;
  evidence: Evidence;
}

// ---------------------------------------------------------------------------
// Taxonomy entries (generated from taxonomy.ts)
// ---------------------------------------------------------------------------

export interface MuscleEntry extends KnowledgeEntryBase {
  kind: "muscle";
  muscle: MuscleId;
  name: string;
  region: "upper" | "lower" | "trunk";
}

export interface JointActionEntry extends KnowledgeEntryBase {
  kind: "joint_action";
  action: JointActionId;
  joint: string;
}

export interface MovementPatternEntry extends KnowledgeEntryBase {
  kind: "movement_pattern";
  pattern: MovementPatternId;
  name: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export interface ExerciseEntry extends KnowledgeEntryBase {
  kind: "exercise";
  name: string;
  /** Alternate names — for search only, never for logic. */
  aliases: string[];
  /** The exercise's name in lib/coach/exercise-library.ts, when it's there. */
  legacyName?: string;
  /** Every pattern that genuinely applies; the first is the main one. */
  patterns: MovementPatternId[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  jointActions: JointActionId[];
  equipment: EquipmentId;
  apparatus: ApparatusId[];
  positions: BodyPosition[];
  laterality: "bilateral" | "unilateral" | "alternating";
  mechanics: "compound" | "isolation";
  contraction: "dynamic" | "isometric";
  prescription: Array<"reps" | "time" | "distance">;
  demands: Record<Demand, Level>;
  loadingPotential: Level;
  /** How commonly it's used to train each quality — not a prescription. */
  suitability: Record<TrainingQuality, Level>;
  progressionModes: ProgressionMode[];
  /** Structural ordering consideration: e.g. high-skill/high-fatigue lifts tend to go early. */
  ordering: "early" | "flexible" | "late";
  /** Harder variants (exercise ids). Easier variants are derived. */
  harderVariants: string[];
  /**
   * Demands as they rise when the exercise is performed HEAVY or CLOSE TO
   * FAILURE (see LOADED_DEMAND_CONDITION). `demands` describes typical
   * submaximal work; real trunk bracing depends on load, effort, setup and
   * support, so a static level understates it under heavy loading. Only
   * dimensions that rise are listed. Internal curation (rule in
   * resistance/exercises.ts), pending qualified review.
   */
  loadedDemands: Partial<Record<Demand, Level>>;
  /**
   * Gate 4.0C-3C — how much the setup externally supports the trunk:
   * "external" (chest pad carries it), "partial" (back pad / bench), "none".
   * Decides how far OPTIM can trust execution conditions to keep a
   * load-sensitive demand low. Internal curation over positions/equipment.
   */
  trunkSupport: TrunkSupport;
  /** V2 — the training role it usually plays (a planning hint for the Reasoner, never a rule). */
  role: ExerciseRole;
  /** V2 — stimulus bias: the muscles this variation emphasises, most-emphasised first (a subset of primary +
   * secondary). Distinguishes e.g. a lat-biased row from an upper-back-biased one. */
  emphasis: MuscleId[];
  /** V2 — grip / arm path, only where it materially changes the stimulus or the constraint fit. */
  path?: { grip?: (typeof GRIPS)[number]; plane?: (typeof PULL_PATHS)[number]; elbows?: (typeof ELBOW_PATHS)[number] };
  /** V2 — setup variations that matter (what they change), kept on the exercise rather than as separate entries. */
  setupVariations: Array<{ label: string; changes: string }>;
  /** V2 — how directly it builds a main lift's strength (exercise id → level); empty when not a meaningful transfer. */
  specificity: Array<{ exerciseId: string; level: Level }>;
}

/**
 * Gate 4.0C-3B — when an exercise counts as performed heavy / close to
 * failure, so its `loadedDemands` apply: any prescription allowing fewer
 * than `minReps` reps or fewer than `minRir` reps in reserve. Staying at or
 * above both keeps the exercise at its base `demands`. Internal curation.
 */
export const LOADED_DEMAND_CONDITION = { minReps: 6, minRir: 2 } as const;

/**
 * Gate 4.0C-3C — how confidently Fitness Knowledge can place an exercise
 * relative to a demand restriction. Staying submaximal is NECESSARY for a
 * load-sensitive exercise, never proof that it stays below the limit.
 *  - compatible: base and loaded demand both below the limit.
 *  - conditional: below the limit only under stated execution/loading
 *    conditions, with the trunk partly supported by the setup.
 *  - uncertain: knowledge can't establish it (no trunk support; bracing
 *    then depends on load, setup, execution and the client) — coach review.
 *  - incompatible: base demand at or above the limit.
 */
export type DemandCompatibility = "compatible" | "conditional" | "uncertain" | "incompatible";

// ---------------------------------------------------------------------------
// Concepts — resistance-training ideas a planner reasons with, each made of
// claims that carry their own evidence.
// ---------------------------------------------------------------------------

export interface ParameterRange {
  min?: number;
  max?: number;
  unit: string;
}

/** The dimension of a coach's method a concept relates to. Generic names —
 * the knowledge layer never imports the Coach Brain. */
export type CoachMethodDimension =
  | "training_days"
  | "weekly_volume"
  | "rep_ranges"
  | "load"
  | "effort"
  | "rest"
  | "exercise_order"
  | "progression"
  | "deload"
  | "split"
  | "exercise_selection"
  | "session_length";

export interface KnowledgeClaim {
  id: string;
  kind: "definition" | "general_guidance" | "relationship";
  statement: string;
  appliesTo?: { goalClasses?: GoalClass[]; qualities?: TrainingQuality[]; trainingStatus?: Array<"novice" | "intermediate" | "advanced" | "trained" | "untrained"> };
  parameters?: Record<string, ParameterRange>;
  evidence: Evidence;
}

export interface ConceptEntry extends KnowledgeEntryBase {
  kind: "concept";
  topic: string;
  name: string;
  /** Where coaches legitimately differ, the coach's method decides here. */
  coachMethodDimension: CoachMethodDimension | null;
  claims: KnowledgeClaim[];
}

/** Special populations — coaching considerations, never treatment logic. */
export interface PopulationModifierEntry extends KnowledgeEntryBase {
  kind: "population_modifier";
  population: string;
  coachingConsiderations: string[];
  referralTriggers: string[];
}

export type KnowledgeEntry = MuscleEntry | JointActionEntry | MovementPatternEntry | ExerciseEntry | ConceptEntry | PopulationModifierEntry;

/** A pointer recorded in provenance: which knowledge, at which version. */
export interface KnowledgeRef {
  entryId: string;
  version: number;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ExerciseFilter {
  patternsAnyOf?: MovementPatternId[];
  excludePatterns?: MovementPatternId[];
  primaryMusclesAnyOf?: MuscleId[];
  /** Primary or secondary. */
  musclesAnyOf?: MuscleId[];
  /** Implements available. */
  equipmentAnyOf?: EquipmentId[];
  /** When given, an exercise's apparatus must all be in this list. Omitted = not filtered. */
  apparatusAvailable?: ApparatusId[];
  excludePositions?: BodyPosition[];
  /** Each listed demand must be at or below the level. */
  maxDemands?: Partial<Record<Demand, Level>>;
  mechanics?: ExerciseEntry["mechanics"];
  laterality?: ExerciseEntry["laterality"][];
  contraction?: ExerciseEntry["contraction"];
  /** Minimum suitability for a training quality. */
  suitableFor?: { quality: TrainingQuality; atLeast: Level };
}

export interface SubstituteContext extends Omit<ExerciseFilter, "patternsAnyOf" | "primaryMusclesAnyOf"> {
  /** What must be preserved. Default "target_and_pattern". */
  preserve?: "target_and_pattern" | "target" | "pattern";
}

export interface SubstituteCandidate {
  exercise: ExerciseEntry;
  sharedPrimaryMuscles: MuscleId[];
  sharedPatterns: MovementPatternId[];
  sameMechanics: boolean;
}

export interface SourceNeededItem {
  entryId: string;
  claimId?: string;
  statement: string;
  notes: string;
}

/** The read interface planners use. */
export interface FitnessKnowledgeRegistry {
  readonly version: string;
  get(id: string): KnowledgeEntry | undefined;
  byDomain(domain: KnowledgeDomain): KnowledgeEntry[];
  getExercise(id: string): ExerciseEntry | undefined;
  exercises(): ExerciseEntry[];
  findExercises(filter?: ExerciseFilter): ExerciseEntry[];
  exercisesForMuscle(muscle: MuscleId, role?: "primary" | "any"): ExerciseEntry[];
  exercisesForPattern(pattern: MovementPatternId): ExerciseEntry[];
  /** Valid candidates only, sorted by id — never a universal preference ranking. */
  substitutesFor(exerciseId: string, context?: SubstituteContext): SubstituteCandidate[];
  easierVariants(exerciseId: string): ExerciseEntry[];
  concepts(): ConceptEntry[];
  concept(topic: string): ConceptEntry | undefined;
  source(id: string): KnowledgeSource | undefined;
  /** The sources behind an entry or one of its claims. */
  sourcesFor(entryId: string, claimId?: string): KnowledgeSource[];
  sourceNeeded(): SourceNeededItem[];
  ref(id: string): KnowledgeRef | undefined;
}
