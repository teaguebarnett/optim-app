// Gate 4.0C-1 — the canonical OPTIM Fitness Knowledge layer: what is
// generally true or supported about training, nutrition, anatomy and
// recovery, independent of any coach or client.
//
// It is NOT the Coach Brain (how one coach chooses to coach) and it never
// overrides it; it is never modified by a client's restrictions. Planners
// query it through FitnessKnowledgeRegistry — never raw documents at
// runtime.
//
// Every entry is versioned and source-aware. An optional field left
// undefined means "not yet curated" — never "none" or "low". Knowledge that
// belongs to qualified clinical judgment is marked so, and is never turned
// into coaching permission.

import type { GoalClass } from "../goal-contract.ts";

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
// Sources and support — no evidence hierarchy is hard-coded here; which
// sources feed OPTIM (and how they rank) is a later decision.
// ---------------------------------------------------------------------------

export type KnowledgeSourceType =
  | "guideline"
  | "position_stand"
  | "systematic_review"
  | "textbook"
  | "exercise_database"
  | "expert_consensus"
  | "internal_curation";

export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  title: string;
  citation?: string;
  url?: string;
  /** ISO date the source was published or last revised. */
  publishedOn?: string;
  /** The source's own edition/version, when it has one. */
  edition?: string;
}

export type SupportStrength = "strong" | "moderate" | "limited" | "expert_opinion" | "unrated";

export interface KnowledgeSupport {
  /** KnowledgeSource ids. */
  sources: string[];
  strength: SupportStrength;
  notes?: string;
}

/** Coaching knowledge vs. something that needs qualified clinical/medical
 * judgment (which OPTIM never treats as coaching permission). */
export type KnowledgeScope = "coaching" | "requires_clinical_judgment";

export interface KnowledgeEntryBase {
  id: string;
  domain: KnowledgeDomain;
  /** Bumped whenever the entry's meaning changes. */
  version: number;
  scope: KnowledgeScope;
  support: KnowledgeSupport;
}

// ---------------------------------------------------------------------------
// Anatomy / biomechanics
// ---------------------------------------------------------------------------

export interface MuscleEntry extends KnowledgeEntryBase {
  kind: "muscle";
  name: string;
  region: "upper" | "lower" | "trunk";
}

export interface JointEntry extends KnowledgeEntryBase {
  kind: "joint";
  name: string;
  /** Joint action ids, e.g. "shoulder_flexion". */
  actions: string[];
}

export interface MovementPatternEntry extends KnowledgeEntryBase {
  kind: "movement_pattern";
  name: string;
}

// ---------------------------------------------------------------------------
// Exercise knowledge
// ---------------------------------------------------------------------------

export type Level = "low" | "moderate" | "high";
export type Demand = "spinal_loading" | "bracing" | "impact" | "overhead" | "grip" | "balance";

export interface ExerciseEntry extends KnowledgeEntryBase {
  kind: "exercise";
  name: string;
  /** MovementPatternEntry id. */
  pattern: string;
  equipment: string[];
  laterality?: "bilateral" | "unilateral" | "alternating";
  mechanics?: "compound" | "isolation";
  /** MuscleEntry ids. */
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  jointActions?: string[];
  demands?: Partial<Record<Demand, Level>>;
  skill?: Level;
  stability?: Level;
  loadingPotential?: Level;
  impact?: Level;
  fatigue?: Level;
  prescriptionMode?: "reps" | "time" | "distance";
  /** ExerciseEntry ids that can stand in without changing intent. */
  substitutes?: string[];
  /** Tags a client constraint can exclude on (e.g. "spinal_loading_high"). */
  restrictionTags?: string[];
  progressions?: string[];
  regressions?: string[];
}

// ---------------------------------------------------------------------------
// Principles (resistance, endurance, hybrid, weight management, nutrition,
// recovery, general fitness, sport) — a statement plus optional parameter
// ranges, scoped by goal class / population.
// ---------------------------------------------------------------------------

export interface ParameterRange {
  min?: number;
  max?: number;
  unit: string;
}

export interface PrincipleEntry extends KnowledgeEntryBase {
  kind: "principle";
  /** e.g. "weekly_sets_per_muscle", "rate_of_weight_loss". */
  topic: string;
  statement: string;
  parameters?: Record<string, ParameterRange>;
  appliesTo?: { goalClasses?: GoalClass[]; populations?: string[] };
}

/** Special populations / scope modifiers (older adults, pregnancy and
 * postpartum, adolescents, beginners, highly trained, injury contexts) —
 * coaching adjustments, never treatment logic. */
export interface PopulationModifierEntry extends KnowledgeEntryBase {
  kind: "population_modifier";
  population: string;
  /** What a coach generally adjusts (statement form, not prescriptions). */
  coachingConsiderations: string[];
  /** Situations that must go to a qualified professional. */
  referralTriggers: string[];
}

export type KnowledgeEntry = MuscleEntry | JointEntry | MovementPatternEntry | ExerciseEntry | PrincipleEntry | PopulationModifierEntry;

/** A pointer recorded in provenance: which knowledge, at which version. */
export interface KnowledgeRef {
  entryId: string;
  version: number;
}

export interface ExerciseQuery {
  pattern?: string;
  /** Any of these equipment ids is available. */
  equipmentAnyOf?: string[];
  /** Exclude exercises carrying any of these restriction tags. */
  excludeRestrictionTags?: string[];
}

/** The read interface planners use. */
export interface FitnessKnowledgeRegistry {
  /** Version of the whole knowledge set (recorded in provenance). */
  readonly version: string;
  get(id: string): KnowledgeEntry | undefined;
  byDomain(domain: KnowledgeDomain): KnowledgeEntry[];
  exercises(query?: ExerciseQuery): ExerciseEntry[];
  source(id: string): KnowledgeSource | undefined;
  ref(id: string): KnowledgeRef | undefined;
}
