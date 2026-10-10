// Unified Program Intelligence — Gate U1. The structured proposal that coordinates OPTIM's three domain reasoners
// (resistance, cardio, nutrition) into ONE coaching program for coach review. No new model: the unified layer orders the
// domains so each reasons over the others' decisions (resistance → cardio around the lifting week → nutrition for the
// combined training), then assembles, validates across domains and prepares coach decisions deterministically.
// Nothing here persists, approves or publishes; every domain keeps its own run artifact and provenance.

import type { DayOfWeek } from "../../types.ts";

export const UNIFIED_SCHEMA = "optim.unified-program-proposal.v1";
export const UNIFIED_VERSION = "unified-program-u1.0.0";

export type DomainId = "resistance" | "cardio" | "nutrition";

export type DomainStatus =
  /** A new proposal for the coach to review. */
  | "PROPOSED"
  /** A coach-approved program used as fixed input — never changed by the unified layer or another domain. */
  | "APPROVED_EXISTING"
  /** Cardio decided no additional cardio is warranted — a valid, reviewable decision. */
  | "NO_ADDITIONAL"
  /** The coach's method doesn't include this domain — nothing is forced. */
  | "NOT_COACHED"
  /** A nutrition proposal a qualified human must decide on (e.g. restrictive items for a minor). */
  | "NEEDS_COACH_REVIEW"
  | "NEEDS_INPUT"
  /** The domain reasoner can't plan this goal yet (e.g. resistance for a fat-loss goal). */
  | "UNSUPPORTED"
  | "ESCALATE"
  | "REJECTED"
  | "PROVIDER_FAILED"
  /** Not run: it depends on a domain that couldn't be produced (no model call was made). */
  | "HELD";

export interface DomainRunRef {
  runId: string;
  versions: { reasoner: string; prompt: string; knowledge: string; coachMethod: { versionId: string; version: number } | null };
  hashes: { clientState: string; goalContract: string; input: string | null };
  calls: number;
}

export interface DomainOutcome {
  domain: DomainId;
  status: DomainStatus;
  /** One line a coach can read. */
  summary: string;
  /** Why the domain has this status (missing facts, validator errors, the unsupported goal, what it waits on…). */
  reasons: string[];
  run: DomainRunRef | null;
}

export interface ProgramDay {
  day: DayOfWeek;
  available: boolean;
  resistance: { focus: "lower" | "upper" | "full_body"; minutes: number; lowerBody: boolean; source: "approved_program" | "proposed_program" } | null;
  cardio: { type: "steady" | "intervals"; modality: string; minutes: number; intensity: "easy" | "moderate" | "vigorous"; placement: string; optional: boolean } | null;
  /** Separate visits that day (lifting + a separate cardio session = 2). */
  visits: number;
  /** Minutes in the longest single visit. */
  longestVisitMinutes: number;
  totalMinutes: number;
}

export interface ProgramWorkload {
  resistanceDays: number;
  resistanceMinutes: number;
  cardioMinutes: { easy: number; moderate: number; vigorous: number; total: number };
  hardCardioSessions: number;
  trainingDays: number;
  restDays: number;
  totalMinutes: number;
}

export interface UnifiedDecision {
  source: DomainId | "program";
  about: string;
  question: string;
  options: string[];
  recommended: string | null;
  why: string;
}

export interface CrossDomainFinding {
  code: string;
  severity: "warning" | "info";
  message: string;
}

export type UnifiedStatus =
  /** Every coached domain produced a coherent proposal; nothing awaits a decision before review. */
  | "READY_FOR_REVIEW"
  /** Coherent, but the coach must decide something first (conflicts, held options, a minor's nutrition…). */
  | "NEEDS_COACH_DECISION"
  /** A coached domain couldn't be produced (and dependents may be held) — never hidden or filled in. */
  | "INCOMPLETE"
  /** The domains' proposals contradict each other — not presentable as one program. */
  | "INCOHERENT"
  /** A safety screen stopped everything before any model call. */
  | "ESCALATE"
  /** Program-level facts are missing (coach method, goal, availability). */
  | "NEEDS_INPUT";

export interface UnifiedProgramProposal {
  schema: typeof UNIFIED_SCHEMA;
  version: typeof UNIFIED_VERSION;
  runId: string;
  createdAtIso: string;
  status: UnifiedStatus;
  objective: { goal: string | null; successDefinition: string | null; summary: string; byDomain: Partial<Record<DomainId, string>> };
  domains: Record<DomainId, DomainOutcome>;
  /** The coordinated week (week 1). */
  week: ProgramDay[];
  workload: ProgramWorkload;
  recovery: { limited: boolean; signals: string[]; considerations: string[] };
  progression: { resistance: string[]; cardio: string[]; nutrition: string[]; alignment: string[] };
  monitoring: string[];
  assumptions: string[];
  uncertainties: string[];
  crossDomain: { errors: string[]; findings: CrossDomainFinding[] };
  decisions: UnifiedDecision[];
  questions: Array<{ source: DomainId | "program"; question: string }>;
  escalations: Array<{ source: DomainId; code: string; why: string }>;
  provenance: { clientState: string; goalContract: string; coachMethod: { versionId: string; version: number } | null; approvedResistance: { versionId: string; contentHash: string } | null; existingResistanceDraft?: { versionId: string; contentHash: string } | null; domainRuns: Partial<Record<DomainId, DomainRunRef>>; modelCalls: number };
}
